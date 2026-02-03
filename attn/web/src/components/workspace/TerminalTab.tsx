import React, { useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import 'xterm/css/xterm.css'

interface TerminalTabProps {
  workspaceId: string
}

export function TerminalTab({ workspaceId }: TerminalTabProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!terminalRef.current) return

    // Initialize Terminal
    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#09090b', // zinc-950
        foreground: '#f4f4f5', // zinc-100
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    term.open(terminalRef.current)
    fitAddon.fit()

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    // Initialize WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/api/workspaces/${workspaceId}/terminal`
    
    // In dev, if using Vite proxy, we might need to point to localhost:3000 (which proxies to 8000)
    // or directly to 8000 if proxy doesn't support WS well. Vite usually does.

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      term.writeln('\x1b[32mConnected to terminal\x1b[0m')
      // Send resize event or initial setup if needed
    }

    ws.onmessage = (event) => {
      term.write(event.data)
    }

    ws.onclose = () => {
      term.writeln('\r\n\x1b[31mConnection closed\x1b[0m')
    }

    ws.onerror = () => {
      term.writeln('\r\n\x1b[31mConnection error\x1b[0m')
    }

    // Input handling
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    })

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      // Send new size to backend if supported
    })
    resizeObserver.observe(terminalRef.current)

    return () => {
      ws.close()
      term.dispose()
      resizeObserver.disconnect()
    }
  }, [workspaceId])

  return (
    <div className="h-full w-full bg-zinc-950 p-4 overflow-hidden">
      <div ref={terminalRef} className="h-full w-full" />
    </div>
  )
}
