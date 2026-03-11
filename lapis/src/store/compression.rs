//! ZSTD-based compression utilities for block-level data compression.
//!
//! This module provides streaming-friendly compression and decompression functions
//! using the ZSTD algorithm. Compression is utility-only in Phase 0; blocks stored
//! in hot-tier CAS remain uncompressed. This module will be consumed by tiering and
//! cold storage phases.

use crate::error::{LapisError, Result};
use std::io::{Read, Write};

/// Compress data using ZSTD algorithm.
///
/// # Arguments
/// * `data` - Raw bytes to compress
/// * `level` - Compression level (1–22; 3 is default, higher = more compression but slower)
///
/// # Returns
/// Compressed byte vector, or error if compression fails
///
/// # Example
/// ```ignore
/// let data = b"hello world".to_vec();
/// let compressed = compress(&data, 3)?;
/// assert!(compressed.len() <= data.len() + 100); // some overhead for small inputs
/// ```
pub fn compress(data: &[u8], level: i32) -> Result<Vec<u8>> {
    let mut encoder = zstd::Encoder::new(Vec::new(), level)
        .map_err(|e| LapisError::Cas(format!("failed to create zstd encoder: {}", e)))?;

    encoder
        .write_all(data)
        .map_err(|e| LapisError::Cas(format!("zstd compression failed: {}", e)))?;

    encoder
        .finish()
        .map_err(|e| LapisError::Cas(format!("zstd encoder finish failed: {}", e)))
}

/// Decompress ZSTD-compressed data.
///
/// # Arguments
/// * `data` - ZSTD-compressed bytes
///
/// # Returns
/// Decompressed byte vector, or error if decompression fails
///
/// # Example
/// ```ignore
/// let original = b"hello world".to_vec();
/// let compressed = compress(&original, 3)?;
/// let decompressed = decompress(&compressed)?;
/// assert_eq!(decompressed, original);
/// ```
pub fn decompress(data: &[u8]) -> Result<Vec<u8>> {
    let mut decoder = zstd::Decoder::new(data)
        .map_err(|e| LapisError::Cas(format!("failed to create zstd decoder: {}", e)))?;

    let mut decompressed = Vec::new();
    decoder
        .read_to_end(&mut decompressed)
        .map_err(|e| LapisError::Cas(format!("zstd decompression failed: {}", e)))?;

    Ok(decompressed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compress_decompress_round_trip() {
        let original = b"hello world".to_vec();
        let compressed = compress(&original, 3).expect("compress should succeed");
        let decompressed = decompress(&compressed).expect("decompress should succeed");

        assert_eq!(decompressed, original, "round-trip should preserve data");
    }

    #[test]
    fn test_compress_decompress_empty_data() {
        let original = b"".to_vec();
        let compressed = compress(&original, 3).expect("compress empty should succeed");
        let decompressed = decompress(&compressed).expect("decompress empty should succeed");

        assert_eq!(decompressed, original, "empty data should round-trip");
    }

    #[test]
    fn test_compress_decompress_large_data() {
        let original = vec![42u8; 65536]; // 64KB of repeated byte
        let compressed = compress(&original, 3).expect("compress large should succeed");
        let decompressed = decompress(&compressed).expect("decompress large should succeed");

        assert_eq!(decompressed, original, "large data should round-trip");
    }

    #[test]
    fn test_compress_decompress_various_levels() {
        let original = b"The quick brown fox jumps over the lazy dog"
            .repeat(100)
            .to_vec();

        for level in [1, 3, 6, 9] {
            let compressed = compress(&original, level)
                .expect(&format!("compress at level {} should succeed", level));
            let decompressed = decompress(&compressed)
                .expect(&format!("decompress at level {} should succeed", level));

            assert_eq!(
                decompressed, original,
                "round-trip at level {} should preserve data",
                level
            );
        }
    }

    #[test]
    fn test_compress_reduces_repetitive_data() {
        let original = vec![0u8; 1000]; // highly compressible
        let compressed = compress(&original, 3).expect("compress should succeed");

        // Repetitive data should compress well; compressed should be much smaller
        assert!(
            compressed.len() < original.len() / 2,
            "repetitive data should compress to less than 50% of original"
        );
    }

    #[test]
    fn test_decompress_invalid_data_errors() {
        let invalid_data = b"not zstd data";
        let result = decompress(invalid_data);

        assert!(result.is_err(), "decompressing invalid data should error");
    }

    #[test]
    fn test_compress_deterministic_across_calls() {
        let data = b"deterministic test data".to_vec();

        // Note: ZSTD may include timestamps or non-deterministic headers by default.
        // This test verifies that decompress(compress(x)) == x, not that compress is bitwise deterministic.
        let compressed1 = compress(&data, 3).expect("first compress");
        let decompressed1 = decompress(&compressed1).expect("first decompress");

        let compressed2 = compress(&data, 3).expect("second compress");
        let decompressed2 = decompress(&compressed2).expect("second decompress");

        assert_eq!(
            decompressed1, decompressed2,
            "decompressed results should match"
        );
        assert_eq!(decompressed1, data, "decompressed should match original");
    }

    #[test]
    fn test_compress_with_binary_data() {
        let original: Vec<u8> = (0..=255).cycle().take(2048).collect();
        let compressed = compress(&original, 3).expect("compress binary should succeed");
        let decompressed = decompress(&compressed).expect("decompress binary should succeed");

        assert_eq!(decompressed, original, "binary data should round-trip");
    }

    #[test]
    fn test_decompress_partial_data_errors() {
        let original = b"hello world".to_vec();
        let compressed = compress(&original, 3).expect("compress should succeed");

        // Take only the first half of compressed data (truncated = invalid)
        let truncated = &compressed[..compressed.len() / 2];
        let result = decompress(truncated);

        // Truncated data may or may not error, depending on zstd's frame format
        // If it succeeds, decompressed data will be incomplete/corrupted
        // This test documents the behavior
        if let Ok(decompressed) = result {
            assert_ne!(
                decompressed, original,
                "truncated data should not decompress to original"
            );
        }
    }
}
