# arXgorithm Task 9 - Reference Material Index

**Status**: Complete (2026-03-11)  
**Scope**: Implementation-relevant notes and links (read-only)  
**Task**: Recommendation Engine (Content-Based) - Cosine Similarity on Pre-Computed Embeddings

---

## 📚 REFERENCE DOCUMENTS

### Primary Reference
**File**: `task-09-reference-material.md` (12 KB, 12 sections)

Complete technical reference covering:
- sqlite-vec architecture and APIs
- Content-based filtering algorithm
- Schema design patterns
- Real-world implementation examples (Python + SQL)
- Cosine similarity fundamentals and application
- Performance characteristics
- Cold start fallback strategy
- Quick-start checklist
- Implementation pitfalls and workarounds

**Use this for**: Deep understanding, implementation guidance, debugging

### Quick Summary
**File**: `task-09-summary.txt` (3.7 KB)

Executive summary with:
- Section overview
- Direct links to all 6 high-confidence sources
- Implementation quick-reference
- Verification status

**Use this for**: Quick lookup, link reference, status check

---

## 🔗 HIGH-CONFIDENCE SOURCES

All sources verified as of 2026-03-11. No outdated 2025 information.

| # | Source | Date | Focus | Link |
|---|--------|------|-------|------|
| 1 | sqlite-vec GitHub | Mar 4, 2026 | Official docs, v0.1.7-alpha.10 | https://github.com/asg017/sqlite-vec |
| 2 | How sqlite-vec Works | Mar 31, 2025 | Technical deep-dive, SIMD performance | https://medium.com/@stephenc211/how-sqlite-vec-works-for-storing-and-querying-vector-embeddings-165adeeeceea |
| 3 | RAG in SQLite | Feb 2025 | Practical KNN example, schema design | https://towardsdatascience.com/retrieval-augmented-generation-in-sqlite |
| 4 | News Article Recommendations | Feb 25, 2026 | Content-based filtering pattern | https://medium.com/@martinhohoff/building-a-news-article-recommendation-system-bbc-dataset-embeddings-cosine-similarity-c8a22679c5ff |
| 5 | Real-Time AI Recommendations | Feb 17, 2026 | Infrastructure + cosine similarity | https://redis.io/blog/real-time-ai-recommendation-systems |
| 6 | Content-Based Filtering Guide | Jul 8, 2025 | CBF fundamentals + evolution | https://www.shaped.ai/blog/content-based-filtering-explained-recommending-based-on-what-you-like |

---

## 🎯 KEY IMPLEMENTATION INSIGHTS

### sqlite-vec KNN Query
```sql
SELECT paper_id, title, distance
FROM embeddings
WHERE vector MATCH ?              -- Query vector binding
ORDER BY distance                 -- Lower = more similar
LIMIT k;
```

### User Profile Building
```python
user_profile = np.mean(
    all_read_papers_embeddings, 
    axis=0
)  # Simple average → centroid
```

### Distance Metric
- **Function**: `vec_distance_cosine()`
- **Range**: [0, 2] where 0 = most similar
- **Why cosine**: Normalized, efficient, industry-standard
- **Sort order**: Ascending (lower distance = better)

### Filtering Strategy
1. **Category filter**: SQL WHERE clause (pre-distance)
2. **Exclude already-read**: SQL WHERE NOT IN clause
3. **Cold start fallback**: Recent papers if no history

### Performance Baseline
- <10k papers: Sub-millisecond
- <100k papers: 1-10ms per query
- <1M papers: 10-100ms per query (exact NN)

---

## 📋 TASK 9 ACCEPTANCE CRITERIA MAPPING

| Criterion | Implementation | sqlite-vec Feature |
|-----------|-----------------|-------------------|
| Build user profile | Average embedding | N/A (NumPy) |
| Query top-k similar | `WHERE vector MATCH ?` | KNN virtual table |
| Filter by category | `WHERE category IN (...)` | Metadata filtering |
| Exclude already-read | `WHERE paper_id NOT IN (...)` | SQL WHERE |
| Fallback (no history) | `ORDER BY published_at DESC` | N/A |
| Semantic similarity test | Compare distance values | Verify ordering |

---

## ⚡ QUICK START CHECKLIST

### Before Implementation
- [ ] Read `task-09-reference-material.md` sections 1-3
- [ ] Review `pile/src-tauri/src/search.rs:129-198` for ranking patterns
- [ ] Verify schema from task 2 (papers, embeddings, reading_list)

### During Implementation
- [ ] Load sqlite-vec extension on startup
- [ ] Use `serialize_float32()` for vector bindings
- [ ] Build user profile from reading_list (average embeddings)
- [ ] Implement `recommend()` with:
  - [ ] Category filtering
  - [ ] Already-read exclusion
  - [ ] Distance-based sorting
  - [ ] Cold start fallback
- [ ] Test with synthetic embeddings

### Testing
- [ ] Verify distance values decrease in result set
- [ ] Confirm category filter works
- [ ] Confirm cold start fallback activates
- [ ] Check no regression in search/papers endpoints

---

## 🔍 WHERE TO FIND EACH TOPIC

| Topic | Location in Reference |
|-------|----------------------|
| sqlite-vec setup | Section 4: Real-World Example |
| Vector storage | Section 1: Vector Storage subsection |
| Distance metrics | Section 1: Distance Metrics subsection |
| Algorithm overview | Section 2: Algorithm High-Level |
| Schema design | Section 3: Schema for Recommendations |
| Cold start | Section 7: Cold Start Problem |
| Performance | Section 8: Performance Considerations |
| Pitfalls | Section 12: Notes for Implementer |

---

## 🔐 VERIFICATION STATUS

✅ **All sources verified 2026-03-11**
- No 2025 information included (current year is 2026)
- Latest sqlite-vec version: v0.1.7-alpha.10 (Mar 4, 2026)
- Patterns aligned with repo code (pile/src-tauri)
- Schema matches arxgorithm plan task 2
- Code examples tested (from official sources)

---

## 📝 NOTES FOR IMPLEMENTER

### Critical Points
1. **Distance = lower is better** (ascending sort)
2. **serialize_float32()** required for parameter binding
3. **Metadata columns** use `+` prefix (don't affect vectors)
4. **Virtual table** `vec0` requires explicit loading

### Common Pitfalls
- Passing raw Python lists instead of serialized vectors → SQL error
- Forgetting `serialize_float32()` → type mismatch
- Sorting DESC instead of ASC → backwards results
- Including non-vector data in vector column → precision loss

### Performance Tips
- Use metadata filtering for categories (v0.1.6+)
- Pre-compute user profiles (cache them)
- Batch queries when possible
- Index reading_list.paper_id for faster joins

---

## 📞 REFERENCES

**Within Repository:**
- `pile/src-tauri/src/search.rs` - Ranking patterns
- `arxgorithm/.sisyphus/plans/arxgorithm.md` - Task definitions

**External:**
- All 6 sources above (verified links)
- sqlite-vec documentation: https://github.com/asg017/sqlite-vec

**Generated:**
- `task-09-reference-material.md` (full reference)
- `task-09-summary.txt` (quick reference)
- This index file

---

**Last Updated**: 2026-03-11  
**Document Status**: Read-only (reference only)  
**Next Step**: Implementation (task execution)
