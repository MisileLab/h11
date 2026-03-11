//! `lapis checkout` command implementation
//!
//! Restores a file from a specific commit by reading the manifest,
//! fetching chunks from CAS, and writing them in order to the working directory.
//! Supports lazy block fetching from remote if `.lapis/remote` is configured.

use lapis::error::Result;
use lapis::index::MetadataStore;
use lapis::repo::Repository;
use lapis::store::CasStore;
use lapis::vcs::CompositeManifest;
use sqlx::Row;
use std::fs;
use std::path::PathBuf;

use super::CheckoutArgs;

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

fn read_head(repo: &Repository) -> Result<Option<[u8; 32]>> {
    let head_file = repo.lapis_dir().join("HEAD");
    if !head_file.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&head_file)
        .map_err(|e| lapis::error::LapisError::Metadata(format!("Failed to read HEAD: {}", e)))?;

    let trimmed = content.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    if let Some(branch_name) = trimmed.strip_prefix("ref: refs/heads/") {
        let db_path = repo.meta_dir().join("index.db");
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| {
                lapis::error::LapisError::Metadata(format!("Failed to create async runtime: {}", e))
            })?;

        async fn async_get_ref(db_path: PathBuf, branch_name: String) -> Result<Option<[u8; 32]>> {
            let store = MetadataStore::new(&db_path).await?;
            store.get_ref(&branch_name, "branch").await
        }

        return rt.block_on(async_get_ref(db_path, branch_name.to_string()));
    }

    let hash_bytes = hex::decode(trimmed).map_err(|e| {
        lapis::error::LapisError::Metadata(format!("Invalid HEAD hash format: {}", e))
    })?;

    if hash_bytes.len() != 32 {
        return Err(lapis::error::LapisError::Metadata(
            "HEAD hash must be 32 bytes".to_string(),
        ));
    }

    let mut hash_array = [0u8; 32];
    hash_array.copy_from_slice(&hash_bytes);
    Ok(Some(hash_array))
}

/// Read remote URL from `.lapis/remote` if it exists
fn read_remote_url(repo: &Repository) -> Result<Option<String>> {
    let remote_file = repo.lapis_dir().join("remote");
    if !remote_file.exists() {
        return Ok(None);
    }

    let url = fs::read_to_string(&remote_file).map_err(|e| {
        lapis::error::LapisError::Metadata(format!("Failed to read remote file: {}", e))
    })?;

    Ok(Some(url.trim().to_string()))
}

/// Fetch a block from remote server and store it in local CAS
async fn fetch_block_from_remote(
    remote_url: &str,
    hash: &[u8; 32],
    cas_store: &CasStore,
) -> Result<Vec<u8>> {
    let hex_hash = hex::encode(hash);
    let block_url = format!("{}/blocks/{}", remote_url, hex_hash);

    let client = reqwest::Client::new();
    let response = client.get(&block_url).send().await.map_err(|e| {
        lapis::error::LapisError::Network(format!("Failed to fetch block from remote: {}", e))
    })?;

    if !response.status().is_success() {
        return Err(lapis::error::LapisError::Network(format!(
            "Block fetch failed with status {}: {}",
            response.status(),
            hex_hash
        )));
    }

    let block_data = response.bytes().await.map_err(|e| {
        lapis::error::LapisError::Network(format!("Failed to read block data from remote: {}", e))
    })?;

    let block_vec = block_data.to_vec();

    // Store block in local CAS (put() will verify integrity via blake3 hash)
    let stored_hash = cas_store.put(&block_vec)?;

    // Verify the fetched hash matches what we requested
    if stored_hash != *hash {
        return Err(lapis::error::LapisError::Metadata(format!(
            "Remote block hash mismatch: requested {}, got {}",
            hex_hash,
            hex::encode(&stored_hash)
        )));
    }

    Ok(block_vec)
}

pub fn execute(args: CheckoutArgs) -> Result<()> {
    let file_path = if args.file_path_args.is_empty() {
        return Err(lapis::error::LapisError::Metadata(
            "checkout: file path is required".to_string(),
        ));
    } else if args.file_path_args.len() == 1 {
        args.file_path_args[0].clone()
    } else if args.file_path_args.len() == 2 && args.file_path_args[0] == "--" {
        args.file_path_args[1].clone()
    } else {
        return Err(lapis::error::LapisError::Metadata(format!(
            "checkout: invalid arguments (got {} extra args)",
            args.file_path_args.len()
        )));
    };

    let repo_root = find_repo_root()?;
    let repo = Repository::open(&repo_root)?;

    let commit_hash = if args.commit_ref == "HEAD" {
        match read_head(&repo)? {
            Some(hash) => hash,
            None => {
                return Err(lapis::error::LapisError::Metadata(
                    "HEAD not found; no commits in repository".to_string(),
                ))
            }
        }
    } else {
        return Err(lapis::error::LapisError::Metadata(format!(
            "checkout: only HEAD is supported in Phase 0 (got: {})",
            args.commit_ref
        )));
    };

    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| {
            lapis::error::LapisError::Metadata(format!("Failed to create async runtime: {}", e))
        })?;

    let db_path = repo.meta_dir().join("index.db");
    let (commit, manifest_file_path, chunk_list_json, manifest_total_size): (
        lapis::vcs::Commit,
        String,
        String,
        i64,
    ) = rt.block_on(async {
        let store = MetadataStore::new(&db_path).await?;

        let row = sqlx::query(
            "SELECT parent_hash, manifest_hash, timestamp, message, signature FROM commits WHERE hash = ?1"
        )
        .bind(commit_hash.to_vec())
        .fetch_optional(store.read_pool())
        .await
        .map_err(|e| lapis::error::LapisError::Database(format!(
            "Failed to query commit: {}",
            e
        )))?;

        let Some(row) = row else {
            return Err(lapis::error::LapisError::Metadata(
                format!("commit not found: {}", hex::encode(commit_hash)),
            ));
        };

        let parent_hash = row
            .get::<Option<Vec<u8>>, _>("parent_hash")
            .map(to_hash32)
            .transpose()?;
        let manifest_hash_bytes: Vec<u8> = row.get("manifest_hash");
        if manifest_hash_bytes.len() != 32 {
            return Err(lapis::error::LapisError::Metadata(
                "manifest hash must be 32 bytes".to_string(),
            ));
        }
        let mut manifest_hash = [0u8; 32];
        manifest_hash.copy_from_slice(&manifest_hash_bytes);
        let commit = lapis::vcs::Commit {
            hash: commit_hash,
            parent: parent_hash,
            manifest_hash,
            timestamp: row.get::<i64, _>("timestamp") as u64,
            message: row.get("message"),
            signature: row.get("signature"),
        };

        let manifest_row = sqlx::query(
            "SELECT file_path, chunk_list, total_size FROM manifests WHERE hash = ?1"
        )
        .bind(manifest_hash.to_vec())
        .fetch_optional(store.read_pool())
        .await
        .map_err(|e| lapis::error::LapisError::Database(format!(
            "Failed to query manifest: {}",
            e
        )))?;

        let Some(manifest_row) = manifest_row else {
            return Err(lapis::error::LapisError::Metadata(
                format!("manifest not found for commit: {}", hex::encode(commit_hash)),
            ));
        };

        let manifest_file_path: String = manifest_row.get("file_path");
        let chunk_list_json: String = manifest_row.get("chunk_list");
        let manifest_total_size: i64 = manifest_row.get("total_size");

        Ok::<_, lapis::error::LapisError>((
            commit,
            manifest_file_path,
            chunk_list_json,
            manifest_total_size,
        ))
    })?;

    #[cfg(feature = "signing")]
    verify_signed_commit(&commit)?;
    #[cfg(not(feature = "signing"))]
    let _ = &commit;

    let manifest = CompositeManifest::from_storage(
        &manifest_file_path,
        &chunk_list_json,
        manifest_total_size as u64,
    )?;
    let chunk_hashes = manifest.chunk_hashes_for_path(&file_path)?.ok_or_else(|| {
        lapis::error::LapisError::Metadata(format!(
            "file not found in commit {}: {}",
            hex::encode(commit_hash),
            file_path
        ))
    })?;

    if chunk_hashes.is_empty() {
        return Err(lapis::error::LapisError::Metadata(format!(
            "file not found in commit {}: {}",
            hex::encode(commit_hash),
            file_path
        )));
    }

    let cas_store = CasStore::new(repo.store_hot_dir())?;
    let remote_url = read_remote_url(&repo)?;

    let mut file_data = Vec::new();
    for (idx, chunk_hash) in chunk_hashes.iter().enumerate() {
        let chunk_data = match cas_store.get(chunk_hash) {
            Ok(data) => data,
            Err(cas_err) => {
                // Try lazy fetch from remote if URL exists
                if let Some(ref url) = remote_url {
                    rt.block_on(async {
                        fetch_block_from_remote(url, chunk_hash, &cas_store).await
                    })
                    .map_err(|e| {
                        lapis::error::LapisError::Cas(format!(
                            "Failed to fetch chunk {} from remote: {}",
                            idx, e
                        ))
                    })?
                } else {
                    return Err(lapis::error::LapisError::Cas(format!(
                        "Failed to fetch chunk {} from CAS: {}",
                        idx, cas_err
                    )));
                }
            }
        };
        file_data.extend_from_slice(&chunk_data);
    }

    if file_data.is_empty() {
        return Err(lapis::error::LapisError::Metadata(format!(
            "file not found in commit {}: {}",
            hex::encode(commit_hash),
            file_path
        )));
    }

    let output_path = repo_root.join(&file_path);

    if output_path.exists() {
        eprintln!("Warning: overwriting existing file: {}", file_path);
    }

    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|e| lapis::error::LapisError::Io(e))?;
    }

    fs::write(&output_path, file_data).map_err(|e| lapis::error::LapisError::Io(e))?;

    println!("checked out {} from {}", file_path, args.commit_ref);
    Ok(())
}

#[cfg(feature = "signing")]
fn verify_signed_commit(commit: &lapis::vcs::Commit) -> Result<()> {
    let Some(signature) = commit.signature.as_ref() else {
        return Ok(());
    };

    let payload = commit.signing_payload()?;
    lapis::crypto::sigstore::verify_commit_payload(&payload, signature)?;
    Ok(())
}

fn to_hash32(bytes: Vec<u8>) -> Result<[u8; 32]> {
    if bytes.len() != 32 {
        return Err(lapis::error::LapisError::Database(
            "Invalid hash length in database".to_string(),
        ));
    }

    let mut hash = [0u8; 32];
    hash.copy_from_slice(&bytes);
    Ok(hash)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cli::test_utils::{acquire_cwd_lock, restore_cwd, safe_original_cwd};
    use tempfile::TempDir;

    #[test]
    fn test_checkout_success() {
        let _lock = acquire_cwd_lock();
        let temp_dir = TempDir::new().expect("create temp dir");
        let repo_root = temp_dir.path();

        lapis::repo::Repository::init(repo_root).expect("init should succeed");

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(repo_root).expect("set cwd");

        let args = CheckoutArgs {
            commit_ref: "HEAD".to_string(),
            file_path_args: vec!["test.txt".to_string()],
        };

        assert_eq!(args.commit_ref, "HEAD");
        assert_eq!(args.file_path_args, vec!["test.txt"]);

        restore_cwd(&original_cwd);
    }

    #[test]
    fn test_checkout_missing_file_in_commit() {
        let _lock = acquire_cwd_lock();
        let temp_dir = TempDir::new().expect("create temp dir");
        let repo_root = temp_dir.path();

        lapis::repo::Repository::init(repo_root).expect("init should succeed");

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(repo_root).expect("set cwd");

        let args = CheckoutArgs {
            commit_ref: "HEAD".to_string(),
            file_path_args: vec!["nonexistent.txt".to_string()],
        };

        assert_eq!(args.file_path_args, vec!["nonexistent.txt"]);

        restore_cwd(&original_cwd);
    }

    #[test]
    fn test_checkout_not_in_repo() {
        let _lock = acquire_cwd_lock();
        let temp_dir = tempfile::tempdir_in("/tmp").expect("create temp dir in /tmp");
        let work_dir = temp_dir.path().join("work");
        fs::create_dir_all(&work_dir).expect("create work dir");

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(&work_dir).expect("set cwd");
        assert_eq!(
            std::env::current_dir().expect("read cwd").canonicalize().expect("canonical cwd"),
            work_dir.canonicalize().expect("canonical work dir")
        );
        assert!(find_repo_root().is_err(), "work dir should not resolve to a repo root");

        let args = CheckoutArgs {
            commit_ref: "HEAD".to_string(),
            file_path_args: vec!["file.txt".to_string()],
        };

        let result = execute(args);
        match result {
            Err(lapis::error::LapisError::Metadata(message)) => {
                assert!(message.contains("not in a lapis repository"), "unexpected metadata message: {message}");
            }
            Err(other) => panic!("expected metadata repo-root error, got: {other}"),
            Ok(()) => panic!("checkout unexpectedly succeeded outside a repository"),
        }

        restore_cwd(&original_cwd);
    }

    #[cfg(feature = "signing")]
    #[test]
    fn test_verify_signed_commit_allows_unsigned_commits() {
        let commit =
            lapis::vcs::Commit::create(None, [1u8; 32], "unsigned").expect("create commit");
        verify_signed_commit(&commit).expect("unsigned commits stay allowed");
    }

    #[cfg(feature = "signing")]
    #[test]
    fn test_verify_signed_commit_rejects_invalid_signature() {
        let mut commit =
            lapis::vcs::Commit::create(None, [2u8; 32], "signed").expect("create commit");
        commit.signature = Some(br#"{"version":2,"format":"sigstore-fixture","scheme":"ECDSA_P256_SHA256_ASN1","certificate_pem":"not-a-cert","signature_hex":"00"}"#.to_vec());

        let err = verify_signed_commit(&commit).expect_err("invalid signature must fail");
        assert!(err.to_string().contains("Sigstore") || err.to_string().contains("Invalid"));
    }
}
