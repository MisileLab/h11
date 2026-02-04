import { describe, expect, test, mock, beforeEach, spyOn } from "bun:test";
import type { Probot, Context } from "probot";

// Mock environment variables before importing config
process.env.APP_ID = "12345";
process.env.PRIVATE_KEY_PATH = "/fake/path/key.pem";
process.env.WEBHOOK_SECRET = "fake-secret";

import { registerPRHandler } from "../pr";

describe("PR Webhook Handler", () => {
  let mockApp: Probot;
  let registeredHandlers: Map<string, Function>;
  let consoleLogSpy: any;

  beforeEach(() => {
    registeredHandlers = new Map();
    
    // Mock Probot app with event handler registration
    mockApp = {
      on: mock((event: string, handler: Function) => {
        registeredHandlers.set(event, handler);
      }),
    } as unknown as Probot;

    // Spy on console.log to verify processing
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  test("registers handlers for pull_request.opened and pull_request.synchronize", () => {
    registerPRHandler(mockApp);

    expect(mockApp.on).toHaveBeenCalledTimes(2);
    expect(registeredHandlers.has("pull_request.opened")).toBe(true);
    expect(registeredHandlers.has("pull_request.synchronize")).toBe(true);
  });

   test("skips draft PRs", async () => {
     registerPRHandler(mockApp);
     const handler = registeredHandlers.get("pull_request.opened")!;

     const mockContext = createMockContext({
       isDraft: true,
       isBot: false,
       isAllowedUser: true,
     });

     await handler(mockContext);

     // Wait for async processing to complete
     await new Promise(resolve => setTimeout(resolve, 10));

     // Verify no processing happened
     expect(consoleLogSpy).not.toHaveBeenCalled();
   });

   test("skips bot-created PRs", async () => {
     registerPRHandler(mockApp);
     const handler = registeredHandlers.get("pull_request.opened")!;

     const mockContext = createMockContext({
       isDraft: false,
       isBot: true,
       isAllowedUser: true,
     });

     await handler(mockContext);

     // Wait for async processing
     await new Promise(resolve => setTimeout(resolve, 10));

     expect(consoleLogSpy).not.toHaveBeenCalled();
   });

   test("skips PRs from non-allowed users", async () => {
     registerPRHandler(mockApp);
     const handler = registeredHandlers.get("pull_request.opened")!;

     const mockContext = createMockContext({
       isDraft: false,
       isBot: false,
       isAllowedUser: false,
     });

     await handler(mockContext);

     // Wait for async processing
     await new Promise(resolve => setTimeout(resolve, 10));

     // Processing should be skipped
     expect(consoleLogSpy).not.toHaveBeenCalled();
   });

   test("extracts PR context for valid PRs", async () => {
     registerPRHandler(mockApp);
     const handler = registeredHandlers.get("pull_request.opened")!;

     const mockContext = createMockContext({
       isDraft: false,
       isBot: false,
       isAllowedUser: true,
       prNumber: 42,
       headSha: "abc123",
       baseSha: "def456",
       isFork: false,
     });

     await handler(mockContext);

     // Wait for async processing
     await new Promise(resolve => setTimeout(resolve, 10));

     // Verify processing happened
     expect(consoleLogSpy).toHaveBeenCalledWith(
       expect.stringContaining("Processing PR review for")
     );
   });

   test("sets summaryOnly flag for large PRs (50+ files)", async () => {
     registerPRHandler(mockApp);
     const handler = registeredHandlers.get("pull_request.opened")!;

     const mockContext = createMockContext({
       isDraft: false,
       isBot: false,
       isAllowedUser: true,
       changedFiles: 75,
     });

     await handler(mockContext);

     // Wait for async processing
     await new Promise(resolve => setTimeout(resolve, 10));

     // Verify large PR is processed with summaryOnly flag
     expect(consoleLogSpy).toHaveBeenCalledWith("Summary only: true");
   });
});

// Helper function to create mock context
function createMockContext(options: {
  isDraft: boolean;
  isBot: boolean;
  isAllowedUser: boolean;
  prNumber?: number;
  headSha?: string;
  baseSha?: string;
  isFork?: boolean;
  changedFiles?: number;
}): Context {
  const prCreator = options.isAllowedUser ? "misilelab" : "other-user";
  
  const mockRepo = mock(() => ({
    owner: "test-owner",
    repo: "test-repo",
  }));

  return {
    payload: {
      sender: {
        type: options.isBot ? "Bot" : "User",
      },
      repository: {
        owner: {
          login: "test-owner",
        },
      },
      pull_request: {
        number: options.prNumber || 1,
        draft: options.isDraft,
        user: {
          login: prCreator,
        },
        head: {
          sha: options.headSha || "head-sha",
          repo: {
            id: options.isFork ? 999 : 123,
            clone_url: "https://github.com/user/repo.git",
          },
        },
        base: {
          sha: options.baseSha || "base-sha",
          repo: {
            id: 123,
          },
        },
        changed_files: options.changedFiles || 10,
      },
    },
    repo: mockRepo,
  } as unknown as Context;
}
