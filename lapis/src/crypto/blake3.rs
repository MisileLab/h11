use std::fs::File;
use std::io::{self, Read};
use std::path::Path;

/// Hash a byte slice using BLAKE3
///
/// Returns a 32-byte BLAKE3 hash.
pub fn hash_bytes(data: &[u8]) -> [u8; 32] {
    blake3::hash(data).into()
}

/// Hash from a reader using BLAKE3 streaming
///
/// Returns a 32-byte BLAKE3 hash. Reads incrementally to avoid
/// loading entire content into memory.
pub fn hash_stream<R: Read>(mut reader: R) -> io::Result<[u8; 32]> {
    let mut hasher = blake3::Hasher::new();
    let mut buffer = [0; 65536]; // 64KB chunks

    loop {
        let n = reader.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }

    Ok(hasher.finalize().into())
}

/// Hash a file using BLAKE3 streaming
///
/// Returns a 32-byte BLAKE3 hash. Streams the file content
/// to avoid loading entire files into memory.
pub fn hash_file<P: AsRef<Path>>(path: P) -> io::Result<[u8; 32]> {
    let file = File::open(path)?;
    hash_stream(file)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn test_hash_bytes() {
        let data = b"hello world";
        let hash1 = hash_bytes(data);
        let hash2 = hash_bytes(data);
        assert_eq!(hash1, hash2, "Same input should produce same hash");
    }

    #[test]
    fn test_hash_bytes_deterministic() {
        let data1 = b"test data";
        let data2 = b"test data";
        let hash1 = hash_bytes(data1);
        let hash2 = hash_bytes(data2);
        assert_eq!(
            hash1, hash2,
            "Identical data should produce identical hashes"
        );
    }

    #[test]
    fn test_hash_bytes_different() {
        let data1 = b"test data 1";
        let data2 = b"test data 2";
        let hash1 = hash_bytes(data1);
        let hash2 = hash_bytes(data2);
        assert_ne!(
            hash1, hash2,
            "Different data should produce different hashes"
        );
    }

    #[test]
    fn test_streaming_hash_matches_bulk() {
        let data = b"The quick brown fox jumps over the lazy dog";

        let bulk_hash = hash_bytes(data);

        let cursor = Cursor::new(data);
        let stream_hash = hash_stream(cursor).expect("streaming hash should succeed");

        assert_eq!(
            bulk_hash, stream_hash,
            "Streaming hash should match bulk hash for same data"
        );
    }

    #[test]
    fn test_streaming_hash_large() {
        // Test with 1MB of data
        let data: Vec<u8> = (0..1024 * 1024)
            .map(|i| (i % 256) as u8)
            .cycle()
            .take(1024 * 1024)
            .collect();

        let bulk_hash = hash_bytes(&data);
        let cursor = Cursor::new(&data);
        let stream_hash = hash_stream(cursor).expect("streaming hash should succeed");

        assert_eq!(
            bulk_hash, stream_hash,
            "Streaming hash should match bulk hash for 1MB data"
        );
    }

    #[test]
    fn test_streaming_empty() {
        let data: &[u8] = b"";
        let bulk_hash = hash_bytes(data);

        let cursor = Cursor::new(data);
        let stream_hash = hash_stream(cursor).expect("streaming hash should succeed");

        assert_eq!(
            bulk_hash, stream_hash,
            "Empty data should hash consistently"
        );
    }

    #[test]
    fn test_file_hash() {
        use std::io::Write;
        use tempfile::NamedTempFile;

        let mut file = NamedTempFile::new().expect("create temp file");
        let test_data = b"file content test";
        file.write_all(test_data).expect("write to temp file");
        file.flush().expect("flush temp file");

        let hash = hash_file(file.path()).expect("hash file should succeed");
        let expected = hash_bytes(test_data);

        assert_eq!(hash, expected, "File hash should match data hash");
    }

    #[test]
    fn test_hash_size() {
        let hash = hash_bytes(b"test");
        assert_eq!(hash.len(), 32, "BLAKE3 hash should be 32 bytes");
    }
}
