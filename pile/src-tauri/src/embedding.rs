use fastembed::{EmbeddingModel as FastembedEmbeddingModel, InitOptions, TextEmbedding};
use rusqlite::params;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::path::Path;
use std::sync::{Arc, Mutex};

pub const EMBEDDING_DIMENSIONS: usize = 384;
pub const FASTEMBED_CACHE_DIR_ENV: &str = "FASTEMBED_CACHE_DIR";
const MODEL_CACHE_SUBDIR: &str = "models--sentence-transformers--all-MiniLM-L6-v2";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum EmbeddingStatus {
    NotReady,
    Downloading,
    Ready,
}

pub struct EmbeddingState(pub Mutex<EmbeddingStatus>);

pub struct EmbeddingModelState(pub Arc<Mutex<TextEmbedding>>);

pub fn init_embedding_model(cache_dir: &Path) -> std::result::Result<TextEmbedding, Box<dyn Error>> {
    std::env::set_var(FASTEMBED_CACHE_DIR_ENV, cache_dir);

    let embedding_model = TextEmbedding::try_new(
        InitOptions::new(FastembedEmbeddingModel::AllMiniLML6V2)
            .with_show_download_progress(true),
    )?;

    Ok(embedding_model)
}

pub fn is_model_cached(cache_dir: &Path) -> bool {
    cache_dir.join(MODEL_CACHE_SUBDIR).exists()
}

pub fn generate_embedding(
    model: &mut TextEmbedding,
    text: &str,
) -> std::result::Result<Vec<f32>, String> {
    let embeddings = model
        .embed(vec![text.to_owned()], None)
        .map_err(|error| error.to_string())?;

    let embedding = embeddings
        .into_iter()
        .next()
        .ok_or_else(|| "fastembed returned no embedding".to_string())?;

    if embedding.len() != EMBEDDING_DIMENSIONS {
        return Err(format!(
            "unexpected embedding dimensions: expected {EMBEDDING_DIMENSIONS}, got {}",
            embedding.len()
        ));
    }

    Ok(embedding)
}

pub fn embedding_to_blob(embedding: &[f32]) -> Vec<u8> {
    embedding
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect()
}

pub fn blob_to_embedding(blob: &[u8]) -> std::result::Result<Vec<f32>, String> {
    if blob.len() % 4 != 0 {
        return Err("embedding blob length must be a multiple of 4 bytes".to_string());
    }

    blob.chunks_exact(4)
        .map(|bytes| {
            let chunk: [u8; 4] = bytes
                .try_into()
                .map_err(|_| "invalid embedding blob chunk".to_string())?;
            Ok(f32::from_le_bytes(chunk))
        })
        .collect()
}

pub fn store_embedding_with_connection(
    conn: &Connection,
    item_id: i64,
    embedding: &[f32],
) -> std::result::Result<(), String> {
    if embedding.len() != EMBEDDING_DIMENSIONS {
        return Err(format!(
            "unexpected embedding dimensions: expected {EMBEDDING_DIMENSIONS}, got {}",
            embedding.len()
        ));
    }

    let blob = embedding_to_blob(embedding);

    conn.execute(
        "UPDATE items SET embedding = ?1 WHERE id = ?2",
        params![&blob, item_id],
    )
    .map_err(|error| error.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO item_embeddings(rowid, embedding) VALUES (?1, ?2)",
        params![item_id, &blob],
    )
    .map_err(|error| error.to_string())?;

    Ok(())
}

pub fn spawn_embedding_pipeline(
    db: Arc<Mutex<Connection>>,
    model: Arc<Mutex<TextEmbedding>>,
    item_id: i64,
    content: String,
) {
    tokio::spawn(async move {
        let embedding_result = (|| {
            let mut model_guard = model.lock().map_err(|error| error.to_string())?;
            generate_embedding(&mut model_guard, &content)
        })();

        let embedding = match embedding_result {
            Ok(embedding) => embedding,
            Err(error) => {
                eprintln!("warning: embedding generation failed for item {item_id}: {error}");
                return;
            }
        };

        let store_result = (|| {
            let connection_guard = db.lock().map_err(|error| error.to_string())?;
            store_embedding_with_connection(&connection_guard, item_id, &embedding)
        })();

        if let Err(error) = store_result {
            eprintln!("warning: embedding persistence failed for item {item_id}: {error}");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{
        blob_to_embedding, embedding_to_blob, generate_embedding, init_embedding_model,
        EMBEDDING_DIMENSIONS,
    };

    #[test]
    fn test_embedding_to_blob_round_trip() {
        let embedding: Vec<f32> = (0..EMBEDDING_DIMENSIONS)
            .map(|index| (index as f32) / 10.0)
            .collect();

        let blob = embedding_to_blob(&embedding);
        let restored = blob_to_embedding(&blob).expect("blob_to_embedding should deserialize");

        assert_eq!(restored, embedding);
    }

    #[test]
    #[ignore = "requires fastembed model availability"]
    fn test_embedding_dimensions() {
        let cache_dir = std::env::temp_dir().join("pile-fastembed-test-cache");
        let mut model =
            init_embedding_model(&cache_dir).expect("init_embedding_model should create model");

        let embedding = generate_embedding(&mut model, "pile embedding dimension test")
            .expect("generate_embedding should succeed");

        assert_eq!(embedding.len(), EMBEDDING_DIMENSIONS);
    }
}
