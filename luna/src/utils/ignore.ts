import ignore from "ignore";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Lazily load config to avoid module initialization issues in tests
 */
function getConfig() {
  const { config } = require("../config/index.ts");
  return config;
}

/**
 * Creates an ignore instance with default patterns and optional .lunaignore file
 * 
 * @param repoPath - Optional path to repo root (for loading .lunaignore)
 * @returns Configured ignore instance
 */
function createIgnoreInstance(repoPath?: string) {
  const ig = ignore();
  const config = getConfig();
  
  // Add default patterns from config
  ig.add(config.ignorePatterns);
  
  // Load .lunaignore if present
  if (repoPath) {
    const ignorePath = join(repoPath, ".lunaignore");
    if (existsSync(ignorePath)) {
      try {
        const content = readFileSync(ignorePath, "utf-8");
        ig.add(content);
      } catch (error) {
        // Silently ignore errors reading .lunaignore (log but continue)
        console.debug(`Failed to read .lunaignore from ${repoPath}:`, error);
      }
    }
  }
  
  return ig;
}

/**
 * Normalizes file paths to Unix format for consistent pattern matching
 * Converts Windows backslashes to forward slashes
 * 
 * @param path - File path to normalize
 * @returns Normalized path with forward slashes
 */
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/**
 * Checks if a file path should be ignored based on patterns
 * 
 * @param path - File path to check (relative or absolute)
 * @param repoPath - Optional path to repo root for loading .lunaignore
 * @returns true if file should be ignored, false otherwise
 */
export function shouldIgnoreFile(path: string, repoPath?: string): boolean {
  const ig = createIgnoreInstance(repoPath);
  const normalizedPath = normalizePath(path);
  return ig.ignores(normalizedPath);
}

/**
 * Filters an array of file paths, removing those that match ignore patterns
 * 
 * @param paths - Array of file paths to filter
 * @param repoPath - Optional path to repo root for loading .lunaignore
 * @returns Filtered array containing only non-ignored paths
 */
export function filterIgnoredFiles(paths: string[], repoPath?: string): string[] {
  const ig = createIgnoreInstance(repoPath);
  return paths.filter(path => !ig.ignores(normalizePath(path)));
}

