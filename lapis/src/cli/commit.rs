//! `lapis commit` command implementation
//!
//! Commits staged files by reading the staging area, building a manifest,
//! creating a commit object, and persisting both to the metadata store.

use lapis::error::Result;
use lapis::index::MetadataStore;
use lapis::repo::Repository;
use lapis::store::CasStore;
use lapis::vcs::{Commit, CompositeManifest, Manifest};
use std::fs;
use std::path::PathBuf;

use super::CommitArgs;

#[cfg(feature = "signing")]
fn maybe_sign_commit(commit: &mut Commit, sign: bool) -> Result<()> {
    if sign {
        let payload = commit.signing_payload()?;
        commit.signature = Some(lapis::crypto::sigstore::sign_commit_payload(&payload)?);
    }
    Ok(())
}

#[cfg(not(feature = "signing"))]
fn maybe_sign_commit(_commit: &mut Commit) -> Result<()> {
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

pub fn execute(args: CommitArgs) -> Result<()> {
    let repo_root = find_repo_root()?;
    let repo = Repository::open(&repo_root)?;

    // Read staging area
    let staging_path = repo.lapis_dir().join("staging.json");
    if !staging_path.exists() {
        return Err(lapis::error::LapisError::Metadata(
            "staging area does not exist; nothing to commit".to_string(),
        ));
    }

    let staging_data = fs::read(&staging_path)?;
    let staging = super::add::StagingArea::deserialize(&staging_data)?;

    // Check if staging area is empty
    if staging.files.is_empty() {
        return Err(lapis::error::LapisError::Metadata(
            "staging area is empty; nothing to commit".to_string(),
        ));
    }

    let manifest_record = build_manifest_record(&staging)?;

    // Determine parent commit hash (for now, read from HEAD metadata if it exists)
    let parent_hash = read_head(&repo)?;

    // Create commit object
    let mut commit = Commit::create(parent_hash, manifest_record.hash, &args.message)?;
    #[cfg(feature = "signing")]
    maybe_sign_commit(&mut commit, args.sign)?;
    #[cfg(not(feature = "signing"))]
    maybe_sign_commit(&mut commit)?;
    let commit_hash = commit.hash;

    let cas = CasStore::new(repo.store_hot_dir())?;
    let stored_manifest_hash = cas.put(&manifest_record.object_bytes)?;
    if stored_manifest_hash != manifest_record.hash {
        return Err(lapis::error::LapisError::Cas(format!(
            "Manifest CAS hash mismatch: expected {}, got {}",
            hex::encode(manifest_record.hash),
            hex::encode(stored_manifest_hash)
        )));
    }

    let commit_object_bytes = commit.object_bytes()?;
    let stored_commit_hash = cas.put(&commit_object_bytes)?;
    if stored_commit_hash != commit_hash {
        return Err(lapis::error::LapisError::Cas(format!(
            "Commit CAS hash mismatch: expected {}, got {}",
            hex::encode(commit_hash),
            hex::encode(stored_commit_hash)
        )));
    }

    // Persist to metadata store
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| {
            lapis::error::LapisError::Metadata(format!("Failed to create async runtime: {}", e))
        })?;

    rt.block_on(async {
        let db_path = repo.meta_dir().join("index.db");
        let mut store = MetadataStore::new(&db_path).await?;

        // Insert manifest
        sqlx::query(
            "INSERT OR IGNORE INTO manifests (hash, file_path, chunk_list, total_size, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(manifest_record.hash.to_vec())
        .bind(&manifest_record.file_path)
        .bind(&manifest_record.chunk_list_json)
        .bind(manifest_record.total_size as i64)
        .bind(chrono::Utc::now().timestamp())
        .execute(store.write_conn())
        .await
        .map_err(|e| {
            lapis::error::LapisError::Database(format!("Failed to insert manifest: {}", e))
        })?;

        // Insert commit
        sqlx::query(
            "INSERT INTO commits (hash, parent_hash, manifest_hash, timestamp, message, signature)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .bind(commit_hash.to_vec())
        .bind(parent_hash.map(|h| h.to_vec()))
        .bind(manifest_record.hash.to_vec())
        .bind(commit.timestamp as i64)
        .bind(&commit.message)
        .bind(commit.signature.clone())
        .execute(store.write_conn())
        .await
        .map_err(|e| {
            lapis::error::LapisError::Database(format!("Failed to insert commit: {}", e))
        })?;

        // Insert reflog entry
        sqlx::query(
            "INSERT INTO reflog (commit_hash, action, timestamp)
             VALUES (?1, ?2, ?3)",
        )
        .bind(commit_hash.to_vec())
        .bind("commit")
        .bind(chrono::Utc::now().timestamp())
        .execute(store.write_conn())
        .await
        .map_err(|e| {
            lapis::error::LapisError::Database(format!("Failed to insert reflog entry: {}", e))
        })?;

        Ok::<(), lapis::error::LapisError>(())
    })?;

    // Update HEAD to point to new commit
    update_head(&repo, commit_hash)?;

    // Clear staging area
    fs::write(&staging_path, b"{\"files\":[]}").map_err(|e| lapis::error::LapisError::Io(e))?;

    // Print commit hash to stdout
    println!("{}", hex::encode(commit_hash));

    Ok(())
}

struct ManifestRecord {
    hash: [u8; 32],
    file_path: String,
    chunk_list_json: String,
    total_size: u64,
    object_bytes: Vec<u8>,
}

fn build_manifest_record(staging: &super::add::StagingArea) -> Result<ManifestRecord> {
    let manifests = staging
        .files
        .iter()
        .map(staged_file_to_manifest)
        .collect::<Result<Vec<_>>>()?;

    if manifests.len() == 1 {
        let manifest = manifests
            .into_iter()
            .next()
            .expect("single manifest must exist");
        return Ok(ManifestRecord {
            hash: manifest.hash()?,
            file_path: manifest.file_path.to_string_lossy().to_string(),
            chunk_list_json: serde_json::to_string(&manifest.chunk_hashes)
                .map_err(|e| lapis::error::LapisError::Metadata(e.to_string()))?,
            total_size: manifest.total_size,
            object_bytes: manifest.serialize()?,
        });
    }

    let composite = CompositeManifest::build(&manifests);
    Ok(ManifestRecord {
        hash: composite.hash()?,
        file_path: composite.encoded_file_path()?,
        chunk_list_json: serde_json::to_string(&composite.chunk_hashes)
            .map_err(|e| lapis::error::LapisError::Metadata(e.to_string()))?,
        total_size: composite.total_size,
        object_bytes: composite.serialize()?,
    })
}

fn staged_file_to_manifest(staged_file: &super::add::StagedFile) -> Result<Manifest> {
    let chunk_hashes = staged_file
        .chunk_hashes
        .iter()
        .map(|hex_hash| {
            let binary_hash = hex::decode(hex_hash).map_err(|e| {
                lapis::error::LapisError::Chunking(format!("Invalid chunk hash format: {}", e))
            })?;
            if binary_hash.len() != 32 {
                return Err(lapis::error::LapisError::Chunking(
                    "Chunk hash must be 32 bytes".to_string(),
                ));
            }
            let mut hash_array = [0u8; 32];
            hash_array.copy_from_slice(&binary_hash);
            Ok(hash_array)
        })
        .collect::<Result<Vec<_>>>()?;

    Ok(Manifest {
        file_path: PathBuf::from(&staged_file.file_path),
        chunk_hashes,
        total_size: staged_file.total_size,
        chunking_params: lapis::vcs::ChunkingParams {
            min_size: lapis::chunking::config::MIN_CHUNK_SIZE,
            avg_size: lapis::chunking::config::AVG_CHUNK_SIZE,
            max_size: lapis::chunking::config::MAX_CHUNK_SIZE,
        },
    })
}

/// Read the current HEAD commit hash from repo metadata
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

/// Write the current HEAD commit hash to repo metadata
fn update_head(repo: &Repository, commit_hash: [u8; 32]) -> Result<()> {
    let head_file = repo.lapis_dir().join("HEAD");
    let hex_hash = hex::encode(commit_hash);
    fs::write(&head_file, hex_hash)
        .map_err(|e| lapis::error::LapisError::Metadata(format!("Failed to write HEAD: {}", e)))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cli::test_utils::acquire_cwd_lock;
    use lapis::store::CasStore;
    use sqlx::Row;
    use tempfile::TempDir;

    fn safe_original_cwd() -> std::path::PathBuf {
        if let Ok(cwd) = std::env::current_dir() {
            if cwd.exists() {
                return cwd;
            }
        }

        let fallback = std::env::temp_dir();
        let _ = std::env::set_current_dir(&fallback);
        fallback
    }

    fn build_commit_args(message: &str) -> CommitArgs {
        CommitArgs {
            message: message.to_string(),
            #[cfg(feature = "signing")]
            sign: false,
        }
    }

    #[test]
    fn test_commit_empty_staging_error() {
        let _lock = acquire_cwd_lock();
        let temp_dir = TempDir::new().expect("create temp dir");
        let repo_root = temp_dir.path();

        lapis::repo::Repository::init(repo_root).expect("init should succeed");

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(repo_root).expect("set cwd");

        let args = build_commit_args("test commit");

        let result = execute(args);
        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("empty") || err_msg.contains("does not exist"));

        let _ = std::env::set_current_dir(&original_cwd);
        drop(temp_dir);
    }

    #[test]
    fn test_commit_not_in_repo_error() {
        let _lock = acquire_cwd_lock();
        let temp_dir = TempDir::new().expect("create temp dir");
        let work_dir = temp_dir.path().join("work");
        fs::create_dir_all(&work_dir).expect("create work dir");

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(&work_dir).expect("set cwd");

        let args = build_commit_args("test commit");

        let result = execute(args);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(!err.is_empty());

        let _ = std::env::set_current_dir(&original_cwd);
        drop(temp_dir);
    }

    #[test]
    fn test_commit_single_file_keeps_legacy_manifest_storage() {
        let _lock = acquire_cwd_lock();
        let temp_dir = TempDir::new().expect("create temp dir");
        let repo_root = temp_dir.path();
        lapis::repo::Repository::init(repo_root).expect("init should succeed");

        let staging = super::super::add::StagingArea {
            files: vec![super::super::add::StagedFile {
                file_path: "alpha.txt".to_string(),
                chunk_hashes: vec![hex::encode([1u8; 32])],
                total_size: 5,
            }],
        };
        fs::write(
            repo_root.join(".lapis/staging.json"),
            staging.serialize().expect("serialize staging"),
        )
        .expect("write staging");

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(repo_root).expect("set cwd");

        execute(build_commit_args("single")).expect("commit should succeed");

        let rt = tokio::runtime::Runtime::new().expect("create runtime");
        let (file_path, chunk_list_json, total_size): (String, String, i64) = rt.block_on(async {
            let store = MetadataStore::new(repo_root.join(".lapis/meta/index.db"))
                .await
                .expect("open metadata store");
            let head = fs::read_to_string(repo_root.join(".lapis/HEAD")).expect("read HEAD");
            let manifest_hash: Vec<u8> =
                sqlx::query("SELECT manifest_hash FROM commits WHERE hash = ?1")
                    .bind(hex::decode(head.trim()).expect("decode HEAD"))
                    .fetch_one(store.read_pool())
                    .await
                    .expect("query commit")
                    .get("manifest_hash");

            let row = sqlx::query(
                "SELECT file_path, chunk_list, total_size FROM manifests WHERE hash = ?1",
            )
            .bind(manifest_hash)
            .fetch_one(store.read_pool())
            .await
            .expect("query manifest");

            (
                row.get("file_path"),
                row.get("chunk_list"),
                row.get("total_size"),
            )
        });

        assert_eq!(file_path, "alpha.txt");
        assert_eq!(total_size, 5);
        let chunk_hashes: Vec<[u8; 32]> =
            serde_json::from_str(&chunk_list_json).expect("parse chunk list");
        assert_eq!(chunk_hashes, vec![[1u8; 32]]);

        let head_hash = hex::decode(
            fs::read_to_string(repo_root.join(".lapis/HEAD"))
                .expect("read HEAD")
                .trim(),
        )
        .expect("decode HEAD");
        let manifest_hash = Manifest {
            file_path: PathBuf::from("alpha.txt"),
            chunk_hashes: vec![[1u8; 32]],
            total_size: 5,
            chunking_params: lapis::vcs::ChunkingParams {
                min_size: lapis::chunking::config::MIN_CHUNK_SIZE,
                avg_size: lapis::chunking::config::AVG_CHUNK_SIZE,
                max_size: lapis::chunking::config::MAX_CHUNK_SIZE,
            },
        }
        .hash()
        .expect("hash manifest");
        let cas = CasStore::new(repo_root.join(".lapis/store/hot")).expect("open cas");

        let mut head_hash_arr = [0u8; 32];
        head_hash_arr.copy_from_slice(&head_hash);
        assert!(cas.exists(&manifest_hash).expect("manifest object exists"));
        assert_eq!(
            cas.get(&manifest_hash).expect("read manifest object"),
            Manifest {
                file_path: PathBuf::from("alpha.txt"),
                chunk_hashes: vec![[1u8; 32]],
                total_size: 5,
                chunking_params: lapis::vcs::ChunkingParams {
                    min_size: lapis::chunking::config::MIN_CHUNK_SIZE,
                    avg_size: lapis::chunking::config::AVG_CHUNK_SIZE,
                    max_size: lapis::chunking::config::MAX_CHUNK_SIZE,
                },
            }
            .serialize()
            .expect("serialize manifest")
        );
        assert!(cas.exists(&head_hash_arr).expect("commit object exists"));

        let _ = std::env::set_current_dir(&original_cwd);
        drop(temp_dir);
    }

    #[test]
    fn test_commit_writes_manifest_and_commit_objects_to_cas() {
        let _lock = acquire_cwd_lock();
        let temp_dir = TempDir::new().expect("create temp dir");
        let repo_root = temp_dir.path();
        lapis::repo::Repository::init(repo_root).expect("init should succeed");

        let staging = super::super::add::StagingArea {
            files: vec![super::super::add::StagedFile {
                file_path: "alpha.txt".to_string(),
                chunk_hashes: vec![hex::encode([1u8; 32]), hex::encode([2u8; 32])],
                total_size: 9,
            }],
        };
        fs::write(
            repo_root.join(".lapis/staging.json"),
            staging.serialize().expect("serialize staging"),
        )
        .expect("write staging");

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(repo_root).expect("set cwd");

        execute(build_commit_args("store objects")).expect("commit should succeed");

        let head_hash_hex = fs::read_to_string(repo_root.join(".lapis/HEAD")).expect("read HEAD");
        let head_hash = hex::decode(head_hash_hex.trim()).expect("decode HEAD");
        let mut head_hash_arr = [0u8; 32];
        head_hash_arr.copy_from_slice(&head_hash);

        let manifest = Manifest {
            file_path: PathBuf::from("alpha.txt"),
            chunk_hashes: vec![[1u8; 32], [2u8; 32]],
            total_size: 9,
            chunking_params: lapis::vcs::ChunkingParams {
                min_size: lapis::chunking::config::MIN_CHUNK_SIZE,
                avg_size: lapis::chunking::config::AVG_CHUNK_SIZE,
                max_size: lapis::chunking::config::MAX_CHUNK_SIZE,
            },
        };
        let manifest_hash = manifest.hash().expect("hash manifest");
        let cas = CasStore::new(repo_root.join(".lapis/store/hot")).expect("open cas");

        assert!(cas.exists(&manifest_hash).expect("manifest object exists"));
        assert_eq!(
            cas.get(&manifest_hash).expect("read manifest object"),
            manifest.serialize().expect("serialize manifest")
        );
        assert!(cas.exists(&head_hash_arr).expect("commit object exists"));

        let rt = tokio::runtime::Runtime::new().expect("create runtime");
        let (parent_hash, commit_manifest_hash, message, timestamp): (
            Option<Vec<u8>>,
            Vec<u8>,
            String,
            i64,
        ) = rt.block_on(async {
            let store = MetadataStore::new(repo_root.join(".lapis/meta/index.db"))
                .await
                .expect("open metadata store");
            let row = sqlx::query(
                "SELECT parent_hash, manifest_hash, message, timestamp FROM commits WHERE hash = ?1",
            )
            .bind(head_hash.clone())
            .fetch_one(store.read_pool())
            .await
            .expect("query commit");
            (
                row.get("parent_hash"),
                row.get("manifest_hash"),
                row.get("message"),
                row.get("timestamp"),
            )
        });

        assert_eq!(parent_hash, None);
        assert_eq!(commit_manifest_hash, manifest_hash.to_vec());
        let commit = Commit {
            hash: head_hash_arr,
            parent: None,
            manifest_hash,
            timestamp: timestamp as u64,
            message,
            signature: None,
        };
        assert_eq!(
            cas.get(&head_hash_arr).expect("read commit object"),
            commit.object_bytes().expect("serialize commit object")
        );

        let _ = std::env::set_current_dir(&original_cwd);
        drop(temp_dir);
    }

    #[test]
    fn test_commit_multi_file_preserves_each_staged_path_and_chunk_span() {
        let _lock = acquire_cwd_lock();
        let temp_dir = TempDir::new().expect("create temp dir");
        let repo_root = temp_dir.path();
        lapis::repo::Repository::init(repo_root).expect("init should succeed");

        let staging = super::super::add::StagingArea {
            files: vec![
                super::super::add::StagedFile {
                    file_path: "alpha.txt".to_string(),
                    chunk_hashes: vec![hex::encode([1u8; 32]), hex::encode([2u8; 32])],
                    total_size: 9,
                },
                super::super::add::StagedFile {
                    file_path: "nested/beta.txt".to_string(),
                    chunk_hashes: vec![hex::encode([3u8; 32])],
                    total_size: 4,
                },
            ],
        };
        fs::write(
            repo_root.join(".lapis/staging.json"),
            staging.serialize().expect("serialize staging"),
        )
        .expect("write staging");

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(repo_root).expect("set cwd");

        execute(build_commit_args("multi")).expect("commit should succeed");

        let rt = tokio::runtime::Runtime::new().expect("create runtime");
        let (file_path, chunk_list_json, total_size): (String, String, i64) = rt.block_on(async {
            let store = MetadataStore::new(repo_root.join(".lapis/meta/index.db"))
                .await
                .expect("open metadata store");
            let head = fs::read_to_string(repo_root.join(".lapis/HEAD")).expect("read HEAD");
            let manifest_hash: Vec<u8> =
                sqlx::query("SELECT manifest_hash FROM commits WHERE hash = ?1")
                    .bind(hex::decode(head.trim()).expect("decode HEAD"))
                    .fetch_one(store.read_pool())
                    .await
                    .expect("query commit")
                    .get("manifest_hash");

            let row = sqlx::query(
                "SELECT file_path, chunk_list, total_size FROM manifests WHERE hash = ?1",
            )
            .bind(manifest_hash)
            .fetch_one(store.read_pool())
            .await
            .expect("query manifest");

            (
                row.get("file_path"),
                row.get("chunk_list"),
                row.get("total_size"),
            )
        });

        assert!(file_path.starts_with(lapis::vcs::MULTI_FILE_MANIFEST_PREFIX));
        assert_eq!(total_size, 13);

        let composite =
            CompositeManifest::from_storage(&file_path, &chunk_list_json, total_size as u64)
                .expect("parse composite manifest");
        assert_eq!(composite.entries.len(), 2);
        assert_eq!(composite.entries[0].file_path, PathBuf::from("alpha.txt"));
        assert_eq!(composite.entries[0].chunk_start, 0);
        assert_eq!(composite.entries[0].chunk_count, 2);
        assert_eq!(
            composite.entries[1].file_path,
            PathBuf::from("nested/beta.txt")
        );
        assert_eq!(composite.entries[1].chunk_start, 2);
        assert_eq!(composite.entries[1].chunk_count, 1);
        assert_eq!(
            composite
                .chunk_hashes_for_path("alpha.txt")
                .expect("lookup alpha")
                .expect("alpha exists"),
            vec![[1u8; 32], [2u8; 32]]
        );
        assert_eq!(
            composite
                .chunk_hashes_for_path("nested/beta.txt")
                .expect("lookup beta")
                .expect("beta exists"),
            vec![[3u8; 32]]
        );

        let _ = std::env::set_current_dir(&original_cwd);
        drop(temp_dir);
    }

    #[cfg(feature = "signing")]
    #[test]
    fn test_maybe_sign_commit_leaves_commit_unsigned_when_disabled() {
        let mut commit = Commit::create(None, [5u8; 32], "message").expect("create commit");

        maybe_sign_commit(&mut commit, false).expect("skip signing");

        assert!(commit.signature.is_none());
    }
}
