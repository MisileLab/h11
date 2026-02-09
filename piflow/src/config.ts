import fs from "node:fs";
import path from "node:path";
import { resolveInstalledPackageRoots } from "./package-roots.js";
import type {
  FlowEnforcerConfig,
  ExtendedFlowEnforcerConfig,
  AgentConfig,
  HooksConfig,
  ToolsConfig,
  CommandsConfig,
  ThresholdsConfig,
  ModesConfig,
  TodoConfig,
} from "./types.js";

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

export const DEFAULT_AGENTS: AgentConfig = {
  enabled: true,
  maxConcurrent: 4,
  models: {
    planning: "gpt-4-turbo",
    review: "gpt-4-turbo",
    execution: "gpt-4-turbo",
  },
  timeout: 300_000,
};

export const DEFAULT_HOOKS: HooksConfig = {
  onPlanCreated: undefined,
  onTodoUpdated: undefined,
  onContextWarning: undefined,
  onToolError: undefined,
  onModeSwitch: undefined,
};

export const DEFAULT_TOOLS: ToolsConfig = {
  disabled: [],
  lsp: {
    enabled: true,
  },
  astGrep: {
    enabled: true,
    dryRunDefault: true,
  },
  tmux: {
    enabled: true,
  },
};

export const DEFAULT_COMMANDS: CommandsConfig = {
  disabled: [],
  aliases: {
    p: "plan",
    a: "approve",
    s: "status",
    w: "start-work",
  },
};

export const DEFAULT_THRESHOLDS: ThresholdsConfig = {
  contextPercentage: 75,
  commentCheckEnabled: true,
  maxCommentIssues: 5,
};

export const DEFAULT_MODES: ModesConfig = {
  ultrawork: true,
  deep: true,
  ralphLoop: {
    enabled: true,
    maxIterations: 10,
    cooldownMs: 1000,
  },
};

export const DEFAULT_TODO: TodoConfig = {
  enforceCompletion: true,
  blockOnIncomplete: false,
  showBoulderContext: true,
  maxDisplayItems: 10,
};

function stripJsonComments(json: string): string {
  let result = "";
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < json.length; i++) {
    const char = json[i];
    const nextChar = json[i + 1];

    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }

    if (char === "\\" && inString) {
      escapeNext = true;
      result += char;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }

    if (inString) {
      result += char;
      continue;
    }

    if (char === "/" && nextChar === "/") {
      while (i < json.length && json[i] !== "\n") {
        i++;
      }
      continue;
    }

    if (char === "/" && nextChar === "*") {
      i += 2;
      while (i < json.length - 1) {
        if (json[i] === "*" && json[i + 1] === "/") {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    result += char;
  }

  return result;
}

export function loadConfig(cwd: string): ExtendedFlowEnforcerConfig {
  const jsoncPath = path.join(cwd, ".pi-flow-enforcer.jsonc");
  const jsonPath = path.join(cwd, ".pi-flow-enforcer.json");

  let configPath: string | undefined;
  if (fs.existsSync(jsoncPath)) {
    configPath = jsoncPath;
  } else if (fs.existsSync(jsonPath)) {
    configPath = jsonPath;
  }

  if (!configPath) {
    const packageRoots = resolveInstalledPackageRoots(cwd);

    for (const packageRoot of packageRoots) {
      const packageJsoncPath = path.join(packageRoot, ".pi-flow-enforcer.jsonc");
      const packageJsonPath = path.join(packageRoot, ".pi-flow-enforcer.json");

      if (fs.existsSync(packageJsoncPath)) {
        configPath = packageJsoncPath;
        break;
      }

      if (fs.existsSync(packageJsonPath)) {
        configPath = packageJsonPath;
        break;
      }
    }

    if (!configPath) {
      return {
        ...DEFAULT_CONFIG,
        agents: DEFAULT_AGENTS,
        hooks: DEFAULT_HOOKS,
        tools: DEFAULT_TOOLS,
        commands: DEFAULT_COMMANDS,
        thresholds: DEFAULT_THRESHOLDS,
        modes: DEFAULT_MODES,
        todo: DEFAULT_TODO,
      } as ExtendedFlowEnforcerConfig;
    }
  }

  try {
    let raw = fs.readFileSync(configPath, "utf8");
    if (configPath.endsWith(".jsonc")) {
      raw = stripJsonComments(raw);
    }
    const parsed = JSON.parse(raw) as Partial<ExtendedFlowEnforcerConfig>;
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
      agents: {
        ...DEFAULT_AGENTS,
        ...(parsed.agents ?? {}),
      },
      hooks: {
        ...DEFAULT_HOOKS,
        ...(parsed.hooks ?? {}),
      },
      tools: {
        ...DEFAULT_TOOLS,
        ...(parsed.tools ?? {}),
        lsp: {
          ...DEFAULT_TOOLS.lsp,
          ...(parsed.tools?.lsp ?? {}),
        },
        astGrep: {
          ...DEFAULT_TOOLS.astGrep,
          ...(parsed.tools?.astGrep ?? {}),
        },
        tmux: {
          ...DEFAULT_TOOLS.tmux,
          ...(parsed.tools?.tmux ?? {}),
        },
      },
      commands: {
        ...DEFAULT_COMMANDS,
        ...(parsed.commands ?? {}),
      },
      thresholds: {
        ...DEFAULT_THRESHOLDS,
        ...(parsed.thresholds ?? {}),
      },
      modes: {
        ...DEFAULT_MODES,
        ...(parsed.modes ?? {}),
        ralphLoop: {
          ...DEFAULT_MODES.ralphLoop,
          ...(parsed.modes?.ralphLoop ?? {}),
        },
      },
      todo: {
        ...DEFAULT_TODO,
        ...(parsed.todo ?? {}),
      },
    } as ExtendedFlowEnforcerConfig;
  } catch {
    return {
      ...DEFAULT_CONFIG,
      agents: DEFAULT_AGENTS,
      hooks: DEFAULT_HOOKS,
      tools: DEFAULT_TOOLS,
      commands: DEFAULT_COMMANDS,
      thresholds: DEFAULT_THRESHOLDS,
      modes: DEFAULT_MODES,
      todo: DEFAULT_TODO,
    } as ExtendedFlowEnforcerConfig;
  }
}
