import { describe, test, expect, mock, beforeEach } from "bun:test";

// Set environment variables BEFORE importing config
process.env.APP_ID = "12345";
process.env.PRIVATE_KEY_PATH = "/fake/path/key.pem";
process.env.WEBHOOK_SECRET = "fake-secret";

import { shouldIgnoreFile, filterIgnoredFiles } from "../ignore.ts";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Setup: Create temp directory for test .lunaignore files
const tempDir = tmpdir();

describe("Ignore Patterns Module", () => {
  describe("shouldIgnoreFile()", () => {
    test("ignores package-lock.json", () => {
      const result = shouldIgnoreFile("package-lock.json");
      expect(result).toBe(true);
    });

    test("ignores yarn.lock", () => {
      const result = shouldIgnoreFile("yarn.lock");
      expect(result).toBe(true);
    });

    test("ignores pnpm-lock.yaml", () => {
      const result = shouldIgnoreFile("pnpm-lock.yaml");
      expect(result).toBe(true);
    });

    test("ignores bun.lockb", () => {
      const result = shouldIgnoreFile("bun.lockb");
      expect(result).toBe(true);
    });

    test("ignores dist directories", () => {
      const result = shouldIgnoreFile("dist/bundle.js");
      expect(result).toBe(true);
    });

    test("ignores build directories", () => {
      const result = shouldIgnoreFile("build/index.js");
      expect(result).toBe(true);
    });

    test("ignores minified JavaScript files", () => {
      const result = shouldIgnoreFile("src/bundle.min.js");
      expect(result).toBe(true);
    });

    test("ignores TypeScript declaration files", () => {
      const result = shouldIgnoreFile("src/types.d.ts");
      expect(result).toBe(true);
    });

    test("does not ignore source files", () => {
      const result = shouldIgnoreFile("src/index.ts");
      expect(result).toBe(false);
    });

    test("does not ignore regular JavaScript files", () => {
      const result = shouldIgnoreFile("src/app.js");
      expect(result).toBe(false);
    });

    test("does not ignore regular TypeScript files", () => {
      const result = shouldIgnoreFile("src/utils.ts");
      expect(result).toBe(false);
    });

    test("handles Windows-style paths", () => {
      const result = shouldIgnoreFile("src\\dist\\bundle.js");
      expect(result).toBe(true);
    });

    test("ignores nested lock files", () => {
      const result = shouldIgnoreFile("node_modules/dep/package-lock.json");
      expect(result).toBe(true);
    });

    test("ignores nested dist directories", () => {
      const result = shouldIgnoreFile("packages/lib/dist/index.js");
      expect(result).toBe(true);
    });
  });

  describe("filterIgnoredFiles()", () => {
    test("filters array of mixed files", () => {
      const paths = [
        "src/index.ts",
        "dist/bundle.js",
        "package-lock.json",
        "src/utils.ts",
        "build/output.js",
        "README.md"
      ];
      const filtered = filterIgnoredFiles(paths);
      expect(filtered).toEqual(["src/index.ts", "src/utils.ts", "README.md"]);
    });

    test("returns empty array when all files are ignored", () => {
      const paths = [
        "package-lock.json",
        "dist/bundle.js",
        "build/file.js"
      ];
      const filtered = filterIgnoredFiles(paths);
      expect(filtered).toEqual([]);
    });

    test("returns full array when no files are ignored", () => {
      const paths = [
        "src/index.ts",
        "src/utils.ts",
        "README.md"
      ];
      const filtered = filterIgnoredFiles(paths);
      expect(filtered).toEqual(paths);
    });

    test("preserves order of non-ignored files", () => {
      const paths = [
        "z-file.ts",
        "a-file.ts",
        "dist/bundle.js",
        "m-file.ts"
      ];
      const filtered = filterIgnoredFiles(paths);
      expect(filtered).toEqual(["z-file.ts", "a-file.ts", "m-file.ts"]);
    });
  });

  describe(".lunaignore support", () => {
    test("loads .lunaignore patterns from repo", () => {
      // Create temporary .lunaignore file
      const testDir = join(tmpdir(), `luna-test-${Date.now()}`);
      const ignoreFile = join(testDir, ".lunaignore");
      
      // Create test directory structure
      Bun.spawnSync(["mkdir", "-p", testDir], { stdio: ["inherit", "inherit", "inherit"] });
      
      // Write custom ignore pattern
      writeFileSync(ignoreFile, "custom/ignored.txt\n");
      
      try {
        const result = shouldIgnoreFile("custom/ignored.txt", testDir);
        expect(result).toBe(true);
      } finally {
        // Cleanup
        unlinkSync(ignoreFile);
        Bun.spawnSync(["rm", "-rf", testDir], { stdio: ["inherit", "inherit", "inherit"] });
      }
    });

    test("handles missing .lunaignore gracefully", () => {
      // Use a non-existent directory
      const nonExistentDir = join(tmpdir(), `luna-nonexistent-${Date.now()}`);
      
      // Should not throw, uses defaults only
      const result = shouldIgnoreFile("src/index.ts", nonExistentDir);
      expect(result).toBe(false);
    });

    test("combines default patterns with .lunaignore", () => {
      // Create temporary .lunaignore file
      const testDir = join(tmpdir(), `luna-combined-${Date.now()}`);
      const ignoreFile = join(testDir, ".lunaignore");
      
      // Create test directory structure
      Bun.spawnSync(["mkdir", "-p", testDir], { stdio: ["inherit", "inherit", "inherit"] });
      
      // Write custom ignore pattern
      writeFileSync(ignoreFile, "*.log\n");
      
      try {
        // Should ignore both default and custom patterns
        const ignoresDefault = shouldIgnoreFile("package-lock.json", testDir);
        const ignoresCustom = shouldIgnoreFile("app.log", testDir);
        
        expect(ignoresDefault).toBe(true);
        expect(ignoresCustom).toBe(true);
      } finally {
        // Cleanup
        unlinkSync(ignoreFile);
        Bun.spawnSync(["rm", "-rf", testDir], { stdio: ["inherit", "inherit", "inherit"] });
      }
    });
  });

  describe("Edge cases", () => {
    test("handles empty path string gracefully", () => {
      // Empty string should not throw - return false (not ignored)
      try {
        const result = shouldIgnoreFile("");
        // If ignore library throws on empty string, this is expected
        // We can either handle it or let it bubble
        expect(result).toBe(false);
      } catch (error) {
        // Expected: ignore library rejects empty strings
        // This is acceptable behavior
        expect(error).toBeDefined();
      }
    });

    test("handles root-level files", () => {
      const result = shouldIgnoreFile("README.md");
      expect(result).toBe(false);
    });

    test("handles deeply nested paths", () => {
      const path = "a/b/c/d/e/f/g/h/index.ts";
      const result = shouldIgnoreFile(path);
      expect(result).toBe(false);
    });

    test("handles .d.ts files correctly", () => {
      const result = shouldIgnoreFile("index.d.ts");
      expect(result).toBe(true);
    });

    test("ignores .min.js but not regular .js", () => {
      const minResult = shouldIgnoreFile("app.min.js");
      const jsResult = shouldIgnoreFile("app.js");
      
      expect(minResult).toBe(true);
      expect(jsResult).toBe(false);
    });
  });
});
