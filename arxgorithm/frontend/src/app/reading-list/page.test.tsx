import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReadingListPage from './page';
import { api } from '@/lib/api';

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

const mockPapers = [
  {
    arxiv_id: '1234.5678',
    title: 'Test Paper 1',
    abstract: 'This is a test abstract 1.',
    authors: ['Author 1', 'Author 2'],
    published_at: 1672531200,
    updated_at: 1672531200,
    categories: ['cs.AI'],
    pdf_url: 'https://arxiv.org/pdf/1234.5678.pdf',
    saved_at: 1672531200,
  },
  {
    arxiv_id: '8765.4321',
    title: 'Test Paper 2',
    abstract: 'This is a test abstract 2.',
    authors: ['Author 3'],
    published_at: 1672617600,
    updated_at: 1672617600,
    categories: ['cs.LG'],
    pdf_url: 'https://arxiv.org/pdf/8765.4321.pdf',
    saved_at: 1672617600,
  }
];

describe('ReadingListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton initially', () => {
    // Create a promise that doesn't resolve immediately to keep it in loading state
    vi.mocked(api.get).mockImplementation(() => new Promise(() => {}));

    render(<ReadingListPage />);
    
    expect(screen.getByTestId('reading-list-loading')).toBeInTheDocument();
  });

  it('renders empty state when no papers are saved', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      papers: [],
      count: 0
    });

    render(<ReadingListPage />);
    
    await waitFor(() => {
      expect(screen.getByTestId('reading-list-empty')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Your reading list is empty')).toBeInTheDocument();
    expect(screen.getByText('Explore Papers')).toHaveAttribute('href', '/');
  });

  it('renders saved papers', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      papers: mockPapers,
      count: 2
    });

    render(<ReadingListPage />);
    
    await waitFor(() => {
      expect(screen.getByTestId('reading-list-populated')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Test Paper 1')).toBeInTheDocument();
    expect(screen.getByText('Test Paper 2')).toBeInTheDocument();
    expect(screen.getByText('2 papers saved')).toBeInTheDocument();
  });

  it('removes paper when clicking remove button', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      papers: mockPapers,
      count: 2
    });
    
    vi.mocked(api.delete).mockResolvedValueOnce({});

    render(<ReadingListPage />);
    
    await waitFor(() => {
      expect(screen.getByTestId('reading-list-populated')).toBeInTheDocument();
    });
    
    // Find the remove button for the first paper
    // Since PaperCard uses the SVG icon, we can find it by title or aria-label
    const removeButtons = screen.getAllByRole('button', { name: /Remove from reading list/i });
    expect(removeButtons).toHaveLength(2);
    
    fireEvent.click(removeButtons[0]);
    
    // Verify API was called
    expect(api.delete).toHaveBeenCalledWith('/api/reading-list/1234.5678');
    
    // UI should optimistically update and remove the first paper
    await waitFor(() => {
      expect(screen.queryByText('Test Paper 1')).not.toBeInTheDocument();
      expect(screen.getByText('Test Paper 2')).toBeInTheDocument();
    });
  });

  it('shows error state when API fails', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('API Error'));

    render(<ReadingListPage />);
    
    await waitFor(() => {
      expect(screen.getByTestId('reading-list-error')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Failed to load your reading list. Please try again later.')).toBeInTheDocument();
    
    // Try again button should exist
    const tryAgainButton = screen.getByRole('button', { name: /Try Again/i });
    expect(tryAgainButton).toBeInTheDocument();
    
    // Mock success for second try
    vi.mocked(api.get).mockResolvedValueOnce({
      papers: [],
      count: 0
    });
    
    fireEvent.click(tryAgainButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('reading-list-empty')).toBeInTheDocument();
    });
  });
});
