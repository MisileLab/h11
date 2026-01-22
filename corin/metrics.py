from __future__ import annotations

from typing import Dict

import numpy as np

from compressor import l2_normalize


def topk_cosine_indices(
    embeddings: np.ndarray,
    k: int,
    batch_size: int = 256,
) -> np.ndarray:
    if k <= 0:
        raise ValueError("k must be positive")
    normalized = l2_normalize(embeddings)
    num_items = normalized.shape[0]
    topk = np.empty((num_items, k), dtype=np.int64)
    for start in range(0, num_items, batch_size):
        end = min(start + batch_size, num_items)
        block = normalized[start:end]
        scores = block @ normalized.T
        for idx in range(start, end):
            scores[idx - start, idx] = -np.inf
        candidates = np.argpartition(-scores, kth=k, axis=1)[:, :k]
        row_ids = np.arange(candidates.shape[0])[:, None]
        ordered = np.argsort(-scores[row_ids, candidates], axis=1)
        topk[start:end] = candidates[row_ids, ordered]
    return topk


def recall_at_k(teacher_topk: np.ndarray, student_topk: np.ndarray) -> float:
    overlaps = [
        len(set(teacher_topk[i]).intersection(student_topk[i]))
        for i in range(teacher_topk.shape[0])
    ]
    return float(np.mean(overlaps) / teacher_topk.shape[1])


def ndcg_at_k(teacher_topk: np.ndarray, student_topk: np.ndarray) -> float:
    k = teacher_topk.shape[1]
    discounts = 1.0 / np.log2(np.arange(2, k + 2))
    ideal = float(discounts.sum())
    scores = []
    for i in range(teacher_topk.shape[0]):
        teacher_set = set(teacher_topk[i])
        rel = np.array([1.0 if idx in teacher_set else 0.0 for idx in student_topk[i]])
        scores.append(float((rel * discounts).sum() / ideal))
    return float(np.mean(scores))


def neighbor_overlap_at_k(teacher_topk: np.ndarray, student_topk: np.ndarray) -> float:
    overlaps = []
    for i in range(teacher_topk.shape[0]):
        teacher_set = set(teacher_topk[i])
        student_set = set(student_topk[i])
        union = teacher_set.union(student_set)
        overlaps.append(len(teacher_set.intersection(student_set)) / max(len(union), 1))
    return float(np.mean(overlaps))


def compute_metrics(
    teacher_topk: np.ndarray, student_topk: np.ndarray
) -> Dict[str, float]:
    return {
        "recall@k": recall_at_k(teacher_topk, student_topk),
        "ndcg@k": ndcg_at_k(teacher_topk, student_topk),
        "neighbor_overlap@k": neighbor_overlap_at_k(teacher_topk, student_topk),
    }
