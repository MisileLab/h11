import { describe, expect, test, mock } from "bun:test";
import type { ReviewResult } from "../../types/index.ts";

// Mock environment variables before importing config
process.env.APP_ID = "12345";
process.env.PRIVATE_KEY_PATH = "/fake/path/key.pem";
process.env.WEBHOOK_SECRET = "fake-secret";

import { postReviewComment, getReviewState, setReviewState, getPRDiff, isLargePR } from "../github.ts";

describe("GitHub API Helpers", () => {
  describe("postReviewComment()", () => {
    test("creates review with inline comments", async () => {
      const createReviewMock = mock(() => Promise.resolve({ data: {} }));
      
      const mockContext = {
        octokit: {
          pulls: {
            createReview: createReviewMock,
          },
        },
        repo: () => ({ owner: "test-owner", repo: "test-repo" }),
        payload: {
          pull_request: {
            number: 42,
          },
        },
      } as any;

      const reviewResult: ReviewResult = {
        summary: {
          title: "Review Complete",
          body: "Found 2 issues",
          criticalIssues: 1,
          warnings: 1,
          suggestions: 0,
        },
        comments: [
          {
            path: "src/file.ts",
            line: 10,
            body: "Critical issue here",
            severity: "critical",
          },
          {
            path: "src/other.ts",
            line: 20,
            body: "Warning here",
            severity: "warning",
          },
        ],
        verdict: "REQUEST_CHANGES",
      };

      await postReviewComment(mockContext, reviewResult);

      expect(createReviewMock).toHaveBeenCalledTimes(1);
      expect(createReviewMock).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        pull_number: 42,
        event: "REQUEST_CHANGES",
        body: "Found 2 issues",
        comments: [
          {
            path: "src/file.ts",
            line: 10,
            body: "Critical issue here",
          },
          {
            path: "src/other.ts",
            line: 20,
            body: "Warning here",
          },
        ],
      });
    });
  });

  describe("getReviewState()", () => {
    test("extracts SHA from HTML comment", () => {
      const mockContext = {
        payload: {
          pull_request: {
            body: "Some PR description\n<!-- luna-reviewed: abc123def456 -->\nMore text",
          },
        },
      } as any;

      const state = getReviewState(mockContext);

      expect(state.lastReviewedSha).toBe("abc123def456");
    });

    test("returns null if no state exists", () => {
      const mockContext = {
        payload: {
          pull_request: {
            body: "Some PR description without state comment",
          },
        },
      } as any;

      const state = getReviewState(mockContext);

      expect(state.lastReviewedSha).toBeUndefined();
    });
  });

  describe("setReviewState()", () => {
    test("updates PR body with HTML comment", async () => {
      const updateMock = mock(() => Promise.resolve({ data: {} }));
      
      const mockContext = {
        octokit: {
          pulls: {
            update: updateMock,
          },
        },
        repo: () => ({ owner: "test-owner", repo: "test-repo" }),
        payload: {
          pull_request: {
            number: 42,
            body: "Existing PR description\n<!-- luna-reviewed: oldsha123 -->",
          },
        },
      } as any;

      await setReviewState(mockContext, "newsha456");

      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(updateMock).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        pull_number: 42,
        body: "Existing PR description\n<!-- luna-reviewed: newsha456 -->",
      });
    });
  });

  describe("getPRDiff()", () => {
    test("returns diff string", async () => {
      const getMock = mock(() => Promise.resolve({ data: "diff --git a/file.txt b/file.txt\n+added line" }));
      
      const mockContext = {
        octokit: {
          pulls: {
            get: getMock,
          },
        },
        repo: () => ({ owner: "test-owner", repo: "test-repo" }),
        payload: {
          pull_request: {
            number: 42,
          },
        },
      } as any;

      const diff = await getPRDiff(mockContext);

      expect(diff).toBe("diff --git a/file.txt b/file.txt\n+added line");
      expect(getMock).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        pull_number: 42,
        mediaType: { format: "diff" },
      });
    });
  });

  describe("isLargePR()", () => {
    test("returns true for 50+ files", () => {
      const mockContext = {
        payload: {
          pull_request: {
            changed_files: 50,
          },
        },
      } as any;

      const result = isLargePR(mockContext);

      expect(result).toBe(true);
    });

    test("returns false for less than 50 files", () => {
      const mockContext = {
        payload: {
          pull_request: {
            changed_files: 49,
          },
        },
      } as any;

      const result = isLargePR(mockContext);

      expect(result).toBe(false);
    });
  });
});
