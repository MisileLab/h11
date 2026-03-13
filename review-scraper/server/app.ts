import { Hono } from "hono";
import { cors } from "hono/cors";
import { registerScrapeRoutes } from "./routes/scrape";

export const app = new Hono();

// Enable CORS for local development
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

// Health check endpoint
app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

// Register routes
registerScrapeRoutes(app);

export default app;
