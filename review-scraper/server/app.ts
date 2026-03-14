import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import { registerScrapeRoutes } from "./routes/scrape";

export const app = new Hono();

const isDev = process.env.NODE_ENV !== "production";

if (isDev) {
  app.use(
    cors({
      origin: "http://localhost:5173",
      credentials: true,
    })
  );
} else {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}

app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

registerScrapeRoutes(app);

export default app;
