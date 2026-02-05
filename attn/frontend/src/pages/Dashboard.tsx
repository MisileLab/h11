import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { api } from '../api/client';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';

export function DashboardPage() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspaceRepo, setNewWorkspaceRepo] = useState('');
  const [createError, setCreateError] = useState('');

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: api.getWorkspaces,
  });

  const createMutation = useMutation({
    mutationFn: api.createWorkspace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      setCreateOpen(false);
      setNewWorkspaceName('');
      setNewWorkspaceRepo('');
    },
    onError: (err: any) => {
      setCreateError(err.message || 'Failed to create workspace');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteWorkspace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    createMutation.mutate({
      name: newWorkspaceName,
      repo_url: newWorkspaceRepo || undefined,
    });
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this workspace? This cannot be undone.')) {
      deleteMutation.mutate(id.toString());
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Workspaces</h1>
        <Button onClick={() => setCreateOpen(true)}>Create Workspace</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : workspaces?.length === 0 ? (
        <div className="text-center py-12 rounded-lg border-2 border-dashed border-slate-700">
          <h3 className="text-lg font-medium text-slate-100">No workspaces yet</h3>
          <p className="mt-1 text-slate-400">Create your first workspace to get started</p>
          <div className="mt-6">
            <Button onClick={() => setCreateOpen(true)}>Create Workspace</Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces?.map((ws) => (
            <Card key={ws.id} className="flex flex-col">
              <div className="flex-1 p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h3 className="font-semibold text-lg text-slate-100">{ws.name}</h3>
                    <p className="text-xs text-slate-500">Created {new Date(ws.created_at).toLocaleDateString()}</p>
                  </div>
                  <Badge variant={ws.status === 'running' ? 'success' : 'default'}>
                    {ws.status}
                  </Badge>
                </div>
                {ws.repo_url && (
                  <div className="mt-4 text-sm text-slate-400 truncate" title={ws.repo_url}>
                    Repo: {ws.repo_url}
                  </div>
                )}
              </div>
              <div className="bg-slate-800/50 p-4 border-t border-slate-700 flex justify-between items-center rounded-b-lg">
                <Button 
                  variant="danger" 
                  size="sm" 
                  onClick={() => handleDelete(ws.id)}
                  isLoading={deleteMutation.isPending && deleteMutation.variables === ws.id.toString()}
                >
                  Delete
                </Button>
                <Link to="/workspaces/$workspaceId" params={{ workspaceId: ws.id.toString() }}>
                  <Button variant="secondary" size="sm">Open Workspace</Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={isCreateOpen}
        onClose={() => setCreateOpen(false)}
        title="Create New Workspace"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} isLoading={createMutation.isPending}>Create</Button>
          </>
        }
      >
        <form id="create-workspace-form" onSubmit={handleCreate} className="space-y-4">
          {createError && (
            <div className="text-sm text-red-500 bg-red-500/10 p-2 rounded">
              {createError}
            </div>
          )}
          <Input
            label="Workspace Name"
            value={newWorkspaceName}
            onChange={(e) => setNewWorkspaceName(e.target.value)}
            placeholder="my-awesome-project"
            required
            pattern="[a-zA-Z0-9-_]+"
            title="Alphanumeric characters, dashes, and underscores only"
          />
          <Input
            label="Repository URL (Optional)"
            value={newWorkspaceRepo}
            onChange={(e) => setNewWorkspaceRepo(e.target.value)}
            placeholder="https://github.com/user/repo"
          />
        </form>
      </Modal>
    </div>
  );
}
