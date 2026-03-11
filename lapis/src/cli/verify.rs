use lapis::error::Result;
use lapis::index::MetadataStore;
use lapis::repo::Repository;
use lapis::vcs::Commit;
use sqlx::Row;
use std::fs;
use std::path::PathBuf;

use super::VerifyArgs;

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

pub fn execute(args: VerifyArgs) -> Result<()> {
    let repo_root = find_repo_root()?;
    let repo = Repository::open(&repo_root)?;
    let db_path = repo.meta_dir().join("index.db");

    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| {
            lapis::error::LapisError::Metadata(format!("Failed to create async runtime: {}", e))
        })?;

    let commit_hash =
        rt.block_on(async { resolve_commit_ref(&repo, &db_path, &args.hash).await })?;
    let commit = rt.block_on(async { load_commit(&db_path, commit_hash).await })?;
    let payload = commit.signing_payload()?;
    let signature = commit
        .signature
        .as_ref()
        .ok_or_else(|| lapis::error::LapisError::Commit("Commit is not signed".to_string()))?;

    let signer = lapis::crypto::sigstore::verify_commit_payload(&payload, signature)?;
    println!("verified {}", hex::encode(commit_hash));
    println!("signer: {}", signer.identity);
    println!(
        "issuer: {}",
        signer.issuer.as_deref().unwrap_or("self-managed")
    );
    println!("key: {}", signer.key_id);
    println!("scheme: {}", signer.scheme);
    Ok(())
}

fn decode_hash(value: &str) -> Result<[u8; 32]> {
    let bytes = hex::decode(value).map_err(|e| {
        lapis::error::LapisError::Metadata(format!("Invalid commit hash format: {}", e))
    })?;
    if bytes.len() != 32 {
        return Err(lapis::error::LapisError::Metadata(
            "Commit hash must be 32 bytes".to_string(),
        ));
    }

    let mut hash = [0u8; 32];
    hash.copy_from_slice(&bytes);
    Ok(hash)
}

async fn resolve_commit_ref(
    repo: &Repository,
    db_path: &std::path::Path,
    value: &str,
) -> Result<[u8; 32]> {
    if value == "HEAD" {
        return resolve_head(repo, db_path).await?.ok_or_else(|| {
            lapis::error::LapisError::Metadata(
                "HEAD not found; no commits in repository".to_string(),
            )
        });
    }

    decode_hash(value)
}

async fn resolve_head(repo: &Repository, db_path: &std::path::Path) -> Result<Option<[u8; 32]>> {
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
        let store = MetadataStore::new(db_path).await?;
        return store.get_ref(branch_name, "branch").await;
    }

    decode_hash(trimmed).map(Some)
}

async fn load_commit(db_path: &std::path::Path, commit_hash: [u8; 32]) -> Result<Commit> {
    let store = MetadataStore::new(db_path).await?;
    let row = sqlx::query(
        "SELECT parent_hash, manifest_hash, timestamp, message, signature FROM commits WHERE hash = ?1",
    )
    .bind(commit_hash.to_vec())
    .fetch_optional(store.read_pool())
    .await
    .map_err(|e| lapis::error::LapisError::Database(format!("Failed to query commit: {}", e)))?
    .ok_or_else(|| lapis::error::LapisError::Metadata("Commit not found".to_string()))?;

    let parent = row
        .get::<Option<Vec<u8>>, _>("parent_hash")
        .map(to_hash32)
        .transpose()?;
    let manifest_hash = to_hash32(row.get::<Vec<u8>, _>("manifest_hash"))?;
    let timestamp = row.get::<i64, _>("timestamp") as u64;
    let message = row.get::<String, _>("message");
    let signature = row.get::<Option<Vec<u8>>, _>("signature");

    Ok(Commit {
        hash: commit_hash,
        parent,
        manifest_hash,
        timestamp,
        message,
        signature,
    })
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
    use std::fs;
    use tempfile::TempDir;
    use tokio::runtime::Runtime;

    #[test]
    fn test_decode_hash_rejects_short_hash() {
        let err = decode_hash("abcd").unwrap_err();
        assert!(err.to_string().contains("32 bytes"));
    }

    #[test]
    fn test_resolve_commit_ref_supports_head() {
        let tmpdir = TempDir::new().expect("create temp dir");
        let repo = Repository::init(tmpdir.path()).expect("init repo");
        let commit_hash = [7u8; 32];

        fs::write(repo.lapis_dir().join("HEAD"), hex::encode(commit_hash)).expect("write HEAD");

        let rt = Runtime::new().expect("create tokio runtime");
        let resolved = rt
            .block_on(resolve_commit_ref(
                &repo,
                &repo.meta_dir().join("index.db"),
                "HEAD",
            ))
            .expect("resolve HEAD");

        assert_eq!(resolved, commit_hash);
    }

    #[test]
    fn test_resolve_commit_ref_supports_branch_head_refs() {
        let tmpdir = TempDir::new().expect("create temp dir");
        let repo = Repository::init(tmpdir.path()).expect("init repo");
        let db_path = repo.meta_dir().join("index.db");
        let commit_hash = [8u8; 32];
        let manifest_hash = [9u8; 32];
        let rt = Runtime::new().expect("create tokio runtime");
        let mut store = rt
            .block_on(MetadataStore::new(&db_path))
            .expect("init store");

        rt.block_on(async {
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
        })
        .expect("insert manifest");

        rt.block_on(async {
            sqlx::query(
                "INSERT INTO commits (hash, parent_hash, manifest_hash, timestamp, message, signature)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )
            .bind(commit_hash.to_vec())
            .bind(None::<Vec<u8>>)
            .bind(manifest_hash.to_vec())
            .bind(1000i64)
            .bind("signed")
            .bind(None::<Vec<u8>>)
            .execute(store.write_conn())
            .await
        })
        .expect("insert commit");

        rt.block_on(store.create_ref("main", "branch", &commit_hash))
            .expect("create branch ref");
        fs::write(repo.lapis_dir().join("HEAD"), "ref: refs/heads/main").expect("write HEAD ref");

        let resolved = rt
            .block_on(resolve_commit_ref(&repo, &db_path, "HEAD"))
            .expect("resolve branch HEAD");

        assert_eq!(resolved, commit_hash);
    }

    #[test]
    fn test_decode_hash_accepts_raw_hashes() {
        let raw = "11".repeat(32);
        let resolved = decode_hash(&raw).expect("decode raw hash");
        assert_eq!(resolved, [0x11; 32]);
    }

    #[tokio::test]
    async fn test_load_commit_reads_signature() {
        let tmpdir = TempDir::new().expect("create temp dir");
        let db_path = tmpdir.path().join("test.db");
        let mut store = MetadataStore::new(&db_path).await.expect("init store");
        let manifest_hash = [7u8; 32];
        let commit_hash = [9u8; 32];
        let signature = vec![1, 2, 3];

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
            "INSERT INTO commits (hash, parent_hash, manifest_hash, timestamp, message, signature)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .bind(commit_hash.to_vec())
        .bind(None::<Vec<u8>>)
        .bind(manifest_hash.to_vec())
        .bind(1000i64)
        .bind("signed")
        .bind(Some(signature.clone()))
        .execute(store.write_conn())
        .await
        .expect("insert commit");

        let commit = load_commit(&db_path, commit_hash)
            .await
            .expect("load commit");
        assert_eq!(commit.signature, Some(signature));
    }
}
