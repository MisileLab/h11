/**
 * Repository cloning and cleanup utilities for Luna PR Review Bot
 * Handles cloning repositories to temp directories and managing lifecycle
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";

const execAsync = promisify(exec);

/**
 * Generate a unique temp directory path for a cloned repository
 * Pattern: /tmp/luna-pr-<number>-<random-id>
 */
function generateTempPath(prNumber?: number): string {
  const randomId = Math.random().toString(36).substring(2, 8);
  const prPart = prNumber ? `pr-${prNumber}` : "repo";
  return join(tmpdir(), `luna-${prPart}-${randomId}`);
}

/**
 * Clone a repository to a temporary directory and checkout a specific SHA
 * @param cloneUrl - The repository clone URL (handles both main and fork repos)
 * @param sha - The specific commit SHA to checkout
 * @returns Path to the cloned repository
 * @throws Error if clone or checkout fails
 */
export async function cloneRepo(cloneUrl: string, sha: string): Promise<string> {
  const repoPath = generateTempPath();

  try {
    // Clone with shallow depth to minimize data transfer
    await execAsync(`git clone --depth 1 "${cloneUrl}" "${repoPath}"`);

    // Checkout the specific SHA
    await execAsync(`git checkout "${sha}"`, { cwd: repoPath });

    return repoPath;
  } catch (error) {
    // Cleanup partial directory on failure
    try {
      await rm(repoPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors (directory may not exist)
    }
    throw error;
  }
}

/**
 * Remove a cloned repository directory completely
 * @param repoPath - Path to the repository directory to remove
 * @throws Error if removal fails (but succeeds silently if dir doesn't exist)
 */
export async function cleanupRepo(repoPath: string): Promise<void> {
  await rm(repoPath, { recursive: true, force: true });
}
