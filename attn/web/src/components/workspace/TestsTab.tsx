import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Play, FileText, Download, Loader2 } from 'lucide-react'

interface TestsTabProps {
  workspaceId: string
}

export function TestsTab({ workspaceId }: TestsTabProps) {
  const queryClient = useQueryClient()
  const [editMode, setEditMode] = useState(false)
  const [commandInput, setCommandInput] = useState('')

  const { data: config } = useQuery({
    queryKey: ['testConfig', workspaceId],
    queryFn: async () => {
      const res = await api.get(`/workspaces/${workspaceId}/tests/config`)
      return res.data
    }
  })

  const { data: logs } = useQuery({
    queryKey: ['testLogs', workspaceId],
    queryFn: async () => {
      const res = await api.get(`/workspaces/${workspaceId}/tests/logs`)
      return res.data.logs || []
    }
  })

  const { data: artifacts } = useQuery({
    queryKey: ['testArtifacts', workspaceId],
    queryFn: async () => {
      const res = await api.get(`/workspaces/${workspaceId}/artifacts`)
      return res.data.artifacts || []
    }
  })

  const updateConfigMutation = useMutation({
    mutationFn: async (command: string) => {
      const res = await api.put(`/workspaces/${workspaceId}/tests/config`, { command })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testConfig', workspaceId] })
      setEditMode(false)
    }
  })

  const runTestsMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/workspaces/${workspaceId}/tests/run`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testLogs', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['testArtifacts', workspaceId] })
    }
  })

  const handleSaveConfig = () => {
    if (commandInput.trim()) {
      updateConfigMutation.mutate(commandInput)
    }
  }

  const handleEditConfig = () => {
    setCommandInput(config?.command || '')
    setEditMode(true)
  }

  const downloadLog = (filename: string) => {
    window.open(`/api/workspaces/${workspaceId}/tests/logs/${filename}`, '_blank')
  }

  const downloadArtifact = (filename: string) => {
    window.open(`/api/workspaces/${workspaceId}/artifacts/${filename}`, '_blank')
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 p-6">
      <div className="max-w-4xl w-full mx-auto flex flex-col h-full">
        <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800 mb-6">
          <h3 className="text-xl font-bold text-white mb-4">Test Configuration</h3>
          {editMode ? (
            <div className="space-y-3">
              <input
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-4 py-2 text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="Test command (e.g., npm test)"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={updateConfigMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded font-medium transition-colors"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditMode(false)}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-4 py-2 text-white font-mono">
                {config?.command || 'No test command configured'}
              </div>
              <button
                type="button"
                onClick={handleEditConfig}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded font-medium transition-colors"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => runTestsMutation.mutate()}
                disabled={runTestsMutation.isPending || !config?.command}
                className="bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded font-medium transition-colors flex items-center gap-2"
              >
                {runTestsMutation.isPending ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    Running...
                  </>
                ) : (
                  <>
                    <Play size={18} />
                    Run Tests
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 grid grid-cols-3 gap-6 min-h-0">
          <div className="col-span-2 bg-zinc-900 rounded-lg border border-zinc-800 flex flex-col overflow-hidden">
            <div className="bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300">Test Logs</div>
            <div className="flex-1 p-4 overflow-y-auto">
              {logs && logs.length > 0 ? (
                <div className="space-y-2">
                  {logs.map((log: any) => (
                    <div
                      key={log.filename}
                      className="flex items-center justify-between p-3 bg-zinc-950 rounded border border-zinc-800 hover:border-zinc-700 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <FileText size={18} className="text-blue-400" />
                        <div>
                          <div className="text-sm text-white font-mono">{log.filename}</div>
                          <div className="text-xs text-zinc-500">
                            {log.timestamp} • {(log.size / 1024).toFixed(1)} KB
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => downloadLog(log.filename)}
                        className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 transition-colors"
                      >
                        <Download size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-zinc-600 text-sm">No logs yet. Run tests to generate logs.</div>
              )}
            </div>
          </div>

          <div className="bg-zinc-900 rounded-lg border border-zinc-800 flex flex-col overflow-hidden">
            <div className="bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300">Artifacts</div>
            <div className="flex-1 p-4 overflow-y-auto">
              {artifacts && artifacts.length > 0 ? (
                <div className="space-y-2">
                  {artifacts.map((artifact: any) => (
                    <button
                      key={artifact.filename}
                      type="button"
                      onClick={() => downloadArtifact(artifact.filename)}
                      className="w-full flex items-center gap-2 p-2 hover:bg-zinc-800 rounded text-left transition-colors"
                    >
                      <FileText size={16} className="text-yellow-500" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-300 truncate">{artifact.filename}</div>
                        <div className="text-xs text-zinc-600">{(artifact.size / 1024).toFixed(1)} KB</div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-zinc-600 text-sm">No artifacts</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
