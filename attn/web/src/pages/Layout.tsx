import React from 'react'
import { Outlet, Link, useNavigate } from '@tanstack/react-router'
import { api } from '@/lib/api'
import { LogOut, Settings, Home } from 'lucide-react'

export function AppLayout() {
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout') // Assuming logout endpoint exists, if not just clear local state
    } catch (e) {
      console.error(e)
    } finally {
      navigate({ to: '/login' })
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-50 font-sans">
      <header className="border-b border-zinc-800 bg-zinc-900 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center text-xs">A</span>
            Attn
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/settings" className="p-2 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors">
            <Settings size={20} />
          </Link>
          <button onClick={handleLogout} className="p-2 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
