use crate::db::{get_items_with_connection, AppDb, Item};
use crate::embedding::{
    embedding_to_blob, generate_embedding, EmbeddingModelState, EmbeddingState, EmbeddingStatus,
};
use rusqlite::params;
use serde::Serialize;
use std::cmp::Ordering;
use std::collections::HashMap;
use tauri::{AppHandle, Manager, State};

const DEFAULT_SEARCH_LIMIT: i64 = 10;
const MAX_SEARCH_LIMIT: i64 = 50;
const VECTOR_CANDIDATE_LIMIT: i64 = 20;
const FTS_CANDIDATE_LIMIT: i64 = 20;
const VECTOR_WEIGHT: f64 = 0.7;
const FTS_WEIGHT: f64 = 0.3;

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub id: i64,
    pub content: String,
    pub content_type: String,
    pub source_app: Option<String>,
    pub created_at: i64,
    pub distance: Option<f64>,
    pub rank: Option<f64>,
}

#[derive(Clone)]
struct VectorHit {
    id: i64,
    distance: f64,
}

#[derive(Clone)]
struct FtsHit {
    id: i64,
}

#[derive(Clone)]
struct RankedEntry {
    item: Item,
    score: f64,
    distance: Option<f64>,
}

fn normalize_limit(limit: Option<i64>) -> i64 {
    limit
        .unwrap_or(DEFAULT_SEARCH_LIMIT)
        .clamp(1, MAX_SEARCH_LIMIT)
}

fn fetch_item(conn: &rusqlite::Connection, id: i64) -> std::result::Result<Option<Item>, String> {
    match conn.query_row(
        "SELECT id, content, content_type, source_app, created_at FROM items WHERE id = ?1",
        params![id],
        |row| {
            Ok(Item {
                id: row.get::<_, i64>(0)?,
                content: row.get::<_, String>(1)?,
                content_type: row.get::<_, String>(2)?,
                source_app: row.get::<_, Option<String>>(3)?,
                created_at: row.get::<_, i64>(4)?,
            })
        },
    ) {
        Ok(item) => Ok(Some(item)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn run_vector_search(
    conn: &rusqlite::Connection,
    query_embedding: &[f32],
    limit: i64,
) -> std::result::Result<Vec<VectorHit>, String> {
    let query_blob = embedding_to_blob(query_embedding);
    let mut statement = conn
        .prepare(
            "SELECT rowid, distance
             FROM item_embeddings
             WHERE embedding MATCH ?1
             ORDER BY distance
             LIMIT ?2",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map(params![&query_blob, limit], |row| {
            Ok(VectorHit {
                id: row.get::<_, i64>(0)?,
                distance: row.get::<_, f64>(1)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<std::result::Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn run_fts_search(
    conn: &rusqlite::Connection,
    query: &str,
    limit: i64,
) -> std::result::Result<Vec<FtsHit>, String> {
    let mut statement = conn
        .prepare(
            "SELECT rowid
             FROM item_fts
             WHERE item_fts MATCH ?1
             ORDER BY rank
             LIMIT ?2",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map(params![query, limit], |row| {
            Ok(FtsHit {
                id: row.get::<_, i64>(0)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<std::result::Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn ranked_contribution(index: usize, total: usize, weight: f64) -> f64 {
    if total == 0 {
        return 0.0;
    }
    weight * ((total - index) as f64 / total as f64)
}

fn merge_ranked_results(
    conn: &rusqlite::Connection,
    vector_hits: &[VectorHit],
    fts_hits: &[FtsHit],
    limit: i64,
) -> std::result::Result<Vec<SearchResult>, String> {
    let mut merged: HashMap<i64, RankedEntry> = HashMap::new();

    for (index, hit) in vector_hits.iter().enumerate() {
        let Some(item) = fetch_item(conn, hit.id)? else {
            continue;
        };

        let entry = merged.entry(hit.id).or_insert(RankedEntry {
            item,
            score: 0.0,
            distance: Some(hit.distance),
        });

        if entry.distance.is_none() {
            entry.distance = Some(hit.distance);
        }

        entry.score += ranked_contribution(index, vector_hits.len(), VECTOR_WEIGHT);
    }

    for (index, hit) in fts_hits.iter().enumerate() {
        let Some(item) = fetch_item(conn, hit.id)? else {
            continue;
        };

        let entry = merged.entry(hit.id).or_insert(RankedEntry {
            item,
            score: 0.0,
            distance: None,
        });

        entry.score += ranked_contribution(index, fts_hits.len(), FTS_WEIGHT);
    }

    let mut ranked: Vec<RankedEntry> = merged.into_values().collect();
    ranked.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(Ordering::Equal)
            .then_with(|| right.item.id.cmp(&left.item.id))
    });

    Ok(ranked
        .into_iter()
        .take(limit as usize)
        .map(|entry| SearchResult {
            id: entry.item.id,
            content: entry.item.content,
            content_type: entry.item.content_type,
            source_app: entry.item.source_app,
            created_at: entry.item.created_at,
            distance: entry.distance,
            rank: Some(entry.score),
        })
        .collect())
}

pub fn search_items_with_connection(
    conn: &rusqlite::Connection,
    query: &str,
    limit: Option<i64>,
    query_embedding: Option<&[f32]>,
) -> std::result::Result<Vec<SearchResult>, String> {
    let effective_limit = normalize_limit(limit);
    let trimmed_query = query.trim();

    if trimmed_query.is_empty() {
        let recent = get_items_with_connection(conn, Some(effective_limit), Some(0))?;
        return Ok(recent
            .into_iter()
            .map(|item| SearchResult {
                id: item.id,
                content: item.content,
                content_type: item.content_type,
                source_app: item.source_app,
                created_at: item.created_at,
                distance: None,
                rank: None,
            })
            .collect());
    }

    let fts_hits = run_fts_search(conn, trimmed_query, FTS_CANDIDATE_LIMIT)?;

    if let Some(embedding) = query_embedding {
        let vector_hits = run_vector_search(conn, embedding, VECTOR_CANDIDATE_LIMIT)?;
        return merge_ranked_results(conn, &vector_hits, &fts_hits, effective_limit);
    }

    merge_ranked_results(conn, &[], &fts_hits, effective_limit)
}

#[tauri::command]
pub fn search_items(
    app: AppHandle,
    db_state: State<'_, AppDb>,
    embedding_state: State<'_, EmbeddingState>,
    query: String,
    limit: Option<i64>,
) -> std::result::Result<Vec<SearchResult>, String> {
    let trimmed_query = query.trim().to_string();

    let query_embedding = {
        let status = *embedding_state
            .0
            .lock()
            .map_err(|error| error.to_string())?;

        if status != EmbeddingStatus::Ready || trimmed_query.is_empty() {
            None
        } else if let Some(model_state) = app.try_state::<EmbeddingModelState>() {
            let mut model = model_state.0.lock().map_err(|error| error.to_string())?;
            generate_embedding(&mut model, &trimmed_query).ok()
        } else {
            None
        }
    };

    let connection = db_state.0.lock().map_err(|error| error.to_string())?;
    search_items_with_connection(
        &connection,
        &trimmed_query,
        limit,
        query_embedding.as_deref(),
    )
}

#[cfg(test)]
mod tests {
    use super::search_items_with_connection;
    use crate::db::init_db;
    use crate::embedding::{embedding_to_blob, EMBEDDING_DIMENSIONS};
    use rusqlite::params;
    use std::path::PathBuf;
    use uuid::Uuid;

    fn test_db_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("pile-t18-{name}-{}", Uuid::new_v4()))
    }

    fn make_embedding(seed: f32) -> Vec<f32> {
        (0..EMBEDDING_DIMENSIONS)
            .map(|index| seed + (index as f32 * 0.0001))
            .collect()
    }

    fn insert_item(
        conn: &rusqlite::Connection,
        content: &str,
        content_type: &str,
        created_at: i64,
    ) -> i64 {
        conn.execute(
            "INSERT INTO items (content, content_type, source_app, created_at, embedding)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                content,
                content_type,
                Option::<String>::None,
                created_at,
                Option::<Vec<u8>>::None
            ],
        )
        .expect("insert item should succeed");
        conn.last_insert_rowid()
    }

    fn insert_embedding(conn: &rusqlite::Connection, id: i64, embedding: &[f32]) {
        let blob = embedding_to_blob(embedding);
        conn.execute(
            "INSERT OR REPLACE INTO item_embeddings (rowid, embedding) VALUES (?1, ?2)",
            params![id, blob],
        )
        .expect("insert embedding should succeed");
    }

    #[test]
    fn test_search_returns_relevant_items() {
        let dir = test_db_dir("relevant");
        let conn = init_db(&dir).expect("init_db should succeed");

        let rust_id = insert_item(&conn, "Rust memory safety guide", "text", 1000);
        let bread_id = insert_item(&conn, "Sourdough bread hydration notes", "text", 900);

        insert_embedding(&conn, rust_id, &make_embedding(0.05));
        insert_embedding(&conn, bread_id, &make_embedding(0.90));

        let query_embedding = make_embedding(0.05);
        let results = search_items_with_connection(
            &conn,
            "systems language",
            Some(10),
            Some(&query_embedding),
        )
        .expect("search should succeed");

        assert!(!results.is_empty());
        assert_eq!(results[0].id, rust_id);
    }

    #[test]
    fn test_search_fts_fallback() {
        let dir = test_db_dir("fts-fallback");
        let conn = init_db(&dir).expect("init_db should succeed");

        let rust_id = insert_item(&conn, "Rust trait object patterns", "text", 100);
        let _other_id = insert_item(&conn, "Baking recipe", "text", 200);

        let results = search_items_with_connection(&conn, "trait", Some(10), None)
            .expect("fts fallback search should succeed");

        assert!(!results.is_empty());
        assert_eq!(results[0].id, rust_id);
    }

    #[test]
    fn test_search_empty_query_returns_recent_items() {
        let dir = test_db_dir("empty-query");
        let conn = init_db(&dir).expect("init_db should succeed");

        let older_id = insert_item(&conn, "older item", "text", 100);
        let newer_id = insert_item(&conn, "newer item", "text", 200);

        let results = search_items_with_connection(&conn, "   ", Some(10), None)
            .expect("empty query search should succeed");

        assert_eq!(results.len(), 2);
        assert_eq!(results[0].id, newer_id);
        assert_eq!(results[1].id, older_id);
    }

    #[test]
    fn test_search_dedupes_results() {
        let dir = test_db_dir("dedupe");
        let conn = init_db(&dir).expect("init_db should succeed");

        let rust_id = insert_item(&conn, "Rust ownership primer", "text", 100);
        insert_embedding(&conn, rust_id, &make_embedding(0.20));

        let query_embedding = make_embedding(0.20);
        let results =
            search_items_with_connection(&conn, "ownership", Some(10), Some(&query_embedding))
                .expect("dedupe search should succeed");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, rust_id);
        assert!(results[0].distance.is_some());
    }
}
