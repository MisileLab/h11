import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';

export function WorkspaceTerminal({ workspaceId }: { workspaceId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize xterm
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#020617', // slate-950
        foreground: '#f8fafc', // slate-50
      },
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    
    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;

    // WebSocket connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/workspaces/${workspaceId}/terminal`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Resize on open to sync dimensions
      fitAddon.fit();
      // Send initial resize if needed, though backend usually starts with default
    };

    ws.onmessage = async (e) => {
      if (e.data instanceof Blob) {
        const ab = await e.data.arrayBuffer();
        term.write(new Uint8Array(ab));
      } else {
        term.write(e.data);
      }
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      ws.close();
      term.dispose();
    };
  }, [workspaceId]);

  return (
    <div className="h-full w-full bg-slate-950 rounded-lg overflow-hidden border border-slate-700 p-1">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
