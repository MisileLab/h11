//! Hot/Cold tiering worker for block migration.
//!
//! This module provides safe migration of blocks from hot to cold storage.
//! - Hot blocks: uncompressed, stored in `hot/{prefix}/{hash}`
//! - Cold blocks: compressed with zstd:22, stored in `cold/{prefix}/{hash}`
//!
//! Migration is safe: a block is only deleted from hot storage after the cold
//! version is written and verified. If cold write fails, the hot block remains untouched.

use crate::error::{LapisError, Result};
use crate::index::MetadataStore;
use crate::store::compression::compress;
use chrono::Utc;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const COLD_COMPRESSION_ALGO: &str = "zstd:22";

#[derive(Debug, Clone)]
pub struct TieringResult {
    pub hash: [u8; 32],
    pub original_size: u32,
    pub compressed_size: u32,
    pub cold_path: String,
}

#[derive(Debug, Clone)]
pub struct TierColdResult {
    pub eligible_blocks: usize,
    pub migrated_blocks: usize,
    pub migrated: Vec<TieringResult>,
}

#[derive(Debug)]
struct StagedColdBlock {
    result: TieringResult,
    hot_path: PathBuf,
    cold_full_path: PathBuf,
}

pub async fn tier_cold(
    metadata_store: &mut MetadataStore,
    hot_root: &Path,
    cold_root: &Path,
    older_than: Duration,
    min_access: u32,
) -> Result<TierColdResult> {
    let older_than_timestamp = Utc::now().timestamp() - older_than.as_secs() as i64;
    let max_access_count = i32::try_from(min_access)
        .map_err(|_| LapisError::Metadata("min_access exceeds supported range".to_string()))?;

    let eligible_hashes = metadata_store
        .query_eligible_cold_blocks(older_than_timestamp, max_access_count)
        .await?;

    let mut migrated = Vec::new();

    for hash in eligible_hashes.iter().copied() {
        let staged = stage_hot_to_cold(hot_root, cold_root, &hash)?;
        if let Err(err) = metadata_store
            .mark_block_cold(&hash, staged.result.compressed_size)
            .await
        {
            let _ = fs::remove_file(&staged.cold_full_path);
            return Err(err);
        }

        if let Err(err) = fs::remove_file(&staged.hot_path) {
            return Err(LapisError::Cas(format!(
                "failed to delete hot block after cold tiering: {}",
                err
            )));
        }

        migrated.push(staged.result);
    }

    Ok(TierColdResult {
        eligible_blocks: eligible_hashes.len(),
        migrated_blocks: migrated.len(),
        migrated,
    })
}

pub fn tier_hot_to_cold(
    hot_root: &Path,
    cold_root: &Path,
    hash: &[u8; 32],
) -> Result<TieringResult> {
    let staged = stage_hot_to_cold(hot_root, cold_root, hash)?;
    fs::remove_file(&staged.hot_path).map_err(|e| {
        LapisError::Cas(format!(
            "failed to delete hot block after cold tiering: {}",
            e
        ))
    })?;

    Ok(staged.result)
}

fn stage_hot_to_cold(
    hot_root: &Path,
    cold_root: &Path,
    hash: &[u8; 32],
) -> Result<StagedColdBlock> {
    let hot_path = compute_hot_path(hot_root, hash);
    let (cold_prefix, cold_path_rel, cold_full_path) = compute_cold_path(cold_root, hash);

    let original_data = fs::read(&hot_path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            LapisError::Cas(format!(
                "hot block not found for tiering: {}",
                hex::encode(hash)
            ))
        } else {
            LapisError::Cas(format!("failed to read hot block for tiering: {}", e))
        }
    })?;

    let original_size = original_data.len() as u32;

    let compressed_data = compress(&original_data, 22)?;
    let compressed_size = compressed_data.len() as u32;

    fs::create_dir_all(&cold_prefix).map_err(|e| {
        LapisError::Cas(format!(
            "failed to create cold prefix dir {}: {}",
            cold_prefix.display(),
            e
        ))
    })?;

    let temp_cold_path = cold_full_path.with_extension("tmp");
    fs::write(&temp_cold_path, &compressed_data)
        .map_err(|e| LapisError::Cas(format!("failed to write cold block temp file: {}", e)))?;

    fs::rename(&temp_cold_path, &cold_full_path).map_err(|e| {
        let _ = fs::remove_file(&temp_cold_path);
        LapisError::Cas(format!("failed to rename cold block temp file: {}", e))
    })?;

    let cold_verify_data = fs::read(&cold_full_path)
        .map_err(|e| LapisError::Cas(format!("failed to verify cold block after write: {}", e)))?;

    if cold_verify_data.len() != compressed_data.len() {
        let _ = fs::remove_file(&cold_full_path);
        return Err(LapisError::Cas(
            "cold block verification failed: size mismatch after write".to_string(),
        ));
    }

    Ok(StagedColdBlock {
        result: TieringResult {
            hash: *hash,
            original_size,
            compressed_size,
            cold_path: cold_path_rel,
        },
        hot_path,
        cold_full_path,
    })
}

fn compute_hot_path(hot_root: &Path, hash: &[u8; 32]) -> PathBuf {
    let hex = hex::encode(hash);
    let prefix = &hex[..2];
    let filename = &hex[2..];
    hot_root.join(prefix).join(filename)
}

fn compute_cold_path(cold_root: &Path, hash: &[u8; 32]) -> (PathBuf, String, PathBuf) {
    let hex = hex::encode(hash);
    let prefix = &hex[..2];
    let filename = &hex[2..];
    let prefix_dir = cold_root.join(prefix);
    let rel_path = format!("{}/{}", prefix, filename);
    let full_path = prefix_dir.join(filename);
    (prefix_dir, rel_path, full_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::index::MetadataStore;
    use crate::store::CasStore;
    use sqlx::Row;
    use tempfile::TempDir;

    fn write_hot_block(hot_root: &Path, hash: &[u8; 32], data: &[u8]) -> Result<()> {
        let (prefix, _filename, full_path) = compute_cold_path(hot_root, hash);
        fs::create_dir_all(&prefix)?;
        fs::write(&full_path, data)?;
        Ok(())
    }

    #[test]
    fn test_tier_successful_migration() {
        let hot_dir = TempDir::new().expect("create hot temp dir");
        let cold_dir = TempDir::new().expect("create cold temp dir");

        let hash = [0x42u8; 32];
        let original_data = b"hello world, this is test data";

        write_hot_block(hot_dir.path(), &hash, original_data).expect("write hot block");

        let hot_path = compute_hot_path(hot_dir.path(), &hash);
        assert!(hot_path.exists(), "hot block should exist before tiering");

        let result =
            tier_hot_to_cold(hot_dir.path(), cold_dir.path(), &hash).expect("tier should succeed");

        assert_eq!(result.hash, hash);
        assert_eq!(result.original_size, original_data.len() as u32);
        assert!(result.compressed_size > 0);
        assert_eq!(
            result.cold_path,
            "42/42424242424242424242424242424242424242424242424242424242424242"
        );

        assert!(
            !hot_path.exists(),
            "hot block should be deleted after tiering"
        );

        let (_, _, cold_full_path) = compute_cold_path(cold_dir.path(), &hash);
        assert!(
            cold_full_path.exists(),
            "cold block should exist after tiering"
        );

        let cold_data = fs::read(&cold_full_path).expect("read cold block");
        assert!(!cold_data.is_empty(), "cold block should not be empty");
    }

    #[test]
    fn test_tier_cold_write_failure_preserves_hot() {
        let hot_dir = TempDir::new().expect("create hot temp dir");
        let cold_dir = TempDir::new().expect("create cold temp dir");

        let hash = [0x99u8; 32];
        let original_data = b"preserve me";

        write_hot_block(hot_dir.path(), &hash, original_data).expect("write hot block");

        let hot_path = compute_hot_path(hot_dir.path(), &hash);
        assert!(hot_path.exists(), "hot block should exist");

        let (cold_prefix, _, _) = compute_cold_path(cold_dir.path(), &hash);
        fs::create_dir_all(&cold_prefix).expect("create cold prefix");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let ro_perms = fs::Permissions::from_mode(0o555);
            fs::set_permissions(&cold_prefix, ro_perms).expect("set readonly");
        }

        let result = tier_hot_to_cold(hot_dir.path(), cold_dir.path(), &hash);
        assert!(
            result.is_err(),
            "tiering should fail with read-only cold dir"
        );

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let rw_perms = fs::Permissions::from_mode(0o755);
            fs::set_permissions(&cold_prefix, rw_perms).expect("restore permissions");
        }

        assert!(
            hot_path.exists(),
            "hot block must remain after tiering failure"
        );

        let hot_data = fs::read(&hot_path).expect("read hot block");
        assert_eq!(hot_data, original_data, "hot block data must be unchanged");
    }

    #[test]
    fn test_tier_hot_block_not_found() {
        let hot_dir = TempDir::new().expect("create hot temp dir");
        let cold_dir = TempDir::new().expect("create cold temp dir");

        let hash = [0xDDu8; 32];

        let result = tier_hot_to_cold(hot_dir.path(), cold_dir.path(), &hash);
        assert!(result.is_err(), "tiering should fail for missing hot block");
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    #[test]
    fn test_cold_path_format() {
        let hash = [0xA1u8; 32];
        let cold_dir = TempDir::new().expect("create cold temp dir");

        let (_prefix_dir, rel_path, full_path) = compute_cold_path(cold_dir.path(), &hash);

        assert!(
            rel_path.starts_with("a1/"),
            "cold path should start with prefix: {}",
            rel_path
        );

        let filename = full_path.file_name().unwrap().to_str().unwrap();
        assert!(
            filename.starts_with("a1"),
            "filename should start with remaining hash chars"
        );
    }

    #[test]
    fn test_tiering_compresses_data() {
        let hot_dir = TempDir::new().expect("create hot temp dir");
        let cold_dir = TempDir::new().expect("create cold temp dir");

        let hash = [0x88u8; 32];
        let original_data: Vec<u8> = vec![42u8; 10000];

        write_hot_block(hot_dir.path(), &hash, &original_data).expect("write hot block");

        let result =
            tier_hot_to_cold(hot_dir.path(), cold_dir.path(), &hash).expect("tier should succeed");

        assert_eq!(result.original_size, 10000);
        assert!(result.compressed_size < result.original_size);
        assert!(
            result.compressed_size < 500,
            "repetitive data should compress well"
        );
    }

    #[test]
    fn test_multiple_blocks_independent_tiers() {
        let hot_dir = TempDir::new().expect("create hot temp dir");
        let cold_dir = TempDir::new().expect("create cold temp dir");

        let hash1 = [0x11u8; 32];
        let hash2 = [0x22u8; 32];
        let data1 = b"first block data";
        let data2 = b"second block data with different content";

        write_hot_block(hot_dir.path(), &hash1, data1).expect("write block 1");
        write_hot_block(hot_dir.path(), &hash2, data2).expect("write block 2");

        let result1 =
            tier_hot_to_cold(hot_dir.path(), cold_dir.path(), &hash1).expect("tier block 1");
        assert_eq!(result1.original_size, data1.len() as u32);

        let hot_path1 = compute_hot_path(hot_dir.path(), &hash1);
        assert!(!hot_path1.exists(), "block 1 hot should be deleted");

        let hot_path2 = compute_hot_path(hot_dir.path(), &hash2);
        assert!(hot_path2.exists(), "block 2 hot should still exist");

        let result2 =
            tier_hot_to_cold(hot_dir.path(), cold_dir.path(), &hash2).expect("tier block 2");
        assert_eq!(result2.original_size, data2.len() as u32);

        let (_, _, cold_path1) = compute_cold_path(cold_dir.path(), &hash1);
        let (_, _, cold_path2) = compute_cold_path(cold_dir.path(), &hash2);
        assert!(cold_path1.exists(), "block 1 cold should exist");
        assert!(cold_path2.exists(), "block 2 cold should exist");
    }

    #[test]
    fn test_tier_cold_selects_eligible_blocks_and_updates_metadata() {
        let hot_dir = TempDir::new().expect("create hot temp dir");
        let cold_dir = TempDir::new().expect("create cold temp dir");
        let db_dir = TempDir::new().expect("create db temp dir");
        let cas = CasStore::new(hot_dir.path()).expect("create cas store");

        let eligible_hash = cas
            .put(b"eligible old rarely-read block")
            .expect("put eligible block");
        let recent_hash = cas.put(b"recent block").expect("put recent block");
        let noisy_hash = cas
            .put(b"frequently accessed block")
            .expect("put noisy block");

        let rt = tokio::runtime::Runtime::new().expect("create tokio runtime");
        rt.block_on(async {
            let db_path = db_dir.path().join("index.db");
            let mut store = MetadataStore::new(&db_path)
                .await
                .expect("open metadata store");

            store
                .insert_block(&eligible_hash, 30, "hot")
                .await
                .expect("insert eligible metadata");
            store
                .insert_block(&recent_hash, 12, "hot")
                .await
                .expect("insert recent metadata");
            store
                .insert_block(&noisy_hash, 28, "hot")
                .await
                .expect("insert noisy metadata");

            sqlx::query("UPDATE blocks SET created_at = 0, access_count = 0 WHERE hash = ?1")
                .bind(eligible_hash.to_vec())
                .execute(store.write_conn())
                .await
                .expect("age eligible block");
            sqlx::query("UPDATE blocks SET created_at = 0, access_count = 9 WHERE hash = ?1")
                .bind(noisy_hash.to_vec())
                .execute(store.write_conn())
                .await
                .expect("mark noisy block heavily accessed");

            let result = tier_cold(
                &mut store,
                hot_dir.path(),
                cold_dir.path(),
                Duration::from_secs(60),
                0,
            )
            .await
            .expect("tier cold blocks");

            assert_eq!(result.eligible_blocks, 1);
            assert_eq!(result.migrated_blocks, 1);
            assert_eq!(result.migrated.len(), 1);
            assert_eq!(result.migrated[0].hash, eligible_hash);

            let row = sqlx::query(
                "SELECT zone, compressed_size, compress_algo FROM blocks WHERE hash = ?1",
            )
            .bind(eligible_hash.to_vec())
            .fetch_one(store.read_pool())
            .await
            .expect("query eligible block metadata");

            let zone: String = row.get("zone");
            let compressed_size: i64 = row.get("compressed_size");
            let compress_algo: String = row.get("compress_algo");
            assert_eq!(zone, "cold");
            assert!(compressed_size > 0);
            assert_eq!(compress_algo, COLD_COMPRESSION_ALGO);
        });

        let hot_eligible = compute_hot_path(hot_dir.path(), &eligible_hash);
        let hot_recent = compute_hot_path(hot_dir.path(), &recent_hash);
        let hot_noisy = compute_hot_path(hot_dir.path(), &noisy_hash);
        assert!(
            !hot_eligible.exists(),
            "eligible block should leave hot storage"
        );
        assert!(hot_recent.exists(), "recent block must stay in hot storage");
        assert!(
            hot_noisy.exists(),
            "over-accessed block must stay in hot storage"
        );

        let (_, _, cold_eligible) = compute_cold_path(cold_dir.path(), &eligible_hash);
        assert!(
            cold_eligible.exists(),
            "eligible block should appear in cold storage"
        );

        let cold_read_store = CasStore::with_cold_storage(hot_dir.path(), Some(cold_dir.path()))
            .expect("reopen cas store");
        let cold_data = cold_read_store
            .get(&eligible_hash)
            .expect("read cold block via CAS");
        assert_eq!(cold_data, b"eligible old rarely-read block");
    }
}
