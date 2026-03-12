import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { api, ApiError } from './api';

describe('API Client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
    process.env.NEXT_PUBLIC_API_URL = 'http://test.api';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should construct URLs correctly with params', async () => {
    const mockResponse = { data: 'test' };
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    await api.get('/test', { params: { foo: 'bar', baz: undefined, num: 1 } });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://test.api/test?foo=bar&num=1',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('should handle API errors', async () => {
    (global.fetch as Mock).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: 'Bad Request' }),
    });

    await expect(api.get('/error')).rejects.toThrow(ApiError);
    await expect(api.get('/error')).rejects.toThrow('Bad Request');
  });
});
