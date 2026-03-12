import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Paper } from '@/types/search';

interface ReadingListResponse {
  papers: Array<{
    arxiv_id: string;
    saved_at?: string | number;
  } & Partial<Paper>>;
  count?: number;
}

interface RecommendationsResponse {
  papers?: Paper[];
  [key: string]: unknown;
}

export function useRecommendations() {
  const [recommendations, setRecommendations] = useState<Paper[]>([]);
  const [savedPaperIds, setSavedPaperIds] = useState<Set<string>>(new Set());
  const [hasHistory, setHasHistory] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rlData = await api.get<ReadingListResponse>('/api/reading-list');
      const savedIds = new Set(rlData.papers.map((p) => p.arxiv_id));
      setSavedPaperIds(savedIds);
      setHasHistory(rlData.papers.length > 0);

      const recsData = await api.get<RecommendationsResponse | Paper[]>('/api/recommendations');
      const papers = Array.isArray(recsData) ? recsData : (recsData.papers || []);
      
      setRecommendations(papers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleSave = useCallback(async (e: React.MouseEvent, paper: Paper) => {
    e.preventDefault();
    e.stopPropagation();

    const isSaved = savedPaperIds.has(paper.arxiv_id);

    setSavedPaperIds((prev) => {
      const next = new Set(prev);
      if (isSaved) {
        next.delete(paper.arxiv_id);
      } else {
        next.add(paper.arxiv_id);
      }
      return next;
    });

    try {
      if (isSaved) {
        await api.delete(`/api/reading-list/${paper.arxiv_id}`);
      } else {
        await api.post(`/api/reading-list/${paper.arxiv_id}`);
      }
    } catch (err) {
      setSavedPaperIds((prev) => {
        const next = new Set(prev);
        if (isSaved) {
          next.add(paper.arxiv_id);
        } else {
          next.delete(paper.arxiv_id);
        }
        return next;
      });
      console.error('Failed to toggle save:', err);
    }
  }, [savedPaperIds]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  return {
    recommendations,
    savedPaperIds,
    hasHistory,
    loading,
    error,
    toggleSave,
  };
}
