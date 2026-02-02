use chrono::{DateTime, Utc};
use gqldb_mvcc::Transaction;
use gqldb_schema::{Field, Model};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Record {
    pub id: String,
    pub data: Map<String, Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Record {
    pub fn from_payload(id: String, payload: &Value) -> Self {
        let mut data = Map::new();
        if let Value::Object(object) = payload {
            data.extend(object.clone());
        }
        let now = Utc::now();
        data.insert("id".to_string(), Value::String(id.clone()));
        Self {
            id,
            data,
            created_at: now,
            updated_at: now,
        }
    }

    pub fn merge(&mut self, payload: &Value) {
        if let Value::Object(object) = payload {
            for (key, value) in object {
                self.data.insert(key.clone(), value.clone());
            }
        }
    }

    pub fn ensure_updated_at(&mut self, model: &Model) {
        if model
            .fields
            .iter()
            .any(|field| field.has_directive("updatedAt"))
        {
            self.updated_at = Utc::now();
            self.data.insert(
                "updatedAt".to_string(),
                Value::String(self.updated_at.to_rfc3339()),
            );
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionedRecord {
    pub version: u64,
    pub record: Record,
    pub deleted: bool,
}

#[derive(Debug, Clone)]
pub enum StorageMode {
    Memory,
    File(PathBuf),
}

#[derive(Debug, Clone)]
pub struct Storage {
    inner: Arc<Mutex<StorageInner>>,
    changes: broadcast::Sender<StorageEvent>,
}

#[derive(Debug, Clone)]
pub struct StorageEvent {
    pub model: String,
    pub id: String,
    pub action: StorageAction,
}

#[derive(Debug, Clone)]
pub enum StorageAction {
    Insert,
    Update,
    Delete,
}

#[derive(Debug)]
struct StorageInner {
    mode: StorageMode,
    data: HashMap<String, HashMap<String, Vec<VersionedRecord>>>,
    wal: Option<File>,
}

impl Storage {
    pub fn new(mode: StorageMode) -> anyhow::Result<Self> {
        let wal = match &mode {
            StorageMode::Memory => None,
            StorageMode::File(path) => {
                if let Some(parent) = path.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                Some(OpenOptions::new().create(true).append(true).open(path)?)
            }
        };
        let inner = StorageInner {
            mode,
            data: HashMap::new(),
            wal,
        };
        let (changes, _) = broadcast::channel(1024);
        Ok(Self {
            inner: Arc::new(Mutex::new(inner)),
            changes,
        })
    }

    pub fn subscribe(&self) -> broadcast::Receiver<StorageEvent> {
        self.changes.subscribe()
    }

    pub fn get(&self, model: &Model, id: &str, txn: &Transaction) -> Option<Record> {
        let inner = self.inner.lock().ok()?;
        let model_map = inner.data.get(&model.name)?;
        let versions = model_map.get(id)?;
        find_visible_version(versions, txn.snapshot_version)
    }

    pub fn scan(&self, model: &Model, txn: &Transaction) -> Vec<Record> {
        let inner = self.inner.lock().expect("storage lock poisoned");
        let mut records = Vec::new();
        if let Some(model_map) = inner.data.get(&model.name) {
            for versions in model_map.values() {
                if let Some(record) = find_visible_version(versions, txn.snapshot_version) {
                    records.push(record);
                }
            }
        }
        records
    }

    pub fn put(&self, model: &Model, record: Record, txn: &Transaction) -> anyhow::Result<()> {
        let mut inner = self.inner.lock().expect("storage lock poisoned");
        let model_map = inner.data.entry(model.name.clone()).or_default();
        let versions = model_map.entry(record.id.clone()).or_default();
        let versioned = VersionedRecord {
            version: txn.version,
            record: record.clone(),
            deleted: false,
        };
        versions.push(versioned);
        write_wal(&mut inner, model.name.clone(), &record.id, "put", &record)?;
        let _ = self.changes.send(StorageEvent {
            model: model.name.clone(),
            id: record.id.clone(),
            action: StorageAction::Update,
        });
        Ok(())
    }

    pub fn delete(
        &self,
        model: &Model,
        id: &str,
        txn: &Transaction,
    ) -> anyhow::Result<Option<Record>> {
        let mut inner = self.inner.lock().expect("storage lock poisoned");
        let model_map = inner.data.entry(model.name.clone()).or_default();
        let versions = model_map.entry(id.to_string()).or_default();
        let existing = find_visible_version(versions, txn.snapshot_version);
        let record = existing.clone();
        if let Some(record) = record {
            versions.push(VersionedRecord {
                version: txn.version,
                record: record.clone(),
                deleted: true,
            });
            write_wal(&mut inner, model.name.clone(), id, "delete", &record)?;
            let _ = self.changes.send(StorageEvent {
                model: model.name.clone(),
                id: id.to_string(),
                action: StorageAction::Delete,
            });
            Ok(Some(record))
        } else {
            Ok(None)
        }
    }

    pub fn wal_path(&self) -> Option<PathBuf> {
        let inner = self.inner.lock().ok()?;
        match &inner.mode {
            StorageMode::File(path) => Some(path.clone()),
            StorageMode::Memory => None,
        }
    }
}

fn find_visible_version(versions: &[VersionedRecord], snapshot: u64) -> Option<Record> {
    versions
        .iter()
        .filter(|version| version.version <= snapshot)
        .rev()
        .find(|version| !version.deleted)
        .map(|version| version.record.clone())
}

fn write_wal(
    inner: &mut StorageInner,
    model: String,
    id: &str,
    action: &str,
    record: &Record,
) -> anyhow::Result<()> {
    if let Some(wal) = &mut inner.wal {
        let payload = serde_json::json!({
            "model": model,
            "id": id,
            "action": action,
            "record": record,
        });
        writeln!(wal, "{}", payload.to_string())?;
        wal.flush()?;
    }
    Ok(())
}

pub fn default_storage_path(base: &Path) -> PathBuf {
    base.join("wal.log")
}

pub fn default_record_id() -> String {
    Uuid::new_v4().to_string()
}

pub fn default_field_value(field: &Field) -> Option<Value> {
    field
        .directives
        .iter()
        .find(|directive| directive.name == "default")
        .and_then(|directive| directive.arguments.get("value"))
        .and_then(|value| match value {
            gqldb_schema::DirectiveValue::String(value) => Some(Value::String(value.clone())),
            gqldb_schema::DirectiveValue::Int(value) => Some(Value::Number((*value).into())),
            gqldb_schema::DirectiveValue::Boolean(value) => Some(Value::Bool(*value)),
            gqldb_schema::DirectiveValue::Float(value) => {
                serde_json::Number::from_f64(*value).map(Value::Number)
            }
            _ => None,
        })
}
