use std::io;
use thiserror::Error;

/// The primary error type for Lapis library operations.
///
/// This enum captures all recoverable errors that can occur during
/// content-addressed storage, chunking, hashing, and VCS operations.
#[derive(Error, Debug)]
pub enum LapisError {
    /// I/O errors (file read/write, directory operations)
    #[error("I/O error: {0}")]
    Io(#[from] io::Error),

    /// Chunking operation errors
    #[error("Chunking error: {0}")]
    Chunking(String),

    /// Hash computation or verification errors
    #[error("Hash error: {0}")]
    Hash(String),

    /// Content-addressed storage (CAS) errors
    #[error("CAS error: {0}")]
    Cas(String),

    /// Metadata store errors
    #[error("Metadata error: {0}")]
    Metadata(String),

    /// Commit operation errors
    #[error("Commit error: {0}")]
    Commit(String),

    /// Database operation errors (SQLite, queries, schema)
    #[error("Database error: {0}")]
    Database(String),

    /// Network/HTTP errors
    #[error("Network error: {0}")]
    Network(String),

    /// Reflog operation errors
    #[error("Reflog error: {0}")]
    Reflog(String),
}

/// The standard Result type for Lapis library operations.
///
/// This is a convenience alias for `std::result::Result<T, LapisError>`.
pub type Result<T> = std::result::Result<T, LapisError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_io_error_conversion() {
        let io_err = io::Error::new(io::ErrorKind::NotFound, "file not found");
        let lapis_err: LapisError = io_err.into();
        assert_eq!(lapis_err.to_string(), "I/O error: file not found");
    }

    #[test]
    fn test_chunking_error() {
        let err = LapisError::Chunking("chunk boundary invalid".to_string());
        assert_eq!(err.to_string(), "Chunking error: chunk boundary invalid");
    }

    #[test]
    fn test_hash_error() {
        let err = LapisError::Hash("hash verification failed".to_string());
        assert_eq!(err.to_string(), "Hash error: hash verification failed");
    }

    #[test]
    fn test_cas_error() {
        let err = LapisError::Cas("block not found in store".to_string());
        assert_eq!(err.to_string(), "CAS error: block not found in store");
    }

    #[test]
    fn test_metadata_error() {
        let err = LapisError::Metadata("schema version mismatch".to_string());
        assert_eq!(err.to_string(), "Metadata error: schema version mismatch");
    }

    #[test]
    fn test_commit_error() {
        let err = LapisError::Commit("invalid parent commit".to_string());
        assert_eq!(err.to_string(), "Commit error: invalid parent commit");
    }

    #[test]
    fn test_network_error() {
        let err = LapisError::Network("connection refused".to_string());
        assert_eq!(err.to_string(), "Network error: connection refused");
    }

    #[test]
    fn test_result_type_alias() {
        let result: Result<u32> = Ok(42);
        assert_eq!(result.unwrap(), 42);

        let err_result: Result<u32> = Err(LapisError::Hash("test".to_string()));
        assert!(err_result.is_err());
    }

    #[test]
    fn test_from_io_error_with_result() {
        fn may_fail() -> Result<String> {
            let _ = std::fs::read_to_string("/nonexistent/path")?;
            Ok("success".to_string())
        }

        assert!(may_fail().is_err());
    }
}
