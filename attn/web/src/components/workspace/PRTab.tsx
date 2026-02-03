import React, { useState } from 'react'
import { GitPullRequest, Search, Plus } from 'lucide-react'

interface PRTabProps {
  workspaceId: string
}

export function PRTab({ workspaceId }: PRTabProps) {
  const [mode, setMode] = useState<'review' | 'create'>('review')
  const [prUrl, setPrUrl] = useState('')
  const [createTitle, setCreateTitle] = useState('')
  const [createBody, setCreateBody] = useState('')

  return (
    <div className="flex flex-col h-full bg-zinc-950 p-6 overflow-y-auto">
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => setMode('review')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            mode === 'review' ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'
          }`}
        >
          <Search size={18} /> Review PR
        </button>
        <button
          onClick={() => setMode('create')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            mode === 'create' ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'
          }`}
        >
          <Plus size={18} /> Create PR
        </button>
      </div>

      <div className="max-w-2xl w-full">
        {mode === 'review' ? (
          <div className="space-y-6">
            <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
              <h3 className="text-xl font-bold text-white mb-4">Review Pull Request</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="PR URL or Number (e.g., https://github.com/owner/repo/pull/123)"
                  className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  value={prUrl}
                  onChange={(e) => setPrUrl(e.target.value)}
                />
                <button className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded font-medium transition-colors">
                  Load
                </button>
              </div>
            </div>
            
            <div className="text-center text-zinc-500 py-10">
              Enter a PR URL to fetch details and start review.
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
              <h3 className="text-xl font-bold text-white mb-4">Create Pull Request</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Title</label>
                  <input
                    type="text"
                    className="w-full bg-zinc-950 border border-zinc-700 rounded px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Description</label>
                  <textarea
                    rows={6}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-600 resize-y"
                    value={createBody}
                    onChange={(e) => setCreateBody(e.target.value)}
                  />
                </div>
                <div className="flex justify-end">
                  <button className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded font-medium transition-colors">
                    Create Pull Request
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
