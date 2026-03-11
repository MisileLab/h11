//! `lapis pull` command implementation
//!
//! Slice 1: metadata fetch, parsing, validation
//! Slice 2: block download + journaling (missing blocks only, incremental persistence)
//! Slice 3+: file restoration and HEAD write in subsequent slices

use lapis::error::Result;
use lapis::index::MetadataStore;
use lapis::repo::Repository;
use lapis::server::{persist_head_metadata, HeadMetadataResponse};
use lapis::store::CasStore;
use lapis::transfer::journal::TransferJournal;
use std::fs;
use std::path::PathBuf;

use super::PullArgs;
use super::operation_guard::RepoOperationGuard;

/// Resolve server URL from args: --server takes precedence, then positional remote name
/// If positional remote is "origin", reads from .lapis/remote file
fn resolve_server_url(args: &PullArgs) -> Result<String> {
    if let Some(server) = &args.server {
        return Ok(server.clone());
    }
    
    if let Some(remote) = &args.remote {
        if remote == "origin" {
            let repo_root = find_repo_root()?;
            let remote_file = repo_root.join(".lapis").join("remote");
            let url = fs::read_to_string(&remote_file).map_err(|e| {
                lapis::error::LapisError::Metadata(
                    format!("Failed to read .lapis/remote: {}", e)
                )
            })?;
            return Ok(url.trim().to_string());
        }
        // For now, if remote is not "origin", treat it as a literal URL
        return Ok(remote.clone());
    }
    
    Ok("http://localhost:3000".to_string())
}

pub async fn execute(args: PullArgs) -> Result<()> {
    let server_url = resolve_server_url(&args)?;
    let repo_root = find_repo_root()?;
    let repo = Repository::open(&repo_root)?;
    let _operation_guard = RepoOperationGuard::acquire(&repo, "pull")?;

    println!("Contacting server for remote HEAD metadata...");

    // Fetch remote HEAD metadata
    let metadata = fetch_remote_head(&server_url).await?;

    // Validate metadata
    validate_metadata(&metadata)?;

    // Print progress
    println!(
        "Remote HEAD has {} chunks for file: {}",
        metadata.chunk_hashes.len(),
        metadata.file_path
    );
    println!("  Commit: {}", &metadata.head_commit[0..8]);
    println!("  Manifest: {}", &metadata.manifest_hash[0..8]);

    // Download missing blocks and persist progress
    download_missing_blocks(&server_url, &repo, &metadata).await?;

    persist_head_metadata(repo.root(), &metadata).await?;
    println!("Persisted pulled commit and manifest metadata locally");

    // Write HEAD and restore file from CAS chunks
    finalize_pull(&repo, &metadata).await?;

    Ok(())
}

/// Fetch remote HEAD metadata from /meta/head endpoint
async fn fetch_remote_head(server_url: &str) -> Result<HeadMetadataResponse> {
    let client = reqwest::Client::new();
    let url = format!("{}/meta/head", server_url);

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| lapis::error::LapisError::Network(format!("Failed to fetch metadata: {}", e)))?
        .json::<HeadMetadataResponse>()
        .await
        .map_err(|e| {
            lapis::error::LapisError::Network(format!("Failed to parse metadata: {}", e))
        })?;

    Ok(response)
}

/// Validate that metadata fields have expected structure
fn validate_metadata(metadata: &HeadMetadataResponse) -> Result<()> {
    // Validate commit hash is 64 hex chars (32 bytes)
    if metadata.head_commit.len() != 64 {
        return Err(lapis::error::LapisError::Metadata(format!(
            "Invalid commit hash length: {} (expected 64)",
            metadata.head_commit.len()
        )));
    }

    // Validate manifest hash is 64 hex chars (32 bytes)
    if metadata.manifest_hash.len() != 64 {
        return Err(lapis::error::LapisError::Metadata(format!(
            "Invalid manifest hash length: {} (expected 64)",
            metadata.manifest_hash.len()
        )));
    }

    if let Some(parent_hash) = metadata.parent_hash.as_ref() {
        if parent_hash.len() != 64 {
            return Err(lapis::error::LapisError::Metadata(format!(
                "Invalid parent hash length: {} (expected 64)",
                parent_hash.len()
            )));
        }
    }

    if let Some(signature) = metadata.signature.as_ref() {
        hex::decode(signature).map_err(|e| {
            lapis::error::LapisError::Metadata(format!("Invalid signature hex: {}", e))
        })?;
    }

    // Validate each chunk hash is 64 hex chars
    for (idx, chunk_hash) in metadata.chunk_hashes.iter().enumerate() {
        if chunk_hash.len() != 64 {
            return Err(lapis::error::LapisError::Metadata(format!(
                "Invalid chunk hash at index {}: length {} (expected 64)",
                idx,
                chunk_hash.len()
            )));
        }
    }

    // Validate file_path is not empty
    if metadata.file_path.is_empty() {
        return Err(lapis::error::LapisError::Metadata(
            "Remote file path is empty".to_string(),
        ));
    }

    if metadata.total_size == 0 && !metadata.chunk_hashes.is_empty() {
        return Err(lapis::error::LapisError::Metadata(
            "Remote total_size is zero for non-empty chunk list".to_string(),
        ));
    }

    Ok(())
}

/// Download missing blocks from remote and store in local CAS
///
/// Persists progress in `.lapis/transfer/pull.json` after each successful block download.
/// Skips blocks that already exist locally or have been downloaded in a previous pull attempt.
async fn download_missing_blocks(
    server_url: &str,
    repo: &Repository,
    metadata: &HeadMetadataResponse,
) -> Result<()> {
    let cas = CasStore::new(repo.store_hot_dir())?;
    let transfer_dir = repo.lapis_dir().join("transfer");
    fs::create_dir_all(&transfer_dir)?;
    let journal_path = transfer_dir.join("pull.json");

    // Load or create transfer journal
    let mut journal = if journal_path.exists() {
        TransferJournal::load(&journal_path)?
    } else {
        TransferJournal::new(
            "pull-session".to_string(),
            metadata.chunk_hashes.len() as u64,
        )
    };

    // Determine which blocks need to be downloaded
    let needed_hashes = journal.needed_hashes(&metadata.chunk_hashes);

    if needed_hashes.is_empty() {
        println!("All blocks already downloaded!");
        return Ok(());
    }

    println!(
        "Need to download {} blocks (skipping {} already downloaded)",
        needed_hashes.len(),
        metadata.chunk_hashes.len() - needed_hashes.len()
    );

    let client = reqwest::Client::new();
    let download_url_base = format!("{}/blocks", server_url);
    let mut downloaded_count = 0;

    for (idx, hash) in needed_hashes.iter().enumerate() {
        // Convert hex string to [u8; 32]
        let hash_bytes = hex::decode(hash)
            .map_err(|e| lapis::error::LapisError::Metadata(format!("Invalid hash: {}", e)))?;

        if hash_bytes.len() != 32 {
            return Err(lapis::error::LapisError::Metadata(
                "Hash must be 32 bytes".to_string(),
            ));
        }

        let mut hash_arr = [0u8; 32];
        hash_arr.copy_from_slice(&hash_bytes);

        // Skip if block already exists in local CAS
        if cas.exists(&hash_arr)? {
            journal.mark_uploaded(hash.clone());
            journal.save(&journal_path)?;
            continue;
        }

        // Download block from server
        let download_url = format!("{}/{}", download_url_base, hash);
        let response = client.get(&download_url).send().await.map_err(|e| {
            lapis::error::LapisError::Network(format!("Failed to download block {}: {}", hash, e))
        })?;

        if !response.status().is_success() {
            return Err(lapis::error::LapisError::Network(format!(
                "Block download failed with status {}: {}",
                response.status(),
                hash
            )));
        }

        let block_data = response.bytes().await.map_err(|e| {
            lapis::error::LapisError::Network(format!(
                "Failed to read block data for {}: {}",
                hash, e
            ))
        })?;

        // Store block in local CAS
        cas.put(&block_data)?;

        // Mark as downloaded in journal and persist immediately
        journal.mark_uploaded(hash.clone());
        journal.save(&journal_path)?;

        downloaded_count += 1;
        let pct = ((idx + 1) as f64 / needed_hashes.len() as f64 * 100.0) as u32;
        let bar_width = 30;
        let filled = (bar_width * (idx + 1)) / needed_hashes.len();
        let bar = format!(
            "[{}{}] {}/{} blocks ({:3}%)",
            "=".repeat(filled),
            " ".repeat(bar_width - filled),
            idx + 1,
            needed_hashes.len(),
            pct
        );
        eprint!("\r  {}\x1b[0K", bar);
        if idx + 1 == needed_hashes.len() {
            eprintln!(); // newline at end
        }
    }

    println!("Successfully downloaded {} blocks!", downloaded_count);
    Ok(())
}

/// Find repository root by walking up from current directory looking for .lapis
fn find_repo_root() -> Result<PathBuf> {
    let current = std::env::current_dir().map_err(|e| lapis::error::LapisError::Io(e))?;

    let mut path = current.as_path();
    loop {
        if path.join(".lapis").exists() {
            return Ok(path.to_path_buf());
        }

        match path.parent() {
            Some(parent) => path = parent,
            None => {
                return Err(lapis::error::LapisError::Metadata(
                    "No .lapis directory found".to_string(),
                ))
            }
        }
    }
}

/// Finalize pull by writing HEAD and restoring file from CAS chunks
async fn finalize_pull(repo: &Repository, metadata: &HeadMetadataResponse) -> Result<()> {
    let cas = CasStore::new(repo.store_hot_dir())?;

    // Parse commit hash from hex string
    let commit_hash_bytes = hex::decode(&metadata.head_commit).map_err(|e| {
        lapis::error::LapisError::Metadata(format!("Invalid commit hash format: {}", e))
    })?;
    if commit_hash_bytes.len() != 32 {
        return Err(lapis::error::LapisError::Metadata(
            "Commit hash must be 32 bytes".to_string(),
        ));
    }
    let mut commit_hash = [0u8; 32];
    commit_hash.copy_from_slice(&commit_hash_bytes);

    // Write .lapis/HEAD with remote commit hash
    let head_path = repo.lapis_dir().join("HEAD");
    fs::write(&head_path, &metadata.head_commit)?;
    println!("Wrote HEAD: {}", &metadata.head_commit[0..8]);

    // Record reflog entry for the pull
    let db_path = repo.meta_dir().join("index.db");
    let mut store = MetadataStore::new(&db_path).await?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| lapis::error::LapisError::Reflog(format!("Failed to get timestamp: {}", e)))?
        .as_secs();

    sqlx::query("INSERT INTO reflog (commit_hash, action, timestamp) VALUES (?1, ?2, ?3)")
        .bind(commit_hash.to_vec())
        .bind("pull")
        .bind(now as i64)
        .execute(store.write_conn())
        .await
        .map_err(|e| {
            lapis::error::LapisError::Reflog(format!("Failed to insert reflog entry: {}", e))
        })?;

    // Reconstruct file from chunks
    let mut file_data = Vec::new();
    for (idx, chunk_hash_str) in metadata.chunk_hashes.iter().enumerate() {
        let hash_bytes = hex::decode(chunk_hash_str).map_err(|e| {
            lapis::error::LapisError::Metadata(format!("Invalid chunk hash: {}", e))
        })?;

        if hash_bytes.len() != 32 {
            return Err(lapis::error::LapisError::Metadata(
                "Chunk hash must be 32 bytes".to_string(),
            ));
        }

        let mut hash_arr = [0u8; 32];
        hash_arr.copy_from_slice(&hash_bytes);

        let chunk_data = cas.get(&hash_arr).map_err(|e| {
            lapis::error::LapisError::Cas(format!("Failed to fetch chunk {} from CAS: {}", idx, e))
        })?;

        file_data.extend_from_slice(&chunk_data);
    }

    // Write file to disk at metadata.file_path
    let output_path = repo.root().join(&metadata.file_path);

    if output_path.exists() {
        eprintln!("Warning: overwriting existing file: {}", metadata.file_path);
    }

    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|e| lapis::error::LapisError::Io(e))?;
    }

    fs::write(&output_path, file_data).map_err(|e| lapis::error::LapisError::Io(e))?;

    println!("Restored file: {}", metadata.file_path);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use lapis::vcs::{Commit, Manifest};
    use tempfile::TempDir;
    #[test]
    fn test_validate_metadata_valid() {
        let metadata = HeadMetadataResponse {
            head_commit: "a".repeat(64),
            parent_hash: Some("b".repeat(64)),
            manifest_hash: "b".repeat(64),
            message: "pull".to_string(),
            timestamp: 1,
            signature: Some("aa".to_string()),
            chunk_hashes: vec!["c".repeat(64), "d".repeat(64)],
            file_path: "path/to/file".to_string(),
            total_size: 2,
        };
        assert!(validate_metadata(&metadata).is_ok());
    }

    #[test]
    fn test_validate_metadata_invalid_commit_hash_length() {
        let metadata = HeadMetadataResponse {
            head_commit: "a".repeat(63),
            parent_hash: None,
            manifest_hash: "b".repeat(64),
            message: "pull".to_string(),
            timestamp: 1,
            signature: None,
            chunk_hashes: vec![],
            file_path: "file".to_string(),
            total_size: 0,
        };
        assert!(validate_metadata(&metadata).is_err());
    }

    #[test]
    fn test_validate_metadata_invalid_manifest_hash_length() {
        let metadata = HeadMetadataResponse {
            head_commit: "a".repeat(64),
            parent_hash: None,
            manifest_hash: "b".repeat(65),
            message: "pull".to_string(),
            timestamp: 1,
            signature: None,
            chunk_hashes: vec![],
            file_path: "file".to_string(),
            total_size: 0,
        };
        assert!(validate_metadata(&metadata).is_err());
    }

    #[test]
    fn test_validate_metadata_invalid_chunk_hash_length() {
        let metadata = HeadMetadataResponse {
            head_commit: "a".repeat(64),
            parent_hash: None,
            manifest_hash: "b".repeat(64),
            message: "pull".to_string(),
            timestamp: 1,
            signature: None,
            chunk_hashes: vec!["c".repeat(63)],
            file_path: "file".to_string(),
            total_size: 1,
        };
        assert!(validate_metadata(&metadata).is_err());
    }

    #[test]
    fn test_validate_metadata_empty_file_path() {
        let metadata = HeadMetadataResponse {
            head_commit: "a".repeat(64),
            parent_hash: None,
            manifest_hash: "b".repeat(64),
            message: "pull".to_string(),
            timestamp: 1,
            signature: None,
            chunk_hashes: vec![],
            file_path: "".to_string(),
            total_size: 0,
        };
        assert!(validate_metadata(&metadata).is_err());
    }

    #[test]
    fn test_validate_metadata_empty_chunk_hashes() {
        let metadata = HeadMetadataResponse {
            head_commit: "a".repeat(64),
            parent_hash: None,
            manifest_hash: "b".repeat(64),
            message: "pull".to_string(),
            timestamp: 1,
            signature: None,
            chunk_hashes: vec![],
            file_path: "file".to_string(),
            total_size: 0,
        };
        assert!(validate_metadata(&metadata).is_ok());
    }

    #[test]
    fn test_validate_metadata_invalid_parent_hash_length() {
        let metadata = HeadMetadataResponse {
            head_commit: "a".repeat(64),
            parent_hash: Some("b".repeat(63)),
            manifest_hash: "b".repeat(64),
            message: "pull".to_string(),
            timestamp: 1,
            signature: None,
            chunk_hashes: vec![],
            file_path: "file".to_string(),
            total_size: 0,
        };
        assert!(validate_metadata(&metadata).is_err());
    }

    #[test]
    fn test_validate_metadata_invalid_signature_hex() {
        let metadata = HeadMetadataResponse {
            head_commit: "a".repeat(64),
            parent_hash: None,
            manifest_hash: "b".repeat(64),
            message: "pull".to_string(),
            timestamp: 1,
            signature: Some("zz".to_string()),
            chunk_hashes: vec![],
            file_path: "file".to_string(),
            total_size: 0,
        };
        assert!(validate_metadata(&metadata).is_err());
    }

    #[test]
    fn test_validate_metadata_zero_total_size_with_chunks() {
        let metadata = HeadMetadataResponse {
            head_commit: "a".repeat(64),
            parent_hash: None,
            manifest_hash: "b".repeat(64),
            message: "pull".to_string(),
            timestamp: 1,
            signature: None,
            chunk_hashes: vec!["c".repeat(64)],
            file_path: "file".to_string(),
            total_size: 0,
        };
        assert!(validate_metadata(&metadata).is_err());
    }

    #[test]
    fn test_persist_metadata_before_finalize_writes_commit_manifest_head_and_reflog() {
        let temp_dir = TempDir::new().unwrap();
        let repo = Repository::init(temp_dir.path().join("repo")).unwrap();
        let chunk_data = b"pulled-file-data";
        let cas = CasStore::new(repo.store_hot_dir()).unwrap();
        let chunk_hash = cas.put(chunk_data).unwrap();

        let manifest = Manifest {
            file_path: PathBuf::from("nested/restored.bin"),
            chunk_hashes: vec![chunk_hash],
            total_size: chunk_data.len() as u64,
            chunking_params: lapis::vcs::ChunkingParams {
                min_size: lapis::chunking::config::MIN_CHUNK_SIZE,
                avg_size: lapis::chunking::config::AVG_CHUNK_SIZE,
                max_size: lapis::chunking::config::MAX_CHUNK_SIZE,
            },
        };
        let manifest_hash = manifest.hash().unwrap();
        let mut commit = Commit::create(Some([9u8; 32]), manifest_hash, "pulled commit").unwrap();
        commit.timestamp = 1_700_000_777;
        commit.signature = Some(vec![1, 2, 3, 4]);
        commit.hash = lapis::crypto::hash_bytes(&commit.signing_payload().unwrap());

        let metadata = HeadMetadataResponse {
            head_commit: hex::encode(commit.hash),
            parent_hash: commit.parent.map(hex::encode),
            manifest_hash: hex::encode(manifest_hash),
            message: commit.message.clone(),
            timestamp: commit.timestamp as i64,
            signature: commit.signature.clone().map(hex::encode),
            chunk_hashes: vec![hex::encode(chunk_hash)],
            file_path: manifest.file_path.to_string_lossy().to_string(),
            total_size: manifest.total_size,
        };

        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            persist_head_metadata(repo.root(), &metadata).await.unwrap();
            finalize_pull(&repo, &metadata).await.unwrap();
        });

        let manifest_object = manifest.serialize().unwrap();
        let commit_object = commit.object_bytes().unwrap();
        let cas = CasStore::new(repo.store_hot_dir()).unwrap();

        let head = fs::read_to_string(repo.lapis_dir().join("HEAD")).unwrap();
        assert_eq!(head.trim(), metadata.head_commit);
        assert_eq!(
            fs::read(repo.root().join("nested/restored.bin")).unwrap(),
            chunk_data
        );
        assert!(cas.exists(&manifest_hash).unwrap());
        assert_eq!(cas.get(&manifest_hash).unwrap(), manifest_object);
        assert!(cas.exists(&commit.hash).unwrap());
        assert_eq!(cas.get(&commit.hash).unwrap(), commit_object);

        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let store = MetadataStore::new(repo.meta_dir().join("index.db")).await.unwrap();
            use sqlx::Row;

            let commit_row = sqlx::query(
                "SELECT parent_hash, manifest_hash, message, timestamp, signature FROM commits WHERE hash = ?1",
            )
            .bind(commit.hash.to_vec())
            .fetch_one(store.read_pool())
            .await
            .unwrap();
            let manifest_row = sqlx::query(
                "SELECT file_path, total_size, chunk_list FROM manifests WHERE hash = ?1",
            )
            .bind(manifest_hash.to_vec())
            .fetch_one(store.read_pool())
            .await
            .unwrap();
            let reflog_row = sqlx::query(
                "SELECT action, commit_hash FROM reflog WHERE commit_hash = ?1 ORDER BY id DESC LIMIT 1",
            )
            .bind(commit.hash.to_vec())
            .fetch_one(store.read_pool())
            .await
            .unwrap();

            assert_eq!(commit_row.get::<Option<Vec<u8>>, _>("parent_hash"), commit.parent.map(|hash| hash.to_vec()));
            assert_eq!(commit_row.get::<Vec<u8>, _>("manifest_hash"), manifest_hash.to_vec());
            assert_eq!(commit_row.get::<String, _>("message"), commit.message);
            assert_eq!(commit_row.get::<i64, _>("timestamp"), commit.timestamp as i64);
            assert_eq!(commit_row.get::<Option<Vec<u8>>, _>("signature"), commit.signature);
            assert_eq!(manifest_row.get::<String, _>("file_path"), "nested/restored.bin");
            assert_eq!(manifest_row.get::<i64, _>("total_size"), chunk_data.len() as i64);
            assert_eq!(manifest_row.get::<String, _>("chunk_list"), serde_json::to_string(&manifest.chunk_hashes).unwrap());
            assert_eq!(reflog_row.get::<String, _>("action"), "pull");
            assert_eq!(reflog_row.get::<Vec<u8>, _>("commit_hash"), commit.hash.to_vec());
        });
    }

    #[test]
    fn test_hex_decode_valid_hash() {
        let hash = "a".repeat(64);
        let decoded = hex::decode(&hash).expect("valid hex");
        assert_eq!(decoded.len(), 32);
    }

    #[test]
    fn test_hex_decode_invalid_hex() {
        let hash = "g".repeat(64);
        assert!(hex::decode(&hash).is_err());
    }

    #[test]
    fn test_hex_decode_wrong_length() {
        let hash = "a".repeat(62);
        let decoded = hex::decode(&hash).expect("valid hex");
        assert_ne!(decoded.len(), 32);
        assert_eq!(decoded.len(), 31);
    }
}
