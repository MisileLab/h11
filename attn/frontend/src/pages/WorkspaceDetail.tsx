import React from 'react';
import { useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { WorkspaceFiles } from '../components/workspace/WorkspaceFiles';
import { WorkspaceTerminal } from '../components/workspace/WorkspaceTerminal';
import { WorkspacePreview } from '../components/workspace/WorkspacePreview';
import { WorkspacePR } from '../components/workspace/WorkspacePR';
import { WorkspaceTests } from '../components/workspace/WorkspaceTests';
import { Spinner } from '../components/ui/Spinner';

export function WorkspaceDetailPage() {
  const params = useRouterState({ select: (s) => s.location.pathname });
  const workspaceId = params.split('/')[2]; // /workspaces/:id
  const workspaceIdNum = parseInt(workspaceId, 10);
  
  // Simple local state for tabs since we don't have nested routes setup yet
  const [activeTab, setActiveTab] = React.useState<'files' | 'terminal' | 'preview' | 'pr' | 'tests'>('files');

  const { data: workspace, isLoading } = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: async () => {
      const list = await api.getWorkspaces();
      return list.find(w => w.id === workspaceIdNum);
    },
  });

  if (isLoading) return <div className="h-full flex items-center justify-center"><Spinner size="xl" /></div>;
  if (!workspace) return <div className="p-8 text-center text-red-400">Workspace not found</div>;

  const tabs = [
    { id: 'files', label: 'Files' },
    { id: 'terminal', label: 'Terminal' },
    { id: 'preview', label: 'Preview' },
    { id: 'pr', label: 'Pull Requests' },
    { id: 'tests', label: 'Tests' },
  ] as const;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] lg:h-[calc(100vh-2rem)]">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-100">{workspace.name}</h1>
        {workspace.repo_url && (
          <p className="text-sm text-slate-400">{workspace.repo_url}</p>
        )}
      </div>

      <div className="flex border-b border-slate-700 mb-4 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors
              ${activeTab === tab.id 
                ? 'border-indigo-500 text-indigo-400' 
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'}
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 relative">
        {activeTab === 'files' && <WorkspaceFiles workspaceId={workspaceId} />}
        {activeTab === 'terminal' && <WorkspaceTerminal workspaceId={workspaceId} />}
        {activeTab === 'preview' && <WorkspacePreview workspaceId={workspaceId} />}
        {activeTab === 'pr' && <WorkspacePR workspaceId={workspaceId} />}
        {activeTab === 'tests' && <WorkspaceTests workspaceId={workspaceId} />}
      </div>
    </div>
  );
}
