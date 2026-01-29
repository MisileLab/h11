import unittest
from typing import cast

from app.llm import _extract_usage, _normalize_speaker
from app.tasks import (
    _compute_stt_cost,
    _iter_clip_parts,
    _remap_segment_times,
    _window_has_existing_segments,
)


class DummyResponse:
    def __init__(self, usage: dict | None) -> None:
        self.usage = usage


class DummySegment:
    def __init__(self, start_ms: int, end_ms: int) -> None:
        self.start_ms = start_ms
        self.end_ms = end_ms


class TranscriptionUtilsTests(unittest.TestCase):
    def test_iter_clip_parts_splits(self) -> None:
        parts = _iter_clip_parts(1000, 400)
        self.assertEqual(parts, [(0, 400), (400, 800), (800, 1000)])

    def test_remap_segment_times(self) -> None:
        start_ms, end_ms = _remap_segment_times(1200, 100, 250)
        self.assertEqual(start_ms, 1300)
        self.assertEqual(end_ms, 1450)

    def test_compute_stt_cost(self) -> None:
        cost = _compute_stt_cost(1000, 500, 2000, 2.5, 10.0)
        expected = ((1000 + 500) * 2.5 + 2000 * 10.0) / 1_000_000
        self.assertAlmostEqual(cost, expected, places=9)

    def test_normalize_speaker(self) -> None:
        self.assertEqual(_normalize_speaker("Speaker 2"), "spk_2")
        self.assertEqual(_normalize_speaker("spk_3"), "spk_3")
        self.assertEqual(_normalize_speaker(None), None)

    def test_extract_usage(self) -> None:
        usage_payload = {
            "input_token_details": {"audio_tokens": 12, "text_tokens": 3},
            "output_tokens": 7,
        }
        usage = _extract_usage(DummyResponse(usage_payload))
        self.assertIsNotNone(usage)
        assert usage is not None
        self.assertEqual(usage.audio_tokens, 12)
        self.assertEqual(usage.text_tokens, 3)
        self.assertEqual(usage.output_tokens, 7)

    def test_window_has_existing_segments(self) -> None:
        segments = [DummySegment(100, 200), DummySegment(400, 500)]
        typed_segments = cast(list, segments)
        self.assertTrue(_window_has_existing_segments(typed_segments, 50, 250))
        self.assertFalse(_window_has_existing_segments(typed_segments, 250, 350))


if __name__ == "__main__":
    unittest.main()
