import { Hono } from "hono";
import scraperLib from "google-play-scraper";
import {
  SCRAPER_COUNTRY,
  SCRAPER_LANG,
  SCRAPER_THROTTLE,
  scrapeReviews,
  withScrapeTimeout,
} from "../services/scraper";
import { reviewsToCSV } from "../../src/lib/csv";
import { normalizeAppId, validateCountValue } from "../../src/lib/validation";

function isAppNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("404") || message.includes("not found");
}

async function resolveEmptyReviewsResponse(appId: string) {
  try {
    await withScrapeTimeout(
      scraperLib.app({
        appId,
        lang: SCRAPER_LANG,
        country: SCRAPER_COUNTRY,
        throttle: SCRAPER_THROTTLE,
      }),
    );
    return {
      status: 404 as const,
      error: "No reviews found for this app. Try another app ID or leave count blank or 0 to fetch everything available.",
    };
  } catch (error) {
    if (isAppNotFoundError(error)) {
      return {
        status: 404 as const,
        error: "App not found. Check the Google Play app ID and try again.",
      };
    }

    return {
      status: 502 as const,
      error: "Unable to confirm the app details right now. Please retry in a moment.",
    };
  }
}

export function registerScrapeRoutes(app: Hono) {
  app.post("/api/scrape", async (c) => {
    try {
      const body = await c.req.json<{ appId?: unknown; count?: unknown }>();
      const appId = typeof body.appId === "string" ? normalizeAppId(body.appId) : "";

      if (!appId) {
        return c.json({ error: "Missing or invalid appId" }, 400);
      }

      const countValidation = validateCountValue(body.count);
      if ("error" in countValidation) {
        return c.json({ error: countValidation.error }, 400);
      }

      const reviews = await scrapeReviews(appId, countValidation.count);
      if (reviews.length === 0) {
        const emptyResponse = await resolveEmptyReviewsResponse(appId);
        return c.json({ error: emptyResponse.error }, { status: emptyResponse.status });
      }

      const csv = reviewsToCSV(reviews);

      return c.body(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": 'attachment; filename="reviews.csv"',
        },
      });
    } catch (error) {
      if (isAppNotFoundError(error)) {
        return c.json({ error: "App not found. Check the Google Play app ID and try again." }, 404);
      }

      const message = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: message }, 500);
    }
  });
}
