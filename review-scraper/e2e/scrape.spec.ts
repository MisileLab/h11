import { test, expect } from "@playwright/test";

function mockScrapeSuccess(page: import("@playwright/test").Page) {
  return page.route("**/api/scrape", (route) => {
    const csv = "userName,score,date,text\nAlice,5,2024-01-01,Great app!\n";
    route.fulfill({
      status: 200,
      contentType: "text/csv",
      headers: {
        "Content-Disposition": 'attachment; filename="reviews.csv"',
      },
      body: csv,
    });
  });
}

function mockScrapeError(
  page: import("@playwright/test").Page,
  status = 500,
  message = "Scraper unavailable",
) {
  return page.route("**/api/scrape", (route) => {
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({ error: message }),
    });
  });
}

test.describe("ScrapeForm E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("submit button is disabled when appId is empty", async ({ page }) => {
    const submitBtn = page.getByRole("button", { name: "Scrape Reviews" });
    await expect(submitBtn).toBeDisabled();

    await page.getByLabel("App ID").fill("   ");
    await expect(submitBtn).toBeDisabled();
  });

  test("submit button enables when appId is provided", async ({ page }) => {
    const submitBtn = page.getByRole("button", { name: "Scrape Reviews" });
    await expect(submitBtn).toBeDisabled();

    await page.getByLabel("App ID").fill("com.example.app");
    await expect(submitBtn).toBeEnabled();
  });

  test("successful scrape shows success message and triggers download", async ({
    page,
  }) => {
    await mockScrapeSuccess(page);

    await page.getByLabel("App ID").fill("com.example.app");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Scrape Reviews" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe("reviews-com.example.app.csv");
    await expect(
      page.getByText("Reviews scraped and downloaded successfully!"),
    ).toBeVisible();
    await expect(page.getByLabel("App ID")).toHaveValue("");
  });

  test("negative count is blocked before the request is sent", async ({ page }) => {
    let requestCount = 0;
    await page.route("**/api/scrape", async (route) => {
      requestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "text/csv",
        body: "userName,score,date,text\n",
      });
    });

    await page.getByLabel("App ID").fill("com.example.app");
    await page.getByLabel("Review Count (Optional)").fill("-1");

    await expect(
      page.getByText("Review count cannot be negative. Leave it blank or use 0 to fetch all reviews."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Scrape Reviews" })).toBeDisabled();
    expect(requestCount).toBe(0);
  });

  test("blank and zero count both submit as all reviews", async ({ page }) => {
    const payloads: Array<{ appId: string; count?: number }> = [];
    await page.route("**/api/scrape", async (route) => {
      payloads.push(route.request().postDataJSON() as { appId: string; count?: number });
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Stop after capture" }),
      });
    });

    await page.getByLabel("App ID").fill("com.example.app");
    await page.getByRole("button", { name: "Scrape Reviews" }).click();
    await expect(page.getByText("Stop after capture")).toBeVisible();

    await page.getByLabel("App ID").fill("com.example.app");
    await page.getByLabel("Review Count (Optional)").fill("0");
    await page.getByRole("button", { name: "Scrape Reviews" }).click();
    await expect(page.getByText("Stop after capture")).toBeVisible();

    expect(payloads).toEqual([
      { appId: "com.example.app" },
      { appId: "com.example.app", count: 0 },
    ]);
  });

  test("failed scrape shows error message and Retry button", async ({
    page,
  }) => {
    await mockScrapeError(page, 500, "Scraper unavailable");

    await page.getByLabel("App ID").fill("com.example.app");
    await page.getByRole("button", { name: "Scrape Reviews" }).click();

    await expect(page.getByText("Scraper unavailable")).toBeVisible();

    const retryBtn = page.getByRole("button", { name: "Retry" });
    await expect(retryBtn).toBeVisible();

    await page.unroute("**/api/scrape");
    await mockScrapeSuccess(page);

    const downloadPromise = page.waitForEvent("download");
    await retryBtn.click();
    await downloadPromise;

    await expect(page.getByText("Scraper unavailable")).not.toBeVisible();
    await expect(
      page.getByText("Reviews scraped and downloaded successfully!"),
    ).toBeVisible();
  });

  test("helpful backend edge-case errors stay visible and actionable", async ({ page }) => {
    await mockScrapeError(
      page,
      404,
      "App not found. Check the Google Play app ID and try again.",
    );

    await page.getByLabel("App ID").fill("com.missing.app");
    await page.getByRole("button", { name: "Scrape Reviews" }).click();

    await expect(
      page.getByText("App not found. Check the Google Play app ID and try again."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();

    await page.unroute("**/api/scrape");
    await mockScrapeError(
      page,
      404,
      "No reviews found for this app. Try another app ID or leave count blank or 0 to fetch everything available.",
    );

    await page.getByRole("button", { name: "Retry" }).click();

    await expect(
      page.getByText("No reviews found for this app. Try another app ID or leave count blank or 0 to fetch everything available."),
    ).toBeVisible();
  });

  test("button shows loading state while scraping", async ({ page }) => {
    await page.route("**/api/scrape", async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      const csv = "userName,score,date,text\nBob,4,2024-02-01,Nice\n";
      await route.fulfill({
        status: 200,
        contentType: "text/csv",
        headers: {
          "Content-Disposition": 'attachment; filename="reviews.csv"',
        },
        body: csv,
      });
    });

    await page.getByLabel("App ID").fill("com.example.app");
    await page.getByRole("button", { name: "Scrape Reviews" }).click();

    await expect(
      page.getByRole("button", { name: "Scraping..." }),
    ).toBeDisabled();

    await expect(
      page.getByRole("button", { name: "Scrape Reviews" }),
    ).toBeVisible();
  });

  test("duplicate submits are ignored while a request is in flight", async ({ page }) => {
    let requestCount = 0;
    await page.route("**/api/scrape", async (route) => {
      requestCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Retry me" }),
      });
    });

    await page.getByLabel("App ID").fill("com.example.app");
    await page.locator("form").evaluate((form) => {
      const htmlForm = form as HTMLFormElement;
      htmlForm.requestSubmit();
      htmlForm.requestSubmit();
    });

    await expect(page.getByText("Retry me")).toBeVisible();
    expect(requestCount).toBe(1);
  });
});
