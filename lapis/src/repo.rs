//! Repository initialization and management
//!
//! Handles the `.lapis/` directory structure, SQLite index initialization,
//! and initial commit sentinel registration.

use crate::error::{LapisError, Result};
use crate::index::MetadataStore;
use std::fs;
use std::path::{Path, PathBuf};

const LAPIS_DIR: &str = ".lapis";
const CONFIG_FILE: &str = "config.toml";
const STORE_SUBDIR: &str = "store";
const STORE_HOT_SUBDIR: &str = "hot";
const META_SUBDIR: &str = "meta";
const INDEX_DB_NAME: &str = "index.db";

/// A Lapis repository instance with access to metadata store and content-addressed storage
#[derive(Debug)]
pub struct Repository {
    root: PathBuf,
    lapis_dir: PathBuf,
    store_hot_dir: PathBuf,
    meta_dir: PathBuf,
}

impl Repository {
    /// Initialize a new Lapis repository at the specified path
    ///
    /// Creates the `.lapis/` directory structure with:
    /// - `.lapis/config.toml` for configuration
    /// - `.lapis/store/hot/` for content-addressed blocks
    /// - `.lapis/meta/index.db` SQLite metadata store
    /// - Initial commit sentinel (all-zero hash) registered in repo metadata
    ///
    /// # Arguments
    ///
    /// * `target_path` - Directory where repository should be initialized
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - `target_path` does not exist or cannot be created
    /// - `target_path` is not empty and no `--force` flag was used (not currently implemented)
    /// - Directory creation fails
    /// - SQLite initialization fails
    ///
    /// # Example
    ///
    /// ```ignore
    /// let repo = Repository::init("./my-lapis-repo")?;
    /// println!("Initialized repo at: {}", repo.root().display());
    /// ```
    pub fn init(target_path: impl AsRef<Path>) -> Result<Self> {
        let root = target_path.as_ref().to_path_buf();

        if !root.exists() {
            fs::create_dir_all(&root)?;
        }

        let is_empty = fs::read_dir(&root)
            .map_err(|e| LapisError::Metadata(format!("Failed to read target directory: {}", e)))?
            .next()
            .is_none();

        if !is_empty {
            return Err(LapisError::Metadata(
                "Target directory is not empty; use --force to override".to_string(),
            ));
        }

        let lapis_dir = root.join(LAPIS_DIR);
        let store_hot_dir = lapis_dir.join(STORE_SUBDIR).join(STORE_HOT_SUBDIR);
        let meta_dir = lapis_dir.join(META_SUBDIR);

        fs::create_dir_all(&lapis_dir)?;
        fs::create_dir_all(&store_hot_dir)?;
        fs::create_dir_all(&meta_dir)?;

        let config_path = lapis_dir.join(CONFIG_FILE);
        let default_config = r#"[lapis]
version = "0.1.0"
chunking_min = 65536
chunking_avg = 262144
chunking_max = 1048576
"#;
        fs::write(&config_path, default_config)?;

        let db_path = meta_dir.join(INDEX_DB_NAME);
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| LapisError::Metadata(format!("Failed to create async runtime: {}", e)))?;

        rt.block_on(async {
            let mut store = MetadataStore::new(&db_path).await?;

            sqlx::query("PRAGMA foreign_keys=OFF")
                .execute(store.write_conn())
                .await
                .map_err(|e| LapisError::Database(format!("Failed to disable FK checks: {}", e)))?;

            let initial_manifest_hash = [0u8; 32];

            sqlx::query(
                "INSERT OR IGNORE INTO manifests (hash, file_path, chunk_list, total_size, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)"
            )
            .bind(initial_manifest_hash.to_vec())
            .bind("[LAPIS INIT]")
            .bind("[]")
            .bind(0i64)
            .bind(0i64)
            .execute(store.write_conn())
            .await
            .map_err(|e| LapisError::Database(format!("Failed to register initial manifest: {}", e)))?;

            let initial_commit_hash = [0u8; 32];

            sqlx::query(
                "INSERT OR IGNORE INTO commits (hash, parent_hash, manifest_hash, timestamp, message)
                 VALUES (?1, ?2, ?3, ?4, ?5)"
            )
            .bind(initial_commit_hash.to_vec())
            .bind(None::<Vec<u8>>)
            .bind(initial_manifest_hash.to_vec())
            .bind(0i64)
            .bind("[LAPIS INIT]")
            .execute(store.write_conn())
            .await
            .map_err(|e| LapisError::Database(format!("Failed to register initial commit: {}", e)))?;

            sqlx::query("PRAGMA foreign_keys=ON")
                .execute(store.write_conn())
                .await
                .map_err(|e| LapisError::Database(format!("Failed to enable FK checks: {}", e)))?;

            Ok::<(), LapisError>(())
        })?;

        Ok(Repository {
            root,
            lapis_dir,
            store_hot_dir,
            meta_dir,
        })
    }

    /// Open an existing Lapis repository at the specified path
    ///
    /// Verifies that `.lapis/` directory structure exists.
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - The path doesn't exist
    /// - The `.lapis/` directory is missing
    ///
    /// # Example
    ///
    /// ```ignore
    /// let repo = Repository::open("./my-lapis-repo")?;
    /// ```
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let root = path.as_ref().to_path_buf();

        if !root.exists() {
            return Err(LapisError::Metadata(
                "repository path does not exist".to_string(),
            ));
        }

        let lapis_dir = root.join(LAPIS_DIR);
        if !lapis_dir.exists() {
            return Err(LapisError::Metadata(
                "not a lapis repository (missing .lapis directory)".to_string(),
            ));
        }

        let store_hot_dir = lapis_dir.join(STORE_SUBDIR).join(STORE_HOT_SUBDIR);
        let meta_dir = lapis_dir.join(META_SUBDIR);

        Ok(Repository {
            root,
            lapis_dir,
            store_hot_dir,
            meta_dir,
        })
    }

    /// Get the repository root path
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Get the `.lapis` directory path
    pub fn lapis_dir(&self) -> &Path {
        &self.lapis_dir
    }

    /// Get the `.lapis/store/hot` directory path for CAS storage
    pub fn store_hot_dir(&self) -> &Path {
        &self.store_hot_dir
    }

    /// Get the `.lapis/meta` directory path for metadata
    pub fn meta_dir(&self) -> &Path {
        &self.meta_dir
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_init_creates_directory_structure() {
        let temp_root = TempDir::new().expect("create temp dir");
        let init_path = temp_root.path().join("test-repo");

        let repo = Repository::init(&init_path).expect("init should succeed");

        // Verify root exists
        assert!(repo.root().exists());
        assert_eq!(repo.root(), init_path);

        // Verify .lapis directory structure
        assert!(repo.lapis_dir().exists());
        assert!(repo.lapis_dir().join("store").exists());
        assert!(repo.store_hot_dir().exists());
        assert!(repo.meta_dir().exists());
    }

    #[test]
    fn test_init_creates_config_toml() {
        let temp_root = TempDir::new().expect("create temp dir");
        let init_path = temp_root.path().join("test-repo");

        let repo = Repository::init(&init_path).expect("init should succeed");

        let config_path = repo.lapis_dir().join("config.toml");
        assert!(config_path.exists());

        let config_content = fs::read_to_string(&config_path).expect("read config.toml");
        assert!(config_content.contains("[lapis]"));
        assert!(config_content.contains("chunking_min"));
        assert!(config_content.contains("chunking_avg"));
        assert!(config_content.contains("chunking_max"));
    }

    #[test]
    fn test_init_creates_sqlite_index() {
        let temp_root = TempDir::new().expect("create temp dir");
        let init_path = temp_root.path().join("test-repo");

        let repo = Repository::init(&init_path).expect("init should succeed");

        let db_path = repo.meta_dir().join("index.db");
        assert!(db_path.exists(), "index.db should exist");
    }

    #[test]
    fn test_init_rejects_non_empty_directory() {
        let temp_root = TempDir::new().expect("create temp dir");
        let init_path = temp_root.path().join("test-repo");
        fs::create_dir_all(&init_path).expect("create dir");

        // Create a file to make directory non-empty
        fs::write(init_path.join("existing-file.txt"), "content").expect("write file");

        let result = Repository::init(&init_path);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not empty"));
    }

    #[test]
    fn test_init_handles_nonexistent_parent() {
        let temp_root = TempDir::new().expect("create temp dir");
        let init_path = temp_root.path().join("nested/deep/path");

        let repo = Repository::init(&init_path).expect("init should succeed");

        assert!(repo.root().exists());
        assert!(repo.lapis_dir().exists());
    }
}
