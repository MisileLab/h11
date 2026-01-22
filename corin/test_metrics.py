import numpy as np

from metrics import compute_metrics


def test_metrics_perfect_match() -> None:
    teacher = np.array([[1, 2, 3], [0, 2, 3]])
    student = np.array([[1, 2, 3], [0, 2, 3]])
    metrics = compute_metrics(teacher, student)
    assert metrics["recall@k"] == 1.0
    assert metrics["ndcg@k"] == 1.0
    assert metrics["neighbor_overlap@k"] == 1.0


def test_metrics_partial_overlap() -> None:
    teacher = np.array([[1, 2, 3]])
    student = np.array([[1, 4, 5]])
    metrics = compute_metrics(teacher, student)
    assert metrics["recall@k"] == 1 / 3
    assert metrics["neighbor_overlap@k"] == 1 / 5
