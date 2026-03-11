//! Reflog tracking for HEAD movements
//!
//! The reflog records all HEAD movements (commits, checkouts, etc.) with timestamps.
//! During garbage collection, the mark phase uses the reflog to protect commits within
//! a grace period from being collected, ensuring accidental HEAD movements can be recovered.

use crate::error::{LapisError, Result};
use crate::index::MetadataStore;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::collections::HashSet;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// A single reflog entry recording a HEAD movement
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReflogEntry {
    /// BLAKE3 hash of the commit this HEAD movement points to (32 bytes)
    pub commit_hash: [u8; 32],
    /// Action description (e.g., "commit", "checkout", "reset")
    pub action: String,
    /// Unix timestamp (seconds since epoch) when this movement occurred
    pub timestamp: u64,
}

/// ReflogManager handles tracking and querying HEAD movements stored in SQLite
pub struct ReflogManager;

impl ReflogManager {
    /// Log a new HEAD movement to the reflog
    ///
    /// Records the given commit hash, action, and current timestamp to the reflog table.
    /// This is called whenever HEAD is modified (during commit, checkout, reset, etc.).
    ///
    /// # Arguments
    ///
    /// * `store` - The metadata store with SQLite connection
    /// * `commit_hash` - BLAKE3 hash of the commit HEAD now points to
    /// * `action` - Action description (e.g., "commit", "checkout")
    ///
    /// # Returns
    ///
    /// Ok(()) on success, or an error if database insertion fails
    pub async fn log_action(
        store: &mut MetadataStore,
        commit_hash: &[u8; 32],
        action: &str,
    ) -> Result<()> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| LapisError::Reflog(format!("Failed to get current timestamp: {}", e)))?
            .as_secs();

        sqlx::query("INSERT INTO reflog (commit_hash, action, timestamp) VALUES (?1, ?2, ?3)")
            .bind(commit_hash.to_vec())
            .bind(action)
            .bind(now as i64)
            .execute(store.write_conn())
            .await
            .map_err(|e| LapisError::Reflog(format!("Failed to insert reflog entry: {}", e)))?;

        Ok(())
    }

    /// Retrieve all reflog entries from the database
    ///
    /// Returns all reflog entries sorted by timestamp (oldest first).
    ///
    /// # Arguments
    ///
    /// * `store` - The metadata store with SQLite pool
    ///
    /// # Returns
    ///
    /// A vector of ReflogEntry structs, ordered by timestamp
    pub async fn get_reflog_entries(store: &MetadataStore) -> Result<Vec<ReflogEntry>> {
        let rows =
            sqlx::query("SELECT commit_hash, action, timestamp FROM reflog ORDER BY timestamp ASC")
                .fetch_all(store.read_pool())
                .await
                .map_err(|e| {
                    LapisError::Reflog(format!("Failed to fetch reflog entries: {}", e))
                })?;

        let mut entries = Vec::new();
        for row in rows {
            let commit_hash_vec: Vec<u8> = row
                .try_get("commit_hash")
                .map_err(|e| LapisError::Reflog(format!("Failed to get commit_hash: {}", e)))?;
            if commit_hash_vec.len() != 32 {
                return Err(LapisError::Reflog(
                    "Invalid commit_hash length in reflog".to_string(),
                ));
            }

            let mut commit_hash = [0u8; 32];
            commit_hash.copy_from_slice(&commit_hash_vec);

            let action: String = row
                .try_get("action")
                .map_err(|e| LapisError::Reflog(format!("Failed to get action: {}", e)))?;

            let timestamp: i64 = row
                .try_get("timestamp")
                .map_err(|e| LapisError::Reflog(format!("Failed to get timestamp: {}", e)))?;

            entries.push(ReflogEntry {
                commit_hash,
                action,
                timestamp: timestamp as u64,
            });
        }

        Ok(entries)
    }

    /// Mark phase: identify all live chunks by walking reachable commits
    ///
    /// This function performs the mark phase of garbage collection:
    /// 1. Walks commit DAG starting from:
    ///    a. Reflog entries within grace period
    ///    b. ALL commits referenced by branches and tags (no grace period)
    /// 2. Marks all chunks reachable from these commits as live
    /// 3. Returns the set of live chunk hashes
    ///
    /// **Critical guarantees**:
    /// - Commits referenced in the reflog within `grace_period` seconds are protected
    /// - Commits referenced by branches/tags are ALWAYS protected (no grace period)
    /// - All chunks reachable from protected commits are marked as live and will NOT
    ///   be deleted by the sweep phase
    ///
    /// # Arguments
    ///
    /// * `store` - The metadata store with SQLite connections
    /// * `grace_period` - Duration for which reflog entries are protected
    ///
    /// # Returns
    ///
    /// A HashSet of chunk hashes that are reachable and must be preserved
    pub async fn mark_live(
        store: &MetadataStore,
        grace_period: Duration,
    ) -> Result<HashSet<[u8; 32]>> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| LapisError::Reflog(format!("Failed to get current timestamp: {}", e)))?
            .as_secs();

        let grace_cutoff = now.saturating_sub(grace_period.as_secs());

        let mut protected_commits: Vec<[u8; 32]> = Vec::new();

        // Seed 1: Get reflog entries within grace period
        let reflog_entries = Self::get_reflog_entries(store).await?;
        protected_commits.extend(
            reflog_entries
                .into_iter()
                .filter(|entry| entry.timestamp >= grace_cutoff)
                .map(|entry| entry.commit_hash),
        );

        // Seed 2: Get all commits referenced by branches and tags (always protected)
        let all_refs = sqlx::query("SELECT commit_hash FROM refs")
            .fetch_all(store.read_pool())
            .await
            .map_err(|e| LapisError::Reflog(format!("Failed to query refs: {}", e)))?;

        for row in all_refs {
            let commit_hash_vec: Vec<u8> = row.try_get("commit_hash").map_err(|e| {
                LapisError::Reflog(format!("Failed to get commit_hash from ref: {}", e))
            })?;
            if commit_hash_vec.len() != 32 {
                return Err(LapisError::Reflog(
                    "Invalid commit_hash length in refs table".to_string(),
                ));
            }
            let mut commit_hash = [0u8; 32];
            commit_hash.copy_from_slice(&commit_hash_vec);
            protected_commits.push(commit_hash);
        }

        // Walk commit DAG starting from protected commits, collecting all reachable chunk hashes
        let mut live_chunks = HashSet::new();
        let mut visited_commits = HashSet::new();
        let mut to_visit = protected_commits;

        while let Some(commit_hash) = to_visit.pop() {
            // Skip if already visited (prevents cycles and redundant work)
            if visited_commits.contains(&commit_hash) {
                continue;
            }
            visited_commits.insert(commit_hash);

            // Get manifest for this commit
            let manifest_hash =
                match sqlx::query("SELECT manifest_hash FROM commits WHERE hash = ?1")
                    .bind(commit_hash.to_vec())
                    .fetch_optional(store.read_pool())
                    .await
                    .map_err(|e| LapisError::Reflog(format!("Failed to query commit: {}", e)))?
                {
                    Some(row) => {
                        let manifest_hash_vec: Vec<u8> =
                            row.try_get("manifest_hash").map_err(|e| {
                                LapisError::Reflog(format!("Failed to get manifest_hash: {}", e))
                            })?;
                        if manifest_hash_vec.len() != 32 {
                            return Err(LapisError::Reflog(
                                "Invalid manifest_hash length".to_string(),
                            ));
                        }
                        let mut hash = [0u8; 32];
                        hash.copy_from_slice(&manifest_hash_vec);
                        hash
                    }
                    None => {
                        // Commit not found in database; skip it
                        continue;
                    }
                };

            if let Some(row) = sqlx::query("SELECT chunk_list FROM manifests WHERE hash = ?1")
                .bind(manifest_hash.to_vec())
                .fetch_optional(store.read_pool())
                .await
                .map_err(|e| LapisError::Reflog(format!("Failed to query manifest: {}", e)))?
            {
                let chunk_list_json: String = row
                    .try_get("chunk_list")
                    .map_err(|e| LapisError::Reflog(format!("Failed to get chunk_list: {}", e)))?;

                let chunk_hashes: Vec<Vec<u8>> =
                    serde_json::from_str(&chunk_list_json).map_err(|e| {
                        LapisError::Reflog(format!("Failed to parse chunk_list JSON: {}", e))
                    })?;

                for chunk_hash_vec in chunk_hashes {
                    if chunk_hash_vec.len() != 32 {
                        return Err(LapisError::Reflog(
                            "Invalid chunk_hash length in manifest".to_string(),
                        ));
                    }
                    let mut chunk_hash = [0u8; 32];
                    chunk_hash.copy_from_slice(&chunk_hash_vec);
                    live_chunks.insert(chunk_hash);
                }
            }

            // Get parent commit and add to visit queue
            if let Some(row) = sqlx::query("SELECT parent_hash FROM commits WHERE hash = ?1")
                .bind(commit_hash.to_vec())
                .fetch_optional(store.read_pool())
                .await
                .map_err(|e| LapisError::Reflog(format!("Failed to query parent: {}", e)))?
            {
                if let Ok(parent_opt) = row.try_get::<Option<Vec<u8>>, _>("parent_hash") {
                    if let Some(parent_vec) = parent_opt {
                        if parent_vec.len() == 32 {
                            let mut parent_hash = [0u8; 32];
                            parent_hash.copy_from_slice(&parent_vec);
                            to_visit.push(parent_hash);
                        }
                    }
                }
            }
        }

        Ok(live_chunks)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::index::MetadataStore;
    use tempfile::TempDir;

    async fn insert_test_commit(
        store: &mut MetadataStore,
        commit_hash: &[u8; 32],
        manifest_hash: &[u8; 32],
    ) -> Result<()> {
        insert_test_commit_with_chunks(store, commit_hash, manifest_hash, vec![]).await
    }

    async fn insert_test_commit_with_chunks(
        store: &mut MetadataStore,
        commit_hash: &[u8; 32],
        manifest_hash: &[u8; 32],
        chunk_hashes: Vec<[u8; 32]>,
    ) -> Result<()> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let chunk_list_json =
            serde_json::to_string(&chunk_hashes.iter().map(|h| h.to_vec()).collect::<Vec<_>>())
                .map_err(|e| {
                    LapisError::Reflog(format!("Failed to serialize chunk_list: {}", e))
                })?;

        sqlx::query(
            "INSERT INTO manifests (hash, file_path, chunk_list, total_size, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(manifest_hash.to_vec())
        .bind("test_file")
        .bind(chunk_list_json)
        .bind(0i64)
        .bind(now)
        .execute(store.write_conn())
        .await
        .map_err(|e| LapisError::Reflog(format!("Failed to insert test manifest: {}", e)))?;

        sqlx::query(
            "INSERT INTO commits (hash, parent_hash, manifest_hash, timestamp, message)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(commit_hash.to_vec())
        .bind(None::<Vec<u8>>)
        .bind(manifest_hash.to_vec())
        .bind(now)
        .bind("test commit")
        .execute(store.write_conn())
        .await
        .map_err(|e| LapisError::Reflog(format!("Failed to insert test commit: {}", e)))?;
        Ok(())
    }

    #[tokio::test]
    async fn test_log_action_stores_entry() {
        let temp_dir = TempDir::new().expect("create temp dir");
        let db_path = temp_dir.path().join("test.db");
        let mut store = MetadataStore::new(&db_path)
            .await
            .expect("create metadata store");

        let commit_hash = [1u8; 32];
        let manifest_hash = [10u8; 32];

        insert_test_commit(&mut store, &commit_hash, &manifest_hash)
            .await
            .expect("insert test commit");

        let now_before = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        ReflogManager::log_action(&mut store, &commit_hash, "commit")
            .await
            .expect("log action should succeed");

        let now_after = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let entries = ReflogManager::get_reflog_entries(&store)
            .await
            .expect("get entries should succeed");

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].commit_hash, commit_hash);
        assert_eq!(entries[0].action, "commit");
        assert!(entries[0].timestamp >= now_before && entries[0].timestamp <= now_after);
    }

    #[tokio::test]
    async fn test_multiple_reflog_entries() {
        let temp_dir = TempDir::new().expect("create temp dir");
        let db_path = temp_dir.path().join("test.db");
        let mut store = MetadataStore::new(&db_path)
            .await
            .expect("create metadata store");

        let hash1 = [1u8; 32];
        let hash2 = [2u8; 32];
        let hash3 = [3u8; 32];
        let manifest_hash1 = [10u8; 32];
        let manifest_hash2 = [11u8; 32];
        let manifest_hash3 = [12u8; 32];

        insert_test_commit(&mut store, &hash1, &manifest_hash1)
            .await
            .expect("insert 1");
        insert_test_commit(&mut store, &hash2, &manifest_hash2)
            .await
            .expect("insert 2");
        insert_test_commit(&mut store, &hash3, &manifest_hash3)
            .await
            .expect("insert 3");

        ReflogManager::log_action(&mut store, &hash1, "commit")
            .await
            .expect("log 1");
        ReflogManager::log_action(&mut store, &hash2, "checkout")
            .await
            .expect("log 2");
        ReflogManager::log_action(&mut store, &hash3, "reset")
            .await
            .expect("log 3");

        let entries = ReflogManager::get_reflog_entries(&store)
            .await
            .expect("get entries should succeed");

        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].action, "commit");
        assert_eq!(entries[1].action, "checkout");
        assert_eq!(entries[2].action, "reset");
    }

    #[tokio::test]
    async fn test_reflog_grace_period_protection_with_real_chunks() {
        let temp_dir = TempDir::new().expect("create temp dir");
        let db_path = temp_dir.path().join("test.db");
        let mut store = MetadataStore::new(&db_path)
            .await
            .expect("create metadata store");

        let commit_hash = [1u8; 32];
        let manifest_hash = [10u8; 32];
        let chunk1 = [100u8; 32];
        let chunk2 = [101u8; 32];
        let chunk3 = [102u8; 32];

        insert_test_commit_with_chunks(
            &mut store,
            &commit_hash,
            &manifest_hash,
            vec![chunk1, chunk2, chunk3],
        )
        .await
        .expect("insert test commit");

        ReflogManager::log_action(&mut store, &commit_hash, "commit")
            .await
            .expect("log action");

        let grace_period = Duration::from_secs(3600);
        let live_chunks = ReflogManager::mark_live(&store, grace_period)
            .await
            .expect("mark_live should succeed");

        assert_eq!(
            live_chunks.len(),
            3,
            "Should return all 3 chunks from recent commit"
        );
        assert!(live_chunks.contains(&chunk1), "Should contain chunk1");
        assert!(live_chunks.contains(&chunk2), "Should contain chunk2");
        assert!(live_chunks.contains(&chunk3), "Should contain chunk3");
    }

    #[tokio::test]
    async fn test_reflog_old_entries_do_not_protect_chunks() {
        let temp_dir = TempDir::new().expect("create temp dir");
        let db_path = temp_dir.path().join("test.db");
        let mut store = MetadataStore::new(&db_path)
            .await
            .expect("create metadata store");

        let old_timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            - 7200;

        let commit_hash = [2u8; 32];
        let manifest_hash = [20u8; 32];
        let chunk1 = [200u8; 32];
        let chunk2 = [201u8; 32];

        insert_test_commit_with_chunks(
            &mut store,
            &commit_hash,
            &manifest_hash,
            vec![chunk1, chunk2],
        )
        .await
        .expect("insert test commit");

        sqlx::query("INSERT INTO reflog (commit_hash, action, timestamp) VALUES (?1, ?2, ?3)")
            .bind(commit_hash.to_vec())
            .bind("commit")
            .bind(old_timestamp as i64)
            .execute(store.write_conn())
            .await
            .expect("insert old reflog entry");

        let grace_period = Duration::from_secs(3600);
        let live_chunks = ReflogManager::mark_live(&store, grace_period)
            .await
            .expect("mark_live should succeed");

        assert_eq!(
            live_chunks.len(),
            0,
            "Old entries outside grace period should not protect chunks"
        );
        assert!(
            !live_chunks.contains(&chunk1),
            "Chunk1 should not be protected"
        );
        assert!(
            !live_chunks.contains(&chunk2),
            "Chunk2 should not be protected"
        );
    }

    #[tokio::test]
    async fn test_reflog_empty_returns_empty_live_set() {
        let temp_dir = TempDir::new().expect("create temp dir");
        let db_path = temp_dir.path().join("test.db");
        let store = MetadataStore::new(&db_path)
            .await
            .expect("create metadata store");

        let grace_period = Duration::from_secs(3600);
        let live_chunks = ReflogManager::mark_live(&store, grace_period)
            .await
            .expect("mark_live should succeed");

        assert_eq!(live_chunks.len(), 0);
    }

    #[tokio::test]
    async fn test_branch_ref_marks_chunks_live_without_reflog() {
        let temp_dir = TempDir::new().expect("create temp dir");
        let db_path = temp_dir.path().join("test.db");
        let mut store = MetadataStore::new(&db_path)
            .await
            .expect("create metadata store");

        let commit_hash = [3u8; 32];
        let manifest_hash = [30u8; 32];
        let chunk1 = [100u8; 32];
        let chunk2 = [101u8; 32];

        insert_test_commit_with_chunks(
            &mut store,
            &commit_hash,
            &manifest_hash,
            vec![chunk1, chunk2],
        )
        .await
        .expect("insert test commit");

        // Create a branch pointing to this commit, but do NOT add a reflog entry
        sqlx::query("INSERT INTO refs (name, ref_type, commit_hash, is_mutable, created_at) VALUES (?1, ?2, ?3, ?4, ?5)")
            .bind("test-branch")
            .bind("branch")
            .bind(commit_hash.to_vec())
            .bind(1i32)  // is_mutable = 1 for branch
            .bind(SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64)
            .execute(store.write_conn())
            .await
            .expect("insert test branch ref");

        // Even with zero grace period (reflog entries old enough to be ignored),
        // branch ref should cause chunks to be marked live
        let grace_period = Duration::from_secs(0);
        let live_chunks = ReflogManager::mark_live(&store, grace_period)
            .await
            .expect("mark_live should succeed");

        assert_eq!(
            live_chunks.len(),
            2,
            "Should mark chunks live via branch ref even without reflog entry"
        );
        assert!(
            live_chunks.contains(&chunk1),
            "Chunk1 should be protected by branch ref"
        );
        assert!(
            live_chunks.contains(&chunk2),
            "Chunk2 should be protected by branch ref"
        );
    }

    #[tokio::test]
    async fn test_tag_ref_marks_chunks_live_without_reflog() {
        let temp_dir = TempDir::new().expect("create temp dir");
        let db_path = temp_dir.path().join("test.db");
        let mut store = MetadataStore::new(&db_path)
            .await
            .expect("create metadata store");

        let commit_hash = [4u8; 32];
        let manifest_hash = [40u8; 32];
        let chunk1 = [102u8; 32];
        let chunk2 = [103u8; 32];
        let chunk3 = [104u8; 32];

        insert_test_commit_with_chunks(
            &mut store,
            &commit_hash,
            &manifest_hash,
            vec![chunk1, chunk2, chunk3],
        )
        .await
        .expect("insert test commit");

        // Create a tag pointing to this commit, but do NOT add a reflog entry
        sqlx::query("INSERT INTO refs (name, ref_type, commit_hash, is_mutable, created_at) VALUES (?1, ?2, ?3, ?4, ?5)")
            .bind("v1.0.0")
            .bind("tag")
            .bind(commit_hash.to_vec())
            .bind(0i32)  // is_mutable = 0 for tag
            .bind(SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64)
            .execute(store.write_conn())
            .await
            .expect("insert test tag ref");

        // Tags are ALWAYS protected (no grace period applies)
        let grace_period = Duration::from_secs(0);
        let live_chunks = ReflogManager::mark_live(&store, grace_period)
            .await
            .expect("mark_live should succeed");

        assert_eq!(
            live_chunks.len(),
            3,
            "Should mark all chunks live via tag ref"
        );
        assert!(
            live_chunks.contains(&chunk1),
            "Chunk1 should be protected by tag ref"
        );
        assert!(
            live_chunks.contains(&chunk2),
            "Chunk2 should be protected by tag ref"
        );
        assert!(
            live_chunks.contains(&chunk3),
            "Chunk3 should be protected by tag ref"
        );
    }
}
