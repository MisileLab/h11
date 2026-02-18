import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import PileWindow from '../pages/PileWindow'
import type { Item } from '../types'

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn()
}))

const { writeTextMock } = vi.hoisted(() => ({
  writeTextMock: vi.fn()
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock
}))

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: writeTextMock
}))

const mockItems: Item[] = [
  {
    id: 3,
    content: 'newest item',
    content_type: 'text',
    source_app: null,
    created_at: 1700003000
  },
  {
    id: 2,
    content: 'https://example.com',
    content_type: 'url',
    source_app: 'Safari',
    created_at: 1700002000
  },
  {
    id: 1,
    content: '```\nconsole.log("hello")\n```',
    content_type: 'code',
    source_app: null,
    created_at: 1700001000
  }
]

describe('PileWindow Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    writeTextMock.mockResolvedValue(undefined)
  })

  describe('Rendering', () => {
    it('renders a search input at top', async () => {
      invokeMock.mockResolvedValue([])
      render(<PileWindow />)

      const searchInput = await screen.findByPlaceholderText('Search...')
      expect(searchInput).toBeInTheDocument()
      expect(searchInput.tagName).toBe('INPUT')
    })

    it('auto-focuses search input on mount', async () => {
      invokeMock.mockResolvedValue([])
      render(<PileWindow />)

      const searchInput = await screen.findByPlaceholderText('Search...')
      expect(searchInput).toHaveFocus()
    })
  })

  describe('Item List', () => {
    it('renders item list from backend response', async () => {
      invokeMock.mockResolvedValue(mockItems)
      render(<PileWindow />)

      await waitFor(() => {
        expect(invokeMock).toHaveBeenCalledWith('get_items', {
          limit: 50,
          offset: 0
        })
      })

      await waitFor(() => {
        expect(screen.getByText('newest item')).toBeInTheDocument()
        expect(screen.getByText('https://example.com')).toBeInTheDocument()
      })
    })

    it('renders items in order from backend (newest first)', async () => {
      invokeMock.mockResolvedValue(mockItems)
      render(<PileWindow />)

      await waitFor(() => {
        const items = screen.getAllByRole('listitem')
        expect(items).toHaveLength(3)
        expect(items[0]).toHaveTextContent('newest item')
        expect(items[1]).toHaveTextContent('https://example.com')
        expect(items[2]).toHaveTextContent('console.log("hello")')
      })
    })
  })

  describe('Empty State', () => {
    it('shows empty state message when no items', async () => {
      invokeMock.mockResolvedValue([])
      render(<PileWindow />)

      await waitFor(() => {
        expect(
          screen.getByText('No items yet. Press Cmd+Shift+Space to capture.')
        ).toBeInTheDocument()
      })
    })
  })

  describe('Item Cards', () => {
    it('shows content type icon for each item', async () => {
      invokeMock.mockResolvedValue(mockItems)
      render(<PileWindow />)

      await waitFor(() => {
        const textIcon = screen.getByLabelText('text')
        expect(textIcon).toHaveTextContent('📝')
        const urlIcon = screen.getByLabelText('url')
        expect(urlIcon).toHaveTextContent('🔗')
        const codeIcon = screen.getByLabelText('code')
        expect(codeIcon).toHaveTextContent('💻')
      })
    })

    it('shows relative time for each item', async () => {
      const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(1700003060 * 1000)

      invokeMock.mockResolvedValue(mockItems)
      render(<PileWindow />)

      await waitFor(() => {
        const timeElements = screen
          .getAllByRole('listitem')
          .map((li) => li.querySelector('time'))
        expect(timeElements).toHaveLength(3)
        expect(timeElements[0]?.textContent).toBe('1m ago')
        expect(timeElements[1]?.textContent).toBe('17m ago')
        expect(timeElements[2]?.textContent).toBe('34m ago')
      })

      dateSpy.mockRestore()
    })

    it('shows source app badge when present', async () => {
      invokeMock.mockResolvedValue(mockItems)
      render(<PileWindow />)

      await waitFor(() => {
        expect(screen.getByText('Safari')).toBeInTheDocument()
      })
    })

    it('copies content to clipboard on item click', async () => {
      invokeMock.mockResolvedValue(mockItems)
      render(<PileWindow />)

      await waitFor(() => {
        expect(screen.getByText('newest item')).toBeInTheDocument()
      })

      const items = screen.getAllByRole('listitem')
      fireEvent.click(items[0])

      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalledWith('newest item')
      })
    })

    it('shows Copied! feedback after copy', async () => {
      invokeMock.mockResolvedValue(mockItems)
      render(<PileWindow />)

      await waitFor(() => {
        expect(screen.getByText('newest item')).toBeInTheDocument()
      })

      const items = screen.getAllByRole('listitem')
      fireEvent.click(items[0])

      await waitFor(() => {
        expect(screen.getByText('Copied!')).toBeInTheDocument()
      })
    })

    it('has delete button for each item', async () => {
      invokeMock.mockResolvedValue(mockItems)
      render(<PileWindow />)

      await waitFor(() => {
        const deleteButtons = screen.getAllByLabelText('Delete')
        expect(deleteButtons).toHaveLength(3)
      })
    })

    it('calls delete_item and removes item from list', async () => {
      invokeMock.mockResolvedValue(mockItems)
      render(<PileWindow />)

      await waitFor(() => {
        expect(screen.getByText('newest item')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByLabelText('Delete')
      fireEvent.click(deleteButtons[0])

      await waitFor(() => {
        expect(invokeMock).toHaveBeenCalledWith('delete_item', { id: 3 })
      })

      await waitFor(() => {
        expect(screen.queryByText('newest item')).not.toBeInTheDocument()
        expect(screen.getAllByRole('listitem')).toHaveLength(2)
      })
    })

    it('delete click does not trigger copy', async () => {
      invokeMock.mockResolvedValue(mockItems)
      render(<PileWindow />)

      await waitFor(() => {
        expect(screen.getByText('newest item')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByLabelText('Delete')
      fireEvent.click(deleteButtons[0])

      await waitFor(() => {
        expect(invokeMock).toHaveBeenCalledWith('delete_item', { id: 3 })
      })

      expect(writeTextMock).not.toHaveBeenCalled()
    })
  })

  describe('Search (T19)', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('debounces search — no invoke per keystroke', async () => {
      invokeMock.mockImplementation((cmd: string) => {
        if (cmd === 'get_items') return Promise.resolve(mockItems)
        if (cmd === 'search_items') return Promise.resolve([])
        if (cmd === 'get_embedding_status') return Promise.resolve('NotReady')
        return Promise.resolve(null)
      })

      render(<PileWindow />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      vi.clearAllMocks()
      invokeMock.mockImplementation((cmd: string) => {
        if (cmd === 'search_items') return Promise.resolve([])
        if (cmd === 'get_embedding_status') return Promise.resolve('NotReady')
        return Promise.resolve(mockItems)
      })

      const input = screen.getByPlaceholderText('Search...')
      fireEvent.change(input, { target: { value: 'h' } })
      fireEvent.change(input, { target: { value: 'he' } })
      fireEvent.change(input, { target: { value: 'hel' } })

      expect(
        invokeMock.mock.calls.filter((c: unknown[]) => c[0] === 'search_items')
      ).toHaveLength(0)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(200)
      })

      const searchCalls = invokeMock.mock.calls.filter(
        (c: unknown[]) => c[0] === 'search_items'
      )
      expect(searchCalls).toHaveLength(1)
      expect(searchCalls[0]).toEqual([
        'search_items',
        { query: 'hel', limit: 10 }
      ])
    })

    it('updates displayed results from search_items', async () => {
      const searchResults = [
        {
          id: 99,
          content: 'search match result',
          content_type: 'text',
          source_app: null,
          created_at: 1700009000
        }
      ]
      invokeMock.mockImplementation((cmd: string) => {
        if (cmd === 'get_items') return Promise.resolve(mockItems)
        if (cmd === 'search_items') return Promise.resolve(searchResults)
        if (cmd === 'get_embedding_status') return Promise.resolve('NotReady')
        return Promise.resolve(null)
      })

      render(<PileWindow />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      const input = screen.getByPlaceholderText('Search...')
      fireEvent.change(input, { target: { value: 'search match' } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200)
      })

      const listItems = screen.getAllByRole('listitem')
      expect(listItems).toHaveLength(1)
      expect(listItems[0]).toHaveTextContent('search match result')
      expect(screen.queryByText('newest item')).not.toBeInTheDocument()
    })

    it('empty search shows recent items via get_items', async () => {
      invokeMock.mockImplementation((cmd: string) => {
        if (cmd === 'get_items') return Promise.resolve(mockItems)
        if (cmd === 'search_items')
          return Promise.resolve([
            {
              id: 99,
              content: 'transient',
              content_type: 'text',
              source_app: null,
              created_at: 1700009000
            }
          ])
        if (cmd === 'get_embedding_status') return Promise.resolve('NotReady')
        return Promise.resolve(null)
      })

      render(<PileWindow />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      const input = screen.getByPlaceholderText('Search...')
      fireEvent.change(input, { target: { value: 'test' } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200)
      })

      vi.clearAllMocks()
      invokeMock.mockImplementation((cmd: string) => {
        if (cmd === 'get_items') return Promise.resolve(mockItems)
        if (cmd === 'get_embedding_status') return Promise.resolve('NotReady')
        return Promise.resolve(null)
      })

      fireEvent.change(input, { target: { value: '' } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200)
      })

      expect(invokeMock).toHaveBeenCalledWith('get_items', {
        limit: 50,
        offset: 0
      })
      expect(screen.getByText('newest item')).toBeInTheDocument()
    })

    it('highlights query matches with <mark>', async () => {
      const searchResults = [
        {
          id: 99,
          content: 'hello world greeting',
          content_type: 'text',
          source_app: null,
          created_at: 1700009000
        }
      ]
      invokeMock.mockImplementation((cmd: string) => {
        if (cmd === 'get_items') return Promise.resolve(mockItems)
        if (cmd === 'search_items') return Promise.resolve(searchResults)
        if (cmd === 'get_embedding_status') return Promise.resolve('NotReady')
        return Promise.resolve(null)
      })

      render(<PileWindow />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      const input = screen.getByPlaceholderText('Search...')
      fireEvent.change(input, { target: { value: 'hello' } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200)
      })

      const mark = document.querySelector('mark')
      expect(mark).not.toBeNull()
      expect(mark!.textContent).toBe('hello')
    })

    it('shows loading text when embedding not ready', async () => {
      invokeMock.mockImplementation((cmd: string) => {
        if (cmd === 'get_items') return Promise.resolve([])
        if (cmd === 'get_embedding_status') return Promise.resolve('Downloading')
        return Promise.resolve(null)
      })

      render(<PileWindow />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000)
      })

      expect(
        screen.getByText('🔍 Semantic search loading...')
      ).toBeInTheDocument()
    })

    it('shows ready text when embedding ready', async () => {
      invokeMock.mockImplementation((cmd: string) => {
        if (cmd === 'get_items') return Promise.resolve([])
        if (cmd === 'get_embedding_status') return Promise.resolve('Ready')
        return Promise.resolve(null)
      })

      render(<PileWindow />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000)
      })

      expect(
        screen.getByText('✓ Semantic search ready')
      ).toBeInTheDocument()
    })

    it('polls get_embedding_status on interval', async () => {
      invokeMock.mockImplementation((cmd: string) => {
        if (cmd === 'get_items') return Promise.resolve([])
        if (cmd === 'get_embedding_status') return Promise.resolve('NotReady')
        return Promise.resolve(null)
      })

      render(<PileWindow />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15000)
      })

      const statusCalls = invokeMock.mock.calls.filter(
        (c: unknown[]) => c[0] === 'get_embedding_status'
      )
      expect(statusCalls.length).toBeGreaterThan(1)
    })
  })
})
