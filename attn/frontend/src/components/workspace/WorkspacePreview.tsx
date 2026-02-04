import { useState } from 'react';
import { Spinner } from '../ui/Spinner';

export function WorkspacePreview({ workspaceId }: { workspaceId: string }) {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div className="h-full flex flex-col bg-slate-900 border border-slate-700 rounded-lg overflow-hidden relative">
      <div className="bg-slate-800 px-4 py-2 border-b border-slate-700 flex justify-between items-center">
        <span className="text-sm font-medium text-slate-300">Browser Preview (noVNC)</span>
        {isLoading && <span className="text-xs text-slate-400 flex items-center gap-2"><Spinner size="sm" /> Connecting...</span>}
      </div>
      <div className="flex-1 relative bg-black">
        <iframe
          src={`/api/workspaces/${workspaceId}/preview/vnc.html?autoconnect=true&resize=scale`}
          className="absolute inset-0 w-full h-full border-0"
          onLoad={() => setIsLoading(false)}
          title="Workspace Preview"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
}
