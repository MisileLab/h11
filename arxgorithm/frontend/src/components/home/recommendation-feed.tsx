'use client';

import Link from 'next/link';
import { PaperCard } from '@/components/paper-card';
import { useRecommendations } from '@/hooks/use-recommendations';

export function RecommendationFeed() {
  const {
    recommendations,
    savedPaperIds,
    hasHistory,
    loading,
    error,
    toggleSave,
  } = useRecommendations();

  if (loading) {
    return (
      <div className="w-full space-y-6">
        <div className="h-8 w-64 bg-gray-200 rounded animate-pulse mb-6"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-64 bg-white border border-gray-200 rounded-xl animate-pulse">
              <div className="p-5 h-full flex flex-col">
                <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-6"></div>
                <div className="space-y-2 mb-4">
                  <div className="h-4 bg-gray-200 rounded w-full"></div>
                  <div className="h-4 bg-gray-200 rounded w-full"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                </div>
                <div className="mt-auto flex gap-2">
                  <div className="h-6 bg-gray-200 rounded w-16"></div>
                  <div className="h-6 bg-gray-200 rounded w-16"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full p-6 bg-red-50 border border-red-200 rounded-lg text-center">
        <p className="text-red-600 mb-2">Failed to load recommendations</p>
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="w-full rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">
          {hasHistory ? 'Your recommendations need more source papers' : 'Search to start building recommendations'}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-gray-600">
          {hasHistory
            ? 'We only recommend from papers that have already been searched and embedded. Search for more papers, then save the ones you like to strengthen your reading profile.'
            : 'Recommendations are generated from papers you search and save. Start with a topic search, then add a few papers to your reading list to personalize the feed.'}
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/search"
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            Search papers
          </Link>
          <Link
            href="/reading-list"
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 transition hover:border-gray-400 hover:bg-gray-50"
          >
            Open reading list
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <h2 className="text-2xl font-bold tracking-tight text-gray-900 mb-6">
        {hasHistory ? 'Based on your reading history' : 'Recent papers'}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {recommendations.map((paper) => (
          <PaperCard
            key={paper.arxiv_id}
            paper={paper}
            isSaved={savedPaperIds.has(paper.arxiv_id)}
            onToggleSave={toggleSave}
          />
        ))}
      </div>
    </div>
  );
}
