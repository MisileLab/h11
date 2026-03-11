//! Init command implementation for creating new repositories

use super::InitArgs;
use lapis::error::Result;
use lapis::repo::Repository;
use std::path::Path;

/// Execute the init command
///
/// Creates a new Lapis repository at the specified path with all required
/// directory structure and metadata initialization.
pub fn execute(args: InitArgs) -> Result<()> {
    let path = Path::new(&args.path);
    let repo = Repository::init(path)?;
    println!("Initialized Lapis repository at: {}", repo.root().display());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_init_command_execution() {
        let temp_root = TempDir::new().expect("create temp dir");
        let init_path = temp_root.path().join("test-repo");

        let args = InitArgs {
            path: init_path.to_string_lossy().to_string(),
        };

        let result = execute(args);
        assert!(result.is_ok());

        // Verify repo was created
        assert!(init_path.exists());
        assert!(init_path.join(".lapis").exists());
    }

    #[test]
    fn test_init_command_rejects_non_empty_directory() {
        let temp_root = TempDir::new().expect("create temp dir");
        let init_path = temp_root.path().join("test-repo");
        std::fs::create_dir_all(&init_path).expect("create dir");
        std::fs::write(init_path.join("existing-file.txt"), "content").expect("write file");

        let args = InitArgs {
            path: init_path.to_string_lossy().to_string(),
        };

        let result = execute(args);
        assert!(result.is_err());
    }
}
