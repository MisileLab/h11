'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/lib/auth';
import { Header } from '@/components/layout/Header';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Search, Clock, FileText } from 'lucide-react';
import { api } from '@/lib/api';

interface SearchResult {
  meeting_id: number;
  meeting_title: string;
  meeting_date: string;
  segment_id: number | null;
  text: string;
  start_sec: number | null;
  end_sec: number | null;
  score: number;
  relevance_type: string;
}

export default function SearchPage() {
  const { isAuthenticated, isLoading: authLoading } = useRequireAuth();
  const router = useRouter();
  
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<'fulltext' | 'vector' | 'hybrid'>('hybrid');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const formatTimestamp = (seconds: number | null): string => {
    if (seconds === null) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const highlightText = (text: string, query: string): string => {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<mark class="bg-yellow-200">$1</mark>');
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setError(null);
    setHasSearched(true);

    try {
      const response = await api.search.search({
        query: query.trim(),
        search_type: searchType,
        limit: 20,
      });
      setResults(response.data.results);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Search failed. Please try again.');
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleResultClick = (result: SearchResult) => {
    const timestamp = result.start_sec ? `?t=${Math.floor(result.start_sec)}` : '';
    router.push(`/meetings/${result.meeting_id}${timestamp}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Search Meetings</h1>

          <form onSubmit={handleSearch} className="mb-8">
            <div className="flex gap-2 mb-4">
              <Input
                placeholder="Search transcripts..."
                className="flex-1"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Button type="submit" disabled={isSearching || !query.trim()}>
                <Search className="h-4 w-4 mr-2" />
                {isSearching ? 'Searching...' : 'Search'}
              </Button>
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="searchType"
                  value="fulltext"
                  checked={searchType === 'fulltext'}
                  onChange={(e) => setSearchType(e.target.value as any)}
                  className="w-4 h-4"
                />
                <span className="text-sm">Full-text (fast)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="searchType"
                  value="vector"
                  checked={searchType === 'vector'}
                  onChange={(e) => setSearchType(e.target.value as any)}
                  className="w-4 h-4"
                />
                <span className="text-sm">Semantic (context-aware)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="searchType"
                  value="hybrid"
                  checked={searchType === 'hybrid'}
                  onChange={(e) => setSearchType(e.target.value as any)}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">Hybrid (recommended)</span>
              </label>
            </div>
          </form>

          {error && (
            <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          {isSearching && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Searching...</p>
            </div>
          )}

          {!isSearching && hasSearched && results.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No results found</p>
              <p className="text-sm">Try different keywords or search type</p>
            </div>
          )}

          {!isSearching && !hasSearched && (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Enter a query to search across all meetings</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground mb-4">
                Found {results.length} results
              </p>
              {results.map((result, index) => (
                <button
                  key={`${result.meeting_id}-${result.segment_id}-${index}`}
                  type="button"
                  onClick={() => handleResultClick(result)}
                  className="w-full text-left p-4 border border-border rounded-lg hover:bg-accent hover:border-accent-foreground transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-medium text-lg mb-1">{result.meeting_title}</h3>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {result.meeting_date}
                        </span>
                        {result.start_sec !== null && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTimestamp(result.start_sec)}
                          </span>
                        )}
                        <span className="px-2 py-0.5 bg-secondary text-secondary-foreground text-xs rounded">
                          {result.relevance_type}
                        </span>
                        <span className="text-xs">
                          Score: {(result.score * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-foreground line-clamp-3">
                    {result.text}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
