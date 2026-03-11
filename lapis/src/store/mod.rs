//! Content-Addressed Storage (CAS) module.
//!
//! This module provides the foundational block storage layer for Lapis.
//! It implements a hot-zone layout based on BLAKE3-addressed paths,
//! with integrity verification on reads.

pub mod cas;
pub mod compression;
pub mod tiering;

pub use cas::CasStore;
pub use compression::{compress, decompress};
pub use tiering::{
    tier_cold, tier_hot_to_cold, TierColdResult, TieringResult, COLD_COMPRESSION_ALGO,
};

use crate::error::Result;

/// Core interface for content-addressed storage operations.
///
/// Implementations must:
/// - Store blocks by their BLAKE3 hash
/// - Verify integrity on read (hash mismatch = corruption detected)
/// - Support existence checks and deletion
pub trait BlockStore: Send + Sync {
    /// Store a block with BLAKE3 verification.
    ///
    /// The block is stored in the hot-zone layout (prefix directories).
    /// Returns the computed hash for verification.
    fn put(&self, data: &[u8]) -> Result<[u8; 32]>;

    /// Retrieve a block and verify its integrity.
    ///
    /// Recomputes the hash on read; if mismatch, returns CorruptionError.
    fn get(&self, hash: &[u8; 32]) -> Result<Vec<u8>>;

    /// Check if a block exists in the store.
    fn exists(&self, hash: &[u8; 32]) -> Result<bool>;

    /// Delete a block from the store.
    ///
    /// Note: Deletion is not part of the core CAS API; it's provided
    /// for cleanup during GC phases. Use carefully.
    fn delete(&self, hash: &[u8; 32]) -> Result<()>;

    /// Verify a block's integrity without retrieving it.
    ///
    /// Reads the file and compares hash; returns error if mismatch.
    fn verify(&self, hash: &[u8; 32]) -> Result<()>;
}
