import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { cn } from '../lib/utils'
import type { Item } from '../types'

function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - timestamp
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 172800) return 'Yesterday'
  return new Date(timestamp * 1000).toLocaleDateString()
}

function getTypeIcon(contentType: string): string {
  switch (contentType) {
    case 'url': return '🔗'
    case 'code': return '💻'
    case 'image': return '🖼'
    default: return '📝'
  }
}

export default function PileWindow() {
  const searchRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  useEffect(() => {
    async function fetchItems() {
      try {
        const result = await invoke<Item[]>('get_items', {
          limit: 50,
          offset: 0
        })
        setItems(result)
      } catch (error) {
        console.error('Failed to fetch items:', error)
      } finally {
        setLoading(false)
      }
    }
    void fetchItems()
  }, [])

  async function handleCopy(item: Item) {
    try {
      await writeText(item.content)
      setCopiedId(item.id)
      setTimeout(() => setCopiedId(null), 1000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  async function handleDelete(id: number) {
    try {
      await invoke('delete_item', { id })
      setItems((prev) => prev.filter((item) => item.id !== id))
    } catch (error) {
      console.error('Failed to delete item:', error)
    }
  }

  return (
    <div className={cn('flex h-full flex-col bg-background text-foreground')}>
      <div className={cn('shrink-0 border-b border-border p-3')}>
        <input
          ref={searchRef}
          type="text"
          placeholder="Search..."
          className={cn(
            'w-full rounded-md border border-input bg-secondary px-3 py-2',
            'text-sm text-foreground placeholder:text-muted-foreground',
            'outline-none ring-ring focus:ring-2'
          )}
        />
      </div>

      <div className={cn('flex-1 overflow-y-auto')}>
        {loading ? null : items.length === 0 ? (
          <div
            className={cn(
              'flex h-full items-center justify-center',
              'px-6 text-center text-sm text-muted-foreground'
            )}
          >
            No items yet. Press Cmd+Shift+Space to capture.
          </div>
        ) : (
          <ul className={cn('divide-y divide-border')}>
            {items.map((item) => (
              <li
                key={item.id}
                className={cn(
                  'group relative cursor-pointer px-3 py-2 text-sm',
                  'transition-colors hover:bg-accent'
                )}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('button')) return
                  handleCopy(item)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleCopy(item)
                  }
                }}
              >
                <div className="flex items-start gap-2">
                  <span
                    className="shrink-0"
                    role="img"
                    aria-label={item.content_type}
                  >
                    {getTypeIcon(item.content_type)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="line-clamp-2 break-all text-foreground">
                      {item.content}
                    </span>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <time dateTime={new Date(item.created_at * 1000).toISOString()}>
                        {formatRelativeTime(item.created_at)}
                      </time>
                      {item.source_app && (
                        <span className="rounded bg-secondary px-1.5 py-0.5">
                          {item.source_app}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={cn(
                      'shrink-0 rounded p-1 text-xs text-muted-foreground',
                      'opacity-0 transition-opacity group-hover:opacity-100',
                      'hover:bg-destructive hover:text-destructive-foreground'
                    )}
                    aria-label="Delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(item.id)
                    }}
                  >
                    ×
                  </button>
                </div>
                {copiedId === item.id && (
                  <div className="absolute inset-0 flex items-center justify-center rounded bg-background/80 text-xs font-medium text-foreground">
                    Copied!
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
