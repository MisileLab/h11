# Review Scraper

A lightweight web tool for scraping Google Play Store reviews and exporting them to CSV format. Built with React, Vite, and Hono.

## Features

- Scrape reviews from any Google Play Store app by ID.
- Flexible count: Specify exact number of reviews or fetch all.
- CSV Export: Download results directly as a structured CSV file.
- Modern UI: Clean interface with loading states and error handling.
- Robust Backend: Service-layer retry logic for handling transient Play Store errors.

## Prerequisites

- **Node.js**: v18 or higher recommended.
- **pnpm**: v10+ (used as the package manager).

## Getting Started

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Run in development mode**:
   ```bash
   pnpm dev
   ```
   This starts both the Vite frontend (port 5173) and the Hono server (port 3000) concurrently.

3. **Access the app**:
   Open [http://localhost:5173](http://localhost:5173) in your browser.

## API Usage

### `POST /api/scrape`

Scrapes reviews for a specific application.

**Request Body:**
- `appId` (string, required): The Google Play app ID (e.g., `com.google.android.apps.docs`).
- `count` (number, optional): Number of reviews to fetch. Set to `0` or leave blank to fetch all reviews.

**Response:**
- Returns a CSV file with `Content-Type: text/csv`.
- Columns: `userName`, `score`, `date`, `text`.

## Testing

- **Unit Tests** (Vitest):
  ```bash
  pnpm test
  ```
  Covers CSV generation logic, scraper service retries, and API route validation.

- **E2E Tests** (Playwright):
  ```bash
  pnpm build
  pnpm e2e
  ```
  Verifies the full user flow from form submission to file download using mocked network responses.

## Production Build

To create a production-ready build:
```bash
pnpm build
```
This generates static files in `dist/` and compiles the server.

## Known Limitations

- **Scraping Dependency**: This tool relies on `google-play-scraper`, which uses web scraping. Changes to the Google Play Store structure may temporarily break the scraper until the underlying library is updated.
- **Hard Cap**: Individual scrape requests are capped at 10,000 reviews to ensure performance and avoid excessive rate limiting.
- **Regional Variations**: Reviews may vary based on the scraper's IP location/region.
