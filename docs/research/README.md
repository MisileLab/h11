# Research Documentation

This directory contains research papers, design documents, and analysis for Lapis VCS and related architectural patterns.

## Contents

### Lapis VCS: Architecture Risk Mitigation
**File**: `lapis_vcs_risk_mitigation.md`

Comprehensive analysis of production failure modes and edge cases for a block-level VCS system using:
- fastcdc (content-defined chunking)
- BLAKE3 (content-addressed hashing)
- qbsdiff (delta compression)
- SQLite (metadata with single-writer pattern)
- Cross-repo deduplication with server-coordinated refcounts

#### Key Sections

1. **fastcdc Streaming & Memory Pressure** – Handling 10GB+ files without OOM
2. **BLAKE3 Collision Probability** – Negligible risk; focus engineering elsewhere
3. **qbsdiff Limitations** – 2GB practical ceiling; fallback to chunking for larger files
4. **SQLite Single-Writer Contention** – 20–100x performance improvement with single-writer queue
5. **Cross-Repo Refcount Races** – Mark-and-sweep GC safer than reference counting
6. **Generation-Based GC Failure Modes** – Physical GC scales better than logical enumeration
7. **Resumable Transfer Journal Corruption** – WAL-pattern journal with atomic writes
8. **Production Issues from Similar Systems** – Lessons from git-lfs, git-annex, DVC, Perforce

#### Deliverables

- **Component-by-Component Risk Map** – Risk assessment for all 8 core components
- **Failure Mode Playbooks** – Recovery procedures for 5 critical failure scenarios
- **Performance Tuning Guide** – Configuration templates for production deployment
- **Testing Matrix** – 9 critical test scenarios with pass criteria

#### Research Sources

- arXiv 2409.06066: CDC Algorithm Comparison (IEEE TPDS 2024)
- arXiv 2509.11121: Chonkers CDC with Strict Size/Locality Guarantees (2025)
- USENIX FAST'17: Data Domain Physical GC Study
- Production Issues: git-lfs, git-annex, DVC, Perforce

---

**Date**: March 7, 2026  
**Status**: Complete (Synthesis Phase)  
**Next Steps**: Implementation or deeper analysis of specific components
