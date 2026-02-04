import type { Probot, Context } from "probot";
import { createSession, sendPrompt, closeSession } from "../utils/opencode.ts";
import { setDefaultAgent, setPRAgent, getPRAgent } from "../config/index.ts";
import type { AgentType } from "../types/index.ts";

function hasCommand(commentBody: string): boolean {
  return /\/luna(?:\s|$)/i.test(commentBody);
}

function extractRequest(commentBody: string): string {
  const match = commentBody.match(/\/luna\s+(.*)/i);
  return match ? match[1].trim() : "";
}

function isChangeCommand(commentBody: string): boolean {
  return /\/luna-change(?:\s|$)/i.test(commentBody);
}

function isChangeDefaultCommand(commentBody: string): boolean {
  return /\/luna-change-default(?:\s|$)/i.test(commentBody);
}

function extractAgent(commentBody: string, commandPattern: RegExp): AgentType | null {
  const match = commentBody.match(commandPattern);
  const agentStr = match ? match[1].trim().toLowerCase() : '';
  const validAgents: AgentType[] = ['sisyphus', 'hephaestus', 'prometheus', 'atlas'];
  return validAgents.includes(agentStr as AgentType) ? agentStr as AgentType : null;
}

function isAuthorized(username: string): boolean {
  return username.toLowerCase() === 'misilelab';
}

export async function processMention(context: any, request: string, agent?: AgentType): Promise<void> {
  let sessionId: string | undefined;
  
  try {
    sessionId = await createSession(agent);

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

async function handleChangeCommand(context: any): Promise<void> {
  const username = context.payload.sender?.login || '';
  const commentBody = context.payload.comment?.body || "";
  const issueNumber = context.payload.issue?.number;
  const { owner, repo } = context.repo();

  if (!isAuthorized(username)) {
    await context.octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: '⚠️ Unauthorized. Only @misilelab can change agent configuration.',
    });
    return;
  }

  const agent = extractAgent(commentBody, /\/luna-change\s+(\w+)/i);
  if (!agent) {
    await context.octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: '⚠️ Invalid agent. Valid agents: sisyphus, hephaestus, prometheus, atlas',
    });
    return;
  }

  setPRAgent(issueNumber, agent);
  await context.octokit.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: `✅ Agent for PR #${issueNumber} changed to **${agent}**`,
  });
}

async function handleChangeDefaultCommand(context: any): Promise<void> {
  const username = context.payload.sender?.login || '';
  const commentBody = context.payload.comment?.body || "";
  const issueNumber = context.payload.issue?.number;
  const { owner, repo } = context.repo();

  if (!isAuthorized(username)) {
    await context.octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: '⚠️ Unauthorized. Only @misilelab can change agent configuration.',
    });
    return;
  }

  const agent = extractAgent(commentBody, /\/luna-change-default\s+(\w+)/i);
  if (!agent) {
    await context.octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: '⚠️ Invalid agent. Valid agents: sisyphus, hephaestus, prometheus, atlas',
    });
    return;
  }

  setDefaultAgent(agent);
  await context.octokit.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: `✅ Default agent changed to **${agent}** for all PRs`,
  });
}

async function handleMention(context: any): Promise<void> {
  if (context.payload.sender?.type === "Bot") {
    return;
  }

  const commentBody = context.payload.comment?.body || "";

  if (isChangeCommand(commentBody)) {
    await handleChangeCommand(context);
    return;
  }

  if (isChangeDefaultCommand(commentBody)) {
    await handleChangeDefaultCommand(context);
    return;
  }

  if (!hasCommand(commentBody)) {
    return;
  }

  const request = extractRequest(commentBody);
  const issueNumber = context.payload.issue?.number;
  const selectedAgent = getPRAgent(issueNumber);

  setImmediate(async () => {
    await processMention(context, request, selectedAgent);
  });
}

/**
 * Register mention webhook handlers with Probot app
 */
export function registerMentionHandler(app: Probot): void {
  app.on("issue_comment.created", handleMention);
}
