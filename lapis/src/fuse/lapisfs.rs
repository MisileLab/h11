//! Read-only FUSE filesystem implementation for Lapis repositories
//!
//! Provides a virtual filesystem view of a Lapis repository's current commit,
//! with lazy fetching of file content from the CAS. Files appear at full size
//! immediately, but content is fetched on-demand when read.

use crate::error::{LapisError, Result};
use crate::index::MetadataStore;
use crate::store::CasStore;
use fuser::{
    FileAttr, FileType, Filesystem, ReplyAttr, ReplyData, ReplyDirectory, ReplyEntry, Request,
};
use libc;
use sqlx::Row;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::PathBuf;
use std::time::SystemTime;

/// Inode number for root directory
const ROOT_INODE: u64 = 1;
/// TTL for attribute cache
const ATTR_TIMEOUT_SECS: u64 = 3600;
/// TTL for entry cache
const ENTRY_TIMEOUT_SECS: u64 = 3600;

/// Represents a file in the virtual filesystem
#[derive(Debug, Clone)]
struct VirtualFile {
    /// Total size in bytes (from manifest)
    size: u64,
    /// Ordered list of chunk hashes for this file
    chunk_hashes: Vec<[u8; 32]>,
}

/// Lapis read-only FUSE filesystem
///
/// Provides a virtual view of the current commit's files with lazy content fetching.
pub struct LapisFs {
    cas_store: CasStore,
    metadata_store: MetadataStore,
    /// Current HEAD commit hash
    head_commit: [u8; 32],
    /// Map of paths to virtual files
    files: HashMap<PathBuf, VirtualFile>,
    directories: BTreeSet<PathBuf>,
    children: HashMap<PathBuf, BTreeMap<String, PathBuf>>,
    /// Next inode to assign
    next_inode: u64,
    /// Map of inodes to paths
    inode_map: HashMap<u64, PathBuf>,
    /// Reverse map: paths to inodes
    path_to_inode: HashMap<PathBuf, u64>,
    /// Remote URL for lazy block fetching (from .lapis/remote)
    remote_url: Option<String>,
    /// Handle to tokio runtime for async operations in sync context
    runtime_handle: Option<tokio::runtime::Handle>,
}

impl LapisFs {
    /// Create a new FUSE filesystem from a repository
    pub fn new(
        _repo: crate::repo::Repository,
        cas_store: CasStore,
        metadata_store: MetadataStore,
        head_commit: [u8; 32],
    ) -> Result<Self> {
        let mut fs = LapisFs {
            cas_store,
            metadata_store,
            head_commit,
            files: HashMap::new(),
            directories: BTreeSet::new(),
            children: HashMap::new(),
            next_inode: ROOT_INODE + 1,
            inode_map: HashMap::new(),
            path_to_inode: HashMap::new(),
            remote_url: None,
            runtime_handle: None,
        };

        // Reserve root inode
        fs.inode_map.insert(ROOT_INODE, Self::root_path());
        fs.path_to_inode.insert(Self::root_path(), ROOT_INODE);
        fs.children.insert(Self::root_path(), BTreeMap::new());

        Ok(fs)
    }

    fn root_path() -> PathBuf {
        PathBuf::from("/")
    }

    fn is_root_path(path: &std::path::Path) -> bool {
        path == Self::root_path().as_path()
    }

    fn parent_dir_path(path: &std::path::Path) -> PathBuf {
        match path.parent() {
            Some(parent) if !parent.as_os_str().is_empty() => parent.to_path_buf(),
            _ => Self::root_path(),
        }
    }

    fn child_path(parent: &std::path::Path, name: &str) -> PathBuf {
        if Self::is_root_path(parent) {
            PathBuf::from(name)
        } else {
            parent.join(name)
        }
    }

    /// Set runtime handle for async operations in sync context
    pub fn set_runtime_handle(&mut self, handle: tokio::runtime::Handle) {
        self.runtime_handle = Some(handle);
    }

    /// Set remote URL for lazy block fetching
    pub fn set_remote_url(&mut self, url: String) {
        self.remote_url = Some(url);
    }

    /// Load files by walking the commit chain from HEAD to root.
    /// Each commit references one manifest (one file); walking accumulates
    /// the full repository snapshot. HEAD version wins over ancestors.
    pub async fn load_from_commit(&mut self) -> Result<()> {
        let mut current_hash: Option<[u8; 32]> = Some(self.head_commit);

        while let Some(commit_hash) = current_hash {
            if commit_hash == [0u8; 32] {
                break;
            }

            let commit_row =
                sqlx::query("SELECT manifest_hash, parent_hash FROM commits WHERE hash = ?")
                    .bind(&commit_hash[..])
                    .fetch_optional(self.metadata_store.read_pool())
                    .await
                    .map_err(|e| LapisError::Database(format!("Failed to query commit: {}", e)))?;

            match commit_row {
                Some(row) => {
                    let manifest_hash_bytes: Vec<u8> = row.get("manifest_hash");
                    if manifest_hash_bytes.len() != 32 {
                        return Err(LapisError::Metadata(
                            "Invalid manifest hash length".to_string(),
                        ));
                    }

                    let mut manifest_hash = [0u8; 32];
                    manifest_hash.copy_from_slice(&manifest_hash_bytes);

                    let manifest_rows = sqlx::query(
                        "SELECT file_path, chunk_list, total_size FROM manifests WHERE hash = ?",
                    )
                    .bind(&manifest_hash[..])
                    .fetch_all(self.metadata_store.read_pool())
                    .await
                    .map_err(|e| {
                        LapisError::Database(format!("Failed to query manifests: {}", e))
                    })?;

                    for manifest_row in manifest_rows {
                        let file_path_str: String = manifest_row.get("file_path");
                        let chunk_list_json: String = manifest_row.get("chunk_list");
                        let total_size: i64 = manifest_row.get("total_size");

                        let file_path = PathBuf::from(&file_path_str);

                        if file_path_str == "[LAPIS INIT]" {
                            continue;
                        }

                        if !self.files.contains_key(&file_path) {
                            let chunk_hashes: Vec<[u8; 32]> =
                                serde_json::from_str(&chunk_list_json).map_err(|e| {
                                    LapisError::Metadata(format!(
                                        "Failed to parse chunk list: {}",
                                        e
                                    ))
                                })?;

                            let virtual_file = VirtualFile {
                                size: total_size as u64,
                                chunk_hashes,
                            };

                            self.files.insert(file_path, virtual_file);
                        }
                    }

                    let parent_bytes: Option<Vec<u8>> = row.get("parent_hash");
                    current_hash = parent_bytes.and_then(|bytes| {
                        if bytes.len() == 32 {
                            let mut h = [0u8; 32];
                            h.copy_from_slice(&bytes);
                            Some(h)
                        } else {
                            None
                        }
                    });
                }
                None => {
                    break;
                }
            }
        }

        let file_paths: Vec<PathBuf> = self.files.keys().cloned().collect();
        for path in file_paths {
            self.register_file_path(&path);
        }

        Ok(())
    }

    fn register_file_path(&mut self, file_path: &std::path::Path) {
        let parent_dir = Self::parent_dir_path(file_path);
        self.ensure_directory_path(&parent_dir);

        let file_path_buf = file_path.to_path_buf();
        self.get_or_create_inode(file_path_buf.clone());
        self.children.entry(parent_dir).or_default().insert(
            file_path
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default(),
            file_path_buf,
        );
    }

    fn ensure_directory_path(&mut self, dir_path: &std::path::Path) {
        if Self::is_root_path(dir_path) {
            self.children.entry(Self::root_path()).or_default();
            return;
        }

        let dir_path_buf = dir_path.to_path_buf();
        if self.directories.insert(dir_path_buf.clone()) {
            self.get_or_create_inode(dir_path_buf.clone());

            let parent_dir = Self::parent_dir_path(dir_path);
            self.ensure_directory_path(&parent_dir);
            self.children.entry(parent_dir).or_default().insert(
                dir_path
                    .file_name()
                    .map(|name| name.to_string_lossy().into_owned())
                    .unwrap_or_default(),
                dir_path_buf.clone(),
            );
        }

        self.children.entry(dir_path_buf).or_default();
    }

    fn file_type_for_path(&self, path: &std::path::Path) -> Option<FileType> {
        if Self::is_root_path(path) || self.directories.contains(path) {
            Some(FileType::Directory)
        } else if self.files.contains_key(path) {
            Some(FileType::RegularFile)
        } else {
            None
        }
    }

    fn lookup_path(&self, parent: u64, name: &std::ffi::OsStr) -> Option<PathBuf> {
        let parent_path = self.inode_map.get(&parent)?;
        let name = name.to_str()?;
        let candidate = Self::child_path(parent_path, name);
        self.file_type_for_path(&candidate).map(|_| candidate)
    }

    fn directory_entries(&self, ino: u64) -> Option<Vec<(u64, FileType, String)>> {
        let dir_path = self.inode_map.get(&ino)?;
        let dir_type = self.file_type_for_path(dir_path)?;
        if dir_type != FileType::Directory {
            return None;
        }

        let mut entries = Vec::new();
        let self_ino = *self.path_to_inode.get(dir_path)?;
        let parent_path = if Self::is_root_path(dir_path) {
            Self::root_path()
        } else {
            Self::parent_dir_path(dir_path)
        };
        let parent_ino = *self.path_to_inode.get(&parent_path)?;

        entries.push((self_ino, FileType::Directory, ".".to_string()));
        entries.push((parent_ino, FileType::Directory, "..".to_string()));

        if let Some(children) = self.children.get(dir_path) {
            for (name, child_path) in children {
                let inode = *self.path_to_inode.get(child_path)?;
                let file_type = self.file_type_for_path(child_path)?;
                entries.push((inode, file_type, name.clone()));
            }
        }

        Some(entries)
    }

    /// Get inode for a path, creating one if needed
    fn get_or_create_inode(&mut self, path: PathBuf) -> u64 {
        if let Some(inode) = self.path_to_inode.get(&path) {
            *inode
        } else {
            let inode = self.next_inode;
            self.next_inode += 1;
            self.inode_map.insert(inode, path.clone());
            self.path_to_inode.insert(path, inode);
            inode
        }
    }

    /// Get file attributes
    fn get_attr_for_inode(&self, ino: u64) -> Option<FileAttr> {
        let path = self.inode_map.get(&ino)?;
        let kind = self.file_type_for_path(path)?;

        if kind == FileType::Directory {
            return Some(FileAttr {
                ino,
                size: 4096,
                blocks: 8,
                atime: SystemTime::now(),
                mtime: SystemTime::now(),
                ctime: SystemTime::now(),
                crtime: SystemTime::now(),
                kind: FileType::Directory,
                perm: 0o555,
                nlink: 2,
                uid: unsafe { libc::getuid() },
                gid: unsafe { libc::getgid() },
                rdev: 0,
                flags: 0,
                blksize: 4096,
            });
        }

        if let Some(file) = self.files.get(path) {
            return Some(FileAttr {
                ino,
                size: file.size,
                blocks: file.size.div_ceil(512),
                atime: SystemTime::now(),
                mtime: SystemTime::now(),
                ctime: SystemTime::now(),
                crtime: SystemTime::now(),
                kind: FileType::RegularFile,
                perm: 0o444,
                nlink: 1,
                uid: unsafe { libc::getuid() },
                gid: unsafe { libc::getgid() },
                rdev: 0,
                flags: 0,
                blksize: 4096,
            });
        }

        None
    }

    /// Fetch a block from remote server and store it in local CAS
    async fn fetch_block_from_remote(
        remote_url: &str,
        hash: &[u8; 32],
        cas_store: &CasStore,
    ) -> Result<Vec<u8>> {
        let hex_hash = hex::encode(hash);
        let block_url = format!("{}/blocks/{}", remote_url, hex_hash);

        let client = reqwest::Client::new();
        let response = client.get(&block_url).send().await.map_err(|e| {
            LapisError::Network(format!("Failed to fetch block from remote: {}", e))
        })?;

        if !response.status().is_success() {
            return Err(LapisError::Network(format!(
                "Block fetch failed with status {}: {}",
                response.status(),
                hex_hash
            )));
        }

        let block_data = response.bytes().await.map_err(|e| {
            LapisError::Network(format!("Failed to read block data from remote: {}", e))
        })?;

        let block_vec = block_data.to_vec();

        // Store block in local CAS (put() will verify integrity via blake3 hash)
        let stored_hash = cas_store.put(&block_vec)?;

        // Verify the fetched hash matches what we requested
        if stored_hash != *hash {
            return Err(LapisError::Metadata(format!(
                "Remote block hash mismatch: requested {}, got {}",
                hex_hash,
                hex::encode(&stored_hash)
            )));
        }

        Ok(block_vec)
    }

    /// Fetch and reconstruct file content from chunks
    fn read_file_content(&self, file: &VirtualFile, offset: u64, size: u32) -> Result<Vec<u8>> {
        let mut buffer = Vec::new();
        let mut current_offset = 0u64;
        let end_offset = offset + size as u64;

        // Iterate through chunks, fetching only the ones we need
        for chunk_hash in &file.chunk_hashes {
            // Try to get chunk from local CAS
            let chunk_data = match self.cas_store.get(chunk_hash) {
                Ok(data) => data,
                Err(_e) => {
                    // Lazy fetch from remote if URL exists
                    if let Some(ref url) = self.remote_url {
                        if let Some(ref handle) = self.runtime_handle {
                            handle.block_on(async {
                                Self::fetch_block_from_remote(url, chunk_hash, &self.cas_store)
                                    .await
                            })?
                        } else {
                            return Err(LapisError::Cas(format!(
                                "Chunk not available in local CAS and no runtime: {}",
                                hex::encode(chunk_hash)
                            )));
                        }
                    } else {
                        return Err(LapisError::Cas(format!(
                            "Chunk not available in local CAS: {}",
                            hex::encode(chunk_hash)
                        )));
                    }
                }
            };

            let chunk_start = current_offset;
            let chunk_end = current_offset + chunk_data.len() as u64;

            // Check if this chunk overlaps with the requested range
            if chunk_end > offset && chunk_start < end_offset {
                let skip_start = if chunk_start < offset {
                    (offset - chunk_start) as usize
                } else {
                    0
                };

                let take_end = if chunk_end > end_offset {
                    (end_offset - chunk_start) as usize
                } else {
                    chunk_data.len()
                };

                if skip_start < chunk_data.len() && take_end <= chunk_data.len() {
                    buffer.extend_from_slice(&chunk_data[skip_start..take_end]);
                }
            }

            current_offset = chunk_end;

            // Stop if we've read enough
            if current_offset >= end_offset {
                break;
            }
        }

        Ok(buffer)
    }
}

impl Filesystem for LapisFs {
    fn lookup(&mut self, _req: &Request, parent: u64, name: &std::ffi::OsStr, reply: ReplyEntry) {
        if let Some(path) = self.lookup_path(parent, name) {
            let inode = self.get_or_create_inode(path);
            if let Some(attr) = self.get_attr_for_inode(inode) {
                reply.entry(
                    &std::time::Duration::from_secs(ENTRY_TIMEOUT_SECS),
                    &attr,
                    0,
                );
                return;
            }
        }

        reply.error(libc::ENOENT);
    }

    fn getattr(&mut self, _req: &Request, ino: u64, reply: ReplyAttr) {
        if let Some(attr) = self.get_attr_for_inode(ino) {
            reply.attr(&std::time::Duration::from_secs(ATTR_TIMEOUT_SECS), &attr);
        } else {
            reply.error(libc::ENOENT);
        }
    }

    fn read(
        &mut self,
        _req: &Request,
        ino: u64,
        _fh: u64,
        offset: i64,
        size: u32,
        _flags: i32,
        _lock_owner: Option<u64>,
        reply: ReplyData,
    ) {
        if matches!(
            self.get_attr_for_inode(ino).map(|attr| attr.kind),
            Some(FileType::Directory)
        ) {
            reply.error(libc::EISDIR);
            return;
        }

        if let Some(path) = self.inode_map.get(&ino).cloned() {
            if let Some(file) = self.files.get(&path) {
                match self.read_file_content(file, offset as u64, size) {
                    Ok(data) => reply.data(&data),
                    Err(_e) => reply.error(libc::EIO),
                }
            } else {
                reply.error(libc::ENOENT);
            }
        } else {
            reply.error(libc::ENOENT);
        }
    }

    fn readdir(
        &mut self,
        _req: &Request,
        ino: u64,
        _fh: u64,
        offset: i64,
        mut reply: ReplyDirectory,
    ) {
        let Some(entries) = self.directory_entries(ino) else {
            reply.error(libc::ENOTDIR);
            return;
        };

        for (idx, (inode, file_type, name)) in
            entries.iter().enumerate().skip(offset.max(0) as usize)
        {
            // reply.add() returns true when the buffer is full (entry NOT added)
            if reply.add(*inode, (idx + 1) as i64, *file_type, name) {
                break;
            }
        }

        reply.ok();
    }

    fn open(&mut self, _req: &Request, ino: u64, flags: i32, reply: fuser::ReplyOpen) {
        // Allow read-only access
        if (flags & libc::O_WRONLY) != 0 || (flags & libc::O_RDWR) != 0 {
            reply.error(libc::EACCES);
            return;
        }

        match self.get_attr_for_inode(ino).map(|attr| attr.kind) {
            Some(FileType::Directory) => reply.error(libc::EISDIR),
            Some(FileType::RegularFile) => {
                reply.opened(0, 0);
            }
            _ => reply.error(libc::ENOENT),
        }
    }

    fn release(
        &mut self,
        _req: &Request,
        _ino: u64,
        _fh: u64,
        _flags: i32,
        _lock_owner: Option<u64>,
        _flush: bool,
        reply: fuser::ReplyEmpty,
    ) {
        reply.ok();
    }

    fn access(&mut self, _req: &Request, ino: u64, mask: i32, reply: fuser::ReplyEmpty) {
        // Allow read access to files and directories
        if (mask & libc::W_OK) != 0 {
            reply.error(libc::EACCES);
        } else if self.inode_map.contains_key(&ino) || ino == ROOT_INODE {
            reply.ok();
        } else {
            reply.error(libc::ENOENT);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::Repository;
    use crate::store::CasStore;
    use std::path::Path;
    use tempfile::TempDir;

    fn insert_manifest_row(
        repo: &Repository,
        manifest_hash: [u8; 32],
        file_path: &str,
        chunk_hashes: &[[u8; 32]],
        total_size: i64,
    ) {
        let rt = tokio::runtime::Runtime::new().expect("create runtime");
        rt.block_on(async {
            let mut store = MetadataStore::new(repo.meta_dir().join("index.db"))
                .await
                .expect("open metadata store");

            sqlx::query(
                "INSERT INTO manifests (hash, file_path, chunk_list, total_size, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            )
            .bind(manifest_hash.to_vec())
            .bind(file_path)
            .bind(serde_json::to_string(chunk_hashes).expect("serialize chunk list"))
            .bind(total_size)
            .bind(1i64)
            .execute(store.write_conn())
            .await
            .expect("insert manifest");
        });
    }

    fn insert_commit_row(repo: &Repository, commit_hash: [u8; 32], manifest_hash: [u8; 32]) {
        insert_commit_row_with_parent(repo, commit_hash, manifest_hash, None);
    }

    fn insert_commit_row_with_parent(
        repo: &Repository,
        commit_hash: [u8; 32],
        manifest_hash: [u8; 32],
        parent_hash: Option<[u8; 32]>,
    ) {
        let rt = tokio::runtime::Runtime::new().expect("create runtime");
        rt.block_on(async {
            let mut store = MetadataStore::new(repo.meta_dir().join("index.db"))
                .await
                .expect("open metadata store");

            sqlx::query(
                "INSERT INTO commits (hash, parent_hash, manifest_hash, timestamp, message) VALUES (?1, ?2, ?3, ?4, ?5)",
            )
            .bind(commit_hash.to_vec())
            .bind(parent_hash.map(|h| h.to_vec()))
            .bind(manifest_hash.to_vec())
            .bind(1i64)
            .bind("test commit")
            .execute(store.write_conn())
            .await
            .expect("insert commit");
        });
    }

    fn build_fs(repo_path: &Path, commit_hash: [u8; 32]) -> LapisFs {
        let rt = tokio::runtime::Runtime::new().expect("create runtime");
        rt.block_on(async {
            let repo = Repository::open(repo_path).expect("reopen repo");
            let metadata_store = MetadataStore::new(repo.meta_dir().join("index.db"))
                .await
                .expect("open metadata store");
            let cas_store = CasStore::new(repo.store_hot_dir()).expect("reopen CAS store");
            let mut fs =
                LapisFs::new(repo, cas_store, metadata_store, commit_hash).expect("create fs");
            fs.load_from_commit().await.expect("load commit into fs");
            fs
        })
    }

    fn load_fs_with_single_file(file_path: &str, data: &[u8]) -> (TempDir, LapisFs, [u8; 32]) {
        let temp_dir = TempDir::new().expect("create temp dir");
        let repo = Repository::init(temp_dir.path()).expect("init repo");
        let cas_store = CasStore::new(repo.store_hot_dir()).expect("create CAS store");
        let chunk_hash = cas_store.put(data).expect("store chunk");
        let commit_hash = [7u8; 32];
        let manifest_hash = [8u8; 32];

        insert_manifest_row(
            &repo,
            manifest_hash,
            file_path,
            &[chunk_hash],
            data.len() as i64,
        );
        insert_commit_row(&repo, commit_hash, manifest_hash);

        let fs = build_fs(temp_dir.path(), commit_hash);
        (temp_dir, fs, chunk_hash)
    }

    #[test]
    fn test_load_from_commit_builds_nested_directory_tree() {
        let (_temp_dir, fs, _chunk_hash) =
            load_fs_with_single_file("docs/specs/readme.txt", b"hello nested world");

        let root_entries = fs.directory_entries(ROOT_INODE).expect("root entries");
        assert!(root_entries
            .iter()
            .any(|(_, kind, name)| *kind == FileType::Directory && name == "docs"));

        let docs_path = fs
            .lookup_path(ROOT_INODE, std::ffi::OsStr::new("docs"))
            .expect("docs lookup");
        let docs_ino = *fs.path_to_inode.get(&docs_path).expect("docs inode");
        let docs_entries = fs.directory_entries(docs_ino).expect("docs entries");
        assert!(docs_entries
            .iter()
            .any(|(_, kind, name)| *kind == FileType::Directory && name == "specs"));

        let specs_path = fs
            .lookup_path(docs_ino, std::ffi::OsStr::new("specs"))
            .expect("specs lookup");
        let specs_ino = *fs.path_to_inode.get(&specs_path).expect("specs inode");
        let specs_entries = fs.directory_entries(specs_ino).expect("specs entries");
        assert!(specs_entries
            .iter()
            .any(|(_, kind, name)| *kind == FileType::RegularFile && name == "readme.txt"));

        let file_path = fs
            .lookup_path(specs_ino, std::ffi::OsStr::new("readme.txt"))
            .expect("file lookup");
        let file_ino = *fs.path_to_inode.get(&file_path).expect("file inode");
        let attr = fs.get_attr_for_inode(file_ino).expect("file attr");
        assert_eq!(attr.kind, FileType::RegularFile);
        assert_eq!(attr.size, b"hello nested world".len() as u64);
    }

    #[test]
    fn test_lookup_requires_correct_parent_directory() {
        let (_temp_dir, fs, _chunk_hash) = load_fs_with_single_file("nested/file.txt", b"abc123");

        assert!(fs
            .lookup_path(ROOT_INODE, std::ffi::OsStr::new("file.txt"))
            .is_none());

        let nested_path = fs
            .lookup_path(ROOT_INODE, std::ffi::OsStr::new("nested"))
            .expect("nested dir lookup");
        let nested_ino = *fs.path_to_inode.get(&nested_path).expect("nested inode");
        let file_path = fs
            .lookup_path(nested_ino, std::ffi::OsStr::new("file.txt"))
            .expect("nested file lookup");
        assert_eq!(file_path, PathBuf::from("nested/file.txt"));
    }

    #[test]
    fn test_read_file_content_respects_offset_and_size() {
        let (_temp_dir, fs, chunk_hash) = load_fs_with_single_file("nested/file.txt", b"abcdef");
        let file = fs
            .files
            .get(&PathBuf::from("nested/file.txt"))
            .expect("file metadata");
        assert_eq!(file.chunk_hashes, vec![chunk_hash]);

        let data = fs.read_file_content(file, 2, 3).expect("read partial file");
        assert_eq!(data, b"cde");
    }

    #[test]
    fn test_multi_file_shared_parent_directories() {
        let temp_dir = TempDir::new().expect("create temp dir");
        let repo = Repository::init(temp_dir.path()).expect("init repo");
        let rt = tokio::runtime::Runtime::new().expect("create runtime");
        let fs = rt.block_on(async {
            let metadata_store = MetadataStore::new(repo.meta_dir().join("index.db"))
                .await
                .expect("open metadata store");
            let cas_store = CasStore::new(repo.store_hot_dir()).expect("create CAS store");
            let mut fs =
                LapisFs::new(repo, cas_store, metadata_store, [0u8; 32]).expect("create fs");

            fs.files.insert(
                PathBuf::from("src/main.rs"),
                VirtualFile {
                    size: 6,
                    chunk_hashes: vec![[1u8; 32]],
                },
            );
            fs.files.insert(
                PathBuf::from("src/lib.rs"),
                VirtualFile {
                    size: 14,
                    chunk_hashes: vec![[2u8; 32]],
                },
            );
            fs.files.insert(
                PathBuf::from("README.md"),
                VirtualFile {
                    size: 1,
                    chunk_hashes: vec![[3u8; 32]],
                },
            );

            fs.register_file_path(Path::new("src/main.rs"));
            fs.register_file_path(Path::new("src/lib.rs"));
            fs.register_file_path(Path::new("README.md"));
            fs
        });

        let root_entries = fs.directory_entries(ROOT_INODE).expect("root entries");
        let root_names: Vec<&str> = root_entries
            .iter()
            .filter(|(_, _, n)| n != "." && n != "..")
            .map(|(_, _, n)| n.as_str())
            .collect();
        assert!(
            root_names.contains(&"src"),
            "root should contain 'src' directory"
        );
        assert!(
            root_names.contains(&"README.md"),
            "root should contain 'README.md' file"
        );
        assert_eq!(
            root_names.len(),
            2,
            "root should have exactly 2 children (src dir + README.md file)"
        );

        let src_path = fs
            .lookup_path(ROOT_INODE, std::ffi::OsStr::new("src"))
            .expect("src lookup");
        let src_ino = *fs.path_to_inode.get(&src_path).expect("src inode");
        let src_entries = fs.directory_entries(src_ino).expect("src entries");
        let src_names: Vec<&str> = src_entries
            .iter()
            .filter(|(_, _, n)| n != "." && n != "..")
            .map(|(_, _, n)| n.as_str())
            .collect();
        assert!(src_names.contains(&"main.rs"));
        assert!(src_names.contains(&"lib.rs"));
        assert_eq!(src_names.len(), 2);
    }

    #[test]
    fn test_getattr_directory_vs_file_attributes() {
        let (_temp_dir, fs, _) = load_fs_with_single_file("dir/file.bin", b"binary data here");

        let root_attr = fs.get_attr_for_inode(ROOT_INODE).expect("root attr");
        assert_eq!(root_attr.kind, FileType::Directory);
        assert_eq!(root_attr.perm, 0o555);
        assert_eq!(root_attr.size, 4096);

        let dir_path = fs
            .lookup_path(ROOT_INODE, std::ffi::OsStr::new("dir"))
            .expect("dir lookup");
        let dir_ino = *fs.path_to_inode.get(&dir_path).expect("dir inode");
        let dir_attr = fs.get_attr_for_inode(dir_ino).expect("dir attr");
        assert_eq!(dir_attr.kind, FileType::Directory);
        assert_eq!(dir_attr.perm, 0o555);
        assert_eq!(dir_attr.nlink, 2);

        let file_path = fs
            .lookup_path(dir_ino, std::ffi::OsStr::new("file.bin"))
            .expect("file lookup");
        let file_ino = *fs.path_to_inode.get(&file_path).expect("file inode");
        let file_attr = fs.get_attr_for_inode(file_ino).expect("file attr");
        assert_eq!(file_attr.kind, FileType::RegularFile);
        assert_eq!(file_attr.perm, 0o444);
        assert_eq!(file_attr.size, b"binary data here".len() as u64);
        assert_eq!(file_attr.nlink, 1);
        assert_eq!(file_attr.blocks, (file_attr.size).div_ceil(512));
    }

    #[test]
    fn test_getattr_nonexistent_inode_returns_none() {
        let (_temp_dir, fs, _) = load_fs_with_single_file("f.txt", b"x");
        assert!(fs.get_attr_for_inode(99999).is_none());
    }

    #[test]
    fn test_lookup_nonexistent_name_returns_none() {
        let (_temp_dir, fs, _) = load_fs_with_single_file("a/b.txt", b"x");
        assert!(fs
            .lookup_path(ROOT_INODE, std::ffi::OsStr::new("nonexistent"))
            .is_none());

        let a_path = fs
            .lookup_path(ROOT_INODE, std::ffi::OsStr::new("a"))
            .expect("a");
        let a_ino = *fs.path_to_inode.get(&a_path).expect("a inode");
        assert!(fs
            .lookup_path(a_ino, std::ffi::OsStr::new("does_not_exist.txt"))
            .is_none());
    }

    #[test]
    fn test_directory_entries_include_dot_and_dotdot() {
        let (_temp_dir, fs, _) = load_fs_with_single_file("sub/deep/f.txt", b"data");

        let root_entries = fs.directory_entries(ROOT_INODE).expect("root entries");
        assert!(root_entries
            .iter()
            .any(|(_, kind, name)| name == "." && *kind == FileType::Directory));
        assert!(root_entries
            .iter()
            .any(|(_, kind, name)| name == ".." && *kind == FileType::Directory));

        let sub_path = fs
            .lookup_path(ROOT_INODE, std::ffi::OsStr::new("sub"))
            .expect("sub");
        let sub_ino = *fs.path_to_inode.get(&sub_path).expect("sub inode");
        let sub_entries = fs.directory_entries(sub_ino).expect("sub entries");
        assert!(sub_entries.iter().any(|(_, _, name)| name == "."));
        assert!(sub_entries.iter().any(|(_, _, name)| name == ".."));

        let dot_ino = sub_entries.iter().find(|(_, _, n)| n == ".").unwrap().0;
        assert_eq!(dot_ino, sub_ino, ". should point to self");
        let dotdot_ino = sub_entries.iter().find(|(_, _, n)| n == "..").unwrap().0;
        assert_eq!(dotdot_ino, ROOT_INODE, ".. from sub should point to root");
    }

    #[test]
    fn test_directory_entries_returns_none_for_file_inode() {
        let (_temp_dir, fs, _) = load_fs_with_single_file("f.txt", b"data");
        let file_path = fs
            .lookup_path(ROOT_INODE, std::ffi::OsStr::new("f.txt"))
            .expect("f.txt");
        let file_ino = *fs.path_to_inode.get(&file_path).expect("file inode");
        assert!(
            fs.directory_entries(file_ino).is_none(),
            "directory_entries on a file inode should return None"
        );
    }

    #[test]
    fn test_read_file_content_entire_file() {
        let content = b"the quick brown fox jumps over the lazy dog";
        let (_temp_dir, fs, _) = load_fs_with_single_file("story.txt", content);
        let file = fs.files.get(&PathBuf::from("story.txt")).expect("file");
        let data = fs
            .read_file_content(file, 0, content.len() as u32)
            .expect("read all");
        assert_eq!(data, content);
    }

    #[test]
    fn test_read_file_content_beyond_eof_returns_partial() {
        let content = b"short";
        let (_temp_dir, fs, _) = load_fs_with_single_file("s.txt", content);
        let file = fs.files.get(&PathBuf::from("s.txt")).expect("file");
        let data = fs.read_file_content(file, 3, 100).expect("read past eof");
        assert_eq!(
            data, b"rt",
            "should return only available bytes after offset"
        );
    }

    #[test]
    fn test_read_file_content_at_exact_eof_returns_empty() {
        let content = b"end";
        let (_temp_dir, fs, _) = load_fs_with_single_file("e.txt", content);
        let file = fs.files.get(&PathBuf::from("e.txt")).expect("file");
        let data = fs
            .read_file_content(file, content.len() as u64, 100)
            .expect("read at eof");
        assert!(data.is_empty(), "reading at exact EOF should return empty");
    }

    #[test]
    fn test_read_file_content_multi_chunk() {
        let temp_dir = TempDir::new().expect("create temp dir");
        let repo = Repository::init(temp_dir.path()).expect("init repo");
        let cas_store = CasStore::new(repo.store_hot_dir()).expect("create CAS store");
        let commit_hash = [7u8; 32];
        let manifest_hash = [8u8; 32];

        let chunk1 = b"AAAA";
        let chunk2 = b"BBBB";
        let chunk3 = b"CC";
        let hash1 = cas_store.put(chunk1).expect("store chunk1");
        let hash2 = cas_store.put(chunk2).expect("store chunk2");
        let hash3 = cas_store.put(chunk3).expect("store chunk3");
        let total_size = (chunk1.len() + chunk2.len() + chunk3.len()) as i64;

        insert_manifest_row(
            &repo,
            manifest_hash,
            "multi.bin",
            &[hash1, hash2, hash3],
            total_size,
        );
        insert_commit_row(&repo, commit_hash, manifest_hash);

        let fs = build_fs(temp_dir.path(), commit_hash);
        let file = fs.files.get(&PathBuf::from("multi.bin")).expect("file");

        let all = fs
            .read_file_content(file, 0, total_size as u32)
            .expect("read all");
        assert_eq!(all, b"AAAABBBBCC");

        let cross_boundary = fs.read_file_content(file, 2, 5).expect("cross-chunk read");
        assert_eq!(
            cross_boundary, b"AABBB",
            "should read across chunk boundaries"
        );

        let second_chunk_only = fs.read_file_content(file, 4, 4).expect("second chunk");
        assert_eq!(second_chunk_only, b"BBBB");
    }

    #[test]
    fn test_read_content_missing_chunk_no_remote_returns_error() {
        let temp_dir = TempDir::new().expect("create temp dir");
        let repo = Repository::init(temp_dir.path()).expect("init repo");
        let commit_hash = [7u8; 32];
        let manifest_hash = [8u8; 32];

        let fake_hash = [0xABu8; 32];
        insert_manifest_row(&repo, manifest_hash, "missing.bin", &[fake_hash], 100);
        insert_commit_row(&repo, commit_hash, manifest_hash);

        let fs = build_fs(temp_dir.path(), commit_hash);
        let file = fs.files.get(&PathBuf::from("missing.bin")).expect("file");
        let result = fs.read_file_content(file, 0, 100);
        assert!(
            result.is_err(),
            "reading a missing chunk without remote should fail"
        );
        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("not available"),
            "error should mention chunk not available: {}",
            err_msg
        );
    }

    #[test]
    fn test_file_at_root_level() {
        let (_temp_dir, fs, _) = load_fs_with_single_file("toplevel.txt", b"root file");

        let root_entries = fs.directory_entries(ROOT_INODE).expect("root entries");
        let child_names: Vec<&str> = root_entries
            .iter()
            .filter(|(_, _, n)| n != "." && n != "..")
            .map(|(_, _, n)| n.as_str())
            .collect();
        assert_eq!(child_names, vec!["toplevel.txt"]);

        let path = fs
            .lookup_path(ROOT_INODE, std::ffi::OsStr::new("toplevel.txt"))
            .expect("lookup");
        let ino = *fs.path_to_inode.get(&path).expect("inode");
        let attr = fs.get_attr_for_inode(ino).expect("attr");
        assert_eq!(attr.kind, FileType::RegularFile);
        assert_eq!(attr.size, 9);
    }

    #[test]
    fn test_deeply_nested_path_creates_all_intermediate_dirs() {
        let (_temp_dir, fs, _) = load_fs_with_single_file("a/b/c/d/e/leaf.dat", b"deep");

        let expected_dirs = ["a", "b", "c", "d", "e"];
        let mut current_ino = ROOT_INODE;
        for dir_name in &expected_dirs {
            let path = fs
                .lookup_path(current_ino, std::ffi::OsStr::new(dir_name))
                .unwrap_or_else(|| panic!("should find directory '{}'", dir_name));
            let ino = *fs.path_to_inode.get(&path).expect("inode");
            let attr = fs.get_attr_for_inode(ino).expect("attr");
            assert_eq!(
                attr.kind,
                FileType::Directory,
                "'{}' should be a directory",
                dir_name
            );
            current_ino = ino;
        }

        let leaf = fs
            .lookup_path(current_ino, std::ffi::OsStr::new("leaf.dat"))
            .expect("leaf lookup");
        let leaf_ino = *fs.path_to_inode.get(&leaf).expect("leaf inode");
        let leaf_attr = fs.get_attr_for_inode(leaf_ino).expect("leaf attr");
        assert_eq!(leaf_attr.kind, FileType::RegularFile);
        assert_eq!(leaf_attr.size, 4);
    }

    #[test]
    fn test_inode_assignment_is_deterministic_and_unique() {
        let (_temp_dir, fs, _) = load_fs_with_single_file("x/y.txt", b"test");

        let mut seen_inodes = std::collections::HashSet::new();
        for (ino, _path) in &fs.inode_map {
            assert!(seen_inodes.insert(*ino), "duplicate inode {}", ino);
        }
        assert!(seen_inodes.contains(&ROOT_INODE));

        for (path, ino) in &fs.path_to_inode {
            assert_eq!(
                fs.inode_map.get(ino),
                Some(path),
                "inode_map ↔ path_to_inode mismatch"
            );
        }
    }
}
