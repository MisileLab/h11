mod cli;

use clap::Parser;
use cli::{Cli, Commands};
use lapis::Result;

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Init(args) => {
            cli::init::execute(args)?;
        }
        Commands::Add(args) => {
            cli::add::execute(args)?;
        }
        Commands::Commit(args) => {
            cli::commit::execute(args)?;
        }
        #[cfg(feature = "signing")]
        Commands::Verify(args) => {
            cli::verify::execute(args)?;
        }
        Commands::Status(args) => {
            cli::status::execute(args)?;
        }
        Commands::Log(args) => {
            cli::log::execute(args)?;
        }
        Commands::Checkout(args) => {
            cli::checkout::execute(args)?;
        }
        Commands::Branch(args) => {
            cli::branch::execute(args)?;
        }
        Commands::Tag(args) => {
            cli::tag::execute(args)?;
        }
        Commands::Push(args) => {
            let rt = tokio::runtime::Runtime::new().map_err(|e| {
                lapis::LapisError::Metadata(format!("Failed to create runtime: {}", e))
            })?;
            rt.block_on(cli::push::execute(args))?;
        }
        Commands::Pull(args) => {
            let rt = tokio::runtime::Runtime::new().map_err(|e| {
                lapis::LapisError::Metadata(format!("Failed to create runtime: {}", e))
            })?;
            rt.block_on(cli::pull::execute(args))?;
        }
        Commands::Clone(args) => {
            let rt = tokio::runtime::Runtime::new().map_err(|e| {
                lapis::LapisError::Metadata(format!("Failed to create runtime: {}", e))
            })?;
            rt.block_on(cli::clone::execute(args))?;
        }
        Commands::Server(args) => {
            let rt = tokio::runtime::Runtime::new().map_err(|e| {
                lapis::LapisError::Metadata(format!("Failed to create runtime: {}", e))
            })?;
            rt.block_on(cli::server::execute(args))?;
        }
        Commands::Gc(args) => {
            let rt = tokio::runtime::Runtime::new().map_err(|e| {
                lapis::LapisError::Metadata(format!("Failed to create runtime: {}", e))
            })?;
            rt.block_on(cli::gc::execute(args))?;
        }
        Commands::Scrub(args) => {
            let rt = tokio::runtime::Runtime::new().map_err(|e| {
                lapis::LapisError::Metadata(format!("Failed to create runtime: {}", e))
            })?;
            rt.block_on(cli::scrub::execute(args))?;
        }
        Commands::Mount(args) => {
            cli::mount::execute(args)?;
        }
        Commands::Tier(args) => {
            let rt = tokio::runtime::Runtime::new().map_err(|e| {
                lapis::LapisError::Metadata(format!("Failed to create runtime: {}", e))
            })?;
            rt.block_on(cli::tier::execute(args))?;
        }
    }

    Ok(())
}
