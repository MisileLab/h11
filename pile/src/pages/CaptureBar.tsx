import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { ContentType } from '../types'
import '../styles/capture-bar.css'

export default function CaptureBar() {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [content, setContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [showSaveFlash, setShowSaveFlash] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  function detectContentType(text: string): ContentType {
    if (!text) return 'text'

    if (/^https?:\/\//.test(text)) {
      return 'url'
    }

    if (text.includes('```')) {
      return 'code'
    }

    if (/^\s{4}/.test(text)) {
      return 'code'
    }

    if (/^data:image\//.test(text)) {
      return 'image'
    }

    return 'text'
  }

  function expandTextarea(textarea: HTMLTextAreaElement) {
    textarea.style.height = 'auto'
    const newHeight = Math.min(textarea.scrollHeight, 200)
    textarea.style.height = `${newHeight}px`
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value
    setContent(value)
    expandTextarea(e.target)
  }

  async function handleSave() {
    if (!content.trim()) return

    setIsSaving(true)
    setErrorMessage(null)
    const contentType = detectContentType(content)

    try {
      await invoke('save_item', {
        content: content,
        content_type: contentType
      })

      setShowSaveFlash(true)
      await new Promise((resolve) => setTimeout(resolve, 200))
      setShowSaveFlash(false)
      await invoke('close_capture_window')
    } catch (error) {
      console.error('Save failed:', error)
      setShowSaveFlash(false)
      setErrorMessage('Could not save. Try again.')
    } finally {
      setIsSaving(false)
    }
  }

  async function closeCaptureWindow() {
    try {
      await invoke('close_capture_window')
    } catch (error) {
      console.error('Close failed:', error)
      setErrorMessage('Could not close capture window.')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      void closeCaptureWindow()
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) return

        const reader = new FileReader()
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string
          setContent(dataUrl)
          if (textareaRef.current) {
            expandTextarea(textareaRef.current)
          }
        }
        reader.readAsDataURL(file)
        return
      }
    }
  }

  return (
    <div className="capture-bar-container">
      <textarea
        ref={textareaRef}
        className="capture-textarea"
        placeholder="Throw anything in..."
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        disabled={isSaving}
      />
      {showSaveFlash && <div className="save-flash">Saved ✓</div>}
      {errorMessage && <div role="alert">{errorMessage}</div>}
    </div>
  )
}
