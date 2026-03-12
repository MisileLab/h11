/**
 * Shared mock data and API route helpers for E2E tests.
 *
 * All tests intercept backend API calls via Playwright's `page.route()` so that
 * E2E tests are self-contained and do not require a running backend.
 */

import { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

export const MOCK_PAPER_1 = {
  arxiv_id: '2401.00001',
  title: 'Attention Is All You Need — Revisited',
  abstract:
    'We revisit the original Transformer paper and propose improvements to the multi-head attention mechanism.',
  authors: ['Alice Researcher', 'Bob Scientist'],
  categories: ['cs.AI', 'cs.LG'],
  published_at: 1704067200, // 2024-01-01
  updated_at: 1704067200,
  pdf_url: 'https://arxiv.org/pdf/2401.00001.pdf',
  summary: null as string | null,
};

export const MOCK_PAPER_2 = {
  arxiv_id: '2401.00002',
  title: 'Scaling Laws for Neural Language Models',
  abstract:
    'We study empirical scaling laws for language model performance on the cross-entropy loss.',
  authors: ['Carol Expert'],
  categories: ['cs.CL'],
  published_at: 1704153600,
  updated_at: 1704153600,
  pdf_url: 'https://arxiv.org/pdf/2401.00002.pdf',
  summary: null as string | null,
};

export const MOCK_PAPER_3 = {
  arxiv_id: '2401.00003',
  title: 'Diffusion Models Beat GANs on Image Synthesis',
  abstract:
    'We show that diffusion models can achieve image sample quality superior to the current state-of-the-art generative models.',
  authors: ['Dana Author', 'Eve Writer'],
  categories: ['cs.CV'],
  published_at: 1704240000,
  updated_at: 1704240000,
  pdf_url: 'https://arxiv.org/pdf/2401.00003.pdf',
  summary: null as string | null,
};

export const MOCK_USER = {
  id: 1,
  name: 'Test User',
  email: 'test@example.com',
};

// ---------------------------------------------------------------------------
// Route helpers — intercept backend API calls and return mock data
// ---------------------------------------------------------------------------

/**
 * Set up API mocks for an anonymous user (no auth cookie).
 * - GET /api/auth/me → 401
 * - GET /api/reading-list → empty
 * - GET /api/recommendations → mock papers
 * - GET /api/search → filter MOCK_PAPERS by query
 */
export async function setupAnonymousMocks(page: Page) {
  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  // Auth: not logged in
  await page.route(`${API}/api/auth/me`, (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'Not authenticated' }) }),
  );

  // Reading list: empty by default
  await page.route(`${API}/api/reading-list`, (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ papers: [], count: 0 }),
      });
    }
    return route.continue();
  });

  // Recommendations: return mock papers (cold-start / popular)
  await page.route(`${API}/api/recommendations`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ papers: [MOCK_PAPER_1, MOCK_PAPER_2, MOCK_PAPER_3] }),
    }),
  );

  // Search endpoint: simple text filter on title/abstract
  await page.route(`${API}/api/search*`, (route) => {
    const url = new URL(route.request().url());
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const allPapers = [MOCK_PAPER_1, MOCK_PAPER_2, MOCK_PAPER_3];
    const filtered = q
      ? allPapers.filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            p.abstract.toLowerCase().includes(q),
        )
      : allPapers;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ query: q, categories: null, papers: filtered, count: filtered.length }),
    });
  });

  await page.route(`${API}/api/papers/**`, (route) => {
    const url = route.request().url();
    if (route.request().method() === 'POST' && url.includes('/summarize')) {
      const arxivId = url.split('/api/papers/')[1].split('/summarize')[0];
      return route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ arxiv_id: arxivId, status: 'queued' }),
      });
    }
    if (route.request().method() === 'GET') {
      const arxivId = url.split('/api/papers/')[1].split('?')[0];
      const paper = [MOCK_PAPER_1, MOCK_PAPER_2, MOCK_PAPER_3].find(
        (p) => p.arxiv_id === arxivId,
      );
      if (paper) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ paper }),
        });
      }
      return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'Not found' }) });
    }
    return route.continue();
  });

  // Save / unsave reading list item
  await page.route(`${API}/api/reading-list/*`, (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'saved' }),
      });
    }
    if (route.request().method() === 'DELETE') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'removed' }),
      });
    }
    return route.continue();
  });
}

/**
 * Set up mocks for an authenticated user.
 * Reading list pre-populated with MOCK_PAPER_1.
 */
export async function setupAuthenticatedMocks(page: Page) {
  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  // Auth: logged in
  await page.route(`${API}/api/auth/me`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_USER),
    }),
  );

  // Reading list: has paper 1
  await page.route(`${API}/api/reading-list`, (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          papers: [{ ...MOCK_PAPER_1, saved_at: 1704067200 }],
          count: 1,
        }),
      });
    }
    return route.continue();
  });

  // Recommendations: based on history
  await page.route(`${API}/api/recommendations`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ papers: [MOCK_PAPER_2, MOCK_PAPER_3] }),
    }),
  );

  // Search
  await page.route(`${API}/api/search*`, (route) => {
    const url = new URL(route.request().url());
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const allPapers = [MOCK_PAPER_1, MOCK_PAPER_2, MOCK_PAPER_3];
    const filtered = q
      ? allPapers.filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            p.abstract.toLowerCase().includes(q),
        )
      : allPapers;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ query: q, categories: null, papers: filtered, count: filtered.length }),
    });
  });

  // Paper detail + summarize
  await page.route(`${API}/api/papers/**`, (route) => {
    const url = route.request().url();
    if (route.request().method() === 'POST' && url.includes('/summarize')) {
      const arxivId = url.split('/api/papers/')[1].split('/summarize')[0];
      return route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ arxiv_id: arxivId, status: 'queued' }),
      });
    }
    if (route.request().method() === 'GET') {
      const arxivId = url.split('/api/papers/')[1].split('?')[0];
      const paper = [MOCK_PAPER_1, MOCK_PAPER_2, MOCK_PAPER_3].find(
        (p) => p.arxiv_id === arxivId,
      );
      if (paper) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ paper }),
        });
      }
      return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'Not found' }) });
    }
    return route.continue();
  });

  // Save / unsave
  await page.route(`${API}/api/reading-list/*`, (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'saved' }),
      });
    }
    if (route.request().method() === 'DELETE') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'removed' }),
      });
    }
    return route.continue();
  });
}
