import React, { useState } from 'react'
import { RotateCw, ExternalLink } from 'lucide-react'

interface PreviewTabProps {
  workspaceId: string
}

export function PreviewTab({ workspaceId }: PreviewTabProps) {
  const [key, setKey] = useState(0) // Force iframe reload
  const previewUrl = `/api/workspaces/${workspaceId}/preview/`

  const handleRefresh = () => {
    setKey(prev => prev + 1)
  }

  const handleOpenNewTab = () => {
    window.open(previewUrl, '_blank')
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="h-10 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-900">
        <span className="text-sm text-zinc-400 font-mono truncate">{previewUrl}</span>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleRefresh}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors"
            title="Refresh"
          >
            <RotateCw size={16} />
          </button>
          <button 
            onClick={handleOpenNewTab}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors"
            title="Open in new tab"
          >
            <ExternalLink size={16} />
          </button>
        </div>
      </div>
      <div className="flex-1 bg-black">
        <iframe
          key={key}
          src={previewUrl}
          className="w-full h-full border-none"
          title="Workspace Preview"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
        />
      </div>
    </div>
  )
}
