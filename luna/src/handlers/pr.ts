import type { Probot, Context } from "probot";
import type { PRContext } from "../types/index.ts";

// Lazy-load config to allow tests to mock env vars before import
let _config: any;
function getConfig() {
  if (!_config) {
    const { config } = require("../config/index.ts");
    _config = config;
  }
  return _config;
}

/**
 * Check if the repository owner matches the configured owner
 */
function isOwner(context: Context): boolean {
  // @ts-expect-error - context.payload.repository is not typed
  const repoOwner = context.payload.repository.owner.login;
  return context.repo().owner === repoOwner;
}

/**
 * Check if PR is a large PR (50+ files) that should be reviewed in summary mode
 */
function isLargePR(context: Context): boolean {
  // @ts-expect-error - pull_request.changed_files exists but not typed
  const changedFiles = context.payload.pull_request?.changed_files || 0;
  return changedFiles >= getConfig().largePRThreshold;
}

/**
 * Extract PR context from webhook payload
 */
function extractPRContext(context: Context): PRContext {
  // @ts-expect-error - payload fields not fully typed
  const { pull_request } = context.payload;
  const { owner, repo } = context.repo();

  return {
    owner,
    repo,
    number: pull_request.number,
    headSha: pull_request.head.sha,
    baseSha: pull_request.base.sha,
    diff: "", // Will be populated by clone/diff utility
    isFork: pull_request.head.repo.id !== pull_request.base.repo.id,
    cloneUrl: pull_request.head.repo.clone_url,
  };
}

/**
 * Process PR review asynchronously (mocked for now - actual implementation in other tasks)
 */
async function processPRReview(
  prContext: PRContext,
  summaryOnly: boolean
): Promise<void> {
  // Placeholder for actual review orchestration (Task 10)
  // This will call: clone repo → generate review → post comments
  console.log(`Processing PR review for ${prContext.owner}/${prContext.repo}#${prContext.number}`);
  console.log(`Summary only: ${summaryOnly}`);
}

/**
 * Handle pull_request webhook events
 */
async function handlePullRequest(context: Context): Promise<void> {
  // Skip draft PRs
  // @ts-expect-error - pull_request.draft exists but not typed
  if (context.payload.pull_request?.draft === true) {
    return;
  }

  // Skip bot-created PRs
  if (context.payload.sender?.type === "Bot") {
    return;
  }

  // Skip non-owner repositories
  if (!isOwner(context)) {
    return;
  }

  // Extract PR context
  const prContext = extractPRContext(context);

  // Check if large PR (50+ files)
  const summaryOnly = isLargePR(context);

  // Respond immediately to webhook, then process async
  setImmediate(async () => {
    try {
      await processPRReview(prContext, summaryOnly);
    } catch (error) {
      console.error("Error processing PR review:", error);
      // Silent fail - don't post error comments to PR (per spec)
    }
  });
}

/**
 * Register PR webhook handlers with Probot app
 */
export function registerPRHandler(app: Probot): void {
  app.on("pull_request.opened", handlePullRequest);
  app.on("pull_request.synchronize", handlePullRequest);
}
