import type { LunaConfig } from "../types/index.ts";

/**
 * Load configuration from environment variables and provide defaults.
 * 
 * Required environment variables:
 * - APP_ID: GitHub App ID
 * - PRIVATE_KEY_PATH: Path to GitHub App private key
 * - WEBHOOK_SECRET: Secret for webhook signature verification
 * 
 * Optional environment variables:
 * - WEBHOOK_PROXY_URL: Webhook proxy URL (e.g., smee.io for local development)
 * - ALLOWED_USER: GitHub username allowed to create PRs (default: misilelab)
 */
function loadConfig(): LunaConfig {
  const appId = process.env.APP_ID;
  const privateKeyPath = process.env.PRIVATE_KEY_PATH;
  const webhookSecret = process.env.WEBHOOK_SECRET;
  const webhookProxyUrl = process.env.WEBHOOK_PROXY_URL;
  const allowedUser = process.env.ALLOWED_USER || "misilelab";

  // Validate required environment variables
  if (!appId) {
    throw new Error(
      "Missing required environment variable: APP_ID\n" +
      "Please set APP_ID to your GitHub App's numeric ID."
    );
  }

  if (!privateKeyPath) {
    throw new Error(
      "Missing required environment variable: PRIVATE_KEY_PATH\n" +
      "Please set PRIVATE_KEY_PATH to the path of your GitHub App's private key file."
    );
  }

  if (!webhookSecret) {
    throw new Error(
      "Missing required environment variable: WEBHOOK_SECRET\n" +
      "Please set WEBHOOK_SECRET to your GitHub App's webhook secret."
    );
  }

  return {
    appId,
    privateKeyPath,
    webhookSecret,
    webhookProxyUrl: webhookProxyUrl || undefined,
    allowedUser,
    ignorePatterns: [
      "**/package-lock.json",
      "**/yarn.lock",
      "**/pnpm-lock.yaml",
      "**/bun.lockb",
      "**/dist/**",
      "**/build/**",
      "**/*.min.js",
      "**/*.d.ts",
    ],
    largePRThreshold: 50,
  };
}

/**
 * Exported config object - validated at module load time.
 * If required environment variables are missing, this will throw immediately.
 */
export const config: LunaConfig = loadConfig();
