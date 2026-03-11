use lapis::error::{LapisError, Result};
use lapis::repo::Repository;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

const GC_TRANSFER_LOCK: &str = "gc-transfer.lock";

#[derive(Debug)]
pub struct RepoOperationGuard {
    lock_path: PathBuf,
}

impl RepoOperationGuard {
    pub fn acquire(repo: &Repository, operation: &str) -> Result<Self> {
        let lock_dir = repo.lapis_dir().join("locks");
        fs::create_dir_all(&lock_dir).map_err(LapisError::Io)?;

        let lock_path = lock_dir.join(GC_TRANSFER_LOCK);
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&lock_path)
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::AlreadyExists {
                    LapisError::Metadata(
                        "another gc/push/pull operation is already running for this repository"
                            .to_string(),
                    )
                } else {
                    LapisError::Io(e)
                }
            })?;

        file.write_all(operation.as_bytes())
            .map_err(LapisError::Io)?;

        Ok(Self { lock_path })
    }
}

impl Drop for RepoOperationGuard {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.lock_path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_repo_operation_guard_blocks_gc_push_pull_overlap() {
        let temp_repo = TempDir::new().unwrap();
        let repo_root = temp_repo.path().to_path_buf();
        let repo = lapis::repo::Repository::init(&repo_root).expect("init repo");

        let _gc_guard = RepoOperationGuard::acquire(&repo, "gc").expect("acquire gc guard");
        let err = RepoOperationGuard::acquire(&repo, "push").expect_err("push must conflict");

        assert!(
            err.to_string().contains("already running"),
            "second overlapping gc/push/pull operation should be rejected"
        );
    }

    #[test]
    fn test_repo_operation_guard_releases_lock_on_drop() {
        let temp_repo = TempDir::new().unwrap();
        let repo_root = temp_repo.path().to_path_buf();
        let repo = lapis::repo::Repository::init(&repo_root).expect("init repo");

        {
            let _guard = RepoOperationGuard::acquire(&repo, "pull").expect("acquire pull guard");
        }

        RepoOperationGuard::acquire(&repo, "gc").expect("lock should be reusable after drop");
    }
}
