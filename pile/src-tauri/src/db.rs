use chrono::Utc;
use rusqlite::ffi::sqlite3_auto_extension;
use rusqlite::params;
use rusqlite::Connection;
use serde::Serialize;
use sqlite_vec::sqlite3_vec_init;
use std::error::Error;
use std::fs;
use std::path::Path;
use std::sync::{Mutex, Once};
use tauri::State;

pub type Result<T> = std::result::Result<T, Box<dyn Error>>;

pub struct AppDb(pub Mutex<Connection>);

#[derive(Debug, Clone, Serialize)]
pub struct Item {
    pub id: i64,
    pub content: String,
    pub content_type: String,
    pub source_app: Option<String>,
    pub created_at: i64,
}

static SQLITE_VEC_REGISTER: Once = Once::new();

fn register_sqlite_vec_extension() {
    SQLITE_VEC_REGISTER.call_once(|| unsafe {
        sqlite3_auto_extension(Some(std::mem::transmute(sqlite3_vec_init as *const ())));
    });
}

pub fn init_db(app_data_dir: &Path) -> Result<Connection> {
    fs::create_dir_all(app_data_dir)?;
    register_sqlite_vec_extension();

    let db_path = app_data_dir.join("pile.db");
    let conn = Connection::open(db_path)?;

    conn.execute_batch(
        "
        PRAGMA journal_mode=WAL;
        PRAGMA foreign_keys=ON;

        CREATE TABLE IF NOT EXISTS items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          content TEXT NOT NULL,
          content_type TEXT NOT NULL DEFAULT 'text',
          source_app TEXT,
          created_at INTEGER NOT NULL,
          embedding BLOB
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS item_embeddings USING vec0(
          embedding float[384]
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS item_fts USING fts5(
          content,
          content='items',
          content_rowid='id'
        );

        CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
          INSERT INTO item_fts(rowid, content) VALUES (new.id, new.content);
        END;

        CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
          INSERT INTO item_fts(item_fts, rowid, content) VALUES('delete', old.id, old.content);
        END;

        CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
          INSERT INTO item_fts(item_fts, rowid, content) VALUES('delete', old.id, old.content);
          INSERT INTO item_fts(rowid, content) VALUES (new.id, new.content);
        END;
        ",
    )?;

    Ok(conn)
}

pub fn save_item_with_connection(
    conn: &Connection,
    content: &str,
    content_type: &str,
) -> std::result::Result<Item, String> {
    let created_at = Utc::now().timestamp();
    conn.execute(
        "INSERT INTO items (content, content_type, source_app, created_at, embedding) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![content, content_type, Option::<String>::None, created_at, Option::<Vec<u8>>::None],
    )
    .map_err(|error| error.to_string())?;

    let id = conn.last_insert_rowid();
    conn.query_row(
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
    )
    .map_err(|error| error.to_string())
}

pub fn get_items_with_connection(
    conn: &Connection,
    limit: Option<i64>,
    offset: Option<i64>,
) -> std::result::Result<Vec<Item>, String> {
    let effective_limit = limit.unwrap_or(50).max(1);
    let effective_offset = offset.unwrap_or(0).max(0);

    let mut statement = conn
        .prepare(
            "SELECT id, content, content_type, source_app, created_at
             FROM items
             ORDER BY created_at DESC, id DESC
             LIMIT ?1 OFFSET ?2",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map(params![effective_limit, effective_offset], |row| {
            Ok(Item {
                id: row.get::<_, i64>(0)?,
                content: row.get::<_, String>(1)?,
                content_type: row.get::<_, String>(2)?,
                source_app: row.get::<_, Option<String>>(3)?,
                created_at: row.get::<_, i64>(4)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<std::result::Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

pub fn delete_item_with_connection(conn: &Connection, id: i64) -> std::result::Result<(), String> {
    conn.execute("DELETE FROM item_embeddings WHERE rowid = ?1", params![id])
        .map_err(|error| error.to_string())?;
    conn.execute("DELETE FROM items WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_item(
    state: State<'_, AppDb>,
    content: String,
    content_type: String,
) -> std::result::Result<Item, String> {
    let connection = state.0.lock().map_err(|error| error.to_string())?;
    save_item_with_connection(&connection, &content, &content_type)
}

#[tauri::command]
pub fn get_items(
    state: State<'_, AppDb>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> std::result::Result<Vec<Item>, String> {
    let connection = state.0.lock().map_err(|error| error.to_string())?;
    get_items_with_connection(&connection, limit, offset)
}

#[tauri::command]
pub fn delete_item(state: State<'_, AppDb>, id: i64) -> std::result::Result<(), String> {
    let connection = state.0.lock().map_err(|error| error.to_string())?;
    delete_item_with_connection(&connection, id)
}

#[cfg(test)]
mod tests {
    use rusqlite::params;
    use std::path::PathBuf;
    use uuid::Uuid;

    fn test_db_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("pile-t7-{name}-{}", Uuid::new_v4()))
    }

    #[test]
    fn test_create_tables() {
        let dir = test_db_dir("create-tables");
        let conn = super::init_db(&dir).expect("init_db should create schema");

        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='items'")
            .expect("prepare sqlite_master query");

        let table_name: String = stmt
            .query_row([], |row| row.get::<_, String>(0))
            .expect("items table should exist");

        assert_eq!(table_name, "items");
    }

    #[test]
    fn test_insert_and_get_item() {
        let dir = test_db_dir("insert-get");
        let conn = super::init_db(&dir).expect("init_db should succeed");

        conn.execute(
            "INSERT INTO items (content, content_type, source_app, created_at, embedding) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["hello world", "text", "Terminal", 123_i64, Option::<Vec<u8>>::None],
        )
        .expect("insert item");

        let mut stmt = conn
            .prepare("SELECT id, content, content_type, source_app, created_at FROM items")
            .expect("prepare select");

        let row = stmt
            .query_row([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, i64>(4)?,
                ))
            })
            .expect("row should exist");

        assert!(row.0 > 0);
        assert_eq!(row.1, "hello world");
        assert_eq!(row.2, "text");
        assert_eq!(row.3.as_deref(), Some("Terminal"));
        assert_eq!(row.4, 123_i64);
    }

    #[test]
    fn test_delete_item() {
        let dir = test_db_dir("delete-item");
        let conn = super::init_db(&dir).expect("init_db should succeed");

        conn.execute(
            "INSERT INTO items (content, content_type, source_app, created_at, embedding) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["to delete", "text", Option::<String>::None, 456_i64, Option::<Vec<u8>>::None],
        )
        .expect("insert item");

        let id = conn.last_insert_rowid();
        conn.execute("DELETE FROM items WHERE id = ?1", params![id])
            .expect("delete item");

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM items WHERE id = ?1",
                params![id],
                |row| row.get::<_, i64>(0),
            )
            .expect("count query");

        assert_eq!(count, 0);
    }

    #[test]
    fn test_wal_mode() {
        let dir = test_db_dir("wal-mode");
        let conn = super::init_db(&dir).expect("init_db should succeed");

        let mode: String = conn
            .query_row("PRAGMA journal_mode", [], |row| row.get::<_, String>(0))
            .expect("journal mode query");

        assert_eq!(mode.to_lowercase(), "wal");
    }

    #[test]
    fn test_fts_trigger_on_insert() {
        let dir = test_db_dir("fts-trigger-insert");
        let conn = super::init_db(&dir).expect("init_db should succeed");

        conn.execute(
            "INSERT INTO items (content, content_type, source_app, created_at, embedding) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["fts insert text", "text", Option::<String>::None, 789_i64, Option::<Vec<u8>>::None],
        )
        .expect("insert item");

        let id = conn.last_insert_rowid();
        let fts_rowid: i64 = conn
            .query_row(
                "SELECT rowid FROM item_fts WHERE item_fts MATCH ?1",
                params!["insert"],
                |row| row.get::<_, i64>(0),
            )
            .expect("fts row should exist after insert trigger");

        assert_eq!(fts_rowid, id);
    }

    #[test]
    fn test_vector_table_exists() {
        let dir = test_db_dir("vector-table-exists");
        let conn = super::init_db(&dir).expect("init_db should succeed");

        let mut stmt = conn
            .prepare(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'item_embeddings'",
            )
            .expect("prepare sqlite_master query");

        let table_name: String = stmt
            .query_row([], |row| row.get::<_, String>(0))
            .expect("item_embeddings table should exist");

        assert_eq!(table_name, "item_embeddings");
    }

    #[test]
    fn test_extension_loaded() {
        let dir = test_db_dir("extension-loaded");
        let conn = super::init_db(&dir).expect("init_db should succeed");

        let vec0_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_module_list WHERE name = 'vec0'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .expect("query vec0 module count");

        assert_eq!(vec0_count, 1);
    }

    #[test]
    fn test_save_item_creates_row() {
        let dir = test_db_dir("save-item-creates-row");
        let conn = super::init_db(&dir).expect("init_db should succeed");

        let saved = super::save_item_with_connection(&conn, "first", "text")
            .expect("save_item_with_connection should succeed");

        assert!(saved.id > 0);
        assert_eq!(saved.content, "first");
        assert_eq!(saved.content_type, "text");

        let row_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM items WHERE id = ?1",
                params![saved.id],
                |row| row.get::<_, i64>(0),
            )
            .expect("count query should succeed");

        assert_eq!(row_count, 1);
    }

    #[test]
    fn test_get_items_returns_expected_ordering_and_data() {
        let dir = test_db_dir("get-items-ordering");
        let conn = super::init_db(&dir).expect("init_db should succeed");

        conn.execute(
            "INSERT INTO items (content, content_type, source_app, created_at, embedding) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["older", "text", Option::<String>::None, 100_i64, Option::<Vec<u8>>::None],
        )
        .expect("insert older row");

        conn.execute(
            "INSERT INTO items (content, content_type, source_app, created_at, embedding) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["newer", "url", "Browser", 200_i64, Option::<Vec<u8>>::None],
        )
        .expect("insert newer row");

        let items = super::get_items_with_connection(&conn, Some(50), Some(0))
            .expect("get_items_with_connection should succeed");

        assert_eq!(items.len(), 2);
        assert_eq!(items[0].content, "newer");
        assert_eq!(items[0].content_type, "url");
        assert_eq!(items[0].source_app.as_deref(), Some("Browser"));
        assert_eq!(items[1].content, "older");
    }

    #[test]
    fn test_delete_item_removes_row_and_vector_entry() {
        let dir = test_db_dir("delete-item-removes");
        let conn = super::init_db(&dir).expect("init_db should succeed");

        conn.execute(
            "INSERT INTO items (content, content_type, source_app, created_at, embedding) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["delete me", "text", Option::<String>::None, 300_i64, Option::<Vec<u8>>::None],
        )
        .expect("insert item row");
        let id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO item_embeddings (rowid, embedding) VALUES (?1, zeroblob(1536))",
            params![id],
        )
        .expect("insert embedding row");

        super::delete_item_with_connection(&conn, id)
            .expect("delete_item_with_connection should succeed");

        let item_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM items WHERE id = ?1",
                params![id],
                |row| row.get::<_, i64>(0),
            )
            .expect("items count query should succeed");

        let embedding_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM item_embeddings WHERE rowid = ?1",
                params![id],
                |row| row.get::<_, i64>(0),
            )
            .expect("embeddings count query should succeed");

        assert_eq!(item_count, 0);
        assert_eq!(embedding_count, 0);
    }
}
