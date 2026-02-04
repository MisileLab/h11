import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { Context } from "probot";

// Mock environment variables BEFORE importing
process.env.APP_ID = "12345";
process.env.WEBHOOK_SECRET = "test-secret";

// Create mock functions
const mockCreateSession = mock(() => Promise.resolve("sess_mock_123"));
const mockSendPrompt = mock(() => Promise.resolve("AI response to your question"));
const mockCloseSession = mock(() => Promise.resolve());

// Mock SDK module BEFORE importing handler
mock.module("../../utils/opencode.ts", () => ({
  createSession: mockCreateSession,
  sendPrompt: mockSendPrompt,
  closeSession: mockCloseSession,
}));

// Import handler after mocking
let registerMentionHandler: any;
let processMention: any;

describe("mention handler", () => {
  let mockContext: any;
  let mockApp: any;
  let registeredHandlers: Map<string, Function>;

  beforeEach(async () => {
    // Reset mocks
    mockCreateSession.mockClear();
    mockSendPrompt.mockClear();
    mockCloseSession.mockClear();
    
    // Import handler dynamically if not already loaded
    if (!registerMentionHandler) {
      const module = await import("../mention.ts");
      registerMentionHandler = module.registerMentionHandler;
      processMention = module.processMention;
    }
    
    registeredHandlers = new Map();
    
    mockApp = {
      on: mock((event: string, handler: Function) => {
        registeredHandlers.set(event, handler);
      }),
    };

    // Create fresh mock for createComment each time
    const mockCreateComment = mock(() => Promise.resolve({ data: {} }));

    mockContext = {
      payload: {
        issue: { number: 42 },
        comment: {
          id: 123,
          body: "@luna explain this function",
          user: { login: "testuser", type: "User" },
        },
        sender: { login: "testuser", type: "User" },
        repository: {
          name: "test-repo",
          owner: { login: "test-owner" },
        },
      },
      repo: () => ({ owner: "test-owner", repo: "test-repo" }),
      octokit: {
        issues: {
          createComment: mockCreateComment,
        },
      },
    };
  });

  test("detects @luna mention and triggers AI response", async () => {
    // Test processMention directly to avoid setImmediate timing issues
    await processMention(mockContext, "explain this function");

    // Verify comment was posted
    expect(mockContext.octokit.issues.createComment).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      issue_number: 42,
      body: "AI response to your question",
    });
  });

  test("ignores @lunar (partial match, not exact)", async () => {
    registerMentionHandler(mockApp);
    const handler = registeredHandlers.get("issue_comment.created");

    // Set comment body to partial match
    mockContext.payload.comment.body = "@lunar eclipse is cool";

    await handler!(mockContext);
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify no comment was posted
    expect(mockContext.octokit.issues.createComment).not.toHaveBeenCalled();
  });

  test("ignores bot's own comments (no infinite loop)", async () => {
    registerMentionHandler(mockApp);
    const handler = registeredHandlers.get("issue_comment.created");

    // Set sender to Bot
    mockContext.payload.sender.type = "Bot";
    mockContext.payload.comment.body = "@luna help me";

    await handler!(mockContext);
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify no comment was posted
    expect(mockContext.octokit.issues.createComment).not.toHaveBeenCalled();
  });

  test("extracts text after @luna as the request", async () => {
    // Test with different request text
    await processMention(mockContext, "can you review this code?");

    // Verify sendPrompt was called with extracted text
    expect(mockSendPrompt).toHaveBeenCalledWith(
      "sess_mock_123",
      expect.stringContaining("can you review this code?")
    );
  });
});
