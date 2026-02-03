import React, { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { api } from '@/lib/api.ts'
import { ShieldAlert } from 'lucide-react'

export function SetupPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    setError('')

    try {
      await api.post('/setup', { username, password })
      navigate({ to: '/login' })
    } catch (err) {
      setError('Setup failed. Ensure backend is reachable and not already setup.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-lg p-6 shadow-xl">
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center text-white">
            <ShieldAlert size={20} />
          </div>
          <h1 className="text-2xl font-bold text-white">Initial Setup</h1>
          <p className="text-zinc-400 text-sm">Create admin account</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-800 text-red-200 rounded text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-zinc-400 mb-1">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-zinc-400 mb-1">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all"
              required
            />
          </div>
          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-zinc-400 mb-1">Confirm Password</label>
            <input
              id="confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-500 text-white font-medium py-2 px-4 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Setting up...' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  )
}
