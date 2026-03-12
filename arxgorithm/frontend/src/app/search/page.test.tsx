import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SearchPage from './page';
import { api } from '@/lib/api';

// Mock the API client
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
  ApiError: class extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  }
}));

const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

describe('SearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderWithClient = (ui: React.ReactElement) => {
    const testQueryClient = createTestQueryClient();
    return render(
      <QueryClientProvider client={testQueryClient}>
        {ui}
      </QueryClientProvider>
    );
  };

  it('renders search input and category filters', () => {
    renderWithClient(<SearchPage />);
    
    expect(screen.getByPlaceholderText('Search papers...')).toBeInTheDocument();
    expect(screen.getByText('Artificial Intelligence')).toBeInTheDocument();
    expect(screen.getByText('Start searching')).toBeInTheDocument();
  });

  it('shows loading state and fetches results when typing', async () => {
    const mockResponse = {
      papers: [
        {
          arxiv_id: '1234.5678',
          title: 'Test Paper',
          abstract: 'Abstract here',
          authors: ['Author 1'],
          published_at: 1704067200,
          updated_at: 1704067200,
          categories: ['cs.AI'],
          pdf_url: 'http://example.com/pdf'
        }
      ],
      query: 'test',
      count: 1
    };

    vi.mocked(api.get).mockResolvedValueOnce(mockResponse);

    renderWithClient(<SearchPage />);
    
    const input = screen.getByPlaceholderText('Search papers...');
    fireEvent.change(input, { target: { value: 'test' } });

    // Wait for debounce and loading state
    await waitFor(() => {
      expect(screen.getByTestId('search-loading')).toBeInTheDocument();
    });

    // Wait for results
    await waitFor(() => {
      expect(screen.getByText('Test Paper')).toBeInTheDocument();
      expect(screen.getByText('Author 1')).toBeInTheDocument();
    });

    expect(api.get).toHaveBeenCalledWith('/api/search', {
      params: { q: 'test', limit: '20' }
    });
  });

  it('handles category selection', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ papers: [], query: 'test', count: 0 });

    renderWithClient(<SearchPage />);
    
    // Select category first
    fireEvent.click(screen.getByText('Artificial Intelligence'));
    
    // Then type query
    const input = screen.getByPlaceholderText('Search papers...');
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/search', {
        params: { q: 'test', limit: '20', categories: 'cs.AI' }
      });
    });
  });

  it('displays error state on api failure', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Network error'));

    renderWithClient(<SearchPage />);
    
    const input = screen.getByPlaceholderText('Search papers...');
    fireEvent.change(input, { target: { value: 'error query' } });

    await waitFor(() => {
      expect(screen.getByTestId('search-error')).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });
});
