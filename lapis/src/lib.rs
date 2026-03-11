//! Lapis: A block-level version control system for large binary files
//!
//! This library provides content-addressed storage, chunking, and VCS operations
//! for managing large binary files with cross-repo deduplication.

pub mod chunking;
pub mod crypto;
pub mod error;
pub mod fuse;
pub mod index;
pub mod repo;
pub mod server;
pub mod store;
pub mod transfer;
pub mod vcs;

pub use chunking::{apply_delta, chunk_file, chunk_stream, compute_delta, Chunk, Delta};
pub use error::{LapisError, Result};
pub use fuse::LapisFs;
pub use index::{MetadataStore, SimilarityIndex};
pub use repo::Repository;
pub use server::CheckBlocksRequest;
pub use store::CasStore;
pub use transfer::TransferJournal;
pub use vcs::{Commit, Manifest};
