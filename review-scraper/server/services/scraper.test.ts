import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('google-play-scraper', () => {
  const mockReviews = vi.fn();
  return {
    default: {
      reviews: mockReviews,
    },
    sort: {
      NEWEST: 2,
    },
  };
});

import { scrapeReviews, SCRAPER_TIMEOUT_MESSAGE } from './scraper';
import scraperLib from 'google-play-scraper';

interface MockReviewItem {
  id: string;
  userName: string;
  score: number;
  text: string;
  userImage: string;
  date: string;
  scoreText: string;
  url: string;
  version: string;
  originalText: string;
  likeCount: number;
  replyContent: string;
  repliedAt: string;
  reviewCreatedVersion: string;
  title: string;
  replyDate: string;
  replyText: string;
  thumbsUp: number;
  criterias: Array<{ criteria: string; rating: number }>;
}

interface MockReviewsResponse {
  data: MockReviewItem[];
  nextPaginationToken: string | undefined;
}

function createMockReviewItem(overrides: Partial<MockReviewItem> = {}): MockReviewItem {
  return {
    id: '',
    userName: '',
    score: 5,
    text: '',
    userImage: '',
    date: '2025-01-01',
    scoreText: '5',
    url: '',
    version: '',
    originalText: '',
    likeCount: 0,
    replyContent: '',
    repliedAt: '',
    reviewCreatedVersion: '',
    title: '',
    replyDate: '',
    replyText: '',
    thumbsUp: 0,
    criterias: [],
    ...overrides,
  };
}

function createMockResponse(data: MockReviewItem[], token?: string): MockReviewsResponse {
  return {
    data,
    nextPaginationToken: token,
  };
}

describe('scrapeReviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockScraper = vi.mocked(scraperLib.reviews);
    mockScraper.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('count=0 should paginate until token is null (hard cap 10000)', async () => {
    // Mock 3 pages of reviews
    const mockScraper = vi.mocked(scraperLib.reviews);
    
    mockScraper.mockResolvedValueOnce(
      createMockResponse([
        createMockReviewItem({ id: '1', userName: 'User1', score: 5, text: 'Great!' }),
        createMockReviewItem({ id: '2', userName: 'User2', score: 4, text: 'Good' }),
      ], 'token1')
    );
    
    mockScraper.mockResolvedValueOnce(
      createMockResponse([
        createMockReviewItem({ id: '3', userName: 'User3', score: 3, text: 'OK' }),
        createMockReviewItem({ id: '4', userName: 'User4', score: 2, text: 'Bad' }),
      ], 'token2')
    );
    
    mockScraper.mockResolvedValueOnce(
      createMockResponse([
        createMockReviewItem({ id: '5', userName: 'User5', score: 1, text: 'Terrible' }),
      ], undefined)
    );

    const reviews = await scrapeReviews('com.example.app', 0);
    
    expect(reviews).toHaveLength(5);
    expect(reviews[0]).toEqual({
      id: '1',
      userName: 'User1',
      score: 5,
      date: '2025-01-01',
      text: 'Great!',
    });
    expect(reviews[4]).toEqual({
      id: '5',
      userName: 'User5',
      score: 1,
      date: '2025-01-01',
      text: 'Terrible',
    });
    
    // Verify scraper was called 3 times (3 pagination requests)
    expect(mockScraper).toHaveBeenCalledTimes(3);
    
    // Verify throttle and sort parameters on each call
    expect(mockScraper).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'com.example.app',
        throttle: 10,
        sort: 2, // NEWEST constant value
      })
    );
  });

  it('count=100 should fetch exactly 100 reviews when available', async () => {
    const mockScraper = vi.mocked(scraperLib.reviews);
    
    // Mock 2 pages: first 60, second 50 (total 110 available)
    const page1 = Array.from({ length: 60 }, (_, i) =>
      createMockReviewItem({
        id: String(i + 1),
        userName: `User${i + 1}`,
        score: 5,
        text: `Review ${i + 1}`,
      })
    );
    
    const page2 = Array.from({ length: 50 }, (_, i) =>
      createMockReviewItem({
        id: String(i + 61),
        userName: `User${i + 61}`,
        score: 4,
        text: `Review ${i + 61}`,
      })
    );
    
    mockScraper.mockResolvedValueOnce(
      createMockResponse(page1, 'token1')
    );
    
    mockScraper.mockResolvedValueOnce(
      createMockResponse(page2, undefined)
    );

    const reviews = await scrapeReviews('com.example.app', 100);
    
    expect(reviews).toHaveLength(100);
    expect(reviews[0].id).toBe('1');
    expect(reviews[99].id).toBe('100');
  });

  it('hard cap at 10000 reviews even with count=0', async () => {
    const mockScraper = vi.mocked(scraperLib.reviews);
    
    // Mock pages that would exceed 10000
    const reviewsPerPage = 150;
    const pagesToReturn = 70; // 70 * 150 = 10500 reviews available
    
    for (let page = 0; page < pagesToReturn; page++) {
      const startId = page * reviewsPerPage + 1;
      const pageData = Array.from({ length: reviewsPerPage }, (_, i) =>
        createMockReviewItem({
          id: String(startId + i),
          userName: `User${startId + i}`,
          score: 5,
          text: `Review ${startId + i}`,
        })
      );
      
      const token = page < pagesToReturn - 1 ? `token${page + 1}` : undefined;
      mockScraper.mockResolvedValueOnce(
        createMockResponse(pageData, token)
      );
    }

    const reviews = await scrapeReviews('com.example.app', 0);
    
    expect(reviews.length).toBeLessThanOrEqual(10000);
    expect(reviews.length).toBe(10000);
  });

  it('throttle=10 should be passed to scraper calls', async () => {
    const mockScraper = vi.mocked(scraperLib.reviews);
    
    mockScraper.mockResolvedValueOnce(
      createMockResponse([
        createMockReviewItem({ id: '1', userName: 'User1', score: 5, text: 'Test' }),
      ], undefined)
    );

    await scrapeReviews('com.example.app', 1);
    
    expect(mockScraper).toHaveBeenCalledWith(
      expect.objectContaining({
        lang: 'en',
        country: 'us',
        throttle: 10,
      })
    );
  });

  it('NEWEST sort should be used', async () => {
    const mockScraper = vi.mocked(scraperLib.reviews);
    
    mockScraper.mockResolvedValueOnce(
      createMockResponse([
        createMockReviewItem({ id: '1', userName: 'User1', score: 5, text: 'Test' }),
      ], undefined)
    );

    await scrapeReviews('com.example.app', 1);
    
    // Verify sort is set to NEWEST (we'll check the actual sort value in implementation)
    expect(mockScraper).toHaveBeenCalled();
    const call = mockScraper.mock.calls[0][0];
    expect(call).toHaveProperty('sort');
  });

  it('503 error should retry up to 3 times before failing', async () => {
    const mockScraper = vi.mocked(scraperLib.reviews);
    
    mockScraper.mockRejectedValueOnce(new Error('503'));
    mockScraper.mockRejectedValueOnce(new Error('503'));
    mockScraper.mockResolvedValueOnce(
      createMockResponse([
        createMockReviewItem({ id: '1', userName: 'User1', score: 5, text: 'Success' }),
      ], undefined)
    );

    const reviews = await scrapeReviews('com.example.app', 1);
    
    expect(reviews).toHaveLength(1);
    expect(mockScraper).toHaveBeenCalledTimes(3);
  });

  it('503 error should fail after 3 retries', async () => {
    const mockScraper = vi.mocked(scraperLib.reviews);
    
    // All 3 attempts fail with 503
    mockScraper.mockRejectedValue(new Error('503'));

    await expect(scrapeReviews('com.example.app', 1)).rejects.toThrow('503');
    
    // Should be called exactly 3 times (1 initial + 2 retries)
    expect(mockScraper).toHaveBeenCalledTimes(3);
  });

  it('should time out scrape operations after 60 seconds', async () => {
    vi.useFakeTimers();
    const mockScraper = vi.mocked(scraperLib.reviews);
    mockScraper.mockImplementation(
      () => new Promise(() => undefined)
    );

    const scrapePromise = scrapeReviews('com.example.app', 1);
    const timeoutExpectation = expect(scrapePromise).rejects.toThrow(SCRAPER_TIMEOUT_MESSAGE);
    await vi.advanceTimersByTimeAsync(60_000);

    await timeoutExpectation;
  });
});
