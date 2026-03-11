//! Commit object for version control history
//!
//! A commit represents a snapshot in time with a parent reference, manifest,
//! timestamp, message, and optional signature. Commits are deterministically
//! serializable for content addressing via BLAKE3 hashing.

use crate::{LapisError, Result};
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct CommitPayload {
    parent: Option<[u8; 32]>,
    manifest_hash: [u8; 32],
    timestamp: u64,
    message: String,
}

/// A commit object linking parent commits, manifests, and metadata
///
/// Each commit is uniquely identified by a BLAKE3 hash of its canonical JSON.
/// The hash is deterministic: identical commits always hash to the same value.
/// This enables stable content addressing and history traversal.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Commit {
    /// BLAKE3 hash of this commit's canonical JSON serialization (32 bytes)
    /// Computed by hashing `serialize()` output (which excludes this field).
    /// This ensures the hash is content-addressed and independent of itself.
    #[serde(skip)]
    pub hash: [u8; 32],

    /// Optional BLAKE3 hash of parent commit (32 bytes), or None for initial commit
    pub parent: Option<[u8; 32]>,

    /// BLAKE3 hash of the manifest this commit points to (32 bytes)
    /// The manifest describes the file snapshot at this point in time.
    pub manifest_hash: [u8; 32],

    /// Unix timestamp (seconds since epoch) when commit was created
    pub timestamp: u64,

    /// Commit message provided by user
    pub message: String,

    /// Optional digital signature for commit verification (Phase 1+)
    /// In Phase 0, this field is optional and unused.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<Vec<u8>>,
}

impl Commit {
    /// Create a new commit with optional parent, manifest hash, and message
    ///
    /// Automatically computes the current Unix timestamp and generates
    /// a deterministic BLAKE3 hash of the serialized commit.
    ///
    /// # Arguments
    ///
    /// * `parent` - Optional hash of parent commit (None for initial/root commit)
    /// * `manifest_hash` - BLAKE3 hash of the manifest this commit points to
    /// * `message` - Human-readable commit message
    ///
    /// # Returns
    ///
    /// A new `Commit` with computed hash and current timestamp.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let parent_hash = None; // Initial commit
    /// let manifest_hash = [1u8; 32];
    /// let commit = Commit::create(parent_hash, manifest_hash, "Initial snapshot")?;
    /// assert_eq!(commit.parent, None);
    /// assert_eq!(commit.manifest_hash, manifest_hash);
    /// ```
    pub fn create(
        parent: Option<[u8; 32]>,
        manifest_hash: [u8; 32],
        message: &str,
    ) -> Result<Self> {
        // Get current Unix timestamp
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| LapisError::Commit(format!("Failed to get timestamp: {}", e)))?
            .as_secs();

        // Create commit with placeholder hash (will be computed below)
        let mut commit = Commit {
            hash: [0u8; 32],
            parent,
            manifest_hash,
            timestamp,
            message: message.to_string(),
            signature: None,
        };

        // Compute deterministic hash of this commit
        commit.hash = commit.compute_hash()?;

        Ok(commit)
    }

    /// Serialize commit to canonical JSON bytes
    ///
    /// Uses `serde_json` with default serialization for deterministic output.
    /// The serialized form is stable and suitable for hashing.
    ///
    /// # Returns
    ///
    /// A `Vec<u8>` containing the JSON representation of the commit.
    pub fn serialize(&self) -> Result<Vec<u8>> {
        serde_json::to_vec(self).map_err(|e| LapisError::Commit(e.to_string()))
    }

    pub fn object_bytes(&self) -> Result<Vec<u8>> {
        self.signing_payload()
    }

    pub fn signing_payload(&self) -> Result<Vec<u8>> {
        serde_json::to_vec(&CommitPayload {
            parent: self.parent,
            manifest_hash: self.manifest_hash,
            timestamp: self.timestamp,
            message: self.message.clone(),
        })
        .map_err(|e| LapisError::Commit(e.to_string()))
    }

    /// Deserialize commit from JSON bytes
    ///
    /// Parses a JSON commit and validates its structure.
    ///
    /// # Arguments
    ///
    /// * `data` - Byte slice containing JSON commit data
    ///
    /// # Returns
    ///
    /// A parsed `Commit` or error if deserialization fails.
    pub fn deserialize(data: &[u8]) -> Result<Self> {
        serde_json::from_slice(data).map_err(|e| LapisError::Commit(e.to_string()))
    }

    fn compute_hash(&self) -> Result<[u8; 32]> {
        let serialized = self.signing_payload()?;
        Ok(crate::crypto::hash_bytes(&serialized))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_commit_create_initial() {
        let manifest_hash = [1u8; 32];
        let commit =
            Commit::create(None, manifest_hash, "Initial commit").expect("create should succeed");

        assert_eq!(commit.parent, None);
        assert_eq!(commit.manifest_hash, manifest_hash);
        assert_eq!(commit.message, "Initial commit");
        assert_eq!(commit.signature, None);
        assert_ne!(commit.hash, [0u8; 32], "hash should be non-zero");
    }

    #[test]
    fn test_commit_create_with_parent() {
        let parent_hash = [2u8; 32];
        let manifest_hash = [3u8; 32];
        let commit = Commit::create(Some(parent_hash), manifest_hash, "Follow-up commit")
            .expect("create should succeed");

        assert_eq!(commit.parent, Some(parent_hash));
        assert_eq!(commit.manifest_hash, manifest_hash);
        assert_eq!(commit.message, "Follow-up commit");
        assert_ne!(commit.hash, [0u8; 32], "hash should be non-zero");
    }

    #[test]
    fn test_commit_hash_deterministic() {
        let manifest_hash = [4u8; 32];
        let commit1 =
            Commit::create(None, manifest_hash, "Test message").expect("create 1 should succeed");
        let commit2 =
            Commit::create(None, manifest_hash, "Test message").expect("create 2 should succeed");

        // Both commits have same parent (None), manifest, and message.
        // Their hashes should be identical (deterministic).
        assert_eq!(
            commit1.hash, commit2.hash,
            "Same commits should hash identically"
        );
    }

    #[test]
    fn test_commit_hash_different_for_different_messages() {
        let manifest_hash = [5u8; 32];
        let commit1 =
            Commit::create(None, manifest_hash, "Message 1").expect("create 1 should succeed");
        let commit2 =
            Commit::create(None, manifest_hash, "Message 2").expect("create 2 should succeed");

        assert_ne!(
            commit1.hash, commit2.hash,
            "Different messages should produce different hashes"
        );
    }

    #[test]
    fn test_commit_hash_different_for_different_manifests() {
        let parent = None;
        let manifest1 = [6u8; 32];
        let manifest2 = [7u8; 32];
        let message = "Same message";

        let commit1 = Commit::create(parent, manifest1, message).expect("create 1 should succeed");
        let commit2 = Commit::create(parent, manifest2, message).expect("create 2 should succeed");

        assert_ne!(
            commit1.hash, commit2.hash,
            "Different manifests should produce different hashes"
        );
    }

    #[test]
    fn test_commit_hash_different_for_different_parents() {
        let manifest_hash = [8u8; 32];
        let message = "Same message";

        let commit1 =
            Commit::create(None, manifest_hash, message).expect("create 1 should succeed");
        let commit2 = Commit::create(Some([9u8; 32]), manifest_hash, message)
            .expect("create 2 should succeed");

        assert_ne!(
            commit1.hash, commit2.hash,
            "Different parents should produce different hashes"
        );
    }

    #[test]
    fn test_commit_serialize_deserialize() {
        let manifest_hash = [10u8; 32];
        let commit1 = Commit::create(Some([11u8; 32]), manifest_hash, "Test commit")
            .expect("create should succeed");

        let serialized = commit1.serialize().expect("serialize should succeed");
        let commit2 = Commit::deserialize(&serialized).expect("deserialize should succeed");

        // After deserialization, the hash field is [0u8; 32] (skipped during serialization)
        // because it's not included in the JSON. All other fields should match.
        assert_eq!(commit1.parent, commit2.parent);
        assert_eq!(commit1.manifest_hash, commit2.manifest_hash);
        assert_eq!(commit1.timestamp, commit2.timestamp);
        assert_eq!(commit1.message, commit2.message);
        assert_eq!(commit1.signature, commit2.signature);

        // The hash field is NOT preserved in serialization, so it defaults to [0u8; 32]
        assert_eq!(commit2.hash, [0u8; 32]);
    }

    #[test]
    fn test_commit_serialize_canonical() {
        let manifest_hash = [12u8; 32];
        let commit1 = Commit::create(Some([13u8; 32]), manifest_hash, "Canonical test")
            .expect("create 1 should succeed");
        let commit2 = Commit::create(Some([13u8; 32]), manifest_hash, "Canonical test")
            .expect("create 2 should succeed");

        let bytes1 = commit1.serialize().expect("serialize 1 should succeed");
        let bytes2 = commit2.serialize().expect("serialize 2 should succeed");

        assert_eq!(
            bytes1, bytes2,
            "Identical commits should serialize to identical bytes"
        );
    }

    #[test]
    fn test_commit_empty_message() {
        let manifest_hash = [14u8; 32];
        let commit = Commit::create(None, manifest_hash, "").expect("create should succeed");

        assert_eq!(commit.message, "");
        assert_ne!(
            commit.hash, [0u8; 32],
            "hash should be non-zero even for empty message"
        );
    }

    #[test]
    fn test_commit_long_message() {
        let manifest_hash = [15u8; 32];
        let long_message = "x".repeat(10000);
        let commit =
            Commit::create(None, manifest_hash, &long_message).expect("create should succeed");

        assert_eq!(commit.message, long_message);
        assert_ne!(
            commit.hash, [0u8; 32],
            "hash should be non-zero for long message"
        );
    }

    #[test]
    fn test_commit_signature_field_optional() {
        let manifest_hash = [16u8; 32];
        let commit = Commit::create(None, manifest_hash, "Test").expect("create should succeed");

        assert_eq!(
            commit.signature, None,
            "Signature should be None by default"
        );
    }

    #[test]
    fn test_commit_parent_chain() {
        // Build a simple chain: root → commit1 → commit2
        let manifest_hash_root = [17u8; 32];
        let commit_root =
            Commit::create(None, manifest_hash_root, "Root").expect("root create should succeed");

        let manifest_hash_1 = [18u8; 32];
        let commit_1 = Commit::create(Some(commit_root.hash), manifest_hash_1, "Commit 1")
            .expect("commit 1 create should succeed");

        let manifest_hash_2 = [19u8; 32];
        let commit_2 = Commit::create(Some(commit_1.hash), manifest_hash_2, "Commit 2")
            .expect("commit 2 create should succeed");

        assert_eq!(commit_2.parent, Some(commit_1.hash));
        assert_eq!(commit_1.parent, Some(commit_root.hash));
        assert_eq!(commit_root.parent, None);
    }

    #[test]
    fn test_commit_hash_contract() {
        let manifest_hash = [21u8; 32];
        let commit = Commit::create(Some([22u8; 32]), manifest_hash, "Hash contract test")
            .expect("create should succeed");

        let serialized = commit
            .signing_payload()
            .expect("signing payload should succeed");
        let recomputed_hash = crate::crypto::hash_bytes(&serialized);

        assert_eq!(
            commit.hash, recomputed_hash,
            "Stored hash must equal hash of serialized representation"
        );

        let serialized_commit = commit.serialize().expect("serialize should succeed");
        let json_str = String::from_utf8_lossy(&serialized_commit);
        assert!(
            !json_str.contains("\"hash\""),
            "Serialized JSON must not contain 'hash' field"
        );
    }

    #[test]
    fn test_commit_hash_stable_after_signature_added() {
        let manifest_hash = [23u8; 32];
        let mut commit =
            Commit::create(None, manifest_hash, "Signed commit").expect("create should succeed");
        let original_hash = commit.hash;

        commit.signature = Some(vec![1, 2, 3, 4]);

        let signing_payload = commit
            .signing_payload()
            .expect("signing payload should succeed");
        let recomputed_hash = crate::crypto::hash_bytes(&signing_payload);
        assert_eq!(original_hash, recomputed_hash);
    }
}
