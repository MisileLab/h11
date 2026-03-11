//! `lapis log` command implementation
//!
//! Displays commit history starting from HEAD, walking backward through parent references.
//! Supports --oneline format (hash + message only) and --limit for restricting output.

use lapis::error::Result;
use lapis::index::MetadataStore;
use lapis::repo::Repository;
use sqlx::Row;
use std::fs;
use std::path::PathBuf;

use super::LogArgs;

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

    let binary = hex::decode(trimmed).map_err(|e| {
        lapis::error::LapisError::Metadata(format!("Invalid HEAD hash format: {}", e))
    })?;

    if binary.len() != 32 {
        return Err(lapis::error::LapisError::Metadata(
            "HEAD hash must be 32 bytes".to_string(),
        ));
    }

    let mut hash = [0u8; 32];
    hash.copy_from_slice(&binary);
    Ok(Some(hash))
}

/// A simplified commit record for display purposes
#[derive(Debug, Clone)]
struct CommitRecord {
    hash: [u8; 32],
    timestamp: i64,
    message: String,
}

pub fn execute(args: LogArgs) -> Result<()> {
    let repo_root = find_repo_root()?;
    let repo = Repository::open(&repo_root)?;

    // Read HEAD to find starting commit
    let head_hash = read_head(&repo)?;
    let Some(start_hash) = head_hash else {
        println!("no commits yet");
        return Ok(());
    };

    // Open metadata store for querying commits
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| {
            lapis::error::LapisError::Metadata(format!("Failed to create async runtime: {}", e))
        })?;

    let db_path = repo.meta_dir().join("index.db");
    let commits = rt.block_on(async {
        walk_commits_from_head(&db_path, start_hash, args.limit.unwrap_or(usize::MAX)).await
    })?;

    // Format and print commits
    for commit in commits {
        if args.oneline {
            println!("{} {}", hex::encode(&commit.hash[0..7]), commit.message);
        } else {
            println!("commit {}", hex::encode(commit.hash));
            println!("Author: Lapis");
            println!("Date:   {}", format_timestamp(commit.timestamp));
            println!();
            println!("    {}", commit.message);
            println!();
        }
    }

    Ok(())
}

/// Walk commit history from a starting commit hash, following parent pointers
/// Returns at most `limit` commits
async fn walk_commits_from_head(
    db_path: &std::path::Path,
    start_hash: [u8; 32],
    limit: usize,
) -> Result<Vec<CommitRecord>> {
    let store = MetadataStore::new(db_path).await?;

    let mut commits = Vec::new();
    let mut current_hash = Some(start_hash);
    let mut count = 0;

    while let Some(hash) = current_hash {
        if count >= limit {
            break;
        }

        // Query for this commit
        let row =
            sqlx::query("SELECT timestamp, message, parent_hash FROM commits WHERE hash = ?1")
                .bind(hash.to_vec())
                .fetch_optional(store.read_pool())
                .await
                .map_err(|e| {
                    lapis::error::LapisError::Database(format!("Failed to query commit: {}", e))
                })?;

        match row {
            Some(row) => {
                let timestamp: i64 = row.get("timestamp");
                let message: String = row.get("message");
                let parent_bytes: Option<Vec<u8>> = row.get("parent_hash");

                commits.push(CommitRecord {
                    hash,
                    timestamp,
                    message,
                });

                // Move to parent
                current_hash = match parent_bytes {
                    Some(bytes) => {
                        if bytes.len() != 32 {
                            return Err(lapis::error::LapisError::Database(
                                "Invalid parent hash length".to_string(),
                            ));
                        }
                        let mut parent_hash = [0u8; 32];
                        parent_hash.copy_from_slice(&bytes);

                        // Skip the initial commit sentinel (all zeros)
                        if parent_hash == [0u8; 32] {
                            None
                        } else {
                            Some(parent_hash)
                        }
                    }
                    None => None,
                };

                count += 1;
            }
            None => {
                // Commit not found, stop walking
                break;
            }
        }
    }

    Ok(commits)
}

/// Format Unix timestamp into a human-readable string
fn format_timestamp(timestamp: i64) -> String {
    use chrono::{DateTime, Utc};

    match DateTime::<Utc>::from_timestamp(timestamp, 0) {
        Some(dt) => dt.format("%a %b %e %H:%M:%S %Y %z").to_string(),
        None => format!("timestamp {}", timestamp),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_log_empty_history() {
        // Test that HEAD doesn't exist in a fresh repo (before any commits)
        let tmpdir = TempDir::new().expect("create temp dir");
        let repo_path = tmpdir.path().join("test-repo");
        std::fs::create_dir(&repo_path).expect("create repo dir");

        let repo_lapis = repo_path.join(".lapis");
        std::fs::create_dir(&repo_lapis).expect("create .lapis dir");

        let repo = Repository::open(&repo_path).expect("open repo");
        let head = read_head(&repo).expect("read HEAD");

        assert!(head.is_none(), "HEAD should not exist in new repo");
    }

    #[tokio::test]
    async fn test_walk_commits_single() {
        let tmpdir = TempDir::new().expect("create temp dir");
        let db_path = tmpdir.path().join("test.db");

        let mut store = MetadataStore::new(&db_path).await.expect("init store");
        let test_commit_hash = [42u8; 32];
        let manifest_hash = [1u8; 32];

        sqlx::query(
            "INSERT INTO manifests (hash, file_path, chunk_list, total_size, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(manifest_hash.to_vec())
        .bind("test.txt")
        .bind("[]")
        .bind(0i64)
        .bind(1000i64)
        .execute(store.write_conn())
        .await
        .expect("insert manifest");

        sqlx::query(
            "INSERT INTO commits (hash, parent_hash, manifest_hash, timestamp, message)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(test_commit_hash.to_vec())
        .bind(None::<Vec<u8>>)
        .bind(manifest_hash.to_vec())
        .bind(1000i64)
        .bind("test commit")
        .execute(store.write_conn())
        .await
        .expect("insert commit");

        let commits = walk_commits_from_head(&db_path, test_commit_hash, 10)
            .await
            .expect("walk commits");

        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].hash, test_commit_hash);
        assert_eq!(commits[0].message, "test commit");
    }

    #[tokio::test]
    async fn test_walk_commits_chain() {
        let tmpdir = TempDir::new().expect("create temp dir");
        let db_path = tmpdir.path().join("test.db");

        let mut store = MetadataStore::new(&db_path).await.expect("init store");
        let manifest_hash = [1u8; 32];

        sqlx::query(
            "INSERT INTO manifests (hash, file_path, chunk_list, total_size, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(manifest_hash.to_vec())
        .bind("test.txt")
        .bind("[]")
        .bind(0i64)
        .bind(1000i64)
        .execute(store.write_conn())
        .await
        .expect("insert manifest");

        let commit1_hash = [10u8; 32];
        sqlx::query(
            "INSERT INTO commits (hash, parent_hash, manifest_hash, timestamp, message)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(commit1_hash.to_vec())
        .bind(None::<Vec<u8>>)
        .bind(manifest_hash.to_vec())
        .bind(1000i64)
        .bind("first commit")
        .execute(store.write_conn())
        .await
        .expect("insert commit1");

        let commit2_hash = [20u8; 32];
        sqlx::query(
            "INSERT INTO commits (hash, parent_hash, manifest_hash, timestamp, message)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(commit2_hash.to_vec())
        .bind(Some(commit1_hash.to_vec()))
        .bind(manifest_hash.to_vec())
        .bind(2000i64)
        .bind("second commit")
        .execute(store.write_conn())
        .await
        .expect("insert commit2");

        let commits = walk_commits_from_head(&db_path, commit2_hash, 10)
            .await
            .expect("walk commits");

        assert_eq!(commits.len(), 2);
        assert_eq!(commits[0].hash, commit2_hash);
        assert_eq!(commits[0].message, "second commit");
        assert_eq!(commits[1].hash, commit1_hash);
        assert_eq!(commits[1].message, "first commit");
    }

    #[tokio::test]
    async fn test_walk_commits_limit() {
        let tmpdir = TempDir::new().expect("create temp dir");
        let db_path = tmpdir.path().join("test.db");

        let mut store = MetadataStore::new(&db_path).await.expect("init store");
        let manifest_hash = [1u8; 32];

        sqlx::query(
            "INSERT INTO manifests (hash, file_path, chunk_list, total_size, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(manifest_hash.to_vec())
        .bind("test.txt")
        .bind("[]")
        .bind(0i64)
        .bind(1000i64)
        .execute(store.write_conn())
        .await
        .expect("insert manifest");

        let mut last_hash = None;
        for i in 0..5 {
            let mut hash = [0u8; 32];
            hash[0] = i;

            sqlx::query(
                "INSERT INTO commits (hash, parent_hash, manifest_hash, timestamp, message)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )
            .bind(hash.to_vec())
            .bind(last_hash.as_ref().map(|h: &[u8; 32]| h.to_vec()))
            .bind(manifest_hash.to_vec())
            .bind((i as i64) * 1000)
            .bind(format!("commit {}", i))
            .execute(store.write_conn())
            .await
            .expect("insert commit");

            last_hash = Some(hash);
        }

        let commits = walk_commits_from_head(&db_path, last_hash.unwrap(), 2)
            .await
            .expect("walk commits");

        assert_eq!(commits.len(), 2);
        assert_eq!(commits[0].message, "commit 4");
        assert_eq!(commits[1].message, "commit 3");
    }

    #[test]
    fn test_format_timestamp() {
        let formatted = format_timestamp(0);
        assert!(formatted.contains("1970"));

        let formatted = format_timestamp(1609459200);
        assert!(formatted.contains("2021"));
    }
}
