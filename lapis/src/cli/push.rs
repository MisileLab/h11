//! `lapis push` command implementation
//!
//! Uploads staged files to a remote server by:
//! 1. Checking which blocks are missing via POST /blocks/check
//! 2. Uploading only missing blocks via POST /blocks
//! 3. Persisting upload progress via TransferJournal

use lapis::error::Result;
use lapis::repo::Repository;
use lapis::server::{load_push_metadata_chain_from_repo, PushMetadataRequest};
use lapis::store::CasStore;
use lapis::transfer::journal::TransferJournal;
use serde::Deserialize;
use std::fs;
use std::path::PathBuf;

use super::PushArgs;
use super::operation_guard::RepoOperationGuard;

/// Resolve server URL from args: --server takes precedence, then positional remote name
/// If positional remote is "origin", reads from .lapis/remote file
fn resolve_server_url(args: &PushArgs) -> Result<String> {
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

/// Request body for POST /blocks/check
#[derive(Debug, serde::Serialize)]
pub struct CheckBlocksRequest {
    pub hashes: Vec<String>,
}

/// Response body for POST /blocks/check
#[derive(Debug, Deserialize)]
pub struct CheckBlocksResponse {
    pub needed: Vec<String>,
}

pub async fn execute(args: PushArgs) -> Result<()> {
    let server_url = resolve_server_url(&args)?;
    let repo_root = find_repo_root()?;
    let repo = Repository::open(&repo_root)?;
    let _operation_guard = RepoOperationGuard::acquire(&repo, "push")?;

    let ancestry_metadata = load_push_metadata_chain_from_repo(repo.root()).await?;
    let head_metadata = ancestry_metadata.commits.first().ok_or_else(|| {
        lapis::error::LapisError::Metadata(
            "HEAD metadata chain did not include any commits".to_string(),
        )
    })?;
    let mut all_hashes = ancestry_metadata
        .commits
        .iter()
        .flat_map(|commit| commit.chunk_hashes.iter().cloned())
        .collect::<Vec<_>>();
    all_hashes.sort();
    all_hashes.dedup();

    println!(
        "Pushing {} blocks for HEAD {} ({} commits, {})...",
        all_hashes.len(),
        &ancestry_metadata.head_commit[0..8],
        ancestry_metadata.commits.len(),
        head_metadata.file_path
    );

    let transfer_dir = repo.lapis_dir().join("transfer");
    fs::create_dir_all(&transfer_dir)?;
    let journal_path = transfer_dir.join("push.json");

    let mut journal = if journal_path.exists() {
        TransferJournal::load(&journal_path)?
    } else {
        TransferJournal::new("push-session".to_string(), all_hashes.len() as u64)
    };

    let needed_hashes = journal.needed_hashes(&all_hashes);
    let client = reqwest::Client::new();
    let mut uploaded_count = 0;

    if needed_hashes.is_empty() {
        println!("All blocks already uploaded in local journal; syncing metadata only...");
    } else {
        println!(
            "Need to upload {} blocks (skipping {} already uploaded)",
            needed_hashes.len(),
            all_hashes.len() - needed_hashes.len()
        );

        let check_req = CheckBlocksRequest {
            hashes: needed_hashes.clone(),
        };

        println!("Checking with server which blocks are needed...");
        let check_url = format!("{}/blocks/check", server_url);
        let check_resp: CheckBlocksResponse = client
            .post(&check_url)
            .json(&check_req)
            .send()
            .await
            .map_err(|e| {
                lapis::error::LapisError::Network(format!("Failed to check blocks: {}", e))
            })?
            .json()
            .await
            .map_err(|e| {
                lapis::error::LapisError::Network(format!("Failed to parse check response: {}", e))
            })?;

        let to_upload = check_resp.needed;
        println!("Server needs {} blocks", to_upload.len());

        if to_upload.is_empty() {
            println!("Server already has all requested blocks!");
        } else {
            let cas = CasStore::new(repo.store_hot_dir())?;
            let upload_url = format!("{}/blocks", server_url);

            for (idx, hash) in to_upload.iter().enumerate() {
                let hash_bytes = hex::decode(hash).map_err(|e| {
                    lapis::error::LapisError::Metadata(format!("Invalid hash: {}", e))
                })?;

                if hash_bytes.len() != 32 {
                    return Err(lapis::error::LapisError::Metadata(
                        "Hash must be 32 bytes".to_string(),
                    ));
                }

                let mut hash_arr = [0u8; 32];
                hash_arr.copy_from_slice(&hash_bytes);

                let block_data = cas.get(&hash_arr).map_err(|e| {
                    lapis::error::LapisError::Io(std::io::Error::new(
                        std::io::ErrorKind::NotFound,
                        format!("Block {} not found in store: {}", hash, e),
                    ))
                })?;

                client
                    .post(&upload_url)
                    .body(block_data)
                    .send()
                    .await
                    .map_err(|e| {
                        lapis::error::LapisError::Network(format!(
                            "Failed to upload block {}: {}",
                            hash, e
                        ))
                    })?;

                journal.mark_uploaded(hash.clone());
                journal.save(&journal_path)?;

                uploaded_count += 1;
                let pct = ((idx + 1) as f64 / to_upload.len() as f64 * 100.0) as u32;
                let bar_width = 30;
                let filled = (bar_width * (idx + 1)) / to_upload.len();
                let bar = format!(
                    "[{}{}] {}/{} blocks ({:3}%)",
                    "=".repeat(filled),
                    " ".repeat(bar_width - filled),
                    idx + 1,
                    to_upload.len(),
                    pct
                );
                eprint!("\r  {}\x1b[0K", bar);
                if idx + 1 == to_upload.len() {
                    eprintln!(); // newline at end
                }
            }
        }
    }

    push_metadata(&client, &server_url, &ancestry_metadata).await?;
    println!(
        "Successfully uploaded {} blocks and synced HEAD ancestry metadata!",
        uploaded_count
    );
    Ok(())
}

async fn push_metadata(
    client: &reqwest::Client,
    server_url: &str,
    metadata: &PushMetadataRequest,
) -> Result<()> {
    let response = client
        .post(format!("{}/meta/push", server_url))
        .json(metadata)
        .send()
        .await
        .map_err(|e| {
            lapis::error::LapisError::Network(format!("Failed to push metadata: {}", e))
        })?;

    if !response.status().is_success() {
        return Err(lapis::error::LapisError::Network(format!(
            "Metadata push failed with status {}",
            response.status()
        )));
    }

    println!(
        "Remote HEAD updated to {} with {} commit metadata entries",
        &metadata.head_commit[0..8],
        metadata.commits.len()
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
    use lapis::vcs::{Commit, Manifest};
    use tempfile::TempDir;

    async fn seed_push_history(repo: &Repository, depth: usize) -> Vec<Commit> {
        let mut store = lapis::index::MetadataStore::new(repo.meta_dir().join("index.db"))
            .await
            .unwrap();
        let mut commits = Vec::new();
        let mut parent = None;

        sqlx::query("PRAGMA foreign_keys=OFF")
            .execute(store.write_conn())
            .await
            .unwrap();

        for idx in 0..depth {
            let manifest = Manifest {
                file_path: PathBuf::from(format!("artifact-{}.bin", idx)),
                chunk_hashes: vec![[idx as u8 + 1; 32], [idx as u8 + 11; 32]],
                total_size: (idx as u64) + 42,
                chunking_params: lapis::vcs::ChunkingParams {
                    min_size: lapis::chunking::config::MIN_CHUNK_SIZE,
                    avg_size: lapis::chunking::config::AVG_CHUNK_SIZE,
                    max_size: lapis::chunking::config::MAX_CHUNK_SIZE,
                },
            };
            let manifest_hash = manifest.hash().unwrap();
            let mut commit = Commit::create(parent, manifest_hash, &format!("push-{}", idx)).unwrap();
            commit.timestamp = 1_700_001_000 + idx as u64;
            commit.hash = lapis::crypto::hash_bytes(&commit.signing_payload().unwrap());

            sqlx::query(
                "INSERT INTO manifests (hash, file_path, chunk_list, total_size, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )
            .bind(manifest_hash.to_vec())
            .bind(manifest.file_path.to_string_lossy().to_string())
            .bind(serde_json::to_string(&manifest.chunk_hashes).unwrap())
            .bind(manifest.total_size as i64)
            .bind(commit.timestamp as i64)
            .execute(store.write_conn())
            .await
            .unwrap();

            sqlx::query(
                "INSERT INTO commits (hash, parent_hash, manifest_hash, timestamp, message, signature)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )
            .bind(commit.hash.to_vec())
            .bind(commit.parent.map(|hash| hash.to_vec()))
            .bind(manifest_hash.to_vec())
            .bind(commit.timestamp as i64)
            .bind(&commit.message)
            .bind(None::<Vec<u8>>)
            .execute(store.write_conn())
            .await
            .unwrap();

            parent = Some(commit.hash);
            commits.push(commit);
        }

        sqlx::query("PRAGMA foreign_keys=ON")
            .execute(store.write_conn())
            .await
            .unwrap();

        fs::write(repo.lapis_dir().join("HEAD"), hex::encode(commits.last().unwrap().hash)).unwrap();
        commits
    }

    #[test]
    fn test_check_blocks_request_serialization() {
        let req = CheckBlocksRequest {
            hashes: vec!["aabbccdd".to_string()],
        };
        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("hashes"));
        assert!(json.contains("aabbccdd"));
    }

    #[test]
    fn test_check_blocks_response_deserialization() {
        let json = r#"{"needed": ["hash1", "hash2"]}"#;
        let resp: CheckBlocksResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.needed.len(), 2);
        assert_eq!(resp.needed[0], "hash1");
    }

    #[test]
    fn test_load_head_metadata_reads_local_commit_and_manifest() {
        let temp_dir = TempDir::new().unwrap();
        let repo = Repository::init(temp_dir.path().join("repo")).unwrap();
        let manifest = Manifest {
            file_path: PathBuf::from("artifact.bin"),
            chunk_hashes: vec![[7u8; 32], [8u8; 32]],
            total_size: 42,
            chunking_params: lapis::vcs::ChunkingParams {
                min_size: lapis::chunking::config::MIN_CHUNK_SIZE,
                avg_size: lapis::chunking::config::AVG_CHUNK_SIZE,
                max_size: lapis::chunking::config::MAX_CHUNK_SIZE,
            },
        };
        let manifest_hash = manifest.hash().unwrap();
        let mut commit = Commit::create(None, manifest_hash, "push head").unwrap();
        commit.timestamp = 1_700_000_123;
        commit.hash = lapis::crypto::hash_bytes(&commit.signing_payload().unwrap());

        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let mut store = lapis::index::MetadataStore::new(repo.meta_dir().join("index.db"))
                .await
                .unwrap();
            sqlx::query(
                "INSERT OR IGNORE INTO manifests (hash, file_path, chunk_list, total_size, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )
            .bind(manifest_hash.to_vec())
            .bind("artifact.bin")
            .bind(serde_json::to_string(&manifest.chunk_hashes).unwrap())
            .bind(manifest.total_size as i64)
            .bind(commit.timestamp as i64)
            .execute(store.write_conn())
            .await
            .unwrap();
            sqlx::query(
                "INSERT INTO commits (hash, parent_hash, manifest_hash, timestamp, message, signature)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )
            .bind(commit.hash.to_vec())
            .bind(commit.parent.map(|hash| hash.to_vec()))
            .bind(manifest_hash.to_vec())
            .bind(commit.timestamp as i64)
            .bind(&commit.message)
            .bind(None::<Vec<u8>>)
            .execute(store.write_conn())
            .await
            .unwrap();
        });
        fs::write(repo.lapis_dir().join("HEAD"), hex::encode(commit.hash)).unwrap();

        let metadata = rt
            .block_on(async { lapis::server::load_head_metadata_from_repo(repo.root()).await })
            .unwrap();
        assert_eq!(metadata.head_commit, hex::encode(commit.hash));
        assert_eq!(metadata.parent_hash, commit.parent.map(hex::encode));
        assert_eq!(metadata.manifest_hash, hex::encode(manifest_hash));
        assert_eq!(metadata.message, commit.message);
        assert_eq!(metadata.timestamp, commit.timestamp as i64);
        assert_eq!(
            metadata.chunk_hashes,
            manifest
                .chunk_hashes
                .iter()
                .map(hex::encode)
                .collect::<Vec<_>>()
        );
        assert_eq!(metadata.file_path, "artifact.bin");
        assert_eq!(metadata.total_size, manifest.total_size);
    }

    #[test]
    fn test_load_push_metadata_chain_includes_ancestry_blocks() {
        let temp_dir = TempDir::new().unwrap();
        let repo = Repository::init(temp_dir.path().join("repo")).unwrap();
        let rt = tokio::runtime::Runtime::new().unwrap();

        let commits = rt.block_on(async { seed_push_history(&repo, 3).await });
        let metadata = rt
            .block_on(async { load_push_metadata_chain_from_repo(repo.root()).await })
            .unwrap();

        assert_eq!(metadata.head_commit, hex::encode(commits[2].hash));
        assert_eq!(metadata.commits.len(), 3);

        let mut all_hashes = metadata
            .commits
            .iter()
            .flat_map(|commit| commit.chunk_hashes.iter().cloned())
            .collect::<Vec<_>>();
        all_hashes.sort();
        all_hashes.dedup();

        assert_eq!(all_hashes.len(), 6);
        assert_eq!(metadata.commits[0].commit_hash, hex::encode(commits[2].hash));
        assert_eq!(metadata.commits[2].commit_hash, hex::encode(commits[0].hash));
    }
}
