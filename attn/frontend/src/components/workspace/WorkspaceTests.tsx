import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Card } from '../ui/Card';
import { Spinner } from '../ui/Spinner';

export function WorkspaceTests({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const [testCmd, setTestCmd] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const { data: config } = useQuery({
    queryKey: ['testConfig', workspaceId],
    queryFn: async () => {
      const data = await api.getTestConfig(workspaceId);
      setTestCmd(data.command);
      return data;
    },
  });

  const { data: artifacts, isLoading: artifactsLoading } = useQuery({
    queryKey: ['artifacts', workspaceId],
    queryFn: () => api.getArtifacts(workspaceId),
  });

  const configMutation = useMutation({
    mutationFn: (command: string) => api.updateTestConfig(workspaceId, { command }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testConfig', workspaceId] });
      setIsEditing(false);
    },
  });

  const runMutation = useMutation({
    mutationFn: () => api.runTests(workspaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artifacts', workspaceId] });
    },
  });

  return (
    <div className="h-full overflow-y-auto p-4 max-w-4xl mx-auto space-y-6">
      <Card title="Test Configuration">
        <div className="mt-4 flex gap-2">
          <Input
            value={testCmd}
            onChange={(e) => setTestCmd(e.target.value)}
            disabled={!isEditing}
            placeholder="e.g., npm test, pytest, cargo test"
            className="font-mono"
          />
          {isEditing ? (
            <>
              <Button 
                onClick={() => configMutation.mutate(testCmd)}
                isLoading={configMutation.isPending}
              >
                Save
              </Button>
              <Button variant="ghost" onClick={() => {
                setTestCmd(config?.command || '');
                setIsEditing(false);
              }}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setIsEditing(true)}>
              Edit
            </Button>
          )}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button 
          size="lg" 
          onClick={() => runMutation.mutate()}
          isLoading={runMutation.isPending}
        >
          Run Tests
        </Button>
      </div>

      {runMutation.data && (
        <Card title="Last Run Result">
          <div className="mt-4 bg-slate-950 p-4 rounded-md font-mono text-sm overflow-x-auto">
            <div className={`mb-2 font-bold ${runMutation.data.exit_code === 0 ? 'text-green-400' : 'text-red-400'}`}>
              Exit Code: {runMutation.data.exit_code}
            </div>
            <pre className="text-slate-300 whitespace-pre-wrap">{runMutation.data.output}</pre>
          </div>
        </Card>
      )}

      <Card title="Artifacts" description="Download logs and reports from test runs">
        <div className="mt-4">
          {artifactsLoading ? (
            <div className="p-4 flex justify-center"><Spinner /></div>
          ) : artifacts?.length === 0 ? (
            <div className="text-slate-500 italic">No artifacts found</div>
          ) : (
            <ul className="divide-y divide-slate-700">
              {artifacts?.map((artifact) => (
                <li key={artifact.path} className="py-3 flex justify-between items-center">
                  <div>
                    <div className="text-sm font-medium text-slate-200">{artifact.name}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(artifact.created_at).toLocaleString()} • {(artifact.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <a 
                    href={`/api/workspaces/${workspaceId}/artifacts/${artifact.name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-400 hover:text-indigo-300 text-sm font-medium"
                  >
                    Download
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
