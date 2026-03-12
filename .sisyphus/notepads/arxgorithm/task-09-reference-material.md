# Task 9: Recommendation Engine Reference Material

**Task**: Implement content-based recommendation using cosine similarity on pre-computed embeddings.

**Last Updated**: 2026-03-11  
**Scope**: Implementation-relevant notes and links ONLY (read-only reference)

---

## 1. SQLITE-VEC TECHNICAL OVERVIEW

### Core Concepts

**What sqlite-vec provides:**
- K-Nearest Neighbor (KNN) search directly in SQLite
- Multiple distance metrics: L2, L1, cosine similarity, Hamming
- No external dependencies; runs on any SQLite environment
- SIMD-accelerated (AVX/NEON)
- Virtual table engine (`vec0_vtab`)

**Key reference**: [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec) (Latest: v0.1.7-alpha.10, Mar 4 2026)

### Vector Storage in sqlite-vec

| Type | Dimensions | Use Case | Performance |
|------|-----------|----------|-------------|
| `float[N]` | Any (1024 typical) | General embeddings | Baseline |
| `int8[N]` | Any | Quantized vectors | ~4x smaller, faster L1/L2 |
| `bit[N]` | Any | Binary vectors | Hamming distance, most compact |

**Storage format**: Binary BLOB via Python's `struct.pack()` or JSON arrays.

**Validation**: sqlite-vec enforces vector type consistency at SQL execution time.

### Distance Metrics in sqlite-vec

```sql
-- Cosine Similarity (normalized dot product, returns [0, 2])
SELECT vec_distance_cosine(a.vector, b.vector) AS similarity

-- L2 (Euclidean, for raw vectors)
SELECT vec_distance_l2(a.vector, b.vector) AS distance

-- L1 (Manhattan, for quantized vectors)
SELECT vec_distance_l1(a.vector, b.vector) AS distance

-- Hamming (binary vectors only)
SELECT vec_distance_hamming(a.vector, b.vector) AS distance
```

**For cosine similarity recommendation**: Use `vec_distance_cosine()` which returns normalized angular distance. Lower = more similar.

### KNN Query Pattern

```sql
SELECT 
  paper_id,
  title,
  distance
FROM embeddings
WHERE vector MATCH ?    -- Query vector binding
ORDER BY distance
LIMIT k;
```

**Performance note**: sqlite-vec scans all vectors by default (exact NN, not approximate). Acceptable for <1M vectors on reasonable hardware.

---

## 2. CONTENT-BASED FILTERING WITH EMBEDDINGS

### Recommendation Algorithm (High Level)

```
1. USER PROFILE BUILDING
   ├─ Fetch papers user has read/saved (reading_list)
   ├─ Load their embedding vectors
   └─ Compute average/centroid embedding

2. SIMILARITY SEARCH
   ├─ Query sqlite-vec for papers similar to user profile
   ├─ Filter by:
   │  ├─ Category (if specified)
   │  ├─ Already-read papers (exclude)
   │  └─ Metadata (if applicable)
   └─ Sort by distance (ascending = more similar)

3. FALLBACK FOR COLD START
   ├─ If user has no history: return recent popular papers
   └─ Optional: weighted by citations or trending metrics
```

### Key Implementation Decisions

**User Profile Vector Calculation:**
- **Option A**: Average embedding of all read papers → centroid
- **Option B**: Weighted average (recent papers get higher weight)
- **Option C**: Latest read paper (simplest, least robust)

**For Task 9, use Option A (simple average)**: 
```python
user_profile = np.mean(all_read_papers_embeddings, axis=0)
```

**Cosine Similarity Interpretation:**
- Range: [0, 2] where 0 = most similar, 2 = least similar
- sqlite-vec returns distance, not similarity score
- Lower distance = better recommendation

**Ranking Strategy:**
- Primary: Sort by distance (ascending)
- Secondary: Filter by category if specified
- Tertiary: Exclude already-read papers
- Fallback: Return recent papers if no history exists

---

## 3. SQLITE-VEC SCHEMA FOR RECOMMENDATIONS

### Embeddings Table

```sql
CREATE VIRTUAL TABLE embeddings USING vec0(
  vector float[1024],        -- Qwen3-Embedding-8b output
  +paper_id INTEGER,         -- Foreign key to papers
  +created_at TIMESTAMP      -- Metadata for filtering
);

-- Auxiliary columns (+prefix) store metadata without embedding
-- Non-vector data should NOT be part of the vector
```

### Reference Schema from Plan

```sql
CREATE TABLE papers (
  id INTEGER PRIMARY KEY,
  arxiv_id TEXT UNIQUE,
  title TEXT,
  abstract TEXT,
  authors JSON,              -- ["Name1", "Name2"]
  categories JSON,           -- ["cs.AI", "stat.ML"]
  published_at TIMESTAMP,
  updated_at TIMESTAMP,
  created_at TIMESTAMP
);

CREATE TABLE embeddings (
  paper_id INTEGER PRIMARY KEY,
  vector BLOB,               -- sqlite-vec float32 vector
  created_at TIMESTAMP
);

CREATE TABLE reading_list (
  user_id INTEGER,
  anonymous_id TEXT,
  paper_id INTEGER,
  saved_at TIMESTAMP,
  PRIMARY KEY (user_id, paper_id) OR (anonymous_id, paper_id)
);
```

---

## 4. REAL-WORLD EXAMPLE: SEMANTIC SEARCH IN SQLITE-VEC

**Source**: [Towards Data Science - RAG in SQLite](https://towardsdatascience.com/retrieval-augmented-generation-in-sqlite) (Feb 2025)

### Setup Code

```python
import sqlite3
from sqlite_vec import serialize_float32
import sqlite_vec

# Load extension
db = sqlite3.connect('arxgorithm.db')
db.enable_load_extension(True)
sqlite_vec.load(db)
db.enable_load_extension(False)

# Create virtual table
db.execute('''
  CREATE VIRTUAL TABLE embeddings USING vec0(
    vector float[1024],
    +paper_id INTEGER,
    +title TEXT
  )
''')
db.commit()
```

### Insert Vectors

```python
embedding_vector = [0.123, -0.456, 0.789, ...]  # 1024 dims

db.execute('''
  INSERT INTO embeddings (vector, paper_id, title)
  VALUES (?, ?, ?)
''', (
  serialize_float32(embedding_vector),
  paper_id,
  title
))
db.commit()
```

### KNN Query

```python
query_vector = [0.1, -0.4, 0.8, ...]  # User profile vector

rows = db.execute('''
  SELECT paper_id, title, distance
  FROM embeddings
  WHERE vector MATCH ?
  ORDER BY distance
  LIMIT 10
''', [serialize_float32(query_vector)]).fetchall()

for paper_id, title, distance in rows:
    print(f"Paper {paper_id}: {title} (distance: {distance:.4f})")
```

**Key Insight**: Distance calculation is automatic in `WHERE vector MATCH ?`. Results are **sorted ascending by distance** (lower = more similar).

---

## 5. COSINE SIMILARITY IN RECOMMENDATIONS

### Why Cosine Similarity?

**Advantages:**
- ✅ Normalized (independent of vector magnitude)
- ✅ Geometrically intuitive (angle between vectors)
- ✅ Works well for high-dimensional embeddings (1024 dims)
- ✅ sqlite-vec has SIMD-accelerated implementation
- ✅ Industry standard for content-based filtering

**Formula**:
```
cos_similarity = (A · B) / (||A|| × ||B||)
distance = 1 - similarity   (or raw cosine distance in sqlite-vec)
```

### Cosine Similarity for Content-Based Filtering

**Pattern from**: [Building A News Article Recommendation System](https://medium.com/@martinhohoff/building-a-news-article-recommendation-system-bbc-dataset-embeddings-cosine-similarity-c8a22679c5ff) (Feb 2026)

```
1. Embed all papers: P1, P2, ..., Pn (1024-dim vectors)
2. User reads P1, P3, P7
3. Build user profile: avg(P1, P3, P7) = user_vector
4. Find papers similar to user_vector via cosine distance
5. Return top-k by lowest distance
```

**Empirical Result**: Cosine similarity on semantic embeddings captures meaning better than keyword matching.

---

## 6. INTERNAL REPO PATTERNS: HYBRID SEARCH RANKING

**Location**: `pile/src-tauri/src/search.rs:129-198`

**Relevant Pattern**: Ranking strategy for merging multiple search sources

```rust
fn ranked_contribution(index: usize, total: usize, weight: f64) -> f64 {
    if total == 0 { 0.0 } else { weight * ((total - index) as f64 / total as f64) }
}

// For each result source (vector, FTS, etc.):
// - Assign score based on rank position
// - Weight by importance (VECTOR_WEIGHT = 0.7, FTS_WEIGHT = 0.3)
// - Merge and sort by combined score
```

**Application to Task 9**:
- Vector similarity results are already ranked (by distance)
- Filter exclusions (already-read) happen in SQL WHERE clause
- Final sort: by distance (ascending)
- No need for complex ranking in V1 (pure cosine similarity)

---

## 7. COLD START PROBLEM (FALLBACK)

**Issue**: New users have no reading history → no user profile vector.

**Task 9 Solution** (per plan):
```
IF user has no reading history:
  RETURN recent_papers ORDER BY published_at DESC LIMIT k
ELSE:
  RETURN recommendations via cosine similarity
```

**Optional improvements** (Phase 2):
- Weighted by popularity (citation count)
- Trending papers (recently bookmarked)
- Category-based defaults

---

## 8. PERFORMANCE CONSIDERATIONS

### Vector Search Scalability

| Scale | Status | Notes |
|-------|--------|-------|
| <10k papers | ✅ Excellent | Sub-millisecond queries |
| 10k-100k | ✅ Good | 1-10ms per query (on-disk) |
| 100k-1M | ✅ Acceptable | 10-100ms (full scan) |
| >1M | ⚠️ Slow | Exact NN too slow; need approximate (Phase 2) |

**For arXgorithm** (<1000 concurrent users, growing arXiv): sqlite-vec is perfect.

### Query Optimization in sqlite-vec

**Metadata filtering** (v0.1.6+):
```sql
SELECT paper_id, distance
FROM embeddings
WHERE category = 'cs.AI'      -- Metadata filter
  AND vector MATCH ?
ORDER BY distance
LIMIT 10;
```

The metadata filter runs **before** distance calculation → faster.

---

## 9. EXTERNAL RESOURCES (HIGH-CONFIDENCE)

| Resource | Date | Relevance | URL |
|----------|------|-----------|-----|
| sqlite-vec GitHub | Mar 4, 2026 | Official docs, examples | https://github.com/asg017/sqlite-vec |
| How sqlite-vec Works | Mar 31, 2025 | Technical deep-dive, SIMD | https://medium.com/@stephenc211/how-sqlite-vec-works-for-storing-and-querying-vector-embeddings-165adeeeceea |
| RAG in SQLite | Feb 2025 | Practical KNN example | https://towardsdatascience.com/retrieval-augmented-generation-in-sqlite |
| News Article Recommendations | Feb 25, 2026 | Content-based filtering pattern | https://medium.com/@martinhohoff/building-a-news-article-recommendation-system-bbc-dataset-embeddings-cosine-similarity-c8a22679c5ff |
| Real-Time AI Recommendations | Feb 17, 2026 | Redis + embeddings strategy | https://redis.io/blog/real-time-ai-recommendation-systems |
| Content-Based Filtering Guide | Jul 8, 2025 | CBF fundamentals | https://www.shaped.ai/blog/content-based-filtering-explained-recommending-based-on-what-you-like |

---

## 10. TASK 9 ACCEPTANCE CRITERIA MAPPING

### Requirement → Implementation Approach

| Criterion | Solution | sqlite-vec Feature |
|-----------|----------|-------------------|
| `recommend(user_id, anonymous_id, categories, limit)` | Build user profile from reading_list | N/A |
| Build user profile: avg embedding of read papers | `np.mean(embeddings)` | N/A |
| Query sqlite-vec for top-k similar papers | `WHERE vector MATCH ?` | KNN virtual table |
| Filter by categories if specified | `WHERE category IN (...)` | Metadata filtering |
| Exclude already-read papers | `WHERE paper_id NOT IN (...)` | SQL WHERE clause |
| Fallback: recent popular papers if no history | `ORDER BY published_at DESC` | N/A |
| Test: recommendations are semantically similar | Compare embeddings manually | Verify distance values |

---

## 11. QUICK START CHECKLIST FOR IMPLEMENTATION

- [ ] Load sqlite-vec extension on app startup
- [ ] Ensure embeddings table uses virtual table `vec0` with `float[1024]` vector column
- [ ] Implement `build_user_profile()`: query reading_list, average embeddings
- [ ] Implement `recommend()`: 
  - [ ] Get user profile vector
  - [ ] Query `WHERE vector MATCH serialize_float32(profile) ORDER BY distance LIMIT k`
  - [ ] Apply category filter if specified
  - [ ] Exclude already-read papers
  - [ ] Return results with distance metadata
- [ ] Implement fallback: recent papers if user has no history
- [ ] Test with synthetic embeddings (verify distance ordering)
- [ ] Verify no regression in other endpoints

---

## 12. NOTES FOR IMPLEMENTER

**sqlite-vec Quirks:**
1. `serialize_float32()` is required for parameter binding; don't pass raw Python lists
2. Distance metric must match vector type (float32 vectors = L2/cosine available)
3. Virtual table metadata columns use `+` prefix; these don't affect vector calculations
4. Error messages are SQL-native; catch `sqlite3.OperationalError`

**Recommendation Logic:**
1. User profile = average of all embeddings (simple, effective for V1)
2. Cosine distance from sqlite-vec output is distance metric, not similarity
3. Lower distance = more similar (ORDER BY distance ASC)
4. Filtering happens in SQL, not Python (performance)

**Cold Start:**
- If reading_list is empty for user → return `ORDER BY published_at DESC`
- No collaborative filtering needed in V1

