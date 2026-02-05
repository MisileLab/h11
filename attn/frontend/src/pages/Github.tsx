import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';

export function GithubPage() {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ['githubStatus'],
    queryFn: api.getGithubStatus,
  });

  const generateMutation = useMutation({
    mutationFn: api.generateGithubKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['githubStatus'] });
    },
  });

  const handleCopy = () => {
    if (status?.public_key) {
      navigator.clipboard.writeText(status.public_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) return <div className="flex justify-center p-12"><Spinner /></div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">GitHub Integration</h1>
        <p className="text-slate-400 mt-1">Manage SSH keys for GitHub access in workspaces</p>
      </div>

      <Card className="space-y-6 p-6">
        {!status?.has_key ? (
          <div className="text-center py-8">
            <div className="mb-4 text-slate-300">
              No SSH key found. Generate one to enable GitHub integration.
            </div>
            <Button 
              onClick={() => generateMutation.mutate()} 
              isLoading={generateMutation.isPending}
            >
              Generate SSH Key
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor="ssh-key-display" className="block text-sm font-medium text-slate-300 mb-2">
                Your Public SSH Key
              </label>
              <div className="relative">
                <textarea
                  id="ssh-key-display"
                  readOnly
                  value={status.public_key || ''}
                  className="w-full h-32 p-3 bg-slate-900 border border-slate-700 rounded-md text-slate-300 font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  onClick={(e) => e.currentTarget.select()}
                />
                <div className="absolute top-2 right-2">
                  <Button size="sm" variant="secondary" onClick={handleCopy}>
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-md bg-slate-800 p-4 border border-slate-700">
              <h3 className="font-medium text-slate-200 mb-2">Setup Instructions</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-slate-400">
                <li>Copy the SSH key above</li>
                <li>
                  Go to <a href="https://github.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">GitHub SSH Keys settings</a>
                </li>
                <li>Click "New SSH key" and paste the key</li>
                <li>
                  In any workspace terminal, run:
                  <code className="block mt-1 bg-slate-950 p-2 rounded text-slate-300 font-mono">
                    gh auth login --git-protocol ssh
                  </code>
                </li>
              </ol>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
