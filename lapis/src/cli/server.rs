use clap::Parser;
use lapis::error::Result;
use lapis::server;

#[derive(Parser, Debug)]
pub struct ServerArgs {
    /// Port to listen on (default: 3000)
    #[arg(short, long, default_value = "3000")]
    pub port: u16,

    /// Path to store directory (default: .lapis/store/hot)
    #[arg(short, long)]
    pub store_path: Option<String>,
}

pub async fn execute(args: ServerArgs) -> Result<()> {
    let store_path = args
        .store_path
        .unwrap_or_else(|| ".lapis/store/hot".to_string());

    server::start(args.port, &store_path).await?;
    Ok(())
}
