//! Chunk-level delta compression using binary diff
//!
//! This module computes and applies deltas between similar chunks using qbsdiff.
//! Deltas are chunk-level only, with explicit constraints on size and chain depth.

use std::io::Cursor;

use serde::{Deserialize, Serialize};

use crate::error::{LapisError, Result};
use blake3;
use qbsdiff::{Bsdiff, Bspatch};

/// Maximum size of input data for delta computation (256 MB)
const MAX_INPUT_SIZE: u64 = 256 * 1024 * 1024;

/// Maximum delta chain depth before rebase/rejection
const MAX_DELTA_CHAIN_DEPTH: u32 = 5;

/// A binary delta computed between a base chunk and target chunk.
///
/// Stores the compressed diff data and reference information to enable reconstruction
/// of the target from the base chunk.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Delta {
    /// The delta data (binary diff)
    pub data: Vec<u8>,

    /// Hash or ID of the base chunk (for reference tracking)
    pub base_ref: String,

    /// Size of the original base chunk (bytes)
    pub base_size: u64,

    /// Size of the target chunk (bytes)
    pub target_size: u64,

    /// Current depth in delta chain (0 = direct delta, 1+ = delta of delta)
    pub chain_depth: u32,
}

impl Delta {
    /// Validates that this delta is within constraints.
    fn validate(&self) -> Result<()> {
        if self.chain_depth > MAX_DELTA_CHAIN_DEPTH {
            return Err(LapisError::Chunking(format!(
                "Delta chain depth {} exceeds maximum {}",
                self.chain_depth, MAX_DELTA_CHAIN_DEPTH
            )));
        }

        if self.data.len() as u64 > MAX_INPUT_SIZE {
            return Err(LapisError::Chunking(
                "Delta data exceeds 256MB limit".to_string(),
            ));
        }

        Ok(())
    }
}

/// Computes a binary delta between base and target chunks.
///
/// # Arguments
/// * `base` - The base chunk data
/// * `target` - The target chunk data
///
/// # Errors
/// Returns error if either input exceeds 256MB or chain depth would exceed limit.
pub fn compute_delta(base: &[u8], target: &[u8]) -> Result<Delta> {
    if base.len() as u64 > MAX_INPUT_SIZE {
        return Err(LapisError::Chunking(format!(
            "Base chunk {} bytes exceeds 256MB limit",
            base.len()
        )));
    }

    if target.len() as u64 > MAX_INPUT_SIZE {
        return Err(LapisError::Chunking(format!(
            "Target chunk {} bytes exceeds 256MB limit",
            target.len()
        )));
    }

    let base_ref = hex::encode(blake3::hash(base).as_bytes());

    let mut delta_data = Vec::new();
    Bsdiff::new(base)
        .compare(target, Cursor::new(&mut delta_data))
        .map_err(|e| LapisError::Chunking(format!("Delta computation failed: {}", e)))?;

    let delta = Delta {
        data: delta_data,
        base_ref,
        base_size: base.len() as u64,
        target_size: target.len() as u64,
        chain_depth: 0,
    };

    delta.validate()?;
    Ok(delta)
}

/// Applies a delta to a base chunk to reconstruct the target.
///
/// # Arguments
/// * `base` - The base chunk data
/// * `delta` - The delta to apply
///
/// # Errors
/// Returns error if delta is invalid, base size mismatches, or result exceeds 256MB.
pub fn apply_delta(base: &[u8], delta: &Delta) -> Result<Vec<u8>> {
    delta.validate()?;

    if base.len() as u64 != delta.base_size {
        return Err(LapisError::Chunking(format!(
            "Base size mismatch: expected {}, got {}",
            delta.base_size,
            base.len()
        )));
    }

    let patcher = Bspatch::new(&delta.data)
        .map_err(|e| LapisError::Chunking(format!("Invalid delta patch: {}", e)))?;

    let mut target = Vec::new();
    patcher
        .apply(base, Cursor::new(&mut target))
        .map_err(|e| LapisError::Chunking(format!("Delta application failed: {}", e)))?;

    if target.len() as u64 != delta.target_size {
        return Err(LapisError::Chunking(format!(
            "Target size mismatch: expected {}, got {}",
            delta.target_size,
            target.len()
        )));
    }

    if target.len() as u64 > MAX_INPUT_SIZE {
        return Err(LapisError::Chunking(format!(
            "Reconstructed chunk {} bytes exceeds 256MB limit",
            target.len()
        )));
    }

    Ok(target)
}

/// Creates a new delta by chaining two deltas.
///
/// When applying multiple deltas in sequence would exceed depth limit,
/// this attempts to compose them into a single delta. For now, rejects
/// if depth would exceed max.
///
/// # Arguments
/// * `base` - Original base chunk
/// * `delta1` - First delta (base -> intermediate)
/// * `delta2` - Second delta (intermediate -> final)
///
/// # Errors
/// Returns error if chain depth would exceed maximum.
pub fn chain_deltas(base: &[u8], delta1: &Delta, delta2: &Delta) -> Result<Delta> {
    let intermediate = apply_delta(base, delta1)?;
    let final_target = apply_delta(&intermediate, delta2)?;

    let mut new_delta_data = Vec::new();
    Bsdiff::new(base)
        .compare(&final_target, Cursor::new(&mut new_delta_data))
        .map_err(|e| LapisError::Chunking(format!("Delta chaining failed: {}", e)))?;

    let new_depth = std::cmp::max(delta1.chain_depth, delta2.chain_depth) + 1;

    if new_depth > MAX_DELTA_CHAIN_DEPTH {
        return Err(LapisError::Chunking(format!(
            "Delta chain would exceed max depth (would be {})",
            new_depth
        )));
    }

    let delta = Delta {
        data: new_delta_data,
        base_ref: delta1.base_ref.clone(),
        base_size: base.len() as u64,
        target_size: final_target.len() as u64,
        chain_depth: new_depth,
    };

    delta.validate()?;
    Ok(delta)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_delta_simple() {
        let base = b"hello world";
        let target = b"hello world!";

        let delta = compute_delta(base, target).expect("compute_delta failed");

        assert_eq!(delta.base_size, base.len() as u64);
        assert_eq!(delta.target_size, target.len() as u64);
        assert_eq!(delta.chain_depth, 0);
        assert!(!delta.data.is_empty());
        assert!(!delta.base_ref.is_empty());
    }

    #[test]
    fn test_apply_delta() {
        let base = b"hello world";
        let target = b"hello world!";

        let delta = compute_delta(base, target).expect("compute_delta failed");
        let reconstructed = apply_delta(base, &delta).expect("apply_delta failed");

        assert_eq!(reconstructed, target);
    }

    #[test]
    fn test_reject_oversized_base() {
        let oversized = vec![0u8; (MAX_INPUT_SIZE + 1) as usize];
        let target = b"target";

        let result = compute_delta(&oversized, target);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("256MB"));
    }

    #[test]
    fn test_reject_oversized_target() {
        let base = b"base";
        let oversized = vec![0u8; (MAX_INPUT_SIZE + 1) as usize];

        let result = compute_delta(base, &oversized);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("256MB"));
    }

    #[test]
    fn test_base_size_mismatch() {
        let base = b"hello";
        let target = b"world";

        let mut delta = compute_delta(base, target).expect("compute_delta failed");
        delta.base_size = 999;

        let result = apply_delta(base, &delta);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Base size mismatch"));
    }

    #[test]
    fn test_target_size_validation() {
        let base = b"hello";
        let target = b"world";

        let mut delta = compute_delta(base, target).expect("compute_delta failed");
        delta.target_size = 999;

        let result = apply_delta(base, &delta);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Target size mismatch"));
    }

    #[test]
    fn test_chain_depth_limit() {
        let base = vec![1u8; 100];
        let target1 = vec![2u8; 100];
        let target2 = vec![3u8; 100];

        let delta1 = compute_delta(&base, &target1).expect("compute_delta delta1 failed");

        let mut deep_delta = delta1.clone();
        deep_delta.chain_depth = MAX_DELTA_CHAIN_DEPTH;

        let delta2 = compute_delta(&target1, &target2).expect("compute_delta delta2 failed");

        let result = chain_deltas(&base, &deep_delta, &delta2);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("exceed max depth"));
    }

    #[test]
    fn test_delta_validation() {
        let mut delta = Delta {
            data: vec![1, 2, 3],
            base_ref: "hash".to_string(),
            base_size: 10,
            target_size: 10,
            chain_depth: MAX_DELTA_CHAIN_DEPTH + 1,
        };

        let result = delta.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("chain depth"));

        delta.chain_depth = MAX_DELTA_CHAIN_DEPTH;
        assert!(delta.validate().is_ok());
    }

    #[test]
    fn test_identical_chunks() {
        let data = b"identical content";

        let delta = compute_delta(data, data).expect("compute_delta failed");
        let reconstructed = apply_delta(data, &delta).expect("apply_delta failed");

        assert_eq!(reconstructed, data);
        assert!(!delta.data.is_empty());
    }

    #[test]
    fn test_large_similar_chunks() {
        let base = vec![42u8; 1_000_000];
        let mut target = base.clone();

        for i in 0..100 {
            target[i] = 99;
        }

        let delta = compute_delta(&base, &target).expect("compute_delta failed");
        let reconstructed = apply_delta(&base, &delta).expect("apply_delta failed");

        assert_eq!(reconstructed, target);
        assert!(delta.data.len() < target.len() / 2);
    }
}
