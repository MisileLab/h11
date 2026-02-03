import React, { useState } from 'react'
import { Play, RotateCcw, FileText } from 'lucide-react'

interface TestsTabProps {
  workspaceId: string
}

export function TestsTab({ workspaceId }: TestsTabProps) {
  const [command, setCommand] = useState('npm test')
  const [isRunning, setIsRunning] = useState(false)
  const [logs, setLogs] = useState<string[]>([])

  const handleRun = () => {
    setIsRunning(true)
    setLogs(['> Starting tests...', '> ' + command])
    
    // Simulate test run
    setTimeout(() => {
      setLogs(prev => [...prev, 'Running suite: App.test.tsx'])
      setTimeout(() => {
        setLogs(prev => [...prev, '✔ App renders correctly', '✔ Login works', 'Tests passed!', 'Done in 2.4s'])
        setIsRunning(false)
      }, 2000)
    }, 1000)
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 p-6">
      <div className="max-w-4xl w-full mx-auto flex flex-col h-full">
        <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800 mb-6">
          <h3 className="text-xl font-bold text-white mb-4">Test Configuration</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-4 py-2 text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="Test command (e.g., npm test)"
            />
            <button
              onClick={handleRun}
              disabled={isRunning}
              className="bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded font-medium transition-colors flex items-center gap-2"
            >
              {isRunning ? <RotateCcw className="animate-spin" size={18} /> : <Play size={18} />}
              Run Tests
            </button>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-3 gap-6 min-h-0">
          <div className="col-span-2 bg-zinc-900 rounded-lg border border-zinc-800 flex flex-col overflow-hidden">
            <div className="bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300">Console Output</div>
            <div className="flex-1 p-4 font-mono text-sm text-zinc-300 overflow-y-auto whitespace-pre-wrap">
              {logs.length > 0 ? logs.join('\n') : <span className="text-zinc-600">No output yet</span>}
            </div>
          </div>

          <div className="bg-zinc-900 rounded-lg border border-zinc-800 flex flex-col overflow-hidden">
            <div className="bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300">Artifacts</div>
            <div className="flex-1 p-2 overflow-y-auto">
              {!isRunning && logs.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 p-2 hover:bg-zinc-800 rounded cursor-pointer text-zinc-300 text-sm">
                    <FileText size={16} className="text-yellow-500" />
                    <span>coverage-final.json</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 hover:bg-zinc-800 rounded cursor-pointer text-zinc-300 text-sm">
                    <FileText size={16} className="text-red-500" />
                    <span>junit.xml</span>
                  </div>
                </div>
              )}
              {logs.length === 0 && (
                <div className="text-zinc-600 text-sm p-2">No artifacts</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
