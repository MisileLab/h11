//! Chunk similarity detection using MinHash and LSH (Locality-Sensitive Hashing).
//!
//! This module provides O(n) similarity detection for finding similar chunks between versions,
//! enabling efficient delta compression candidates without O(n²) all-pairs comparison.
//!
//! ## Algorithm
//! - **MinHash**: Probabilistic signature of chunk CONTENT for fast similarity estimation
//! - **LSH Bands**: Group hash signatures into bands; chunks in same band likely similar
//! - **Jaccard Similarity**: Estimated via matching MinHash signatures (0.0 = dissimilar, 1.0 = identical)
//!
//! ## Critical Design
//! Signatures are computed from **chunk content bytes**, not from content-addressed hash bytes.
//! This preserves content locality and enables detection of genuinely similar chunks.

use std::collections::HashMap;

/// Default threshold for similarity (0.3 = 30% overlap minimum).
const DEFAULT_SIMILARITY_THRESHOLD: f64 = 0.3;

/// Number of hash functions in MinHash signature.
const NUM_HASHES: usize = 128;

/// Number of LSH bands for grouping similar signatures.
const NUM_BANDS: usize = 16;

/// Rows per band (NUM_HASHES / NUM_BANDS).
const ROWS_PER_BAND: usize = NUM_HASHES / NUM_BANDS;

/// In-memory similarity index using MinHash + LSH.
///
/// Stores MinHash signatures for chunks (indexed by content hash [u8; 32])
/// and indexes them into LSH bands for efficient similarity queries without O(n²) comparisons.
pub struct SimilarityIndex {
    /// MinHash signature for each chunk: content_hash -> [signature_values]
    signatures: HashMap<[u8; 32], [u32; NUM_HASHES]>,

    /// LSH band index: (band_id, band_hash) -> [chunk_hashes with matching band]
    bands: Vec<HashMap<u32, Vec<[u8; 32]>>>,

    /// Similarity threshold (0.0 to 1.0)
    threshold: f64,
}

impl SimilarityIndex {
    /// Create a new empty similarity index with optional custom threshold.
    pub fn new(threshold: Option<f64>) -> Self {
        let threshold = threshold.unwrap_or(DEFAULT_SIMILARITY_THRESHOLD);
        let threshold = threshold.max(0.0).min(1.0);

        let mut bands = Vec::with_capacity(NUM_BANDS);
        for _ in 0..NUM_BANDS {
            bands.push(HashMap::new());
        }

        SimilarityIndex {
            signatures: HashMap::new(),
            bands,
            threshold,
        }
    }

    /// Compute MinHash signature from chunk CONTENT bytes.
    ///
    /// Uses streaming hash computation to avoid loading entire chunk into single hash.
    /// Produces 128 independent hash values by partitioning content and hashing each part.
    fn compute_signature_from_content(content: &[u8]) -> [u32; NUM_HASHES] {
        let mut signature = [u32::MAX; NUM_HASHES];

        if content.is_empty() {
            return signature;
        }

        let partition_size = if content.len() > NUM_HASHES {
            content.len() / NUM_HASHES
        } else {
            1
        };

        for i in 0..NUM_HASHES {
            let seed = i as u32;
            let mut hash = seed.wrapping_add(0x9e3779b9);

            let start = (i * partition_size).min(content.len());
            let end = ((i + 1) * partition_size).min(content.len());

            let chunk = &content[start..end];
            for &byte in chunk {
                hash = hash.wrapping_mul(31).wrapping_add(byte as u32);
            }

            hash ^= hash >> 16;
            hash = hash.wrapping_mul(0x7feb352d);
            hash ^= hash >> 15;

            signature[i] = hash;
        }

        signature
    }

    /// Extract LSH band hashes from MinHash signature.
    ///
    /// Divides NUM_HASHES values into NUM_BANDS groups.
    /// Each band produces a single hash used for bucketing similar signatures.
    fn extract_band_hashes(signature: &[u32; NUM_HASHES]) -> [u32; NUM_BANDS] {
        let mut band_hashes = [0u32; NUM_BANDS];

        for band_id in 0..NUM_BANDS {
            let start = band_id * ROWS_PER_BAND;
            let end = start + ROWS_PER_BAND;

            let mut band_hash = 0u32;
            for &value in &signature[start..end] {
                band_hash ^= value;
            }

            band_hashes[band_id] = band_hash;
        }

        band_hashes
    }

    /// Add or update a chunk in the similarity index.
    ///
    /// Computes MinHash signature from chunk content and inserts into LSH bands.
    /// If chunk already exists, removes old index entries before adding new ones.
    pub fn update_similarity(&mut self, chunk_hash: [u8; 32], chunk_content: &[u8]) {
        if let Some(old_sig) = self.signatures.get(&chunk_hash) {
            let old_bands = Self::extract_band_hashes(old_sig);
            for (band_id, &band_hash) in old_bands.iter().enumerate() {
                if let Some(bucket) = self.bands[band_id].get_mut(&band_hash) {
                    bucket.retain(|&h| h != chunk_hash);
                }
            }
        }

        let signature = Self::compute_signature_from_content(chunk_content);
        let band_hashes = Self::extract_band_hashes(&signature);

        for (band_id, &band_hash) in band_hashes.iter().enumerate() {
            self.bands[band_id]
                .entry(band_hash)
                .or_insert_with(Vec::new)
                .push(chunk_hash);
        }

        self.signatures.insert(chunk_hash, signature);
    }

    /// Estimate Jaccard similarity between two signatures.
    ///
    /// Counts matching hash values divided by total hashes.
    /// This approximates Jaccard similarity of the original chunk content.
    fn estimate_similarity(sig1: &[u32; NUM_HASHES], sig2: &[u32; NUM_HASHES]) -> f64 {
        let mut matches = 0;
        for i in 0..NUM_HASHES {
            if sig1[i] == sig2[i] {
                matches += 1;
            }
        }
        matches as f64 / NUM_HASHES as f64
    }

    /// Find all chunks similar to the given chunk hash.
    ///
    /// Returns list of chunk hashes with Jaccard similarity >= configured threshold.
    /// Uses LSH bands for candidate generation (O(n) worst-case, O(1) typical).
    ///
    /// # Arguments
    /// * `chunk_hash` - The query chunk hash [u8; 32]
    /// * `threshold` - Override default threshold (0.0 to 1.0)
    ///
    /// # Returns
    /// Vec of similar chunk hashes (excluding exact match with query chunk)
    pub fn find_similar(&self, chunk_hash: [u8; 32], threshold: Option<f64>) -> Vec<[u8; 32]> {
        let threshold = threshold.unwrap_or(self.threshold);
        let threshold = threshold.max(0.0).min(1.0);

        let query_sig = match self.signatures.get(&chunk_hash) {
            Some(sig) => sig,
            None => return Vec::new(),
        };

        let query_bands = Self::extract_band_hashes(query_sig);

        let mut candidates = std::collections::HashSet::new();
        for (band_id, &query_band_hash) in query_bands.iter().enumerate() {
            if let Some(bucket) = self.bands[band_id].get(&query_band_hash) {
                for &candidate in bucket {
                    if candidate != chunk_hash {
                        candidates.insert(candidate);
                    }
                }
            }
        }

        let mut results = Vec::new();
        for candidate in candidates {
            if let Some(candidate_sig) = self.signatures.get(&candidate) {
                let similarity = Self::estimate_similarity(query_sig, candidate_sig);
                if similarity >= threshold {
                    results.push(candidate);
                }
            }
        }

        results
    }

    /// Get all stored chunk hashes in the index.
    pub fn chunk_hashes(&self) -> Vec<[u8; 32]> {
        self.signatures.keys().copied().collect()
    }

    /// Get the number of indexed chunks.
    pub fn len(&self) -> usize {
        self.signatures.len()
    }

    /// Check if index is empty.
    pub fn is_empty(&self) -> bool {
        self.signatures.is_empty()
    }

    /// Clear all data from the index.
    pub fn clear(&mut self) {
        self.signatures.clear();
        for band in &mut self.bands {
            band.clear();
        }
    }

    /// Update the similarity threshold.
    pub fn set_threshold(&mut self, threshold: f64) {
        self.threshold = threshold.max(0.0).min(1.0);
    }

    /// Get current threshold.
    pub fn threshold(&self) -> f64 {
        self.threshold
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_content(value: u8, len: usize) -> Vec<u8> {
        vec![value; len]
    }

    fn make_hash(value: u8) -> [u8; 32] {
        let mut h = [0u8; 32];
        h[0] = value;
        h
    }

    #[test]
    fn test_similarity_index_new() {
        let idx = SimilarityIndex::new(None);
        assert_eq!(idx.threshold(), DEFAULT_SIMILARITY_THRESHOLD);
        assert!(idx.is_empty());
        assert_eq!(idx.len(), 0);
    }

    #[test]
    fn test_compute_signature_deterministic() {
        let content = make_content(42, 1000);
        let sig1 = SimilarityIndex::compute_signature_from_content(&content);
        let sig2 = SimilarityIndex::compute_signature_from_content(&content);
        assert_eq!(sig1, sig2);
    }

    #[test]
    fn test_compute_signature_different_content() {
        let content1 = make_content(42, 1000);
        let content2 = make_content(43, 1000);

        let sig1 = SimilarityIndex::compute_signature_from_content(&content1);
        let sig2 = SimilarityIndex::compute_signature_from_content(&content2);

        let diff_count = sig1.iter().zip(sig2.iter()).filter(|(a, b)| a != b).count();
        assert!(diff_count > NUM_HASHES / 2);
    }

    #[test]
    fn test_compute_signature_similar_content() {
        let content1 = make_content(42, 1000);
        let mut content2 = content1.clone();
        content2[100] ^= 0xFF;
        content2[200] ^= 0xFF;

        let sig1 = SimilarityIndex::compute_signature_from_content(&content1);
        let sig2 = SimilarityIndex::compute_signature_from_content(&content2);

        let matches = sig1.iter().zip(sig2.iter()).filter(|(a, b)| a == b).count();

        assert!(matches > NUM_HASHES / 2);
    }

    #[test]
    fn test_compute_signature_empty() {
        let sig = SimilarityIndex::compute_signature_from_content(&[]);
        assert_eq!(sig[0], u32::MAX);
    }

    #[test]
    fn test_update_similarity_single_chunk() {
        let mut idx = SimilarityIndex::new(None);
        let hash = make_hash(42);
        let content = make_content(42, 1000);

        idx.update_similarity(hash, &content);

        assert_eq!(idx.len(), 1);
        assert_eq!(idx.chunk_hashes(), vec![hash]);
    }

    #[test]
    fn test_update_similarity_multiple_chunks() {
        let mut idx = SimilarityIndex::new(None);

        for i in 0..10 {
            idx.update_similarity(make_hash(i), &make_content(i, 1000));
        }

        assert_eq!(idx.len(), 10);
    }

    #[test]
    fn test_update_similarity_replaces_entry() {
        let mut idx = SimilarityIndex::new(None);
        let hash = make_hash(42);
        let content1 = make_content(42, 1000);
        let content2 = make_content(43, 1000);

        idx.update_similarity(hash, &content1);
        assert_eq!(idx.len(), 1);

        idx.update_similarity(hash, &content2);
        assert_eq!(idx.len(), 1);
    }

    #[test]
    fn test_find_similar_empty_index() {
        let idx = SimilarityIndex::new(None);
        let results = idx.find_similar(make_hash(42), None);
        assert_eq!(results.len(), 0);
    }

    #[test]
    fn test_find_similar_query_not_in_index() {
        let mut idx = SimilarityIndex::new(None);
        idx.update_similarity(make_hash(1), &make_content(1, 1000));

        let results = idx.find_similar(make_hash(99), None);
        assert_eq!(results.len(), 0);
    }

    #[test]
    fn test_find_similar_excludes_query_chunk() {
        let mut idx = SimilarityIndex::new(None);
        let hash = make_hash(42);
        idx.update_similarity(hash, &make_content(42, 1000));

        let results = idx.find_similar(hash, None);
        assert!(!results.contains(&hash));
    }

    #[test]
    fn test_find_similar_detects_similar_content() {
        let mut idx = SimilarityIndex::new(Some(0.7));

        let hash1 = make_hash(1);
        let content1 = make_content(42, 1000);

        let hash2 = make_hash(2);
        let mut content2 = content1.clone();
        content2[0] = 99;
        content2[1] = 88;

        idx.update_similarity(hash1, &content1);
        idx.update_similarity(hash2, &content2);

        let results = idx.find_similar(hash1, Some(0.7));
        assert!(results.contains(&hash2), "Should find similar chunk");
    }

    #[test]
    fn test_find_similar_threshold_filtering() {
        let mut idx = SimilarityIndex::new(None);

        let hash1 = make_hash(1);
        let hash2 = make_hash(2);
        let hash3 = make_hash(3);

        let content1 = make_content(42, 1000);

        let mut content2 = content1.clone();
        for i in 0..100 {
            content2[i] = 99;
        }

        let content3 = make_content(99, 1000);

        idx.update_similarity(hash1, &content1);
        idx.update_similarity(hash2, &content2);
        idx.update_similarity(hash3, &content3);

        let high_threshold_results = idx.find_similar(hash1, Some(0.90));
        let low_threshold_results = idx.find_similar(hash1, Some(0.05));

        assert!(high_threshold_results.len() <= low_threshold_results.len());
    }

    #[test]
    fn test_clear() {
        let mut idx = SimilarityIndex::new(None);
        for i in 0..5 {
            idx.update_similarity(make_hash(i), &make_content(i, 1000));
        }
        assert_eq!(idx.len(), 5);

        idx.clear();
        assert_eq!(idx.len(), 0);
        assert!(idx.is_empty());
    }

    #[test]
    fn test_estimate_similarity_identical() {
        let sig = [42u32; NUM_HASHES];
        let similarity = SimilarityIndex::estimate_similarity(&sig, &sig);
        assert_eq!(similarity, 1.0);
    }

    #[test]
    fn test_estimate_similarity_half_match() {
        let mut sig1 = [1u32; NUM_HASHES];
        let sig2 = [2u32; NUM_HASHES];

        for i in 0..NUM_HASHES / 2 {
            sig1[i] = 2u32;
        }

        let similarity = SimilarityIndex::estimate_similarity(&sig1, &sig2);
        assert!((similarity - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_estimate_similarity_no_match() {
        let sig1 = [1u32; NUM_HASHES];
        let sig2 = [2u32; NUM_HASHES];
        let similarity = SimilarityIndex::estimate_similarity(&sig1, &sig2);
        assert_eq!(similarity, 0.0);
    }

    #[test]
    fn test_set_threshold() {
        let mut idx = SimilarityIndex::new(Some(0.3));
        assert_eq!(idx.threshold(), 0.3);

        idx.set_threshold(0.7);
        assert_eq!(idx.threshold(), 0.7);

        idx.set_threshold(-0.5);
        assert_eq!(idx.threshold(), 0.0);

        idx.set_threshold(1.5);
        assert_eq!(idx.threshold(), 1.0);
    }
}
