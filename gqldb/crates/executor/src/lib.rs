use gqldb_index::IndexManager;
use gqldb_mvcc::{Transaction, TransactionManager};
use gqldb_schema::{Model, Schema};
use gqldb_storage::{Record, Storage, StorageEvent};
use gqldb_vector::VectorIndex;
use serde_json::{json, Value};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct Executor {
    schema: Schema,
    storage: Storage,
    index: IndexManager,
    vector: VectorIndex,
    transactions: TransactionManager,
}

impl Executor {
    pub fn new(schema: Schema, storage: Storage) -> Self {
        let index = IndexManager::new(&schema);
        let vector = VectorIndex::new(&schema);
        let transactions = TransactionManager::new();
        Self {
            schema,
            storage,
            index,
            vector,
            transactions,
        }
    }

    pub fn begin(&self) -> Transaction {
        self.transactions.begin()
    }

    pub fn commit(&mut self, txn: Transaction) -> anyhow::Result<()> {
        self.transactions.commit(&self.storage, txn)?;
        Ok(())
    }

    pub fn get(&self, model: &Model, id: &str, txn: &Transaction) -> Option<Record> {
        self.storage.get(model, id, txn)
    }

    pub fn list(
        &self,
        model: &Model,
        where_clause: Option<&Value>,
        order_by: Option<&Value>,
        first: Option<usize>,
        after: Option<&str>,
        txn: &Transaction,
    ) -> Vec<Record> {
        let mut records = self.storage.scan(model, txn);
        if let Some(filter) = where_clause {
            records = records
                .into_iter()
                .filter(|record| matches_filter(record, filter))
                .collect();
        }
        if let Some(order) = order_by {
            if let Some(field) = order.get("field").and_then(|value| value.as_str()) {
                let descending = order
                    .get("direction")
                    .and_then(|value| value.as_str())
                    .map(|value| value.eq_ignore_ascii_case("desc"))
                    .unwrap_or(false);
                records.sort_by(|left, right| compare_field(left, right, field, descending));
            }
        }
        if let Some(after_cursor) = after {
            if let Some(position) = records.iter().position(|record| record.id == after_cursor) {
                records = records.into_iter().skip(position + 1).collect();
            }
        }
        if let Some(limit) = first {
            records.truncate(limit);
        }
        records
    }

    pub fn create(
        &mut self,
        model: &Model,
        payload: &Value,
        txn: &Transaction,
    ) -> anyhow::Result<Record> {
        let id = payload
            .get("id")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string())
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let mut record = Record::from_payload(id.clone(), payload);
        record.ensure_updated_at(model);
        self.index.validate_unique(model, &record)?;
        self.storage.put(model, record.clone(), txn)?;
        self.index.apply_insert(model, &record);
        self.vector.apply_insert(model, &record);
        Ok(record)
    }

    pub fn update(
        &mut self,
        model: &Model,
        id: &str,
        payload: &Value,
        txn: &Transaction,
    ) -> anyhow::Result<Record> {
        let mut record = self
            .storage
            .get(model, id, txn)
            .ok_or_else(|| anyhow::anyhow!("record not found"))?;
        record.merge(payload);
        record.ensure_updated_at(model);
        self.index.validate_unique(model, &record)?;
        self.storage.put(model, record.clone(), txn)?;
        self.index.apply_update(model, &record);
        self.vector.apply_update(model, &record);
        Ok(record)
    }

    pub fn delete(&mut self, model: &Model, id: &str, txn: &Transaction) -> anyhow::Result<Record> {
        let record = self
            .storage
            .delete(model, id, txn)?
            .ok_or_else(|| anyhow::anyhow!("record not found"))?;
        self.index.apply_delete(model, &record);
        self.vector.apply_delete(model, &record);
        Ok(record)
    }

    pub fn upsert(
        &mut self,
        model: &Model,
        id: &str,
        payload: &Value,
        txn: &Transaction,
    ) -> anyhow::Result<Record> {
        if self.storage.get(model, id, txn).is_some() {
            self.update(model, id, payload, txn)
        } else {
            let mut payload = payload.clone();
            if let Value::Object(object) = &mut payload {
                object.insert("id".to_string(), Value::String(id.to_string()));
            }
            self.create(model, &payload, txn)
        }
    }

    pub fn aggregate(
        &self,
        model: &Model,
        where_clause: Option<&Value>,
        group_by: Option<&Value>,
        txn: &Transaction,
    ) -> Value {
        let records = self.list(model, where_clause, None, None, None, txn);
        let mut aggregations = HashMap::new();
        aggregations.insert("count".to_string(), Value::Number(records.len().into()));

        if let Some(group_by) = group_by.and_then(|value| value.as_str()) {
            let mut buckets: HashMap<String, usize> = HashMap::new();
            for record in &records {
                if let Some(value) = record.data.get(group_by) {
                    buckets
                        .entry(value.to_string())
                        .and_modify(|count| *count += 1)
                        .or_insert(1);
                }
            }
            let grouped = buckets
                .into_iter()
                .map(|(key, count)| json!({"key": key, "count": count}))
                .collect::<Vec<_>>();
            aggregations.insert("groupBy".to_string(), Value::Array(grouped));
        }

        Value::Object(aggregations.into_iter().collect())
    }

    pub fn search(
        &self,
        model: &Model,
        near: &Value,
        where_clause: Option<&Value>,
        txn: &Transaction,
    ) -> Vec<Record> {
        let vector = near
            .get("vector")
            .and_then(|value| value.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_f64())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let top_k = near
            .get("topK")
            .and_then(|value| value.as_u64())
            .unwrap_or(10) as usize;

        let hits = self.vector.search(model, &vector, top_k);
        let mut records = Vec::new();
        for hit in hits {
            if let Some(record) = self.storage.get(model, &hit.id, txn) {
                records.push(record);
            }
        }
        if let Some(filter) = where_clause {
            records
                .into_iter()
                .filter(|record| matches_filter(record, filter))
                .collect()
        } else {
            records
        }
    }

    pub fn relation_fetch(
        &self,
        model: &Model,
        record: &Record,
        relation: &str,
        txn: &Transaction,
    ) -> Option<Record> {
        let field = model.fields.iter().find(|field| field.name == relation)?;
        let relation_def = field.relation()?;
        let foreign_key = relation_def.fields.first()?;
        let foreign_id = record.data.get(foreign_key)?.as_str()?;
        let target_type = field.field_type.name.clone();
        let target_model = self.schema.types.get(&target_type)?;
        self.storage.get(target_model, foreign_id, txn)
    }

    pub fn storage_path(&self) -> Option<std::path::PathBuf> {
        self.storage.wal_path()
    }

    pub fn storage_subscribe(&self) -> tokio::sync::broadcast::Receiver<StorageEvent> {
        self.storage.subscribe()
    }
}

fn matches_filter(record: &Record, filter: &Value) -> bool {
    match filter {
        Value::Object(object) => {
            for (key, value) in object {
                if key == "and" {
                    if let Some(items) = value.as_array() {
                        if !items.iter().all(|item| matches_filter(record, item)) {
                            return false;
                        }
                    }
                    continue;
                }
                if key == "or" {
                    if let Some(items) = value.as_array() {
                        if !items.iter().any(|item| matches_filter(record, item)) {
                            return false;
                        }
                    }
                    continue;
                }
                if let Some(record_value) = record.data.get(key) {
                    if record_value != value {
                        return false;
                    }
                } else {
                    return false;
                }
            }
            true
        }
        _ => true,
    }
}

fn compare_field(
    left: &Record,
    right: &Record,
    field: &str,
    descending: bool,
) -> std::cmp::Ordering {
    let left_value = left.data.get(field);
    let right_value = right.data.get(field);
    let ordering = match (left_value, right_value) {
        (Some(Value::String(left)), Some(Value::String(right))) => left.cmp(right),
        (Some(Value::Number(left)), Some(Value::Number(right))) => left
            .as_f64()
            .partial_cmp(&right.as_f64())
            .unwrap_or(std::cmp::Ordering::Equal),
        _ => std::cmp::Ordering::Equal,
    };
    if descending {
        ordering.reverse()
    } else {
        ordering
    }
}
