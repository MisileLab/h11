use clap::{Parser, Subcommand};

pub mod add;
pub mod branch;
pub mod checkout;
pub mod clone;
pub mod commit;
pub mod gc;
pub mod init;
pub mod log;
pub mod mount;
pub mod operation_guard;
pub mod pull;
pub mod push;
pub mod scrub;
pub mod server;
pub mod similarity_cache;
pub mod status;
pub mod tag;
pub mod tier;
#[cfg(feature = "signing")]
pub mod verify;

#[cfg(test)]
pub mod test_utils;

/// Lapis — A block-level version control system for large binary files
#[derive(Parser)]
#[command(name = "lapis")]
#[command(about = "A block-level version control system for large binary files")]
#[command(version)]
#[command(author)]
pub struct Cli {
    /// Lapis command to execute
    #[command(subcommand)]
    pub command: Commands,
}

/// Phase 0 commands: init, add, commit, status, log, checkout, push, pull, server
#[derive(Subcommand)]
pub enum Commands {
    /// Initialize a new Lapis repository
    Init(InitArgs),
    /// Add a file to the staging area
    Add(AddArgs),
    /// Commit staged files
    Commit(CommitArgs),
    #[cfg(feature = "signing")]
    Verify(VerifyArgs),
    /// Show repository status
    Status(StatusArgs),
    /// Show commit history
    Log(LogArgs),
    /// Restore a file from a commit
    Checkout(CheckoutArgs),
    /// Upload staged blocks to a remote server
    Push(PushArgs),
    /// Download remote blocks from a server
    Pull(PullArgs),
    /// Clone a remote repository (shallow clone — HEAD only)
    Clone(CloneArgs),
    /// Start HTTP server for block access
    Server(server::ServerArgs),
    /// Garbage collect unreachable blocks
    Gc(GcArgs),
    /// Detect bit-rot and repair corrupted blocks
    Scrub(ScrubArgs),
    /// Manage branches (create, list, delete)
    Branch(BranchArgs),
    /// Manage tags (create, list, delete)
    Tag(TagArgs),
    /// Mount repository as read-only FUSE filesystem
    Mount(MountArgs),
    Tier(TierArgs),
}

/// Initialize a new Lapis repository
#[derive(Parser, Debug)]
pub struct InitArgs {
    /// Path to initialize repo at
    #[arg(default_value = ".")]
    pub path: String,
}

/// Add a file to the staging area
#[derive(Parser, Debug)]
pub struct AddArgs {
    /// Path to file to add
    pub path: String,
}

/// Commit staged files
#[derive(Parser, Debug)]
pub struct CommitArgs {
    /// Commit message
    #[arg(short, long)]
    pub message: String,

    #[cfg(feature = "signing")]
    #[arg(long)]
    pub sign: bool,
}

#[cfg(feature = "signing")]
#[derive(Parser, Debug)]
pub struct VerifyArgs {
    pub hash: String,
}

/// Show repository status
#[derive(Parser, Debug)]
pub struct StatusArgs;

/// Show commit history
#[derive(Parser, Debug)]
pub struct LogArgs {
    /// Show oneline format (hash + message only)
    #[arg(long)]
    pub oneline: bool,

    /// Limit number of commits shown
    #[arg(long)]
    pub limit: Option<usize>,
}

/// Restore a file from a commit
#[derive(Parser, Debug)]
pub struct CheckoutArgs {
    /// Commit reference (e.g., HEAD)
    pub commit_ref: String,

    /// File path to restore (can be preceded by --)
    #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
    pub file_path_args: Vec<String>,
}

/// Upload staged blocks to a remote server
#[derive(Parser, Debug)]
pub struct PushArgs {
    /// Remote name (e.g., "origin") or explicit server URL via --server
    pub remote: Option<String>,
    /// Server URL (default: http://localhost:3000, overrides positional remote)
    #[arg(short, long)]
    pub server: Option<String>,
}

/// Download remote blocks from a server
#[derive(Parser, Debug)]
pub struct PullArgs {
    /// Remote name (e.g., "origin") or explicit server URL via --server
    pub remote: Option<String>,
    /// Server URL (default: http://localhost:3000, overrides positional remote)
    #[arg(short, long)]
    pub server: Option<String>,
}

/// Clone a remote repository (shallow clone — HEAD only)
#[derive(Parser, Debug)]
pub struct CloneArgs {
    /// Repository URL (e.g., http://example.com:3000/repo)
    pub url: String,

    /// Destination directory for cloned repository
    pub path: String,

    /// Clone depth (default: 1 for shallow clone, HEAD-only)
    #[arg(long)]
    pub depth: Option<usize>,
}

/// Garbage collect unreachable blocks
#[derive(Parser, Debug)]
pub struct GcArgs {
    /// Perform garbage collection without deleting anything (dry-run)
    #[arg(long)]
    pub dry_run: bool,

    /// Grace period in seconds (protect reflog entries within this duration)
    #[arg(long, default_value = "3600")]
    pub grace_period: u64,
}

/// Detect bit-rot and repair corrupted blocks
#[derive(Parser, Debug)]
pub struct ScrubArgs {
    /// Attempt to repair corrupted blocks by fetching from remote
    #[arg(long)]
    pub repair: bool,
}

/// Manage branches
#[derive(Parser, Debug)]
pub struct BranchArgs {
    /// Branch name
    pub name: Option<String>,

    /// Delete branch
    #[arg(short, long)]
    pub delete: bool,

    /// List branches
    #[arg(short, long)]
    pub list: bool,
}

/// Manage tags
#[derive(Parser, Debug)]
pub struct TagArgs {
    /// Tag name
    pub name: Option<String>,

    /// Delete tag
    #[arg(short, long)]
    pub delete: bool,

    /// List tags
    #[arg(short, long)]
    pub list: bool,
}

/// Mount repository as FUSE filesystem
#[derive(Parser, Debug)]
pub struct MountArgs {
    /// Mount point path
    pub mount_point: String,
}

#[derive(Parser, Debug)]
pub struct TierArgs {
    #[command(subcommand)]
    pub command: TierCommand,
}

#[derive(Subcommand, Debug)]
pub enum TierCommand {
    Cold(TierColdArgs),
}

#[derive(Parser, Debug)]
pub struct TierColdArgs {
    #[arg(long = "older-than")]
    pub older_than: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cli_parse_init() {
        let args = vec!["lapis", "init", "/tmp/test"];
        let cli = Cli::try_parse_from(args).unwrap();
        match cli.command {
            Commands::Init(args) => assert_eq!(args.path, "/tmp/test"),
            _ => panic!("Expected Init command"),
        }
    }

    #[test]
    fn test_cli_parse_add() {
        let args = vec!["lapis", "add", "file.txt"];
        let cli = Cli::try_parse_from(args).unwrap();
        match cli.command {
            Commands::Add(args) => assert_eq!(args.path, "file.txt"),
            _ => panic!("Expected Add command"),
        }
    }

    #[test]
    fn test_cli_parse_commit() {
        let args = vec!["lapis", "commit", "-m", "initial commit"];
        let cli = Cli::try_parse_from(args).unwrap();
        match cli.command {
            Commands::Commit(args) => {
                assert_eq!(args.message, "initial commit");
                #[cfg(feature = "signing")]
                assert!(!args.sign);
            }
            _ => panic!("Expected Commit command"),
        }
    }

    #[cfg(feature = "signing")]
    #[test]
    fn test_cli_parse_commit_with_sign() {
        let args = vec!["lapis", "commit", "--sign", "-m", "initial commit"];
        let cli = Cli::try_parse_from(args).unwrap();
        match cli.command {
            Commands::Commit(args) => {
                assert_eq!(args.message, "initial commit");
                assert!(args.sign);
            }
            _ => panic!("Expected Commit command"),
        }
    }

    #[cfg(feature = "signing")]
    #[test]
    fn test_cli_parse_verify() {
        let args = vec!["lapis", "verify", "abcdef"];
        let cli = Cli::try_parse_from(args).unwrap();
        match cli.command {
            Commands::Verify(args) => assert_eq!(args.hash, "abcdef"),
            _ => panic!("Expected Verify command"),
        }
    }

    #[test]
    fn test_cli_parse_status() {
        let args = vec!["lapis", "status"];
        let cli = Cli::try_parse_from(args).unwrap();
        match cli.command {
            Commands::Status(_) => {} // Success
            _ => panic!("Expected Status command"),
        }
    }

    #[test]
    fn test_cli_parse_log_with_options() {
        let args = vec!["lapis", "log", "--oneline", "--limit", "5"];
        let cli = Cli::try_parse_from(args).unwrap();
        match cli.command {
            Commands::Log(args) => {
                assert!(args.oneline);
                assert_eq!(args.limit, Some(5));
            }
            _ => panic!("Expected Log command"),
        }
    }

    #[test]
    fn test_cli_parse_log_default() {
        let args = vec!["lapis", "log"];
        let cli = Cli::try_parse_from(args).unwrap();
        match cli.command {
            Commands::Log(args) => {
                assert!(!args.oneline);
                assert_eq!(args.limit, None);
            }
            _ => panic!("Expected Log command"),
        }
    }

    #[test]
    fn test_cli_parse_checkout() {
        let args = vec!["lapis", "checkout", "HEAD", "--", "file.txt"];
        let cli = Cli::try_parse_from(args).unwrap();
        match cli.command {
            Commands::Checkout(args) => {
                assert_eq!(args.commit_ref, "HEAD");
                assert_eq!(args.file_path_args, vec!["file.txt"]);
            }
            _ => panic!("Expected Checkout command"),
        }
    }

    #[test]
    fn test_cli_parse_server() {
        let args = vec!["lapis", "server"];
        let cli = Cli::try_parse_from(args).unwrap();
        match cli.command {
            Commands::Server(args) => {
                assert_eq!(args.port, 3000);
                assert_eq!(args.store_path, None);
            }
            _ => panic!("Expected Server command"),
        }
    }

    #[test]
    fn test_cli_parse_server_with_port() {
        let args = vec!["lapis", "server", "-p", "8080"];
        let cli = Cli::try_parse_from(args).unwrap();
        match cli.command {
            Commands::Server(args) => {
                assert_eq!(args.port, 8080);
            }
            _ => panic!("Expected Server command"),
        }
    }

    #[test]
    fn test_cli_parse_push() {
        let args = vec!["lapis", "push"];
        let cli = Cli::try_parse_from(args).unwrap();
        match cli.command {
            Commands::Push(args) => {
                assert_eq!(args.remote, None);
                assert_eq!(args.server, None);
            }
            _ => panic!("Expected Push command"),
        }
    }

    #[test]
    fn test_cli_parse_push_with_server() {
        let args = vec!["lapis", "push", "--server", "http://example.com:3000"];
        let cli = Cli::try_parse_from(args).unwrap();
        match cli.command {
            Commands::Push(args) => {
                assert_eq!(args.remote, None);
                assert_eq!(args.server, Some("http://example.com:3000".to_string()));
            }
            _ => panic!("Expected Push command"),
        }
    }

    #[test]
    fn test_cli_parse_push_with_positional_remote() {
        let args = vec!["lapis", "push", "origin"];
        let cli = Cli::try_parse_from(args).unwrap();
        match cli.command {
            Commands::Push(args) => {
                assert_eq!(args.remote, Some("origin".to_string()));
                assert_eq!(args.server, None);
            }
            _ => panic!("Expected Push command"),
        }
    }

    #[test]
    fn test_cli_parse_push_server_takes_precedence() {
        let args = vec!["lapis", "push", "origin", "--server", "http://example.com:3000"];
        let cli = Cli::try_parse_from(args).unwrap();
        match cli.command {
            Commands::Push(args) => {
                assert_eq!(args.remote, Some("origin".to_string()));
                assert_eq!(args.server, Some("http://example.com:3000".to_string()));
            }
            _ => panic!("Expected Push command"),
        }
    }

    #[test]
    fn test_cli_parse_pull() {
        let args = vec!["lapis", "pull"];
        let cli = Cli::try_parse_from(args).unwrap();
        match cli.command {
            Commands::Pull(args) => {
                assert_eq!(args.remote, None);
                assert_eq!(args.server, None);
            }
            _ => panic!("Expected Pull command"),
        }
    }

    #[test]
    fn test_cli_parse_pull_with_server() {
        let args = vec!["lapis", "pull", "--server", "http://example.com:3000"];
        let cli = Cli::try_parse_from(args).unwrap();
        match cli.command {
            Commands::Pull(args) => {
                assert_eq!(args.remote, None);
                assert_eq!(args.server, Some("http://example.com:3000".to_string()));
            }
            _ => panic!("Expected Pull command"),
        }
    }

    #[test]
    fn test_cli_parse_pull_with_positional_remote() {
        let args = vec!["lapis", "pull", "origin"];
        let cli = Cli::try_parse_from(args).unwrap();
        match cli.command {
            Commands::Pull(args) => {
                assert_eq!(args.remote, Some("origin".to_string()));
                assert_eq!(args.server, None);
            }
            _ => panic!("Expected Pull command"),
        }
    }

    #[test]
    fn test_cli_parse_pull_server_takes_precedence() {
        let args = vec!["lapis", "pull", "origin", "--server", "http://example.com:3000"];
        let cli = Cli::try_parse_from(args).unwrap();
        match cli.command {
            Commands::Pull(args) => {
                assert_eq!(args.remote, Some("origin".to_string()));
                assert_eq!(args.server, Some("http://example.com:3000".to_string()));
            }
            _ => panic!("Expected Pull command"),
        }
    }

    #[test]
    fn test_cli_parse_clone() {
        let args = vec![
            "lapis",
            "clone",
            "http://example.com:3000/repo",
            "./local-clone",
        ];
        let cli = Cli::try_parse_from(args).unwrap();
        match cli.command {
            Commands::Clone(args) => {
                assert_eq!(args.url, "http://example.com:3000/repo");
                assert_eq!(args.path, "./local-clone");
                assert_eq!(args.depth, None);
            }
            _ => panic!("Expected Clone command"),
        }
    }

    #[test]
    fn test_cli_parse_clone_with_depth() {
        let args = vec![
            "lapis",
            "clone",
            "http://example.com:3000/repo",
            "./local-clone",
            "--depth",
            "1",
        ];
        let cli = Cli::try_parse_from(args).unwrap();
        match cli.command {
            Commands::Clone(args) => {
                assert_eq!(args.url, "http://example.com:3000/repo");
                assert_eq!(args.path, "./local-clone");
                assert_eq!(args.depth, Some(1));
            }
            _ => panic!("Expected Clone command"),
        }
    }

    #[test]
    fn test_cli_parse_gc() {
        let args = vec!["lapis", "gc"];
        let cli = Cli::try_parse_from(args).unwrap();
        match cli.command {
            Commands::Gc(args) => {
                assert!(!args.dry_run);
                assert_eq!(args.grace_period, 3600);
            }
            _ => panic!("Expected Gc command"),
        }
    }

    #[test]
    fn test_cli_parse_gc_with_options() {
        let args = vec!["lapis", "gc", "--dry-run", "--grace-period", "7200"];
        let cli = Cli::try_parse_from(args).unwrap();
        match cli.command {
            Commands::Gc(args) => {
                assert!(args.dry_run);
                assert_eq!(args.grace_period, 7200);
            }
            _ => panic!("Expected Gc command"),
        }
    }
}
