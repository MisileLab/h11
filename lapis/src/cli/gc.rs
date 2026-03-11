//! `lapis gc` command implementation
//!
//! Garbage collection for unreachable blocks:
//! 1. Mark phase: walk reflog + commit DAG, identify live chunks
//! 2. Sweep phase: identify all blocks in CAS not in live set
//! 3. Delete phase: remove unreachable blocks from CAS and update SQLite metadata
//!
//! Supports --dry-run (reports unreachable without deleting) and --grace-period
//! (protect reflog entries within grace period from deletion).

use lapis::chunking::{apply_delta, Delta};
use lapis::error::Result;
use lapis::index::MetadataStore;
use lapis::repo::Repository;
use lapis::store::cas::CasStore;
use lapis::vcs::reflog::ReflogManager;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use super::GcArgs;
use super::operation_guard::RepoOperationGuard;

/// Find the repository root by looking for .lapis directory
fn find_repo_root() -> Result<PathBuf> {
    let mut current = std::env::current_dir()?;
    loop {
        if current.join(".lapis").exists() {
            return Ok(current);
        }
        if !current.pop() {
            return Err(lapis::error::LapisError::Metadata(
                "not in a lapis repository (no .lapis directory found)".to_string(),
            ));
        }
    }
}

/// Result of garbage collection
#[derive(Debug)]
pub struct GcResult {
    pub live_blocks_count: usize,
    pub unreachable_blocks_count: usize,
    pub deleted_blocks_count: usize,
    pub freed_bytes: u64,
    pub dry_run: bool,
}

const DELTA_METADATA_TABLE: &str = "chunk_deltas";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GcSkipReason {
    SharedRetained,
    DeltaProtected,
}

#[derive(Debug)]
struct GcDeletionPlan {
    deletable: Vec<[u8; 32]>,
    deletable_sizes: HashMap<[u8; 32], u64>,
    shared_releases: Vec<GcSharedRelease>,
    delta_materializations: Vec<GcDeltaMaterialization>,
    skipped: Vec<([u8; 32], GcSkipReason)>,
    delta_metadata_cleanup: Vec<[u8; 32]>,
    freed_bytes: u64,
}

#[derive(Debug, Clone, Copy)]
struct GcSharedRelease {
    hash: [u8; 32],
    old_refcount: u32,
    new_refcount: u32,
}

#[derive(Debug, Clone)]
struct GcBlockInfo {
    size: u64,
    refcount: u32,
}

#[derive(Debug, Clone)]
struct GcDeltaRow {
    base_hash: [u8; 32],
    delta_data: Vec<u8>,
}

#[derive(Debug, Clone)]
struct GcDeltaMaterialization {
    base_hash: [u8; 32],
    dependent_hash: [u8; 32],
    delta_data: Vec<u8>,
    target_size: u64,
}

#[derive(Debug, Deserialize, Serialize)]
struct GcRemoteRefcountRequest {
    hashes: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
struct GcRemoteRefcountResponse {
    refcounts: HashMap<String, u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GcDecision {
    Delete,
    ReleaseShared,
    RetainDeltaBase,
}

impl GcResult {
    pub fn print_summary(&self) {
        println!("╭─ Garbage Collection Report");
        println!("│");
        println!("│ Live blocks:         {}", self.live_blocks_count);
        println!("│ Unreachable blocks:  {}", self.unreachable_blocks_count);
        if self.dry_run {
            println!("│ [DRY RUN] Would delete: {}", self.deleted_blocks_count);
            println!("│ [DRY RUN] Would free:   {} bytes", self.freed_bytes);
        } else {
            println!("│ Deleted blocks:      {}", self.deleted_blocks_count);
            println!("│ Freed:               {} bytes", self.freed_bytes);
        }
        println!("│");
        println!("╰─");
    }
}

pub async fn execute(args: GcArgs) -> Result<()> {
    let repo_root = find_repo_root()?;
    let repo = Repository::open(&repo_root)?;
    let _operation_guard = RepoOperationGuard::acquire(&repo, "gc")?;

    let grace_period = Duration::from_secs(args.grace_period);

    let cas_store = CasStore::new(repo.store_hot_dir())?;
    let mut metadata_store = MetadataStore::new(repo.meta_dir().join("index.db")).await?;

    println!("📍 Mark phase: identifying live chunks...");
    let live_chunks = ReflogManager::mark_live(&metadata_store, grace_period).await?;
    println!("   Found {} live chunks", live_chunks.len());

    println!("🧹 Sweep phase: scanning CAS...");
    let cas_blocks = scan_cas_blocks(&cas_store)?;
    println!("   Found {} blocks in CAS", cas_blocks.len());

    let unreachable: Vec<[u8; 32]> = cas_blocks
        .iter()
        .filter(|block_hash| !live_chunks.contains(*block_hash))
        .cloned()
        .collect();

    println!("   {} unreachable blocks", unreachable.len());

    if unreachable.is_empty() {
        let result = GcResult {
            live_blocks_count: live_chunks.len(),
            unreachable_blocks_count: 0,
            deleted_blocks_count: 0,
            freed_bytes: 0,
            dry_run: args.dry_run,
        };
        result.print_summary();
        return Ok(());
    }

    let remote_refcounts = match read_remote_url(&repo)? {
        Some(remote_url) => match query_remote_refcounts(&remote_url, &unreachable).await {
            Ok(refcounts) => {
                println!(
                    "   Remote reference check found {} unreachable block(s) still referenced on the server",
                    refcounts.values().filter(|count| **count > 0).count()
                );
                Some(refcounts)
            }
            Err(e) => {
                eprintln!(
                    "⚠️  Remote CAS safety check unavailable; falling back to local-only GC decisions: {}",
                    e
                );
                None
            }
        },
        None => None,
    };

    let deletion_plan =
        build_deletion_plan(&metadata_store, &unreachable, remote_refcounts.as_ref()).await?;
    let freed_bytes = deletion_plan.freed_bytes;

    if !deletion_plan.skipped.is_empty() {
        let shared_skips = deletion_plan
            .skipped
            .iter()
            .filter(|(_, reason)| matches!(reason, GcSkipReason::SharedRetained))
            .count();
        let delta_skips = deletion_plan
            .skipped
            .iter()
            .filter(|(_, reason)| matches!(reason, GcSkipReason::DeltaProtected))
            .count();

        println!(
            "   Skipping {} unreachable blocks for safety",
            deletion_plan.skipped.len()
        );

        if shared_skips > 0 {
            println!("     - {} shared block(s) still retained after refcount release", shared_skips);
        }
        if delta_skips > 0 {
            println!(
                "     - {} block(s) kept because live/unknown delta dependents still reference them via {}",
                delta_skips, DELTA_METADATA_TABLE
            );
        }
    }

    if !deletion_plan.shared_releases.is_empty() {
        println!(
            "   Releasing {} shared local reference(s)",
            deletion_plan.shared_releases.len()
        );
    }

    if !deletion_plan.delta_materializations.is_empty() {
        println!(
            "   Materializing {} delta dependent(s) before deleting their base blocks",
            deletion_plan.delta_materializations.len()
        );
    }

    if !deletion_plan.delta_metadata_cleanup.is_empty() {
        println!(
            "   Cleaning {} unreachable {} row(s)",
            deletion_plan.delta_metadata_cleanup.len(),
            DELTA_METADATA_TABLE
        );
    }

    if args.dry_run {
        println!(
            "🔍 [DRY RUN] Would delete {} blocks ({} bytes)",
            deletion_plan.deletable.len(),
            freed_bytes
        );
        if !deletion_plan.shared_releases.is_empty() {
            println!(
                "   [DRY RUN] Would decrement {} shared refcount(s)",
                deletion_plan.shared_releases.len()
            );
        }
        if !deletion_plan.delta_materializations.is_empty() {
            println!(
                "   [DRY RUN] Would materialize {} delta dependent(s)",
                deletion_plan.delta_materializations.len()
            );
        }
        let result = GcResult {
            live_blocks_count: live_chunks.len(),
            unreachable_blocks_count: unreachable.len(),
            deleted_blocks_count: deletion_plan.deletable.len(),
            freed_bytes,
            dry_run: true,
        };
        result.print_summary();
        return Ok(());
    }

    println!("🗑️  Delete phase: removing unreachable blocks...");
    let mut deleted_count = 0;
    let mut failed_count = 0;
    let mut actual_freed_bytes = 0u64;
    let mut blocked_deletions = HashSet::new();

    for materialization in &deletion_plan.delta_materializations {
        match materialize_delta_dependent(&cas_store, materialization) {
            Ok(()) => {
                if let Err(e) = delete_delta_metadata(&mut metadata_store, &materialization.dependent_hash).await {
                    eprintln!(
                        "⚠️  Failed to finalize delta materialization for {}: {}",
                        hex::encode(materialization.dependent_hash),
                        e
                    );
                    failed_count += 1;
                    blocked_deletions.insert(materialization.base_hash);
                }
            }
            Err(e) => {
                eprintln!(
                    "⚠️  Failed to materialize delta dependent {} before deleting base {}: {}",
                    hex::encode(materialization.dependent_hash),
                    hex::encode(materialization.base_hash),
                    e
                );
                failed_count += 1;
                blocked_deletions.insert(materialization.base_hash);
            }
        }
    }

    for release in &deletion_plan.shared_releases {
        if let Err(e) = set_block_refcount(&mut metadata_store, &release.hash, release.new_refcount).await {
            eprintln!(
                "⚠️  Failed to release shared refcount for {} ({} -> {}): {}",
                hex::encode(release.hash),
                release.old_refcount,
                release.new_refcount,
                e
            );
            failed_count += 1;
        }
    }

    for delta_hash in &deletion_plan.delta_metadata_cleanup {
        if let Err(e) = delete_delta_metadata(&mut metadata_store, delta_hash).await {
            eprintln!(
                "⚠️  Failed to delete {} metadata for {}: {}",
                DELTA_METADATA_TABLE,
                hex::encode(delta_hash),
                e
            );
            failed_count += 1;
        }
    }

    for block_hash in &deletion_plan.deletable {
        if blocked_deletions.contains(block_hash) {
            continue;
        }

        match cas_store.delete(block_hash) {
            Ok(()) => match metadata_store.delete_block(block_hash).await {
                Ok(()) => {
                    deleted_count += 1;
                    actual_freed_bytes += deletion_plan
                        .deletable_sizes
                        .get(block_hash)
                        .copied()
                        .unwrap_or(0);
                }
                Err(e) => {
                    eprintln!(
                        "⚠️  Failed to delete metadata for block {}: {}",
                        hex::encode(block_hash),
                        e
                    );
                    failed_count += 1;
                }
            },
            Err(e) => {
                eprintln!(
                    "⚠️  Failed to delete block from CAS {}: {}",
                    hex::encode(block_hash),
                    e
                );
                failed_count += 1;
            }
        }
    }

    println!("   Deleted {} blocks", deleted_count);
    if failed_count > 0 {
        println!("   ⚠️  Failed to delete {} blocks", failed_count);
    }

    let result = GcResult {
        live_blocks_count: live_chunks.len(),
        unreachable_blocks_count: unreachable.len(),
        deleted_blocks_count: deleted_count,
        freed_bytes: actual_freed_bytes,
        dry_run: false,
    };
    result.print_summary();

    Ok(())
}

async fn build_deletion_plan(
    metadata_store: &MetadataStore,
    unreachable: &[[u8; 32]],
    remote_refcounts: Option<&HashMap<[u8; 32], u64>>,
) -> Result<GcDeletionPlan> {
    let mut deletable = Vec::new();
    let mut deletable_sizes = HashMap::new();
    let mut shared_releases = Vec::new();
    let mut delta_materializations = Vec::new();
    let mut skipped = Vec::new();
    let mut delta_metadata_cleanup = Vec::new();
    let mut freed_bytes = 0u64;
    let has_delta_metadata = delta_metadata_table_exists(metadata_store).await?;
    let unreachable_set: HashSet<[u8; 32]> = unreachable.iter().copied().collect();
    let delta_rows = if has_delta_metadata {
        load_delta_rows(metadata_store).await?
    } else {
        HashMap::new()
    };
    let mut block_info_hashes = unreachable.to_vec();
    if has_delta_metadata {
        block_info_hashes.extend(delta_rows.keys().copied());
    }
    let block_info = load_block_info(metadata_store, &block_info_hashes).await?;
    let delta_dependents = if has_delta_metadata {
        load_delta_dependents(metadata_store).await?
    } else {
        HashMap::new()
    };
    let delta_blocks = if has_delta_metadata {
        load_delta_block_hashes(metadata_store).await?
    } else {
        HashSet::new()
    };
    let mut decisions = HashMap::new();

    for block_hash in unreachable {
        decisions.insert(
            *block_hash,
            classify_block(*block_hash, &block_info, remote_refcounts),
        );
    }

    let deletable_set: HashSet<[u8; 32]> = decisions
        .iter()
        .filter_map(|(hash, decision)| matches!(decision, GcDecision::Delete).then_some(*hash))
        .collect();

    for block_hash in unreachable {
        let decision = decisions
            .get(block_hash)
            .copied()
            .unwrap_or(GcDecision::Delete);

        let info = block_info.get(block_hash).cloned().unwrap_or(GcBlockInfo {
            size: 0,
            refcount: 1,
        });

        let mut materializations_for_block = Vec::new();
        let mut final_decision = decision;

        if matches!(decision, GcDecision::Delete) {
            if let Some(dependents) = delta_dependents.get(block_hash) {
                match collect_delta_materializations(
                    *block_hash,
                    dependents,
                    &unreachable_set,
                    &deletable_set,
                    &delta_rows,
                    &block_info,
                ) {
                    Ok(actions) => materializations_for_block = actions,
                    Err(_) => final_decision = GcDecision::RetainDeltaBase,
                }
            }
        }

        match final_decision {
            GcDecision::Delete => {
                deletable.push(*block_hash);
                deletable_sizes.insert(*block_hash, info.size);
                freed_bytes += info.size;
                if delta_blocks.contains(block_hash) {
                    delta_metadata_cleanup.push(*block_hash);
                }
                delta_materializations.extend(materializations_for_block);
            }
            GcDecision::ReleaseShared => {
                let new_refcount = info.refcount.saturating_sub(1).max(1);
                shared_releases.push(GcSharedRelease {
                    hash: *block_hash,
                    old_refcount: info.refcount,
                    new_refcount,
                });
                skipped.push((
                    *block_hash,
                    GcSkipReason::SharedRetained,
                ));
            }
            GcDecision::RetainDeltaBase => {
                skipped.push((*block_hash, GcSkipReason::DeltaProtected));
            }
        }
    }

    Ok(GcDeletionPlan {
        deletable,
        deletable_sizes,
        shared_releases,
        delta_materializations,
        skipped,
        delta_metadata_cleanup,
        freed_bytes,
    })
}

async fn load_block_info(
    metadata_store: &MetadataStore,
    hashes: &[[u8; 32]],
) -> Result<HashMap<[u8; 32], GcBlockInfo>> {
    let mut info = HashMap::new();

    for hash in hashes {
        let row = sqlx::query("SELECT size, refcount FROM blocks WHERE hash = ?1")
            .bind(hash.to_vec())
            .fetch_optional(metadata_store.read_pool())
            .await
            .map_err(|e| {
                lapis::error::LapisError::Database(format!("Failed to query block metadata: {}", e))
            })?;

        if let Some(row) = row {
            info.insert(
                *hash,
                GcBlockInfo {
                    size: row.get::<i64, _>("size") as u64,
                    refcount: row.get::<i64, _>("refcount") as u32,
                },
            );
        }
    }

    Ok(info)
}

async fn delta_metadata_table_exists(metadata_store: &MetadataStore) -> Result<bool> {
    let row = sqlx::query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1 LIMIT 1")
        .bind(DELTA_METADATA_TABLE)
        .fetch_optional(metadata_store.read_pool())
        .await
        .map_err(|e| {
            lapis::error::LapisError::Database(format!("Failed to inspect delta metadata: {}", e))
        })?;

    Ok(row.is_some())
}

async fn load_delta_dependents(
    metadata_store: &MetadataStore,
) -> Result<HashMap<[u8; 32], Vec<[u8; 32]>>> {
    let rows = sqlx::query(&format!("SELECT hash, base_hash FROM {}", DELTA_METADATA_TABLE))
        .fetch_all(metadata_store.read_pool())
        .await
        .map_err(|e| {
            lapis::error::LapisError::Database(format!(
                "Failed to inspect delta-base dependencies: {}",
                e
            ))
        })?;

    let mut dependents = HashMap::new();

    for row in rows {
        let dependent_hash: Vec<u8> = row.get("hash");
        let base_hash: Vec<u8> = row.get("base_hash");
        if dependent_hash.len() == 32 && base_hash.len() == 32 {
            let mut dependent = [0u8; 32];
            let mut base = [0u8; 32];
            dependent.copy_from_slice(&dependent_hash);
            base.copy_from_slice(&base_hash);
            dependents.entry(base).or_insert_with(Vec::new).push(dependent);
        }
    }

    Ok(dependents)
}

async fn load_delta_rows(metadata_store: &MetadataStore) -> Result<HashMap<[u8; 32], GcDeltaRow>> {
    let rows = sqlx::query(&format!(
        "SELECT hash, base_hash, delta_data FROM {}",
        DELTA_METADATA_TABLE
    ))
    .fetch_all(metadata_store.read_pool())
    .await
    .map_err(|e| {
        lapis::error::LapisError::Database(format!(
            "Failed to load {} rows: {}",
            DELTA_METADATA_TABLE, e
        ))
    })?;

    let mut delta_rows = HashMap::new();

    for row in rows {
        let dependent_hash: Vec<u8> = row.get("hash");
        let base_hash: Vec<u8> = row.get("base_hash");
        let delta_data: Vec<u8> = row.get("delta_data");
        if dependent_hash.len() == 32 && base_hash.len() == 32 {
            let mut dependent = [0u8; 32];
            let mut base = [0u8; 32];
            dependent.copy_from_slice(&dependent_hash);
            base.copy_from_slice(&base_hash);
            delta_rows.insert(
                dependent,
                GcDeltaRow {
                    base_hash: base,
                    delta_data,
                },
            );
        }
    }

    Ok(delta_rows)
}

async fn load_delta_block_hashes(metadata_store: &MetadataStore) -> Result<HashSet<[u8; 32]>> {
    let rows = sqlx::query(&format!("SELECT hash FROM {}", DELTA_METADATA_TABLE))
        .fetch_all(metadata_store.read_pool())
        .await
        .map_err(|e| {
            lapis::error::LapisError::Database(format!(
                "Failed to query {} rows: {}",
                DELTA_METADATA_TABLE,
                e
            ))
        })?;

    let mut hashes = HashSet::new();
    for row in rows {
        let hash_bytes: Vec<u8> = row.get("hash");
        if hash_bytes.len() == 32 {
            let mut hash = [0u8; 32];
            hash.copy_from_slice(&hash_bytes);
            hashes.insert(hash);
        }
    }

    Ok(hashes)
}

fn classify_block(
    block_hash: [u8; 32],
    block_info: &HashMap<[u8; 32], GcBlockInfo>,
    remote_refcounts: Option<&HashMap<[u8; 32], u64>>,
) -> GcDecision {
    if block_info
        .get(&block_hash)
        .map(|info| info.refcount > 1)
        .unwrap_or(false)
    {
        if remote_refcounts
            .and_then(|counts| counts.get(&block_hash))
            .copied()
            .unwrap_or(0)
            > 0
        {
            GcDecision::Delete
        } else {
            GcDecision::ReleaseShared
        }
    } else {
        GcDecision::Delete
    }
}

fn collect_delta_materializations(
    base_hash: [u8; 32],
    dependents: &[[u8; 32]],
    unreachable_set: &HashSet<[u8; 32]>,
    deletable_set: &HashSet<[u8; 32]>,
    delta_rows: &HashMap<[u8; 32], GcDeltaRow>,
    block_info: &HashMap<[u8; 32], GcBlockInfo>,
) -> Result<Vec<GcDeltaMaterialization>> {
    let mut actions = Vec::new();

    for dependent in dependents {
        if unreachable_set.contains(dependent) && deletable_set.contains(dependent) {
            continue;
        }

        let delta_row = delta_rows.get(dependent).ok_or_else(|| {
            lapis::error::LapisError::Metadata(format!(
                "Missing {} row for dependent {}",
                DELTA_METADATA_TABLE,
                hex::encode(dependent)
            ))
        })?;

        let target_size = block_info.get(dependent).map(|info| info.size).ok_or_else(|| {
            lapis::error::LapisError::Metadata(format!(
                "Missing block metadata for delta dependent {}",
                hex::encode(dependent)
            ))
        })?;

        if delta_row.base_hash != base_hash {
            return Err(lapis::error::LapisError::Metadata(format!(
                "{} row for {} points at unexpected base {}",
                DELTA_METADATA_TABLE,
                hex::encode(dependent),
                hex::encode(delta_row.base_hash)
            )));
        }

        actions.push(GcDeltaMaterialization {
            base_hash,
            dependent_hash: *dependent,
            delta_data: delta_row.delta_data.clone(),
            target_size,
        });
    }

    Ok(actions)
}

async fn set_block_refcount(
    metadata_store: &mut MetadataStore,
    hash: &[u8; 32],
    new_refcount: u32,
) -> Result<()> {
    sqlx::query("UPDATE blocks SET refcount = ?1 WHERE hash = ?2")
        .bind(new_refcount as i64)
        .bind(hash.to_vec())
        .execute(metadata_store.write_conn())
        .await
        .map_err(|e| {
            lapis::error::LapisError::Database(format!("Failed to update block refcount: {}", e))
        })?;

    Ok(())
}

async fn delete_delta_metadata(metadata_store: &mut MetadataStore, hash: &[u8; 32]) -> Result<()> {
    sqlx::query(&format!("DELETE FROM {} WHERE hash = ?1", DELTA_METADATA_TABLE))
        .bind(hash.to_vec())
        .execute(metadata_store.write_conn())
        .await
        .map_err(|e| {
            lapis::error::LapisError::Database(format!(
                "Failed to delete {} row: {}",
                DELTA_METADATA_TABLE,
                e
            ))
        })?;

    Ok(())
}

fn read_remote_url(repo: &Repository) -> Result<Option<String>> {
    let remote_file = repo.lapis_dir().join("remote");
    if !remote_file.exists() {
        return Ok(None);
    }

    let url = fs::read_to_string(&remote_file).map_err(|e| {
        lapis::error::LapisError::Metadata(format!("Failed to read remote file: {}", e))
    })?;

    Ok(Some(url.trim().to_string()))
}

async fn query_remote_refcounts(
    remote_url: &str,
    hashes: &[[u8; 32]],
) -> Result<HashMap<[u8; 32], u64>> {
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/blocks/refcounts", remote_url))
        .json(&GcRemoteRefcountRequest {
            hashes: hashes.iter().map(hex::encode).collect(),
        })
        .send()
        .await
        .map_err(|e| {
            lapis::error::LapisError::Network(format!(
            "Failed to query remote CAS block presence: {}",
            e
        ))
        })?;

    if !response.status().is_success() {
        return Err(lapis::error::LapisError::Network(format!(
            "Remote CAS refcount check failed with status {}",
            response.status()
        )));
    }

    let response: GcRemoteRefcountResponse = response.json().await.map_err(|e| {
        lapis::error::LapisError::Network(format!(
            "Failed to decode remote CAS refcount response: {}",
            e
        ))
    })?;

    Ok(response
        .refcounts
        .into_iter()
        .filter_map(|(hash, count)| decode_hash(&hash).map(|decoded| (decoded, count)))
        .collect())
}

fn decode_hash(hash: &str) -> Option<[u8; 32]> {
    let bytes = hex::decode(hash).ok()?;
    if bytes.len() != 32 {
        return None;
    }

    let mut decoded = [0u8; 32];
    decoded.copy_from_slice(&bytes);
    Some(decoded)
}

fn materialize_delta_dependent(
    cas_store: &CasStore,
    materialization: &GcDeltaMaterialization,
) -> Result<()> {
    let base_data = cas_store.get(&materialization.base_hash)?;
    let delta = Delta {
        data: materialization.delta_data.clone(),
        base_ref: hex::encode(materialization.base_hash),
        base_size: base_data.len() as u64,
        target_size: materialization.target_size,
        chain_depth: 0,
    };
    let reconstructed = apply_delta(&base_data, &delta)?;

    if cas_store.exists(&materialization.dependent_hash)? {
        let existing = cas_store.get(&materialization.dependent_hash)?;
        if existing != reconstructed {
            return Err(lapis::error::LapisError::Cas(format!(
                "Existing dependent block {} does not match materialized delta bytes",
                hex::encode(materialization.dependent_hash)
            )));
        }
        return Ok(());
    }

    let stored_hash = cas_store.put(&reconstructed)?;
    if stored_hash != materialization.dependent_hash {
        return Err(lapis::error::LapisError::Cas(format!(
            "Materialized dependent block hash mismatch (expected {}, got {})",
            hex::encode(materialization.dependent_hash),
            hex::encode(stored_hash)
        )));
    }

    Ok(())
}

/// Scan all blocks in CAS and return their hashes
fn scan_cas_blocks(cas_store: &CasStore) -> Result<HashSet<[u8; 32]>> {
    let mut blocks = HashSet::new();
    let cas_root = cas_store.root();

    for entry in fs::read_dir(cas_root)
        .map_err(|e| lapis::error::LapisError::Cas(format!("Failed to read CAS root: {}", e)))?
    {
        let entry = entry.map_err(|e| {
            lapis::error::LapisError::Cas(format!("Failed to read CAS entry: {}", e))
        })?;
        let prefix_path = entry.path();

        if !prefix_path.is_dir() {
            continue;
        }

        for block_entry in fs::read_dir(&prefix_path).map_err(|e| {
            lapis::error::LapisError::Cas(format!("Failed to read prefix dir: {}", e))
        })? {
            let block_entry = block_entry.map_err(|e| {
                lapis::error::LapisError::Cas(format!("Failed to read block entry: {}", e))
            })?;
            let block_path = block_entry.path();

            if !block_path.is_file() {
                continue;
            }

            if let Some(prefix_name) = prefix_path.file_name().and_then(|n| n.to_str()) {
                if let Some(block_name) = block_path.file_name().and_then(|n| n.to_str()) {
                    let hex_hash = format!("{}{}", prefix_name, block_name);
                    if hex_hash.len() == 64 {
                        if let Ok(bytes) = hex::decode(&hex_hash) {
                            if bytes.len() == 32 {
                                let mut hash = [0u8; 32];
                                hash.copy_from_slice(&bytes);
                                blocks.insert(hash);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(blocks)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{extract::State, routing::post, Json, Router};
    use lapis::store::cas::CasStore;
    use std::sync::Arc;
    use tempfile::TempDir;

    async fn remote_refcount_handler(
        State(refcounts): State<Arc<HashMap<String, u64>>>,
        Json(req): Json<GcRemoteRefcountRequest>,
    ) -> Json<GcRemoteRefcountResponse> {
        let refcounts = req
            .hashes
            .into_iter()
            .map(|hash| {
                let count = refcounts.get(&hash).copied().unwrap_or(0);
                (hash, count)
            })
            .collect();
        Json(GcRemoteRefcountResponse { refcounts })
    }

    async fn spawn_remote_refcount_server(
        refcounts: Vec<([u8; 32], u64)>,
    ) -> (String, tokio::task::JoinHandle<()>) {
        let refcounts: Arc<HashMap<String, u64>> = Arc::new(
            refcounts
                .into_iter()
                .map(|(hash, count)| (hex::encode(hash), count))
                .collect(),
        );

        let app = Router::new()
            .route("/blocks/refcounts", post(remote_refcount_handler))
            .with_state(refcounts);

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind remote CAS refcount server");
        let addr = listener.local_addr().expect("read bound address");
        let handle = tokio::spawn(async move {
            axum::serve(listener, app)
                .await
                .expect("serve remote CAS refcount endpoint");
        });

        (format!("http://{}", addr), handle)
    }

    #[test]
    fn test_scan_cas_blocks_empty() {
        let temp_dir = TempDir::new().unwrap();
        let cas_store = CasStore::new(temp_dir.path()).unwrap();
        let blocks = scan_cas_blocks(&cas_store).unwrap();
        assert_eq!(blocks.len(), 0);
    }

    #[test]
    fn test_scan_cas_blocks_with_data() {
        let temp_dir = TempDir::new().unwrap();
        let cas_store = CasStore::new(temp_dir.path()).unwrap();

        let data = b"test block data";
        let hash = cas_store.put(data).unwrap();

        let blocks = scan_cas_blocks(&cas_store).unwrap();
        assert_eq!(blocks.len(), 1);
        assert!(blocks.contains(&hash));
    }

    #[test]
    fn test_gc_dry_run_preserves_unreachable_blocks() {
        use super::super::test_utils::acquire_cwd_lock;
        use super::super::test_utils::safe_original_cwd;
        use lapis::index::MetadataStore;
        use lapis::store::cas::CasStore;

        let _lock = acquire_cwd_lock();
        let temp_repo = TempDir::new().unwrap();
        let repo_root = temp_repo.path().to_path_buf();

        lapis::repo::Repository::init(&repo_root).expect("init repo");
        let repo = lapis::repo::Repository::open(&repo_root).expect("open repo");

        let cas_store = CasStore::new(repo.store_hot_dir()).unwrap();
        let unreachable_data = b"this block is unreachable";
        let unreachable_hash = cas_store.put(unreachable_data).unwrap();

        let rt = tokio::runtime::Runtime::new().expect("create tokio runtime");
        rt.block_on(async {
            let mut metadata_store = MetadataStore::new(repo.meta_dir().join("index.db"))
                .await
                .unwrap();
            metadata_store
                .insert_block(&unreachable_hash, unreachable_data.len() as u32, "hot")
                .await
                .unwrap();
        });

        assert!(
            cas_store.exists(&unreachable_hash).unwrap(),
            "Precondition: block must exist in CAS before GC"
        );

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(&repo_root).expect("set cwd");

        let args = super::GcArgs {
            dry_run: true,
            grace_period: 0,
        };

        let rt = tokio::runtime::Runtime::new().expect("create tokio runtime for GC");
        let result = rt.block_on(async { execute(args).await });

        let _ = std::env::set_current_dir(&original_cwd);

        assert!(result.is_ok(), "GC dry-run should succeed");

        assert!(
            cas_store.exists(&unreachable_hash).unwrap(),
            "Postcondition: dry-run must NOT delete block from CAS"
        );

        rt.block_on(async {
            let metadata_store = MetadataStore::new(repo.meta_dir().join("index.db"))
                .await
                .unwrap();
            assert!(
                metadata_store
                    .block_exists(&unreachable_hash)
                    .await
                    .unwrap(),
                "Postcondition: dry-run must NOT delete block from SQLite"
            );
        });
    }

    #[test]
    fn test_gc_deletes_unreachable_blocks() {
        use super::super::test_utils::acquire_cwd_lock;
        use super::super::test_utils::safe_original_cwd;
        use lapis::index::MetadataStore;
        use lapis::store::cas::CasStore;

        let _lock = acquire_cwd_lock();
        let temp_repo = TempDir::new().unwrap();
        let repo_root = temp_repo.path().to_path_buf();

        lapis::repo::Repository::init(&repo_root).expect("init repo");
        let repo = lapis::repo::Repository::open(&repo_root).expect("open repo");

        let cas_store = CasStore::new(repo.store_hot_dir()).unwrap();
        let unreachable_data = b"this will be garbage collected";
        let unreachable_hash = cas_store.put(unreachable_data).unwrap();

        let rt = tokio::runtime::Runtime::new().expect("create tokio runtime");
        rt.block_on(async {
            let mut metadata_store = MetadataStore::new(repo.meta_dir().join("index.db"))
                .await
                .unwrap();
            metadata_store
                .insert_block(&unreachable_hash, unreachable_data.len() as u32, "hot")
                .await
                .unwrap();
        });

        assert!(
            cas_store.exists(&unreachable_hash).unwrap(),
            "Precondition: block must exist in CAS before GC"
        );

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(&repo_root).expect("set cwd");

        let args = super::GcArgs {
            dry_run: false,
            grace_period: 0,
        };

        let rt = tokio::runtime::Runtime::new().expect("create tokio runtime for GC");
        let result = rt.block_on(async { execute(args).await });

        let _ = std::env::set_current_dir(&original_cwd);

        assert!(result.is_ok(), "GC should succeed");

        assert!(
            !cas_store.exists(&unreachable_hash).unwrap(),
            "Postcondition: GC must delete unreachable block from CAS"
        );

        rt.block_on(async {
            let metadata_store = MetadataStore::new(repo.meta_dir().join("index.db"))
                .await
                .unwrap();
            assert!(
                !metadata_store
                    .block_exists(&unreachable_hash)
                    .await
                    .unwrap(),
                "Postcondition: GC must delete unreachable block from SQLite"
            );
        });
    }

    #[test]
    fn test_gc_preserves_reachable_blocks() {
        use super::super::test_utils::acquire_cwd_lock;
        use super::super::test_utils::safe_original_cwd;
        use lapis::index::MetadataStore;
        use lapis::store::cas::CasStore;

        let _lock = acquire_cwd_lock();
        let temp_repo = TempDir::new().unwrap();
        let repo_root = temp_repo.path().to_path_buf();

        lapis::repo::Repository::init(&repo_root).expect("init repo");
        let repo = lapis::repo::Repository::open(&repo_root).expect("open repo");

        let cas_store = CasStore::new(repo.store_hot_dir()).unwrap();

        // Create a reachable block via commit+manifest+reflog
        let reachable_data = b"this block is reachable via commit";
        let reachable_hash = cas_store.put(reachable_data).unwrap();
        let commit_hash = [10u8; 32];
        let manifest_hash = [20u8; 32];

        // Create a separate unreachable block
        let unreachable_data = b"this block is not referenced";
        let unreachable_hash = cas_store.put(unreachable_data).unwrap();

        let rt = tokio::runtime::Runtime::new().expect("create tokio runtime");
        rt.block_on(async {
            let mut metadata_store = MetadataStore::new(repo.meta_dir().join("index.db"))
                .await
                .unwrap();

            // Insert reachable block metadata
            metadata_store
                .insert_block(&reachable_hash, reachable_data.len() as u32, "hot")
                .await
                .unwrap();

            // Insert commit + manifest that references the reachable block
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64;

            let chunk_list_json = serde_json::to_string(&vec![reachable_hash.to_vec()])
                .expect("serialize chunk list");

            sqlx::query(
                "INSERT INTO manifests (hash, file_path, chunk_list, total_size, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )
            .bind(manifest_hash.to_vec())
            .bind("test_file")
            .bind(chunk_list_json)
            .bind(0i64)
            .bind(now)
            .execute(metadata_store.write_conn())
            .await
            .expect("insert test manifest");

            sqlx::query(
                "INSERT INTO commits (hash, parent_hash, manifest_hash, timestamp, message)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )
            .bind(commit_hash.to_vec())
            .bind(None::<Vec<u8>>)
            .bind(manifest_hash.to_vec())
            .bind(now)
            .bind("test commit")
            .execute(metadata_store.write_conn())
            .await
            .expect("insert test commit");

            // Insert reflog entry pointing to the commit (makes it reachable)
            sqlx::query("INSERT INTO reflog (commit_hash, action, timestamp) VALUES (?1, ?2, ?3)")
                .bind(commit_hash.to_vec())
                .bind("commit")
                .bind(now)
                .execute(metadata_store.write_conn())
                .await
                .expect("insert reflog entry");

            // Insert unreachable block metadata (not referenced by any commit)
            metadata_store
                .insert_block(&unreachable_hash, unreachable_data.len() as u32, "hot")
                .await
                .unwrap();
        });

        assert!(
            cas_store.exists(&reachable_hash).unwrap(),
            "Precondition: reachable block must exist in CAS before GC"
        );
        assert!(
            cas_store.exists(&unreachable_hash).unwrap(),
            "Precondition: unreachable block must exist in CAS before GC"
        );

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(&repo_root).expect("set cwd");

        let args = super::GcArgs {
            dry_run: false,
            grace_period: 0,
        };

        let rt = tokio::runtime::Runtime::new().expect("create tokio runtime for GC");
        let result = rt.block_on(async { execute(args).await });

        let _ = std::env::set_current_dir(&original_cwd);

        assert!(result.is_ok(), "GC should succeed");

        // Verify reachable block is preserved
        assert!(
            cas_store.exists(&reachable_hash).unwrap(),
            "Postcondition: GC must preserve reachable block in CAS"
        );

        // Verify unreachable block is deleted
        assert!(
            !cas_store.exists(&unreachable_hash).unwrap(),
            "Postcondition: GC must delete unreachable block from CAS"
        );

        rt.block_on(async {
            let metadata_store = MetadataStore::new(repo.meta_dir().join("index.db"))
                .await
                .unwrap();

            assert!(
                metadata_store.block_exists(&reachable_hash).await.unwrap(),
                "Postcondition: GC must preserve reachable block in SQLite"
            );

            assert!(
                !metadata_store
                    .block_exists(&unreachable_hash)
                    .await
                    .unwrap(),
                "Postcondition: GC must delete unreachable block from SQLite"
            );
        });
    }

    #[test]
    fn test_gc_skips_shared_unreachable_blocks() {
        use super::super::test_utils::acquire_cwd_lock;
        use super::super::test_utils::safe_original_cwd;
        use lapis::index::MetadataStore;
        use lapis::store::cas::CasStore;

        let _lock = acquire_cwd_lock();
        let temp_repo = TempDir::new().unwrap();
        let repo_root = temp_repo.path().to_path_buf();

        lapis::repo::Repository::init(&repo_root).expect("init repo");
        let repo = lapis::repo::Repository::open(&repo_root).expect("open repo");

        let cas_store = CasStore::new(repo.store_hot_dir()).unwrap();
        let shared_data = b"shared but currently unreachable";
        let shared_hash = cas_store.put(shared_data).unwrap();

        let rt = tokio::runtime::Runtime::new().expect("create tokio runtime");
        rt.block_on(async {
            let mut metadata_store = MetadataStore::new(repo.meta_dir().join("index.db"))
                .await
                .unwrap();
            metadata_store
                .insert_block(&shared_hash, shared_data.len() as u32, "hot")
                .await
                .unwrap();

            sqlx::query("UPDATE blocks SET refcount = 2 WHERE hash = ?1")
                .bind(shared_hash.to_vec())
                .execute(metadata_store.write_conn())
                .await
                .expect("update refcount");
        });

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(&repo_root).expect("set cwd");

        let result = rt.block_on(async {
            execute(super::GcArgs {
                dry_run: false,
                grace_period: 0,
            })
            .await
        });

        let _ = std::env::set_current_dir(&original_cwd);

        assert!(
            result.is_ok(),
            "GC should succeed when shared blocks are skipped"
        );
        assert!(
            cas_store.exists(&shared_hash).unwrap(),
            "Shared unreachable block must remain in CAS when refcount > 1"
        );

        rt.block_on(async {
            let metadata_store = MetadataStore::new(repo.meta_dir().join("index.db"))
                .await
                .unwrap();
            assert!(
                metadata_store.block_exists(&shared_hash).await.unwrap(),
                "Shared unreachable block metadata must remain when refcount > 1"
            );

            let row = sqlx::query("SELECT refcount FROM blocks WHERE hash = ?1")
                .bind(shared_hash.to_vec())
                .fetch_one(metadata_store.read_pool())
                .await
                .expect("query updated refcount");
            let refcount: i64 = row.get("refcount");
            assert_eq!(
                refcount, 1,
                "GC must release one shared local reference instead of leaving refcount untouched"
            );
        });
    }

    #[test]
    fn test_gc_deletes_shared_unreachable_blocks_when_remote_has_them() {
        use super::super::test_utils::acquire_cwd_lock;
        use super::super::test_utils::safe_original_cwd;
        use lapis::index::MetadataStore;
        use lapis::store::cas::CasStore;

        let _lock = acquire_cwd_lock();
        let temp_repo = TempDir::new().unwrap();
        let repo_root = temp_repo.path().to_path_buf();

        lapis::repo::Repository::init(&repo_root).expect("init repo");
        let repo = lapis::repo::Repository::open(&repo_root).expect("open repo");

        let cas_store = CasStore::new(repo.store_hot_dir()).unwrap();
        let shared_data = b"shared remotely and unreachable locally";
        let shared_hash = cas_store.put(shared_data).unwrap();

        let rt = tokio::runtime::Runtime::new().expect("create tokio runtime");
        rt.block_on(async {
            let mut metadata_store = MetadataStore::new(repo.meta_dir().join("index.db"))
                .await
                .unwrap();
            metadata_store
                .insert_block(&shared_hash, shared_data.len() as u32, "hot")
                .await
                .unwrap();

            sqlx::query("UPDATE blocks SET refcount = 2 WHERE hash = ?1")
                .bind(shared_hash.to_vec())
                .execute(metadata_store.write_conn())
                .await
                .expect("update refcount");
        });

        let (remote_url, server_handle) = rt.block_on(async {
            spawn_remote_refcount_server(vec![(shared_hash, 2)]).await
        });
        fs::write(repo.lapis_dir().join("remote"), &remote_url).expect("write remote url");

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(&repo_root).expect("set cwd");

        let result = rt.block_on(async {
            execute(super::GcArgs {
                dry_run: false,
                grace_period: 0,
            })
            .await
        });

        server_handle.abort();
        let _ = std::env::set_current_dir(&original_cwd);

        assert!(
            result.is_ok(),
            "GC should delete unreachable shared blocks once remote CAS confirms they are shared"
        );
        assert!(
            !cas_store.exists(&shared_hash).unwrap(),
            "Remote-confirmed shared block must be deleted from local CAS"
        );

        rt.block_on(async {
            let metadata_store = MetadataStore::new(repo.meta_dir().join("index.db"))
                .await
                .unwrap();
            assert!(
                !metadata_store.block_exists(&shared_hash).await.unwrap(),
                "Remote-confirmed shared block metadata must be removed from SQLite"
            );
        });
    }

    #[test]
    fn test_gc_keeps_shared_unreachable_blocks_when_remote_refcount_is_zero() {
        use super::super::test_utils::acquire_cwd_lock;
        use super::super::test_utils::safe_original_cwd;
        use lapis::index::MetadataStore;
        use lapis::store::cas::CasStore;

        let _lock = acquire_cwd_lock();
        let temp_repo = TempDir::new().unwrap();
        let repo_root = temp_repo.path().to_path_buf();

        lapis::repo::Repository::init(&repo_root).expect("init repo");
        let repo = lapis::repo::Repository::open(&repo_root).expect("open repo");

        let cas_store = CasStore::new(repo.store_hot_dir()).unwrap();
        let shared_data = b"shared only locally";
        let shared_hash = cas_store.put(shared_data).unwrap();

        let rt = tokio::runtime::Runtime::new().expect("create tokio runtime");
        rt.block_on(async {
            let mut metadata_store = MetadataStore::new(repo.meta_dir().join("index.db"))
                .await
                .unwrap();
            metadata_store
                .insert_block(&shared_hash, shared_data.len() as u32, "hot")
                .await
                .unwrap();

            sqlx::query("UPDATE blocks SET refcount = 2 WHERE hash = ?1")
                .bind(shared_hash.to_vec())
                .execute(metadata_store.write_conn())
                .await
                .expect("update refcount");
        });

        let (remote_url, server_handle) = rt.block_on(async {
            spawn_remote_refcount_server(vec![(shared_hash, 0)]).await
        });
        fs::write(repo.lapis_dir().join("remote"), &remote_url).expect("write remote url");

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(&repo_root).expect("set cwd");

        let result = rt.block_on(async {
            execute(super::GcArgs {
                dry_run: false,
                grace_period: 0,
            })
            .await
        });

        server_handle.abort();
        let _ = std::env::set_current_dir(&original_cwd);

        assert!(result.is_ok(), "GC should still succeed with remote refcount checks");
        assert!(
            cas_store.exists(&shared_hash).unwrap(),
            "Zero remote refcount must keep the shared block locally"
        );
    }

    #[test]
    fn test_gc_rejects_when_transfer_guard_is_held() {
        use super::super::operation_guard::RepoOperationGuard;
        use super::super::test_utils::acquire_cwd_lock;
        use super::super::test_utils::safe_original_cwd;

        let _lock = acquire_cwd_lock();
        let temp_repo = TempDir::new().unwrap();
        let repo_root = temp_repo.path().to_path_buf();

        lapis::repo::Repository::init(&repo_root).expect("init repo");
        let repo = lapis::repo::Repository::open(&repo_root).expect("open repo");
        let _transfer_guard = RepoOperationGuard::acquire(&repo, "push").expect("acquire push guard");

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(&repo_root).expect("set cwd");

        let rt = tokio::runtime::Runtime::new().expect("create tokio runtime");
        let result = rt.block_on(async {
            execute(super::GcArgs {
                dry_run: true,
                grace_period: 0,
            })
            .await
        });

        let _ = std::env::set_current_dir(&original_cwd);

        assert!(result.is_err(), "GC must refuse to overlap with push/pull");
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("already running"),
            "GC should surface the shared coordination guard error"
        );
    }

    #[test]
    fn test_gc_materializes_delta_dependents_before_deleting_unreachable_base() {
        use super::super::test_utils::acquire_cwd_lock;
        use super::super::test_utils::safe_original_cwd;
        use lapis::chunking::compute_delta;
        use lapis::index::MetadataStore;
        use lapis::store::cas::CasStore;

        let _lock = acquire_cwd_lock();
        let temp_repo = TempDir::new().unwrap();
        let repo_root = temp_repo.path().to_path_buf();

        lapis::repo::Repository::init(&repo_root).expect("init repo");
        let repo = lapis::repo::Repository::open(&repo_root).expect("open repo");

        let cas_store = CasStore::new(repo.store_hot_dir()).unwrap();
        let base_data = b"future delta base";
        let dependent_data = b"future delta base with rebased dependent payload";
        let base_hash = cas_store.put(base_data).unwrap();
        let dependent_hash = lapis::crypto::blake3::hash_bytes(dependent_data);
        let delta = compute_delta(base_data, dependent_data).expect("compute delta");
        let commit_hash = [11u8; 32];
        let manifest_hash = [12u8; 32];

        let rt = tokio::runtime::Runtime::new().expect("create tokio runtime");
        rt.block_on(async {
            let mut metadata_store = MetadataStore::new(repo.meta_dir().join("index.db"))
                .await
                .unwrap();
            metadata_store
                .insert_block(&base_hash, base_data.len() as u32, "hot")
                .await
                .unwrap();
            metadata_store
                .insert_block(&dependent_hash, dependent_data.len() as u32, "hot")
                .await
                .unwrap();

            sqlx::query(
                "CREATE TABLE chunk_deltas (
                    hash BLOB PRIMARY KEY,
                    base_hash BLOB NOT NULL,
                    delta_data BLOB NOT NULL
                )",
            )
            .execute(metadata_store.write_conn())
            .await
            .expect("create chunk_deltas table");

            sqlx::query(
                "INSERT INTO chunk_deltas (hash, base_hash, delta_data) VALUES (?1, ?2, ?3)",
            )
            .bind(dependent_hash.to_vec())
            .bind(base_hash.to_vec())
            .bind(delta.data)
            .execute(metadata_store.write_conn())
            .await
            .expect("insert delta dependency");

            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64;

            let chunk_list_json = serde_json::to_string(&vec![dependent_hash.to_vec()])
                .expect("serialize chunk list");

            sqlx::query(
                "INSERT INTO manifests (hash, file_path, chunk_list, total_size, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )
            .bind(manifest_hash.to_vec())
            .bind("rebased_delta_file")
            .bind(chunk_list_json)
            .bind(dependent_data.len() as i64)
            .bind(now)
            .execute(metadata_store.write_conn())
            .await
            .expect("insert manifest");

            sqlx::query(
                "INSERT INTO commits (hash, parent_hash, manifest_hash, timestamp, message)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )
            .bind(commit_hash.to_vec())
            .bind(None::<Vec<u8>>)
            .bind(manifest_hash.to_vec())
            .bind(now)
            .bind("protect dependent")
            .execute(metadata_store.write_conn())
            .await
            .expect("insert commit");

            sqlx::query("INSERT INTO reflog (commit_hash, action, timestamp) VALUES (?1, ?2, ?3)")
                .bind(commit_hash.to_vec())
                .bind("commit")
                .bind(now)
                .execute(metadata_store.write_conn())
                .await
                .expect("insert reflog entry");
        });

        assert!(
            !cas_store.exists(&dependent_hash).unwrap(),
            "Precondition: dependent block starts absent so GC must materialize it"
        );

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(&repo_root).expect("set cwd");

        let result = rt.block_on(async {
            execute(super::GcArgs {
                dry_run: false,
                grace_period: 0,
            })
            .await
        });

        let _ = std::env::set_current_dir(&original_cwd);

        assert!(
            result.is_ok(),
            "GC should materialize the dependent and then delete the unreachable base"
        );
        assert!(
            !cas_store.exists(&base_hash).unwrap(),
            "Delta base block must be deleted after dependents are materialized away from it"
        );
        assert!(
            cas_store.exists(&dependent_hash).unwrap(),
            "GC must materialize the dependent block into local CAS before deleting the base"
        );

        rt.block_on(async {
            let metadata_store = MetadataStore::new(repo.meta_dir().join("index.db"))
                .await
                .unwrap();
            assert!(
                !metadata_store.block_exists(&base_hash).await.unwrap(),
                "Delta base metadata must be deleted once dependents are rebased/materialized"
            );
            assert!(
                metadata_store.block_exists(&dependent_hash).await.unwrap(),
                "Dependent block metadata must remain after materialization"
            );

            let row = sqlx::query("SELECT COUNT(*) AS count FROM chunk_deltas WHERE hash = ?1")
                .bind(dependent_hash.to_vec())
                .fetch_one(metadata_store.read_pool())
                .await
                .expect("query remaining chunk_deltas rows");
            let remaining: i64 = row.get("count");
            assert_eq!(
                remaining, 0,
                "GC must remove chunk_deltas metadata once a dependent is materialized standalone"
            );
        });
    }

    #[test]
    fn test_gc_deletes_unreachable_delta_family_and_cleans_metadata() {
        use super::super::test_utils::acquire_cwd_lock;
        use super::super::test_utils::safe_original_cwd;
        use lapis::chunking::compute_delta;
        use lapis::index::MetadataStore;
        use lapis::store::cas::CasStore;

        let _lock = acquire_cwd_lock();
        let temp_repo = TempDir::new().unwrap();
        let repo_root = temp_repo.path().to_path_buf();

        lapis::repo::Repository::init(&repo_root).expect("init repo");
        let repo = lapis::repo::Repository::open(&repo_root).expect("open repo");

        let cas_store = CasStore::new(repo.store_hot_dir()).unwrap();
        let base_data = b"delta family base block";
        let dependent_data = b"delta family base block with dependent payload";
        let base_hash = cas_store.put(base_data).unwrap();
        let dependent_hash = cas_store.put(dependent_data).unwrap();
        let delta = compute_delta(base_data, dependent_data).expect("compute test delta");

        let rt = tokio::runtime::Runtime::new().expect("create tokio runtime");
        rt.block_on(async {
            let mut metadata_store = MetadataStore::new(repo.meta_dir().join("index.db"))
                .await
                .unwrap();
            metadata_store
                .insert_block(&base_hash, base_data.len() as u32, "hot")
                .await
                .unwrap();
            metadata_store
                .insert_block(&dependent_hash, dependent_data.len() as u32, "hot")
                .await
                .unwrap();

            sqlx::query(
                "CREATE TABLE chunk_deltas (
                    hash BLOB PRIMARY KEY,
                    base_hash BLOB NOT NULL,
                    delta_data BLOB NOT NULL
                )",
            )
            .execute(metadata_store.write_conn())
            .await
            .expect("create chunk_deltas table");

            sqlx::query(
                "INSERT INTO chunk_deltas (hash, base_hash, delta_data) VALUES (?1, ?2, ?3)",
            )
            .bind(dependent_hash.to_vec())
            .bind(base_hash.to_vec())
            .bind(delta.data)
            .execute(metadata_store.write_conn())
            .await
            .expect("insert delta dependency");
        });

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(&repo_root).expect("set cwd");

        let result = rt.block_on(async {
            execute(super::GcArgs {
                dry_run: false,
                grace_period: 0,
            })
            .await
        });

        let _ = std::env::set_current_dir(&original_cwd);

        assert!(
            result.is_ok(),
            "GC should delete a fully unreachable delta family"
        );
        assert!(
            !cas_store.exists(&base_hash).unwrap(),
            "GC must delete unreachable delta base from CAS"
        );
        assert!(
            !cas_store.exists(&dependent_hash).unwrap(),
            "GC must delete unreachable delta dependent from CAS"
        );

        rt.block_on(async {
            let metadata_store = MetadataStore::new(repo.meta_dir().join("index.db"))
                .await
                .unwrap();
            assert!(
                !metadata_store.block_exists(&base_hash).await.unwrap(),
                "GC must delete unreachable delta base metadata"
            );
            assert!(
                !metadata_store.block_exists(&dependent_hash).await.unwrap(),
                "GC must delete unreachable delta dependent metadata"
            );

            let row = sqlx::query("SELECT COUNT(*) AS count FROM chunk_deltas WHERE hash = ?1")
                .bind(dependent_hash.to_vec())
                .fetch_one(metadata_store.read_pool())
                .await
                .expect("query remaining chunk_deltas rows");
            let remaining: i64 = row.get("count");
            assert_eq!(
                remaining, 0,
                "GC must remove unreachable chunk_deltas metadata before deleting the family"
            );
        });
    }
}
