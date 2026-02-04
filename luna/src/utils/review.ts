import type { PRContext, ReviewResult, ReviewComment, ReviewSummary } from "../types/index.js";
import { createSession, sendPrompt, closeSession } from "./opencode.js";

/**
 * Generates a code review using OpenCode AI agents
 * @param prContext - Pull request context with metadata and diff
 * @param repoPath - Local path to cloned repository
 * @returns ReviewResult with summary, comments, and verdict
 */
export async function generateReview(
  prContext: PRContext,
  repoPath: string
): Promise<ReviewResult> {
  let sessionId: string | null = null;
  
  try {
    // Create OpenCode session
    sessionId = await createSession();
    
    // Build prompt for AI agents
    const prompt = buildReviewPrompt(prContext);
    
    // Get AI analysis
    const aiResponse = await sendPrompt(sessionId, prompt);
    
    // Parse response into structured result
    const result = parseAIResponse(aiResponse, prContext);
    
    return result;
  } finally {
    // Best-effort cleanup
    if (sessionId) {
      await closeSession(sessionId);
    }
  }
}

/**
 * Builds multi-agent prompt for code review
 */
function buildReviewPrompt(prContext: PRContext): string {
  const { owner, repo, number, diff } = prContext;
  
  // Detect if this is a large PR (heuristic: >5000 chars in diff or mentions large)
  const isLargePR = diff.length > 5000 || diff.includes("large diff");
  
  if (isLargePR) {
    return `Review this large pull request and provide a high-level summary only.

Repository: ${owner}/${repo}
PR Number: ${number}

This is a large PR. Please provide:
- Overall assessment of the changes
- General recommendations
- Any critical issues that need immediate attention

Do not provide line-by-line comments for large PRs.

Diff preview:
${diff.substring(0, 1000)}...
`;
  }
  
  return `Review this pull request and analyze the code changes.

Repository: ${owner}/${repo}
PR Number: ${number}

Please analyze the code changes and provide:
1. Security issues (if any) - mark as CRITICAL
2. Bugs or potential issues - mark as HIGH
3. Performance concerns - mark as MEDIUM
4. Code style suggestions - mark as LOW

For each issue, specify:
- File path
- Line number (if applicable)
- Description
- Severity (CRITICAL/HIGH/MEDIUM/LOW)
- Suggested fix (if applicable)

Use the following agents:
- @oracle: Review architecture and design patterns
- @explore: Find similar code and identify inconsistencies
- @librarian: Verify API usage against documentation

Diff:
${diff}
`;
}

/**
 * Parses AI response into ReviewResult structure
 */
function parseAIResponse(aiResponse: string, prContext: PRContext): ReviewResult {
  // Extract summary section
  const summaryMatch = aiResponse.match(/##?\s*Summary[:\s]*([\s\S]*?)(?=##|$)/i);
  const summaryText = summaryMatch ? summaryMatch[1].trim() : "Code review completed.";
  
  // Detect if this is a summary-only response (large PR mode)
  // Must explicitly mention "large PR" to be considered summary-only
  const isSummaryOnly = 
    aiResponse.toLowerCase().includes("large pr") ||
    aiResponse.toLowerCase().includes("high-level summary");
  
  // Parse issues/comments if present
  const comments: ReviewComment[] = isSummaryOnly ? [] : parseComments(aiResponse);
  
  // Calculate statistics
  const criticalCount = comments.filter(c => c.severity === "critical").length;
  const warningCount = comments.filter(c => c.severity === "warning").length;
  const suggestionCount = comments.filter(c => c.severity === "suggestion").length;
  
  // Build summary
  const summary: ReviewSummary = {
    title: "🤖 Luna PR Review",
    body: formatSummaryBody(summaryText, criticalCount, warningCount, suggestionCount),
    criticalIssues: criticalCount,
    warnings: warningCount,
    suggestions: suggestionCount,
  };
  
  // Determine verdict
  // For summary-only (large PR), use COMMENT verdict
  const verdict = isSummaryOnly ? "COMMENT" : determineVerdict(comments);
  
  return {
    summary,
    comments,
    verdict,
  };
}

/**
 * Parses individual comments from AI response
 */
function parseComments(aiResponse: string): ReviewComment[] {
  const comments: ReviewComment[] = [];
  
  // Parse file sections
  const fileMatches = aiResponse.matchAll(/###?\s*File:\s*([^\n]+)/gi);
  
  for (const fileMatch of fileMatches) {
    const filePath = fileMatch[1].trim();
    const fileIndex = fileMatch.index || 0;
    
    // Find next file section or end of text
    const nextFileMatch = aiResponse.indexOf("### File:", fileIndex + 1);
    const sectionEnd = nextFileMatch > 0 ? nextFileMatch : aiResponse.length;
    const fileSection = aiResponse.substring(fileIndex, sectionEnd);
    
    // Parse issues in this file
    const issueMatches = fileSection.matchAll(/(?:^|\n)\s*-\s*(?:Line\s+(\d+))?[:\s]*\[?(CRITICAL|HIGH|MEDIUM|LOW)\]?[:\s]*(.*?)(?=\n|$)/gi);
    
    for (const issueMatch of issueMatches) {
      const lineNum = issueMatch[1] ? parseInt(issueMatch[1]) : undefined;
      const severityText = issueMatch[2].toUpperCase();
      const description = issueMatch[3].trim();
      
      // Map severity and category
      const { severity, category, emoji } = mapSeverityAndCategory(severityText, description);
      
      // Format comment body with emoji
      const body = formatCommentBody(emoji, category, description, severity);
      
      comments.push({
        path: filePath,
        line: lineNum,
        body,
        severity,
        category,
      });
    }
  }
  
  return comments;
}

/**
 * Maps severity text to ReviewComment severity and determines category/emoji
 */
function mapSeverityAndCategory(severityText: string, description: string): {
  severity: ReviewComment["severity"];
  category: ReviewComment["category"];
  emoji: string;
} {
  const descLower = description.toLowerCase();
  
  // Determine category from description
  let category: ReviewComment["category"] = "style";
  let emoji = "💡"; // Default suggestion
  
  if (descLower.includes("security") || descLower.includes("vulnerability") || descLower.includes("injection") || descLower.includes("authentication")) {
    category = "security";
    emoji = "🔒";
  } else if (descLower.includes("bug") || descLower.includes("error") || descLower.includes("null") || descLower.includes("undefined") || descLower.includes("crash")) {
    category = "bug";
    emoji = "🐛";
  } else if (descLower.includes("performance") || descLower.includes("slow") || descLower.includes("inefficient") || descLower.includes("memory")) {
    category = "performance";
    emoji = "⚡";
  } else if (descLower.includes("test") || descLower.includes("coverage")) {
    category = "testing";
    emoji = "🧪";
  } else if (descLower.includes("architecture") || descLower.includes("design") || descLower.includes("pattern")) {
    category = "architecture";
    emoji = "🏗️";
  }
  
  // Map severity
  let severity: ReviewComment["severity"];
  switch (severityText) {
    case "CRITICAL":
      severity = "critical";
      break;
    case "HIGH":
      severity = "warning";
      break;
    case "MEDIUM":
      severity = "suggestion";
      break;
    case "LOW":
      severity = "info";
      break;
    default:
      severity = "info";
  }
  
  return { severity, category, emoji };
}

/**
 * Formats comment body with emoji and category
 */
function formatCommentBody(emoji: string, category: string | undefined, description: string, severity: string): string {
  // Add critical alert emoji for critical security issues
  const criticalPrefix = severity === "critical" ? "🚨 " : "";
  
  return `${criticalPrefix}${emoji} **${category || "suggestion"}**: ${description}`;
}

/**
 * Formats summary body with statistics
 */
function formatSummaryBody(summaryText: string, critical: number, warnings: number, suggestions: number): string {
  let body = summaryText;
  
  if (critical > 0 || warnings > 0 || suggestions > 0) {
    body += "\n\n**Statistics:**\n";
    if (critical > 0) body += `- 🚨 Critical Issues: ${critical}\n`;
    if (warnings > 0) body += `- ⚠️ Warnings: ${warnings}\n`;
    if (suggestions > 0) body += `- 💡 Suggestions: ${suggestions}\n`;
  }
  
  return body;
}

/**
 * Determines review verdict based on comment severities
 */
function determineVerdict(comments: ReviewComment[]): ReviewResult["verdict"] {
  // Check for critical or high-severity issues
  const hasCritical = comments.some(c => c.severity === "critical");
  const hasWarnings = comments.some(c => c.severity === "warning");
  
  if (hasCritical || hasWarnings) {
    return "REQUEST_CHANGES";
  }
  
  // If we have suggestions or medium-severity issues, use COMMENT
  const hasSuggestions = comments.some(c => c.severity === "suggestion");
  if (hasSuggestions) {
    return "COMMENT";
  }
  
  // If we only have info/low-severity comments or no comments, APPROVE
  return "APPROVE";
}
