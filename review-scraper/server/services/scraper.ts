import scraperLib from 'google-play-scraper';

export const SCRAPER_TIMEOUT_MS = 60_000;
export const SCRAPER_TIMEOUT_MESSAGE = 'Scrape timed out after 60 seconds. Please try again.';
export const SCRAPER_LANG = 'en';
export const SCRAPER_COUNTRY = 'us';
export const SCRAPER_THROTTLE = 10;

export interface Review {
  id: string;
  userName: string;
  score: number;
  date: string;
  text: string;
}

/**
 * Scrapes reviews from Google Play Store with retry and pagination logic.
 * @param appId Google Play app ID
 * @param count Number of reviews to fetch. 0 = all reviews (up to hard cap 10000)
 * @returns Array of reviews
 */
export async function withScrapeTimeout<T>(operation: Promise<T>, message = SCRAPER_TIMEOUT_MESSAGE): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, SCRAPER_TIMEOUT_MS);

    operation.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

async function scrapeReviewsInternal(appId: string, count: number): Promise<Review[]> {
  const MAX_REVIEWS = 10000;
  const MAX_RETRIES = 3;
  
  const reviews: Review[] = [];
  let nextToken: string | null = null;
  let attempts = 0;

  while (true) {
    try {
      // Determine how many reviews to request in this batch
      const remaining = count === 0 ? MAX_REVIEWS - reviews.length : count - reviews.length;
      
      // Break if we've reached the target or hard cap
      if (remaining <= 0) break;

      const result = await scraperLib.reviews({
        appId,
        lang: SCRAPER_LANG,
        country: SCRAPER_COUNTRY,
        throttle: SCRAPER_THROTTLE,
        sort: 2, // NEWEST constant from google-play-scraper
        ...(nextToken ? { nextPaginationToken: nextToken } : {}),
      });

      if (!result.data || result.data.length === 0) break;

      const extractedReviews: Review[] = result.data.map(item => ({
        id: item.id,
        userName: item.userName,
        score: item.score,
        date: item.date,
        text: item.text,
      }));
      reviews.push(...extractedReviews);
      nextToken = result.nextPaginationToken ?? null;
      attempts = 0; // Reset retry counter on success

      // Stop if no next page (reached end) or if we've collected enough reviews
      if (!nextToken || reviews.length >= (count === 0 ? MAX_REVIEWS : count)) {
        break;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      if (errorMsg.includes('503')) {
        attempts++;
        if (attempts >= MAX_RETRIES) {
          throw error;
        }
        const delay = Math.pow(2, attempts - 1) * 1000; // 1s, 2s, 4s backoff
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      
      throw error;
    }
  }

  // Slice to exact count if requested, or hard cap
  const target = count === 0 ? MAX_REVIEWS : count;
  return reviews.slice(0, target);
}

export function scrapeReviews(appId: string, count: number): Promise<Review[]> {
  return withScrapeTimeout(scrapeReviewsInternal(appId, count));
}
