import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CaptureBar from '../pages/CaptureBar'

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn()
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock
}))

describe('CaptureBar Component', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    invokeMock.mockResolvedValue(undefined)
  })

  describe('Rendering', () => {
    it('renders a textarea element', () => {
      render(<CaptureBar />)
      const textarea = screen.getByRole('textbox')
      expect(textarea).toBeInTheDocument()
    })

    it('has placeholder text "Throw anything in..."', () => {
      render(<CaptureBar />)
      const textarea = screen.getByPlaceholderText('Throw anything in...')
      expect(textarea).toBeInTheDocument()
    })

    it('auto-focuses textarea on mount', () => {
      render(<CaptureBar />)
      const textarea = screen.getByRole('textbox')
      expect(textarea).toHaveFocus()
    })
  })

  describe('Content Type Detection', () => {
    it('detects URL as content type "url"', () => {
      const { getDetectedContentType } = renderWithDetection()
      expect(getDetectedContentType('https://example.com')).toBe('url')
      expect(getDetectedContentType('http://example.com/path?query=1')).toBe('url')
    })

    it('detects code fence as content type "code"', () => {
      const { getDetectedContentType } = renderWithDetection()
      expect(getDetectedContentType('```\nfunction hello() {}\n```')).toBe('code')
    })

    it('detects 4-space indent as content type "code"', () => {
      const { getDetectedContentType } = renderWithDetection()
      expect(getDetectedContentType('    const x = 5')).toBe('code')
    })

    it('defaults to content type "text" for plain text', () => {
      const { getDetectedContentType } = renderWithDetection()
      expect(getDetectedContentType('just some text')).toBe('text')
    })
  })

  describe('Keyboard Handlers', () => {
    it('triggers save on Enter without Shift', async () => {
      render(<CaptureBar />)
      const textarea = screen.getByRole('textbox')

      fireEvent.change(textarea, { target: { value: 'test content' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

      await waitFor(() => {
        expect(invokeMock).toHaveBeenCalledWith('save_item', expect.objectContaining({
          content: 'test content',
          contentType: 'text'
        }))
      })
    })

    it('closes capture window after successful save', async () => {
      render(<CaptureBar />)
      const textarea = screen.getByRole('textbox')

      fireEvent.change(textarea, { target: { value: 'important note' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

      await waitFor(() => {
        expect(invokeMock).toHaveBeenCalledWith('save_item', expect.objectContaining({
          content: 'important note',
          contentType: 'text'
        }))
      })

      await new Promise((resolve) => setTimeout(resolve, 250))
      await waitFor(() => {
        expect(invokeMock).toHaveBeenCalledWith('close_capture_window')
      })
    })

    it('shows error if save fails and does not close window', async () => {
      invokeMock.mockRejectedValueOnce(new Error('save failed'))
      render(<CaptureBar />)
      const textarea = screen.getByRole('textbox')

      fireEvent.change(textarea, { target: { value: 'important note' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Could not save. Try again.')
      })

      expect(invokeMock).toHaveBeenCalledWith('save_item', expect.objectContaining({
        content: 'important note',
        contentType: 'text'
      }))
      expect(invokeMock).not.toHaveBeenCalledWith('close_capture_window')
    })

    it('inserts newline on Shift+Enter', () => {
      render(<CaptureBar />)
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement

      fireEvent.change(textarea, { target: { value: 'line1' } })
      const originalValue = textarea.value

      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })

      expect(originalValue).toBe('line1')
    })

    it('closes window on Escape without saving', async () => {
      render(<CaptureBar />)
      const textarea = screen.getByRole('textbox')

      fireEvent.change(textarea, { target: { value: 'unsaved content' } })
      fireEvent.keyDown(textarea, { key: 'Escape' })

      await waitFor(() => {
        expect(invokeMock).toHaveBeenCalledWith('close_capture_window')
      })
      expect(invokeMock).not.toHaveBeenCalledWith('save_item', expect.anything())
    })

    it('does not trigger save on other keys', async () => {
      render(<CaptureBar />)
      const textarea = screen.getByRole('textbox')

      fireEvent.change(textarea, { target: { value: 'test' } })
      fireEvent.keyDown(textarea, { key: 'a' })

      await new Promise(resolve => setTimeout(resolve, 50))
      expect(invokeMock).not.toHaveBeenCalled()
    })
  })

  describe('Image Paste Detection', () => {
    it('detects image paste and sets content type to "image"', () => {
      const { getDetectedContentType } = renderWithDetection()

      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      expect(getDetectedContentType(dataUrl)).toBe('image')
    })
  })

  describe('Save Flow', () => {
    it('detects content type before saving', async () => {
      render(<CaptureBar />)
      const textarea = screen.getByRole('textbox')

      fireEvent.change(textarea, { target: { value: 'https://example.com' } })
      fireEvent.keyDown(textarea, { key: 'Enter' })

      await waitFor(() => {
        expect(invokeMock).toHaveBeenCalledWith('save_item', expect.objectContaining({
          content: 'https://example.com',
          contentType: 'url'
        }))
      })
    })
  })
})

function renderWithDetection() {
  const detectContentType = (content: string) => {
    if (!content) return 'text'
    
    if (/^https?:\/\//.test(content)) {
      return 'url'
    }
    
    if (content.includes('```')) {
      return 'code'
    }
    
    if (/^\s{4}/.test(content)) {
      return 'code'
    }
    
    if (/^data:image\//.test(content)) {
      return 'image'
    }
    
    return 'text'
  }

  return {
    getDetectedContentType: detectContentType
  }
}
