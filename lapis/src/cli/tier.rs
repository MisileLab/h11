use lapis::error::Result;
use lapis::index::MetadataStore;
use lapis::repo::Repository;
use lapis::store::tier_cold;
use std::path::PathBuf;
use std::time::Duration;

use super::{TierArgs, TierColdArgs, TierCommand};

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

fn parse_duration(value: &str) -> Result<Duration> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(lapis::error::LapisError::Metadata(
            "tier cold: --older-than must not be empty".to_string(),
        ));
    }

    let split_at = trimmed
        .find(|ch: char| !ch.is_ascii_digit())
        .unwrap_or(trimmed.len());
    let (number_part, unit_part) = trimmed.split_at(split_at);

    if number_part.is_empty() {
        return Err(lapis::error::LapisError::Metadata(format!(
            "tier cold: invalid duration '{}'",
            value
        )));
    }

    let amount: u64 = number_part.parse().map_err(|_| {
        lapis::error::LapisError::Metadata(format!("tier cold: invalid duration '{}'", value))
    })?;

    let multiplier = match unit_part {
        "" | "s" => 1,
        "m" => 60,
        "h" => 60 * 60,
        "d" => 60 * 60 * 24,
        _ => {
            return Err(lapis::error::LapisError::Metadata(format!(
                "tier cold: unsupported duration unit in '{}'",
                value
            )))
        }
    };

    let seconds = amount.checked_mul(multiplier).ok_or_else(|| {
        lapis::error::LapisError::Metadata(format!("tier cold: duration '{}' is too large", value))
    })?;

    Ok(Duration::from_secs(seconds))
}

async fn execute_cold(args: TierColdArgs) -> Result<()> {
    let repo_root = find_repo_root()?;
    let repo = Repository::open(&repo_root)?;
    let cold_root = repo.lapis_dir().join("store").join("cold");
    let mut metadata_store = MetadataStore::new(repo.meta_dir().join("index.db")).await?;
    let older_than = parse_duration(&args.older_than)?;

    let result = tier_cold(
        &mut metadata_store,
        repo.store_hot_dir(),
        &cold_root,
        older_than,
        0,
    )
    .await?;

    println!(
        "tier cold complete: eligible={}, migrated={}",
        result.eligible_blocks, result.migrated_blocks
    );

    Ok(())
}

pub async fn execute(args: TierArgs) -> Result<()> {
    match args.command {
        TierCommand::Cold(args) => execute_cold(args).await,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cli::test_utils::{acquire_cwd_lock, safe_original_cwd};
    use clap::Parser;
    use std::fs;
    use tempfile::TempDir;

    fn count_cold_files(root: &std::path::Path) -> usize {
        if !root.exists() {
            return 0;
        }

        fs::read_dir(root)
            .expect("read cold root")
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.path())
            .map(|path| {
                if path.is_dir() {
                    fs::read_dir(path)
                        .expect("read cold prefix")
                        .filter_map(|entry| entry.ok())
                        .filter(|entry| entry.path().is_file())
                        .count()
                } else {
                    0
                }
            })
            .sum()
    }

    #[test]
    fn test_parse_duration_supports_seconds_minutes_hours_days() {
        assert_eq!(parse_duration("15").unwrap(), Duration::from_secs(15));
        assert_eq!(parse_duration("15s").unwrap(), Duration::from_secs(15));
        assert_eq!(parse_duration("2m").unwrap(), Duration::from_secs(120));
        assert_eq!(parse_duration("3h").unwrap(), Duration::from_secs(10_800));
        assert_eq!(parse_duration("1d").unwrap(), Duration::from_secs(86_400));
    }

    #[test]
    fn test_cli_parse_tier_cold() {
        let cli = crate::cli::Cli::try_parse_from(["lapis", "tier", "cold", "--older-than", "15m"])
            .expect("parse tier cold args");

        match cli.command {
            crate::cli::Commands::Tier(args) => match args.command {
                crate::cli::TierCommand::Cold(args) => {
                    assert_eq!(args.older_than, "15m");
                }
            },
            _ => panic!("expected tier command"),
        }
    }

    #[test]
    fn test_execute_cold_moves_block_into_cold_store() {
        let _lock = acquire_cwd_lock();
        let temp_dir = TempDir::new().expect("create temp dir");
        let repo_root = temp_dir.path().join("repo");
        lapis::repo::Repository::init(&repo_root).expect("init repo");

        fs::write(repo_root.join("blob.bin"), vec![42u8; 4096]).expect("write blob");

        let original_cwd = safe_original_cwd();
        std::env::set_current_dir(&repo_root).expect("set cwd");

        crate::cli::add::execute(crate::cli::AddArgs {
            path: "blob.bin".to_string(),
        })
        .expect("add blob");

        let repo = Repository::open(&repo_root).expect("open repo");
        let rt = tokio::runtime::Runtime::new().expect("create runtime");

        rt.block_on(async {
            let mut store = MetadataStore::new(repo.meta_dir().join("index.db"))
                .await
                .expect("open metadata");
            sqlx::query("UPDATE blocks SET created_at = 0, access_count = 0")
                .execute(store.write_conn())
                .await
                .expect("age blocks");
        });

        rt.block_on(execute(TierArgs {
            command: TierCommand::Cold(TierColdArgs {
                older_than: "1s".to_string(),
            }),
        }))
        .expect("run tier cold");

        let _ = std::env::set_current_dir(&original_cwd);

        assert!(
            count_cold_files(&repo.lapis_dir().join("store").join("cold")) >= 1,
            "expected at least one cold file after tier cold"
        );
    }
}
