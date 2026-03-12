import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Home from './page';
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

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', async () => {
    vi.mocked(api.get).mockImplementation(() => new Promise(() => {}));

    render(<Home />);
    
    expect(screen.getByText('Arxgorithm')).toBeInTheDocument();
    
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows "Popular papers" when history is empty', async () => {
    const mockRecs = [
      {
        arxiv_id: '1111.2222',
        title: 'Popular Paper 1',
        abstract: 'Abstract 1',
        authors: ['Author A'],
        published_at: 1704067200,
        updated_at: 1704067200,
        categories: ['cs.LG'],
        pdf_url: 'http://example.com/pdf1'
      }
    ];

    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/api/reading-list') {
        return { papers: [], count: 0 };
      }
      if (url === '/api/recommendations') {
        return mockRecs;
      }
      return {};
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('Popular papers')).toBeInTheDocument();
      expect(screen.getByText('Popular Paper 1')).toBeInTheDocument();
    });
  });

  it('shows "Based on your reading history" when history exists', async () => {
    const mockRecs = [
      {
        arxiv_id: '3333.4444',
        title: 'Personalized Paper 1',
        abstract: 'Abstract 1',
        authors: ['Author B'],
        published_at: 1704067200,
        updated_at: 1704067200,
        categories: ['cs.AI'],
        pdf_url: 'http://example.com/pdf2'
      }
    ];

    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/api/reading-list') {
        return { 
          papers: [{ arxiv_id: 'some.id', saved_at: 123, ...mockRecs[0] }], 
          count: 1 
        };
      }
      if (url === '/api/recommendations') {
        return { papers: mockRecs };
      }
      return {};
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('Based on your reading history')).toBeInTheDocument();
      expect(screen.getByText('Personalized Paper 1')).toBeInTheDocument();
    });
  });

  it('handles save and unsave toggle', async () => {
    const mockRecs = [
      {
        arxiv_id: '1234.5678',
        title: 'Save Toggle Paper',
        abstract: 'Abstract 1',
        authors: ['Author C'],
        published_at: 1704067200,
        updated_at: 1704067200,
        categories: ['cs.AI'],
        pdf_url: 'http://example.com/pdf2'
      }
    ];

    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/api/reading-list') {
        return { papers: [], count: 0 };
      }
      if (url === '/api/recommendations') {
        return { papers: mockRecs };
      }
      return {};
    });

    vi.mocked(api.post).mockResolvedValueOnce({});
    vi.mocked(api.delete).mockResolvedValueOnce({});

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('Save Toggle Paper')).toBeInTheDocument();
    });

    const saveButton = screen.getByRole('button', { name: 'Save to reading list' });
    
    fireEvent.click(saveButton);
    
    expect(screen.getByRole('button', { name: 'Remove from reading list' })).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/api/reading-list/1234.5678');

    const unsaveButton = screen.getByRole('button', { name: 'Remove from reading list' });
    fireEvent.click(unsaveButton);

    expect(screen.getByRole('button', { name: 'Save to reading list' })).toBeInTheDocument();
    expect(api.delete).toHaveBeenCalledWith('/api/reading-list/1234.5678');
  });

  it('handles error state', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Network failure'));

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load recommendations')).toBeInTheDocument();
      expect(screen.getByText('Network failure')).toBeInTheDocument();
    });
  });
});