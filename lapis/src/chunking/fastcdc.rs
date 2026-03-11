use std::fs::File;
use std::io::Read;
use std::path::Path;

use super::config;
use crate::crypto::blake3;
use crate::error::Result;

/// Represents a single chunk of a file with metadata
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Chunk {
    /// Offset of this chunk within the file (bytes from start)
    pub offset: u64,

    /// Size of this chunk in bytes
    pub length: u32,

    /// BLAKE3 hash of this chunk's content (32 bytes)
    pub hash: [u8; 32],
}

impl Chunk {
    /// Create a new chunk with the given metadata
    pub fn new(offset: u64, length: u32, hash: [u8; 32]) -> Self {
        Chunk {
            offset,
            length,
            hash,
        }
    }
}

/// Chunk a file using FastCDC (Content-Defined Chunking) algorithm
///
/// Reads a file and produces a list of content-addressed chunks.
/// Uses streaming to avoid loading the entire file into memory.
///
/// # Errors
/// Returns an error if the file cannot be read or chunked.
pub fn chunk_file(path: impl AsRef<Path>) -> Result<Vec<Chunk>> {
    let file = File::open(path)?;
    chunk_stream(file)
}

/// Chunk file content from a reader using FastCDC
///
/// Similar to `chunk_file` but works with any reader interface.
/// Useful for testing or streaming from network sources.
///
/// # Errors
/// Returns an error if the reader cannot be read or chunked.
pub fn chunk_stream<R: Read>(reader: R) -> Result<Vec<Chunk>> {
    let mut chunks = Vec::new();

    let chunker = fastcdc::v2020::StreamCDC::new(
        reader,
        config::MIN_CHUNK_SIZE,
        config::AVG_CHUNK_SIZE,
        config::MAX_CHUNK_SIZE,
    );

    let mut offset = 0u64;

    for chunk_result in chunker {
        let chunk_data = chunk_result
            .map_err(|e| crate::error::LapisError::Chunking(format!("FastCDC error: {}", e)))?;

        let chunk_len = chunk_data.length as u32;
        let chunk_hash = blake3::hash_bytes(&chunk_data.data);

        chunks.push(Chunk::new(offset, chunk_len, chunk_hash));
        offset += chunk_len as u64;
    }

    Ok(chunks)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Seek, SeekFrom};

    /// Test that chunking is deterministic: same file produces same chunks
    #[test]
    fn test_deterministic_chunking() {
        let test_data = vec![42u8; 1024 * 1024]; // 1MB file

        let chunks1 =
            chunk_stream(Cursor::new(&test_data)).expect("first chunk_stream should succeed");
        let chunks2 =
            chunk_stream(Cursor::new(&test_data)).expect("second chunk_stream should succeed");

        assert_eq!(
            chunks1, chunks2,
            "Chunking same content twice should produce identical chunks"
        );
    }

    /// Test that chunk boundaries are deterministic for varied data
    #[test]
    fn test_deterministic_with_varied_data() {
        let mut test_data = Vec::new();
        for i in 0..100000 {
            test_data.push((i % 256) as u8);
        }

        let chunks1 =
            chunk_stream(Cursor::new(&test_data)).expect("first chunk_stream should succeed");
        let chunks2 =
            chunk_stream(Cursor::new(&test_data)).expect("second chunk_stream should succeed");

        assert_eq!(
            chunks1.len(),
            chunks2.len(),
            "Same data should produce same number of chunks"
        );

        for (c1, c2) in chunks1.iter().zip(chunks2.iter()) {
            assert_eq!(c1.offset, c2.offset, "Chunk offsets should match");
            assert_eq!(c1.length, c2.length, "Chunk lengths should match");
            assert_eq!(c1.hash, c2.hash, "Chunk hashes should match");
        }
    }

    /// Test that reconstruction: concatenated chunks equal original file
    #[test]
    fn test_chunk_reconstruction() {
        let test_data = vec![123u8; 512 * 1024]; // 512KB test file

        let chunks = chunk_stream(Cursor::new(&test_data)).expect("chunk_stream should succeed");

        let mut reconstructed = Vec::new();
        for chunk in &chunks {
            // Verify each chunk's hash
            let mut file = Cursor::new(&test_data);
            file.seek(SeekFrom::Start(chunk.offset))
                .expect("seek should succeed");

            let mut chunk_data = vec![0u8; chunk.length as usize];
            file.read_exact(&mut chunk_data)
                .expect("read should succeed");

            let computed_hash = blake3::hash_bytes(&chunk_data);
            assert_eq!(
                computed_hash, chunk.hash,
                "Chunk hash should match stored hash"
            );

            reconstructed.extend_from_slice(&chunk_data);
        }

        assert_eq!(
            reconstructed, test_data,
            "Reconstructed data should equal original"
        );
    }

    /// Test chunk size distribution falls within expected ranges
    #[test]
    fn test_chunk_size_distribution() {
        // Create varied data to test chunking behavior
        let mut test_data = Vec::new();
        for i in 0u64..2000000 {
            test_data.push((i.wrapping_mul(37) % 256) as u8);
        }

        let chunks = chunk_stream(Cursor::new(&test_data)).expect("chunk_stream should succeed");

        assert!(chunks.len() > 0, "Should produce at least one chunk");

        // Check size distribution
        let mut sizes: Vec<u32> = chunks.iter().map(|c| c.length).collect();
        sizes.sort();

        let avg_size: u64 = sizes.iter().map(|s| *s as u64).sum::<u64>() / sizes.len() as u64;
        let min_size = sizes.iter().min().copied().unwrap_or(0);
        let max_size = sizes.iter().max().copied().unwrap_or(0);

        // Verify chunks are within configured bounds (or close)
        // Allow some flexibility for the final chunk
        assert!(
            min_size >= (config::MIN_CHUNK_SIZE / 2),
            "Minimum chunk size {} should be at least half the configured minimum {}",
            min_size,
            config::MIN_CHUNK_SIZE
        );

        assert!(
            max_size <= (config::MAX_CHUNK_SIZE * 2),
            "Maximum chunk size {} should be at most 2x the configured maximum {}",
            max_size,
            config::MAX_CHUNK_SIZE
        );

        // Average should be reasonably close to configured avg (within 5x for flexibility)
        let expected_avg = config::AVG_CHUNK_SIZE as u64;
        let ratio = avg_size as f64 / expected_avg as f64;
        assert!(
            ratio > 0.2 && ratio < 10.0,
            "Average chunk size {} should be a reasonable multiple of configured {} (ratio: {:.2})",
            avg_size,
            expected_avg,
            ratio
        );
    }

    /// Test with empty input
    #[test]
    fn test_empty_input() {
        let test_data = Vec::new();
        let chunks = chunk_stream(Cursor::new(&test_data))
            .expect("chunk_stream on empty input should succeed");

        assert_eq!(chunks.len(), 0, "Empty input should produce zero chunks");
    }

    /// Test with tiny input (smaller than min chunk size)
    #[test]
    fn test_tiny_input() {
        let test_data = vec![42u8; 1024]; // 1KB (much smaller than min chunk size)
        let chunks = chunk_stream(Cursor::new(&test_data))
            .expect("chunk_stream on tiny input should succeed");

        assert_eq!(chunks.len(), 1, "Tiny input should produce one chunk");

        assert_eq!(chunks[0].offset, 0, "Single chunk should start at offset 0");

        assert_eq!(
            chunks[0].length, 1024,
            "Single chunk should have correct length"
        );

        // Verify hash
        let expected_hash = blake3::hash_bytes(&test_data);
        assert_eq!(
            chunks[0].hash, expected_hash,
            "Chunk hash should match data hash"
        );
    }

    /// Test that different data produces different chunks
    #[test]
    fn test_different_data_different_chunks() {
        let data1 = vec![1u8; 100000];
        let data2 = vec![2u8; 100000];

        let chunks1 = chunk_stream(Cursor::new(&data1)).expect("first chunk_stream should succeed");
        let chunks2 =
            chunk_stream(Cursor::new(&data2)).expect("second chunk_stream should succeed");

        // At least one chunk should differ (hashes will differ)
        let all_match = chunks1
            .iter()
            .zip(chunks2.iter())
            .all(|(c1, c2)| c1.hash == c2.hash);

        assert!(
            !all_match,
            "Different data should produce chunks with different hashes"
        );
    }
}
