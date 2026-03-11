//! `lapis scrub` command implementation
//!
//! Scrub detects bit-rot by:
//! 1. Scanning all blocks in CAS
//! 2. Re-hashing each block and comparing to stored hash
//! 3. Reporting any mismatches as corrupted blocks
//! 4. With --repair: attempts to re-fetch corrupted blocks from remote CAS

use lapis::error::Result;
use lapis::index::MetadataStore;
use lapis::repo::Repository;
use lapis::store::cas::CasStore;
use std::fs;
use std::path::PathBuf;

use super::ScrubArgs;

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

/// Result of a scrub operation
#[derive(Debug)]
pub struct ScrubResult {
    pub total_blocks: usize,
    pub corrupted_blocks: Vec<CorruptedBlock>,
    pub repaired_count: usize,
    pub failed_repair_count: usize,
    pub repair_mode: bool,
}

/// Information about a corrupted block
#[derive(Debug, Clone)]
pub struct CorruptedBlock {
    pub hash: [u8; 32],
    pub expected_hash: [u8; 32],
    pub path: PathBuf,
}

impl ScrubResult {
    pub fn print_summary(&self) {
        println!("╭─ Scrub Report");
        println!("│");
        println!("│ Total blocks scanned: {}", self.total_blocks);
        println!("│ Corrupted blocks:     {}", self.corrupted_blocks.len());

        if !self.corrupted_blocks.is_empty() {
            println!("│");
            println!("│ Corrupted blocks:");
            for (i, cb) in self.corrupted_blocks.iter().enumerate() {
                println!(
                    "│   [{}] {} (expected: {})",
                    i + 1,
                    hex::encode(&cb.hash),
                    hex::encode(&cb.expected_hash)
                );
                println!("│       Path: {}", cb.path.display());
            }
        }

        if self.repair_mode {
            println!("│");
            println!("│ Repair Results:");
            println!("│   Repaired:      {}", self.repaired_count);
            println!("│   Failed repair: {}", self.failed_repair_count);
        }

        println!("│");
        println!("╰─");
    }
}

pub async fn execute(args: ScrubArgs) -> Result<()> {
    let repo_root = find_repo_root()?;
    let repo = Repository::open(&repo_root)?;

    let cas_store = CasStore::new(repo.store_hot_dir())?;
    let _metadata_store = MetadataStore::new(repo.meta_dir().join("index.db")).await?;

    println!("🔍 Scanning all blocks in CAS...");
    let all_blocks = scan_all_blocks(&cas_store)?;
    println!("   Found {} blocks", all_blocks.len());

    if all_blocks.is_empty() {
        let result = ScrubResult {
            total_blocks: 0,
            corrupted_blocks: vec![],
            repaired_count: 0,
            failed_repair_count: 0,
            repair_mode: args.repair,
        };
        result.print_summary();
        return Ok(());
    }

    println!("♻️  Verifying block hashes...");
    let corrupted = verify_blocks(&cas_store, &all_blocks)?;

    if corrupted.is_empty() {
        println!("   All blocks verified successfully!");
        let result = ScrubResult {
            total_blocks: all_blocks.len(),
            corrupted_blocks: vec![],
            repaired_count: 0,
            failed_repair_count: 0,
            repair_mode: args.repair,
        };
        result.print_summary();
        return Ok(());
    }

    println!("   Found {} corrupted blocks", corrupted.len());

    let mut repaired_count = 0;
    let mut failed_repair_count = 0;

    if args.repair {
        println!("🔧 Attempting to repair corrupted blocks...");

        let remote_url = read_remote_url(&repo)?;
        if remote_url.is_none() {
            println!("⚠️  No remote URL configured. Repair impossible.");
            println!("    (Use 'lapis clone' or 'lapis pull' to configure a remote)");
            failed_repair_count = corrupted.len();
        } else {
            let url = remote_url.unwrap();
            for corrupted_block in &corrupted {
                match attempt_remote_fetch(&url, &corrupted_block.hash).await {
                    Ok(data) => match cas_store.put(&data) {
                        Ok(_) => {
                            println!("   ✓ Repaired: {}", hex::encode(&corrupted_block.hash));
                            repaired_count += 1;
                        }
                        Err(e) => {
                            println!(
                                "   ✗ Failed to store repaired block {}: {}",
                                hex::encode(&corrupted_block.hash),
                                e
                            );
                            failed_repair_count += 1;
                        }
                    },
                    Err(e) => {
                        println!(
                            "   ✗ Failed to fetch {} from remote: {}",
                            hex::encode(&corrupted_block.hash),
                            e
                        );
                        failed_repair_count += 1;
                    }
                }
            }
        }
    }

    let result = ScrubResult {
        total_blocks: all_blocks.len(),
        corrupted_blocks: corrupted,
        repaired_count,
        failed_repair_count,
        repair_mode: args.repair,
    };
    result.print_summary();

    Ok(())
}

/// Scan all blocks in CAS and return their hashes
fn scan_all_blocks(cas_store: &CasStore) -> Result<Vec<[u8; 32]>> {
    let mut blocks = Vec::new();
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
                                blocks.push(hash);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(blocks)
}

/// Verify all blocks by re-hashing them
fn verify_blocks(cas_store: &CasStore, blocks: &[[u8; 32]]) -> Result<Vec<CorruptedBlock>> {
    let mut corrupted = Vec::new();

    for (idx, block_hash) in blocks.iter().enumerate() {
        // Emit progress for multi-block scans (every 10 blocks or at end)
        if blocks.len() > 10 && (idx + 1) % 10 == 0 {
            println!("   Verified {}/{} blocks...", idx + 1, blocks.len());
        }

        match verify_single_block(cas_store, block_hash) {
            Ok(None) => {
                // Block is good
            }
            Ok(Some(corrupted_block)) => {
                corrupted.push(corrupted_block);
            }
            Err(e) => {
                eprintln!(
                    "⚠️  Error verifying block {}: {}",
                    hex::encode(block_hash),
                    e
                );
            }
        }
    }

    Ok(corrupted)
}

/// Verify a single block and return CorruptedBlock if it doesn't match
fn verify_single_block(
    cas_store: &CasStore,
    expected_hash: &[u8; 32],
) -> Result<Option<CorruptedBlock>> {
    match cas_store.verify(expected_hash) {
        Ok(()) => Ok(None),
        Err(e) => {
            let error_msg = e.to_string();
            if error_msg.contains("hash mismatch") || error_msg.contains("verification failed") {
                // Compute the path to the corrupted block
                let cas_root = cas_store.root();
                let prefix_name = hex::encode(expected_hash)[..2].to_string();
                let block_name = hex::encode(expected_hash)[2..].to_string();
                let full_path = cas_root.join(&prefix_name).join(&block_name);

                // Read the actual on-disk bytes and compute their hash
                // This gives us the honest hash of the corrupted data, not the expected hash
                let actual_hash = match fs::read(&full_path) {
                    Ok(data_bytes) => lapis::crypto::blake3::hash_bytes(&data_bytes),
                    Err(_) => {
                        // If we can't read the file (shouldn't happen after verify() failed),
                        // return a zero hash to indicate data loss, not a silent echo of expected
                        [0u8; 32]
                    }
                };

                Ok(Some(CorruptedBlock {
                    hash: actual_hash,
                    expected_hash: *expected_hash,
                    path: full_path,
                }))
            } else {
                Err(e)
            }
        }
    }
}

/// Read remote URL from `.lapis/remote` if it exists
fn read_remote_url(repo: &Repository) -> Result<Option<String>> {
    let remote_file = repo.lapis_dir().join("remote");
    if !remote_file.exists() {
        return Ok(None);
    }

    let url = fs::read_to_string(&remote_file).map_err(|e| {
        lapis::error::LapisError::Metadata(format!("Failed to read remote file: {}", e))
    })?;

    Ok(Some(url))
}

/// Attempt to fetch a block from remote CAS
async fn attempt_remote_fetch(base_url: &str, hash: &[u8; 32]) -> Result<Vec<u8>> {
    let client = reqwest::Client::new();
    let block_url = format!("{}/blocks/{}", base_url, hex::encode(hash));

    let response =
        client.get(&block_url).send().await.map_err(|e| {
            lapis::error::LapisError::Network(format!("Failed to fetch block: {}", e))
        })?;

    if !response.status().is_success() {
        return Err(lapis::error::LapisError::Network(format!(
            "Remote returned status {}: {}",
            response.status(),
            block_url
        )));
    }

    response
        .bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| lapis::error::LapisError::Network(format!("Failed to read response: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use lapis::store::cas::CasStore;
    use std::io::Write;
    use tempfile::TempDir;

    #[test]
    fn test_scan_all_blocks_empty() {
        let temp_dir = TempDir::new().unwrap();
        let cas_store = CasStore::new(temp_dir.path()).unwrap();
        let blocks = scan_all_blocks(&cas_store).unwrap();
        assert_eq!(blocks.len(), 0);
    }

    #[test]
    fn test_scan_all_blocks_with_data() {
        let temp_dir = TempDir::new().unwrap();
        let cas_store = CasStore::new(temp_dir.path()).unwrap();

        let data = b"test block data";
        let hash = cas_store.put(data).unwrap();

        let blocks = scan_all_blocks(&cas_store).unwrap();
        assert_eq!(blocks.len(), 1);
        assert!(blocks.contains(&hash));
    }

    #[test]
    fn test_verify_blocks_clean_store() {
        let temp_dir = TempDir::new().unwrap();
        let cas_store = CasStore::new(temp_dir.path()).unwrap();

        let data1 = b"block 1";
        let data2 = b"block 2";
        let hash1 = cas_store.put(data1).unwrap();
        let hash2 = cas_store.put(data2).unwrap();

        let blocks = vec![hash1, hash2];
        let corrupted = verify_blocks(&cas_store, &blocks).unwrap();
        assert_eq!(
            corrupted.len(),
            0,
            "Clean store should have no corrupted blocks"
        );
    }

    #[test]
    fn test_verify_blocks_detects_corruption() {
        let temp_dir = TempDir::new().unwrap();
        let cas_store = CasStore::new(temp_dir.path()).unwrap();

        let data = b"original data";
        let hash = cas_store.put(data).unwrap();

        let cas_root = cas_store.root();
        let prefix_name = hex::encode(&hash)[..2].to_string();
        let block_name = hex::encode(&hash)[2..].to_string();
        let full_path = cas_root.join(&prefix_name).join(&block_name);

        let mut file = fs::File::create(&full_path).unwrap();
        file.write_all(b"corrupted").unwrap();
        drop(file);

        let blocks = vec![hash];
        let corrupted = verify_blocks(&cas_store, &blocks).unwrap();
        assert_eq!(corrupted.len(), 1, "Should detect corrupted block");
        assert_eq!(corrupted[0].expected_hash, hash);

        // CRITICAL: Verify that actual hash of corrupted bytes differs from expected hash
        // This ensures we're reporting honest corruption detection, not silently echoing expected_hash
        assert_ne!(
            corrupted[0].hash, corrupted[0].expected_hash,
            "Corrupted block must have different actual hash than expected (not an identity echo)"
        );
    }

    #[test]
    fn test_scrub_result_print_summary() {
        let result = ScrubResult {
            total_blocks: 100,
            corrupted_blocks: vec![CorruptedBlock {
                hash: [1u8; 32],
                expected_hash: [2u8; 32],
                path: PathBuf::from("/path/to/block1"),
            }],
            repaired_count: 0,
            failed_repair_count: 1,
            repair_mode: true,
        };

        // This should not panic
        result.print_summary();
    }

    #[test]
    fn test_scrub_execute_clean_store() {
        use super::super::test_utils::acquire_cwd_lock;
        use super::super::test_utils::safe_original_cwd;

        let _lock = acquire_cwd_lock();
        let temp_repo = TempDir::new().unwrap();
        let repo_root = temp_repo.path().to_path_buf();

        lapis::repo::Repository::init(&repo_root).expect("init repo");
        let repo = lapis::repo::Repository::open(&repo_root).expect("open repo");

        let cas_store = CasStore::new(repo.store_hot_dir()).unwrap();
        let _hash = cas_store.put(b"test data").unwrap();

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(&repo_root).expect("set cwd");

        let rt = tokio::runtime::Runtime::new().expect("create tokio runtime");
        let result = rt.block_on(async {
            let args = super::ScrubArgs { repair: false };
            execute(args).await
        });

        let _ = std::env::set_current_dir(&original_cwd);

        assert!(result.is_ok(), "Scrub should succeed on clean store");
    }

    #[test]
    fn test_scrub_execute_detects_corruption() {
        use super::super::test_utils::acquire_cwd_lock;
        use super::super::test_utils::safe_original_cwd;

        let _lock = acquire_cwd_lock();
        let temp_repo = TempDir::new().unwrap();
        let repo_root = temp_repo.path().to_path_buf();

        lapis::repo::Repository::init(&repo_root).expect("init repo");
        let repo = lapis::repo::Repository::open(&repo_root).expect("open repo");

        let cas_store = CasStore::new(repo.store_hot_dir()).unwrap();
        let hash = cas_store.put(b"original data").unwrap();

        let cas_root = cas_store.root();
        let prefix_name = hex::encode(&hash)[..2].to_string();
        let block_name = hex::encode(&hash)[2..].to_string();
        let full_path = cas_root.join(&prefix_name).join(&block_name);

        let mut file = fs::File::create(&full_path).unwrap();
        file.write_all(b"corrupted").unwrap();
        drop(file);

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(&repo_root).expect("set cwd");

        let rt = tokio::runtime::Runtime::new().expect("create tokio runtime");
        let result = rt.block_on(async {
            let args = super::ScrubArgs { repair: false };
            execute(args).await
        });

        let _ = std::env::set_current_dir(&original_cwd);

        assert!(
            result.is_ok(),
            "Scrub should complete even with corrupted blocks"
        );
    }

    #[test]
    fn test_read_remote_url_missing() {
        let temp_dir = TempDir::new().unwrap();
        let repo = lapis::repo::Repository::init(temp_dir.path()).unwrap();
        let url = read_remote_url(&repo).unwrap();
        assert!(
            url.is_none(),
            "Should return None when remote file doesn't exist"
        );
    }

    #[test]
    fn test_read_remote_url_exists() {
        let temp_dir = TempDir::new().unwrap();
        let repo = lapis::repo::Repository::init(temp_dir.path()).unwrap();

        let remote_file = repo.lapis_dir().join("remote");
        fs::write(&remote_file, "http://example.com:3000").unwrap();

        let url = read_remote_url(&repo).unwrap();
        assert_eq!(
            url,
            Some("http://example.com:3000".to_string()),
            "Should read remote URL from file"
        );
    }

    #[test]
    fn test_scrub_execute_multi_block_progress() {
        use super::super::test_utils::acquire_cwd_lock;
        use super::super::test_utils::safe_original_cwd;

        let _lock = acquire_cwd_lock();
        let temp_repo = TempDir::new().unwrap();
        let repo_root = temp_repo.path().to_path_buf();

        lapis::repo::Repository::init(&repo_root).expect("init repo");
        let repo = lapis::repo::Repository::open(&repo_root).expect("open repo");

        let cas_store = CasStore::new(repo.store_hot_dir()).unwrap();

        // Create multiple blocks to trigger progress output (15 blocks > 10 threshold)
        for i in 0..15 {
            let data = format!("test block data {}", i);
            let _ = cas_store.put(data.as_bytes()).unwrap();
        }

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(&repo_root).expect("set cwd");

        let rt = tokio::runtime::Runtime::new().expect("create tokio runtime");
        let result = rt.block_on(async {
            let args = super::ScrubArgs { repair: false };
            execute(args).await
        });

        let _ = std::env::set_current_dir(&original_cwd);

        assert!(
            result.is_ok(),
            "Scrub should succeed with multi-block store"
        );
    }
}
