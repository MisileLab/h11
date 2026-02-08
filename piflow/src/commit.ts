import type { ParsedPlan } from "./types.js";

export interface DiffStats {
  locChanged: number;
  filesChanged: number;
  files: string[];
}

export interface CommitMessage {
  subject: string;
  body: string;
  type: "feat" | "fix" | "refactor" | "chore" | "docs" | "test";
}

function parseNumstat(stdout: string): DiffStats {
  let locChanged = 0;
  let filesChanged = 0;
  const files: string[] = [];

  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [addedRaw, deletedRaw, ...rest] = line.split(/\s+/);
    const file = rest.join(" ").trim();
    if (!file) continue;

    const added = Number.isFinite(Number(addedRaw)) ? Number(addedRaw) : 0;
    const deleted = Number.isFinite(Number(deletedRaw)) ? Number(deletedRaw) : 0;

    locChanged += added + deleted;
    filesChanged += 1;
    files.push(file);
  }

  return { locChanged, filesChanged, files };
}

function classifyType(checkpointName: string): CommitMessage["type"] {
  const lower = checkpointName.toLowerCase();
  if (/(fix|bug|error|regression)/.test(lower)) return "fix";
  if (/(refactor|cleanup)/.test(lower)) return "refactor";
  if (/(doc|readme)/.test(lower)) return "docs";
  if (/(test|spec)/.test(lower)) return "test";
  if (/(deps|dependency|chore|config)/.test(lower)) return "chore";
  return "feat";
}

function sanitizeSubject(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\r\n]+/g, " ")
    .slice(0, 68);
}

export async function getDiffStats(
  exec: (command: string, args: string[]) => Promise<{ stdout: string; code: number }>,
): Promise<DiffStats> {
  const repo = await exec("git", ["rev-parse", "--is-inside-work-tree"]);
  if (repo.code !== 0) return { locChanged: 0, filesChanged: 0, files: [] };

  const diff = await exec("git", ["diff", "--numstat", "HEAD"]);
  if (diff.code !== 0) return { locChanged: 0, filesChanged: 0, files: [] };

  return parseNumstat(diff.stdout);
}

export function generateConventionalCommitMessage(
  plan: ParsedPlan,
  checkpointId: string,
  checkpointName: string,
  diff: DiffStats,
): CommitMessage {
  const type = classifyType(checkpointName);
  const subject = `${type}: ${sanitizeSubject(checkpointName)}`;

  const body = [
    `Checkpoint: ${checkpointId} - ${checkpointName}`,
    `Goal: ${plan.goal || "N/A"}`,
    `Diff summary: ${diff.filesChanged} files, ${diff.locChanged} LOC changed`,
    diff.files.length > 0 ? `Files: ${diff.files.slice(0, 8).join(", ")}${diff.files.length > 8 ? ", ..." : ""}` : "Files: none",
  ].join("\n");

  return { subject, body, type };
}

export async function autoCommit(
  exec: (command: string, args: string[]) => Promise<{ stdout: string; code: number; stderr?: string }>,
  message: CommitMessage,
): Promise<{ committed: boolean; reason?: string }> {
  const repo = await exec("git", ["rev-parse", "--is-inside-work-tree"]);
  if (repo.code !== 0) return { committed: false, reason: "Not a git repository" };

  await exec("git", ["add", "-A"]);

  const staged = await exec("git", ["diff", "--cached", "--name-only"]);
  if (staged.code !== 0 || staged.stdout.trim().length === 0) {
    return { committed: false, reason: "No staged changes" };
  }

  const commit = await exec("git", ["commit", "-m", message.subject, "-m", message.body]);
  if (commit.code !== 0) {
    return { committed: false, reason: commit.stderr || "git commit failed" };
  }

  return { committed: true };
}
