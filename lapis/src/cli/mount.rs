use fuser::MountOption;
use lapis::error::Result;
use lapis::fuse::LapisFs;
use lapis::index::MetadataStore;
use lapis::repo::Repository;
use lapis::store::CasStore;
use std::fs;
use std::path::PathBuf;

use super::MountArgs;

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

fn read_remote_url(repo: &Repository) -> Result<Option<String>> {
    let remote_file = repo.lapis_dir().join("remote");
    if !remote_file.exists() {
        return Ok(None);
    }

    let url = fs::read_to_string(&remote_file).map_err(|e| {
        lapis::error::LapisError::Metadata(format!("Failed to read remote file: {}", e))
    })?;

    Ok(Some(url.trim().to_string()))
}

pub fn execute(args: MountArgs) -> Result<()> {
    let repo_root = find_repo_root()?;
    let repo = Repository::open(&repo_root)?;

    let head_commit = match read_head(&repo)? {
        Some(hash) => hash,
        None => {
            return Err(lapis::error::LapisError::Metadata(
                "No HEAD commit found in repository".to_string(),
            ));
        }
    };

    let remote_url = read_remote_url(&repo)?;

    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| {
            lapis::error::LapisError::Metadata(format!("Failed to create runtime: {}", e))
        })?;

    let handle = rt.handle().clone();

    rt.block_on(async {
        let db_path = repo.meta_dir().join("index.db");
        let metadata_store = MetadataStore::new(&db_path).await?;

        let cas_store = CasStore::new(repo.store_hot_dir())?;

        let mut fs = LapisFs::new(repo, cas_store, metadata_store, head_commit)?;

        if let Some(url) = remote_url {
            fs.set_remote_url(url);
        }
        fs.set_runtime_handle(handle);

        fs.load_from_commit().await?;

        let mount_point = std::path::Path::new(&args.mount_point);

        eprintln!("Mounting repository at {}", mount_point.display());

        let options = vec![MountOption::RO, MountOption::FSName("lapis".to_string())];
        fuser::mount2(fs, mount_point, &options).map_err(|e| {
            lapis::error::LapisError::Metadata(format!("Failed to mount FUSE: {}", e))
        })?;

        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cli::test_utils::{acquire_cwd_lock, safe_original_cwd};
    use tempfile::TempDir;

    #[test]
    fn test_mount_command_parse() {
        let args = MountArgs {
            mount_point: "/mnt/lapis".to_string(),
        };
        assert_eq!(args.mount_point, "/mnt/lapis");
    }

    #[test]
    fn test_find_repo_root_walks_up_from_nested_directory() {
        let _lock = acquire_cwd_lock();
        let temp_dir = TempDir::new().expect("create temp dir");
        let repo = Repository::init(temp_dir.path()).expect("init repo");
        let nested = temp_dir.path().join("a/b/c");
        fs::create_dir_all(&nested).expect("create nested path");

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(&nested).expect("set cwd");

        let found_root = find_repo_root().expect("find repo root");

        let _ = std::env::set_current_dir(&original_cwd);

        assert_eq!(
            found_root
                .canonicalize()
                .expect("canonicalize discovered root"),
            repo.root().canonicalize().expect("canonicalize repo root")
        );
    }

    #[test]
    fn test_read_head_and_remote_url_trim_trailing_whitespace() {
        let temp_dir = TempDir::new().expect("create temp dir");
        let repo = Repository::init(temp_dir.path()).expect("init repo");
        let head_hash = hex::encode([9u8; 32]);

        fs::write(repo.lapis_dir().join("HEAD"), format!("{}\n", head_hash)).expect("write HEAD");
        fs::write(repo.lapis_dir().join("remote"), "http://example.com:3000\n")
            .expect("write remote");

        assert_eq!(read_head(&repo).expect("read head"), Some([9u8; 32]));
        assert_eq!(
            read_remote_url(&repo).expect("read remote"),
            Some("http://example.com:3000".to_string())
        );
    }
}
