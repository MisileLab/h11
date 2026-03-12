'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { PaperCard } from '@/components/paper-card';
import { Paper } from '@/types/search';

interface ReadingListPaper extends Paper {
  saved_at: number;
}

interface ReadingListResponse {
  papers: ReadingListPaper[];
  count: number;
}

export function ReadingListClient() {
  const [papers, setPapers] = useState<ReadingListPaper[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReadingList = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await api.get<ReadingListResponse>('/api/reading-list');
      setPapers(res.papers);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch reading list:', err);
      setError('Failed to load your reading list. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReadingList();
  }, [fetchReadingList]);

  const handleRemove = async (e: React.MouseEvent, paper: Paper) => {
    e.preventDefault(); // Prevent navigating to paper detail
    
    // Optimistic UI update
    const previousPapers = [...papers];
    setPapers(papers.filter(p => p.arxiv_id !== paper.arxiv_id));
    
    try {
      await api.delete(`/api/reading-list/${paper.arxiv_id}`);
    } catch (err) {
      console.error('Failed to remove paper:', err);
      // Revert on failure
      setPapers(previousPapers);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full" data-testid="reading-list-loading">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Reading List</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={`skeleton-${i}`} className="animate-pulse flex flex-col h-[280px] p-5 bg-white border border-gray-100 rounded-xl shadow-sm">
              <div className="flex-1">
                <div className="h-6 bg-gray-200 rounded w-3/4 mb-3"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
                <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-2/3"></div>
              </div>
              <div className="mt-auto flex gap-2">
                <div className="h-6 bg-gray-200 rounded w-16"></div>
                <div className="h-6 bg-gray-200 rounded w-16"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full" data-testid="reading-list-error">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Reading List</h1>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button 
            type="button"
            onClick={fetchReadingList}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full" data-testid="reading-list-container">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Reading List</h1>
          <p className="text-gray-600">
            {papers.length} {papers.length === 1 ? 'paper' : 'papers'} saved
          </p>
        </div>
      </div>

      {papers.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-12 text-center" data-testid="reading-list-empty">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="empty-reading-list-icon">
              <title id="empty-reading-list-icon">Empty Reading List</title>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Your reading list is empty</h2>
          <p className="text-gray-600 max-w-md mx-auto mb-6">
            Papers you save will appear here. Start exploring to find interesting research to read later.
          </p>
          <a 
            href="/"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:pointer-events-none disabled:opacity-50 h-10 px-6 py-2 bg-blue-600 text-white hover:bg-blue-700"
          >
            Explore Papers
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="reading-list-populated">
          {papers.map((paper) => (
            <div key={paper.arxiv_id} className="h-full relative" data-testid="reading-list-item">
              <PaperCard 
                paper={paper} 
                isSaved={true}
                onToggleSave={handleRemove}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
