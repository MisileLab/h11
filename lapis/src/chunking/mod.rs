//! Content-defined chunking module using FastCDC
//!
//! This module provides streaming chunking of files using the FastCDC algorithm.
//! Chunks are deterministically identified based on content, enabling deduplication
//! and efficient content-addressed storage.
//!
//! It also provides chunk-level delta compression for efficient storage of similar chunks.

pub mod delta;
pub mod fastcdc;

pub use delta::{apply_delta, compute_delta, Delta};
pub use fastcdc::{chunk_file, chunk_stream, Chunk};

/// Default FastCDC configuration parameters (in bytes)
pub mod config {
    /// Minimum chunk size (64 KB)
    pub const MIN_CHUNK_SIZE: u32 = 64 * 1024;

    /// Average (target) chunk size (256 KB)
    pub const AVG_CHUNK_SIZE: u32 = 256 * 1024;

    /// Maximum chunk size (1 MB)
    pub const MAX_CHUNK_SIZE: u32 = 1024 * 1024;
}
