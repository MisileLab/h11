//! Cryptographic primitives for Lapis VCS
//!
//! This module provides hash functions and cryptographic operations
//! needed for content addressing and data verification.

pub mod blake3;
#[cfg(feature = "signing")]
pub mod sigstore;

pub use blake3::{hash_bytes, hash_file, hash_stream};
