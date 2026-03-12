import { test, expect } from '@playwright/test';
import { setupAuthenticatedMocks, MOCK_PAPER_1, MOCK_USER } from './helpers';

test.describe('Authenticated User — Reading List', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedMocks(page);
  });

  test('logged-in user sees their name in the header', async ({ page }) => {
    await page.goto('/');

    // Auth menu should show the user's name
    await expect(page.getByText(MOCK_USER.name)).toBeVisible({ timeout: 10_000 });
  });

  test('reading list page shows saved papers', async ({ page }) => {
    await page.goto('/reading-list');

    // Wait for the reading list to load
    const container = page.getByTestId('reading-list-container');
    await expect(container).toBeVisible({ timeout: 10_000 });

    // Should show paper count
    await expect(container.getByText('1 paper saved')).toBeVisible();

    // Should show MOCK_PAPER_1
    await expect(container.getByText(MOCK_PAPER_1.title)).toBeVisible();
  });

  test('reading list with merged data after login', async ({ page }) => {
    // Simulate merged reading list: anonymous had paper 2, auth had paper 1
    // After merge, both should appear
    const API = 'http://localhost:8000';
    await page.route(`${API}/api/reading-list`, (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            papers: [
              { ...MOCK_PAPER_1, saved_at: 1704067200 },
              {
                arxiv_id: '2401.00002',
                title: 'Scaling Laws for Neural Language Models',
                abstract: 'We study empirical scaling laws for language model performance.',
                authors: ['Carol Expert'],
                categories: ['cs.CL'],
                published_at: 1704153600,
                updated_at: 1704153600,
                pdf_url: 'https://arxiv.org/pdf/2401.00002.pdf',
                summary: null,
                saved_at: 1704100000,
              },
            ],
            count: 2,
          }),
        });
      }
      return route.continue();
    });

    await page.goto('/reading-list');

    const container = page.getByTestId('reading-list-container');
    await expect(container).toBeVisible({ timeout: 10_000 });

    // Should show both papers (merged)
    await expect(container.getByText('2 papers saved')).toBeVisible();
    await expect(container.getByText(MOCK_PAPER_1.title)).toBeVisible();
    await expect(container.getByText('Scaling Laws for Neural Language Models')).toBeVisible();
  });

  test('can navigate from reading list to paper detail', async ({ page }) => {
    await page.goto('/reading-list');

    const container = page.getByTestId('reading-list-container');
    await expect(container).toBeVisible({ timeout: 10_000 });

    // Click the paper card
    await container.getByText(MOCK_PAPER_1.title).click();

    // Should go to paper detail
    await expect(page).toHaveURL(/\/paper\/2401\.00001/);
    await expect(page.getByRole('heading', { name: MOCK_PAPER_1.title })).toBeVisible({ timeout: 10_000 });
  });
});
