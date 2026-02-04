import { describe, expect, test, mock, spyOn } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mock child_process module
const mockExec = mock((cmd: string, options: any, callback: any) => {
  // If callback is second arg (no options)
  if (typeof options === "function") {
    callback = options;
  }
  // Simulate successful git operations
  callback(null, { stdout: "", stderr: "" });
});

const mockRm = mock(async (path: string, options: any) => {
  // Simulate successful directory removal
  return undefined;
});

mock.module("node:child_process", () => ({
  exec: mockExec,
}));

mock.module("node:fs/promises", () => ({
  rm: mockRm,
}));

// Import after mocking
const { cloneRepo, cleanupRepo } = await import("../repo");

describe("Repository Cloner", () => {
  describe("cloneRepo()", () => {
    test("should create directory and clone repository", async () => {
      const cloneUrl = "https://github.com/owner/repo.git";
      const sha = "abc123def456";

      const result = await cloneRepo(cloneUrl, sha);

      // Verify result is a path string
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);

      // Verify clone was called
      expect(mockExec).toHaveBeenCalled();
    });

    test("should check out specific SHA after cloning", async () => {
      const cloneUrl = "https://github.com/owner/repo.git";
      const sha = "abc123def456";

      const result = await cloneRepo(cloneUrl, sha);

      // Verify exec was called (should be at least once for clone and once for checkout)
      expect(mockExec).toHaveBeenCalled();

      // Get all calls to verify both clone and checkout happened
      const calls = mockExec.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(2);

      // Verify SHA is in one of the git commands
      const commandsText = calls.map((call: any) => call[0]).join(" ");
      expect(commandsText).toContain(sha);
    });

    test("should use fork URL for fork PRs", async () => {
      const forkCloneUrl = "https://github.com/contributor/repo.git";
      const sha = "def789ghi012";

      const result = await cloneRepo(forkCloneUrl, sha);

      // Just verify it worked and returned a path
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);

      // Verify the fork URL was used in a git command
      const calls = mockExec.mock.calls;
      const commandsText = calls.map((call: any) => call[0]).join(" ");
      expect(commandsText).toContain(forkCloneUrl);
    });

    test("should return path in temp directory", async () => {
      const cloneUrl = "https://github.com/owner/repo.git";
      const sha = "abc123";

      const result = await cloneRepo(cloneUrl, sha);

      // Verify result starts with temp directory
      const tempDir = tmpdir();
      expect(result.startsWith(tempDir) || result.includes("temp")).toBe(true);
    });
  });

  describe("cleanupRepo()", () => {
    test("should remove directory completely", async () => {
      const repoPath = join(tmpdir(), "luna-pr-123-abc456");

      await cleanupRepo(repoPath);

      // Verify rm was called
      expect(mockRm).toHaveBeenCalled();

      // Verify the path was passed to rm
      expect(mockRm).toHaveBeenCalledWith(
        repoPath,
        expect.objectContaining({
          recursive: true,
          force: true,
        })
      );
    });

    test("should handle non-existent directory gracefully", async () => {
      const nonExistentPath = join(tmpdir(), "luna-pr-999-nonexistent");

      // Should not throw even if directory doesn't exist
      await cleanupRepo(nonExistentPath);
      expect(true).toBe(true); // If we got here, it didn't throw
    });

    test("should use recursive and force options", async () => {
      const repoPath = join(tmpdir(), "luna-pr-456-def789");

      await cleanupRepo(repoPath);

      // Verify options include recursive and force
      const calls = mockRm.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const lastCall = calls[calls.length - 1];
      expect(lastCall[1]).toEqual({
        recursive: true,
        force: true,
      });
    });
  });

  describe("Error handling", () => {
    test("should handle git clone failure", async () => {
      // Setup exec to fail once then succeed
      let callCount = 0;
      mockExec.mockImplementation((cmd: string, options: any, callback: any) => {
        callCount++;
        if (callCount === 1) {
          // First call (clone) fails
          const cb = typeof options === "function" ? options : callback;
          cb(new Error("Clone failed"), null);
        } else {
          // Subsequent calls succeed
          const cb = typeof options === "function" ? options : callback;
          cb(null, { stdout: "", stderr: "" });
        }
      });

      const cloneUrl = "https://github.com/owner/repo.git";
      const sha = "abc123";

      // Should throw on clone failure
      await expect(cloneRepo(cloneUrl, sha)).rejects.toThrow();
    });

    test("should cleanup partial directory on checkout failure", async () => {
      // Setup: clone succeeds but checkout fails
      let callCount = 0;
      mockExec.mockImplementation((cmd: string, options: any, callback: any) => {
        callCount++;
        const cb = typeof options === "function" ? options : callback;

        if (callCount === 1) {
          // Clone succeeds
          cb(null, { stdout: "", stderr: "" });
        } else {
          // Checkout fails
          cb(new Error("Checkout failed"), null);
        }
      });

      const cloneUrl = "https://github.com/owner/repo.git";
      const sha = "abc123";

      // Should throw and cleanup
      await expect(cloneRepo(cloneUrl, sha)).rejects.toThrow();

      // Verify cleanup was attempted
      expect(mockRm).toHaveBeenCalled();
    });
  });
});
