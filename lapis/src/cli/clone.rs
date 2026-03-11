//! `lapis clone` command scaffolding
//!
//! Slice 1: shallow clone metadata fetch only
//! Slice 2+: repository initialization and metadata storage

use lapis::error::Result;
use lapis::index::MetadataStore;
use lapis::repo::Repository;
use lapis::server::{persist_push_metadata, PushCommitMetadata, PushMetadataRequest};
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CloneCommitMetadata {
    pub commit_hash: String,
    /// Hex-encoded parent commit hash if any (64 chars), or null if no parent
    pub parent_hash: Option<String>,
    /// Hex-encoded manifest hash for this commit (64 chars)
    pub manifest_hash: String,
    /// Commit message
    pub message: String,
    /// Commit timestamp (Unix seconds)
    pub timestamp: i64,
    pub signature: Option<String>,
    /// File path of the manifest in the repository
    pub file_path: String,
    /// List of hex-encoded chunk hashes (64 chars each) in manifest order
    pub chunk_hashes: Vec<String>,
    pub total_size: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CloneMetadataResponse {
    pub head_commit: String,
    pub commits: Vec<CloneCommitMetadata>,
}

pub async fn fetch_clone_metadata(server_url: &str, depth: usize) -> Result<CloneMetadataResponse> {
    let client = reqwest::Client::new();
    let url = format!("{}/meta/clone?depth={}", server_url, depth.max(1));

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| {
            lapis::error::LapisError::Network(format!("Failed to fetch clone metadata: {}", e))
        })?
        .json::<CloneMetadataResponse>()
        .await
        .map_err(|e| {
            lapis::error::LapisError::Network(format!("Failed to parse clone metadata: {}", e))
        })?;

    Ok(response)
}

/// Execute the clone command
pub async fn execute(args: super::CloneArgs) -> Result<()> {
    let depth = args.depth.unwrap_or(1);

    println!(
        "Cloning from {} to {} (depth={})...",
        args.url, args.path, depth
    );

    // Fetch clone metadata from remote
    let metadata = fetch_clone_metadata(&args.url, depth).await?;

    let head = metadata.commits.first().ok_or_else(|| {
        lapis::error::LapisError::Metadata("Remote clone metadata did not include any commits".to_string())
    })?;

    println!("Remote HEAD: {}", &metadata.head_commit[0..8]);
    println!("Depth fetched: {}", metadata.commits.len());
    println!("HEAD file: {}", head.file_path);
    println!("HEAD chunks: {}", head.chunk_hashes.len());

    // Initialize destination repository in blocking context
    println!("Initializing repository...");
    let repo = tokio::task::block_in_place(|| Repository::init(&args.path))?;

    // Persist metadata to local database
    persist_clone_metadata(&repo, &metadata).await?;

    // Persist remote URL for lazy fetching
    persist_remote_url(&repo, &args.url)?;

    println!("Clone complete at {}", args.path);

    Ok(())
}

/// Persist fetched clone metadata to local database
async fn persist_clone_metadata(repo: &Repository, metadata: &CloneMetadataResponse) -> Result<()> {
    persist_push_metadata(
        repo.root(),
        &PushMetadataRequest {
            head_commit: metadata.head_commit.clone(),
            commits: metadata
                .commits
                .iter()
                .map(|commit| PushCommitMetadata {
                    commit_hash: commit.commit_hash.clone(),
                    parent_hash: commit.parent_hash.clone(),
                    manifest_hash: commit.manifest_hash.clone(),
                    message: commit.message.clone(),
                    timestamp: commit.timestamp,
                    signature: commit.signature.clone(),
                    chunk_hashes: commit.chunk_hashes.clone(),
                    file_path: commit.file_path.clone(),
                    total_size: commit.total_size,
                })
                .collect(),
        },
    )
    .await?;

    let head_commit = decode_hash(&metadata.head_commit, "head_commit")?;
    let mut store = MetadataStore::new(repo.meta_dir().join("index.db")).await?;

    sqlx::query(
        "INSERT INTO reflog (commit_hash, action, timestamp)
         VALUES (?1, ?2, ?3)",
    )
    .bind(head_commit.to_vec())
    .bind("clone")
    .bind(chrono::Utc::now().timestamp())
    .execute(store.write_conn())
    .await
        .map_err(|e| {
            lapis::error::LapisError::Database(format!("Failed to insert reflog entry: {}", e))
        })?;

    let head_file = repo.lapis_dir().join("HEAD");
    fs::write(&head_file, hex::encode(head_commit)).map_err(|e| lapis::error::LapisError::Io(e))?;

    Ok(())
}

/// Persist remote URL for lazy block fetching during checkout
fn persist_remote_url(repo: &Repository, url: &str) -> Result<()> {
    let remote_file = repo.lapis_dir().join("remote");
    fs::write(&remote_file, url).map_err(|e| lapis::error::LapisError::Io(e))?;
    Ok(())
}

fn decode_hash(hash: &str, label: &str) -> Result<[u8; 32]> {
    let decoded = hex::decode(hash)
        .map_err(|e| lapis::error::LapisError::Metadata(format!("Invalid {} hex: {}", label, e)))?;

    let bytes: [u8; 32] = decoded
        .try_into()
        .map_err(|_| lapis::error::LapisError::Metadata(format!("{} must be 32 bytes", label)))?;

    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        extract::{Path, State},
        http::StatusCode,
        response::IntoResponse,
        routing::get,
        Json, Router,
    };
    use lapis::store::CasStore;
    use lapis::vcs::{serialize_manifest_from_storage, Commit};
    use sqlx::Row;
    use std::{
        collections::HashMap,
        sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        },
    };
    use tempfile::TempDir;
    use tokio::net::TcpListener;

    #[derive(Clone)]
    struct TestServerState {
        metadata: CloneMetadataResponse,
        blocks: Arc<HashMap<String, Vec<u8>>>,
        block_requests: Arc<AtomicUsize>,
    }

    async fn serve_clone_metadata(
        State(state): State<TestServerState>,
    ) -> Json<CloneMetadataResponse> {
        Json(state.metadata)
    }

    async fn serve_block(
        State(state): State<TestServerState>,
        Path(hash): Path<String>,
    ) -> impl IntoResponse {
        state.block_requests.fetch_add(1, Ordering::SeqCst);
        match state.blocks.get(&hash) {
            Some(data) => (StatusCode::OK, data.clone()).into_response(),
            None => StatusCode::NOT_FOUND.into_response(),
        }
    }

    async fn spawn_test_clone_server(
        metadata: CloneMetadataResponse,
        blocks: HashMap<String, Vec<u8>>,
    ) -> (String, Arc<AtomicUsize>) {
        let block_requests = Arc::new(AtomicUsize::new(0));
        let state = TestServerState {
            metadata,
            blocks: Arc::new(blocks),
            block_requests: block_requests.clone(),
        };
        let app = Router::new()
            .route("/meta/clone", get(serve_clone_metadata))
            .route("/blocks/:hash", get(serve_block))
            .with_state(state);
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        (format!("http://{}", addr), block_requests)
    }

    fn build_clone_commit_metadata(
        parent_hash: Option<String>,
        file_path: &str,
        chunk_hashes: Vec<String>,
        total_size: u64,
        message: &str,
        timestamp: u64,
    ) -> CloneCommitMetadata {
        let chunk_bytes = chunk_hashes
            .iter()
            .map(|hash| decode_hash(hash, "chunk_hash").unwrap())
            .collect::<Vec<_>>();
        let chunk_list_json = serde_json::to_string(&chunk_bytes).unwrap();
        let manifest_bytes =
            serialize_manifest_from_storage(file_path, &chunk_list_json, total_size).unwrap();
        let manifest_hash = lapis::crypto::hash_bytes(&manifest_bytes);

        let mut commit = Commit {
            hash: [0u8; 32],
            parent: parent_hash
                .as_deref()
                .map(|hash| decode_hash(hash, "parent_hash").unwrap()),
            manifest_hash,
            timestamp,
            message: message.to_string(),
            signature: None,
        };
        commit.hash = lapis::crypto::hash_bytes(&commit.object_bytes().unwrap());

        CloneCommitMetadata {
            commit_hash: hex::encode(commit.hash),
            parent_hash,
            manifest_hash: hex::encode(manifest_hash),
            message: message.to_string(),
            timestamp: timestamp as i64,
            signature: None,
            file_path: file_path.to_string(),
            chunk_hashes,
            total_size,
        }
    }

    #[test]
    fn test_clone_metadata_response_parsing() {
        let json = r#"{
            "head_commit": "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
            "commits": [{
                "commit_hash": "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
                "parent_hash": "def456abc123def456abc123def456abc123def456abc123def456abc123def456",
                "manifest_hash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
                "message": "Initial commit",
                "timestamp": 1678345200,
                "signature": null,
                "file_path": "path/to/file.txt",
                "chunk_hashes": [
                    "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
                    "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
                ],
                "total_size": 42
            }]
        }"#;

        let response: CloneMetadataResponse =
            serde_json::from_str(json).expect("parse clone metadata");
        assert_eq!(response.head_commit.len(), 64);
        assert_eq!(response.commits.len(), 1);
        assert_eq!(response.commits[0].manifest_hash.len(), 64);
        assert_eq!(response.commits[0].message, "Initial commit");
        assert_eq!(response.commits[0].timestamp, 1678345200);
        assert_eq!(response.commits[0].file_path, "path/to/file.txt");
        assert_eq!(response.commits[0].chunk_hashes.len(), 2);
        assert_eq!(response.commits[0].total_size, 42);
        assert!(response.commits[0].parent_hash.is_some());
    }

    #[test]
    fn test_clone_metadata_response_no_parent() {
        let json = r#"{
            "head_commit": "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
            "commits": [{
                "commit_hash": "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
                "parent_hash": null,
                "manifest_hash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
                "message": "Initial commit (no parent)",
                "timestamp": 1678345200,
                "signature": null,
                "file_path": "file.txt",
                "chunk_hashes": [],
                "total_size": 0
            }]
        }"#;

        let response: CloneMetadataResponse =
            serde_json::from_str(json).expect("parse clone metadata");
        assert!(response.commits[0].parent_hash.is_none());
        assert_eq!(response.commits[0].chunk_hashes.len(), 0);
    }

    #[test]
    fn test_clone_metadata_response_serialization() {
        let response = CloneMetadataResponse {
            head_commit: "a".repeat(64),
            commits: vec![CloneCommitMetadata {
                commit_hash: "a".repeat(64),
                parent_hash: Some("b".repeat(64)),
                manifest_hash: "c".repeat(64),
                message: "Test commit".to_string(),
                timestamp: 1678345200,
                signature: None,
                file_path: "test.txt".to_string(),
                chunk_hashes: vec!["d".repeat(64)],
                total_size: 99,
            }],
        };

        let json = serde_json::to_string(&response).expect("serialize clone metadata");
        let parsed: CloneMetadataResponse =
            serde_json::from_str(&json).expect("deserialize clone metadata");
        assert_eq!(parsed.head_commit, response.head_commit);
        assert_eq!(parsed.commits[0].message, response.commits[0].message);
    }

    #[test]
    fn test_persist_remote_url() {
        let temp_dir = TempDir::new().expect("create temp dir");
        let repo_path = temp_dir.path();
        let repo = lapis::repo::Repository::init(repo_path).expect("init repo");

        let test_url = "http://example.com:8080/repo";
        persist_remote_url(&repo, test_url).expect("persist remote url");

        let remote_file = repo.lapis_dir().join("remote");
        assert!(remote_file.exists(), "remote file should exist");

        let stored_url = std::fs::read_to_string(&remote_file).expect("read remote file");
        assert_eq!(
            stored_url, test_url,
            "stored URL should match persisted URL"
        );
    }

    #[test]
    fn test_execute_accepts_depth_greater_than_one_as_head_only_clone() {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("create runtime");

        rt.block_on(async {
            let temp_dir = TempDir::new().expect("create temp dir");
            let clone_path = temp_dir.path().join("clone");
            let commit = build_clone_commit_metadata(
                Some("22".repeat(32)),
                "nested/file.txt",
                vec!["44".repeat(32)],
                6,
                "clone head",
                1_700_000_123,
            );
            let metadata = CloneMetadataResponse {
                head_commit: commit.commit_hash.clone(),
                commits: vec![commit],
            };

            let (server_url, block_requests) =
                spawn_test_clone_server(metadata, HashMap::new()).await;

            execute(super::super::CloneArgs {
                url: server_url,
                path: clone_path.to_string_lossy().to_string(),
                depth: Some(2),
            })
            .await
            .expect("clone should succeed");

            assert_eq!(block_requests.load(Ordering::SeqCst), 0);
            assert!(!clone_path.join("nested/file.txt").exists());
        });
    }

    #[test]
    fn test_execute_persists_lazy_clone_metadata_without_materializing_working_tree() {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("create runtime");

        rt.block_on(async {
            let temp_dir = TempDir::new().expect("create temp dir");
            let clone_path = temp_dir.path().join("clone");

            let chunk1 = b"hello ".to_vec();
            let chunk2 = b"world\n".to_vec();
            let chunk1_hash = hex::encode(blake3::hash(&chunk1).as_bytes());
            let chunk2_hash = hex::encode(blake3::hash(&chunk2).as_bytes());
            let commit = build_clone_commit_metadata(
                Some("22".repeat(32)),
                "nested/file.txt",
                vec![chunk1_hash.clone(), chunk2_hash.clone()],
                12,
                "clone head",
                1_700_000_123,
            );
            let metadata = CloneMetadataResponse {
                head_commit: commit.commit_hash.clone(),
                commits: vec![commit],
            };

            let (server_url, block_requests) = spawn_test_clone_server(
                metadata.clone(),
                HashMap::from([(chunk1_hash, chunk1.clone()), (chunk2_hash, chunk2.clone())]),
            )
            .await;

            execute(super::super::CloneArgs {
                url: server_url.clone(),
                path: clone_path.to_string_lossy().to_string(),
                depth: Some(1),
            })
            .await
            .expect("clone should succeed");

            assert!(!clone_path.join("nested/file.txt").exists());
            assert_eq!(block_requests.load(Ordering::SeqCst), 0);
            assert_eq!(
                fs::read_to_string(clone_path.join(".lapis/HEAD"))
                    .expect("read HEAD")
                    .trim(),
                metadata.head_commit
            );
            assert_eq!(
                fs::read_to_string(clone_path.join(".lapis/remote"))
                    .expect("read remote")
                    .trim(),
                server_url
            );

            let repo = Repository::open(&clone_path).expect("open cloned repo");
            let cas = CasStore::new(repo.store_hot_dir()).expect("open cas");
            let store = MetadataStore::new(repo.meta_dir().join("index.db"))
                .await
                .expect("open metadata store");

            let commit_row = sqlx::query(
                "SELECT parent_hash, manifest_hash, message FROM commits WHERE hash = ?1",
            )
            .bind(hex::decode(&metadata.head_commit).unwrap())
            .fetch_one(store.read_pool())
            .await
            .expect("fetch commit row");
            let manifest_row =
                sqlx::query("SELECT file_path, total_size FROM manifests WHERE hash = ?1")
                    .bind(hex::decode(&metadata.commits[0].manifest_hash).unwrap())
                    .fetch_one(store.read_pool())
                    .await
                    .expect("fetch manifest row");

            assert_eq!(
                commit_row.get::<Option<Vec<u8>>, _>("parent_hash"),
                Some(hex::decode(metadata.commits[0].parent_hash.as_ref().unwrap()).unwrap())
            );
            assert_eq!(
                commit_row.get::<Vec<u8>, _>("manifest_hash"),
                hex::decode(&metadata.commits[0].manifest_hash).unwrap()
            );
            assert_eq!(commit_row.get::<String, _>("message"), metadata.commits[0].message);
            assert_eq!(
                manifest_row.get::<String, _>("file_path"),
                metadata.commits[0].file_path
            );
            assert_eq!(manifest_row.get::<i64, _>("total_size"), 12);

            let commit_hash = decode_hash(&metadata.commits[0].commit_hash, "commit_hash")
                .expect("decode commit hash");
            let manifest_hash = decode_hash(&metadata.commits[0].manifest_hash, "manifest_hash")
                .expect("decode manifest hash");
            assert!(cas.exists(&commit_hash).expect("commit object exists"));
            assert!(cas.exists(&manifest_hash).expect("manifest object exists"));
            assert_eq!(
                cas.get(&manifest_hash).expect("read manifest object"),
                serialize_manifest_from_storage(
                    &metadata.commits[0].file_path,
                    &serde_json::to_string(&vec![
                        decode_hash(&metadata.commits[0].chunk_hashes[0], "chunk_hash").unwrap(),
                        decode_hash(&metadata.commits[0].chunk_hashes[1], "chunk_hash").unwrap(),
                    ])
                    .expect("serialize chunk list"),
                    metadata.commits[0].total_size,
                )
                .expect("serialize manifest object")
            );
            let commit_object = Commit {
                hash: commit_hash,
                parent: metadata.commits[0]
                    .parent_hash
                    .as_deref()
                    .map(|hash| decode_hash(hash, "parent_hash").expect("decode parent hash")),
                manifest_hash,
                timestamp: metadata.commits[0].timestamp as u64,
                message: metadata.commits[0].message.clone(),
                signature: None,
            };
            assert_eq!(
                cas.get(&commit_hash).expect("read commit object"),
                commit_object.object_bytes().expect("serialize commit object")
            );
        });
    }

    #[test]
    fn test_execute_persists_requested_shallow_history() {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("create runtime");

        rt.block_on(async {
            let temp_dir = TempDir::new().expect("create temp dir");
            let clone_path = temp_dir.path().join("clone");

            let first = build_clone_commit_metadata(
                None,
                "first.txt",
                vec!["66".repeat(32)],
                1,
                "first",
                100,
            );
            let second = build_clone_commit_metadata(
                Some(first.commit_hash.clone()),
                "second.txt",
                vec!["55".repeat(32)],
                2,
                "second",
                200,
            );
            let third = build_clone_commit_metadata(
                Some(second.commit_hash.clone()),
                "third.txt",
                vec!["44".repeat(32)],
                3,
                "third",
                300,
            );
            let metadata = CloneMetadataResponse {
                head_commit: third.commit_hash.clone(),
                commits: vec![third, second, first],
            };

            let (server_url, block_requests) = spawn_test_clone_server(metadata.clone(), HashMap::new()).await;

            execute(super::super::CloneArgs {
                url: server_url,
                path: clone_path.to_string_lossy().to_string(),
                depth: Some(3),
            })
            .await
            .expect("clone should succeed");

            assert_eq!(block_requests.load(Ordering::SeqCst), 0);

            let repo = Repository::open(&clone_path).expect("open cloned repo");
            let store = MetadataStore::new(repo.meta_dir().join("index.db"))
                .await
                .expect("open metadata store");

            let commit_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM commits WHERE hash IN (?1, ?2, ?3)",
            )
            .bind(hex::decode(&metadata.commits[0].commit_hash).unwrap())
            .bind(hex::decode(&metadata.commits[1].commit_hash).unwrap())
            .bind(hex::decode(&metadata.commits[2].commit_hash).unwrap())
            .fetch_one(store.read_pool())
            .await
            .expect("count commits");

            assert_eq!(commit_count, 3);

            let middle_parent: Option<Vec<u8>> = sqlx::query_scalar(
                "SELECT parent_hash FROM commits WHERE hash = ?1",
            )
            .bind(hex::decode(&metadata.commits[1].commit_hash).unwrap())
            .fetch_one(store.read_pool())
            .await
            .expect("fetch middle parent");

            assert_eq!(
                middle_parent,
                Some(hex::decode(metadata.commits[1].parent_hash.as_ref().unwrap()).unwrap())
            );
        });
    }
}
