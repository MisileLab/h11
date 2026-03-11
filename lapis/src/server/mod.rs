//! HTTP server for Lapis block storage and retrieval
//!
//! Provides REST endpoints:
//! - GET /blocks/{hash} — retrieve a block by BLAKE3 hash
//! - POST /blocks — upload a block into CAS
//! - POST /blocks/check — check which hashes are present in the store

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::collections::HashSet;
use std::fs;
use std::path::{Path as FsPath, PathBuf};
use std::sync::Arc;
use tokio::net::TcpListener;

use crate::error::Result;
use crate::index::MetadataStore;
use crate::store::CasStore;
use crate::vcs::{serialize_manifest_from_storage, Commit};

/// Server state shared across all request handlers
#[derive(Clone)]
pub struct ServerState {
    cas: Arc<CasStore>,
    repo_dir: PathBuf,
}

/// Request body for POST /blocks/check
#[derive(Debug, Serialize, Deserialize)]
pub struct CheckBlocksRequest {
    /// List of hashes (hex-encoded 64-char strings) to check
    pub hashes: Vec<String>,
}

/// Response body for POST /blocks/check
#[derive(Debug, Serialize, Deserialize)]
pub struct CheckBlocksResponse {
    /// Hashes that the server needs (not already present in store)
    pub needed: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BlockRefcountsRequest {
    pub hashes: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BlockRefcountsResponse {
    pub refcounts: std::collections::HashMap<String, u64>,
}

/// Response body for GET /meta/head — remote HEAD metadata for pull discovery
#[derive(Debug, Serialize, Deserialize)]
pub struct HeadMetadataResponse {
    /// Hex-encoded commit hash of remote HEAD (64 chars)
    pub head_commit: String,
    /// Hex-encoded parent commit hash if any (64 chars), or null if no parent
    pub parent_hash: Option<String>,
    /// Hex-encoded manifest hash for this commit (64 chars)
    pub manifest_hash: String,
    /// Commit message
    pub message: String,
    /// Commit timestamp (Unix seconds)
    pub timestamp: i64,
    pub signature: Option<String>,
    /// List of hex-encoded chunk hashes (64 chars each) in manifest order
    pub chunk_hashes: Vec<String>,
    /// File path of the manifest in the repository
    pub file_path: String,
    pub total_size: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PushCommitMetadata {
    pub commit_hash: String,
    pub parent_hash: Option<String>,
    pub manifest_hash: String,
    pub message: String,
    pub timestamp: i64,
    pub signature: Option<String>,
    pub chunk_hashes: Vec<String>,
    pub file_path: String,
    pub total_size: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PushMetadataRequest {
    pub head_commit: String,
    pub commits: Vec<PushCommitMetadata>,
}

/// Response body for GET /meta/clone — shallow clone metadata for HEAD only
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ShallowCloneCommitMetadata {
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

#[derive(Debug, Serialize, Deserialize)]
pub struct ShallowCloneMetadataResponse {
    pub head_commit: String,
    pub commits: Vec<ShallowCloneCommitMetadata>,
}

#[derive(Debug, Deserialize)]
struct CloneQuery {
    depth: Option<usize>,
}

/// Start the HTTP server on the specified port
///
/// # Arguments
///
/// * `port` - Port number to listen on (default 3000 if called with 0)
/// * `store_path` - Path to the hot-zone CAS store root (e.g., `<repo>/.lapis/store/hot`)
///
/// # Returns
///
/// Returns a Result; on success, the server runs indefinitely until ctrl-C
pub async fn start(port: u16, store_path: &str) -> Result<()> {
    let cas = Arc::new(CasStore::new(store_path)?);
    let store_path_buf = std::path::PathBuf::from(store_path);
    let repo_dir = store_path_buf
        .parent() // .lapis/store
        .and_then(|p| p.parent()) // .lapis
        .and_then(|p| p.parent()) // repo root
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    let state = ServerState { cas, repo_dir };

    let app = router(state);

    let listener = TcpListener::bind(format!("127.0.0.1:{}", port))
        .await
        .map_err(|e| crate::error::LapisError::Io(e))?;

    let addr = listener
        .local_addr()
        .map_err(|e| crate::error::LapisError::Io(e))?;

    eprintln!("Lapis server listening on http://{}", addr);

    axum::serve(listener, app).await.map_err(|e| {
        crate::error::LapisError::Io(std::io::Error::new(std::io::ErrorKind::Other, e))
    })
}

/// Build the router with all endpoints
fn router(state: ServerState) -> Router {
    Router::new()
        .route("/blocks/:hash", get(get_block))
        .route("/blocks", post(post_block))
        .route("/blocks/check", post(check_blocks))
        .route("/blocks/refcounts", post(block_refcounts))
        .route("/meta/head", get(get_head_metadata))
        .route("/meta/push", post(post_head_metadata))
        .route("/meta/clone", get(get_shallow_clone_metadata))
        .with_state(state)
}

pub async fn load_head_metadata_from_repo(
    repo_dir: &FsPath,
) -> crate::error::Result<HeadMetadataResponse> {
    let head_commit_hash = read_head_commit(repo_dir)?;
    let db_path = repo_dir.join(".lapis").join("meta").join("index.db");
    query_head_metadata(&db_path, &head_commit_hash).await
}

pub async fn load_push_metadata_chain_from_repo(
    repo_dir: &FsPath,
) -> crate::error::Result<PushMetadataRequest> {
    let head_commit_hash = read_head_commit(repo_dir)?;
    let db_path = repo_dir.join(".lapis").join("meta").join("index.db");
    query_push_metadata_chain(&db_path, &head_commit_hash).await
}

pub async fn persist_head_metadata(
    repo_dir: &FsPath,
    metadata: &HeadMetadataResponse,
) -> crate::error::Result<()> {
    persist_push_metadata(
        repo_dir,
        &PushMetadataRequest {
            head_commit: metadata.head_commit.clone(),
            commits: vec![PushCommitMetadata {
                commit_hash: metadata.head_commit.clone(),
                parent_hash: metadata.parent_hash.clone(),
                manifest_hash: metadata.manifest_hash.clone(),
                message: metadata.message.clone(),
                timestamp: metadata.timestamp,
                signature: metadata.signature.clone(),
                chunk_hashes: metadata.chunk_hashes.clone(),
                file_path: metadata.file_path.clone(),
                total_size: metadata.total_size,
            }],
        },
    )
    .await
}

pub async fn persist_push_metadata(
    repo_dir: &FsPath,
    metadata: &PushMetadataRequest,
) -> crate::error::Result<()> {
    let db_path = repo_dir.join(".lapis").join("meta").join("index.db");
    let cas = CasStore::new(repo_dir.join(".lapis").join("store").join("hot"))?;
    let mut store = MetadataStore::new(&db_path).await?;
    let head_commit = decode_hash(&metadata.head_commit, "head_commit")?;
    let mut saw_head = false;
    let mut seen_commits = HashSet::new();

    sqlx::query("PRAGMA foreign_keys=OFF")
        .execute(store.write_conn())
        .await
        .map_err(|e| {
            crate::error::LapisError::Database(format!("Failed to disable FK checks: {}", e))
        })?;

    for commit in metadata.commits.iter().rev() {
        let commit_hash = decode_hash(&commit.commit_hash, "commit_hash")?;
        if !seen_commits.insert(commit_hash) {
            continue;
        }
        if commit_hash == head_commit {
            saw_head = true;
        }

        let manifest_hash = decode_hash(&commit.manifest_hash, "manifest_hash")?;
        let parent_hash = commit
            .parent_hash
            .as_deref()
            .map(|hash| decode_hash(hash, "parent_hash"))
            .transpose()?;
        let chunk_hashes = decode_hashes(&commit.chunk_hashes, "chunk_hash")?;
        let signature = commit
            .signature
            .as_deref()
            .map(|sig| {
                hex::decode(sig).map_err(|e| {
                    crate::error::LapisError::Metadata(format!("Invalid signature hex: {}", e))
                })
            })
            .transpose()?;

        let chunk_list = serde_json::to_string(&chunk_hashes).map_err(|e| {
            crate::error::LapisError::Metadata(format!("Invalid chunk list: {}", e))
        })?;
        persist_manifest_object(
            &cas,
            manifest_hash,
            &commit.file_path,
            &chunk_list,
            commit.total_size,
        )?;
        persist_commit_object(
            &cas,
            Commit {
                hash: commit_hash,
                parent: parent_hash,
                manifest_hash,
                timestamp: commit.timestamp as u64,
                message: commit.message.clone(),
                signature: signature.clone(),
            },
        )?;

        sqlx::query(
            "INSERT OR IGNORE INTO manifests (hash, file_path, chunk_list, total_size, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(manifest_hash.to_vec())
        .bind(&commit.file_path)
        .bind(chunk_list)
        .bind(commit.total_size as i64)
        .bind(commit.timestamp)
        .execute(store.write_conn())
        .await
        .map_err(|e| {
            crate::error::LapisError::Database(format!("Failed to insert manifest: {}", e))
        })?;

        sqlx::query(
            "INSERT OR IGNORE INTO commits (hash, parent_hash, manifest_hash, timestamp, message, signature)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .bind(commit_hash.to_vec())
        .bind(parent_hash.map(|hash| hash.to_vec()))
        .bind(manifest_hash.to_vec())
        .bind(commit.timestamp)
        .bind(&commit.message)
        .bind(signature)
        .execute(store.write_conn())
        .await
        .map_err(|e| {
            crate::error::LapisError::Database(format!("Failed to insert commit: {}", e))
        })?;
    }

    sqlx::query("PRAGMA foreign_keys=ON")
        .execute(store.write_conn())
        .await
        .map_err(|e| {
            crate::error::LapisError::Database(format!("Failed to enable FK checks: {}", e))
        })?;

    if !saw_head {
        return Err(crate::error::LapisError::Metadata(
            "Push metadata did not include the declared HEAD commit".to_string(),
        ));
    }

    Ok(())
}

/// GET /blocks/{hash} — retrieve a block by BLAKE3 hash
///
/// # Path Parameters
///
/// * `hash` - 64-character hex-encoded BLAKE3 hash of the block
///
/// # Response
///
/// - 200 OK with block bytes if block exists
/// - 404 Not Found if block does not exist
/// - 400 Bad Request if hash is invalid hex
async fn get_block(
    State(state): State<ServerState>,
    Path(hash): Path<String>,
) -> impl IntoResponse {
    // Parse hex hash into [u8; 32]
    let hash_bytes = match hex::decode(&hash) {
        Ok(decoded) if decoded.len() == 32 => {
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&decoded);
            arr
        }
        _ => return (StatusCode::BAD_REQUEST, "Invalid hash format").into_response(),
    };

    // Retrieve from CAS
    match state.cas.get(&hash_bytes) {
        Ok(data) => (StatusCode::OK, data).into_response(),
        Err(_) => (StatusCode::NOT_FOUND, "Block not found").into_response(),
    }
}

/// POST /blocks — upload a block into CAS
///
/// # Request Body
///
/// Raw block bytes (not JSON)
///
/// # Response
///
/// - 201 Created with JSON `{"hash": "..."}` on success
/// - 400 Bad Request if write fails
async fn post_block(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    match state.cas.put(&body) {
        Ok(hash) => {
            let response = serde_json::json!({ "hash": hex::encode(hash) });
            (StatusCode::CREATED, Json(response)).into_response()
        }
        Err(e) => {
            let error = format!("Failed to store block: {}", e);
            (StatusCode::BAD_REQUEST, error).into_response()
        }
    }
}

/// POST /blocks/check — check which hashes need to be uploaded
///
/// # Request Body
///
/// JSON with `{"hashes": ["hash1", "hash2", ...]}`
///
/// # Response
///
/// JSON with `{"needed": ["..."]}` containing only hashes the server does NOT have
async fn check_blocks(
    State(state): State<ServerState>,
    Json(req): Json<CheckBlocksRequest>,
) -> impl IntoResponse {
    let mut needed = Vec::new();

    for hash_str in req.hashes {
        // Parse hex hash into [u8; 32]
        match hex::decode(&hash_str) {
            Ok(decoded) if decoded.len() == 32 => {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&decoded);

                // Use exists() for efficient presence check instead of full block read
                match state.cas.exists(&arr) {
                    Ok(false) => needed.push(hash_str),
                    Ok(true) => {
                        // Block already exists; don't include in needed list
                    }
                    Err(_) => {
                        // Treat errors as "block missing" → include in needed list
                        needed.push(hash_str);
                    }
                }
            }
            _ => {
                // Invalid hash format → include in needed list (client should retry with valid hash)
                needed.push(hash_str);
            }
        }
    }

    let response = CheckBlocksResponse { needed };
    (StatusCode::OK, Json(response)).into_response()
}

async fn block_refcounts(
    State(state): State<ServerState>,
    Json(req): Json<BlockRefcountsRequest>,
) -> impl IntoResponse {
    let result = tokio::task::block_in_place(|| {
        let rt = tokio::runtime::Handle::current();
        rt.block_on(async {
            let db_path = state.repo_dir.join(".lapis").join("meta").join("index.db");
            let store = MetadataStore::new(&db_path).await?;
            query_manifest_chunk_refcounts(&store, &req.hashes).await
        })
    });

    match result {
        Ok(refcounts) => (StatusCode::OK, Json(BlockRefcountsResponse { refcounts })).into_response(),
        Err(e) => {
            eprintln!("Failed to query block refcounts: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to query block refcounts",
            )
                .into_response()
        }
    }
}

async fn query_manifest_chunk_refcounts(
    store: &MetadataStore,
    hashes: &[String],
) -> crate::error::Result<std::collections::HashMap<String, u64>> {
    let tracked_hashes: std::collections::HashMap<String, Vec<u8>> = hashes
        .iter()
        .filter_map(|hash| hex::decode(hash).ok().map(|bytes| (hash.clone(), bytes)))
        .filter(|(_, bytes)| bytes.len() == 32)
        .collect();
    let mut refcounts = hashes
        .iter()
        .cloned()
        .map(|hash| (hash, 0u64))
        .collect::<std::collections::HashMap<_, _>>();

    if tracked_hashes.is_empty() {
        return Ok(refcounts);
    }

    let rows = sqlx::query("SELECT chunk_list FROM manifests")
        .fetch_all(store.read_pool())
        .await
        .map_err(|e| {
            crate::error::LapisError::Database(format!(
                "Failed to query manifest chunk lists: {}",
                e
            ))
        })?;

    for row in rows {
        let chunk_list_json: String = row.get("chunk_list");
        let chunk_hashes: Vec<Vec<u8>> = serde_json::from_str(&chunk_list_json).map_err(|e| {
            crate::error::LapisError::Metadata(format!("Invalid chunk_list JSON: {}", e))
        })?;

        for chunk_hash in chunk_hashes {
            for (hash, tracked_bytes) in &tracked_hashes {
                if chunk_hash == *tracked_bytes {
                    if let Some(count) = refcounts.get_mut(hash) {
                        *count += 1;
                    }
                }
            }
        }
    }

    Ok(refcounts)
}

/// GET /meta/head — retrieve remote HEAD commit metadata for pull discovery
///
/// Reads the remote `.lapis/HEAD` file and queries the metadata store to return
/// the HEAD commit hash, its manifest hash, and the ordered list of chunk hashes
/// for reconstruction.
///
/// # Response
///
/// - 200 OK with JSON containing head_commit, manifest_hash, and chunk_hashes
/// - 404 Not Found if HEAD has not been initialized (no commits yet)
/// - 500 Internal Server Error if database or file operations fail
async fn get_head_metadata(State(state): State<ServerState>) -> impl IntoResponse {
    let result = tokio::task::block_in_place(|| {
        let rt = tokio::runtime::Handle::current();
        rt.block_on(async { load_head_metadata_from_repo(&state.repo_dir).await })
    });

    match result {
        Ok(response) => (StatusCode::OK, Json(response)).into_response(),
        Err(e) => {
            eprintln!("Failed to query metadata: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to query metadata",
            )
                .into_response()
        }
    }
}

async fn post_head_metadata(
    State(state): State<ServerState>,
    Json(req): Json<PushMetadataRequest>,
) -> impl IntoResponse {
    let result = tokio::task::block_in_place(|| {
        let rt = tokio::runtime::Handle::current();
        rt.block_on(async {
            persist_push_metadata(&state.repo_dir, &req).await?;
            fs::write(state.repo_dir.join(".lapis").join("HEAD"), &req.head_commit)
                .map_err(crate::error::LapisError::Io)?;
            Ok::<(), crate::error::LapisError>(())
        })
    });

    match result {
        Ok(()) => StatusCode::CREATED.into_response(),
        Err(e) => {
            eprintln!("Failed to persist pushed metadata: {}", e);
            (StatusCode::BAD_REQUEST, "Failed to persist metadata").into_response()
        }
    }
}

/// GET /meta/clone — retrieve shallow clone metadata for HEAD only
///
/// Reads the remote `.lapis/HEAD` file and queries the metadata store to return
/// HEAD commit hash, parent hash, manifest hash, commit message, timestamp, file path,
/// and ordered list of chunk hashes. This is sufficient for a shallow clone of HEAD
/// without downloading all blocks.
///
/// # Response
///
/// - 200 OK with JSON containing head_commit, parent_hash, manifest_hash, message, timestamp, file_path, and chunk_hashes
/// - 404 Not Found if HEAD has not been initialized (no commits yet)
/// - 500 Internal Server Error if database or file operations fail
async fn get_shallow_clone_metadata(
    State(state): State<ServerState>,
    Query(query): Query<CloneQuery>,
) -> impl IntoResponse {
    // Read .lapis/HEAD file from repo directory
    let head_file = state.repo_dir.join(".lapis").join("HEAD");
    let head_commit_hash = match std::fs::read_to_string(&head_file) {
        Ok(content) => {
            let trimmed = content.trim();
            if trimmed.is_empty() {
                return (StatusCode::NOT_FOUND, "HEAD not initialized").into_response();
            }
            match hex::decode(trimmed) {
                Ok(decoded) if decoded.len() == 32 => {
                    let mut arr = [0u8; 32];
                    arr.copy_from_slice(&decoded);
                    arr
                }
                _ => return (StatusCode::BAD_REQUEST, "Invalid HEAD format").into_response(),
            }
        }
        Err(_) => return (StatusCode::NOT_FOUND, "HEAD not initialized").into_response(),
    };

    // Query database for commit metadata
    let db_path = state.repo_dir.join(".lapis").join("meta").join("index.db");
    let depth = query.depth.unwrap_or(1).max(1);

    // Create a blocking task to query the database
    let result = tokio::task::block_in_place(|| {
        let rt = tokio::runtime::Handle::current();
        rt.block_on(async { query_shallow_clone_metadata(&db_path, &head_commit_hash, depth).await })
    });

    match result {
        Ok(response) => (StatusCode::OK, Json(response)).into_response(),
        Err(e) => {
            eprintln!("Failed to query shallow clone metadata: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to query metadata",
            )
                .into_response()
        }
    }
}

/// Query the metadata store for HEAD commit and manifest details
async fn query_head_metadata(
    db_path: &std::path::Path,
    head_commit_hash: &[u8; 32],
) -> crate::error::Result<HeadMetadataResponse> {
    use sqlx::Row;

    let db_url = format!("sqlite://{}?mode=ro", db_path.display());
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&db_url)
        .await
        .map_err(|e| {
            crate::error::LapisError::Database(format!("Failed to connect to metadata db: {}", e))
        })?;

    let commit_row = sqlx::query(
        "SELECT manifest_hash, parent_hash, message, timestamp, signature FROM commits WHERE hash = ?1",
    )
        .bind(head_commit_hash.to_vec())
        .fetch_optional(&pool)
        .await
        .map_err(|e| crate::error::LapisError::Database(format!("Failed to query commits: {}", e)))?
        .ok_or_else(|| crate::error::LapisError::Metadata("HEAD commit not found in database".to_string()))?;

    let manifest_hash_bytes: Vec<u8> = commit_row.get("manifest_hash");
    let manifest_hash_str = hex::encode(&manifest_hash_bytes);
    let parent_hash: Option<Vec<u8>> = commit_row.get("parent_hash");
    let message: String = commit_row.get("message");
    let timestamp: i64 = commit_row.get("timestamp");
    let signature: Option<Vec<u8>> = commit_row.get("signature");

    let manifest_row =
        sqlx::query("SELECT chunk_list, file_path, total_size FROM manifests WHERE hash = ?1")
            .bind(&manifest_hash_bytes)
            .fetch_optional(&pool)
            .await
            .map_err(|e| {
                crate::error::LapisError::Database(format!("Failed to query manifests: {}", e))
            })?
            .ok_or_else(|| {
                crate::error::LapisError::Metadata("Manifest not found in database".to_string())
            })?;

    let chunk_list_json: String = manifest_row.get("chunk_list");
    let file_path: String = manifest_row.get("file_path");
    let total_size: i64 = manifest_row.get("total_size");

    // Parse JSON chunk list: stored as Vec<[u8; 32]> (byte arrays), convert to hex strings for transport
    let byte_arrays: Vec<[u8; 32]> = serde_json::from_str(&chunk_list_json).map_err(|e| {
        crate::error::LapisError::Metadata(format!("Invalid chunk_list JSON: {}", e))
    })?;
    let chunk_hashes: Vec<String> = byte_arrays
        .into_iter()
        .map(|arr| hex::encode(arr))
        .collect();

    Ok(HeadMetadataResponse {
        head_commit: hex::encode(head_commit_hash),
        parent_hash: parent_hash.map(hex::encode),
        manifest_hash: manifest_hash_str,
        message,
        timestamp,
        signature: signature.map(hex::encode),
        chunk_hashes,
        file_path,
        total_size: total_size as u64,
    })
}

async fn query_push_metadata_chain(
    db_path: &std::path::Path,
    head_commit_hash: &[u8; 32],
) -> crate::error::Result<PushMetadataRequest> {
    use sqlx::Row;

    let db_url = format!("sqlite://{}?mode=ro", db_path.display());
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&db_url)
        .await
        .map_err(|e| {
            crate::error::LapisError::Database(format!("Failed to connect to metadata db: {}", e))
        })?;

    let mut commits = Vec::new();
    let mut current_hash = Some(*head_commit_hash);
    let mut seen = HashSet::new();

    while let Some(hash) = current_hash {
        if !seen.insert(hash) {
            break;
        }

        let commit_row = sqlx::query(
            "SELECT manifest_hash, parent_hash, message, timestamp, signature FROM commits WHERE hash = ?1",
        )
        .bind(hash.to_vec())
        .fetch_optional(&pool)
        .await
        .map_err(|e| crate::error::LapisError::Database(format!("Failed to query commits: {}", e)))?
        .ok_or_else(|| {
            crate::error::LapisError::Metadata("HEAD commit not found in database".to_string())
        })?;

        let manifest_hash_bytes: Vec<u8> = commit_row.get("manifest_hash");
        let parent_hash_opt: Option<Vec<u8>> = commit_row.get("parent_hash");
        let message: String = commit_row.get("message");
        let timestamp: i64 = commit_row.get("timestamp");
        let signature: Option<Vec<u8>> = commit_row.get("signature");

        let manifest_row = sqlx::query(
            "SELECT chunk_list, file_path, total_size FROM manifests WHERE hash = ?1",
        )
        .bind(&manifest_hash_bytes)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            crate::error::LapisError::Database(format!("Failed to query manifests: {}", e))
        })?
        .ok_or_else(|| {
            crate::error::LapisError::Metadata("Manifest not found in database".to_string())
        })?;

        let chunk_list_json: String = manifest_row.get("chunk_list");
        let file_path: String = manifest_row.get("file_path");
        let total_size: i64 = manifest_row.get("total_size");
        let byte_arrays: Vec<[u8; 32]> = serde_json::from_str(&chunk_list_json).map_err(|e| {
            crate::error::LapisError::Metadata(format!("Invalid chunk_list JSON: {}", e))
        })?;

        commits.push(PushCommitMetadata {
            commit_hash: hex::encode(hash),
            parent_hash: parent_hash_opt.as_ref().map(hex::encode),
            manifest_hash: hex::encode(&manifest_hash_bytes),
            message,
            timestamp,
            signature: signature.map(hex::encode),
            chunk_hashes: byte_arrays.into_iter().map(hex::encode).collect(),
            file_path,
            total_size: total_size as u64,
        });

        current_hash = match parent_hash_opt {
            Some(parent_bytes) if parent_bytes.len() == 32 => {
                let mut parent_hash = [0u8; 32];
                parent_hash.copy_from_slice(&parent_bytes);
                Some(parent_hash)
            }
            Some(_) => {
                return Err(crate::error::LapisError::Metadata(
                    "Invalid parent hash length in database".to_string(),
                ));
            }
            None => None,
        };
    }

    Ok(PushMetadataRequest {
        head_commit: hex::encode(head_commit_hash),
        commits,
    })
}

fn read_head_commit(repo_dir: &FsPath) -> crate::error::Result<[u8; 32]> {
    let head_file = repo_dir.join(".lapis").join("HEAD");
    let content = fs::read_to_string(&head_file)
        .map_err(|_| crate::error::LapisError::Metadata("HEAD not initialized".to_string()))?;
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return Err(crate::error::LapisError::Metadata(
            "HEAD not initialized".to_string(),
        ));
    }
    decode_hash(trimmed, "HEAD")
}

fn decode_hash(hash: &str, label: &str) -> crate::error::Result<[u8; 32]> {
    let decoded = hex::decode(hash)
        .map_err(|e| crate::error::LapisError::Metadata(format!("Invalid {} hex: {}", label, e)))?;
    if decoded.len() != 32 {
        return Err(crate::error::LapisError::Metadata(format!(
            "Invalid {} length: expected 32 bytes",
            label
        )));
    }

    let mut arr = [0u8; 32];
    arr.copy_from_slice(&decoded);
    Ok(arr)
}

fn decode_hashes(hashes: &[String], label: &str) -> crate::error::Result<Vec<[u8; 32]>> {
    hashes.iter().map(|hash| decode_hash(hash, label)).collect()
}

fn persist_manifest_object(
    cas: &CasStore,
    expected_hash: [u8; 32],
    file_path: &str,
    chunk_list_json: &str,
    total_size: u64,
) -> crate::error::Result<()> {
    let object_bytes = serialize_manifest_from_storage(file_path, chunk_list_json, total_size)?;
    let stored_hash = cas.put(&object_bytes)?;
    if stored_hash != expected_hash {
        return Err(crate::error::LapisError::Cas(format!(
            "Manifest CAS hash mismatch: expected {}, got {}",
            hex::encode(expected_hash),
            hex::encode(stored_hash)
        )));
    }
    Ok(())
}

fn persist_commit_object(cas: &CasStore, commit: Commit) -> crate::error::Result<()> {
    let expected_hash = commit.hash;
    let object_bytes = commit.object_bytes()?;
    let stored_hash = cas.put(&object_bytes)?;
    if stored_hash != expected_hash {
        return Err(crate::error::LapisError::Cas(format!(
            "Commit CAS hash mismatch: expected {}, got {}",
            hex::encode(expected_hash),
            hex::encode(stored_hash)
        )));
    }
    Ok(())
}

/// Query the metadata store for shallow clone metadata (commit details + manifest)
async fn query_shallow_clone_metadata(
    db_path: &std::path::Path,
    head_commit_hash: &[u8; 32],
    depth: usize,
) -> crate::error::Result<ShallowCloneMetadataResponse> {
    use sqlx::Row;

    let db_url = format!("sqlite://{}?mode=ro", db_path.display());
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&db_url)
        .await
        .map_err(|e| {
            crate::error::LapisError::Database(format!("Failed to connect to metadata db: {}", e))
        })?;

    let mut commits = Vec::new();
    let mut current_hash = Some(*head_commit_hash);

    while commits.len() < depth {
        let Some(hash) = current_hash else {
            break;
        };

        let commit_row = sqlx::query(
            "SELECT manifest_hash, parent_hash, message, timestamp, signature FROM commits WHERE hash = ?1",
        )
        .bind(hash.to_vec())
        .fetch_optional(&pool)
        .await
        .map_err(|e| crate::error::LapisError::Database(format!("Failed to query commits: {}", e)))?
        .ok_or_else(|| {
            crate::error::LapisError::Metadata("HEAD commit not found in database".to_string())
        })?;

        let manifest_hash_bytes: Vec<u8> = commit_row.get("manifest_hash");
        let parent_hash_opt: Option<Vec<u8>> = commit_row.get("parent_hash");
        let message: String = commit_row.get("message");
        let timestamp: i64 = commit_row.get("timestamp");
        let signature: Option<Vec<u8>> = commit_row.get("signature");

        let manifest_row = sqlx::query(
            "SELECT chunk_list, file_path, total_size FROM manifests WHERE hash = ?1",
        )
        .bind(&manifest_hash_bytes)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            crate::error::LapisError::Database(format!("Failed to query manifests: {}", e))
        })?
        .ok_or_else(|| {
            crate::error::LapisError::Metadata("Manifest not found in database".to_string())
        })?;

        let chunk_list_json: String = manifest_row.get("chunk_list");
        let file_path: String = manifest_row.get("file_path");
        let total_size: i64 = manifest_row.get("total_size");

        let byte_arrays: Vec<[u8; 32]> = serde_json::from_str(&chunk_list_json).map_err(|e| {
            crate::error::LapisError::Metadata(format!("Invalid chunk_list JSON: {}", e))
        })?;
        let chunk_hashes: Vec<String> = byte_arrays
            .into_iter()
            .map(|arr| hex::encode(arr))
            .collect();

        commits.push(ShallowCloneCommitMetadata {
            commit_hash: hex::encode(hash),
            parent_hash: parent_hash_opt.as_ref().map(hex::encode),
            manifest_hash: hex::encode(&manifest_hash_bytes),
            message,
            timestamp,
            signature: signature.map(hex::encode),
            file_path,
            chunk_hashes,
            total_size: total_size as u64,
        });

        current_hash = match parent_hash_opt {
            Some(parent_bytes) if parent_bytes.len() == 32 => {
                let mut parent_hash = [0u8; 32];
                parent_hash.copy_from_slice(&parent_bytes);
                Some(parent_hash)
            }
            Some(_) => {
                return Err(crate::error::LapisError::Metadata(
                    "Invalid parent hash length in database".to_string(),
                ));
            }
            None => None,
        };
    }

    Ok(ShallowCloneMetadataResponse {
        head_commit: hex::encode(head_commit_hash),
        commits,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::index::MetadataStore;
    use crate::store::CasStore;
    use crate::vcs::{serialize_manifest_from_storage, Commit, Manifest};
    use tempfile::TempDir;

    fn sample_head_metadata() -> HeadMetadataResponse {
        let manifest = Manifest {
            file_path: PathBuf::from("notes.txt"),
            chunk_hashes: vec![[3u8; 32], [4u8; 32]],
            total_size: 9,
            chunking_params: crate::vcs::ChunkingParams {
                min_size: crate::chunking::config::MIN_CHUNK_SIZE,
                avg_size: crate::chunking::config::AVG_CHUNK_SIZE,
                max_size: crate::chunking::config::MAX_CHUNK_SIZE,
            },
        };
        let manifest_hash = manifest.hash().unwrap();
        let mut commit = Commit::create(Some([1u8; 32]), manifest_hash, "sync head").unwrap();
        commit.timestamp = 1_700_000_000;
        commit.signature = Some(vec![0xde, 0xad, 0xbe, 0xef]);
        commit.hash = crate::crypto::hash_bytes(&commit.signing_payload().unwrap());

        HeadMetadataResponse {
            head_commit: hex::encode(commit.hash),
            parent_hash: commit.parent.map(hex::encode),
            manifest_hash: hex::encode(manifest_hash),
            message: commit.message,
            timestamp: commit.timestamp as i64,
            signature: commit.signature.map(hex::encode),
            chunk_hashes: manifest.chunk_hashes.iter().map(hex::encode).collect(),
            file_path: manifest.file_path.to_string_lossy().to_string(),
            total_size: manifest.total_size,
        }
    }

    async fn seed_clone_history(repo: &crate::repo::Repository, depth: usize) -> Vec<Commit> {
        let db_path = repo.meta_dir().join("index.db");
        let mut store = MetadataStore::new(&db_path).await.unwrap();
        let mut commits = Vec::new();
        let mut parent = None;

        sqlx::query("PRAGMA foreign_keys=OFF")
            .execute(store.write_conn())
            .await
            .unwrap();

        for idx in 0..depth {
            let manifest = Manifest {
                file_path: PathBuf::from(format!("file-{}.txt", idx)),
                chunk_hashes: vec![[idx as u8 + 1; 32]],
                total_size: (idx as u64) + 10,
                chunking_params: crate::vcs::ChunkingParams {
                    min_size: crate::chunking::config::MIN_CHUNK_SIZE,
                    avg_size: crate::chunking::config::AVG_CHUNK_SIZE,
                    max_size: crate::chunking::config::MAX_CHUNK_SIZE,
                },
            };
            let manifest_hash = manifest.hash().unwrap();
            let mut commit = Commit::create(parent, manifest_hash, &format!("commit-{}", idx)).unwrap();
            commit.timestamp = 1_700_000_000 + idx as u64;
            commit.hash = crate::crypto::hash_bytes(&commit.signing_payload().unwrap());

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
            .bind(Option::<Vec<u8>>::None)
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

    async fn load_seeded_push_metadata(repo: &crate::repo::Repository, depth: usize) -> PushMetadataRequest {
        let commits = seed_clone_history(repo, depth).await;
        let chain = load_push_metadata_chain_from_repo(repo.root()).await.unwrap();
        assert_eq!(chain.head_commit, hex::encode(commits.last().unwrap().hash));
        chain
    }

    #[test]
    fn test_persist_head_metadata_roundtrip() {
        let dir = TempDir::new().unwrap();
        let repo = crate::repo::Repository::init(dir.path().join("repo")).unwrap();
        let metadata = sample_head_metadata();
        let rt = tokio::runtime::Runtime::new().unwrap();

        rt.block_on(async { persist_head_metadata(repo.root(), &metadata).await })
            .unwrap();
        fs::write(repo.lapis_dir().join("HEAD"), &metadata.head_commit).unwrap();

        let loaded = rt
            .block_on(async { load_head_metadata_from_repo(repo.root()).await })
            .unwrap();
        assert_eq!(loaded.head_commit, metadata.head_commit);
        assert_eq!(loaded.parent_hash, metadata.parent_hash);
        assert_eq!(loaded.manifest_hash, metadata.manifest_hash);
        assert_eq!(loaded.message, metadata.message);
        assert_eq!(loaded.timestamp, metadata.timestamp);
        assert_eq!(loaded.signature, metadata.signature);
        assert_eq!(loaded.chunk_hashes, metadata.chunk_hashes);
        assert_eq!(loaded.file_path, metadata.file_path);
        assert_eq!(loaded.total_size, metadata.total_size);
    }

    #[test]
    fn test_load_push_metadata_chain_reads_full_ancestry() {
        let dir = TempDir::new().unwrap();
        let repo = crate::repo::Repository::init(dir.path().join("repo")).unwrap();
        let rt = tokio::runtime::Runtime::new().unwrap();

        let commits = rt.block_on(async { seed_clone_history(&repo, 3).await });
        let metadata = rt
            .block_on(async { load_push_metadata_chain_from_repo(repo.root()).await })
            .unwrap();

        assert_eq!(metadata.head_commit, hex::encode(commits[2].hash));
        assert_eq!(metadata.commits.len(), 3);
        assert_eq!(metadata.commits[0].commit_hash, hex::encode(commits[2].hash));
        assert_eq!(metadata.commits[1].commit_hash, hex::encode(commits[1].hash));
        assert_eq!(metadata.commits[2].commit_hash, hex::encode(commits[0].hash));
        assert_eq!(metadata.commits[0].parent_hash, Some(hex::encode(commits[1].hash)));
        assert_eq!(metadata.commits[2].parent_hash, None);
    }

    #[test]
    fn test_persist_push_metadata_roundtrip_multiple_commits() {
        let src_dir = TempDir::new().unwrap();
        let src_repo = crate::repo::Repository::init(src_dir.path().join("src-repo")).unwrap();
        let dst_dir = TempDir::new().unwrap();
        let dst_repo = crate::repo::Repository::init(dst_dir.path().join("dst-repo")).unwrap();
        let rt = tokio::runtime::Runtime::new().unwrap();

        let metadata = rt.block_on(async { load_seeded_push_metadata(&src_repo, 3).await });
        rt.block_on(async { persist_push_metadata(dst_repo.root(), &metadata).await })
            .unwrap();
        fs::write(dst_repo.lapis_dir().join("HEAD"), &metadata.head_commit).unwrap();

        let loaded = rt
            .block_on(async { load_push_metadata_chain_from_repo(dst_repo.root()).await })
            .unwrap();
        assert_eq!(loaded.head_commit, metadata.head_commit);
        assert_eq!(loaded.commits.len(), 3);
        assert_eq!(loaded.commits[0].commit_hash, metadata.commits[0].commit_hash);
        assert_eq!(loaded.commits[2].commit_hash, metadata.commits[2].commit_hash);

        let cas = CasStore::new(dst_repo.store_hot_dir()).unwrap();
        for commit in &metadata.commits {
            let commit_hash = decode_hash(&commit.commit_hash, "commit_hash").unwrap();
            let manifest_hash = decode_hash(&commit.manifest_hash, "manifest_hash").unwrap();
            let chunk_hashes = decode_hashes(&commit.chunk_hashes, "chunk_hash").unwrap();
            assert!(cas.exists(&commit_hash).unwrap());
            assert!(cas.exists(&manifest_hash).unwrap());
            assert_eq!(
                cas.get(&manifest_hash).unwrap(),
                serialize_manifest_from_storage(
                    &commit.file_path,
                    &serde_json::to_string(&chunk_hashes).unwrap(),
                    commit.total_size,
                )
                .unwrap()
            );
            assert_eq!(
                cas.get(&commit_hash).unwrap(),
                Commit {
                    hash: commit_hash,
                    parent: commit
                        .parent_hash
                        .as_deref()
                        .map(|hash| decode_hash(hash, "parent_hash").unwrap()),
                    manifest_hash,
                    timestamp: commit.timestamp as u64,
                    message: commit.message.clone(),
                    signature: commit
                        .signature
                        .as_deref()
                        .map(|signature| hex::decode(signature).unwrap()),
                }
                .object_bytes()
                .unwrap()
            );
        }
    }

    #[test]
    fn test_cas_store_integration() {
        let dir = TempDir::new().unwrap();
        let cas = CasStore::new(dir.path()).unwrap();

        let data = b"test block content";
        let hash = cas.put(data).unwrap();

        let retrieved = cas.get(&hash).unwrap();
        assert_eq!(retrieved, data);
    }

    #[test]
    fn test_check_blocks_request_parsing() {
        let req = CheckBlocksRequest {
            hashes: vec!["aabbccdd".to_string()],
        };
        let json = serde_json::to_string(&req).unwrap();
        let parsed: CheckBlocksRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.hashes, vec!["aabbccdd"]);
    }

    #[test]
    fn test_check_blocks_response_generation() {
        let resp = CheckBlocksResponse {
            needed: vec!["hash1".to_string()],
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("hash1"));
        assert!(json.contains("needed"));
    }

    #[test]
    fn test_block_refcounts_response_generation() {
        let resp = BlockRefcountsResponse {
            refcounts: std::collections::HashMap::from([("hash1".to_string(), 2)]),
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("hash1"));
        assert!(json.contains("refcounts"));
        assert!(json.contains('2'));
    }

    #[test]
    fn test_hex_parsing_valid() {
        let hash_str = "aa".repeat(32);
        let decoded = hex::decode(&hash_str).unwrap();
        assert_eq!(decoded.len(), 32);
    }

    #[test]
    fn test_hex_parsing_invalid() {
        let hash_str = "not_valid_hex";
        assert!(hex::decode(hash_str).is_err());
    }

    #[test]
    fn test_check_blocks_protocol_needed_subset() {
        let dir = TempDir::new().unwrap();
        let cas = Arc::new(CasStore::new(dir.path()).unwrap());
        let state = ServerState {
            cas: cas.clone(),
            repo_dir: dir.path().to_path_buf(),
        };

        let data1 = b"block 1";
        let hash1 = hex::encode(state.cas.put(data1).unwrap());

        let data2 = b"block 2";
        let hash2_bytes = state.cas.put(data2).unwrap();
        state.cas.delete(&hash2_bytes).unwrap();
        let hash2 = hex::encode(hash2_bytes);

        let data3 = b"block 3";
        let hash3 = hex::encode(state.cas.put(data3).unwrap());

        let _req = CheckBlocksRequest {
            hashes: vec![
                hash1.clone(),
                hash2.clone(),
                hash3.clone(),
                "invalid_hash".to_string(),
            ],
        };

        let resp = CheckBlocksResponse {
            needed: vec![hash2.clone(), "invalid_hash".to_string()],
        };

        assert_eq!(
            resp.needed.len(),
            2,
            "only missing hashes should be in needed"
        );
        assert!(
            resp.needed.contains(&hash2),
            "deleted hash should be in needed"
        );
        assert!(
            resp.needed.contains(&"invalid_hash".to_string()),
            "invalid hash should be in needed"
        );
        assert!(
            !resp.needed.contains(&hash1),
            "existing hash should NOT be in needed"
        );
        assert!(
            !resp.needed.contains(&hash3),
            "existing hash should NOT be in needed"
        );
    }

    #[test]
    fn test_query_manifest_chunk_refcounts_counts_remote_references() {
        let repo_root = TempDir::new().unwrap();
        let repo = crate::repo::Repository::init(repo_root.path()).expect("init repo");
        let cas = CasStore::new(repo.store_hot_dir()).expect("create CAS store");
        let referenced_hash = cas.put(b"referenced block").expect("store referenced block");
        let other_hash = cas.put(b"other block").expect("store other block");
        let unreferenced_hash = cas.put(b"unreferenced block").expect("store unreferenced block");

        let rt = tokio::runtime::Runtime::new().expect("create runtime");
        let refcounts = rt.block_on(async {
            let mut store = MetadataStore::new(repo.meta_dir().join("index.db"))
                .await
                .expect("open metadata store");
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64;

            let chunk_list_one = serde_json::to_string(&vec![referenced_hash.to_vec(), other_hash.to_vec()])
                .expect("serialize chunk list one");
            let chunk_list_two = serde_json::to_string(&vec![referenced_hash.to_vec()])
                .expect("serialize chunk list two");

            sqlx::query(
                "INSERT INTO manifests (hash, file_path, chunk_list, total_size, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )
            .bind(vec![1u8; 32])
            .bind("file-one")
            .bind(chunk_list_one)
            .bind(0i64)
            .bind(now)
            .execute(store.write_conn())
            .await
            .expect("insert manifest one");

            sqlx::query(
                "INSERT INTO manifests (hash, file_path, chunk_list, total_size, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )
            .bind(vec![2u8; 32])
            .bind("file-two")
            .bind(chunk_list_two)
            .bind(0i64)
            .bind(now)
            .execute(store.write_conn())
            .await
            .expect("insert manifest two");

            query_manifest_chunk_refcounts(
                &store,
                &[
                    hex::encode(referenced_hash),
                    hex::encode(other_hash),
                    hex::encode(unreferenced_hash),
                ],
            )
            .await
            .expect("query refcounts")
        });

        assert_eq!(refcounts.get(&hex::encode(referenced_hash)).copied(), Some(2));
        assert_eq!(refcounts.get(&hex::encode(other_hash)).copied(), Some(1));
        assert_eq!(refcounts.get(&hex::encode(unreferenced_hash)).copied(), Some(0));
    }

    #[test]
    fn test_query_shallow_clone_metadata_respects_depth_limit() {
        let dir = TempDir::new().unwrap();
        let repo = crate::repo::Repository::init(dir.path().join("repo")).unwrap();
        let rt = tokio::runtime::Runtime::new().unwrap();

        let commits = rt.block_on(async { seed_clone_history(&repo, 3).await });
        let response = rt
            .block_on(async {
                query_shallow_clone_metadata(&repo.meta_dir().join("index.db"), &commits[2].hash, 2).await
            })
            .unwrap();

        assert_eq!(response.head_commit, hex::encode(commits[2].hash));
        assert_eq!(response.commits.len(), 2);
        assert_eq!(response.commits[0].commit_hash, hex::encode(commits[2].hash));
        assert_eq!(response.commits[1].commit_hash, hex::encode(commits[1].hash));
        assert_eq!(response.commits[0].parent_hash, Some(hex::encode(commits[1].hash)));
    }

    #[test]
    fn test_query_shallow_clone_metadata_returns_available_history_when_shorter_than_depth() {
        let dir = TempDir::new().unwrap();
        let repo = crate::repo::Repository::init(dir.path().join("repo")).unwrap();
        let rt = tokio::runtime::Runtime::new().unwrap();

        let commits = rt.block_on(async { seed_clone_history(&repo, 2).await });
        let response = rt
            .block_on(async {
                query_shallow_clone_metadata(&repo.meta_dir().join("index.db"), &commits[1].hash, 5).await
            })
            .unwrap();

        assert_eq!(response.commits.len(), 2);
        assert_eq!(response.commits[0].commit_hash, hex::encode(commits[1].hash));
        assert_eq!(response.commits[1].commit_hash, hex::encode(commits[0].hash));
        assert_eq!(response.commits[1].parent_hash, None);
    }
}
