//! `lapis status` command implementation
//!
//! Shows the current repository status, including staged files, untracked files,
//! and modified files.

use lapis::chunking::chunk_file;
use lapis::error::Result;
use lapis::repo::Repository;
use std::fs;
use std::path::PathBuf;

use super::StatusArgs;

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

fn compute_file_chunks_hashes(file_path: &PathBuf) -> Result<Vec<String>> {
    let chunks = chunk_file(file_path)?;

    let mut chunk_hashes = Vec::new();
    for chunk in &chunks {
        let mut chunk_data = vec![0u8; chunk.length as usize];
        let mut file = fs::File::open(file_path)?;
        use std::io::{Read, Seek, SeekFrom};
        file.seek(SeekFrom::Start(chunk.offset))?;
        file.read_exact(&mut chunk_data)?;

        let chunk_hash = blake3::hash(&chunk_data);
        chunk_hashes.push(hex::encode(chunk_hash.as_bytes()));
    }

    Ok(chunk_hashes)
}

fn collect_modified_files(
    repo_root: &PathBuf,
    staging: &super::add::StagingArea,
) -> Result<Vec<String>> {
    let mut modified = Vec::new();

    for staged_file in &staging.files {
        let file_path = repo_root.join(&staged_file.file_path);

        if !file_path.exists() {
            continue;
        }

        let current_chunks = compute_file_chunks_hashes(&file_path)?;

        if current_chunks != staged_file.chunk_hashes {
            modified.push(staged_file.file_path.clone());
        }
    }

    modified.sort();
    Ok(modified)
}

pub fn execute(_args: StatusArgs) -> Result<()> {
    let repo_root = find_repo_root()?;
    let _repo = Repository::open(&repo_root)?;

    let staging_path = repo_root.join(".lapis/staging.json");
    let mut has_output = false;

    let mut staged_files_set = std::collections::HashSet::new();

    if staging_path.exists() {
        let staging_data = fs::read(&staging_path)?;
        let staging = super::add::StagingArea::deserialize(&staging_data)?;

        if !staging.files.is_empty() {
            let modified_files = collect_modified_files(&repo_root, &staging)?;

            let mut uncommitted_staged = Vec::new();
            for file in &staging.files {
                staged_files_set.insert(file.file_path.clone());
                if !modified_files.contains(&file.file_path) {
                    uncommitted_staged.push(file.file_path.clone());
                }
            }

            if !uncommitted_staged.is_empty() {
                println!("Changes to be committed:");
                for file in &uncommitted_staged {
                    println!("  {}", file);
                }
                has_output = true;
            }

            if !modified_files.is_empty() {
                if has_output {
                    println!();
                }
                println!("Modified (not staged):");
                for file in &modified_files {
                    println!("  {}", file);
                }
                has_output = true;
            }
        }
    }

    let untracked_status = collect_untracked_files(&repo_root, &staged_files_set)?;
    if !untracked_status.is_empty() {
        if has_output {
            println!();
        }
        println!("Untracked files:");
        for file in &untracked_status {
            println!("  {}", file);
        }
        has_output = true;
    }

    if !has_output {
        println!("nothing to commit, working tree clean");
    }

    Ok(())
}

fn collect_untracked_files(
    repo_root: &PathBuf,
    staged_files: &std::collections::HashSet<String>,
) -> Result<Vec<String>> {
    let mut untracked = Vec::new();

    for entry in fs::read_dir(repo_root)? {
        let entry = entry?;
        let path = entry.path();
        if path.file_name().map_or(false, |n| n == ".lapis") {
            continue;
        }
        if path.is_file() {
            let rel_path = path
                .strip_prefix(repo_root)
                .unwrap_or(&path)
                .to_string_lossy()
                .to_string();
            if !staged_files.contains(&rel_path) {
                untracked.push(rel_path);
            }
        }
    }

    untracked.sort();
    Ok(untracked)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cli::{add, test_utils::acquire_cwd_lock, AddArgs};
    use tempfile::TempDir;

    fn safe_original_cwd() -> PathBuf {
        if let Ok(cwd) = std::env::current_dir() {
            if cwd.exists() {
                return cwd;
            }
        }
        let fallback = std::env::temp_dir();
        let _ = std::env::set_current_dir(&fallback);
        fallback
    }

    #[test]
    fn test_status_clean() {
        let _lock = acquire_cwd_lock();
        let temp_dir = TempDir::new().expect("create temp dir");
        let repo_root = temp_dir.path().to_path_buf();

        lapis::repo::Repository::init(&repo_root).expect("init should succeed");

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(&repo_root).expect("set cwd");

        let args = StatusArgs;
        let result = execute(args);
        assert!(result.is_ok());

        let _ = std::env::set_current_dir(&original_cwd);
        drop(temp_dir);
    }

    #[test]
    fn test_status_with_staged_file() {
        let _lock = acquire_cwd_lock();
        let temp_dir = TempDir::new().expect("create temp dir");
        let repo_root = temp_dir.path().to_path_buf();

        lapis::repo::Repository::init(&repo_root).expect("init should succeed");

        let test_file = repo_root.join("test.txt");
        fs::write(&test_file, b"test content").expect("write test file");

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(&repo_root).expect("set cwd");

        let add_args = AddArgs {
            path: "test.txt".to_string(),
        };
        add::execute(add_args).expect("add should succeed");

        let args = StatusArgs;
        let result = execute(args);
        assert!(result.is_ok());

        let _ = std::env::set_current_dir(&original_cwd);
        drop(temp_dir);
    }

    #[test]
    fn test_status_with_untracked_file() {
        let _lock = acquire_cwd_lock();
        let temp_dir = TempDir::new().expect("create temp dir");
        let repo_root = temp_dir.path().to_path_buf();

        lapis::repo::Repository::init(&repo_root).expect("init should succeed");

        let untracked_file = repo_root.join("untracked.txt");
        fs::write(&untracked_file, b"untracked content").expect("write untracked file");

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(&repo_root).expect("set cwd");

        let args = StatusArgs;
        let result = execute(args);
        assert!(result.is_ok());

        let _ = std::env::set_current_dir(&original_cwd);
        drop(temp_dir);
    }

    #[test]
    fn test_status_not_in_repo() {
        let _lock = acquire_cwd_lock();
        let temp_dir = TempDir::new().expect("create temp dir");
        let work_dir = temp_dir.path().join("work");
        fs::create_dir_all(&work_dir).expect("create work dir");

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(&work_dir).expect("set cwd");

        let args = StatusArgs;

        let result = execute(args);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("not in a lapis repository"));

        let _ = std::env::set_current_dir(&original_cwd);
        drop(temp_dir);
    }

    #[test]
    fn test_status_modified_single_chunk_file() {
        let _lock = acquire_cwd_lock();
        let temp_dir = TempDir::new().expect("create temp dir");
        let repo_root = temp_dir.path().to_path_buf();

        lapis::repo::Repository::init(&repo_root).expect("init should succeed");

        let test_file = repo_root.join("test.txt");
        fs::write(&test_file, b"original content").expect("write test file");

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(&repo_root).expect("set cwd");

        let add_args = AddArgs {
            path: "test.txt".to_string(),
        };
        add::execute(add_args).expect("add should succeed");

        fs::write(&test_file, b"modified content").expect("modify test file");

        let args = StatusArgs;
        let result = execute(args);
        assert!(result.is_ok());

        let _ = std::env::set_current_dir(&original_cwd);
        drop(temp_dir);
    }
}
