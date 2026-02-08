import fs from "node:fs/promises";
import path from "node:path";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { ContextFile, FlowEnforcerConfig } from "./types.js";

export interface ContextCache {
  files: ContextFile[];
  totalChars: number;
  summary: string;
}

async function existsFile(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

async function resolvePriorityPattern(cwd: string, pattern: string): Promise<string[]> {
  const normalized = pattern.replace(/^\.\//, "");

  if (!normalized.includes("*")) {
    const full = path.join(cwd, normalized);
    return (await existsFile(full)) ? [full] : [];
  }

  const dir = path.join(cwd, path.dirname(normalized));
  const basePattern = path.basename(normalized);

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const re = globToRegex(basePattern);
    const matches = entries
      .filter((entry) => entry.isFile() && re.test(entry.name))
      .map((entry) => path.join(dir, entry.name))
      .sort((a, b) => a.localeCompare(b));

    return matches;
  } catch {
    return [];
  }
}

async function candidatesByPriority(cwd: string, priorities: string[]): Promise<string[]> {
  const ordered: string[] = [];
  for (const pattern of priorities) {
    const resolved = await resolvePriorityPattern(cwd, pattern);
    for (const file of resolved) {
      if (!ordered.includes(file)) ordered.push(file);
    }
  }
  return ordered;
}

function buildSummary(files: ContextFile[]): string {
  if (files.length === 0) return "No context files loaded.";
  const lines = files.map((f, i) => `${i + 1}. ${path.relative(process.cwd(), f.path)} (${f.chars} chars)`);
  return `Auto-context loaded (${files.length} files):\n${lines.join("\n")}`;
}

export async function runAutoContextManager(
  cwd: string,
  config: FlowEnforcerConfig,
  ctx: ExtensionContext,
): Promise<ContextCache> {
  const candidates = await candidatesByPriority(cwd, config.contextManager.priorities);
  const selected: ContextFile[] = [];
  let totalChars = 0;

  for (const filePath of candidates) {
    if (selected.length >= config.contextManager.maxFiles) break;
    if (totalChars >= config.contextManager.maxChars) break;

    if (!(await existsFile(filePath))) continue;

    const raw = await fs.readFile(filePath, "utf8");
    const remaining = config.contextManager.maxChars - totalChars;
    if (remaining <= 0) break;

    const content = raw.length > remaining ? raw.slice(0, remaining) : raw;
    selected.push({
      path: filePath,
      content,
      chars: content.length,
    });
    totalChars += content.length;
  }

  if (selected.length === 0 && ctx.hasUI) {
    await ctx.ui.input("What is the entrypoint and how do we run tests/build?", "Provide command(s)");
  }

  return {
    files: selected,
    totalChars,
    summary: buildSummary(selected),
  };
}
