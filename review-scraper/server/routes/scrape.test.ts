import { describe, it, expect, vi, beforeEach } from "vitest";
import { app } from "../app";
import * as scraperModule from "../services/scraper";
import type { Review } from "../services/scraper";
import * as csvModule from "../../src/lib/csv";
import scraperLib from "google-play-scraper";

// Mock the scraper and CSV modules
vi.mock("../services/scraper", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/scraper")>();
  return {
    ...actual,
    scrapeReviews: vi.fn(),
  };
});
vi.mock("../../src/lib/csv");
vi.mock("google-play-scraper", () => ({
  default: {
    app: vi.fn(),
  },
}));

describe("POST /api/scrape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(scraperLib.app).mockReset();
  });

  it("should return CSV with text/csv content-type on success", async () => {
    const mockReviews = [
      { id: "1", userName: "Alice", score: 5, date: "2024-01-01", text: "Great app!" },
      { id: "2", userName: "Bob", score: 3, date: "2024-01-02", text: "Ok app" },
    ];
    const mockCSV = "userName,score,date,text\nAlice,5,2024-01-01,Great app!\nBob,3,2024-01-02,Ok app\n";

    vi.mocked(scraperModule.scrapeReviews).mockResolvedValueOnce(mockReviews);
    vi.mocked(csvModule.reviewsToCSV).mockReturnValueOnce(mockCSV);

    const req = new Request("http://localhost/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: "com.example.app", count: 10 }),
    });

    const res = await app.request(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    expect(await res.text()).toBe(mockCSV);
  });

  it("should call scrapeReviews with correct appId and count", async () => {
    const mockReviews: Review[] = [];
    vi.mocked(scraperModule.scrapeReviews).mockResolvedValueOnce(mockReviews);
    vi.mocked(csvModule.reviewsToCSV).mockReturnValueOnce("userName,score,date,text\n");

    const req = new Request("http://localhost/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: "com.test.app", count: 50 }),
    });

    await app.request(req);

    expect(scraperModule.scrapeReviews).toHaveBeenCalledWith("com.test.app", 50);
  });

  it("should treat missing count as 0", async () => {
    const mockReviews: Review[] = [];
    vi.mocked(scraperModule.scrapeReviews).mockResolvedValueOnce(mockReviews);
    vi.mocked(csvModule.reviewsToCSV).mockReturnValueOnce("userName,score,date,text\n");

    const req = new Request("http://localhost/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: "com.test.app" }),
    });

    await app.request(req);

    expect(scraperModule.scrapeReviews).toHaveBeenCalledWith("com.test.app", 0);
  });

  it("should return 400 if appId is missing", async () => {
    const req = new Request("http://localhost/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: 10 }),
    });

    const res = await app.request(req);

    expect(res.status).toBe(400);
  });

  it("should return 400 if appId is empty string", async () => {
    const req = new Request("http://localhost/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: "", count: 10 }),
    });

    const res = await app.request(req);

    expect(res.status).toBe(400);
  });

  it("should return 400 if count is negative", async () => {
    const req = new Request("http://localhost/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: "com.test.app", count: -1 }),
    });

    const res = await app.request(req);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Review count cannot be negative. Leave it blank or use 0 to fetch all reviews.",
    });
  });

  it("should return 400 if count exceeds 10000", async () => {
    const req = new Request("http://localhost/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: "com.test.app", count: 10001 }),
    });

    const res = await app.request(req);

    expect(res.status).toBe(400);
  });

  it("should call reviewsToCSV with scraped reviews", async () => {
    const mockReviews = [
      { id: "1", userName: "User1", score: 4, date: "2024-01-01", text: "Good" },
    ];
    vi.mocked(scraperModule.scrapeReviews).mockResolvedValueOnce(mockReviews);
    vi.mocked(csvModule.reviewsToCSV).mockReturnValueOnce("userName,score,date,text\nUser1,4,2024-01-01,Good\n");

    const req = new Request("http://localhost/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: "com.test.app", count: 5 }),
    });

    await app.request(req);

    expect(csvModule.reviewsToCSV).toHaveBeenCalledWith(mockReviews);
  });

  it("should return helpful app not found error when scrape returns no reviews and app lookup fails", async () => {
    vi.mocked(scraperModule.scrapeReviews).mockResolvedValueOnce([]);
    vi.mocked(scraperLib.app).mockRejectedValueOnce(new Error("404 Not Found"));

    const req = new Request("http://localhost/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: "com.missing.app", count: 0 }),
    });

    const res = await app.request(req);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "App not found. Check the Google Play app ID and try again.",
    });
  });

  it("should return no reviews found error when scrape returns no reviews for an existing app", async () => {
    vi.mocked(scraperModule.scrapeReviews).mockResolvedValueOnce([]);
    vi.mocked(scraperLib.app).mockResolvedValueOnce({ appId: "com.example.app" } as never);

    const req = new Request("http://localhost/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: "com.example.app", count: 0 }),
    });

    const res = await app.request(req);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "No reviews found for this app. Try another app ID or leave count blank or 0 to fetch everything available.",
    });
  });

  it("should enforce english US app lookup when empty reviews need classification", async () => {
    vi.mocked(scraperModule.scrapeReviews).mockResolvedValueOnce([]);
    vi.mocked(scraperLib.app).mockResolvedValueOnce({ appId: "com.example.app" } as never);

    const req = new Request("http://localhost/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: "com.example.app", count: 0 }),
    });

    await app.request(req);

    expect(scraperLib.app).toHaveBeenCalledWith({
      appId: "com.example.app",
      lang: "en",
      country: "us",
      throttle: 10,
    });
  });
});
