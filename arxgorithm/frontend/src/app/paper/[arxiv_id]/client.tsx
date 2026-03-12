'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';
import { Paper } from '@/types/search';

interface PaperDetailResponse {
  paper: Paper;
}

interface ReadingListResponse {
  papers: Array<{
    arxiv_id: string;
    saved_at?: string | number;
  } & Partial<Paper>>;
  count?: number;
}

export function PaperDetailClient({ arxivId }: { arxivId: string }) {
  const [paper, setPaper] = useState<Paper | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  const fetchPaperAndStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      const [paperRes, readingListRes] = await Promise.all([
        api.get<PaperDetailResponse>(`/api/papers/${arxivId}`),
        api.get<ReadingListResponse>('/api/reading-list')
      ]);
      
      setPaper(paperRes.paper);
      setIsSaved(readingListRes.papers.some(p => p.arxiv_id === arxivId));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("Paper not found.");
      } else {
        setError("Failed to load paper details.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [arxivId]);

  useEffect(() => {
    fetchPaperAndStatus();
  }, [fetchPaperAndStatus]);

  useEffect(() => {
    // Polling for summary if it is generating
    let intervalId: NodeJS.Timeout;
    
    if (isGeneratingSummary) {
      intervalId = setInterval(async () => {
        try {
          const res = await api.get<PaperDetailResponse>(`/api/papers/${arxivId}`);
          if (res.paper.summary) {
            setPaper(res.paper);
            setIsGeneratingSummary(false);
          }
        } catch (err) {
          console.error("Failed to poll summary:", err);
        }
      }, 3000);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isGeneratingSummary, arxivId]);

  const toggleSave = async () => {
    if (isSaving) return;
    
    setIsSaving(true);
    const newSavedState = !isSaved;
    
    // Optimistic update
    setIsSaved(newSavedState);
    
    try {
      if (newSavedState) {
        await api.post(`/api/reading-list/${arxivId}`);
      } else {
        await api.delete(`/api/reading-list/${arxivId}`);
      }
    } catch (err) {
      // Revert on failure
      setIsSaved(!newSavedState);
      console.error("Failed to toggle save:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (isGeneratingSummary) return;
    
    setIsGeneratingSummary(true);
    try {
      await api.post(`/api/papers/${arxivId}/summarize`);
    } catch (err) {
      console.error("Failed to trigger summary generation:", err);
      setIsGeneratingSummary(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20 min-h-[50vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !paper) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Error</h2>
        <p className="text-gray-600">{error || "Paper not found."}</p>
      </div>
    );
  }

  const publishedDate = new Date(paper.published_at * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full flex-1">
      <div className="mb-8">
        <div className="flex flex-wrap gap-2 mb-4">
          {paper.categories.map((cat) => (
            <span 
              key={cat} 
              className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1 text-sm font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10"
            >
              {cat}
            </span>
          ))}
        </div>
        
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4 leading-tight">
          {paper.title}
        </h1>
        
        <div className="text-lg text-gray-700 mb-6">
          {paper.authors.join(', ')}
        </div>
        
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-8 border-b border-gray-200 pb-6">
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            {publishedDate}
          </span>
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            arXiv: {paper.arxiv_id}
          </span>
          
          <div className="flex-1"></div>
          
          <div className="flex gap-3">
            <a 
              href={paper.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:pointer-events-none disabled:opacity-50 border border-gray-200 bg-white hover:bg-gray-100 text-gray-900 h-10 px-4 py-2"
            >
              <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              View PDF
            </a>
            
            <button
              onClick={toggleSave}
              disabled={isSaving}
              className={`inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 ${
                isSaved 
                  ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200' 
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 24 24" 
                fill={isSaved ? "currentColor" : "none"}
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className="mr-2 h-4 w-4"
              >
                <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
              </svg>
              {isSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      <div className="mb-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Abstract</h2>
        <div className="prose max-w-none text-gray-700 leading-relaxed bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          {paper.abstract}
        </div>
      </div>

      <div className="mb-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">AI Summary</h2>
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 p-6 rounded-xl border border-blue-100 shadow-sm">
          {paper.summary ? (
            <div className="prose max-w-none text-gray-800 leading-relaxed whitespace-pre-wrap">
              {paper.summary}
            </div>
          ) : (
            <div className="text-center py-6">
              {isGeneratingSummary ? (
                <div className="flex flex-col items-center justify-center space-y-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="text-blue-800 font-medium">Generating AI summary...</p>
                  <p className="text-sm text-blue-600/80">This usually takes about 10-20 seconds.</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center space-y-4">
                  <p className="text-gray-600">No summary available for this paper yet.</p>
                  <button
                    onClick={handleGenerateSummary}
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 bg-blue-600 text-white hover:bg-blue-700 h-10 px-6 py-2 shadow-sm"
                  >
                    <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    Generate Summary
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
