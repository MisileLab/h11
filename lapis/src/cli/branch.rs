//! `lapis branch` command implementation
//!
//! Manages branches: create, list, and delete.
//! Branches are mutable references to commits.

use lapis::error::Result;
use lapis::index::MetadataStore;
use lapis::repo::Repository;
use std::fs;
use std::path::PathBuf;

use super::BranchArgs;

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

    // If HEAD is a ref, extract commit hash from database
    if trimmed.starts_with("ref: refs/heads/") {
        let branch_name = trimmed
            .strip_prefix("ref: refs/heads/")
            .unwrap()
            .to_string();
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

        return rt.block_on(async_get_ref(db_path, branch_name));
    }

    // Otherwise HEAD is a commit hash (hex-encoded)
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

pub fn execute(args: BranchArgs) -> Result<()> {
    let repo_root = find_repo_root()?;
    let repo = Repository::open(&repo_root)?;

    // Parse arguments into subcommands
    match (args.list, args.delete, args.name.clone()) {
        // `lapis branch --list` or `lapis branch` with no args
        (true, _, _) | (false, false, None) => list_branches(&repo),
        // `lapis branch <name>` - create new branch at HEAD
        (false, false, Some(name)) => create_branch(&repo, &name),
        // `lapis branch -d <name>` or `--delete <name>`
        (false, true, Some(name)) => delete_branch(&repo, &name),
        _ => Err(lapis::error::LapisError::Metadata(
            "Invalid branch command arguments".to_string(),
        )),
    }
}

fn create_branch(repo: &Repository, name: &str) -> Result<()> {
    let head_commit = read_head(repo)?.ok_or_else(|| {
        lapis::error::LapisError::Metadata("no commits yet; cannot create branch".to_string())
    })?;

    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| {
            lapis::error::LapisError::Metadata(format!("Failed to create async runtime: {}", e))
        })?;

    async fn async_create_branch(
        db_path: std::path::PathBuf,
        name: &str,
        commit_hash: &[u8; 32],
    ) -> Result<()> {
        let mut store = MetadataStore::new(&db_path).await?;
        store.create_ref(name, "branch", commit_hash).await
    }

    rt.block_on(async_create_branch(
        repo.meta_dir().join("index.db"),
        name,
        &head_commit,
    ))?;
    println!("Created branch '{}'", name);
    Ok(())
}

fn list_branches(repo: &Repository) -> Result<()> {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| {
            lapis::error::LapisError::Metadata(format!("Failed to create async runtime: {}", e))
        })?;

    async fn async_list_branches(db_path: std::path::PathBuf) -> Result<()> {
        let store = MetadataStore::new(&db_path).await?;
        let branches = store.list_refs("branch").await?;

        if branches.is_empty() {
            println!("no branches");
        } else {
            for (name, _hash) in branches {
                println!("{}", name);
            }
        }

        Ok(())
    }

    rt.block_on(async_list_branches(repo.meta_dir().join("index.db")))
}

fn delete_branch(repo: &Repository, name: &str) -> Result<()> {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| {
            lapis::error::LapisError::Metadata(format!("Failed to create async runtime: {}", e))
        })?;

    async fn async_delete_branch(
        db_path: std::path::PathBuf,
        repo_root: std::path::PathBuf,
        name: &str,
    ) -> Result<()> {
        let mut store = MetadataStore::new(&db_path).await?;
        let current_branch = store.get_current_branch(&repo_root).await.ok().flatten();
        store
            .delete_ref(name, "branch", current_branch.as_deref())
            .await?;
        println!("Deleted branch '{}'", name);
        Ok(())
    }

    let db_path = repo.meta_dir().join("index.db");
    rt.block_on(async_delete_branch(
        db_path,
        repo.root().to_path_buf(),
        name,
    ))
}

#[cfg(test)]
mod tests {
    use lapis::index::MetadataStore;
    use tempfile::TempDir;

    async fn insert_test_commit(store: &mut MetadataStore, hash: &[u8; 32]) {
        let manifest_hash = [0u8; 32];
        // Insert manifest first (referenced by commit)
        sqlx::query(
            "INSERT OR IGNORE INTO manifests (hash, file_path, chunk_list, total_size, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(manifest_hash.to_vec())
        .bind("test")
        .bind("[]")
        .bind(0i64)
        .bind(0i64)
        .execute(store.write_conn())
        .await
        .unwrap();

        // Then insert commit
        sqlx::query(
            "INSERT OR IGNORE INTO commits (hash, parent_hash, manifest_hash, timestamp, message)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(hash.to_vec())
        .bind(None::<Vec<u8>>)
        .bind(manifest_hash.to_vec())
        .bind(0i64)
        .bind("test")
        .execute(store.write_conn())
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn test_branch_create() {
        let tmpdir = TempDir::new().unwrap();
        let db_path = tmpdir.path().join("index.db");

        let mut store = MetadataStore::new(&db_path).await.unwrap();
        let commit_hash = [1u8; 32];
        insert_test_commit(&mut store, &commit_hash).await;

        store
            .create_ref("main", "branch", &commit_hash)
            .await
            .unwrap();

        let result = store.get_ref("main", "branch").await.unwrap();
        assert_eq!(result, Some(commit_hash));
    }

    #[tokio::test]
    async fn test_branch_list_empty() {
        let tmpdir = TempDir::new().unwrap();
        let db_path = tmpdir.path().join("index.db");

        let store = MetadataStore::new(&db_path).await.unwrap();

        let branches = store.list_refs("branch").await.unwrap();
        assert!(branches.is_empty());
    }

    #[tokio::test]
    async fn test_branch_list_multiple() {
        let tmpdir = TempDir::new().unwrap();
        let db_path = tmpdir.path().join("index.db");

        let mut store = MetadataStore::new(&db_path).await.unwrap();

        let hash1 = [1u8; 32];
        let hash2 = [2u8; 32];
        insert_test_commit(&mut store, &hash1).await;
        insert_test_commit(&mut store, &hash2).await;

        store.create_ref("main", "branch", &hash1).await.unwrap();
        store.create_ref("develop", "branch", &hash2).await.unwrap();

        let branches = store.list_refs("branch").await.unwrap();
        assert_eq!(branches.len(), 2);
        assert_eq!(branches[0].0, "develop"); // sorted by name
        assert_eq!(branches[1].0, "main");
    }

    #[tokio::test]
    async fn test_branch_delete_protection() {
        let tmpdir = TempDir::new().unwrap();
        let db_path = tmpdir.path().join("index.db");

        let mut store = MetadataStore::new(&db_path).await.unwrap();

        let hash = [1u8; 32];
        insert_test_commit(&mut store, &hash).await;
        store.create_ref("main", "branch", &hash).await.unwrap();

        // Try to delete current branch (should fail)
        let result = store.delete_ref("main", "branch", Some("main")).await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("cannot delete the current branch"));
    }

    #[tokio::test]
    async fn test_branch_delete_success() {
        let tmpdir = TempDir::new().unwrap();
        let db_path = tmpdir.path().join("index.db");

        let mut store = MetadataStore::new(&db_path).await.unwrap();

        let hash1 = [1u8; 32];
        let hash2 = [2u8; 32];
        insert_test_commit(&mut store, &hash1).await;
        insert_test_commit(&mut store, &hash2).await;

        store.create_ref("main", "branch", &hash1).await.unwrap();
        store.create_ref("develop", "branch", &hash2).await.unwrap();

        // Delete non-current branch
        store
            .delete_ref("develop", "branch", Some("main"))
            .await
            .unwrap();

        let result = store.get_ref("develop", "branch").await.unwrap();
        assert!(result.is_none());

        // main still exists
        let result = store.get_ref("main", "branch").await.unwrap();
        assert_eq!(result, Some(hash1));
    }

    #[test]
    fn test_branch_execute_create() {
        use std::fs;

        let tmpdir = TempDir::new().unwrap();
        let repo_root = tmpdir.path().to_path_buf();

        // Initialize a proper repo
        let repo = lapis::repo::Repository::init(&repo_root).expect("init repo");

        // Create a test commit manually
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let db_path = repo.meta_dir().join("index.db");
            let mut store = MetadataStore::new(&db_path).await.unwrap();

            let commit_hash = [1u8; 32];
            insert_test_commit(&mut store, &commit_hash).await;

            // Write HEAD as a direct commit hash
            let head_file = repo.lapis_dir().join("HEAD");
            fs::write(&head_file, hex::encode(&commit_hash)).unwrap();
        });

        // Change to repo directory to test real repo discovery
        let original_cwd = std::env::current_dir().unwrap();
        std::env::set_current_dir(&repo_root).unwrap();

        // Execute branch create command - this tests the real execute() path
        let args = super::BranchArgs {
            list: false,
            delete: false,
            name: Some("feature".to_string()),
        };

        let result = super::execute(args);

        // Restore original directory
        let _ = std::env::set_current_dir(&original_cwd);

        // Verify success
        assert!(result.is_ok(), "execute() should succeed: {:?}", result);
    }
}
