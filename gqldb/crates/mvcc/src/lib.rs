use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub id: Uuid,
    pub snapshot_version: u64,
    pub version: u64,
}

#[derive(Debug, Clone)]
pub struct TransactionManager {
    state: Arc<Mutex<TransactionState>>,
    counter: Arc<AtomicU64>,
}

#[derive(Debug)]
struct TransactionState {
    latest_committed: u64,
}

impl TransactionManager {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(TransactionState {
                latest_committed: 0,
            })),
            counter: Arc::new(AtomicU64::new(1)),
        }
    }

    pub fn begin(&self) -> Transaction {
        let snapshot = self.state.lock().latest_committed;
        let version = self.counter.fetch_add(1, Ordering::SeqCst);
        Transaction {
            id: Uuid::new_v4(),
            snapshot_version: snapshot,
            version,
        }
    }

    pub fn commit(&self, _storage: &dyn CommitSink, txn: Transaction) -> anyhow::Result<()> {
        let mut state = self.state.lock();
        if txn.version <= state.latest_committed {
            return Err(anyhow::anyhow!("transaction already committed"));
        }
        state.latest_committed = txn.version;
        Ok(())
    }

    pub fn latest_committed(&self) -> u64 {
        self.state.lock().latest_committed
    }
}

pub trait CommitSink: Send + Sync {}

impl<T> CommitSink for T where T: Send + Sync {}
