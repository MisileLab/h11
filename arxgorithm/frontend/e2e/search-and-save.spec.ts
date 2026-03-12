import { test, expect } from '@playwright/test';
import { setupAnonymousMocks, MOCK_PAPER_1 } from './helpers';

test.describe('Anonymous Search & Save Flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAnonymousMocks(page);
  });

  test('searches for a paper and sees results', async ({ page }) => {
    await page.goto('/search');
    await expect(page.getByRole('heading', { name: 'Search Papers' })).toBeVisible();

    // Type a query that matches MOCK_PAPER_1
    const searchInput = page.getByPlaceholder('Search papers...');
    await searchInput.fill('attention');

    // Wait for debounce + results to appear
    const results = page.getByTestId('search-results');
    await expect(results).toBeVisible({ timeout: 10_000 });

    // Should show the matching paper
    await expect(results.getByText('Attention Is All You Need')).toBeVisible();
  });

  test('navigates to paper detail from search results', async ({ page }) => {
    await page.goto('/search');

    const searchInput = page.getByPlaceholder('Search papers...');
    await searchInput.fill('attention');

    const results = page.getByTestId('search-results');
    await expect(results).toBeVisible({ timeout: 10_000 });

    // Click the paper card (it's a Link)
    await results.getByText('Attention Is All You Need').click();

    // Should navigate to paper detail page
    await expect(page).toHaveURL(/\/paper\/2401\.00001/);
    await expect(page.getByRole('heading', { name: 'Attention Is All You Need' })).toBeVisible();
    await expect(page.getByText('Alice Researcher, Bob Scientist')).toBeVisible();
  });

  test('saves a paper from the detail page', async ({ page }) => {
    // Track API calls
    const saveRequests: string[] = [];
    const API = 'http://localhost:8000';
    await page.route(`${API}/api/reading-list/*`, (route) => {
      if (route.request().method() === 'POST') {
        saveRequests.push(route.request().url());
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

    await page.goto(`/paper/${MOCK_PAPER_1.arxiv_id}`);

    // Wait for paper to load
    await expect(page.getByRole('heading', { name: 'Attention Is All You Need' })).toBeVisible({ timeout: 10_000 });

    // Click Save button
    const saveButton = page.getByRole('button', { name: /Save/i });
    await expect(saveButton).toBeVisible();
    await saveButton.click();

    // Button should change to "Saved" (optimistic update)
    await expect(page.getByRole('button', { name: /Saved/i })).toBeVisible();

    // Verify API was called
    expect(saveRequests.length).toBe(1);
    expect(saveRequests[0]).toContain('2401.00001');
  });

  test('full flow: search → detail → save', async ({ page }) => {
    const saveRequests: string[] = [];
    const API = 'http://localhost:8000';
    await page.route(`${API}/api/reading-list/*`, (route) => {
      if (route.request().method() === 'POST') {
        saveRequests.push(route.request().url());
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

    // Step 1: Go to search page
    await page.goto('/search');

    // Step 2: Search
    await page.getByPlaceholder('Search papers...').fill('scaling');
    await expect(page.getByTestId('search-results')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Scaling Laws for Neural Language Models')).toBeVisible();

    // Step 3: Click paper
    await page.getByText('Scaling Laws for Neural Language Models').click();
    await expect(page).toHaveURL(/\/paper\/2401\.00002/);

    // Step 4: Save it
    await expect(page.getByRole('heading', { name: /Scaling Laws/ })).toBeVisible({ timeout: 10_000 });
    const saveBtn = page.getByRole('button', { name: /Save/i });
    await saveBtn.click();
    await expect(page.getByRole('button', { name: /Saved/i })).toBeVisible();

    expect(saveRequests.length).toBe(1);
  });
});
