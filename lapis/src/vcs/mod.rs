//! Version control abstractions for Lapis
//!
//! This module provides manifest building and tracking for file snapshots,
//! and commit objects for history tracking.

pub mod commit;
pub mod manifest;
pub mod reflog;

pub use commit::Commit;
pub use manifest::{
    serialize_manifest_from_storage, ChunkingParams, CompositeManifest, Manifest,
    ManifestFileEntry, MULTI_FILE_MANIFEST_PREFIX,
};
pub use reflog::{ReflogEntry, ReflogManager};
