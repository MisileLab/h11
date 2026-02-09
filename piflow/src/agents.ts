import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { AgentDefinition, AgentResult } from "./types.js";
import { Type } from "@sinclair/typebox";
import { resolveInstalledPackageRoots } from "./package-roots.js";

interface AgentDefinitionWithPath extends AgentDefinition {
  filePath?: string;
}

/**
 * Discover agent definitions from .pi/agents/ and ~/.pi/agent/agents/
 * Follows native pi.dev agent discovery pattern
 */
export function discoverAgents(cwd: string): AgentDefinitionWithPath[] {
  const agents: AgentDefinitionWithPath[] = [];
  const packageRoots = resolveInstalledPackageRoots(cwd);
  const searchPaths = [
    join(cwd, ".pi", "agents"), // project-level
    join(process.env.HOME || "~", ".pi", "agent", "agents"), // user-level
    ...packageRoots.map((root) => join(root, ".pi", "agents")),
    ...packageRoots.map((root) => join(root, "agents")),
  ];

  for (const dir of searchPaths) {
    try {
      const files = readdirSync(dir).filter((f: string) => f.endsWith(".md"));
      for (const file of files) {
        const fullPath = join(dir, file);
        try {
          const content = readFileSync(fullPath, "utf-8");
          const agent = parseAgentMarkdown(content);
          if (agent) {
            agents.push({ ...agent, filePath: fullPath });
          }
        } catch {
          // Skip invalid agent files
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  return agents;
}

/**
 * Parse agent markdown file with YAML frontmatter
 * Extracts: name, description, tools, model, systemPrompt
 */
function parseAgentMarkdown(content: string): AgentDefinition | null {
  const lines = content.split("\n");
  if (lines[0] !== "---") return null;

  let i = 1;
  const frontmatter: Record<string, string> = {};
  while (i < lines.length && lines[i] !== "---") {
    const match = lines[i].match(/^(\w+):\s*(.+)$/);
    if (match) {
      frontmatter[match[1]] = match[2].trim();
    }
    i++;
  }

  if (!frontmatter.name || !frontmatter.description || !frontmatter.tools || !frontmatter.model) {
    return null;
  }

  // System prompt is everything after second ---
  const systemPrompt = lines.slice(i + 1).join("\n").trim();

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    tools: frontmatter.tools.split(",").map((t) => t.trim()),
    model: frontmatter.model,
    systemPrompt: systemPrompt || undefined,
  };
}

/**
 * Spawn a single agent task using native pi.dev subagent system
 * Wraps: pi --mode json -p --no-session [args]
 */
export async function spawnAgent(
  pi: ExtensionAPI,
  agentName: string,
  task: string,
  options?: {
    signal?: AbortSignal;
  },
): Promise<AgentResult> {
  const cwd = process.cwd();
  const agents = discoverAgents(cwd);
  const agent = agents.find((a) => a.name === agentName);

  if (!agent) {
    throw new Error(`Agent "${agentName}" not found. Available: ${agents.map((a) => a.name).join(", ")}`);
  }

   const startTime = Date.now();

   const args = [
     "--mode",
     "json",
     "-p",
     "--no-session",
     "--model",
     agent.model,
     "--tools",
     agent.tools.join(","),
   ];

   if (agent.filePath) {
     args.push("--append-system-prompt", agent.filePath);
   }

   args.push(task);

  try {
    const result = await pi.exec("pi", args, { signal: options?.signal });
    const duration = Date.now() - startTime;

    return {
      agentName,
      output: result.stdout || "",
      exitCode: result.code || 0,
      duration,
      tokensUsed: undefined,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    return {
      agentName,
      output: `ERROR: ${message}`,
      exitCode: 1,
      duration,
    };
  }
}

/**
 * Spawn multiple agents in parallel with concurrency control
 * Max 8 tasks, default 4 concurrent (matching native limits)
 */
export async function spawnParallelAgents(
  pi: ExtensionAPI,
  tasks: Array<{ agent: string; task: string }>,
  maxConcurrent = 4,
): Promise<AgentResult[]> {
  if (tasks.length > 8) {
    throw new Error(`Cannot spawn more than 8 parallel tasks (requested: ${tasks.length})`);
  }

  const results: AgentResult[] = [];
  let nextIndex = 0;
  const inFlight = new Set<Promise<void>>();

  async function worker() {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      const { agent, task } = tasks[index];

      const promise = spawnAgent(pi, agent, task)
        .then((result) => {
          results[index] = result;
        })
        .finally(() => {
          inFlight.delete(promise);
        });

      inFlight.add(promise);

      if (inFlight.size >= maxConcurrent) {
        await Promise.race(inFlight);
      }
    }
  }

  // Run workers to drain task queue
  await Promise.all([worker()]);

  // Wait for remaining in-flight tasks
  await Promise.allSettled(inFlight);

  return results;
}

/**
 * Chain agents sequentially with {previous} placeholder
 * Each agent receives the output of the previous agent
 */
export async function chainAgents(
  pi: ExtensionAPI,
  chain: Array<{ agent: string; taskTemplate: string }>,
): Promise<AgentResult> {
  let previousOutput = "";
  let lastResult: AgentResult | null = null;

  for (const step of chain) {
    const task = step.taskTemplate.replace(/{previous}/g, previousOutput);
    const result = await spawnAgent(pi, step.agent, task);
    previousOutput = result.output;
    lastResult = result;
  }

  if (!lastResult) {
    throw new Error("Chain cannot be empty");
  }

  return lastResult;
}

/**
 * Register LLM-callable tools for agent orchestration
 */
export function registerAgentTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "piflow_dispatch_agent",
    label: "Dispatch Agent",
    description: "Dispatch a single agent task. Returns agent output.",
    parameters: Type.Object({
      agent: Type.String({ description: "Agent name (e.g., 'explore', 'prometheus')" }),
      task: Type.String({ description: "Task description for the agent" }),
    }),
    execute: async ({ agent, task }) => {
      const result = await spawnAgent(pi, agent, task);
      return `Agent: ${result.agentName}\nExit Code: ${result.exitCode}\nDuration: ${result.duration}ms\n\nOutput:\n${result.output}`;
    },
  });

  pi.registerTool({
    name: "piflow_dispatch_parallel",
    label: "Dispatch Parallel Agents",
    description: "Dispatch multiple agents in parallel. Max 8 tasks, default 4 concurrent.",
    parameters: Type.Object({
      tasks: Type.Array(
        Type.Object({
          agent: Type.String(),
          task: Type.String(),
        }),
        { maxItems: 8 },
      ),
      maxConcurrent: Type.Optional(Type.Number({ default: 4, minimum: 1, maximum: 8 })),
    }),
    execute: async ({ tasks, maxConcurrent }) => {
      const results = await spawnParallelAgents(pi, tasks, maxConcurrent);
      return results
        .map(
          (r, i) =>
            `Task ${i + 1} (${r.agentName}):\nExit Code: ${r.exitCode}\nDuration: ${r.duration}ms\n\nOutput:\n${r.output}\n\n---\n`,
        )
        .join("\n");
    },
  });

  pi.registerTool({
    name: "piflow_dispatch_chain",
    label: "Dispatch Agent Chain",
    description: "Dispatch sequential agent chain. Use {previous} in taskTemplate to reference previous output.",
    parameters: Type.Object({
      chain: Type.Array(
        Type.Object({
          agent: Type.String(),
          taskTemplate: Type.String({
            description: "Task template. Use {previous} to reference previous agent output.",
          }),
        }),
        { minItems: 1 },
      ),
    }),
    execute: async ({ chain }) => {
      const result = await chainAgents(pi, chain);
      return `Chain completed:\nFinal Agent: ${result.agentName}\nExit Code: ${result.exitCode}\nDuration: ${result.duration}ms\n\nFinal Output:\n${result.output}`;
    },
  });
}
