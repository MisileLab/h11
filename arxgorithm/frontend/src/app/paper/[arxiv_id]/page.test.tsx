import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PaperPage from './page';
import { api, ApiError } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  }
}));

const mockPaper = {
  arxiv_id: '1234.56789',
  title: 'Test Paper Title',
  abstract: 'This is a test abstract.',
  authors: ['Author A', 'Author B'],
  published_at: 1704067200, // Jan 1, 2024
  updated_at: 1704067200,
  categories: ['cs.AI', 'cs.LG'],
  pdf_url: 'http://example.com/pdf',
  summary: null,
};

describe('PaperDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', async () => {
    vi.mocked(api.get).mockImplementation(() => new Promise(() => {}));
    
    render(<PaperPage params={{ arxiv_id: '1234.56789' }} />);
    
    const spinners = document.querySelectorAll('.animate-spin');
    expect(spinners.length).toBeGreaterThan(0);
  });

  it('renders paper details successfully', async () => {
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url.startsWith('/api/papers/')) {
        return { paper: mockPaper };
      }
      if (url === '/api/reading-list') {
        return { papers: [], count: 0 };
      }
      return {};
    });

    render(<PaperPage params={{ arxiv_id: '1234.56789' }} />);

    await waitFor(() => {
      expect(screen.getByText('Test Paper Title')).toBeInTheDocument();
      expect(screen.getByText('Author A, Author B')).toBeInTheDocument();
      expect(screen.getByText('This is a test abstract.')).toBeInTheDocument();
      expect(screen.getByText('cs.AI')).toBeInTheDocument();
      expect(screen.getByText('cs.LG')).toBeInTheDocument();
      expect(screen.getByText('No summary available for this paper yet.')).toBeInTheDocument();
    });
  });

  it('shows generated summary if available', async () => {
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url.startsWith('/api/papers/')) {
        return { paper: { ...mockPaper, summary: 'This is an AI summary.' } };
      }
      if (url === '/api/reading-list') {
        return { papers: [], count: 0 };
      }
      return {};
    });

    render(<PaperPage params={{ arxiv_id: '1234.56789' }} />);

    await waitFor(() => {
      expect(screen.getByText('Test Paper Title')).toBeInTheDocument();
      expect(screen.getByText('This is an AI summary.')).toBeInTheDocument();
      expect(screen.queryByText('No summary available for this paper yet.')).not.toBeInTheDocument();
    });
  });

  it('handles generating summary', async () => {
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url.startsWith('/api/papers/')) {
        return { paper: mockPaper };
      }
      if (url === '/api/reading-list') {
        return { papers: [], count: 0 };
      }
      return {};
    });
    
    vi.mocked(api.post).mockResolvedValueOnce({ arxiv_id: '1234.56789', status: 'queued' });

    render(<PaperPage params={{ arxiv_id: '1234.56789' }} />);

    await waitFor(() => {
      expect(screen.getByText('Generate Summary')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Generate Summary'));

    await waitFor(() => {
      expect(screen.getByText('Generating AI summary...')).toBeInTheDocument();
      expect(api.post).toHaveBeenCalledWith('/api/papers/1234.56789/summarize');
    });
  });

  it('toggles save state', async () => {
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url.startsWith('/api/papers/')) {
        return { paper: mockPaper };
      }
      if (url === '/api/reading-list') {
        return { papers: [], count: 0 };
      }
      return {};
    });

    vi.mocked(api.post).mockResolvedValueOnce({});
    vi.mocked(api.delete).mockResolvedValueOnce({});

    render(<PaperPage params={{ arxiv_id: '1234.56789' }} />);

    await waitFor(() => {
      expect(screen.getByText('Save')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument();
      expect(api.post).toHaveBeenCalledWith('/api/reading-list/1234.56789');
    });

    const unsaveButton = screen.getByText('Saved');
    fireEvent.click(unsaveButton);

    await waitFor(() => {
      expect(screen.getByText('Save')).toBeInTheDocument();
      expect(api.delete).toHaveBeenCalledWith('/api/reading-list/1234.56789');
    });
  });

  it('handles error state (404)', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(404, 'Paper not found'));

    render(<PaperPage params={{ arxiv_id: 'invalid-id' }} />);

    await waitFor(() => {
      expect(screen.getByText('Paper not found.')).toBeInTheDocument();
    });
  });
});
