"""
Semantic Scholar API client for citation count lookup.

Provides batch paper lookup to get citation counts for arXiv papers.
Used to filter papers by citation threshold before ingestion.
"""

import asyncio
import logging
from typing import Any

from app.http_client import ExternalServiceError, HTTPClient

logger = logging.getLogger(__name__)

BASE_URL = "https://api.semanticscholar.org"


class SemanticScholarClient:
    """
    Semantic Scholar API client for citation enrichment.

    Features:
    - Batch lookup papers by arXiv ID (up to 500 per request)
    - Returns citation counts for filtering
    - Rate limit handling (1 RPS authenticated, 100/5min unauthenticated)
    """

    BATCH_SIZE = 500

    def __init__(self, http_client: HTTPClient, api_key: str | None = None):
        self.http_client = http_client
        self.api_key = api_key

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["x-api-key"] = self.api_key
        return headers

    async def get_citation_counts(self, arxiv_ids: list[str]) -> dict[str, int]:
        """
        Get citation counts for a list of arXiv IDs.

        Args:
            arxiv_ids: List of arXiv IDs (e.g., ["2401.12345", "2312.54321"])

        Returns:
            Dict mapping arxiv_id -> citation_count (0 if not found)
        """
        if not arxiv_ids:
            return {}

        results: dict[str, int] = {}

        for i in range(0, len(arxiv_ids), self.BATCH_SIZE):
            batch = arxiv_ids[i : i + self.BATCH_SIZE]
            batch_results = await self._batch_lookup(batch)
            results.update(batch_results)
            if i + self.BATCH_SIZE < len(arxiv_ids):
                await asyncio.sleep(1)

        return results

    async def _batch_lookup(self, arxiv_ids: list[str]) -> dict[str, int]:
        """
        Lookup a batch of papers by arXiv ID.

        Args:
            arxiv_ids: List of arXiv IDs (max 500)

        Returns:
            Dict mapping arxiv_id -> citation_count
        """
        url = f"{BASE_URL}/graph/v1/paper/batch"
        params = {"fields": "paperId,citationCount,externalIds"}

        payload = {"ids": [f"ARXIV:{arxiv_id}" for arxiv_id in arxiv_ids]}

        try:
            response = await self.http_client.post(
                url,
                json_data=payload,
                params=params,
                headers=self._headers(),
                service="SemanticScholar",
            )

            return self._parse_batch_response(response, arxiv_ids)

        except ExternalServiceError as e:
            logger.warning("Semantic Scholar batch lookup failed: %s", e.message)
            return {arxiv_id: 0 for arxiv_id in arxiv_ids}
        except Exception as e:
            logger.error("Unexpected error in Semantic Scholar lookup: %s", e)
            return {arxiv_id: 0 for arxiv_id in arxiv_ids}

    def _parse_batch_response(
        self, response: list[dict[str, Any]], arxiv_ids: list[str]
    ) -> dict[str, int]:
        """
        Parse batch response into citation count mapping.

        Args:
            response: List of paper objects from API
            arxiv_ids: Original arXiv IDs for fallback

        Returns:
            Dict mapping arxiv_id -> citation_count
        """
        results = {arxiv_id: 0 for arxiv_id in arxiv_ids}

        for paper in response:
            if not paper:
                continue

            external_ids = paper.get("externalIds", {})
            arxiv_id = external_ids.get("ArXiv") if external_ids else None

            if arxiv_id and arxiv_id in results:
                results[arxiv_id] = paper.get("citationCount", 0)

        return results
