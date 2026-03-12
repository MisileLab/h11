'use client';

import React from 'react';
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
      <div className="w-full p-6 bg-white border border-gray-200 rounded-lg text-center">
        <p className="text-gray-500">No recommendations available at this time.</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <h2 className="text-2xl font-bold tracking-tight text-gray-900 mb-6">
        {hasHistory ? 'Based on your reading history' : 'Popular papers'}
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