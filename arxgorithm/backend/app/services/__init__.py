"""Services module for arXgorithm backend.

This module contains service implementations for external integrations:
- SummaryService: Gemini-based academic summary generation with caching
- IngestionService: Paper ingestion pipeline (arXiv -> embedding -> storage)
- ingest_papers: Module-level convenience function for paper ingestion
- RecommendationEngine: Content-based paper recommendation via vector similarity
- recommend: Module-level convenience function for recommendations
"""

from app.services.ingestion import IngestionService, ingest_papers
from app.services.recommendation import RecommendationEngine, recommend
from app.services.summary import SummaryService

__all__ = [
    "IngestionService",
    "RecommendationEngine",
    "SummaryService",
    "ingest_papers",
    "recommend",
]
