'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { SearchResponse } from '@/types/search';
import { SearchInput } from '@/components/search/search-input';
import { CategoryFilter } from '@/components/search/category-filter';
import { PaperCard } from '@/components/paper-card';
import { useDebounce } from '@/hooks/use-debounce';

interface SearchPageClientProps {
  initialQuery?: string;
}

export function SearchPageClient({ initialQuery = '' }: SearchPageClientProps) {
  const [query, setQuery] = useState(initialQuery);
  const debouncedQuery = useDebounce(query, 300);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const { data, isLoading, isError, error } = useQuery<SearchResponse, ApiError>({
    queryKey: ['search', debouncedQuery, categories],
    queryFn: () => {
      const params: Record<string, string> = { q: debouncedQuery, limit: '20' };
      if (categories.length > 0) {
        params.categories = categories.join(',');
      }
      return api.get<SearchResponse>('/api/search', { params });
    },
    enabled: debouncedQuery.trim().length > 0,
    retry: false,
  });

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1 flex flex-col">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Search Papers</h1>
        <div className="space-y-6 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <SearchInput value={query} onChange={setQuery} />
          <CategoryFilter selectedCategories={categories} onChange={setCategories} />
        </div>
      </div>

      <div className="flex-1">
        {isLoading && (
          <div className="flex justify-center items-center py-12" data-testid="search-loading">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        )}

        {isError && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-md" data-testid="search-error">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error fetching results</h3>
                <p className="mt-2 text-sm text-red-700">
                  {error?.message || 'Something went wrong. Please try again later.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {!isLoading && !isError && debouncedQuery.trim() === '' && (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200 border-dashed">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h3 className="mt-2 text-sm font-semibold text-gray-900">Start searching</h3>
            <p className="mt-1 text-sm text-gray-500">Enter a keyword to search for arXiv papers.</p>
          </div>
        )}

        {!isLoading && !isError && data && data.papers.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200" data-testid="search-empty">
            <h3 className="text-sm font-semibold text-gray-900">No results found</h3>
            <p className="mt-1 text-sm text-gray-500">
              Try adjusting your search or filters. If this is a brand-new topic, wait a moment and search again while the cache warms up.
            </p>
          </div>
        )}

        {!isLoading && !isError && data && data.papers.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="search-results">
            {data.papers.map((paper) => (
              <PaperCard key={paper.arxiv_id} paper={paper} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
