import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Search, Plus, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'

interface PRTabProps {
  workspaceId: string
}

export function PRTab({ workspaceId }: PRTabProps) {
  const [mode, setMode] = useState<'review' | 'create'>('review')
  
  // Review state
  const [prInput, setPrInput] = useState('')
  const [reviewResult, setReviewResult] = useState<any>(null)
  
  // Create state
  const [createTitle, setCreateTitle] = useState('')
  const [createBody, setCreateBody] = useState('')
  const [createBase, setCreateBase] = useState('main')
  const [createHead, setCreateHead] = useState('')
  const [createResult, setCreateResult] = useState<any>(null)

  const reviewMutation = useMutation({
    mutationFn: async (input: string) => {
      // Check if input is a number or URL
      const prNumber = parseInt(input)
      const payload = isNaN(prNumber) 
        ? { pr_url: input }
        : { pr_number: prNumber }
      
      const res = await api.post(`/workspaces/${workspaceId}/pr/review`, payload)
      return res.data
    },
    onSuccess: (data) => {
      setReviewResult(data)
    },
    onError: (error: any) => {
      setReviewResult({
        status: 'error',
        message: error.response?.data?.detail || 'Failed to review PR'
      })
    }
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/workspaces/${workspaceId}/pr/create`, {
        title: createTitle,
        body: createBody,
        base: createBase,
        head: createHead
      })
      return res.data
    },
    onSuccess: (data) => {
      setCreateResult(data)
      // Clear form
      setCreateTitle('')
      setCreateBody('')
      setCreateHead('')
    },
    onError: (error: any) => {
      setCreateResult({
        error: error.response?.data?.detail || 'Failed to create PR'
      })
    }
  })

  const handleReview = () => {
    if (!prInput.trim()) return
    setReviewResult(null)
    reviewMutation.mutate(prInput)
  }

  const handleCreate = () => {
    if (!createTitle.trim() || !createHead.trim()) return
    setCreateResult(null)
    createMutation.mutate()
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 p-6 overflow-y-auto">
      <div className="flex items-center gap-4 mb-8">
        <button
          type="button"
          onClick={() => setMode('review')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            mode === 'review' ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'
          }`}
        >
          <Search size={18} /> Review PR
        </button>
        <button
          type="button"
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
                  placeholder="PR URL or Number (e.g., https://github.com/owner/repo/pull/123 or 123)"
                  className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  value={prInput}
                  onChange={(e) => setPrInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleReview()}
                />
                <button 
                  type="button"
                  onClick={handleReview}
                  disabled={reviewMutation.isPending || !prInput.trim()}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded font-medium transition-colors flex items-center gap-2"
                >
                  {reviewMutation.isPending ? <Loader2 className="animate-spin" size={18} /> : 'Review'}
                </button>
              </div>
            </div>
            
            {reviewResult && (
              <div className={`bg-zinc-900 p-6 rounded-lg border ${
                reviewResult.status === 'error' ? 'border-red-800' : 
                reviewResult.status === 'success' ? 'border-green-800' : 'border-yellow-800'
              }`}>
                <div className="flex items-start gap-3 mb-4">
                  {reviewResult.status === 'error' ? (
                    <AlertCircle className="text-red-500" size={24} />
                  ) : reviewResult.status === 'success' ? (
                    <CheckCircle className="text-green-500" size={24} />
                  ) : (
                    <AlertCircle className="text-yellow-500" size={24} />
                  )}
                  <div className="flex-1">
                    <h4 className="font-bold text-white mb-2">
                      {reviewResult.status === 'error' ? 'Error' : 
                       reviewResult.status === 'success' ? 'Review Complete' : 'Partial Success'}
                    </h4>
                    {reviewResult.message && (
                      <p className="text-zinc-300 mb-3">{reviewResult.message}</p>
                    )}
                    {reviewResult.summary_posted !== undefined && (
                      <p className="text-sm text-zinc-400 mb-2">
                        Summary posted: {reviewResult.summary_posted ? '✅' : '❌'}
                      </p>
                    )}
                    {reviewResult.failed_comments && reviewResult.failed_comments.length > 0 && (
                      <div className="mt-3">
                        <p className="text-sm font-medium text-yellow-400 mb-2">
                          Failed to post {reviewResult.failed_comments.length} comment(s):
                        </p>
                        <ul className="space-y-1 text-xs text-zinc-400">
                          {reviewResult.failed_comments.map((fc: any, idx: number) => (
                            <li key={idx}>
                              {fc.file}:{fc.line} - {fc.error}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!reviewResult && !reviewMutation.isPending && (
              <div className="text-center text-zinc-500 py-10">
                Enter a PR URL or number to fetch details and start review.
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
              <h3 className="text-xl font-bold text-white mb-4">Create Pull Request</h3>
              <div className="space-y-4">
                <div>
                  <label htmlFor="pr-title" className="block text-sm font-medium text-zinc-400 mb-1">Title</label>
                  <input
                    id="pr-title"
                    type="text"
                    className="w-full bg-zinc-950 border border-zinc-700 rounded px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    placeholder="Fix authentication bug"
                  />
                </div>
                <div>
                  <label htmlFor="pr-body" className="block text-sm font-medium text-zinc-400 mb-1">Description</label>
                  <textarea
                    id="pr-body"
                    rows={6}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-600 resize-y"
                    value={createBody}
                    onChange={(e) => setCreateBody(e.target.value)}
                    placeholder="Describe your changes..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="pr-base" className="block text-sm font-medium text-zinc-400 mb-1">Base Branch</label>
                    <input
                      id="pr-base"
                      type="text"
                      className="w-full bg-zinc-950 border border-zinc-700 rounded px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      value={createBase}
                      onChange={(e) => setCreateBase(e.target.value)}
                      placeholder="main"
                    />
                  </div>
                  <div>
                    <label htmlFor="pr-head" className="block text-sm font-medium text-zinc-400 mb-1">Head Branch</label>
                    <input
                      id="pr-head"
                      type="text"
                      className="w-full bg-zinc-950 border border-zinc-700 rounded px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      value={createHead}
                      onChange={(e) => setCreateHead(e.target.value)}
                      placeholder="feature/my-branch"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button 
                    type="button"
                    onClick={handleCreate}
                    disabled={createMutation.isPending || !createTitle.trim() || !createHead.trim()}
                    className="bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded font-medium transition-colors flex items-center gap-2"
                  >
                    {createMutation.isPending ? <Loader2 className="animate-spin" size={18} /> : 'Create Pull Request'}
                  </button>
                </div>
              </div>
            </div>

            {createResult && (
              <div className={`bg-zinc-900 p-6 rounded-lg border ${
                createResult.error ? 'border-red-800' : 'border-green-800'
              }`}>
                <div className="flex items-start gap-3">
                  {createResult.error ? (
                    <AlertCircle className="text-red-500" size={24} />
                  ) : (
                    <CheckCircle className="text-green-500" size={24} />
                  )}
                  <div className="flex-1">
                    <h4 className="font-bold text-white mb-2">
                      {createResult.error ? 'Error' : 'PR Created Successfully'}
                    </h4>
                    {createResult.error ? (
                      <p className="text-zinc-300">{createResult.error}</p>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-zinc-300">
                          PR #{createResult.pr_number} created
                        </p>
                        <a 
                          href={createResult.pr_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 underline text-sm"
                        >
                          {createResult.pr_url}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
