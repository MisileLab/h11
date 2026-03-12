import { test, expect } from '@playwright/test';
import { MOCK_PAPER_1, MOCK_PAPER_2, MOCK_PAPER_3, MOCK_USER } from './helpers';

test.describe('Recommendations Based on History', () => {
  test('anonymous user sees popular papers (cold-start)', async ({ page }) => {
    const API = 'http://localhost:8000';

    // Anonymous: no auth
    await page.route(`${API}/api/auth/me`, (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'Not authenticated' }) }),
    );

    // Empty reading list (no history)
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

    // Recommendations: popular papers (cold-start)
    await page.route(`${API}/api/recommendations`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ papers: [MOCK_PAPER_1, MOCK_PAPER_2, MOCK_PAPER_3] }),
      }),
    );

    await page.goto('/');

    // Should show "Popular papers" heading (cold-start, no history)
    await expect(page.getByText('Popular papers')).toBeVisible({ timeout: 10_000 });

    // Should show all 3 mock papers
    await expect(page.getByText(MOCK_PAPER_1.title)).toBeVisible();
    await expect(page.getByText(MOCK_PAPER_2.title)).toBeVisible();
    await expect(page.getByText(MOCK_PAPER_3.title)).toBeVisible();
  });

  test('authenticated user with history sees personalized recommendations', async ({ page }) => {
    const API = 'http://localhost:8000';

    // Logged in
    await page.route(`${API}/api/auth/me`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_USER),
      }),
    );

    // Has reading history (paper 1 saved)
    await page.route(`${API}/api/reading-list`, (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            papers: [{ paper_id: MOCK_PAPER_1.arxiv_id, saved_at: 1704067200, paper: MOCK_PAPER_1 }],
            count: 1,
          }),
        });
      }
      return route.continue();
    });

    // Recommendations based on history (papers 2 and 3, not paper 1 which is already saved)
    await page.route(`${API}/api/recommendations`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ papers: [MOCK_PAPER_2, MOCK_PAPER_3] }),
      }),
    );

    await page.goto('/');

    // Should show "Based on your reading history"
    await expect(page.getByText('Based on your reading history')).toBeVisible({ timeout: 10_000 });

    // Should show recommended papers (not the already-saved one)
    await expect(page.getByText(MOCK_PAPER_2.title)).toBeVisible();
    await expect(page.getByText(MOCK_PAPER_3.title)).toBeVisible();
  });

  test('recommendation cards link to paper detail', async ({ page }) => {
    const API = 'http://localhost:8000';

    await page.route(`${API}/api/auth/me`, (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'Not authenticated' }) }),
    );
    await page.route(`${API}/api/reading-list`, (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ papers: [], count: 0 }) });
      }
      return route.continue();
    });
    await page.route(`${API}/api/recommendations`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ papers: [MOCK_PAPER_1] }) }),
    );

    // Paper detail route
    await page.route(`${API}/api/papers/**`, (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ paper: MOCK_PAPER_1 }),
        });
      }
      return route.continue();
    });

    await page.goto('/');
    await expect(page.getByText(MOCK_PAPER_1.title)).toBeVisible({ timeout: 10_000 });

    // Click the paper card
    await page.getByText(MOCK_PAPER_1.title).click();
    await expect(page).toHaveURL(/\/paper\/2401\.00001/);
    await expect(page.getByRole('heading', { name: MOCK_PAPER_1.title })).toBeVisible({ timeout: 10_000 });
  });
});
