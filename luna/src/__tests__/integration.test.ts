/**
 * Integration Tests for Luna PR Review Bot
 * Tests handler registration
 * 
 * NOTE: This file tests handler wiring without triggering SDK initialization.
 * Full integration testing (including main.ts loading) is done with `bun run dev`.
 * Individual workflow testing (clone, review, AI, post comments) is covered by unit tests.
 */

import { describe, test, expect, mock } from "bun:test";

// Setup environment before any imports
process.env.APP_ID = "12345";
process.env.PRIVATE_KEY_PATH = "./test-key.pem";
process.env.WEBHOOK_SECRET = "test-secret";
process.env.GITHUB_TOKEN = "test-token";

// Only test PR handler registration (mention handler imports OpenCode SDK)
import { registerPRHandler } from "../handlers/pr.js";

describe("Integration Tests - Handler Registration", () => {
  test("PR handler registers pull_request.opened and synchronize events", () => {
    const handlers = new Map<string, Function>();
    const mockApp: any = {
      on: mock((event: string, handler: Function) => {
        handlers.set(event, handler);
      }),
      log: { info: mock(() => {}), error: mock(() => {}) },
    };

    registerPRHandler(mockApp);

    // Verify both PR events are registered
    expect(handlers.size).toBe(2);
    expect(handlers.has("pull_request.opened")).toBe(true);
    expect(handlers.has("pull_request.synchronize")).toBe(true);
    
    // Verify handlers are functions
    expect(typeof handlers.get("pull_request.opened")).toBe("function");
    expect(typeof handlers.get("pull_request.synchronize")).toBe("function");
  });

  test("PR handler can be called multiple times without errors", () => {
    const handlers = new Map<string, Function>();
    const mockApp: any = {
      on: mock((event: string, handler: Function) => {
        handlers.set(event, handler);
      }),
      log: { info: mock(() => {}), error: mock(() => {}) },
    };

    // Register twice to verify idempotency
    registerPRHandler(mockApp);
    registerPRHandler(mockApp);

    // Should still have 2 unique handlers (map overwrites duplicates)
    expect(handlers.size).toBe(2);
  });
});
