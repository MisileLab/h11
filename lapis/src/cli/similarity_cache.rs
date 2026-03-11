use lapis::index::SimilarityIndex;
use std::sync::Mutex;
use std::sync::OnceLock;

static SIMILARITY_CACHE: OnceLock<Mutex<SimilarityIndex>> = OnceLock::new();

pub fn get_or_init_similarity_index() -> &'static Mutex<SimilarityIndex> {
    SIMILARITY_CACHE.get_or_init(|| Mutex::new(SimilarityIndex::new(None)))
}

pub fn update_similarity_for_chunk(chunk_hash: [u8; 32], chunk_content: &[u8]) {
    if let Ok(mut index) = get_or_init_similarity_index().lock() {
        index.update_similarity(chunk_hash, chunk_content);
    }
}
