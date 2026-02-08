import fs from "node:fs/promises";
import path from "node:path";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { ContextFile, FlowEnforcerConfig } from "./types.js";

export interface ContextCache {
  files: ContextFile[];
  totalChars: number;
  summary: string;
}

function byPriority(cwd: string): string[] {
  const result: string[] = [];

  // 1) README*
  result.push(path.join(cwd, "README.md"), path.join(cwd, "README"));

  // 2) docs/README*, docs/overview*, docs/architecture*
  result.push(
    path.join(cwd, "docs/README.md"),
    path.join(cwd, "docs/README"),
    path.join(cwd, "docs/overview.md"),
    path.join(cwd, "docs/overview"),
    path.join(cwd, "docs/architecture.md"),
    path.join(cwd, "docs/architecture"),
  );

  // 3) Build config
  result.push(
    path.join(cwd, "package.json"),
    path.join(cwd, "pyproject.toml"),
    path.join(cwd, "Cargo.toml"),
    path.join(cwd, "go.mod"),
  );

  // 4) Contributing / task runners
  result.push(path.join(cwd, "CONTRIBUTING.md"), path.join(cwd, "CONTRIBUTING"), path.join(cwd, "Makefile"), path.join(cwd, "justfile"));

  // 5) Entrypoints
  result.push(
    path.join(cwd, "main.ts"),
    path.join(cwd, "main.js"),
    path.join(cwd, "main.py"),
    path.join(cwd, "index.ts"),
    path.join(cwd, "index.js"),
    path.join(cwd, "app.ts"),
    path.join(cwd, "app.js"),
    path.join(cwd, "src/main.ts"),
    path.join(cwd, "src/main.js"),
    path.join(cwd, "src/index.ts"),
    path.join(cwd, "src/index.js"),
    path.join(cwd, "src/app.ts"),
    path.join(cwd, "src/app.js"),
  );

  return result;
}

async function existsFile(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
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
  const candidates = byPriority(cwd);
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
