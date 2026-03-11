//! `lapis tag` command implementation
//!
//! Manages tags: create, list, and delete.
//! Tags are immutable references to commits (cannot be reassigned).

use lapis::error::Result;
use lapis::index::MetadataStore;
use lapis::repo::Repository;
use std::fs;
use std::path::PathBuf;

use super::TagArgs;

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

pub fn execute(args: TagArgs) -> Result<()> {
    let repo_root = find_repo_root()?;
    let repo = Repository::open(&repo_root)?;

    // Parse arguments into subcommands
    match (args.list, args.delete, args.name.clone()) {
        // `lapis tag --list` or `lapis tag` with no args
        (true, _, _) | (false, false, None) => list_tags(&repo),
        // `lapis tag <name>` - create new tag at HEAD
        (false, false, Some(name)) => create_tag(&repo, &name),
        // `lapis tag -d <name>` or `--delete <name>`
        (false, true, Some(name)) => delete_tag(&repo, &name),
        _ => Err(lapis::error::LapisError::Metadata(
            "Invalid tag command arguments".to_string(),
        )),
    }
}

fn create_tag(repo: &Repository, name: &str) -> Result<()> {
    let head_commit = read_head(repo)?.ok_or_else(|| {
        lapis::error::LapisError::Metadata("no commits yet; cannot create tag".to_string())
    })?;

    async fn async_create_tag(
        db_path: std::path::PathBuf,
        name: &str,
        commit_hash: &[u8; 32],
    ) -> Result<()> {
        let mut store = MetadataStore::new(&db_path).await?;
        store.create_ref(name, "tag", commit_hash).await
    }

    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| {
            lapis::error::LapisError::Metadata(format!("Failed to create async runtime: {}", e))
        })?;

    rt.block_on(async_create_tag(
        repo.meta_dir().join("index.db"),
        name,
        &head_commit,
    ))?;

    println!("Created tag '{}'", name);
    Ok(())
}

fn list_tags(repo: &Repository) -> Result<()> {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| {
            lapis::error::LapisError::Metadata(format!("Failed to create async runtime: {}", e))
        })?;

    async fn async_list_tags(db_path: std::path::PathBuf) -> Result<()> {
        let store = MetadataStore::new(&db_path).await?;
        let tags = store.list_refs("tag").await?;

        if tags.is_empty() {
            println!("no tags");
        } else {
            for (name, _hash) in tags {
                println!("{}", name);
            }
        }

        Ok(())
    }

    rt.block_on(async_list_tags(repo.meta_dir().join("index.db")))
}

fn delete_tag(repo: &Repository, name: &str) -> Result<()> {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| {
            lapis::error::LapisError::Metadata(format!("Failed to create async runtime: {}", e))
        })?;

    async fn async_delete_tag(db_path: std::path::PathBuf, name: &str) -> Result<()> {
        let mut store = MetadataStore::new(&db_path).await?;
        store.delete_ref(name, "tag", None).await?;
        println!("Deleted tag '{}'", name);
        Ok(())
    }

    rt.block_on(async_delete_tag(repo.meta_dir().join("index.db"), name))
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
    async fn test_tag_create() {
        let tmpdir = TempDir::new().unwrap();
        let db_path = tmpdir.path().join("index.db");

        let mut store = MetadataStore::new(&db_path).await.unwrap();
        let commit_hash = [1u8; 32];
        insert_test_commit(&mut store, &commit_hash).await;

        store.create_ref("v1.0", "tag", &commit_hash).await.unwrap();

        let result = store.get_ref("v1.0", "tag").await.unwrap();
        assert_eq!(result, Some(commit_hash));
    }

    #[tokio::test]
    async fn test_tag_immutability() {
        let tmpdir = TempDir::new().unwrap();
        let db_path = tmpdir.path().join("index.db");

        let mut store = MetadataStore::new(&db_path).await.unwrap();

        let commit_hash1 = [1u8; 32];
        let commit_hash2 = [2u8; 32];
        insert_test_commit(&mut store, &commit_hash1).await;
        insert_test_commit(&mut store, &commit_hash2).await;

        // Create tag at first commit
        store
            .create_ref("v1.0", "tag", &commit_hash1)
            .await
            .unwrap();

        // Try to recreate tag (should fail)
        let result = store.create_ref("v1.0", "tag", &commit_hash2).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("already exists"));

        // Verify tag still points to original commit
        let tag_hash = store.get_ref("v1.0", "tag").await.unwrap();
        assert_eq!(tag_hash, Some(commit_hash1));
    }

    #[tokio::test]
    async fn test_tag_list_empty() {
        let tmpdir = TempDir::new().unwrap();
        let db_path = tmpdir.path().join("index.db");

        let store = MetadataStore::new(&db_path).await.unwrap();

        let tags = store.list_refs("tag").await.unwrap();
        assert!(tags.is_empty());
    }

    #[tokio::test]
    async fn test_tag_list_multiple() {
        let tmpdir = TempDir::new().unwrap();
        let db_path = tmpdir.path().join("index.db");

        let mut store = MetadataStore::new(&db_path).await.unwrap();

        let hash1 = [1u8; 32];
        let hash2 = [2u8; 32];
        insert_test_commit(&mut store, &hash1).await;
        insert_test_commit(&mut store, &hash2).await;

        store.create_ref("v1.0", "tag", &hash1).await.unwrap();
        store.create_ref("v2.0", "tag", &hash2).await.unwrap();

        let tags = store.list_refs("tag").await.unwrap();
        assert_eq!(tags.len(), 2);
        assert_eq!(tags[0].0, "v1.0"); // sorted by name
        assert_eq!(tags[1].0, "v2.0");
    }

    #[tokio::test]
    async fn test_tag_delete() {
        let tmpdir = TempDir::new().unwrap();
        let db_path = tmpdir.path().join("index.db");

        let mut store = MetadataStore::new(&db_path).await.unwrap();

        let hash = [1u8; 32];
        insert_test_commit(&mut store, &hash).await;

        store.create_ref("v1.0", "tag", &hash).await.unwrap();
        store.delete_ref("v1.0", "tag", None).await.unwrap();

        let result = store.get_ref("v1.0", "tag").await.unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_tag_delete_nonexistent() {
        let tmpdir = TempDir::new().unwrap();
        let db_path = tmpdir.path().join("index.db");

        let mut store = MetadataStore::new(&db_path).await.unwrap();

        // Try to delete non-existent tag
        let result = store.delete_ref("nonexistent", "tag", None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    #[test]
    fn test_tag_execute_create() {
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

        // Execute tag create command - this tests the real execute() path
        let args = super::TagArgs {
            list: false,
            delete: false,
            name: Some("v1.0".to_string()),
        };

        let result = super::execute(args);

        // Restore original directory
        let _ = std::env::set_current_dir(&original_cwd);

        // Verify success
        assert!(result.is_ok(), "execute() should succeed: {:?}", result);
    }
}
