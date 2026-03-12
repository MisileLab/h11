import { test, expect } from '@playwright/test';
import { setupAnonymousMocks, MOCK_PAPER_1 } from './helpers';

test.describe('Summary Generation', () => {
  test('paper detail shows "Generate Summary" button when no summary exists', async ({ page }) => {
    await setupAnonymousMocks(page);
    await page.goto(`/paper/${MOCK_PAPER_1.arxiv_id}`);

    // Wait for paper to load
    await expect(page.getByRole('heading', { name: MOCK_PAPER_1.title })).toBeVisible({ timeout: 10_000 });

    // Should show the AI Summary section with generate button
    await expect(page.getByRole('heading', { name: 'AI Summary' })).toBeVisible();
    await expect(page.getByText('No summary available for this paper yet.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate Summary' })).toBeVisible();
  });

  test('clicking Generate Summary triggers API call and summary appears', async ({ page }) => {
    const API = 'http://localhost:8000';
    const summarizeRequests: string[] = [];
    let summarizeTriggered = false;
    let pollAfterSummarize = 0;

    // Set up anonymous mocks but override paper detail for summary polling
    await setupAnonymousMocks(page);

    // Override the paper detail route to track summarize calls and simulate completion
    await page.route(`${API}/api/papers/**`, (route) => {
      const url = route.request().url();

      if (route.request().method() === 'POST' && url.includes('/summarize')) {
        summarizeRequests.push(url);
        summarizeTriggered = true;
        return route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({ arxiv_id: MOCK_PAPER_1.arxiv_id, status: 'queued' }),
        });
      }

      // GET paper detail — only return summary after summarize was triggered + 1 poll
      if (route.request().method() === 'GET') {
        const arxivId = url.split('/api/papers/')[1].split('?')[0];
        if (arxivId === MOCK_PAPER_1.arxiv_id) {
          const paper = { ...MOCK_PAPER_1 };
          if (summarizeTriggered) {
            pollAfterSummarize++;
            // Return summary on the 2nd poll after summarize was triggered
            if (pollAfterSummarize >= 2) {
              paper.summary = 'This paper revisits the original Transformer architecture and proposes key improvements to multi-head attention.';
            }
          }
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

    await page.goto(`/paper/${MOCK_PAPER_1.arxiv_id}`);
    await expect(page.getByRole('heading', { name: MOCK_PAPER_1.title })).toBeVisible({ timeout: 10_000 });

    // Click Generate Summary
    await page.getByRole('button', { name: 'Generate Summary' }).click();

    // Verify the loading state appears (the component sets isGeneratingSummary=true)
    await expect(page.getByText('Generating AI summary...')).toBeVisible({ timeout: 10_000 });

    // Verify API was called
    expect(summarizeRequests.length).toBe(1);
    expect(summarizeRequests[0]).toContain(MOCK_PAPER_1.arxiv_id);

    // Eventually the summary should appear (polling resolves)
    await expect(
      page.getByText('This paper revisits the original Transformer architecture'),
    ).toBeVisible({ timeout: 15_000 });

    // Generate button should be gone now
    await expect(page.getByRole('button', { name: 'Generate Summary' })).not.toBeVisible();
  });

  test('paper with existing summary displays it immediately', async ({ page }) => {
    const API = 'http://localhost:8000';
    const paperWithSummary = {
      ...MOCK_PAPER_1,
      summary: 'A comprehensive overview of improvements to the multi-head attention mechanism in Transformers.',
    };

    // Override paper detail to return paper with summary
    await setupAnonymousMocks(page);
    await page.route(`${API}/api/papers/**`, (route) => {
      if (route.request().method() === 'GET') {
        const url = route.request().url();
        const arxivId = url.split('/api/papers/')[1].split('?')[0];
        if (arxivId === MOCK_PAPER_1.arxiv_id) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ paper: paperWithSummary }),
          });
        }
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'Not found' }) });
      }
      return route.continue();
    });

    await page.goto(`/paper/${MOCK_PAPER_1.arxiv_id}`);
    await expect(page.getByRole('heading', { name: MOCK_PAPER_1.title })).toBeVisible({ timeout: 10_000 });

    // Summary should be displayed
    await expect(
      page.getByText('A comprehensive overview of improvements to the multi-head attention mechanism'),
    ).toBeVisible();

    // No "Generate Summary" button
    await expect(page.getByRole('button', { name: 'Generate Summary' })).not.toBeVisible();
  });
});
