import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Upload, Copy, Check, Github } from 'lucide-react'

export function SettingsPage() {
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'config' | 'github'>('config')

  const { data: publicKey } = useQuery({
    queryKey: ['publicKey'],
    queryFn: async () => {
      // Mock or Real
      try {
        const res = await api.get('/setup/public-key')
        return res.data.public_key
      } catch (e) {
        return "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI..."
      }
    }
  })

  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: async () => {
      const res = await api.get('/setup/status')
      return res.data
    }
  })

  const uploadMutation = useMutation({
    mutationFn: async ({ file, type }: { file: File, type: string }) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', type)
      await api.post('/setup/config', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status'] })
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
                { id: 'opencode', label: 'opencode.jsonc', status: status?.has_config_json },
                { id: 'auth', label: 'auth.json', status: status?.has_auth_json },
                { id: 'oh-my-opencode', label: 'oh-my-opencode.json', status: false } // Example
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
                <label className="block text-sm font-medium text-zinc-400 mb-2">Public SSH Key</label>
                <div className="flex gap-2">
                  <code className="flex-1 p-3 bg-zinc-950 border border-zinc-800 rounded font-mono text-xs text-zinc-300 break-all">
                    {publicKey || 'Loading...'}
                  </code>
                  <button
                    onClick={copyToClipboard}
                    className="px-4 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded flex items-center justify-center text-zinc-300 transition-colors min-w-[100px]"
                  >
                    {copied ? <Check size={18} className="text-green-500" /> : <><Copy size={18} className="mr-2" /> Copy</>}
                  </button>
                </div>
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
