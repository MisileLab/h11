use crate::error::{LapisError, Result};
use chrono::Utc;
use sqlx::sqlite::SqlitePool;
use sqlx::{Connection, Row, SqliteConnection};
use std::path::Path;

/// MetadataStore wraps a single SQLite connection with a single-writer pattern.
/// All writes go through the same connection to avoid SQLITE_BUSY contention.
pub struct MetadataStore {
    /// Single write connection for serialized access
    write_conn: SqliteConnection,
    /// Read pool for parallel read access
    read_pool: SqlitePool,
}

impl MetadataStore {
    /// Initialize a new metadata store at the given path with WAL mode and busy_timeout.
    pub async fn new(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();

        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent).map_err(|e| {
                    LapisError::Metadata(format!("Failed to create db directory: {}", e))
                })?;
            }
        }

        let db_url = format!("sqlite://{}", path.display());

        let mut write_conn = create_connection(&db_url).await?;
        let read_pool = create_read_pool(&db_url, 4).await?;

        Self::init_schema(&mut write_conn).await?;

        Ok(MetadataStore {
            write_conn,
            read_pool,
        })
    }

    /// Get a reference to the write connection (for internal use in tests/queries)
    pub fn write_conn(&mut self) -> &mut SqliteConnection {
        &mut self.write_conn
    }

    /// Get a reference to the read pool
    pub fn read_pool(&self) -> &SqlitePool {
        &self.read_pool
    }

    /// Initialize the schema if it doesn't exist.
    async fn init_schema(conn: &mut SqliteConnection) -> Result<()> {
        Self::init_pragmas(conn).await?;
        Self::create_tables(conn).await?;
        Ok(())
    }

    /// Set up WAL mode and busy_timeout pragmas.
    async fn init_pragmas(conn: &mut SqliteConnection) -> Result<()> {
        sqlx::query("PRAGMA journal_mode=WAL")
            .execute(&mut *conn)
            .await
            .map_err(|e| LapisError::Database(format!("Failed to set journal_mode: {}", e)))?;

        sqlx::query("PRAGMA busy_timeout=5000")
            .execute(&mut *conn)
            .await
            .map_err(|e| LapisError::Database(format!("Failed to set busy_timeout: {}", e)))?;

        sqlx::query("PRAGMA foreign_keys=ON")
            .execute(&mut *conn)
            .await
            .map_err(|e| LapisError::Database(format!("Failed to enable foreign_keys: {}", e)))?;

        Ok(())
    }

    /// Create all required schema tables.
    async fn create_tables(conn: &mut SqliteConnection) -> Result<()> {
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS blocks (
                hash BLOB NOT NULL PRIMARY KEY,
                size INTEGER NOT NULL,
                zone TEXT NOT NULL DEFAULT 'hot',
                refcount INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL,
                compressed_size INTEGER,
                access_count INTEGER NOT NULL DEFAULT 0,
                compress_algo TEXT
            )",
        )
        .execute(&mut *conn)
        .await
        .map_err(|e| LapisError::Database(format!("Failed to create blocks table: {}", e)))?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS manifests (
                hash BLOB NOT NULL PRIMARY KEY,
                file_path TEXT NOT NULL,
                chunk_list TEXT NOT NULL,
                total_size INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            )",
        )
        .execute(&mut *conn)
        .await
        .map_err(|e| LapisError::Database(format!("Failed to create manifests table: {}", e)))?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS commits (
                hash BLOB NOT NULL PRIMARY KEY,
                parent_hash BLOB,
                manifest_hash BLOB NOT NULL,
                timestamp INTEGER NOT NULL,
                message TEXT NOT NULL,
                signature BLOB,
                FOREIGN KEY (parent_hash) REFERENCES commits(hash),
                FOREIGN KEY (manifest_hash) REFERENCES manifests(hash)
            )",
        )
        .execute(&mut *conn)
        .await
        .map_err(|e| LapisError::Database(format!("Failed to create commits table: {}", e)))?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS reflog (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                commit_hash BLOB NOT NULL,
                action TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                FOREIGN KEY (commit_hash) REFERENCES commits(hash)
            )",
        )
        .execute(&mut *conn)
        .await
        .map_err(|e| LapisError::Database(format!("Failed to create reflog table: {}", e)))?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS refs (
                name TEXT NOT NULL,
                ref_type TEXT NOT NULL,
                commit_hash BLOB NOT NULL,
                is_mutable INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                PRIMARY KEY (name, ref_type),
                FOREIGN KEY (commit_hash) REFERENCES commits(hash)
            )",
        )
        .execute(&mut *conn)
        .await
        .map_err(|e| LapisError::Database(format!("Failed to create refs table: {}", e)))?;

        Ok(())
    }

    /// Insert or update a block record.
    pub async fn insert_block(&mut self, hash: &[u8; 32], size: u32, zone: &str) -> Result<()> {
        let now = Utc::now().timestamp();
        sqlx::query(
            "INSERT OR IGNORE INTO blocks (hash, size, zone, refcount, created_at)
             VALUES (?1, ?2, ?3, 1, ?4)",
        )
        .bind(hash.to_vec())
        .bind(size as i64)
        .bind(zone)
        .bind(now)
        .execute(&mut self.write_conn)
        .await
        .map_err(|e| LapisError::Database(format!("Failed to insert block: {}", e)))?;

        Ok(())
    }

    /// Get block metadata by hash, including compression info.
    ///
    /// Returns (size, zone, compressed_size) where compressed_size is None for hot blocks
    /// or Some(size) for cold blocks.
    pub async fn get_block(&self, hash: &[u8; 32]) -> Result<Option<(u32, String, Option<u32>)>> {
        let result = sqlx::query("SELECT size, zone, compressed_size FROM blocks WHERE hash = ?1")
            .bind(hash.to_vec())
            .fetch_optional(&self.read_pool)
            .await
            .map_err(|e| LapisError::Database(format!("Failed to query block: {}", e)))?;

        Ok(result.map(|row| {
            let size: i64 = row.get("size");
            let zone: String = row.get("zone");
            let compressed_size: Option<i64> = row.get("compressed_size");
            (size as u32, zone, compressed_size.map(|cs| cs as u32))
        }))
    }

    /// Mark a block as migrated to cold storage with compression metadata.
    pub async fn mark_block_cold(&mut self, hash: &[u8; 32], compressed_size: u32) -> Result<()> {
        sqlx::query(
            "UPDATE blocks SET zone = 'cold', compressed_size = ?1, compress_algo = 'zstd:22' WHERE hash = ?2",
        )
            .bind(compressed_size as i64)
            .bind(hash.to_vec())
            .execute(&mut self.write_conn)
            .await
            .map_err(|e| LapisError::Database(format!("Failed to update block to cold: {}", e)))?;

        Ok(())
    }

    /// Check if a block exists.
    pub async fn block_exists(&self, hash: &[u8; 32]) -> Result<bool> {
        let result = sqlx::query("SELECT 1 FROM blocks WHERE hash = ?1 LIMIT 1")
            .bind(hash.to_vec())
            .fetch_optional(&self.read_pool)
            .await
            .map_err(|e| LapisError::Database(format!("Failed to check block existence: {}", e)))?;

        Ok(result.is_some())
    }

    /// Query eligible blocks for cold tiering by age and access count.
    ///
    /// Returns a list of (hash, compressed_size) tuples for blocks that are:
    /// - Currently in 'hot' zone
    /// - Older than the specified threshold (created_at <= threshold_timestamp)
    /// - Have access count <= max_access_count
    ///
    /// # Arguments
    /// * `older_than_timestamp` - Unix timestamp threshold (blocks created before this are eligible)
    /// * `max_access_count` - Maximum allowed access count (blocks with <= this count are eligible)
    pub async fn query_eligible_cold_blocks(
        &self,
        older_than_timestamp: i64,
        max_access_count: i32,
    ) -> Result<Vec<[u8; 32]>> {
        let rows = sqlx::query(
            "SELECT hash FROM blocks WHERE zone = 'hot' AND created_at <= ?1 AND access_count <= ?2"
        )
        .bind(older_than_timestamp)
        .bind(max_access_count)
        .fetch_all(&self.read_pool)
        .await
        .map_err(|e| LapisError::Database(format!("Failed to query eligible blocks: {}", e)))?;

        let mut result = Vec::new();
        for row in rows {
            let hash_bytes: Vec<u8> = row.get("hash");

            if hash_bytes.len() == 32 {
                let mut hash_array = [0u8; 32];
                hash_array.copy_from_slice(&hash_bytes);
                result.push(hash_array);
            }
        }

        Ok(result)
    }

    /// Update a block's metadata after successful cold migration.
    ///
    /// Sets zone='cold', stores compressed_size, and records compress_algo.
    pub async fn update_block_migrated_to_cold(
        &mut self,
        hash: &[u8; 32],
        compressed_size: u32,
        compress_algo: &str,
    ) -> Result<()> {
        sqlx::query(
            "UPDATE blocks SET zone = 'cold', compressed_size = ?1, compress_algo = ?2 WHERE hash = ?3"
        )
        .bind(compressed_size as i64)
        .bind(compress_algo)
        .bind(hash.to_vec())
        .execute(&mut self.write_conn)
        .await
        .map_err(|e| LapisError::Database(format!("Failed to update block migrated to cold: {}", e)))?;

        Ok(())
    }

    /// Get manifest's chunk list by manifest hash.
    ///
    /// Returns a Vec of chunk hashes (as [u8; 32]) for a given manifest.
    pub async fn get_manifest_chunks(&self, manifest_hash: &[u8; 32]) -> Result<Vec<[u8; 32]>> {
        let result = sqlx::query("SELECT chunk_list FROM manifests WHERE hash = ?1")
            .bind(manifest_hash.to_vec())
            .fetch_optional(&self.read_pool)
            .await
            .map_err(|e| LapisError::Database(format!("Failed to query manifest: {}", e)))?;

        if let Some(row) = result {
            let chunk_list_json: String = row.get("chunk_list");
            let byte_arrays: Vec<[u8; 32]> = serde_json::from_str(&chunk_list_json)
                .map_err(|e| LapisError::Metadata(format!("Invalid chunk_list JSON: {}", e)))?;
            Ok(byte_arrays)
        } else {
            Ok(Vec::new())
        }
    }

    /// Get the manifest hash for a given commit.
    pub async fn get_commit_manifest(&self, commit_hash: &[u8; 32]) -> Result<Option<[u8; 32]>> {
        let result = sqlx::query("SELECT manifest_hash FROM commits WHERE hash = ?1")
            .bind(commit_hash.to_vec())
            .fetch_optional(&self.read_pool)
            .await
            .map_err(|e| LapisError::Database(format!("Failed to query commit: {}", e)))?;

        Ok(result.and_then(|row| {
            let manifest_bytes: Vec<u8> = row.get("manifest_hash");
            if manifest_bytes.len() == 32 {
                let mut hash_array = [0u8; 32];
                hash_array.copy_from_slice(&manifest_bytes);
                Some(hash_array)
            } else {
                None
            }
        }))
    }

    /// Delete a block record from metadata store.
    ///
    /// Removes the block entry from the blocks table.
    /// Used during garbage collection to clean up metadata for deleted blocks.
    pub async fn delete_block(&mut self, hash: &[u8; 32]) -> Result<()> {
        sqlx::query("DELETE FROM blocks WHERE hash = ?1")
            .bind(hash.to_vec())
            .execute(&mut self.write_conn)
            .await
            .map_err(|e| LapisError::Database(format!("Failed to delete block: {}", e)))?;

        Ok(())
    }

    /// Create or update a reference (branch or tag).
    ///
    /// # Arguments
    /// * `name` - Name of the reference (e.g., "main", "v1.0")
    /// * `ref_type` - Type of reference: "branch" (mutable) or "tag" (immutable)
    /// * `commit_hash` - Target commit hash
    ///
    /// For tags (immutable): Returns error if tag already exists.
    /// For branches (mutable): Updates existing branch.
    pub async fn create_ref(
        &mut self,
        name: &str,
        ref_type: &str,
        commit_hash: &[u8; 32],
    ) -> Result<()> {
        let is_mutable = if ref_type == "branch" { 1 } else { 0 };
        let now = Utc::now().timestamp();

        // For tags, check if already exists
        if ref_type == "tag" {
            let existing = sqlx::query("SELECT 1 FROM refs WHERE name = ?1 AND ref_type = ?2")
                .bind(name)
                .bind("tag")
                .fetch_optional(&self.read_pool)
                .await
                .map_err(|e| {
                    LapisError::Database(format!("Failed to check existing tag: {}", e))
                })?;

            if existing.is_some() {
                return Err(LapisError::Metadata(format!(
                    "tag '{}' already exists",
                    name
                )));
            }
        }

        sqlx::query(
            "INSERT OR REPLACE INTO refs (name, ref_type, commit_hash, is_mutable, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(name)
        .bind(ref_type)
        .bind(commit_hash.to_vec())
        .bind(is_mutable)
        .bind(now)
        .execute(&mut self.write_conn)
        .await
        .map_err(|e| LapisError::Database(format!("Failed to create ref: {}", e)))?;

        Ok(())
    }

    /// Get a reference by name and type.
    ///
    /// Returns the commit hash the reference points to, or None if not found.
    pub async fn get_ref(&self, name: &str, ref_type: &str) -> Result<Option<[u8; 32]>> {
        let result = sqlx::query("SELECT commit_hash FROM refs WHERE name = ?1 AND ref_type = ?2")
            .bind(name)
            .bind(ref_type)
            .fetch_optional(&self.read_pool)
            .await
            .map_err(|e| LapisError::Database(format!("Failed to get ref: {}", e)))?;

        Ok(result.and_then(|row| {
            let hash_bytes: Vec<u8> = row.get("commit_hash");
            if hash_bytes.len() == 32 {
                let mut hash = [0u8; 32];
                hash.copy_from_slice(&hash_bytes);
                Some(hash)
            } else {
                None
            }
        }))
    }

    /// List all references of a given type.
    ///
    /// Returns a Vec of (name, commit_hash) tuples sorted by name.
    pub async fn list_refs(&self, ref_type: &str) -> Result<Vec<(String, [u8; 32])>> {
        let rows =
            sqlx::query("SELECT name, commit_hash FROM refs WHERE ref_type = ?1 ORDER BY name")
                .bind(ref_type)
                .fetch_all(&self.read_pool)
                .await
                .map_err(|e| LapisError::Database(format!("Failed to list refs: {}", e)))?;

        let mut results = Vec::new();
        for row in rows {
            let name: String = row.get("name");
            let hash_bytes: Vec<u8> = row.get("commit_hash");
            if hash_bytes.len() == 32 {
                let mut hash = [0u8; 32];
                hash.copy_from_slice(&hash_bytes);
                results.push((name, hash));
            }
        }

        Ok(results)
    }

    /// Delete a reference.
    ///
    /// Returns error if trying to delete the current branch or if ref doesn't exist.
    pub async fn delete_ref(
        &mut self,
        name: &str,
        ref_type: &str,
        current_branch: Option<&str>,
    ) -> Result<()> {
        // Prevent deletion of current branch
        if ref_type == "branch" {
            if let Some(current) = current_branch {
                if current == name {
                    return Err(LapisError::Metadata(format!(
                        "cannot delete the current branch '{}'",
                        name
                    )));
                }
            }
        }

        let rows_affected = sqlx::query("DELETE FROM refs WHERE name = ?1 AND ref_type = ?2")
            .bind(name)
            .bind(ref_type)
            .execute(&mut self.write_conn)
            .await
            .map_err(|e| LapisError::Database(format!("Failed to delete ref: {}", e)))?
            .rows_affected();

        if rows_affected == 0 {
            return Err(LapisError::Metadata(format!(
                "{} '{}' not found",
                ref_type, name
            )));
        }

        Ok(())
    }

    /// Get the current branch name from .lapis/HEAD.
    ///
    /// Returns the branch name, or None if HEAD is detached or doesn't exist.
    pub async fn get_current_branch(&self, repo_root: &std::path::Path) -> Result<Option<String>> {
        let head_file = repo_root.join(".lapis").join("HEAD");
        if !head_file.exists() {
            return Ok(None);
        }

        let content = std::fs::read_to_string(&head_file)
            .map_err(|e| LapisError::Metadata(format!("Failed to read HEAD file: {}", e)))?;

        let trimmed = content.trim();

        // If HEAD contains "ref: refs/heads/...", extract branch name
        if trimmed.starts_with("ref: refs/heads/") {
            let branch = trimmed
                .strip_prefix("ref: refs/heads/")
                .unwrap()
                .to_string();
            return Ok(Some(branch));
        }

        // Otherwise HEAD is a commit hash (detached)
        Ok(None)
    }
}

/// Create a single write connection with WAL and busy_timeout configured.
async fn create_connection(db_url: &str) -> Result<SqliteConnection> {
    sqlx::sqlite::SqliteConnection::connect(&format!("{}?mode=rwc", db_url))
        .await
        .map_err(|e| LapisError::Database(format!("Failed to connect to database: {}", e)))
}

/// Create a read pool with multiple connections for parallel reads.
async fn create_read_pool(db_url: &str, max_connections: u32) -> Result<SqlitePool> {
    let pool_url = format!("{}?mode=ro", db_url);
    sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(max_connections)
        .connect(&pool_url)
        .await
        .map_err(|e| LapisError::Database(format!("Failed to create read pool: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_init_schema() {
        let tmpdir = TempDir::new().unwrap();
        let db_path = tmpdir.path().join("test.db");

        let store = MetadataStore::new(&db_path)
            .await
            .expect("Failed to init store");

        // Verify tables exist by querying sqlite_master
        let tables: Vec<String> = sqlx::query("SELECT name FROM sqlite_master WHERE type='table'")
            .fetch_all(store.read_pool())
            .await
            .expect("Failed to query tables")
            .into_iter()
            .map(|row| row.get("name"))
            .collect();

        assert!(tables.contains(&"blocks".to_string()));
        assert!(tables.contains(&"manifests".to_string()));
        assert!(tables.contains(&"commits".to_string()));
        assert!(tables.contains(&"reflog".to_string()));
    }

    #[tokio::test]
    async fn test_wal_mode_enabled() {
        let tmpdir = TempDir::new().unwrap();
        let db_path = tmpdir.path().join("test.db");

        let store = MetadataStore::new(&db_path)
            .await
            .expect("Failed to init store");

        let mode: String = sqlx::query("PRAGMA journal_mode")
            .fetch_one(store.read_pool())
            .await
            .expect("Failed to query journal_mode")
            .get(0);

        assert_eq!(mode.to_lowercase(), "wal");
    }

    #[tokio::test]
    async fn test_busy_timeout_set() {
        let tmpdir = TempDir::new().unwrap();
        let db_path = tmpdir.path().join("test.db");

        let store = MetadataStore::new(&db_path)
            .await
            .expect("Failed to init store");

        let timeout: i64 = sqlx::query("PRAGMA busy_timeout")
            .fetch_one(store.read_pool())
            .await
            .expect("Failed to query busy_timeout")
            .get(0);

        assert_eq!(timeout, 5000);
    }

    #[tokio::test]
    async fn test_block_insert_and_query() {
        let tmpdir = TempDir::new().unwrap();
        let db_path = tmpdir.path().join("test.db");

        let mut store = MetadataStore::new(&db_path)
            .await
            .expect("Failed to init store");

        let hash: [u8; 32] = [1u8; 32];
        store
            .insert_block(&hash, 1024, "hot")
            .await
            .expect("Failed to insert block");

        let result = store.get_block(&hash).await.expect("Failed to get block");

        assert!(result.is_some());
        let (size, zone, compressed_size) = result.unwrap();
        assert_eq!(size, 1024);
        assert_eq!(zone, "hot");
        assert_eq!(compressed_size, None);
    }

    #[tokio::test]
    async fn test_block_exists() {
        let tmpdir = TempDir::new().unwrap();
        let db_path = tmpdir.path().join("test.db");

        let mut store = MetadataStore::new(&db_path)
            .await
            .expect("Failed to init store");

        let hash: [u8; 32] = [2u8; 32];
        assert!(!store
            .block_exists(&hash)
            .await
            .expect("Failed to check existence"));

        store
            .insert_block(&hash, 2048, "hot")
            .await
            .expect("Failed to insert block");

        assert!(store
            .block_exists(&hash)
            .await
            .expect("Failed to check existence"));
    }

    #[tokio::test]
    async fn test_concurrent_access() {
        let tmpdir = TempDir::new().unwrap();
        let db_path = tmpdir.path().join("test.db");

        let store = MetadataStore::new(&db_path)
            .await
            .expect("Failed to init store");

        // Spawn 10 concurrent read tasks
        let mut handles = vec![];
        for _i in 0..10 {
            let pool = store.read_pool().clone();
            let handle = tokio::spawn(async move {
                let count: i64 = sqlx::query("SELECT COUNT(*) as cnt FROM blocks")
                    .fetch_one(&pool)
                    .await
                    .expect("Failed to count blocks")
                    .get("cnt");
                count
            });
            handles.push(handle);
        }

        for handle in handles {
            let _count = handle.await.expect("Task failed");
        }

        // All concurrent reads should complete without SQLITE_BUSY errors
    }

    #[tokio::test]
    async fn test_multiple_blocks() {
        let tmpdir = TempDir::new().unwrap();
        let db_path = tmpdir.path().join("test.db");

        let mut store = MetadataStore::new(&db_path)
            .await
            .expect("Failed to init store");

        // Insert 5 blocks with different hashes
        for i in 0..5 {
            let mut hash = [0u8; 32];
            hash[0] = i;
            store
                .insert_block(&hash, 1024 * (i as u32 + 1), "hot")
                .await
                .expect("Failed to insert block");
        }

        // Verify all blocks exist
        for i in 0..5 {
            let mut hash = [0u8; 32];
            hash[0] = i;
            assert!(store
                .block_exists(&hash)
                .await
                .expect("Failed to check existence"));
        }
    }
}
