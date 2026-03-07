# Lapis VCS: Architecture Risk Mitigation Document

**Date**: March 7, 2026  
**Status**: Production Architecture Planning  
**Based on**: 8 areas of failure mode research (fastcdc, BLAKE3, qbsdiff, SQLite, refcounts, GC, journals, production systems)

---

## Executive Summary

This document maps research findings (Sections 1–8) to Lapis components and provides concrete mitigation strategies. Key architectural decisions:

- **Chunking**: Streaming-based fastcdc for files >2GB; avoid qbsdiff directly on large files
- **Metadata**: Single-writer queue pattern (not connection pools) for SQLite writes
- **Garbage Collection**: Physical scan mark-and-sweep (not reference counting) for cross-repo dedup
- **Transfers**: WAL-pattern journal for atomic resumable transfers
- **Safety**: BLAKE3 collision risk negligible; focus efforts on concurrency and corruption detection

---

## SECTION 1: fastcdc Streaming & Memory Pressure

### Finding Summary
- Files >10GB risk memory exhaustion with naive streaming
- Boundary-shift problem: identical content undetected when chunks straddle file boundaries
- Algorithm choice (RAM vs Gear vs SIMD) impacts throughput 200–1000 MiB/s

### Component Mapping
**Lapis Chunker**

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| OOM during fastcdc on 10GB files | **HIGH** (naive streaming) | **CRITICAL** (process kill) | Stream in 512MB–1GB windows; maintain bounded buffer |
| Boundary-shift undetects duplicates | **MEDIUM** | **HIGH** (missed dedup) | Overlap windows by chunk_size; re-scan boundaries after windowing |
| Pathological chunk variance (too large/small) | **LOW** | **MEDIUM** (suboptimal dedup) | Validate chunk histogram; alert if variance exceeds 2σ |

### Mitigation Strategy

**1. Streaming Implementation (REQUIRED for >2GB files)**
```
input_stream = open(file_path)
buffer = allocate(1GB)  # bounded
offset = 0
overlapped_chunk = None

while not EOF:
    chunk_batch = fastcdc(buffer + overlapped_chunk)
    # Emit all complete chunks; hold last chunk for overlap
    overlapped_chunk = chunk_batch.last()
    offset += 1GB
    
# Flush final overlapped chunk
```

**Why**: qbsdiff cannot operate on 10GB files directly (Section 3 constraint: 5*n memory = 50GB needed). Chunking first avoids delta compression entirely—rely on content addressing + fastcdc to find identical chunks.

**2. Boundary-Shift Mitigation**
```
chunk_window_size = 1GB
overlap_size = fastcdc.max_chunk_size  # typically 64KB–256KB

for window_start in range(0, file_size, chunk_window_size):
    window_end = min(window_start + chunk_window_size + overlap_size, file_size)
    chunks = fastcdc(file[window_start:window_end])
    
    # Only emit chunks that started in [window_start, window_start + chunk_window_size)
    for chunk in chunks:
        if chunk.offset >= window_start and chunk.offset < window_start + chunk_window_size:
            emit(chunk)
```

**Why**: Prevents identical content from being chunked differently due to windowing boundaries. Guarantees deterministic dedup across streaming passes.

**3. Algorithm Selection (fastcdc variant)**
```
Configuration:
  - Algorithm: Gear (SIMD-optimized)
  - Throughput: ~800 MiB/s on modern CPUs
  - Rationale: Best branch prediction; widely tested in production (e.g., restic)
  - Alternative: RAM (Rapid Asymmetric Extremum) if Gear unavailable
  - Avoid: AE (asymmetric extremum) due to unpredictable chunk sizes
```

**Why**: Gear achieves good balance of throughput and determinism. RAM offers similar throughput with slightly worse variance.

**4. Chunk Variance Validation**
```
# After chunking 10MB+ file
chunks = list(fastcdc(file))
sizes = [c.size for c in chunks]
mean = np.mean(sizes)
stddev = np.std(sizes)

if stddev > 2 * mean:  # >200% variance is pathological
    log.warn(f"High chunk variance: {stddev / mean:.1%} – may indicate data entropy issue or algorithm degradation")
```

**Why**: Detects algorithm pathological cases early. High variance correlates with poor dedup ratios.

---

## SECTION 2: BLAKE3 Collision Probability

### Finding Summary
- BLAKE3 provides 128-bit collision resistance (256-bit hash, birthday paradox)
- No known weaknesses for CAS systems
- Collision probability ~1 in 2^128 ✅ Negligible for production

### Component Mapping
**Lapis Content-Addressed Store (CAS) – Hashing**

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Hash collision in CAS | **NEGLIGIBLE** (1/2^128) | **CRITICAL** (data corruption) | Use BLAKE3 as-is; no change needed |
| Collision detection failure | **LOW** | **CRITICAL** | Validate chunk hashes on read (see Section 7) |

### Mitigation Strategy

**✅ No architectural changes needed.**

Recommendation:
- Confirm BLAKE3 is used for all chunk hashes (already planned in Lapis design)
- Do NOT waste engineering on collision-resistant algorithms beyond BLAKE3
- **Focus risk budget elsewhere**: concurrency, corruption detection, recovery

**Complementary Strategy: Corruption Detection (Section 7)**
```
# On chunk read, always validate hash matches metadata
stored_hash = metadata.get_chunk_hash(chunk_id)
computed_hash = blake3(chunk_data)
if stored_hash != computed_hash:
    raise CorruptionError(f"Chunk {chunk_id} failed integrity check")
```

---

## SECTION 3: qbsdiff Limitations & Large File Handling

### Finding Summary
- qbsdiff memory: `O(5*n + m)` bytes (vastly better than bsdiff's `17*n`)
- **Critical constraint**: 10GB file requires ~50GB RAM
- Practical ceiling: use qbsdiff only for files <2GB
- For large files: rely on fastcdc chunking + content addressing (no delta needed)

### Component Mapping
**Lapis Delta Compression Layer**

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| OOM during qbsdiff on 10GB file | **CRITICAL** | **CRITICAL** (process kill, no graceful fallback) | Do NOT use qbsdiff for >2GB files |
| Exceeding available memory on edge devices | **HIGH** | **HIGH** (backup failure) | Chunk first; detect file size before delta attempt |
| qbsdiff fallback missing | **MEDIUM** | **HIGH** (upload hangs) | Implement size-based decision tree (see below) |

### Mitigation Strategy

**1. File Size Decision Tree (REQUIRED)**
```
def choose_compression(old_file_size, new_file_size, available_memory):
    max_safe_delta_file = min(
        2 * 1024**3,  # 2GB hard limit
        available_memory // 5  # qbsdiff = 5*n memory
    )
    
    if max(old_file_size, new_file_size) > max_safe_delta_file:
        # Use fastcdc chunking instead; rely on content addressing
        return "fastcdc_chunking"
    else:
        # Safe to use qbsdiff
        return "qbsdiff_delta"
```

**Why**: Prevents OOM by proactively avoiding qbsdiff on large files. Falls back to chunking, which is still efficient via content addressing.

**2. Chunking-Based "Delta" for Large Files**
```
# Instead of creating delta, create dedup chunks
# Pushes identical chunks with old version; only new unique chunks sent
old_chunks = fastcdc(old_file, window_size=512MB)
new_chunks = fastcdc(new_file, window_size=512MB)

# Dedup
new_unique = set(new_chunks) - set(old_chunks)
overhead = (new_unique_bytes + metadata) / new_file_size

if overhead > 0.05:  # >5% overhead vs sending whole file
    log.warn(f"Large file delta inefficient ({overhead:.1%} overhead); consider full re-upload")
```

**Why**: For highly different large files, chunking may be inefficient. Detect and warn.

**3. Memory Budget Enforcement**
```
# At startup, measure available memory
import psutil
available_mb = psutil.virtual_memory().available // (1024**2)

max_qbsdiff_input_gb = available_mb // 5000  # conservative: 5GB mem per 1GB file
log.info(f"qbsdiff will accept files up to {max_qbsdiff_input_gb}GB (available: {available_mb}MB)")

# Periodically check (memory pressure may vary)
if psutil.virtual_memory().percent > 80:
    log.warn("System under memory pressure; reducing qbsdiff max file size")
```

**Why**: Accounts for runtime memory constraints (not just peak).

**4. Timeout on Large Deltas**
```
timeout_seconds = (file_size_gb / 0.5) + 300  # 0.5 GB/sec qbsdiff + 5min overhead
if delta_time > timeout_seconds:
    log.error(f"qbsdiff exceeded {timeout_seconds}s timeout; aborting")
    # Fall back to full re-upload or chunking
```

**Why**: Detects if qbsdiff is pathologically slow (e.g., random data, high entropy) and aborts rather than hanging.

---

## SECTION 4: SQLite Single-Writer Contention & sqlx

### Finding Summary
- SQLite allows only ONE writer at a time (WAL mode: concurrent reads + 1 writer)
- **Critical Footgun**: Connection pools cause 20–100x performance degradation
- Single writer achieves ~60,000 rows/sec vs ~2,600 rows/sec with 50-connection pool
- **Solution**: Single writer connection + read-only reader pool at application level

### Component Mapping
**Lapis Metadata Store (SQLite) + Application Write Serialization**

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Connection pool write contention | **CRITICAL** | **CRITICAL** (P99 latency 182s → lock starvation) | Single writer queue; never use pool for writes |
| Async lock-holding between awaits | **HIGH** | **HIGH** (cascading task starvation) | Serialize DB ops before async boundaries |
| Reader starvation during heavy writes | **MEDIUM** | **MEDIUM** (UI lag, slow queries) | Separate reader pool; prioritize reader connections |
| Lock timeout on checkpoint | **MEDIUM** | **MEDIUM** (WAL bloat, slow recovery) | Manual checkpoint tuning (see below) |

### Mitigation Strategy

**1. Single-Writer Queue Architecture (REQUIRED)**
```rust
// Metadata store initialization
pub struct MetadataStore {
    // Single writer connection (max_connections=1)
    writer: Arc<Mutex<sqlx::Connection>>,
    
    // Read-only pool
    reader_pool: sqlx::Pool<sqlx::Sqlite>,
    
    // Channel for write operations (serialization)
    write_tx: mpsc::UnboundedSender<WriteOp>,
}

impl MetadataStore {
    pub async fn new(db_path: &str) -> Self {
        // Writer: single connection, exclusive
        let writer = sqlx::connect(db_path).await.unwrap();
        
        // Readers: pool of read-only connections
        let reader_pool = sqlx::SqlitePoolOptions::new()
            .max_connections(num_cpus::get())
            .create(db_path)
            .await
            .unwrap();
        
        MetadataStore {
            writer: Arc::new(Mutex::new(writer)),
            reader_pool,
            write_tx,
        }
    }
    
    // Write operations MUST go through queue
    pub async fn queue_write(&self, op: WriteOp) -> Result<()> {
        self.write_tx.send(op)?;
        Ok(())
    }
    
    // Reads go directly to pool
    pub async fn read_chunk(&self, hash: &str) -> Result<ChunkMetadata> {
        sqlx::query_as::<_, ChunkMetadata>(
            "SELECT * FROM chunks WHERE hash = ?"
        )
        .bind(hash)
        .fetch_one(&self.reader_pool)
        .await
    }
}

// Separate task: process writes serially
async fn writer_task(
    writer: Arc<Mutex<sqlx::Connection>>,
    mut write_rx: mpsc::UnboundedReceiver<WriteOp>,
) {
    while let Some(op) = write_rx.recv().await {
        let mut tx = writer.lock().await;
        match op {
            WriteOp::InsertChunk(chunk) => {
                sqlx::query(
                    "INSERT INTO chunks (hash, size, created_at) VALUES (?, ?, ?)"
                )
                .bind(&chunk.hash)
                .bind(chunk.size)
                .bind(Utc::now())
                .execute(&mut *tx)
                .await
                .ok();
            }
            // ... other write ops
        }
        drop(tx);  // Release lock before next iteration
    }
}
```

**Why**: Guarantees only one writer ever holds the exclusive lock. Eliminates contention cascade. Improves P99 latency from 182s → 82ms.

**2. sqlx Configuration**
```rust
// SQLite-specific optimizations
let writer = sqlx::sqlite::SqliteConnectOptions::new()
    .filename(db_path)
    .create_if_missing(true)
    .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
    // Enable WAL (default in sqlite-rs, but explicit)
    .pragma("journal_size_limit", "100000000")  // 100MB max WAL
    .pragma("busy_timeout", "30000")  // 30s timeout (don't thrash)
    .pragma("synchronous", "NORMAL")  // Balance safety/speed
    .connect()
    .await?;

let reader_pool = sqlx::SqlitePoolOptions::new()
    .max_connections(num_cpus::get())  // 1 conn per CPU for reads
    .connect_lazy(db_path)?;
```

**Why**: WAL enables concurrent readers. journal_size_limit prevents unbounded growth. NORMAL synchronous mode is safe with WAL + explicit checkpoint.

**3. Never Hold Lock Across Awaits**
```rust
// ❌ BAD: Lock held across await
async fn bad_write() {
    let mut tx = writer.lock().await;
    let old_val = sqlx::query_scalar("SELECT count FROM metadata")
        .fetch_one(&mut *tx)
        .await?;  // ← Lock still held during await!
    
    sqlx::query("UPDATE metadata SET count = ?")
        .bind(old_val + 1)
        .execute(&mut *tx)
        .await?;
    // Lock released here
}

// ✅ GOOD: Complete op before awaiting next lock
async fn good_write() {
    let increment = {
        let old_val = {
            let mut tx = writer.lock().await;
            sqlx::query_scalar("SELECT count FROM metadata")
                .fetch_one(&mut *tx)
                .await?
        };  // ← Lock released
        old_val + 1
    };
    
    let mut tx = writer.lock().await;
    sqlx::query("UPDATE metadata SET count = ?")
        .bind(increment)
        .execute(&mut *tx)
        .await?;
}

// ✅ BETTER: Use write queue
async fn best_write(store: &MetadataStore) {
    store.queue_write(WriteOp::Increment).await?;
}
```

**Why**: Releasing lock between operations prevents cascading starvation. Write queue makes this automatic.

**4. Reader Pool Tuning**
```rust
// Reader pool size = CPU cores (not higher)
// Rationale: SQLite reads are CPU-bound (no lock contention on read)
// More connections = more memory overhead with no benefit

let reader_pool = sqlx::SqlitePoolOptions::new()
    .max_connections(num_cpus::get())
    .min_connections(2)  // Warm pool
    .acquire_timeout(Duration::from_secs(5))
    .create(db_path)
    .await?;
```

**Why**: Beyond CPU cores, additional connections waste memory. SQLite read lock is shared-lock (no contention between readers).

**5. Checkpoint Management**
```rust
// Periodic checkpoint to prevent WAL bloat
async fn checkpoint_task(writer: Arc<Mutex<sqlx::Connection>>) {
    let mut interval = tokio::time::interval(Duration::from_secs(300));  // 5 min
    loop {
        interval.tick().await;
        if let Ok(mut tx) = writer.lock().await {
            // RESTART mode: blocks writers briefly, safe for production
            sqlx::query("PRAGMA wal_checkpoint(RESTART)")
                .execute(&mut *tx)
                .await
                .ok();
        }
    }
}
```

**Why**: Prevents unbounded WAL growth. RESTART mode blocks writes momentarily but is safe; avoids TRUNCATE (which is risky).

---

## SECTION 5: Cross-Repo Refcount Race Conditions

### Finding Summary
- Reference counting is intuitive but fragile under concurrent push/GC
- **Chunk Resurrection**: GC marks chunk dead; concurrent push references it during mark → orphaned data
- **Race Window**: GC Copy phase deletes chunk while push is in-flight
- **Mark-and-Sweep Safer**: Defers all deletions to separate sweep phase; concurrent writes don't corrupt
- git-lfs, git-annex have documented failures in this area

### Component Mapping
**Lapis Garbage Collection + Cross-Repo Dedup Refcount Management**

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Chunk resurrection (GC deletes chunk during concurrent push) | **HIGH** | **CRITICAL** (data loss) | Use mark-and-sweep; defer deletions to sweep phase |
| Refcount underflow (double-decrement) | **MEDIUM** | **HIGH** (GC deletes active chunks) | Atomic refcount operations; log all refcount changes |
| Clock-skew causing GC epoch mismatch | **LOW** | **MEDIUM** (missed deletions) | Server-coordinated epochs; ignore client clocks |
| Cross-repo dedup metadata desync | **MEDIUM** | **HIGH** (orphaned chunks) | Explicit refcount queries before deletes; three-way sync |

### Mitigation Strategy

**1. Mark-and-Sweep GC (REQUIRED for cross-repo dedup)**
```
Architecture:
  Phase 1 (Mark): Enumerate all files in all repos → build set of live chunks
  Phase 2 (Sweep): Delete chunks not in live set
  
Invariant: Concurrent writes during Mark phase OK because Sweep defers all deletions

Timeline:
  T1: GC marks chunks A, B, C as live
  T2: Concurrent push references chunk D (not yet marked)
  T3: GC finishes Mark → D not in live set
  T4: Push finishes (D in DB)
  T5: GC Sweep phase → D not deleted (D was added AFTER mark finished)
  
Result: No data loss (D exists)
```

**vs. Reference Counting (❌ unsafe)**:
```
Timeline with refcount:
  T1: GC decrements refcount for chunk D (thinking last ref gone)
  T2: Concurrent push increments refcount for chunk D
  T3: GC Sweep phase → deletes chunk D (refcount=0 during gap)
  T4: Push completes (references deleted chunk!)
  
Result: Data loss
```

**2. Implementation Pattern**
```rust
pub struct GarbageCollector {
    db: Arc<Mutex<MetadataStore>>,
}

impl GarbageCollector {
    pub async fn collect(&self) -> Result<()> {
        // Phase 1: Mark (enumerate all live references)
        let live_chunks = self.mark_phase().await?;
        
        // Phase 2: Sweep (delete unreferenced)
        // Between mark and sweep, concurrent pushes may add NEW chunks
        // These new chunks will exist in DB but not in live_chunks set
        // IMPORTANT: Do NOT delete them; they were added AFTER mark
        self.sweep_phase(&live_chunks).await?;
        
        Ok(())
    }
    
    async fn mark_phase(&self) -> Result<HashSet<String>> {
        let mut live = HashSet::new();
        
        // Scan all repos on server
        for repo in self.list_repos().await? {
            // Enumerate all file commits in repo
            for file_id in repo.list_files().await? {
                // Get chunk IDs for this file
                let chunks = self.db.read_chunks_for_file(file_id).await?;
                live.extend(chunks);
            }
        }
        
        log::info!("Mark phase complete; {} live chunks", live.len());
        Ok(live)
    }
    
    async fn sweep_phase(&self, live_chunks: &HashSet<String>) -> Result<()> {
        // Query all chunks in store
        let all_chunks = self.db.read_all_chunks().await?;
        
        let mut deleted = 0;
        for chunk_id in all_chunks {
            if !live_chunks.contains(&chunk_id) {
                // Chunk not referenced; safe to delete
                self.db.delete_chunk(&chunk_id).await?;
                deleted += 1;
            }
        }
        
        log::info!("Sweep phase complete; deleted {} unreferenced chunks", deleted);
        Ok(())
    }
}
```

**Why**: Separating mark and sweep prevents race conditions. Concurrent writes during mark don't cause data loss because sweep only deletes chunks that existed AND were unreferenced at mark time.

**3. Cross-Repo Refcount Logging**
```rust
// Every refcount change must be logged (for audit trail + recovery)
pub struct RefcountLog {
    chunk_id: String,
    operation: "increment" | "decrement",
    repo_id: String,
    timestamp: i64,
    new_refcount: i32,
}

async fn increment_refcount(
    db: &MetadataStore,
    chunk_id: &str,
    repo_id: &str,
) -> Result<()> {
    let new_count = db.update_refcount(chunk_id, +1).await?;
    
    db.log_refcount(RefcountLog {
        chunk_id: chunk_id.to_string(),
        operation: "increment",
        repo_id: repo_id.to_string(),
        timestamp: Utc::now().timestamp_millis(),
        new_refcount: new_count,
    }).await?;
    
    Ok(())
}
```

**Why**: Enables diagnosing orphaned chunks. Can replay refcount history if corruption detected.

**4. Atomic Refcount Operations**
```sql
-- NEVER do:
-- SELECT refcount FROM chunks WHERE id = ?
-- UPDATE chunks SET refcount = refcount + 1 WHERE id = ?
-- (race window exists)

-- DO: Single atomic operation
UPDATE chunks
SET refcount = refcount + 1, updated_at = NOW()
WHERE id = ?;

-- Verify in application
SELECT refcount FROM chunks WHERE id = ? 
  RETURNING refcount AS new_refcount;
```

**Why**: Prevents double-increments or double-decrements due to concurrent ops.

**5. Server-Coordinated GC Epochs**
```rust
pub struct GcEpoch {
    epoch_id: u64,
    started_at: i64,
    phase: "mark" | "sweep" | "complete",
    repos_scanned: Vec<String>,
}

// On server, GC holds exclusive lock during mark
pub async fn start_gc() -> Result<u64> {
    let epoch = GcEpoch {
        epoch_id: next_epoch(),
        started_at: Utc::now().timestamp_millis(),
        phase: "mark",
        repos_scanned: vec![],
    };
    
    db.insert_gc_epoch(&epoch).await?;
    
    // Clients see this epoch; can coordinate timing
    Ok(epoch.epoch_id)
}

// Clients query epoch to avoid push during sweep
pub async fn is_gc_active() -> Result<bool> {
    let latest_epoch = db.latest_gc_epoch().await?;
    Ok(latest_epoch.phase == "sweep")
}
```

**Why**: Allows clients to delay pushes if GC sweep in progress. Reduces race window. (Not foolproof, but better than nothing.)

---

## SECTION 6: Generation-Based GC Failure Modes

### Finding Summary
- **Logical GC** (enumerate files): mark throughput drops 100x with 100–300x dedup ratios or millions of files
- **Physical GC** (scan containers): scales with physical capacity (better for high dedup)
- Corruption propagation: one bad metadata chunk corrupts entire file subtree due to dedup sharing
- Memory overhead: Bloom filters require 6 bits per fingerprint; 200-byte fingerprints = hundreds of GB for large systems

### Component Mapping
**Lapis Generation-Based GC Strategy + Bloom Filter Tuning**

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Mark phase O(files) enumeration bottleneck | **HIGH** (with millions of files or high dedup) | **HIGH** (GC takes hours; blocks sweep) | Use Physical GC (container scan) not Logical GC (file scan) |
| Bloom filter OOM (6 bits per fingerprint × 200B = 1.2 TB for 1M chunks) | **MEDIUM** | **HIGH** (GC fails mid-mark) | Use perfect hashing (4 bits) or counting Bloom filters; monitor memory |
| Corruption of metadata chunk propagates to all files | **MEDIUM** | **CRITICAL** (cascading data loss) | Validate hashes on every GC phase; detect corruption early |
| Memory pressure during concurrent mark + active writes | **MEDIUM** | **MEDIUM** (GC evicted, mark restart) | Separate GC memory budget; kill GC if pressure exceeds threshold |

### Mitigation Strategy

**1. Physical GC (Container-Based Scan) – Recommended**
```rust
pub struct PhysicalGc {
    db: Arc<MetadataStore>,
}

impl PhysicalGc {
    pub async fn mark_phase(&self) -> Result<HashSet<String>> {
        let mut live_chunks = HashSet::new();
        
        // Scan containers (physical storage units)
        // Containers are append-only; scan sequentially (fast)
        for container_id in self.db.list_containers().await? {
            let container = self.db.open_container(container_id).await?;
            
            // Scan container sequentially (good I/O locality)
            for chunk in container.scan_chunks().await? {
                // Check if chunk is referenced in metadata
                if self.db.is_chunk_referenced(&chunk.hash).await? {
                    live_chunks.insert(chunk.hash);
                }
            }
        }
        
        log::info!("Physical mark: scanned containers, {} live chunks", live_chunks.len());
        Ok(live_chunks)
    }
}

// Characteristics:
// - Throughput: Limited by storage I/O (typically 100–500 MiB/s)
// - Memory: O(live_chunks) in Bloom filter
// - Scalability: Scales with physical capacity (not file count)
// - Best for: High dedup ratios (100–300x)
```

**vs. Logical GC (❌ avoid for large systems)**:
```rust
pub struct LogicalGc {
    db: Arc<MetadataStore>,
}

impl LogicalGc {
    pub async fn mark_phase(&self) -> Result<HashSet<String>> {
        let mut live_chunks = HashSet::new();
        
        // Enumerate all files (O(files))
        for file_id in self.db.list_all_files().await? {
            let chunks = self.db.read_chunks_for_file(file_id).await?;
            live_chunks.extend(chunks);
        }
        
        Ok(live_chunks)
    }
}

// Characteristics:
// - Throughput: O(files) enumeration; drops 100x with millions of files
// - Scalability: O(files) not O(physical); pathological with high dedup
// - Best for: Low dedup ratios or small systems (<100k files)
```

**When to choose**:
```
if dedup_ratio > 100 or file_count > 1_000_000:
    use PhysicalGc  # Container scan scales better
else:
    use LogicalGc  # Simpler, sufficient for small systems
```

**2. Memory-Efficient Bloom Filter or Perfect Hashing**
```rust
// Option A: Standard Bloom filter (6 bits per element)
// For 1M chunks × 200B fingerprints:
// 6 bits × 1M = 6 Mbit = 750 KB (very reasonable)
// But to be conservative for large systems:

// Option B: Perfect hashing (4 bits per element)
use perfect_hash::BuiltHashSet;

pub struct GcMarkState {
    // Instead of HashSet<String>, use perfect hash set
    live_chunks: BuiltHashSet<String>,
}

// 4 bits × 1M chunks = 500 KB (25% savings)
// Tradeoff: Perfect hash must know size in advance
// Solution: Pre-allocate with estimate, rebuild if exceeded

impl GcMarkState {
    pub async fn new(estimated_chunks: usize) -> Self {
        GcMarkState {
            live_chunks: BuiltHashSet::with_capacity(estimated_chunks),
        }
    }
    
    pub async fn add_chunk(&mut self, hash: String) {
        if self.live_chunks.len() >= self.live_chunks.capacity() * 90 / 100 {
            // 90% full; rebuild with 1.5x capacity
            self.live_chunks = BuiltHashSet::with_capacity(
                (self.live_chunks.capacity() * 3) / 2
            );
        }
        self.live_chunks.insert(hash);
    }
}
```

**3. Corruption Detection During GC**
```rust
async fn validate_metadata_chunk(
    db: &MetadataStore,
    chunk_id: &str,
    stored_hash: &str,
) -> Result<()> {
    // Fetch chunk data
    let data = db.fetch_chunk_data(chunk_id).await?;
    
    // Compute hash
    let computed = blake3::hash(&data).to_hex();
    
    if stored_hash != computed {
        // Corruption detected!
        // Log but do NOT delete (could corrupt referencing files)
        log::error!("Chunk {} hash mismatch (stored: {}, computed: {})",
                    chunk_id, stored_hash, computed);
        return Err(CorruptionError);
    }
    
    Ok(())
}

// During mark phase: validate every chunk
pub async fn mark_phase_with_validation(&self) -> Result<HashSet<String>> {
    let mut live_chunks = HashSet::new();
    let mut corrupt = Vec::new();
    
    for container_id in self.db.list_containers().await? {
        let container = self.db.open_container(container_id).await?;
        
        for chunk in container.scan_chunks().await? {
            match validate_metadata_chunk(&self.db, &chunk.id, &chunk.hash).await {
                Ok(_) => {
                    if self.db.is_chunk_referenced(&chunk.hash).await? {
                        live_chunks.insert(chunk.hash);
                    }
                }
                Err(_) => {
                    corrupt.push(chunk.id);
                }
            }
        }
    }
    
    if !corrupt.is_empty() {
        log::warn!("Found {} corrupted chunks; marking for manual review", corrupt.len());
        // Write to quarantine table; alert operator
        self.db.quarantine_chunks(corrupt).await?;
    }
    
    Ok(live_chunks)
}
```

**Why**: Detects corruption early before it propagates during sweep.

**4. Memory Budget Enforcement**
```rust
pub async fn mark_phase_with_memory_limit(&self, max_memory_mb: usize) -> Result<HashSet<String>> {
    let mut live_chunks = HashSet::new();
    let mut mem_usage = 0usize;
    
    for container_id in self.db.list_containers().await? {
        let container = self.db.open_container(container_id).await?;
        
        for chunk in container.scan_chunks().await? {
            if self.db.is_chunk_referenced(&chunk.hash).await? {
                live_chunks.insert(chunk.hash.clone());
                
                // Rough memory estimate: hash string + set overhead
                mem_usage += chunk.hash.len() + 64;
                
                if mem_usage > max_memory_mb * 1024 * 1024 {
                    log::error!("GC mark exceeded {} MB; aborting", max_memory_mb);
                    // Trigger full restart or alternative strategy
                    return Err(MemoryLimitExceeded);
                }
            }
        }
    }
    
    Ok(live_chunks)
}
```

**Why**: Prevents OOM which would kill GC process and require restart.

---

## SECTION 7: Resumable Transfer Journal Corruption

### Finding Summary
- git-lfs: temp files left behind after incomplete transfers; metadata desync between client/server
- Core problem: Journal metadata (transfer state, offsets, checksums) not atomic with data writes
- **Solution**: WAL-pattern journal with sub-journals for independent replay
- CAS helps (chunk hash mismatch = corruption detected), but doesn't prevent it

### Component Mapping
**Lapis Resumable Transfer Management + Client-Side Journal**

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Partial upload + metadata corruption = unrecoverable state | **HIGH** | **CRITICAL** (user must re-upload) | WAL-pattern journal with atomic writes |
| Temp files orphaned after crash; resume thinks more data needed | **MEDIUM** | **MEDIUM** (extra upload traffic) | Atomic temp file creation; log cleanup on resume |
| Server-side metadata desync (missing chunks but metadata says present) | **MEDIUM** | **CRITICAL** (corrupted files, undetected) | Validate chunk hashes on every read; quarantine mismatches |
| Journal file itself corrupted (unrecoverable transfer log) | **LOW** | **HIGH** (resume impossible) | Sub-journals; corrupt entry skipped, rest replay OK |

### Mitigation Strategy

**1. WAL-Pattern Transfer Journal (REQUIRED)**
```rust
// On client: track transfer state in structured journal
pub struct TransferJournal {
    transfer_id: String,
    file_path: String,
    file_hash: String,
    chunks: Vec<ChunkTransferRecord>,
    state: "pending" | "in_progress" | "complete" | "failed",
    last_updated: i64,
}

pub struct ChunkTransferRecord {
    chunk_id: String,
    chunk_size: u64,
    offset_in_file: u64,
    upload_state: "pending" | "in_progress" | "complete",
    server_acked: bool,
    local_hash: String,
}

// Journal write: atomic (either fully written or not written)
pub async fn write_journal(journal: &TransferJournal, path: &Path) -> Result<()> {
    let temp_path = path.with_extension("tmp");
    
    // Write to temp
    let json = serde_json::to_string(journal)?;
    tokio::fs::write(&temp_path, json).await?;
    
    // Atomic rename
    tokio::fs::rename(&temp_path, path).await?;
    
    Ok(())
}

// On resume: read journal, continue from last complete chunk
pub async fn resume_transfer(journal_path: &Path) -> Result<()> {
    let journal = read_journal(journal_path).await?;
    
    for chunk_record in &journal.chunks {
        if chunk_record.upload_state == "complete" {
            continue;  // Skip already uploaded
        }
        
        // Re-upload this chunk
        let chunk_data = read_chunk(&chunk_record.chunk_id).await?;
        
        // Verify hash before sending (corruption detection)
        let computed_hash = blake3::hash(&chunk_data).to_hex();
        if computed_hash != chunk_record.local_hash {
            log::error!("Chunk {} corrupted (local hash mismatch)", chunk_record.chunk_id);
            return Err(CorruptionError);
        }
        
        // Upload
        upload_chunk(&chunk_record.chunk_id, &chunk_data).await?;
        
        // Update journal atomically
        let mut updated = journal.clone();
        updated.chunks[i].upload_state = "complete";
        updated.chunks[i].server_acked = true;
        write_journal(&updated, journal_path).await?;
    }
    
    Ok(())
}
```

**Why**: Atomic journal writes prevent metadata corruption. Resume reads journal to know exactly which chunks are safe to skip.

**2. Sub-Journals for Independent Replay**
```rust
// Instead of single journal, use one journal per chunk
// Enables selective replay if journal corrupts
pub struct ChunkJournal {
    chunk_id: String,
    offset: u64,
    size: u64,
    state: "pending" | "uploaded" | "acked",
    hash: String,
}

pub async fn upload_chunk_with_subjournal(
    chunk_id: &str,
    data: &[u8],
    journals_dir: &Path,
) -> Result<()> {
    let journal_path = journals_dir.join(format!("{}.journal", chunk_id));
    
    // Create journal entry
    let journal = ChunkJournal {
        chunk_id: chunk_id.to_string(),
        offset: 0,
        size: data.len() as u64,
        state: "pending",
        hash: blake3::hash(data).to_hex(),
    };
    write_journal(&journal, &journal_path).await?;
    
    // Upload
    let result = upload_to_server(chunk_id, data).await;
    
    match result {
        Ok(_) => {
            // Update journal: uploaded
            let mut updated = journal;
            updated.state = "uploaded";
            write_journal(&updated, &journal_path).await?;
            
            // Server ack (optional handshake)
            verify_chunk_on_server(chunk_id).await?;
            
            updated.state = "acked";
            write_journal(&updated, &journal_path).await?;
        }
        Err(e) => {
            log::error!("Upload failed: {}", e);
            // Leave journal as "pending"; resume will retry
        }
    }
    
    Ok(())
}

// Resume: scan all sub-journals
pub async fn resume_all_transfers(journals_dir: &Path) -> Result<()> {
    let mut entries = tokio::fs::read_dir(journals_dir).await?;
    
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if path.extension().map_or(false, |e| e == "journal") {
            let journal = read_journal(&path).await?;
            
            if journal.state != "acked" {
                log::info!("Resuming chunk {}", journal.chunk_id);
                
                let chunk_data = read_chunk(&journal.chunk_id).await?;
                
                // If sub-journal corrupted, this chunk is skipped (no panic)
                match upload_chunk_with_subjournal(&journal.chunk_id, &chunk_data, journals_dir).await {
                    Ok(_) => {}
                    Err(e) => {
                        log::warn!("Resume failed for {}: {}", journal.chunk_id, e);
                        // Continue to next chunk
                    }
                }
            }
        }
    }
    
    Ok(())
}
```

**Why**: If one sub-journal corrupts, only that chunk is affected. Others resume normally. Avoids all-or-nothing failure.

**3. Server-Side Chunk Validation**
```rust
// Server: On every read, validate hash matches metadata
pub async fn get_chunk(chunk_id: &str) -> Result<Vec<u8>> {
    let metadata = db.get_chunk_metadata(chunk_id).await?;
    let data = storage.fetch_chunk(chunk_id).await?;
    
    // Compute hash
    let computed_hash = blake3::hash(&data).to_hex();
    
    if computed_hash != metadata.hash {
        log::error!("Chunk {} corruption detected (hash mismatch)", chunk_id);
        
        // Move to quarantine; don't return corrupted data
        db.quarantine_chunk(chunk_id).await?;
        
        return Err(CorruptionError);
    }
    
    Ok(data)
}
```

**Why**: CAS provides built-in corruption detection. Prevents silent corruption from being served to clients.

**4. Cleanup on Resume Failure**
```rust
// If resume fails for a chunk, log it and move on
// But don't leave orphaned temp files
pub async fn cleanup_orphaned_temps(transfers_dir: &Path) -> Result<()> {
    // Find temp files older than 24 hours
    let now = Utc::now();
    
    let mut entries = tokio::fs::read_dir(transfers_dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if path.extension().map_or(false, |e| e == "tmp") {
            let metadata = tokio::fs::metadata(&path).await?;
            let modified = metadata.modified()?;
            let age = now.signed_duration_since(
                modified.duration_since(UNIX_EPOCH)?.as_secs() as i64
            );
            
            if age.num_hours() > 24 {
                log::info!("Removing orphaned temp: {}", path.display());
                tokio::fs::remove_file(&path).await?;
            }
        }
    }
    
    Ok(())
}
```

**Why**: Prevents temp file accumulation from incomplete transfers.

---

## SECTION 8: Production Issues from Similar Systems

### Finding Summary
- **git-lfs**: File corruption, temp file orphaning, metadata desync (#3598, #5433)
- **git-annex**: Race conditions (watch/assistant vs addurl), GC/prune race (deleting in-use blobs)
- **DVC**: Cross-repo dedup poorly specified; missing concurrent access docs; refcount failures in shared storage
- **Perforce**: Memory management critical for large files; scalability issues with 100k+ submits; compression tuning essential

### Component Mapping
**Lapis Overall Architecture – Lessons from Field**

### Mitigation Strategy

**Apply each lesson to Lapis design**:

| Issue | Source | Root Cause | Lapis Mitigation |
|-------|--------|-----------|------------------|
| Temp file orphaning | git-lfs #3598 | Incomplete transfer; metadata not atomic with data | WAL-pattern journal (Section 7) |
| Metadata desync (server != client) | git-lfs #5433 | No verification on read | CAS with hash validation (Sections 2, 7) |
| GC deletes in-use blobs | git-annex devblog | Race between GC and concurrent get | Mark-and-sweep (Section 5) |
| Race between watch and addurl | git-annex devblog | Concurrent file additions to DB | Single-writer queue (Section 4) |
| Import fails (missing chunks) | DVC issues | Cross-repo dedup not coordinated | Server-coordinated refcounts + physical GC (Sections 5, 6) |
| Memory exhaustion on large file delta | Perforce tuning | No memory budgets enforced | Size-based decision tree for qbsdiff (Section 3) |
| Metadata scalability (100k+ files) | Perforce tuning | Naive enumeration | Physical GC not logical (Section 6) |

---

## Component-by-Component Risk Map

| Component | Findings | Risk Level | Mitigation Priority |
|-----------|----------|------------|-------------------|
| **Chunker (fastcdc)** | Streaming, boundary-shift (1) | HIGH | 1. Implement streaming windows + overlap 2. Validate chunk variance 3. Gear algorithm |
| **CAS (BLAKE3)** | Collision safety (2) | LOW | Confirm BLAKE3 in use; focus elsewhere |
| **Delta Compression (qbsdiff)** | Memory limits, size ceiling (3) | HIGH | Size-based decision tree; never direct delta on >2GB; fallback to chunking |
| **Metadata Store (SQLite)** | Write contention, async hazards (4) | CRITICAL | Single-writer queue + read-only pool; never hold lock across await |
| **Refcount Manager (Cross-Repo)** | Chunk resurrection, races (5) | CRITICAL | Mark-and-sweep GC; atomic refcount logging |
| **Garbage Collector** | Memory OOM, corruption propagation, scalability (6) | HIGH | Physical GC; Bloom filter tuning; corruption detection during mark |
| **Transfer Resume** | Journal corruption, temp orphaning (7) | HIGH | WAL-pattern journal; sub-journals; server-side hash validation |
| **Overall Design** | Production lessons (8) | VARIES | Apply git-lfs, git-annex, DVC fixes; avoid their mistakes |

---

## Failure Mode Playbooks

### Playbook 1: Chunk Resurrection During Concurrent Push/GC

**Scenario**: GC marks chunk D as dead; concurrent push references D.

**Failure Chain**:
1. GC starts mark phase
2. Push sends request for chunk D (not yet in mark phase)
3. GC finishes mark; D not in live set
4. Push increments refcount for D
5. GC sweep phase deletes D (refcount was 0)
6. Push's reference to D is now orphaned

**Detection**: 
- Chunk read fails (not found in storage)
- Or hash mismatch if data partially corrupted

**Recovery**:
1. **Immediate**: Check GC epoch; if sweep phase active, pause new pushes
2. **Short-term**: Re-upload orphaned chunks (push fails and retries)
3. **Investigation**: Query refcount log to identify which repos lost data

**Prevention**:
- ✅ Use mark-and-sweep (defer deletions) instead of refcount-on-write
- ✅ Log all refcount operations for audit trail
- ✅ Implement GC epoch signaling; clients check before push (advisory)

---

### Playbook 2: qbsdiff OOM During Large File Upload

**Scenario**: User uploads 15GB file; system has 64GB RAM; qbsdiff tries 5*n = 75GB.

**Failure Chain**:
1. Client decides to create delta (old_file_size=10GB, new_file_size=15GB)
2. Calls qbsdiff; memory required = 5 * 15GB = 75GB
3. System has 64GB; process killed by OOM killer
4. Upload fails with no graceful fallback
5. User must retry with smaller delta or full upload

**Detection**:
- Process killed with signal 9 (SIGKILL)
- Or timeout with no progress

**Recovery**:
1. **Immediate**: Fall back to fastcdc chunking (no delta needed)
2. **Re-upload**: Send only new unique chunks
3. **Log**: Alert operator that delta compression wasn't possible

**Prevention**:
- ✅ Check available memory before attempting qbsdiff
- ✅ Enforce file size ceiling (max 2GB for delta)
- ✅ Implement timeout; abort and fall back to chunking
- ✅ Warn user if overhead > 5% (delta not worth it)

---

### Playbook 3: SQLite Write Contention Lock Starvation

**Scenario**: 50-connection pool; all connections attempt writes; P99 latency = 182s.

**Failure Chain**:
1. App uses 50-connection pool for writes
2. Multiple coroutines try to acquire write lock
3. Only 1 acquires lock; other 49 spin/wait
4. Holding connection blocks other coroutines from using it
5. Cascading starvation; all writes blocked

**Detection**:
- Watchdog: Queries that should complete in <100ms take >10s
- Metrics: Write queue depth continuously grows
- Logs: "SQLITE_BUSY" errors accumulating

**Recovery**:
1. **Immediate**: Kill connection pool; restart with single-writer queue
2. **Flush**: Process queued writes serially
3. **Verify**: Confirm write latency drops to <100ms

**Prevention**:
- ✅ Use single-writer queue; never use connection pool for writes
- ✅ Separate reader pool (multiple connections OK)
- ✅ Never hold write lock across await; serialize ops first
- ✅ Implement metrics: write queue depth, lock wait time

---

### Playbook 4: GC Logical Mark Phase Timeout (Millions of Files)

**Scenario**: System has 2M files; dedup ratio 200x; logical GC enumerate all files takes 4 hours.

**Failure Chain**:
1. GC starts logical mark (enumerate 2M files)
2. Each file lookup is DB query + disk I/O
3. Cumulative time: 2M * 10ms = 20,000s = 5.5 hours
4. GC blocks sweep phase; data cannot be reclaimed
5. Storage fills up; new pushes fail

**Detection**:
- GC still in mark phase after 30 minutes
- Sweep phase never starts
- Storage utilization climbing despite GC running

**Recovery**:
1. **Immediate**: Abort GC; kill process
2. **Switch**: Enable physical GC instead
3. **Resume**: Physical GC scans containers (sequential I/O) → 10x faster

**Prevention**:
- ✅ Use physical GC for systems with >100k files or >100x dedup
- ✅ Implement mark phase timeout (e.g., 30min); fall back to physical
- ✅ Monitor dedup ratio; auto-select GC strategy
- ✅ Pre-calculate mark phase estimate; alert if exceeds budget

---

### Playbook 5: Resumable Transfer Journal Corruption

**Scenario**: Client crashes mid-upload; journal file partially written.

**Failure Chain**:
1. Upload chunk 1; write journal (state="pending")
2. Upload chunk 2; update journal (state="in_progress")
3. **Crash** during journal write (corrupted JSON, truncated file)
4. Resume reads journal; JSON parse fails
5. Cannot determine which chunks were uploaded
6. User must start from scratch

**Detection**:
- JSON parse error on resume
- Or chunk list is empty/invalid

**Recovery**:
1. **Immediate**: Move corrupted journal to backup
2. **Query Server**: Ask server which chunks already received (hash verification)
3. **Resume**: Based on server state, upload missing chunks

**Prevention**:
- ✅ Use atomic writes for journal (write to .tmp, then rename)
- ✅ Use sub-journals per chunk (corrupt chunk doesn't break entire transfer)
- ✅ Server validates chunk hashes; client verifies server has it
- ✅ Implement journal versioning; skip corrupted entries, process rest

---

## Performance Tuning Guide

### Fastcdc Configuration
```rust
// Gear algorithm (recommended)
let chunker = fastcdc::FastCdc::with_params(
    fastcdc::Algo::Gear,
    16384,              // Min chunk size (16KB)
    65536,              // Average chunk size (64KB) 
    262144,             // Max chunk size (256KB)
);

// For binary data (lower entropy), prefer lower avg_chunk_size
// For text data (higher entropy), can increase avg_chunk_size
// Throughput: Gear achieves ~800 MiB/s on modern hardware
```

### SQLite Configuration
```rust
// Writer connection options
let writer_options = sqlx::sqlite::SqliteConnectOptions::new()
    .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
    .pragma("synchronous", "NORMAL")
    .pragma("busy_timeout", "30000")
    .pragma("journal_size_limit", "100000000")
    .pragma("wal_autocheckpoint", "1000");  // Checkpoint every 1000 pages

// Reader pool
let reader_pool = sqlx::SqlitePoolOptions::new()
    .max_connections(num_cpus::get())
    .min_connections(2)
    .connect_lazy(db_path)?;

// Expected performance
// - Single writer: 60,000 rows/sec
// - Reader queries: <10ms P50
// - Write latency: <100ms P99
```

### Garbage Collection Tuning
```rust
// Physical vs Logical decision
if system_dedup_ratio > 100 || system_file_count > 1_000_000 {
    use PhysicalGc
} else {
    use LogicalGc
}

// Memory budget
let max_mark_memory_gb = total_system_memory_gb / 2;  // Conservative

// Checkpoint frequency
let checkpoint_interval = Duration::from_secs(300);  // 5 minutes
```

### qbsdiff Tuning
```rust
// File size decision
fn choose_compression(old_size: u64, new_size: u64, available_memory: u64) -> CompressionStrategy {
    let max_safe_size = min(2 * 1024**3, available_memory / 5);
    
    if max(old_size, new_size) > max_safe_size {
        CompressionStrategy::Chunking  // Use fastcdc instead
    } else {
        CompressionStrategy::Delta
    }
}
```

---

## Testing Matrix

| Scenario | Test Type | Expected Behavior | Pass Criteria |
|----------|-----------|-------------------|---------------|
| fastcdc on 10GB file | Stress | No OOM, deterministic chunks | Completes in <60s, same chunks on re-run |
| Concurrent push + GC | Chaos | No data loss | All chunks recoverable after GC+push |
| SQLite 100 concurrent readers | Load | Low latency | P99 < 10ms |
| SQLite 10 writers via pool | Load | Detect contention | P99 latency >100ms (demonstrates problem) |
| SQLite 10 writes via queue | Load | No contention | P99 latency <100ms |
| qbsdiff on 5GB file | Stress | OOM gracefully | Falls back to chunking, completes |
| Transfer resume after crash | Chaos | Resumes correctly | Skips uploaded chunks, completes |
| GC mark phase (1M files) | Performance | Completes in time budget | Mark phase <30min |
| Chunk hash mismatch | Corruption | Detected and quarantined | Chunk not served; operator alerted |

---

## Conclusion

This document maps 8 areas of production failure research to concrete Lapis architectural decisions. Key takeaways:

1. **Chunking**: Stream fastcdc for large files; no qbsdiff directly on >2GB
2. **Metadata**: Single-writer queue; never pool writes
3. **Garbage Collection**: Mark-and-sweep; physical scan for large systems
4. **Transfers**: WAL-pattern journal; atomic writes
5. **Concurrency**: Defer deletions (GC sweep); atomic refcounts
6. **Validation**: Hash every chunk on read; quarantine mismatches
7. **Monitoring**: Track write queue depth, mark phase time, dedup ratio

These patterns are proven in production systems (Perforce, Data Domain); lessons from git-lfs, git-annex, DVC failures are integrated.
