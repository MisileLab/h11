//! Manifest builder for version control snapshots
//!
//! A manifest represents a snapshot of a file at a point in time,
//! storing metadata about the file's chunks, size, and chunking parameters.
//! Manifests are deterministically serializable for content addressing.

use crate::chunking::Chunk;
use crate::{LapisError, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const MULTI_FILE_MANIFEST_PREFIX: &str = "lapis:multi:";

/// Chunking parameters used to create a manifest
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChunkingParams {
    /// Minimum chunk size in bytes
    pub min_size: u32,
    /// Average (target) chunk size in bytes
    pub avg_size: u32,
    /// Maximum chunk size in bytes
    pub max_size: u32,
}

/// A manifest representing a snapshot of a file's content state
///
/// Stores the file path, chunk hashes (not payloads), total size, and
/// chunking parameters. The manifest is deterministically serializable
/// to enable stable content addressing.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Manifest {
    /// Path to the original file
    pub file_path: PathBuf,
    /// Ordered list of chunk hashes (BLAKE3, 32 bytes each)
    pub chunk_hashes: Vec<[u8; 32]>,
    /// Total size of the file in bytes
    pub total_size: u64,
    /// Chunking parameters that produced this manifest
    pub chunking_params: ChunkingParams,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ManifestFileEntry {
    pub file_path: PathBuf,
    pub chunk_start: usize,
    pub chunk_count: usize,
    pub total_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct CompositeManifestIndex {
    entries: Vec<ManifestFileEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CompositeManifest {
    pub entries: Vec<ManifestFileEntry>,
    pub chunk_hashes: Vec<[u8; 32]>,
    pub total_size: u64,
    pub chunking_params: ChunkingParams,
}

impl Manifest {
    /// Build a manifest from file path and chunk list
    ///
    /// # Arguments
    ///
    /// * `file_path` - Path to the original file
    /// * `chunks` - List of chunks produced by the chunking algorithm
    ///
    /// # Returns
    ///
    /// A new `Manifest` with extracted chunk hashes and computed total size.
    pub fn build(file_path: impl AsRef<Path>, chunks: Vec<Chunk>) -> Self {
        let file_path = file_path.as_ref().to_path_buf();

        // Extract chunk hashes in order
        let chunk_hashes: Vec<[u8; 32]> = chunks.iter().map(|c| c.hash).collect();

        // Compute total size from chunks
        let total_size: u64 = chunks.iter().map(|c| c.length as u64).sum();

        // Use default chunking parameters
        let chunking_params = ChunkingParams {
            min_size: crate::chunking::config::MIN_CHUNK_SIZE,
            avg_size: crate::chunking::config::AVG_CHUNK_SIZE,
            max_size: crate::chunking::config::MAX_CHUNK_SIZE,
        };

        Manifest {
            file_path,
            chunk_hashes,
            total_size,
            chunking_params,
        }
    }

    /// Serialize manifest to canonical JSON bytes
    ///
    /// Uses `serde_json` with default serialization for deterministic output.
    /// The serialized form is stable and suitable for hashing.
    ///
    /// # Returns
    ///
    /// A `Vec<u8>` containing the JSON representation of the manifest.
    pub fn serialize(&self) -> Result<Vec<u8>> {
        serde_json::to_vec(self).map_err(|e| LapisError::Metadata(e.to_string()))
    }

    /// Deserialize manifest from JSON bytes
    ///
    /// Parses a JSON manifest and validates its structure.
    ///
    /// # Arguments
    ///
    /// * `data` - Byte slice containing JSON manifest data
    ///
    /// # Returns
    ///
    /// A parsed `Manifest` or error if deserialization fails.
    pub fn deserialize(data: &[u8]) -> Result<Self> {
        serde_json::from_slice(data).map_err(|e| LapisError::Metadata(e.to_string()))
    }

    /// Compute the BLAKE3 hash of the serialized manifest
    ///
    /// This hash is stable and deterministic, making it suitable as a
    /// unique identifier for the manifest (and the snapshot it represents).
    ///
    /// # Returns
    ///
    /// A 32-byte BLAKE3 hash of the serialized manifest.
    pub fn hash(&self) -> Result<[u8; 32]> {
        let serialized = self.serialize()?;
        Ok(crate::crypto::hash_bytes(&serialized))
    }
}

pub fn serialize_manifest_from_storage(
    file_path: &str,
    chunk_list_json: &str,
    total_size: u64,
) -> Result<Vec<u8>> {
    if file_path.starts_with(MULTI_FILE_MANIFEST_PREFIX) {
        return CompositeManifest::from_storage(file_path, chunk_list_json, total_size)?
            .serialize();
    }

    let chunk_hashes: Vec<[u8; 32]> = serde_json::from_str(chunk_list_json)
        .map_err(|e| LapisError::Metadata(format!("Invalid chunk_list JSON: {}", e)))?;

    Manifest {
        file_path: PathBuf::from(file_path),
        chunk_hashes,
        total_size,
        chunking_params: default_chunking_params(),
    }
    .serialize()
}

impl CompositeManifest {
    pub fn build(manifests: &[Manifest]) -> Self {
        let mut entries = Vec::with_capacity(manifests.len());
        let mut chunk_hashes = Vec::new();
        let mut total_size = 0u64;

        for manifest in manifests {
            let chunk_start = chunk_hashes.len();
            let chunk_count = manifest.chunk_hashes.len();

            chunk_hashes.extend(manifest.chunk_hashes.iter().copied());
            total_size += manifest.total_size;

            entries.push(ManifestFileEntry {
                file_path: manifest.file_path.clone(),
                chunk_start,
                chunk_count,
                total_size: manifest.total_size,
            });
        }

        CompositeManifest {
            entries,
            chunk_hashes,
            total_size,
            chunking_params: default_chunking_params(),
        }
    }

    pub fn serialize(&self) -> Result<Vec<u8>> {
        serde_json::to_vec(self).map_err(|e| LapisError::Metadata(e.to_string()))
    }

    pub fn hash(&self) -> Result<[u8; 32]> {
        let serialized = self.serialize()?;
        Ok(crate::crypto::hash_bytes(&serialized))
    }

    pub fn encoded_file_path(&self) -> Result<String> {
        let index = CompositeManifestIndex {
            entries: self.entries.clone(),
        };
        let encoded =
            serde_json::to_string(&index).map_err(|e| LapisError::Metadata(e.to_string()))?;
        Ok(format!("{}{}", MULTI_FILE_MANIFEST_PREFIX, encoded))
    }

    pub fn from_storage(file_path: &str, chunk_list_json: &str, total_size: u64) -> Result<Self> {
        let chunk_hashes: Vec<[u8; 32]> = serde_json::from_str(chunk_list_json)
            .map_err(|e| LapisError::Metadata(format!("Invalid chunk_list JSON: {}", e)))?;

        let entries =
            if let Some(encoded_index) = file_path.strip_prefix(MULTI_FILE_MANIFEST_PREFIX) {
                let index: CompositeManifestIndex =
                    serde_json::from_str(encoded_index).map_err(|e| {
                        LapisError::Metadata(format!("Invalid composite manifest index: {}", e))
                    })?;
                index.entries
            } else {
                vec![ManifestFileEntry {
                    file_path: PathBuf::from(file_path),
                    chunk_start: 0,
                    chunk_count: chunk_hashes.len(),
                    total_size,
                }]
            };

        Ok(CompositeManifest {
            entries,
            chunk_hashes,
            total_size,
            chunking_params: default_chunking_params(),
        })
    }

    pub fn chunk_hashes_for_path(&self, path: impl AsRef<Path>) -> Result<Option<Vec<[u8; 32]>>> {
        let path = path.as_ref();

        let Some(entry) = self.entries.iter().find(|entry| entry.file_path == path) else {
            return Ok(None);
        };

        let chunk_end = entry.chunk_start + entry.chunk_count;
        if chunk_end > self.chunk_hashes.len() {
            return Err(LapisError::Metadata(format!(
                "Manifest entry for {} points outside chunk list",
                entry.file_path.display()
            )));
        }

        Ok(Some(
            self.chunk_hashes[entry.chunk_start..chunk_end].to_vec(),
        ))
    }
}

fn default_chunking_params() -> ChunkingParams {
    ChunkingParams {
        min_size: crate::chunking::config::MIN_CHUNK_SIZE,
        avg_size: crate::chunking::config::AVG_CHUNK_SIZE,
        max_size: crate::chunking::config::MAX_CHUNK_SIZE,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_manifest_build() {
        let chunks = vec![
            Chunk {
                offset: 0,
                length: 256,
                hash: [1u8; 32],
            },
            Chunk {
                offset: 256,
                length: 512,
                hash: [2u8; 32],
            },
        ];

        let manifest = Manifest::build("/tmp/test.bin", chunks);

        assert_eq!(manifest.file_path, PathBuf::from("/tmp/test.bin"));
        assert_eq!(manifest.chunk_hashes.len(), 2);
        assert_eq!(manifest.chunk_hashes[0], [1u8; 32]);
        assert_eq!(manifest.chunk_hashes[1], [2u8; 32]);
        assert_eq!(manifest.total_size, 768);
    }

    #[test]
    fn test_manifest_serialize_deserialize() {
        let chunks = vec![
            Chunk {
                offset: 0,
                length: 100,
                hash: [3u8; 32],
            },
            Chunk {
                offset: 100,
                length: 50,
                hash: [4u8; 32],
            },
        ];

        let original = Manifest::build("/tmp/file.dat", chunks);
        let serialized = original.serialize().expect("serialize should succeed");
        let deserialized = Manifest::deserialize(&serialized).expect("deserialize should succeed");

        assert_eq!(original, deserialized);
    }

    #[test]
    fn test_manifest_serialize_canonical() {
        // Two manifests with same data should serialize to identical bytes
        let chunks = vec![Chunk {
            offset: 0,
            length: 200,
            hash: [5u8; 32],
        }];

        let manifest1 = Manifest::build("/tmp/file.bin", chunks.clone());
        let manifest2 = Manifest::build("/tmp/file.bin", chunks);

        let bytes1 = manifest1.serialize().expect("serialize 1 should succeed");
        let bytes2 = manifest2.serialize().expect("serialize 2 should succeed");

        assert_eq!(bytes1, bytes2, "Same manifest should serialize identically");
    }

    #[test]
    fn test_manifest_hash_deterministic() {
        let chunks = vec![Chunk {
            offset: 0,
            length: 512,
            hash: [6u8; 32],
        }];

        let manifest1 = Manifest::build("/tmp/test.bin", chunks.clone());
        let manifest2 = Manifest::build("/tmp/test.bin", chunks);

        let hash1 = manifest1.hash().expect("hash 1 should succeed");
        let hash2 = manifest2.hash().expect("hash 2 should succeed");

        assert_eq!(hash1, hash2, "Same manifest should hash identically");
    }

    #[test]
    fn test_manifest_hash_different_for_different_manifests() {
        let chunks1 = vec![Chunk {
            offset: 0,
            length: 100,
            hash: [7u8; 32],
        }];

        let chunks2 = vec![Chunk {
            offset: 0,
            length: 200,
            hash: [8u8; 32],
        }];

        let manifest1 = Manifest::build("/tmp/file.bin", chunks1);
        let manifest2 = Manifest::build("/tmp/file.bin", chunks2);

        let hash1 = manifest1.hash().expect("hash 1 should succeed");
        let hash2 = manifest2.hash().expect("hash 2 should succeed");

        assert_ne!(
            hash1, hash2,
            "Different manifests should have different hashes"
        );
    }

    #[test]
    fn test_composite_manifest_preserves_file_boundaries() {
        let first = Manifest {
            file_path: PathBuf::from("alpha.txt"),
            chunk_hashes: vec![[1u8; 32], [2u8; 32]],
            total_size: 10,
            chunking_params: default_chunking_params(),
        };
        let second = Manifest {
            file_path: PathBuf::from("nested/beta.txt"),
            chunk_hashes: vec![[3u8; 32]],
            total_size: 4,
            chunking_params: default_chunking_params(),
        };

        let composite = CompositeManifest::build(&[first, second]);

        assert_eq!(composite.total_size, 14);
        assert_eq!(composite.entries.len(), 2);
        assert_eq!(composite.entries[0].chunk_start, 0);
        assert_eq!(composite.entries[0].chunk_count, 2);
        assert_eq!(composite.entries[1].chunk_start, 2);
        assert_eq!(composite.entries[1].chunk_count, 1);
        assert_eq!(
            composite
                .chunk_hashes_for_path("alpha.txt")
                .expect("lookup alpha")
                .expect("alpha exists"),
            vec![[1u8; 32], [2u8; 32]]
        );
        assert_eq!(
            composite
                .chunk_hashes_for_path("nested/beta.txt")
                .expect("lookup beta")
                .expect("beta exists"),
            vec![[3u8; 32]]
        );
    }

    #[test]
    fn test_composite_manifest_storage_round_trip() {
        let composite = CompositeManifest {
            entries: vec![ManifestFileEntry {
                file_path: PathBuf::from("alpha.txt"),
                chunk_start: 0,
                chunk_count: 1,
                total_size: 5,
            }],
            chunk_hashes: vec![[9u8; 32]],
            total_size: 5,
            chunking_params: default_chunking_params(),
        };

        let encoded_file_path = composite.encoded_file_path().expect("encode file path");
        let chunk_list_json =
            serde_json::to_string(&composite.chunk_hashes).expect("serialize chunks");

        let decoded = CompositeManifest::from_storage(&encoded_file_path, &chunk_list_json, 5)
            .expect("decode composite manifest");

        assert_eq!(decoded.entries, composite.entries);
        assert_eq!(decoded.chunk_hashes, composite.chunk_hashes);
        assert_eq!(decoded.total_size, composite.total_size);
    }

    #[test]
    fn test_manifest_empty_chunks() {
        let chunks = vec![];
        let manifest = Manifest::build("/tmp/empty.bin", chunks);

        assert_eq!(manifest.chunk_hashes.len(), 0);
        assert_eq!(manifest.total_size, 0);
    }

    #[test]
    fn test_manifest_serialization_round_trip_with_multiple_chunks() {
        let chunks = vec![
            Chunk {
                offset: 0,
                length: 256,
                hash: [10u8; 32],
            },
            Chunk {
                offset: 256,
                length: 512,
                hash: [11u8; 32],
            },
            Chunk {
                offset: 768,
                length: 128,
                hash: [12u8; 32],
            },
        ];

        let original = Manifest::build("/tmp/large.bin", chunks);
        let serialized = original.serialize().expect("serialize should succeed");
        let deserialized = Manifest::deserialize(&serialized).expect("deserialize should succeed");

        assert_eq!(original.file_path, deserialized.file_path);
        assert_eq!(original.chunk_hashes, deserialized.chunk_hashes);
        assert_eq!(original.total_size, deserialized.total_size);
        assert_eq!(original.chunking_params, deserialized.chunking_params);
    }

    #[test]
    fn test_chunking_params_serialization() {
        let params = ChunkingParams {
            min_size: 65536,
            avg_size: 262144,
            max_size: 1048576,
        };

        let json = serde_json::to_string(&params).expect("serialize params");
        let deserialized: ChunkingParams = serde_json::from_str(&json).expect("deserialize params");

        assert_eq!(params, deserialized);
    }

    #[test]
    fn test_manifest_chunk_order_preserved() {
        let chunks = vec![
            Chunk {
                offset: 0,
                length: 100,
                hash: [20u8; 32],
            },
            Chunk {
                offset: 100,
                length: 100,
                hash: [21u8; 32],
            },
            Chunk {
                offset: 200,
                length: 100,
                hash: [22u8; 32],
            },
        ];

        let manifest = Manifest::build("/tmp/ordered.bin", chunks);

        // Verify chunk order is preserved
        for (i, hash) in manifest.chunk_hashes.iter().enumerate() {
            assert_eq!(hash[0], (20 + i as u8));
        }
    }
}
