import { describe, expect, test, mock } from "bun:test";
import type { Part } from "@opencode-ai/sdk";
import type { PRContext, ReviewResult } from "../../types/index.ts";

// Mock the OpenCode SDK wrapper
const mockCreateSession = mock(() => Promise.resolve("test-session-123"));
const mockSendPrompt = mock(() => Promise.resolve("Mock AI response"));
const mockCloseSession = mock(() => Promise.resolve());

mock.module("../opencode.ts", () => ({
  createSession: mockCreateSession,
  sendPrompt: mockSendPrompt,
  closeSession: mockCloseSession,
}));

// Import after mocking
const { generateReview } = await import("../review.js");

describe("Review Generator", () => {
  const basePRContext: PRContext = {
    owner: "test-owner",
    repo: "test-repo",
    number: 42,
    headSha: "abc123",
    baseSha: "def456",
    diff: `diff --git a/src/auth.ts b/src/auth.ts
index 1234..5678 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,7 +10,7 @@ export function login(username: string, password: string) {
-  const query = "SELECT * FROM users WHERE username = '" + username + "'";
+  const query = \`SELECT * FROM users WHERE username = '\${username}'\`;
`,
    isFork: false,
    cloneUrl: "https://github.com/test-owner/test-repo.git",
  };

  describe("generateReview()", () => {
    test("should return ReviewResult with summary and comments", async () => {
      mockSendPrompt.mockResolvedValue(`
## Summary
Found 2 security issues and 1 performance concern.

## Issues Found

### File: src/auth.ts
- Line 13: [CRITICAL] SQL injection vulnerability - use parameterized queries
- Line 25: [HIGH] Unhandled promise rejection

### File: src/cache.ts
- Line 10: [MEDIUM] Consider using WeakMap for better memory management
`);

      const result = await generateReview(basePRContext, "/tmp/test-repo");

      expect(result).toHaveProperty("summary");
      expect(result).toHaveProperty("comments");
      expect(result).toHaveProperty("verdict");
      
      expect(result.summary.title).toBeTruthy();
      expect(result.summary.body).toBeTruthy();
      expect(result.summary.criticalIssues).toBeGreaterThan(0);
      
      expect(result.comments.length).toBeGreaterThan(0);
      expect(result.comments[0]).toHaveProperty("path");
      expect(result.comments[0]).toHaveProperty("severity");
      expect(result.comments[0]).toHaveProperty("body");
    });

    test("should format comments with correct emoji categories", async () => {
      mockSendPrompt.mockResolvedValue(`
## Summary
Various issues found.

## Issues Found

### File: src/app.ts
- Line 10: [HIGH] Potential null pointer dereference
- Line 20: [LOW] Consider using const instead of let
- Line 30: [CRITICAL] Authentication bypass vulnerability
- Line 40: [MEDIUM] Inefficient loop - use map instead
`);

      const result = await generateReview(basePRContext, "/tmp/test-repo");

      // Check that emojis are present in comments
      const commentBodies = result.comments.map(c => c.body);
      
      // Bug emoji 🐛
      const bugComment = commentBodies.find(b => b.includes("null pointer"));
      expect(bugComment).toContain("🐛");
      
      // Security emoji 🔒
      const securityComment = commentBodies.find(b => b.includes("Authentication bypass"));
      expect(securityComment).toContain("🔒");
      
      // Performance emoji ⚡
      const perfComment = commentBodies.find(b => b.includes("Inefficient loop"));
      expect(perfComment).toContain("⚡");
      
      // Suggestion emoji 💡
      const suggestionComment = commentBodies.find(b => b.includes("Consider using const"));
      expect(suggestionComment).toContain("💡");
    });

    test("should highlight critical security issues with 🚨", async () => {
      mockSendPrompt.mockResolvedValue(`
## Summary
Critical security vulnerability detected.

## Issues Found

### File: src/auth.ts
- Line 15: [CRITICAL] SQL injection vulnerability - immediate fix required
`);

      const result = await generateReview(basePRContext, "/tmp/test-repo");

      const criticalComment = result.comments.find(c => c.severity === "critical");
      expect(criticalComment).toBeTruthy();
      expect(criticalComment?.body).toContain("🚨");
    });

    test("should handle summaryOnly mode for large PRs", async () => {
      const largePRContext: PRContext = {
        ...basePRContext,
        diff: "... large diff with 100+ files ...",
      };

      mockSendPrompt.mockResolvedValue(`
## Summary
This is a large PR with 120 files changed. Overall code quality looks good with minor suggestions.

General recommendations:
- Add more unit tests for new features
- Update documentation for API changes
- Consider breaking this into smaller PRs in the future
`);

      const result = await generateReview(largePRContext, "/tmp/test-repo");

      // In summaryOnly mode, should return only summary with no inline comments
      expect(result.summary).toBeTruthy();
      expect(result.summary.body).toContain("large PR");
      expect(result.comments.length).toBe(0);
      expect(result.verdict).toBe("COMMENT");
    });

    test("should determine correct verdict based on severity", async () => {
      // Test APPROVE verdict (no critical/high issues)
      mockSendPrompt.mockResolvedValue(`
## Summary
Minor suggestions only.

## Issues Found

### File: src/utils.ts
- Line 5: [LOW] Consider adding JSDoc comment
`);

      let result = await generateReview(basePRContext, "/tmp/test-repo");
      expect(result.verdict).toBe("APPROVE");

      // Test REQUEST_CHANGES verdict (has critical issues)
      mockSendPrompt.mockResolvedValue(`
## Summary
Critical issues found.

## Issues Found

### File: src/auth.ts
- Line 10: [CRITICAL] Security vulnerability detected
`);

      result = await generateReview(basePRContext, "/tmp/test-repo");
      expect(result.verdict).toBe("REQUEST_CHANGES");

      // Test REQUEST_CHANGES verdict (has high issues)
      mockSendPrompt.mockResolvedValue(`
## Summary
High severity bug found.

## Issues Found

### File: src/api.ts
- Line 20: [HIGH] Unhandled error could crash the application
`);

      result = await generateReview(basePRContext, "/tmp/test-repo");
      expect(result.verdict).toBe("REQUEST_CHANGES");

      // Test COMMENT verdict (only medium/low issues)
      mockSendPrompt.mockResolvedValue(`
## Summary
Some suggestions for improvement.

## Issues Found

### File: src/style.ts
- Line 15: [MEDIUM] Consider refactoring for better readability
`);

      result = await generateReview(basePRContext, "/tmp/test-repo");
      expect(result.verdict).toBe("COMMENT");
    });

    test("should handle various AI response formats gracefully", async () => {
      // Test with minimal response
      mockSendPrompt.mockResolvedValue(`
## Summary
Code looks good.
`);

      let result = await generateReview(basePRContext, "/tmp/test-repo");
      expect(result.summary).toBeTruthy();
      expect(result.comments).toEqual([]);
      expect(result.verdict).toBe("APPROVE");

      // Test with different formatting
      mockSendPrompt.mockResolvedValue(`
Summary: Found issues in authentication module.

Issues:
File: src/auth.ts
- Line 10 [HIGH]: Missing error handling
`);

      result = await generateReview(basePRContext, "/tmp/test-repo");
      expect(result.summary).toBeTruthy();
      expect(result.comments.length).toBeGreaterThanOrEqual(0);
    });
  });
});
