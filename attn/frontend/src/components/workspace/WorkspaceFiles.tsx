import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { FileNode } from '../../api/types';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';

const FileIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400" aria-label="File" role="img"><title>File</title><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>;
const FolderIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400" aria-label="Folder" role="img"><title>Folder</title><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 2H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>;
const ChevronRight = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Collapsed" role="img"><title>Collapsed</title><polyline points="9 18 15 12 9 6"/></svg>;
const ChevronDown = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Expanded" role="img"><title>Expanded</title><polyline points="6 9 12 15 18 9"/></svg>;

interface FileTreeNodeProps {
  node: FileNode;
  workspaceId: string;
  depth: number;
  onSelectFile: (path: string) => void;
}

function FileTreeNode({ node, workspaceId, depth, onSelectFile }: FileTreeNodeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [children, setChildren] = useState<FileNode[] | undefined>(node.children);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.type === 'directory') {
      if (!isOpen && !children) {
        setIsLoading(true);
        try {
          const files = await api.getFiles(workspaceId, node.path);
          setChildren(files);
          setIsOpen(true);
        } catch (err) {
          console.error('Failed to load directory:', err);
        } finally {
          setIsLoading(false);
        }
      } else {
        setIsOpen(!isOpen);
      }
    } else {
      onSelectFile(node.path);
    }
  };

  return (
    <div>
      <button
        type="button" 
        className={`flex w-full items-center gap-1 py-1 px-2 hover:bg-slate-800 cursor-pointer text-sm text-slate-300 select-none text-left border-0 bg-transparent ${depth > 0 ? 'ml-4' : ''}`}
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleToggle(e as any);
          }
        }}
      >
        <span className="w-4 h-4 flex items-center justify-center shrink-0">
          {node.type === 'directory' && (
            isLoading ? <Spinner size="sm" /> : 
            isOpen ? <ChevronDown /> : <ChevronRight />
          )}
        </span>
        <span className="w-4 h-4 flex items-center justify-center shrink-0">
          {node.type === 'directory' ? <FolderIcon /> : <FileIcon />}
        </span>
        <span className="truncate">{node.name}</span>
      </button>
      {isOpen && children && (
        <div>
          {children.map((child) => (
            <FileTreeNode 
              key={child.path} 
              node={child} 
              workspaceId={workspaceId} 
              depth={depth + 1} 
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function WorkspaceFiles({ workspaceId }: { workspaceId: string }) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // Initial root files
  const { data: rootFiles, isLoading } = useQuery({
    queryKey: ['files', workspaceId, '.'],
    queryFn: () => api.getFiles(workspaceId, '.'),
  });

  const loadFile = async (path: string) => {
    try {
      const data = await api.getFileContent(workspaceId, path);
      setFileContent(data.content);
      setSelectedFile(path);
    } catch (err) {
      console.error('Failed to load file:', err);
      alert('Failed to load file content');
    }
  };

  const handleSave = async () => {
    if (!selectedFile) return;
    setIsSaving(true);
    try {
      await api.saveFile(workspaceId, selectedFile, fileContent);
    } catch (err) {
      console.error('Failed to save file:', err);
      alert('Failed to save file');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-full border border-slate-700 rounded-lg overflow-hidden bg-slate-900">
      <div className="w-64 border-r border-slate-700 overflow-y-auto bg-slate-900/50 p-2">
        {isLoading ? (
          <div className="flex justify-center p-4"><Spinner /></div>
        ) : (
          rootFiles?.map((node) => (
            <FileTreeNode 
              key={node.path} 
              node={node} 
              workspaceId={workspaceId} 
              depth={0} 
              onSelectFile={loadFile}
            />
          ))
        )}
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between border-b border-slate-700 p-2 bg-slate-800">
          <span className="text-sm font-medium text-slate-300 truncate px-2">
            {selectedFile || 'No file selected'}
          </span>
          <Button 
            size="sm" 
            disabled={!selectedFile} 
            onClick={handleSave}
            isLoading={isSaving}
          >
            Save
          </Button>
        </div>
        <div className="flex-1 relative">
          {selectedFile ? (
            <textarea
              className="absolute inset-0 w-full h-full p-4 bg-slate-950 text-slate-200 font-mono text-sm resize-none focus:outline-none"
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              spellCheck={false}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500">
              Select a file to edit
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
