import type { CommentCheckResult } from "./types.js";

/**
 * AI Slop Detection Patterns
 * 
 * These patterns identify common AI-generated code issues:
 * - Lazy truncation comments ("// ... rest of code")
 * - TODO without implementation
 * - Placeholder comments
 * - Captain obvious comments
 * - Unnecessary change explanations
 * - Excessive comment density
 */
interface SloppyPattern {
  id: string;
  name: string;
  pattern: RegExp;
  severity: "info" | "warning" | "error";
  description: string;
  fileTypes?: string[]; // Restrict to specific file types (ts, js, py, etc.)
}

const DEFAULT_PATTERNS: SloppyPattern[] = [
  {
    id: "lazy_truncation",
    name: "Lazy Truncation",
    pattern: /\/\/\s*\.\.\.\s*(rest of|remaining|existing).*?code.*?$/gim,
    severity: "warning",
    description: "Truncation placeholder: '// ... rest of code' suggests incomplete implementation",
    fileTypes: ["ts", "tsx", "js", "jsx", "py", "java", "go", "rs"],
  },
  {
    id: "empty_todo",
    name: "Empty TODO",
    pattern: /\/\/\s*TODO[\s:]*implement|\/\/\s*FIXME[\s:]*.*$/gim,
    severity: "warning",
    description: "TODO/FIXME without implementation",
    fileTypes: ["ts", "tsx", "js", "jsx", "py", "java", "go", "rs"],
  },
  {
    id: "placeholder_comment",
    name: "Placeholder Comment",
    pattern: /<!--\s*[Aa]dd\s+your\s+code\s+here\s*-->|\/\/\s*[Aa]dd\s+your\s+code\s+here|#\s*[Aa]dd\s+your\s+code\s+here/g,
    severity: "warning",
    description: "Placeholder comment: <!-- Add your code here --> suggests unfinished work",
    fileTypes: ["ts", "tsx", "js", "jsx", "py", "html", "java", "go", "rs"],
  },
  {
    id: "captain_obvious",
    name: "Captain Obvious",
    pattern: /\/\/\s+(?:set|assign|initialize|define|create|return|get|fetch|call)\s+\w+\s*(?:to|as|=|:)\s*\w+/gi,
    severity: "info",
    description: "Obvious comment: restates code logic without adding value",
    fileTypes: ["ts", "tsx", "js", "jsx", "py", "java", "go", "rs"],
  },
  {
    id: "unnecessary_explanation",
    name: "Unnecessary Explanation",
    pattern: /\/\/\s*[Aa]dded\s+(?:to|for)\s+(?:support|handle|fix|implement|improve).*$/gim,
    severity: "info",
    description: "Unnecessary change explanation: '// Added for...' is noise",
    fileTypes: ["ts", "tsx", "js", "jsx", "py", "java", "go", "rs"],
  },
  {
    id: "html_placeholder",
    name: "HTML Placeholder",
    pattern: /<div[^>]*>\s*<\/div>|<p>\s*<\/p>|placeholder|[Aa]dd\s+content\s+here/g,
    severity: "info",
    description: "Empty HTML element or placeholder text",
    fileTypes: ["html", "tsx", "jsx"],
  },
];

/**
 * Check tool result for AI-generated slop patterns
 * 
 * @param toolResult - The content to check (usually from write/edit tool)
 * @param fileType - Optional file extension (ts, js, py, etc.) for targeted checks
 * @param customPatterns - Optional custom patterns to use instead of defaults
 * @returns Array of detected patterns
 */
export function checkForAISlop(
  toolResult: string,
  fileType?: string,
  customPatterns?: SloppyPattern[],
): CommentCheckResult[] {
  const patterns = customPatterns || DEFAULT_PATTERNS;
  const results: CommentCheckResult[] = [];

  // Skip empty or very small content
  if (!toolResult || toolResult.length < 10) {
    return results;
  }

  // Filter patterns by file type if specified
  const relevantPatterns = fileType
    ? patterns.filter(
        (p) =>
          !p.fileTypes ||
          p.fileTypes.includes(fileType) ||
          fileType.startsWith(p.fileTypes[0] || ""),
      )
    : patterns;

  // Check each pattern
  relevantPatterns.forEach((patternDef) => {
    const matches = toolResult.matchAll(patternDef.pattern);
    let matchCount = 0;
    for (const match of matches) {
      matchCount++;
      // Find the line number (approximate)
      const beforeMatch = toolResult.substring(0, match.index || 0);
      const lineNumber = beforeMatch.split("\n").length;

      results.push({
        file: "unknown",
        line: lineNumber,
        pattern: patternDef.id,
        severity: patternDef.severity,
        message: patternDef.description,
      });

      // Limit to first 5 matches per pattern to avoid spam
      if (matchCount >= 5) break;
    }
  });

  // Check for excessive comment density (>40% of lines)
  const lines = toolResult.split("\n");
  const commentLines = lines.filter((line) => {
    const trimmed = line.trim();
    return trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("--");
  });
  const commentDensity = commentLines.length / Math.max(lines.length, 1);

  if (commentDensity > 0.4) {
    results.push({
      file: "unknown",
      line: 0,
      pattern: "excessive_comments",
      severity: "info",
      message: `Excessive comment density (${Math.round(commentDensity * 100)}%): consider reducing explanatory comments`,
    });
  }

  // Filter out false positives: legitimate comments that should pass
  return filterOutLegitimateComments(results, toolResult);
}

/**
 * Filter out false positives by checking context
 * 
 * Common legitimate comment patterns:
 * - JSDoc comments (/ ** ... * /)
 * - License headers
 * - Long explanatory blocks (>2 sentences)
 * - Comments within well-formed code blocks
 */
function filterOutLegitimateComments(
  results: CommentCheckResult[],
  toolResult: string,
): CommentCheckResult[] {
  // Check for JSDoc markers (legitimate)
  const hasJSDoc = /\/\*\*[\s\S]*?\*\//m.test(toolResult);

  // Check for license headers (legitimate)
  const hasLicense = /copyright|license|licensed|mit|apache|lgpl|gpl/i.test(toolResult);

  return results.filter((result) => {
    // Allow all results if we detect JSDoc or license
    if (hasJSDoc || hasLicense) {
      // Don't filter out — let severity be the gate
      return true;
    }

    // Filter out "captain obvious" if context has actual implementation
    if (result.pattern === "captain_obvious" && toolResult.length > 500) {
      // Assume longer files have legitimate comments
      return false;
    }

    return true;
  });
}

/**
 * Format check results as human-readable warning message
 */
export function formatWarning(results: CommentCheckResult[]): string {
  if (results.length === 0) {
    return "";
  }

  const byPattern = new Map<string, CommentCheckResult[]>();
  results.forEach((r) => {
    if (!byPattern.has(r.pattern)) {
      byPattern.set(r.pattern, []);
    }
    byPattern.get(r.pattern)!.push(r);
  });

  const warnings = Array.from(byPattern.entries())
    .map(([pattern, items]) => {
      const unique = new Set(items.map((i) => i.message));
      return `- **${pattern}**: ${Array.from(unique).join("; ")}`;
    })
    .join("\n");

  return `⚠️ **AI Slop Detected** (${results.length} issue${results.length === 1 ? "" : "s"}):\n${warnings}\n\nPlease review and fix the generated content.`;
}

/**
 * Get configured check patterns from config
 * 
 * Allows users to customize patterns via config
 */
export function getCheckPatterns(config?: {
  commentChecker?: {
    enabled?: boolean;
    patterns?: Array<{
      id: string;
      pattern: string;
      severity: "info" | "warning" | "error";
    }>;
  };
}): SloppyPattern[] {
  if (!config?.commentChecker?.patterns) {
    return DEFAULT_PATTERNS;
  }

  // Convert user patterns to SloppyPattern format
  const customPatterns = config.commentChecker.patterns.map((p) => ({
    id: p.id,
    name: p.id,
    pattern: new RegExp(p.pattern, "gim"),
    severity: p.severity,
    description: `Custom pattern: ${p.id}`,
  }));

  return customPatterns;
}

/**
 * Check if comment checking is enabled
 */
export function isCommentCheckerEnabled(config?: {
  thresholds?: {
    commentCheckEnabled?: boolean;
  };
}): boolean {
  // Default to enabled unless explicitly disabled
  return config?.thresholds?.commentCheckEnabled !== false;
}
