import React, { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { Folder, Terminal, Eye, GitPullRequest, Beaker } from 'lucide-react'
import clsx from 'clsx'

// Placeholder imports - we will create these next
import { FilesTab } from '@/components/workspace/FilesTab'
import { TerminalTab } from '@/components/workspace/TerminalTab'
import { PreviewTab } from '@/components/workspace/PreviewTab'
import { PRTab } from '@/components/workspace/PRTab'
import { TestsTab } from '@/components/workspace/TestsTab'

type Tab = 'files' | 'terminal' | 'preview' | 'pr' | 'tests'

export function WorkspacePage() {
  const { workspaceId } = useParams({ from: '/app/workspace/$workspaceId' })
  const [activeTab, setActiveTab] = useState<Tab>('files')

  const tabs = [
    { id: 'files', label: 'Files', icon: Folder },
    { id: 'terminal', label: 'Terminal', icon: Terminal },
    { id: 'preview', label: 'Preview', icon: Eye },
    { id: 'pr', label: 'PR', icon: GitPullRequest },
    { id: 'tests', label: 'Tests', icon: Beaker },
  ] as const

  return (
    <div className="flex h-full w-full">
      {/* Sidebar / Tabs */}
      <div className="w-16 md:w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col">
        <div className="p-4 border-b border-zinc-800 hidden md:block">
          <h2 className="font-bold truncate text-zinc-300">Workspace {workspaceId}</h2>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "w-full flex items-center gap-3 px-4 py-3 transition-colors text-left",
                activeTab === tab.id 
                  ? "bg-zinc-800 text-blue-400 border-r-2 border-blue-500" 
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              )}
            >
              <tab.icon size={20} />
              <span className="hidden md:block font-medium">{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
        <div className="flex-1 overflow-hidden relative">
          {activeTab === 'files' && <FilesTab workspaceId={workspaceId} />}
          {activeTab === 'terminal' && <TerminalTab workspaceId={workspaceId} />}
          {activeTab === 'preview' && <PreviewTab workspaceId={workspaceId} />}
          {activeTab === 'pr' && <PRTab workspaceId={workspaceId} />}
          {activeTab === 'tests' && <TestsTab workspaceId={workspaceId} />}
        </div>
      </div>
    </div>
  )
}
