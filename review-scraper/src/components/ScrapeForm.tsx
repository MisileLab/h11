import { useRef, useState, type ComponentProps } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { normalizeAppId, parseCountInput } from "@/lib/validation";

export function ScrapeForm() {
  const [appId, setAppId] = useState("");
  const [count, setCount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inFlightRef = useRef(false);

  const countValidation = parseCountInput(count);
  const countError = countValidation.error ?? null;

  const executeScrape = async (skipInFlightLock = false) => {
    const normalizedAppId = normalizeAppId(appId);

    if (!normalizedAppId || (!skipInFlightLock && inFlightRef.current)) return;

    if (countValidation.error) {
      setSuccess(false);
      setError(countValidation.error);
      return;
    }

    if (!skipInFlightLock) {
      inFlightRef.current = true;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const payload: { appId: string; count?: number } = { appId: normalizedAppId };
      if (countValidation.count !== undefined) {
        payload.count = countValidation.count;
      }

      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let errorMessage = `Error: ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          // ignore
        }
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reviews-${normalizedAppId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setSuccess(true);
      setAppId("");
      setCount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to scrape reviews");
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  };

  const handleSubmit = async (
    e: Parameters<NonNullable<ComponentProps<"form">["onSubmit"]>>[0],
  ) => {
    e.preventDefault();

    if (inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    await executeScrape(true);
  };

  const isSubmitDisabled = !appId.trim() || isLoading || !!countError;

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Google Play Review Scraper</CardTitle>
        <CardDescription>
          Enter an App ID to scrape user reviews and download them as a CSV file.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {success && (
            <div className="p-3 bg-green-50 text-green-900 border border-green-200 dark:bg-green-900/20 dark:text-green-200 dark:border-green-900/50 rounded-md text-sm">
              Reviews scraped and downloaded successfully!
            </div>
          )}

          {error && (
            <div className="p-3 bg-destructive/15 text-destructive border border-destructive/20 rounded-md text-sm flex flex-col gap-3">
              <p>{error}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void executeScrape()} className="w-fit h-8">
                Retry
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="appId" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              App ID
            </label>
            <Input
              id="appId"
              placeholder="e.g., com.google.android.youtube"
              value={appId}
              onChange={(e) => {
                setAppId(e.target.value);
                setSuccess(false);
                setError(null);
              }}
              required
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="count" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Review Count (Optional)
            </label>
            <Input
              id="count"
              type="text"
              inputMode="numeric"
              placeholder="Leave blank or use 0 for all reviews"
              value={count}
              onChange={(e) => {
                setCount(e.target.value);
                setSuccess(false);
                setError(null);
              }}
              min="0"
              step="1"
              disabled={isLoading}
              aria-invalid={countError ? true : undefined}
            />
            <p className="text-xs text-muted-foreground">Leave blank or use 0 to fetch all available reviews.</p>
            {countError && <p className="text-sm text-destructive">{countError}</p>}
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={isSubmitDisabled}>
            {isLoading ? "Scraping..." : "Scrape Reviews"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
