import { describe, expect, test, mock } from "bun:test";
import type { Part } from "@opencode-ai/sdk";

// Mock the SDK module
const mockClient = {
  session: {
    create: mock(() => Promise.resolve({ data: { id: "test-session-123" } })),
    prompt: mock(() =>
      Promise.resolve({
        data: {
          parts: [
            { type: "text", text: "Test response" } as Part,
          ],
        },
      })
    ),
    abort: mock(() => Promise.resolve({ data: {} })),
  },
};

mock.module("@opencode-ai/sdk", () => ({
  createOpencode: () => Promise.resolve({ client: mockClient }),
}));

// Import after mocking
const { createSession, sendPrompt, closeSession } = await import("../opencode");

describe("OpenCode SDK Wrapper", () => {
  describe("createSession()", () => {
    test("should create a session and return session ID string", async () => {
      mockClient.session.create.mockReturnValue(
        Promise.resolve({ data: { id: "test-session-456" } })
      );

      const sessionId = await createSession();

      expect(sessionId).toBe("test-session-456");
      expect(mockClient.session.create).toHaveBeenCalled();
    });

    test("should throw error on failure after retries", async () => {
      let callCount = 0;
      mockClient.session.create.mockImplementation(() => {
        callCount++;
        return Promise.reject(new Error("Simulated failure"));
      });

      const startTime = Date.now();
      await expect(createSession()).rejects.toThrow("Simulated failure");
      const elapsed = Date.now() - startTime;

      expect(callCount).toBe(3); // Should retry 3 times
      // Should take at least 1s + 2s = 3s for exponential backoff
      expect(elapsed).toBeGreaterThanOrEqual(3000);
    });

    test("should throw error if no session ID is returned", async () => {
      mockClient.session.create.mockReturnValue(
        Promise.resolve({ data: {} as any })
      );

      await expect(createSession()).rejects.toThrow("no session ID returned");
    });
  });

  describe("sendPrompt()", () => {
    test("should send prompt and return text response", async () => {
      mockClient.session.prompt.mockReturnValue(
        Promise.resolve({
          data: {
            parts: [
              { type: "text", text: "Hello back!" } as Part,
            ],
          },
        })
      );

      const response = await sendPrompt("test-session-789", "Hello, test!");

      expect(response).toBe("Hello back!");
      expect(mockClient.session.prompt).toHaveBeenCalledWith({
        path: { id: "test-session-789" },
        body: {
          parts: [{ type: "text", text: "Hello, test!" }],
        },
      });
    });

    test("should extract only text parts from response", async () => {
      mockClient.session.prompt.mockReturnValue(
        Promise.resolve({
          data: {
            parts: [
              { type: "text", text: "First part. " } as Part,
              { type: "reasoning", text: "Thinking..." } as Part,
              { type: "text", text: "Second part." } as Part,
              { type: "tool", id: "tool-1" } as Part,
            ],
          },
        })
      );

      const response = await sendPrompt("test-session", "test");

      expect(response).toBe("First part. Second part.");
    });

    test("should retry 3 times with exponential backoff on failure", async () => {
      let callCount = 0;
      mockClient.session.prompt.mockImplementation(() => {
        callCount++;
        return Promise.reject(new Error("Simulated failure"));
      });

      const startTime = Date.now();
      await expect(sendPrompt("test-session", "test")).rejects.toThrow();
      const elapsed = Date.now() - startTime;

      expect(callCount).toBe(3); // Should retry 3 times
      // Should take at least 1s + 2s = 3s for exponential backoff
      expect(elapsed).toBeGreaterThanOrEqual(3000);
    });

    test("should throw after 3 failed retries", async () => {
      mockClient.session.prompt.mockImplementation(() => {
        return Promise.reject(new Error("Persistent failure"));
      });

      await expect(sendPrompt("test-session", "test")).rejects.toThrow(
        "Persistent failure"
      );
    });

    test("should throw error if no text response received", async () => {
      mockClient.session.prompt.mockReturnValue(
        Promise.resolve({
          data: {
            parts: [
              { type: "reasoning", text: "Only reasoning" } as Part,
            ],
          },
        })
      );

      await expect(sendPrompt("test-session", "test")).rejects.toThrow(
        "No text response received"
      );
    });
  });

  describe("closeSession()", () => {
    test("should close session without throwing", async () => {
      mockClient.session.abort.mockReturnValue(
        Promise.resolve({ data: {} })
      );

      await closeSession("test-session");
      expect(mockClient.session.abort).toHaveBeenCalledWith({
        path: { id: "test-session" },
      });
    });

    test("should not throw even if abort fails (best-effort cleanup)", async () => {
      mockClient.session.abort.mockImplementation(() => {
        return Promise.reject(new Error("Abort failed"));
      });

      // Should not throw - just await without expect
      await closeSession("test-session");
      // If we got here, it didn't throw
      expect(true).toBe(true);
    });
  });
});
