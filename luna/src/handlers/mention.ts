import type { Probot, Context } from "probot";
import { createSession, sendPrompt, closeSession } from "../utils/opencode.ts";

/**
 * Detect if comment contains @luna mention (case insensitive, word boundary)
 */
function hasMention(commentBody: string): boolean {
  return /\b@luna\b/i.test(commentBody);
}

/**
 * Extract text after @luna mention
 */
function extractRequest(commentBody: string): string {
  const match = commentBody.match(/\b@luna\b\s+(.*)/i);
  return match ? match[1].trim() : "";
}

/**
 * Process mention and post AI response (extracted for testing)
 */
export async function processMention(context: any, request: string): Promise<void> {
  let sessionId: string | undefined;
  
  try {
    // Create AI session
    sessionId = await createSession();

    // Send request to AI
    const prompt = `User asked: ${request}`;
    const aiResponse = await sendPrompt(sessionId, prompt);

    // Post AI response as comment
    const issueNumber = context.payload.issue?.number;
    const { owner, repo } = context.repo();

    await context.octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: aiResponse,
    });
  } catch (error) {
    console.error("Error processing mention:", error);
    // Silent fail - don't post error comments
  } finally {
    // Best-effort session cleanup
    if (sessionId) {
      await closeSession(sessionId);
    }
  }
}

/**
 * Handle mention in issue comment
 */
async function handleMention(context: any): Promise<void> {
  // Skip bot's own comments to avoid infinite loop
  if (context.payload.sender?.type === "Bot") {
    return;
  }

  const commentBody = context.payload.comment?.body || "";

  // Check if @luna is mentioned
  if (!hasMention(commentBody)) {
    return;
  }

  // Extract request text after mention
  const request = extractRequest(commentBody);

  // Respond immediately to webhook, then process async
  setImmediate(async () => {
    await processMention(context, request);
  });
}

/**
 * Register mention webhook handlers with Probot app
 */
export function registerMentionHandler(app: Probot): void {
  app.on("issue_comment.created", handleMention);
}
