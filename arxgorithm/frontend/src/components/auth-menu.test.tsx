import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthMenu } from './auth-menu';
import { useAuth } from '@/hooks/use-auth';

// Mock the hook
vi.mock('@/hooks/use-auth', () => ({
  useAuth: vi.fn(),
}));

describe('AuthMenu', () => {
  const mockLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state', () => {
    vi.mocked(useAuth).mockReturnValue({
      isLoading: true,
      user: undefined,
      error: null,
      logout: mockLogout,
      isLoggingOut: false,
    });

    render(<AuthMenu />);
    expect(screen.queryByText('GitHub')).not.toBeInTheDocument();
    expect(screen.queryByText('Google')).not.toBeInTheDocument();
    expect(screen.queryByText('Sign out')).not.toBeInTheDocument();
  });

  it('renders login buttons when not authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      isLoading: false,
      user: null,
      error: null,
      logout: mockLogout,
      isLoggingOut: false,
    });

    render(<AuthMenu />);
    
    // Dropdown content is hidden by default
    expect(screen.queryByText('GitHub')).not.toBeInTheDocument();
    
    // Click to open dropdown
    const signInBtn = screen.getByText('Sign in');
    fireEvent.click(signInBtn);

    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('Google')).toBeInTheDocument();
    
    // Check links
    expect(screen.getByText('GitHub')).toHaveAttribute('href', expect.stringContaining('/api/auth/github'));
    expect(screen.getByText('Google')).toHaveAttribute('href', expect.stringContaining('/api/auth/google'));
  });

  it('renders user dropdown when authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      isLoading: false,
      user: {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        provider: 'github',
      },
      error: null,
      logout: mockLogout,
      isLoggingOut: false,
    });

    render(<AuthMenu />);
    
    // Dropdown toggle shows user name
    const button = screen.getByRole('button', { name: /Test User/i });
    expect(button).toBeInTheDocument();

    // Dropdown content is hidden by default
    expect(screen.queryByText('Sign out')).not.toBeInTheDocument();

    // Click to open dropdown
    fireEvent.click(button);
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    const signOutBtn = screen.getByText('Sign out');
    expect(signOutBtn).toBeInTheDocument();

    // Click sign out
    fireEvent.click(signOutBtn);
    expect(mockLogout).toHaveBeenCalled();
  });
});
