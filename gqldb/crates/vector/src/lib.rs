use gqldb_schema::Model;
use gqldb_storage::Record;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorHit {
    pub id: String,
    pub score: f64,
}

#[derive(Debug, Clone, Default)]
pub struct VectorIndex {
    entries: HashMap<String, Vec<VectorEntry>>,
}

#[derive(Debug, Clone)]
struct VectorEntry {
    id: String,
    vector: Vec<f64>,
}

impl VectorIndex {
    pub fn new(schema: &gqldb_schema::Schema) -> Self {
        let mut index = Self::default();
        for model in schema.types.values() {
            if model.fields.iter().any(|field| field.vector().is_some()) {
                index.entries.insert(model.name.clone(), Vec::new());
            }
        }
        index
    }

    pub fn apply_insert(&mut self, model: &Model, record: &Record) {
        if let Some(vector) = extract_vector(model, record) {
            let entry = VectorEntry {
                id: record.id.clone(),
                vector,
            };
            self.entries
                .entry(model.name.clone())
                .or_default()
                .push(entry);
        }
    }

    pub fn apply_update(&mut self, model: &Model, record: &Record) {
        self.apply_delete(model, record);
        self.apply_insert(model, record);
    }

    pub fn apply_delete(&mut self, model: &Model, record: &Record) {
        if let Some(entries) = self.entries.get_mut(&model.name) {
            entries.retain(|entry| entry.id != record.id);
        }
    }

    pub fn search(&self, model: &Model, query: &[f64], top_k: usize) -> Vec<VectorHit> {
        let entries = match self.entries.get(&model.name) {
            Some(entries) => entries,
            None => return Vec::new(),
        };
        let mut hits = Vec::new();
        for entry in entries {
            let score = cosine_similarity(&entry.vector, query);
            hits.push(VectorHit {
                id: entry.id.clone(),
                score,
            });
        }
        hits.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        hits.truncate(top_k);
        hits
    }
}

fn extract_vector(model: &Model, record: &Record) -> Option<Vec<f64>> {
    let vector_field = model.fields.iter().find(|field| field.vector().is_some())?;
    let value = record.data.get(&vector_field.name)?;
    let array = value.as_array()?;
    Some(
        array
            .iter()
            .filter_map(|value| value.as_f64())
            .collect::<Vec<_>>(),
    )
}

fn cosine_similarity(left: &[f64], right: &[f64]) -> f64 {
    if left.is_empty() || right.is_empty() {
        return 0.0;
    }
    let dot = left
        .iter()
        .zip(right.iter())
        .map(|(l, r)| l * r)
        .sum::<f64>();
    let left_norm = left.iter().map(|value| value * value).sum::<f64>().sqrt();
    let right_norm = right.iter().map(|value| value * value).sum::<f64>().sqrt();
    if left_norm == 0.0 || right_norm == 0.0 {
        return 0.0;
    }
    dot / (left_norm * right_norm)
}
