import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api.ts'
import { Upload, Copy, Check, Github, Key, AlertCircle } from 'lucide-react'

export function SettingsPage() {
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'config' | 'github'>('config')
  const [generateEmail, setGenerateEmail] = useState('')
  const [showGenerateForm, setShowGenerateForm] = useState(false)

  const { data: publicKey } = useQuery({
    queryKey: ['publicKey'],
    queryFn: async () => {
      try {
        const res = await api.get('/github/public-key')
        return res.data.key
      } catch (e) {
        return null
      }
    },
    enabled: activeTab === 'github'
  })

  const { data: status } = useQuery({
    queryKey: ['configStatus'],
    queryFn: async () => {
      const res = await api.get('/config/status')
      return res.data
    }
  })

  const { data: githubStatus } = useQuery({
    queryKey: ['githubStatus'],
    queryFn: async () => {
      const res = await api.get('/github/status')
      return res.data
    }
  })

  const uploadMutation = useMutation({
    mutationFn: async ({ file, type }: { file: File, type: string }) => {
      const formData = new FormData()
      formData.append('file', file)
      await api.post(`/config/${type}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configStatus'] })
      alert('Uploaded successfully')
    },
    onError: () => {
      alert('Upload failed')
    }
  })

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    if (e.target.files?.[0]) {
      uploadMutation.mutate({ file: e.target.files[0], type })
    }
  }

  const generateKeyMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await api.post('/github/generate-key', {
        email,
        overwrite: false
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publicKey'] })
      queryClient.invalidateQueries({ queryKey: ['githubStatus'] })
      setShowGenerateForm(false)
      setGenerateEmail('')
    },
    onError: (error: any) => {
      if (error.response?.status === 409) {
        const overwrite = confirm('SSH key already exists. Overwrite it?')
        if (overwrite) {
          generateKeyWithOverwrite.mutate(generateEmail)
        }
      } else {
        alert('Failed to generate key: ' + (error.response?.data?.detail || 'Unknown error'))
      }
    }
  })

  const generateKeyWithOverwrite = useMutation({
    mutationFn: async (email: string) => {
      const res = await api.post('/github/generate-key', {
        email,
        overwrite: true
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publicKey'] })
      queryClient.invalidateQueries({ queryKey: ['githubStatus'] })
      setShowGenerateForm(false)
      setGenerateEmail('')
    }
  })

  const handleGenerateKey = () => {
    if (generateEmail.trim()) {
      generateKeyMutation.mutate(generateEmail)
    }
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(publicKey || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto w-full">
      <h1 className="text-3xl font-bold text-white mb-8">Settings</h1>

      <div className="flex border-b border-zinc-800 mb-8">
        <button
          onClick={() => setActiveTab('config')}
          className={`px-6 py-3 font-medium transition-colors border-b-2 ${
            activeTab === 'config' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          Configuration
        </button>
        <button
          onClick={() => setActiveTab('github')}
          className={`px-6 py-3 font-medium transition-colors border-b-2 ${
            activeTab === 'github' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          GitHub & Auth
        </button>
      </div>

      {activeTab === 'config' && (
        <div className="space-y-6">
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
            <h3 className="text-xl font-bold text-white mb-4">Config Files</h3>
            <p className="text-zinc-400 mb-6">Upload required configuration files for the system.</p>

            <div className="grid gap-4">
              {[
                { id: 'opencode', label: 'opencode.jsonc', status: status?.opencode },
                { id: 'auth', label: 'auth.json', status: status?.auth },
                { id: 'ohmy', label: 'oh-my-opencode.json', status: status?.ohmy }
              ].map((file) => (
                <div key={file.id} className="flex items-center justify-between p-4 bg-zinc-950 rounded border border-zinc-800">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${file.status ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="font-mono text-zinc-300">{file.label}</span>
                  </div>
                  <div>
                    <input
                      type="file"
                      id={`file-${file.id}`}
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, file.id)}
                      accept=".json,.jsonc"
                    />
                    <label
                      htmlFor={`file-${file.id}`}
                      className="cursor-pointer flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-sm text-zinc-300 transition-colors"
                    >
                      <Upload size={14} /> Upload
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'github' && (
        <div className="space-y-6">
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Github size={24} /> GitHub Integration
            </h3>
            
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-zinc-400">Public SSH Key</label>
                  {!githubStatus?.has_public_key && (
                    <button
                      type="button"
                      onClick={() => setShowGenerateForm(!showGenerateForm)}
                      className="text-sm px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors flex items-center gap-1"
                    >
                      <Key size={14} /> Generate Key
                    </button>
                  )}
                </div>

                {showGenerateForm && (
                  <div className="mb-4 p-4 bg-zinc-950 border border-zinc-700 rounded space-y-3">
                    <div>
                      <label htmlFor="generate-email" className="block text-sm font-medium text-zinc-400 mb-1">Email for SSH Key</label>
                      <input
                        id="generate-email"
                        type="email"
                        value={generateEmail}
                        onChange={(e) => setGenerateEmail(e.target.value)}
                        placeholder="your-email@example.com"
                        className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleGenerateKey}
                        disabled={generateKeyMutation.isPending || !generateEmail.trim()}
                        className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                      >
                        {generateKeyMutation.isPending ? 'Generating...' : 'Generate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowGenerateForm(false)}
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded text-sm font-medium transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {publicKey ? (
                  <div className="flex gap-2">
                    <code className="flex-1 p-3 bg-zinc-950 border border-zinc-800 rounded font-mono text-xs text-zinc-300 break-all">
                      {publicKey}
                    </code>
                    <button
                      type="button"
                      onClick={copyToClipboard}
                      className="px-4 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded flex items-center justify-center text-zinc-300 transition-colors min-w-[100px]"
                    >
                      {copied ? <Check size={18} className="text-green-500" /> : <><Copy size={18} className="mr-2" /> Copy</>}
                    </button>
                  </div>
                ) : (
                  <div className="p-4 bg-zinc-950 border border-zinc-800 rounded flex items-center gap-3 text-zinc-400">
                    <AlertCircle size={20} />
                    <span className="text-sm">No SSH key found. Generate one to get started.</span>
                  </div>
                )}
                <p className="mt-2 text-sm text-zinc-500">
                  Add this key to your GitHub account settings (Settings &gt; SSH and GPG keys) or to your repository's deploy keys.
                </p>
              </div>

              <div className="border-t border-zinc-800 pt-6">
                <h4 className="font-bold text-white mb-2">CLI Authentication</h4>
                <p className="text-zinc-400 mb-4 text-sm">
                  Run the following command in the workspace terminal to authenticate with GitHub:
                </p>
                <code className="block p-3 bg-zinc-950 border border-zinc-800 rounded font-mono text-sm text-blue-400">
                  gh auth login
                </code>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
