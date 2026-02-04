/**
 * GitHub API wrapper functions for Luna PR Review Bot
 */

import type { ReviewResult, ReviewState } from "../types/index.ts";

// Lazy-load config to avoid module init errors in tests
let _config: any;
function getConfig() {
  if (!_config) {
    const { config } = require("../config/index.ts");
    _config = config;
  }
  return _config;
}

/**
 * Posts a review comment with summary and inline comments to a GitHub PR.
 * 
 * @param context - Probot context object with octokit and PR payload
 * @param reviewResult - Review result containing summary, comments, and verdict
 */
export async function postReviewComment(context: any, reviewResult: ReviewResult): Promise<void> {
  const { owner, repo } = context.repo();
  const pull_number = context.payload.pull_request.number;

  // Transform ReviewComment[] to GitHub API format (path, line, body only)
  const comments = reviewResult.comments
    .filter((comment) => comment.line !== undefined)
    .map((comment) => ({
      path: comment.path,
      line: comment.line!,
      body: comment.body,
    }));

  await context.octokit.pulls.createReview({
    owner,
    repo,
    pull_number,
    event: reviewResult.verdict,
    body: reviewResult.summary.body,
    comments,
  });
}

/**
 * Extracts the last reviewed SHA from the PR body's HTML comment.
 * 
 * @param context - Probot context object with PR payload
 * @returns ReviewState with lastReviewedSha or undefined if not found
 */
export function getReviewState(context: any): ReviewState {
  const body = context.payload.pull_request.body || "";
  const match = body.match(/<!-- luna-reviewed: ([a-z0-9]+) -->/);
  
  return {
    lastReviewedSha: match ? match[1] : undefined,
  };
}

/**
 * Updates the PR body with a new reviewed SHA in an HTML comment.
 * Preserves existing body content, only adds/updates the HTML comment.
 * 
 * @param context - Probot context object with octokit and PR payload
 * @param sha - The commit SHA that was reviewed
 */
export async function setReviewState(context: any, sha: string): Promise<void> {
  const { owner, repo } = context.repo();
  const pull_number = context.payload.pull_request.number;
  const existingBody = context.payload.pull_request.body || "";

  // Replace existing comment or append new one
  const newBody = existingBody.includes("<!-- luna-reviewed:")
    ? existingBody.replace(
        /<!-- luna-reviewed: [a-z0-9]+ -->/,
        `<!-- luna-reviewed: ${sha} -->`
      )
    : `${existingBody}\n<!-- luna-reviewed: ${sha} -->`;

  await context.octokit.pulls.update({
    owner,
    repo,
    pull_number,
    body: newBody,
  });
}

/**
 * Fetches the diff for a PR using the GitHub API.
 * 
 * @param context - Probot context object with octokit and PR payload
 * @returns Diff string in unified diff format
 */
export async function getPRDiff(context: any): Promise<string> {
  const { owner, repo } = context.repo();
  const pull_number = context.payload.pull_request.number;

  const { data } = await context.octokit.pulls.get({
    owner,
    repo,
    pull_number,
    mediaType: { format: "diff" },
  });

  return data as unknown as string;
}

/**
 * Checks if a PR is considered "large" based on file count threshold.
 * 
 * @param context - Probot context object with PR payload
 * @returns True if PR has >= largePRThreshold changed files
 */
export function isLargePR(context: any): boolean {
  const changedFiles = context.payload.pull_request.changed_files;
  return changedFiles >= getConfig().largePRThreshold;
}
