import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api.ts'
import { File, Folder, ChevronRight, ChevronDown, Save } from 'lucide-react'
import clsx from 'clsx'

interface FilesTabProps {
  workspaceId: string
}

// Mock file tree item
interface FileItem {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileItem[]
}

const FileTreeItem = ({ item, level, onSelect }: { item: FileItem, level: number, onSelect: (path: string) => void }) => {
  const [isOpen, setIsOpen] = useState(false)
  
  const handleClick = () => {
    if (item.type === 'directory') {
      setIsOpen(!isOpen)
    } else {
      onSelect(item.path)
    }
  }

  return (
    <div>
      <div 
        className="flex items-center gap-1 hover:bg-zinc-800 cursor-pointer py-1 text-sm text-zinc-300 select-none"
        style={{ paddingLeft: `${level * 12 + 12}px` }}
        onClick={handleClick}
      >
        {item.type === 'directory' && (
          isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
        )}
        {item.type === 'directory' ? <Folder size={14} className="text-blue-400" /> : <File size={14} className="text-zinc-500" />}
        <span>{item.name}</span>
      </div>
      {isOpen && item.children && (
        <div>
          {item.children.map((child) => (
            <FileTreeItem key={child.path} item={child} level={level + 1} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  )
}

export function FilesTab({ workspaceId }: FilesTabProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const queryClient = useQueryClient()

  const { data: files } = useQuery({
    queryKey: ['files', workspaceId],
    queryFn: async () => {
      // Mock data for now if API not ready
      // const res = await api.get(`/workspaces/${workspaceId}/files`)
      // return res.data
      return [
        { name: 'src', path: 'src', type: 'directory', children: [
          { name: 'index.ts', path: 'src/index.ts', type: 'file' },
          { name: 'app.tsx', path: 'src/app.tsx', type: 'file' }
        ]},
        { name: 'package.json', path: 'package.json', type: 'file' },
        { name: 'README.md', path: 'README.md', type: 'file' }
      ] as FileItem[]
    }
  })

  // Fetch file content when selected
  useQuery({
    queryKey: ['fileContent', workspaceId, selectedFile],
    queryFn: async () => {
      if (!selectedFile) return ''
      // const res = await api.get(`/workspaces/${workspaceId}/files/content`, { params: { path: selectedFile } })
      // return res.data
      return `// Content of ${selectedFile}\nconsole.log("Hello World");`
    },
    enabled: !!selectedFile,
  })

  // We need to update content state when query fetches, but useQuery doesn't do that automatically for editing.
  // Ideally we use useEffect or just let the editor be uncontrolled with key, but controlled is better for save.
  // For MVP, I'll just clear the editor content when file changes.

  return (
    <div className="flex h-full">
      <div className="w-64 border-r border-zinc-800 overflow-y-auto bg-zinc-900">
        <div className="p-2 font-bold text-xs text-zinc-500 uppercase tracking-wider">Explorer</div>
        {files?.map((item) => (
          <FileTreeItem key={item.path} item={item} level={0} onSelect={(path) => {
            setSelectedFile(path)
            setContent(`// Loading ${path}...`) // Reset content placeholder
            // In real app, we'd fetch here or use the query data
          }} />
        ))}
      </div>
      <div className="flex-1 flex flex-col bg-zinc-950">
        {selectedFile ? (
          <>
            <div className="h-10 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-900">
              <span className="text-sm text-zinc-300">{selectedFile}</span>
              <button className="flex items-center gap-2 px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium">
                <Save size={14} /> Save
              </button>
            </div>
            <textarea
              className="flex-1 w-full bg-zinc-950 text-zinc-300 p-4 font-mono text-sm resize-none focus:outline-none"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500">
            Select a file to edit
          </div>
        )}
      </div>
    </div>
  )
}
