import fs from "node:fs";
import path from "node:path";
import type { FlowEnforcerConfig } from "./types.js";

export const DEFAULT_CONFIG: FlowEnforcerConfig = {
  approvalToken: "/approve",
  bigCommitThresholds: {
    locChanged: 350,
    filesChanged: 12,
  },
  contextManager: {
    maxFiles: 6,
    maxChars: 24_000,
    priorities: [
      "README*",
      "docs/README*",
      "docs/overview*",
      "docs/architecture*",
      "package.json",
      "pyproject.toml",
      "Cargo.toml",
      "go.mod",
      "CONTRIBUTING*",
      "Makefile",
      "justfile",
      "main.*",
      "index.*",
      "app.*",
    ],
  },
  commitStyle: "conventional",
};

export function loadConfig(cwd: string): FlowEnforcerConfig {
  const configPath = path.join(cwd, ".pi-flow-enforcer.json");
  if (!fs.existsSync(configPath)) return DEFAULT_CONFIG;

  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<FlowEnforcerConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      bigCommitThresholds: {
        ...DEFAULT_CONFIG.bigCommitThresholds,
        ...(parsed.bigCommitThresholds ?? {}),
      },
      contextManager: {
        ...DEFAULT_CONFIG.contextManager,
        ...(parsed.contextManager ?? {}),
      },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}
