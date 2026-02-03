import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { api } from '@/lib/api.ts'
import { Plus, Terminal, AlertCircle, CheckCircle } from 'lucide-react'
import clsx from 'clsx'

export function DashboardPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const res = await api.get('/workspaces')
      return res.data
    }
  })

  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: async () => {
      const res = await api.get('/setup/status')
      return res.data
    }
  })

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.post('/workspaces', { name })
      return res.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      setNewWorkspaceName('')
      setIsCreating(false)
      navigate({ to: `/workspace/${data.id}` })
    }
  })

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newWorkspaceName.trim()) return
    createMutation.mutate(newWorkspaceName)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
          <p className="text-zinc-400">Manage your workspaces and configurations</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-1.5">
            <span className={clsx("w-2 h-2 rounded-full", status?.is_setup ? "bg-green-500" : "bg-red-500")} />
            Setup
            <span className="w-px h-3 bg-zinc-700 mx-1" />
            <span className={clsx("w-2 h-2 rounded-full", status?.has_auth_json ? "bg-green-500" : "bg-red-500")} />
            Auth
            <span className="w-px h-3 bg-zinc-700 mx-1" />
            <span className={clsx("w-2 h-2 rounded-full", status?.has_config_json ? "bg-green-500" : "bg-red-500")} />
            Config
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Create New Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 flex flex-col justify-center items-center min-h-[200px] hover:border-zinc-700 transition-colors group">
          {!isCreating ? (
            <button 
              onClick={() => setIsCreating(true)}
              className="flex flex-col items-center gap-3 text-zinc-400 group-hover:text-blue-400 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center group-hover:bg-zinc-700 transition-colors">
                <Plus size={24} />
              </div>
              <span className="font-medium">New Workspace</span>
            </button>
          ) : (
            <form onSubmit={handleCreate} className="w-full">
              <label className="block text-sm font-medium text-zinc-400 mb-2">Workspace Name</label>
              <input
                autoFocus
                type="text"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-white mb-3 focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="my-feature-branch"
              />
              <div className="flex gap-2">
                <button 
                  type="submit" 
                  disabled={createMutation.isPending}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2 rounded transition-colors"
                >
                  Create
                </button>
                <button 
                  type="button" 
                  onClick={() => setIsCreating(false)}
                  className="px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium py-2 rounded transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Workspace List */}
        {isLoading ? (
           <div className="col-span-full text-center py-10 text-zinc-500">Loading workspaces...</div>
        ) : workspaces?.map((ws: any) => (
          <Link 
            key={ws.id} 
            to={`/workspace/${ws.id}`}
            className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 hover:border-zinc-600 transition-colors flex flex-col group relative"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:bg-blue-600 transition-colors">
                <Terminal size={20} />
              </div>
              <div className="px-2 py-1 rounded bg-zinc-950 text-xs text-zinc-500 border border-zinc-800">
                {ws.status || 'Active'}
              </div>
            </div>
            <h3 className="text-lg font-bold text-white mb-1">{ws.name}</h3>
            <p className="text-sm text-zinc-500 mb-4">ID: {ws.id}</p>
            <div className="mt-auto pt-4 border-t border-zinc-800 flex items-center text-sm text-zinc-400 gap-4">
              <span>{new Date(ws.created_at || Date.now()).toLocaleDateString()}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
