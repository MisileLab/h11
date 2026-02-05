use gqldb_executor::Executor;
use gqldb_schema::{Model, Schema};
use gqldb_storage::{Storage, StorageMode};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeConfig {
    pub id: String,
    pub address: String,
    pub shard: usize,
    pub replica: bool,
}

#[derive(Debug, Clone)]
pub struct ClusterRouter {
    schema: Schema,
    shards: Arc<Mutex<HashMap<usize, ShardGroup>>>,
}

#[derive(Debug, Clone)]
struct ShardGroup {
    primary: ClusterNode,
    replicas: Vec<ClusterNode>,
    rr_counter: usize,
}

#[derive(Debug, Clone)]
struct ClusterNode {
    id: String,
    executor: Executor,
}

impl ClusterRouter {
    pub fn new(schema: Schema, nodes: Vec<NodeConfig>) -> Self {
        let mut shards: HashMap<usize, ShardGroup> = HashMap::new();
        for node in nodes {
            let storage = Storage::new(StorageMode::Memory).expect("storage init");
            let executor = Executor::new(schema.clone(), storage);
            let group = shards.entry(node.shard).or_insert_with(|| ShardGroup {
                primary: ClusterNode {
                    id: node.id.clone(),
                    executor: Executor::new(
                        schema.clone(),
                        Storage::new(StorageMode::Memory).unwrap(),
                    ),
                },
                replicas: Vec::new(),
                rr_counter: 0,
            });
            let cluster_node = ClusterNode {
                id: node.id.clone(),
                executor,
            };
            if node.replica {
                group.replicas.push(cluster_node);
            } else {
                group.primary = cluster_node;
            }
        }

        Self {
            schema,
            shards: Arc::new(Mutex::new(shards)),
        }
    }

    pub fn route_write(&self, model: &Model, shard_key: &str) -> Option<Executor> {
        let shard = shard_for(model, shard_key);
        let shards = self.shards.lock().ok()?;
        shards
            .get(&shard)
            .map(|group| group.primary.executor.clone())
    }

    pub fn route_read(&self, model: &Model, shard_key: &str) -> Option<Executor> {
        let shard = shard_for(model, shard_key);
        let mut shards = self.shards.lock().ok()?;
        let group = shards.get_mut(&shard)?;
        if group.replicas.is_empty() {
            return Some(group.primary.executor.clone());
        }
        let index = group.rr_counter % group.replicas.len();
        group.rr_counter = group.rr_counter.wrapping_add(1);
        Some(group.replicas[index].executor.clone())
    }

    pub fn shard_count(&self) -> usize {
        self.shards.lock().map(|shards| shards.len()).unwrap_or(0)
    }
}

fn shard_for(model: &Model, shard_key: &str) -> usize {
    if model.shard_key.is_empty() {
        return 0;
    }
    let hash = fxhash::hash64(shard_key.as_bytes());
    (hash as usize) % 16
}

mod fxhash {
    pub fn hash64(data: &[u8]) -> u64 {
        let mut hash: u64 = 0xcbf29ce484222325;
        for byte in data {
            hash ^= *byte as u64;
            hash = hash.wrapping_mul(0x100000001b3);
        }
        hash
    }
}
