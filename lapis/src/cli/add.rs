//! `lapis add` command implementation
//!
//! Chunks a file, stores chunks in CAS, and updates the staging area.

use lapis::chunking::chunk_file;
use lapis::error::Result;
use lapis::index::MetadataStore;
use lapis::repo::Repository;
use lapis::store::CasStore;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use super::AddArgs;

/// Staging area entry for a single file
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StagedFile {
    /// Relative path to the file from repo root
    pub file_path: String,
    /// List of BLAKE3 hashes (hex-encoded) for chunks
    pub chunk_hashes: Vec<String>,
    /// Total size of the file in bytes
    pub total_size: u64,
}

/// Staging area state
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StagingArea {
    /// Map of file paths to their staged entries
    pub files: Vec<StagedFile>,
}

impl StagingArea {
    /// Create a new empty staging area
    pub fn new() -> Self {
        StagingArea { files: Vec::new() }
    }

    /// Add or update a staged file entry
    pub fn add_file(&mut self, entry: StagedFile) {
        self.files.retain(|f| f.file_path != entry.file_path);
        self.files.push(entry);
    }

    /// Serialize staging area to JSON
    pub fn serialize(&self) -> Result<Vec<u8>> {
        serde_json::to_vec_pretty(self)
            .map_err(|e| lapis::error::LapisError::Metadata(e.to_string()))
    }

    /// Deserialize staging area from JSON
    pub fn deserialize(data: &[u8]) -> Result<Self> {
        serde_json::from_slice(data).map_err(|e| lapis::error::LapisError::Metadata(e.to_string()))
    }
}

pub fn execute(args: AddArgs) -> Result<()> {
    let file_path = Path::new(&args.path);

    if !file_path.exists() {
        return Err(lapis::error::LapisError::Metadata(format!(
            "file not found: {}",
            args.path
        )));
    }

    let repo_root = find_repo_root()?;
    let repo = Repository::open(&repo_root)?;

    let rel_path = if file_path.is_absolute() {
        file_path.strip_prefix(&repo_root).map_err(|_| {
            lapis::error::LapisError::Metadata("file path is outside repository".to_string())
        })?
    } else {
        file_path
    };

    let rel_path_str = rel_path
        .to_str()
        .ok_or_else(|| lapis::error::LapisError::Metadata("invalid file path".to_string()))?
        .to_string();

    let metadata = fs::metadata(file_path)?;
    let file_size = metadata.len();

    let cas = CasStore::new(repo.store_hot_dir())?;
    let chunks = chunk_file(file_path)?;

    const PROGRESS_THRESHOLD: u64 = 100 * 1024 * 1024; // 100 MB
    let show_progress = file_size > PROGRESS_THRESHOLD;

    let mut chunk_hashes = Vec::new();
    let mut stored_blocks = Vec::new();
    let mut bytes_processed = 0u64;
    for (chunk_index, chunk) in chunks.iter().enumerate() {
        let mut chunk_data = vec![0u8; chunk.length as usize];
        let mut file = fs::File::open(file_path)?;
        use std::io::{Read, Seek, SeekFrom};
        file.seek(SeekFrom::Start(chunk.offset))?;
        file.read_exact(&mut chunk_data)?;

        let stored_hash = cas.put(&chunk_data)?;
        super::similarity_cache::update_similarity_for_chunk(chunk.hash, &chunk_data);
        chunk_hashes.push(hex::encode(&chunk.hash));
        stored_blocks.push((stored_hash, chunk_data.len() as u32));

        bytes_processed += chunk.length as u64;
        if show_progress && (chunk_index + 1) % 5 == 0 {
            let pct = (bytes_processed as f64 / file_size as f64 * 100.0) as u32;
            eprintln!(
                "  Progress: {} / {} bytes ({:3}%)",
                bytes_processed, file_size, pct
            );
        }
    }

    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| {
            lapis::error::LapisError::Metadata(format!("Failed to create async runtime: {}", e))
        })?;

    rt.block_on(async {
        let mut store = MetadataStore::new(repo.meta_dir().join("index.db")).await?;
        for (hash, size) in stored_blocks {
            store.insert_block(&hash, size, "hot").await?;
        }
        Ok::<(), lapis::error::LapisError>(())
    })?;

    let staging_path = repo.lapis_dir().join("staging.json");
    let mut staging = if staging_path.exists() {
        let staging_data = fs::read(&staging_path)?;
        StagingArea::deserialize(&staging_data)?
    } else {
        StagingArea::new()
    };

    staging.add_file(StagedFile {
        file_path: rel_path_str.clone(),
        chunk_hashes,
        total_size: file_size,
    });

    let staging_json = staging.serialize()?;
    fs::write(&staging_path, staging_json)?;

    println!(
        "Added {} ({} bytes, {} chunks)",
        rel_path_str,
        file_size,
        chunks.len()
    );

    Ok(())
}

/// Find the repository root by looking for .lapis directory
fn find_repo_root() -> Result<PathBuf> {
    let mut current = std::env::current_dir()?;
    loop {
        if current.join(".lapis").exists() {
            return Ok(current);
        }
        if !current.pop() {
            return Err(lapis::error::LapisError::Metadata(
                "not in a lapis repository (no .lapis directory found)".to_string(),
            ));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cli::test_utils::acquire_cwd_lock;
    use tempfile::TempDir;

    /// Safe cwd helper: returns current dir if valid, else falls back to temp_dir
    fn safe_original_cwd() -> std::path::PathBuf {
        // First, try to get the current directory
        if let Ok(cwd) = std::env::current_dir() {
            if cwd.exists() {
                return cwd;
            }
        }
        // If the current directory doesn't exist or can't be read, move to a known valid location
        let fallback = std::env::temp_dir();
        let _ = std::env::set_current_dir(&fallback);
        fallback
    }

    #[test]
    fn test_staging_area_new() {
        let staging = StagingArea::new();
        assert_eq!(staging.files.len(), 0);
    }

    #[test]
    fn test_staging_area_add_file() {
        let mut staging = StagingArea::new();
        let entry = StagedFile {
            file_path: "test.bin".to_string(),
            chunk_hashes: vec!["abc123".to_string()],
            total_size: 1024,
        };
        staging.add_file(entry.clone());
        assert_eq!(staging.files.len(), 1);
        assert_eq!(staging.files[0], entry);
    }

    #[test]
    fn test_staging_area_update_file() {
        let mut staging = StagingArea::new();
        let entry1 = StagedFile {
            file_path: "test.bin".to_string(),
            chunk_hashes: vec!["abc123".to_string()],
            total_size: 1024,
        };
        staging.add_file(entry1);
        assert_eq!(staging.files.len(), 1);

        let entry2 = StagedFile {
            file_path: "test.bin".to_string(),
            chunk_hashes: vec!["def456".to_string()],
            total_size: 2048,
        };
        staging.add_file(entry2.clone());
        assert_eq!(staging.files.len(), 1);
        assert_eq!(staging.files[0], entry2);
    }

    #[test]
    fn test_staging_area_serialize_deserialize() {
        let mut staging = StagingArea::new();
        staging.add_file(StagedFile {
            file_path: "test.bin".to_string(),
            chunk_hashes: vec!["abc123".to_string(), "def456".to_string()],
            total_size: 2048,
        });

        let serialized = staging.serialize().expect("serialize should succeed");
        let deserialized =
            StagingArea::deserialize(&serialized).expect("deserialize should succeed");

        assert_eq!(staging, deserialized);
    }

    #[test]
    fn test_add_missing_file_error() {
        let _lock = acquire_cwd_lock();
        let temp_dir = TempDir::new().expect("create temp dir");
        let repo_root = temp_dir.path();

        lapis::repo::Repository::init(repo_root).expect("init should succeed");

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(repo_root).expect("set cwd");

        let args = AddArgs {
            path: "nonexistent.bin".to_string(),
        };

        let result = execute(args);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));

        let _ = std::env::set_current_dir(&original_cwd);
        drop(temp_dir);
    }

    #[test]
    fn test_add_not_in_repo_error() {
        let _lock = acquire_cwd_lock();
        let temp_dir = TempDir::new().expect("create temp dir");
        let work_dir = temp_dir.path().join("work");
        fs::create_dir_all(&work_dir).expect("create work dir");

        let test_file = work_dir.join("test.bin");
        fs::write(&test_file, b"test data").expect("write test file");

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(&work_dir).expect("set cwd");

        let args = AddArgs {
            path: "test.bin".to_string(),
        };

        let result = execute(args);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("not in a lapis repository"));

        let _ = std::env::set_current_dir(&original_cwd);
        drop(temp_dir);
    }
}
