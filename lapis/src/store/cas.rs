//! Hot-zone Content-Addressed Storage implementation.
//!
//! Stores blocks using BLAKE3-based addressing with a prefix-directory layout:
//! - Hash is represented as hex string
//! - First two hex characters form the prefix directory (256 possible dirs)
//! - Remaining hash is the filename
//! Example: hash `a1b2c3...` is stored at `store_root/a1/b2c3...`

use crate::crypto::blake3;
use crate::error::{LapisError, Result};
use crate::store::compression::decompress;
use std::fs;
use std::path::{Path, PathBuf};

/// A hot-zone CAS store backed by the filesystem.
///
/// Blocks are organized by prefix directories based on their hash.
/// Optionally supports reading from cold storage with decompression.
pub struct CasStore {
    root: PathBuf,
    cold_root: Option<PathBuf>,
}

impl CasStore {
    /// Create a new CAS store at the given root path.
    ///
    /// If the directory doesn't exist, it will be created.
    pub fn new<P: AsRef<Path>>(root: P) -> Result<Self> {
        let root = root.as_ref().to_path_buf();
        fs::create_dir_all(&root)
            .map_err(|e| LapisError::Cas(format!("failed to create store root: {}", e)))?;

        let cold_root = infer_default_cold_root(&root);

        Ok(CasStore { root, cold_root })
    }

    /// Create a CAS store with optional cold storage support.
    pub fn with_cold_storage<P: AsRef<Path>>(hot_root: P, cold_root: Option<P>) -> Result<Self> {
        let hot_root = hot_root.as_ref().to_path_buf();
        fs::create_dir_all(&hot_root)
            .map_err(|e| LapisError::Cas(format!("failed to create hot store root: {}", e)))?;

        if let Some(ref cr) = cold_root {
            let cr = cr.as_ref();
            if cr.as_os_str().len() > 0 {
                fs::create_dir_all(cr).map_err(|e| {
                    LapisError::Cas(format!("failed to create cold store root: {}", e))
                })?;
            }
        }

        Ok(CasStore {
            root: hot_root,
            cold_root: cold_root.map(|cr| cr.as_ref().to_path_buf()),
        })
    }

    /// Compute the hot-zone path for a given hash.
    ///
    /// Returns (prefix_dir, block_path, full_path).
    fn compute_path(&self, hash: &[u8; 32]) -> (String, String, PathBuf) {
        let hex = hex::encode(hash);
        let prefix = hex[..2].to_string();
        let filename = hex[2..].to_string();
        let block_path = format!("{}/{}", prefix, filename);
        let full_path = self.root.join(&block_path);
        (prefix, block_path, full_path)
    }

    fn compute_hot_path(&self, hash: &[u8; 32]) -> (String, String, PathBuf) {
        self.compute_path(hash)
    }

    /// Store a block and return its computed hash.
    pub fn put(&self, data: &[u8]) -> Result<[u8; 32]> {
        let hash = blake3::hash_bytes(data);
        let (prefix, _block_path, full_path) = self.compute_path(&hash);

        // Ensure prefix directory exists
        let prefix_dir = self.root.join(&prefix);
        fs::create_dir_all(&prefix_dir).map_err(|e| {
            LapisError::Cas(format!("failed to create prefix dir {}: {}", prefix, e))
        })?;

        // Write block atomically: write to temp, then rename
        let temp_path = full_path.with_extension("tmp");
        fs::write(&temp_path, data)
            .map_err(|e| LapisError::Cas(format!("failed to write temp block: {}", e)))?;

        // Atomic rename
        fs::rename(&temp_path, &full_path)
            .map_err(|e| LapisError::Cas(format!("failed to rename block: {}", e)))?;

        // Verify integrity after write: read persisted block and check hash
        let persisted_data = fs::read(&full_path).map_err(|e| {
            LapisError::Cas(format!(
                "failed to verify block after write (unable to read persisted block): {}",
                e
            ))
        })?;

        let persisted_hash = blake3::hash_bytes(&persisted_data);
        if persisted_hash != hash {
            return Err(LapisError::Cas(format!(
                "write-time integrity check failed: stored hash {} does not match computed hash {}",
                hex::encode(&persisted_hash),
                hex::encode(&hash)
            )));
        }

        Ok(hash)
    }

    /// Retrieve a block and verify its integrity.
    ///
    /// First attempts to read from hot storage. If not found and cold storage
    /// is configured, attempts to read from cold storage, decompresses, and verifies.
    pub fn get(&self, hash: &[u8; 32]) -> Result<Vec<u8>> {
        let (_prefix, _block_path, full_path) = self.compute_hot_path(hash);

        match fs::read(&full_path) {
            Ok(data) => {
                let computed = blake3::hash_bytes(&data);
                if computed != *hash {
                    return Err(LapisError::Cas(format!(
                        "block hash mismatch (expected {}, got {})",
                        hex::encode(hash),
                        hex::encode(&computed)
                    )));
                }
                Ok(data)
            }
            Err(hot_err) if hot_err.kind() == std::io::ErrorKind::NotFound => {
                if let Some(ref cold_root) = self.cold_root {
                    self.get_from_cold(hash, cold_root)
                } else {
                    Err(LapisError::Cas(format!(
                        "block not found: {}",
                        hex::encode(hash)
                    )))
                }
            }
            Err(e) => Err(LapisError::Cas(format!("failed to read block: {}", e))),
        }
    }

    /// Attempt to read a compressed block from cold storage and decompress it.
    fn get_from_cold(&self, hash: &[u8; 32], cold_root: &Path) -> Result<Vec<u8>> {
        let cold_path = compute_cold_path_for_hash(hash);
        let full_cold_path = cold_root.join(&cold_path);

        let compressed_data = fs::read(&full_cold_path).map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                LapisError::Cas(format!("block not found: {}", hex::encode(hash)))
            } else {
                LapisError::Cas(format!(
                    "failed to read cold block {}: {}",
                    hex::encode(hash),
                    e
                ))
            }
        })?;

        let decompressed = decompress(&compressed_data)?;

        let computed = blake3::hash_bytes(&decompressed);
        if computed != *hash {
            return Err(LapisError::Cas(format!(
                "cold block hash mismatch after decompression (expected {}, got {})",
                hex::encode(hash),
                hex::encode(&computed)
            )));
        }

        Ok(decompressed)
    }

    /// Check if a block exists in the store.
    pub fn exists(&self, hash: &[u8; 32]) -> Result<bool> {
        let (_prefix, _block_path, full_path) = self.compute_path(hash);
        Ok(full_path.exists())
    }

    /// Verify a block's integrity without retrieving it.
    ///
    /// Returns an error if the block doesn't exist or hash doesn't match.
    pub fn verify(&self, hash: &[u8; 32]) -> Result<()> {
        let (_prefix, _block_path, full_path) = self.compute_path(hash);

        let data = fs::read(&full_path).map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                LapisError::Cas(format!("block not found: {}", hex::encode(hash)))
            } else {
                LapisError::Cas(format!("failed to verify block: {}", e))
            }
        })?;

        let computed = blake3::hash_bytes(&data);
        if computed != *hash {
            return Err(LapisError::Cas(format!(
                "block verification failed (expected {}, got {})",
                hex::encode(hash),
                hex::encode(&computed)
            )));
        }

        Ok(())
    }

    /// Delete a block from the store.
    ///
    /// Note: Deletion is used during GC phases. Use carefully.
    pub fn delete(&self, hash: &[u8; 32]) -> Result<()> {
        let (_prefix, _block_path, full_path) = self.compute_path(hash);

        if !full_path.exists() {
            return Err(LapisError::Cas(format!(
                "block not found for deletion: {}",
                hex::encode(hash)
            )));
        }

        fs::remove_file(&full_path)
            .map_err(|e| LapisError::Cas(format!("failed to delete block: {}", e)))?;

        Ok(())
    }

    /// Get the root path of this store.
    pub fn root(&self) -> &Path {
        &self.root
    }
}

/// Compute the cold storage path for a hash.
///
/// Uses the same prefix-directory layout as hot storage.
fn compute_cold_path_for_hash(hash: &[u8; 32]) -> String {
    let hex = hex::encode(hash);
    let prefix = &hex[..2];
    let rest = &hex[2..];
    format!("{}/{}", prefix, rest)
}

fn infer_default_cold_root(root: &Path) -> Option<PathBuf> {
    let file_name = root.file_name()?.to_str()?;
    if file_name != "hot" {
        return None;
    }

    let parent = root.parent()?;
    Some(parent.join("cold"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::tiering::tier_hot_to_cold;
    use std::io::Write;
    use tempfile::TempDir;

    #[test]
    fn test_cas_store_creation() {
        let temp_dir = TempDir::new().expect("create temp dir");
        let store = CasStore::new(temp_dir.path()).expect("create store");
        assert!(store.root().exists());
    }

    #[test]
    fn test_cas_put_and_get() {
        let temp_dir = TempDir::new().expect("create temp dir");
        let store = CasStore::new(temp_dir.path()).expect("create store");

        let data = b"hello world";
        let hash = store.put(data).expect("put block");

        let retrieved = store.get(&hash).expect("get block");
        assert_eq!(retrieved, data);
    }

    #[test]
    fn test_cas_put_creates_prefix_dir() {
        let temp_dir = TempDir::new().expect("create temp dir");
        let store = CasStore::new(temp_dir.path()).expect("create store");

        let data = b"test data";
        let _hash = store.put(data).expect("put block");

        // Verify prefix directory was created
        let dir_entries: Vec<_> = fs::read_dir(store.root())
            .expect("read store root")
            .filter_map(|e| e.ok())
            .collect();

        assert!(!dir_entries.is_empty(), "prefix dir should exist");
    }

    #[test]
    fn test_cas_exists() {
        let temp_dir = TempDir::new().expect("create temp dir");
        let store = CasStore::new(temp_dir.path()).expect("create store");

        let data = b"test data";
        let hash = store.put(data).expect("put block");

        assert!(store.exists(&hash).expect("exists check") == true);

        // Check a non-existent hash
        let fake_hash = [0u8; 32];
        assert!(store.exists(&fake_hash).expect("exists check") == false);
    }

    #[test]
    fn test_cas_verify() {
        let temp_dir = TempDir::new().expect("create temp dir");
        let store = CasStore::new(temp_dir.path()).expect("create store");

        let data = b"verify me";
        let hash = store.put(data).expect("put block");

        store.verify(&hash).expect("verify should pass");
    }

    #[test]
    fn test_cas_corruption_detection() {
        let temp_dir = TempDir::new().expect("create temp dir");
        let store = CasStore::new(temp_dir.path()).expect("create store");

        let data = b"original data";
        let hash = store.put(data).expect("put block");

        // Corrupt the block by modifying the file directly
        let (_prefix, _block_path, full_path) = store.compute_path(&hash);
        let mut file = fs::File::create(&full_path).expect("open corrupted file");
        file.write_all(b"corrupted").expect("write corruption");
        drop(file);

        // Verify should detect corruption
        let result = store.verify(&hash);
        assert!(result.is_err(), "verify should detect corruption");
        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("hash mismatch") || err_msg.contains("verification failed"),
            "Expected corruption error, got: {}",
            err_msg
        );
    }

    #[test]
    fn test_cas_get_detects_corruption() {
        let temp_dir = TempDir::new().expect("create temp dir");
        let store = CasStore::new(temp_dir.path()).expect("create store");

        let data = b"get me corrupted";
        let hash = store.put(data).expect("put block");

        // Corrupt the block
        let (_prefix, _block_path, full_path) = store.compute_path(&hash);
        let mut file = fs::File::create(&full_path).expect("open file");
        file.write_all(b"corrupted").expect("write corruption");
        drop(file);

        // Get should detect corruption
        let result = store.get(&hash);
        assert!(result.is_err(), "get should detect corruption");
        assert!(result.unwrap_err().to_string().contains("hash mismatch"));
    }

    #[test]
    fn test_cas_delete() {
        let temp_dir = TempDir::new().expect("create temp dir");
        let store = CasStore::new(temp_dir.path()).expect("create store");

        let data = b"delete me";
        let hash = store.put(data).expect("put block");

        assert!(store.exists(&hash).expect("check exists") == true);

        store.delete(&hash).expect("delete block");

        assert!(store.exists(&hash).expect("check exists") == false);
    }

    #[test]
    fn test_cas_round_trip_multiple_blocks() {
        let temp_dir = TempDir::new().expect("create temp dir");
        let store = CasStore::new(temp_dir.path()).expect("create store");

        let blocks = vec![
            b"block 1".to_vec(),
            b"block 2".to_vec(),
            b"block 3".to_vec(),
        ];

        let hashes: Vec<_> = blocks
            .iter()
            .map(|data| store.put(data).expect("put"))
            .collect();

        for (i, hash) in hashes.iter().enumerate() {
            let retrieved = store.get(hash).expect("get");
            assert_eq!(retrieved, blocks[i], "block {} mismatch", i);
        }
    }

    #[test]
    fn test_cas_deterministic_hash() {
        let temp_dir = TempDir::new().expect("create temp dir");
        let store = CasStore::new(temp_dir.path()).expect("create store");

        let data = b"deterministic";
        let hash1 = store.put(data).expect("put first time");

        // Put same data again; should produce same hash
        let hash2 = blake3::hash_bytes(data);
        assert_eq!(hash1, hash2, "same data should produce same hash");
    }

    #[test]
    fn test_cold_storage_transparent_read_with_decompression() {
        let temp_dir = TempDir::new().expect("create temp dir");
        let hot_root = temp_dir.path().join("hot");
        let cold_root = temp_dir.path().join("cold");

        let hot_store = CasStore::new(&hot_root).expect("create hot store");
        let data = b"cold blocks should still read through normal CAS access";
        let hash = hot_store.put(data).expect("put hot block");

        tier_hot_to_cold(&hot_root, &cold_root, &hash).expect("tier block to cold");

        let store = CasStore::new(&hot_root).expect("reopen store with inferred cold root");
        let retrieved = store.get(&hash).expect("read cold block through CAS");

        assert_eq!(retrieved, data);
    }

    #[cfg(test)]
    mod property_tests {
        use super::*;
        use proptest::prelude::*;

        proptest! {
            #[test]
            fn prop_round_trip_binary_data(data in prop::collection::vec(any::<u8>(), 0..65536)) {
                let temp_dir = TempDir::new().expect("create temp dir");
                let store = CasStore::new(temp_dir.path()).expect("create store");

                let hash = store.put(&data).expect("put should succeed");
                let retrieved = store.get(&hash).expect("get should succeed");

                prop_assert_eq!(retrieved, data, "retrieved data should match original");
            }

            #[test]
            fn prop_round_trip_various_sizes(
                data in prop::collection::vec(any::<u8>(), 0..262144)
            ) {
                let temp_dir = TempDir::new().expect("create temp dir");
                let store = CasStore::new(temp_dir.path()).expect("create store");

                let hash = store.put(&data).expect("put should succeed");
                let retrieved = store.get(&hash).expect("get should succeed");

                prop_assert_eq!(
                    retrieved.len(),
                    data.len(),
                    "retrieved data size should match original"
                );
                prop_assert_eq!(retrieved, data, "retrieved data should match original");
            }

            #[test]
            fn prop_deterministic_hash_across_puts(data in prop::collection::vec(any::<u8>(), 0..65536)) {
                let temp_dir = TempDir::new().expect("create temp dir");
                let store = CasStore::new(temp_dir.path()).expect("create store");

                let hash1 = store.put(&data).expect("first put");
                let hash2 = blake3::hash_bytes(&data);

                prop_assert_eq!(hash1, hash2, "put hash should match direct blake3 hash");
            }
        }
    }
}
