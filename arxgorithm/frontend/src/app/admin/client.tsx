'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';

interface IngestionStatus {
  running: boolean;
  last_run: string | null;
  categories: string[];
  citation_threshold: number;
  max_per_category: number;
  interval_hours: number;
}

interface TeiStatus {
  status: string;
  url: string | null;
  created_at: string | null;
}

export function AdminClient() {
  const [ingestionStatus, setIngestionStatus] = useState<IngestionStatus | null>(null);
  const [teiStatus, setTeiStatus] = useState<TeiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [startingTei, setStartingTei] = useState(false);
  const [stoppingTei, setStoppingTei] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ingestion, tei] = await Promise.all([
        api.get<IngestionStatus>('/api/admin/ingestion/status'),
        api.get<TeiStatus>('/api/admin/tei/status'),
      ]);
      setIngestionStatus(ingestion);
      setTeiStatus(tei);
      setForbidden(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setForbidden(true);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to fetch status');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const triggerIngestion = async () => {
    setTriggering(true);
    setError(null);
    try {
      await api.post('/api/admin/ingestion/trigger');
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger ingestion');
    } finally {
      setTriggering(false);
    }
  };

  const startTei = async () => {
    setStartingTei(true);
    setError(null);
    try {
      await api.post('/api/admin/tei/start');
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start TEI');
    } finally {
      setStartingTei(false);
    }
  };

  const stopTei = async () => {
    setStoppingTei(true);
    setError(null);
    try {
      await api.post('/api/admin/tei/stop');
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop TEI');
    } finally {
      setStoppingTei(false);
    }
  };

  if (forbidden) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-md">
          <h1 className="text-2xl font-bold text-red-700 mb-2">접근 거부</h1>
          <p className="text-red-600">
            관리자 이메일로 로그인해야 이 페이지에 접근할 수 있습니다.
          </p>
        </div>
      </div>
    );
  }

  if (loading && !ingestionStatus) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-10 bg-gray-200 rounded w-1/4 mb-8"></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-64 bg-gray-100 rounded-xl"></div>
            <div className="h-64 bg-gray-100 rounded-xl"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6 rounded-md">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Ingestion Pipeline</h2>

          {loading && !ingestionStatus ? (
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          ) : (
            <>
              <div className="space-y-3 mb-6">
                <div className="flex justify-between">
                  <span className="text-gray-600">Status</span>
                  <span className={`font-medium ${ingestionStatus?.running ? 'text-green-600' : 'text-gray-500'}`}>
                    {ingestionStatus?.running ? 'Running' : 'Idle'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Last Run</span>
                  <span className="text-gray-900">
                    {ingestionStatus?.last_run
                      ? new Date(ingestionStatus.last_run).toLocaleString()
                      : 'Never'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Citation Threshold</span>
                  <span className="text-gray-900">{ingestionStatus?.citation_threshold ?? 100}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Max Per Category</span>
                  <span className="text-gray-900">{ingestionStatus?.max_per_category ?? 50}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Interval</span>
                  <span className="text-gray-900">{ingestionStatus?.interval_hours ?? 6}h</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Categories</span>
                  <span className="text-gray-900">{ingestionStatus?.categories?.length ?? 0}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={triggerIngestion}
                disabled={triggering || ingestionStatus?.running}
                className={`w-full py-3 rounded-lg font-medium transition ${
                  triggering || ingestionStatus?.running
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {triggering ? 'Triggering...' : ingestionStatus?.running ? 'Running...' : 'Run Ingestion Now'}
              </button>
            </>
          )}
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4">TEI Embedding Instance</h2>

          {loading && !teiStatus ? (
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          ) : (
            <>
              <div className="space-y-3 mb-6">
                <div className="flex justify-between">
                  <span className="text-gray-600">Status</span>
                  <span className={`font-medium ${
                    teiStatus?.status === 'running' ? 'text-green-600' :
                    teiStatus?.status === 'stopped' ? 'text-gray-500' : 'text-yellow-600'
                  }`}>
                    {teiStatus?.status ?? 'unknown'}
                  </span>
                </div>
                {teiStatus?.url && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">URL</span>
                    <span className="text-gray-900 text-sm truncate max-w-[200px]">{teiStatus.url}</span>
                  </div>
                )}
                {teiStatus?.created_at && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Started</span>
                    <span className="text-gray-900">
                      {new Date(teiStatus.created_at).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={startTei}
                  disabled={startingTei || teiStatus?.status === 'running'}
                  className={`flex-1 py-3 rounded-lg font-medium transition ${
                    startingTei || teiStatus?.status === 'running'
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  {startingTei ? 'Starting...' : 'Start'}
                </button>
                <button
                  type="button"
                  onClick={stopTei}
                  disabled={stoppingTei || teiStatus?.status !== 'running'}
                  className={`flex-1 py-3 rounded-lg font-medium transition ${
                    stoppingTei || teiStatus?.status !== 'running'
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  {stoppingTei ? 'Stopping...' : 'Stop'}
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      <section className="mt-6 bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Categories</h2>
        {ingestionStatus?.categories ? (
          <div className="flex flex-wrap gap-2">
            {ingestionStatus.categories.map((cat) => (
              <span
                key={cat}
                className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
              >
                {cat}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No categories configured</p>
        )}
      </section>
    </div>
  );
}
