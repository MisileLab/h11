import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';

export function WorkspacePR({ workspaceId }: { workspaceId: string }) {
  const [activeTab, setActiveTab] = useState<'review' | 'create'>('review');

  // Review State
  const [prUrl, setPrUrl] = useState('');
  const [reviewResult, setReviewResult] = useState<any>(null);

  // Create State
  const [createData, setCreateData] = useState({
    title: '',
    body: '',
    base: 'main',
    head: ''
  });
  const [createdPrUrl, setCreatedPrUrl] = useState('');

  const reviewMutation = useMutation({
    mutationFn: (data: { pr_url: string }) => api.reviewPr(workspaceId, data),
    onSuccess: (data) => setReviewResult(data),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof createData) => api.createPr(workspaceId, data),
    onSuccess: (data) => setCreatedPrUrl(data.pr_url),
  });

  const handleReview = (e: React.FormEvent) => {
    e.preventDefault();
    reviewMutation.mutate({ pr_url: prUrl });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(createData);
  };

  return (
    <div className="h-full overflow-y-auto p-4 max-w-4xl mx-auto">
      <div className="flex space-x-4 mb-6 border-b border-slate-700">
        <button
          type="button"
          className={`pb-2 px-1 text-sm font-medium transition-colors ${
            activeTab === 'review' 
              ? 'border-b-2 border-indigo-500 text-indigo-400' 
              : 'text-slate-400 hover:text-slate-200'
          }`}
          onClick={() => setActiveTab('review')}
        >
          Review PR
        </button>
        <button
          type="button"
          className={`pb-2 px-1 text-sm font-medium transition-colors ${
            activeTab === 'create' 
              ? 'border-b-2 border-indigo-500 text-indigo-400' 
              : 'text-slate-400 hover:text-slate-200'
          }`}
          onClick={() => setActiveTab('create')}
        >
          Create PR
        </button>
      </div>

      {activeTab === 'review' ? (
        <Card title="AI Pull Request Review" description="Get an automated review for any PR">
          <form onSubmit={handleReview} className="space-y-4 mt-4">
            <Input
              label="PR URL or Number"
              placeholder="https://github.com/owner/repo/pull/123"
              value={prUrl}
              onChange={(e) => setPrUrl(e.target.value)}
              required
            />
            <Button type="submit" isLoading={reviewMutation.isPending}>
              Start Review
            </Button>
          </form>

          {reviewResult && (
            <div className="mt-6 space-y-4 border-t border-slate-700 pt-4">
              <h4 className="font-medium text-slate-200">Review Results</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-800 rounded-lg">
                  <div className="text-xs text-slate-400">Summary Posted</div>
                  <div className="mt-1">
                    {reviewResult.summary_posted ? (
                      <Badge variant="success">Success</Badge>
                    ) : (
                      <Badge variant="error">Failed</Badge>
                    )}
                  </div>
                </div>
                <div className="p-3 bg-slate-800 rounded-lg">
                  <div className="text-xs text-slate-400">Inline Comments</div>
                  <div className="mt-1 font-mono text-lg">{reviewResult.comments_posted}</div>
                </div>
              </div>
              {reviewResult.errors?.length > 0 && (
                <div className="p-3 bg-red-900/20 border border-red-900/50 rounded-lg">
                  <div className="text-xs text-red-400 mb-1">Errors</div>
                  <ul className="list-disc list-inside text-sm text-red-300">
                    {reviewResult.errors.map((err: string, i: number) => (
                      <li key={`error-${i}-${err.substring(0, 10)}`}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>
      ) : (
        <Card title="Create Pull Request" description="Create a new PR from current changes">
          <form onSubmit={handleCreate} className="space-y-4 mt-4">
            <Input
              label="Title"
              value={createData.title}
              onChange={(e) => setCreateData({ ...createData, title: e.target.value })}
              required
            />
            <Textarea
              label="Body"
              value={createData.body}
              onChange={(e) => setCreateData({ ...createData, body: e.target.value })}
              required
              rows={4}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Base Branch"
                value={createData.base}
                onChange={(e) => setCreateData({ ...createData, base: e.target.value })}
                required
              />
              <Input
                label="Head Branch"
                value={createData.head}
                onChange={(e) => setCreateData({ ...createData, head: e.target.value })}
                placeholder="feature/my-branch"
                required
              />
            </div>
            <Button type="submit" isLoading={createMutation.isPending}>
              Create PR
            </Button>
          </form>

          {createdPrUrl && (
            <div className="mt-6 p-4 bg-green-900/20 border border-green-900/50 rounded-lg">
              <p className="text-green-400">PR Created Successfully!</p>
              <a 
                href={createdPrUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-indigo-400 hover:underline mt-1 block"
              >
                {createdPrUrl}
              </a>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
