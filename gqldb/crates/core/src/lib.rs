use gqldb_cluster::{ClusterRouter, NodeConfig};
use gqldb_executor::Executor;
use gqldb_mvcc::Transaction;
use gqldb_schema::Schema;
use gqldb_storage::{default_storage_path, Storage, StorageMode};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    pub mode: RuntimeMode,
    pub data_dir: Option<PathBuf>,
    pub nodes: Vec<NodeConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RuntimeMode {
    Memory,
    File,
    Server,
    Cluster,
}

#[derive(Debug)]
pub struct Database {
    pub schema: Schema,
    pub executor: Executor,
    pub cluster: Option<ClusterRouter>,
}

impl Database {
    pub fn new(schema: Schema, config: DatabaseConfig) -> anyhow::Result<Self> {
        let storage = match config.mode {
            RuntimeMode::Memory | RuntimeMode::Server => Storage::new(StorageMode::Memory)?,
            RuntimeMode::File => {
                let base = config
                    .data_dir
                    .clone()
                    .unwrap_or_else(|| PathBuf::from("./data"));
                let path = default_storage_path(&base);
                Storage::new(StorageMode::File(path))?
            }
            RuntimeMode::Cluster => Storage::new(StorageMode::Memory)?,
        };
        let executor = Executor::new(schema.clone(), storage);
        let cluster = if matches!(config.mode, RuntimeMode::Cluster) {
            Some(ClusterRouter::new(schema.clone(), config.nodes))
        } else {
            None
        };
        Ok(Self {
            schema,
            executor,
            cluster,
        })
    }

    pub fn begin(&self) -> Transaction {
        self.executor.begin()
    }

    pub fn commit(&mut self, txn: Transaction) -> anyhow::Result<()> {
        self.executor.commit(txn)
    }

    pub fn storage_path(&self) -> Option<PathBuf> {
        self.executor.storage_path()
    }
}

pub fn default_data_dir(base: &Path) -> PathBuf {
    base.join("gqldb")
}
