//! Transfer journal for resumable uploads
//!
//! Persists transfer state (upload_id, total_blocks, uploaded hashes, started_at)
//! in a deterministic JSON format under `.lapis/transfer/`.
//!
//! Writes are crash-safe: temp file + fsync + atomic rename.

use crate::error::{LapisError, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::fs;
use std::io::Write;
use std::path::Path;

/// Persists transfer state for resumable uploads
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferJournal {
    /// Unique identifier for this upload session
    pub upload_id: String,
    /// Total number of blocks expected
    pub total_blocks: u64,
    /// Set of block hashes already uploaded (deterministic for JSON)
    #[serde(with = "serde_btreeset")]
    pub uploaded_hashes: BTreeSet<String>,
    /// When the transfer started (ISO 8601 string format)
    #[serde(with = "chrono::serde::ts_seconds")]
    pub started_at: DateTime<Utc>,
}

mod serde_btreeset {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};
    use std::collections::BTreeSet;

    pub fn serialize<S>(set: &BTreeSet<String>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let v: Vec<&String> = set.iter().collect();
        v.serialize(serializer)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<BTreeSet<String>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let v: Vec<String> = Vec::deserialize(deserializer)?;
        Ok(v.into_iter().collect())
    }
}

impl TransferJournal {
    /// Create a new transfer journal
    pub fn new(upload_id: String, total_blocks: u64) -> Self {
        Self {
            upload_id,
            total_blocks,
            uploaded_hashes: BTreeSet::new(),
            started_at: Utc::now(),
        }
    }

    /// Save journal atomically to a file
    ///
    /// Uses temp file + fsync + rename pattern to ensure crash-safety.
    /// The caller is responsible for ensuring the parent directory exists.
    pub fn save(&self, path: impl AsRef<Path>) -> Result<()> {
        let path = path.as_ref();

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            if parent.as_os_str().len() > 0 {
                fs::create_dir_all(parent).map_err(|e| {
                    LapisError::Metadata(format!(
                        "Failed to create transfer journal parent directory: {}",
                        e
                    ))
                })?;
            }
        }

        // Serialize to JSON
        let json = serde_json::to_string_pretty(self).map_err(|e| {
            LapisError::Metadata(format!("Failed to serialize transfer journal: {}", e))
        })?;

        // Write to temp file
        let temp_path = path.with_file_name(
            path.file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string()
                + ".tmp",
        );

        let mut file = fs::File::create(&temp_path).map_err(|e| {
            LapisError::Metadata(format!(
                "Failed to create temp transfer journal file: {}",
                e
            ))
        })?;

        file.write_all(json.as_bytes()).map_err(|e| {
            LapisError::Metadata(format!("Failed to write transfer journal: {}", e))
        })?;

        file.sync_all().map_err(|e| {
            LapisError::Metadata(format!("Failed to fsync transfer journal: {}", e))
        })?;

        drop(file);

        // Atomic rename
        fs::rename(&temp_path, path).map_err(|e| {
            LapisError::Metadata(format!(
                "Failed to rename transfer journal temp file: {}",
                e
            ))
        })?;

        Ok(())
    }

    /// Load journal from file
    ///
    /// Returns an error if the file does not exist or cannot be parsed.
    pub fn load(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        let content = fs::read_to_string(path)
            .map_err(|e| LapisError::Metadata(format!("Failed to read transfer journal: {}", e)))?;

        serde_json::from_str(&content)
            .map_err(|e| LapisError::Metadata(format!("Failed to parse transfer journal: {}", e)))
    }

    /// Check if a block hash has already been uploaded
    pub fn is_uploaded(&self, hash: &str) -> bool {
        self.uploaded_hashes.contains(hash)
    }

    /// Mark a block hash as uploaded
    pub fn mark_uploaded(&mut self, hash: String) {
        self.uploaded_hashes.insert(hash);
    }

    /// Get hashes that still need to be uploaded
    pub fn needed_hashes(&self, all_hashes: &[String]) -> Vec<String> {
        all_hashes
            .iter()
            .filter(|h| !self.is_uploaded(h))
            .cloned()
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_journal_save_load_roundtrip() {
        let temp_dir = TempDir::new().unwrap();
        let journal_path = temp_dir.path().join("transfer").join("test.json");

        // Create a journal
        let mut journal = TransferJournal::new("upload-123".to_string(), 10);
        journal.mark_uploaded("hash-1".to_string());
        journal.mark_uploaded("hash-2".to_string());

        // Save it
        journal.save(&journal_path).unwrap();

        // Verify file exists
        assert!(
            journal_path.exists(),
            "Journal file should exist after save"
        );

        // Load it back
        let loaded = TransferJournal::load(&journal_path).unwrap();

        // Verify all fields match
        assert_eq!(loaded.upload_id, "upload-123");
        assert_eq!(loaded.total_blocks, 10);
        assert_eq!(loaded.uploaded_hashes.len(), 2);
        assert!(loaded.is_uploaded("hash-1"));
        assert!(loaded.is_uploaded("hash-2"));
        assert!(!loaded.is_uploaded("hash-3"));
    }

    #[test]
    fn test_journal_atomic_write_creates_temp_and_renames() {
        let temp_dir = TempDir::new().unwrap();
        let journal_path = temp_dir.path().join("atomic").join("test.json");

        let journal = TransferJournal::new("upload-456".to_string(), 5);

        // Save journal
        journal.save(&journal_path).unwrap();

        // Check that the target file exists and temp file does not
        assert!(journal_path.exists(), "Target journal file should exist");
        let temp_path = journal_path.with_file_name("test.json.tmp");
        assert!(
            !temp_path.exists(),
            "Temp file should not exist after atomic rename"
        );

        // Verify content is correct
        let loaded = TransferJournal::load(&journal_path).unwrap();
        assert_eq!(loaded.upload_id, "upload-456");
    }

    #[test]
    fn test_journal_needed_hashes_filtering() {
        let journal = {
            let mut j = TransferJournal::new("upload-789".to_string(), 5);
            j.mark_uploaded("hash-a".to_string());
            j.mark_uploaded("hash-c".to_string());
            j
        };

        let all_hashes = vec![
            "hash-a".to_string(),
            "hash-b".to_string(),
            "hash-c".to_string(),
            "hash-d".to_string(),
        ];

        let needed = journal.needed_hashes(&all_hashes);

        assert_eq!(needed.len(), 2);
        assert!(needed.contains(&"hash-b".to_string()));
        assert!(needed.contains(&"hash-d".to_string()));
    }
}
