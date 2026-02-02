use gqldb_schema::{IndexDefinition, Model};
use gqldb_storage::Record;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct IndexManager {
    indexes: HashMap<String, HashMap<String, HashMap<String, HashSet<String>>>>,
}

impl IndexManager {
    pub fn new(schema: &gqldb_schema::Schema) -> Self {
        let mut manager = Self::default();
        for model in schema.types.values() {
            for index in model.unique_indexes() {
                manager
                    .indexes
                    .entry(model.name.clone())
                    .or_default()
                    .entry(index.name.clone())
                    .or_default();
            }
        }
        manager
    }

    pub fn validate_unique(&self, model: &Model, record: &Record) -> anyhow::Result<()> {
        let indexes = model.unique_indexes();
        for index in indexes {
            if index.unique {
                let key = index_key(&index, record)?;
                if let Some(model_indexes) = self.indexes.get(&model.name) {
                    if let Some(index_map) = model_indexes.get(&index.name) {
                        if let Some(ids) = index_map.get(&key) {
                            if !ids.is_empty() && !ids.contains(&record.id) {
                                return Err(anyhow::anyhow!("unique constraint violation"));
                            }
                        }
                    }
                }
            }
        }
        Ok(())
    }

    pub fn apply_insert(&mut self, model: &Model, record: &Record) {
        self.apply_upsert(model, record);
    }

    pub fn apply_update(&mut self, model: &Model, record: &Record) {
        self.apply_upsert(model, record);
    }

    pub fn apply_delete(&mut self, model: &Model, record: &Record) {
        let indexes = model.unique_indexes();
        for index in indexes {
            if let Ok(key) = index_key(&index, record) {
                if let Some(model_indexes) = self.indexes.get_mut(&model.name) {
                    if let Some(index_map) = model_indexes.get_mut(&index.name) {
                        if let Some(ids) = index_map.get_mut(&key) {
                            ids.remove(&record.id);
                        }
                    }
                }
            }
        }
    }

    fn apply_upsert(&mut self, model: &Model, record: &Record) {
        let indexes = model.unique_indexes();
        for index in indexes {
            if let Ok(key) = index_key(&index, record) {
                let model_indexes = self.indexes.entry(model.name.clone()).or_default();
                let index_map = model_indexes.entry(index.name.clone()).or_default();
                let ids = index_map.entry(key).or_default();
                ids.insert(record.id.clone());
            }
        }
    }
}

fn index_key(index: &IndexDefinition, record: &Record) -> anyhow::Result<String> {
    let mut parts = Vec::new();
    for field in &index.fields {
        let value = record
            .data
            .get(field)
            .ok_or_else(|| anyhow::anyhow!("missing index field"))?;
        parts.push(value.to_string());
    }
    Ok(parts.join("|"))
}
