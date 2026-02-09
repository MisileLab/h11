import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { SessionState } from "./types.js";
import type { BackgroundTaskManager } from "./background-tasks.js";
import { activateBouldering, isBoulderingActive, getBoulderContext } from "./todo-enforcement.js";
import { startLoop, stopLoop, isLooping } from "./ralph-loop.js";
import type { TodoManager } from "./todo-enforcement.js";

/**
 * Normalize command args to always be an array
 * Handlers may receive args as string (from JSON payloads) or array (normal case)
 */
function normalizeArgs(args: unknown): string[] {
  if (typeof args === "string") {
    return [args];
  }
  if (Array.isArray(args)) {
    return args;
  }
  return [];
}

/**
 * Command registration helpers
 * Passed from index.ts to support cross-module context
 */
export interface CommandHelpers {
  exec: (command: string, args: string[]) => Promise<{ stdout: string; stderr: string; code: number }>;
  refreshStatus: (ctx: any) => void;
  knownCommands: string[];
  commandProofs: string[];
  manualChecklistSteps: string[];
  taskManager?: BackgroundTaskManager;
  getTodoManager?: () => TodoManager | null;
}

/**
 * Command configuration passed from index.ts
 */
export interface CommandConfig {
  approvalToken: string;
}

/**
 * Register all slash commands
 * Centralizes command wiring from index.ts to reduce main module bloat
 */
export function registerAllCommands(
  pi: ExtensionAPI,
  state: SessionState,
  config: CommandConfig,
  helpers: CommandHelpers,
): void {
  /**
   * /approve — Unlock execution after plan approval
   */
  pi.registerCommand("approve", {
    description: "Approve current plan and unlock execution",
    handler: async (_args, ctx) => {
      if (!state.parsedPlan) {
        if (ctx.hasUI) ctx.ui.notify("No validated plan found. Generate and validate a plan first.", "warning");
        return;
      }

      state.approved = true;
      state.phase = "executing";
      helpers.commandProofs.length = 0;
      helpers.manualChecklistSteps.length = 0;
      helpers.refreshStatus(ctx);

      if (ctx.hasUI) ctx.ui.notify(`Workflow approved via ${config.approvalToken}`, "info");

      const { nextOpenCheckpoint } = await import("./checkpoints.js");
      const nextCheckpoint = nextOpenCheckpoint(state.parsedPlan);
      pi.sendMessage(
        {
          customType: "pi-flow-enforcer",
          content: nextCheckpoint
            ? `Approval received. Execute ${nextCheckpoint.id}: ${nextCheckpoint.name}. Include proof and [CHECKPOINT:${nextCheckpoint.id} COMPLETE] when done.`
            : "Approval received. Execute the approved plan checkpoint-by-checkpoint with proof.",
          display: true,
        },
        { triggerTurn: true },
      );
    },
  });

   /**
    * /plan — Start planning triad (Prometheus → Metis → Momus)
    */
   pi.registerCommand("plan", {
     description: "Start planning triad (Prometheus → Metis → Momus) for a task",
     handler: async (args, ctx) => {
       const normalizedArgs = normalizeArgs(args);
       const task = normalizedArgs.join(" ");
      if (!task) {
        if (ctx.hasUI) ctx.ui.notify("Usage: /plan <task description>", "warning");
        return;
      }

      if (ctx.hasUI) ctx.ui.notify("Starting planning triad...", "info");

      const { executePlanningTriad } = await import("./planning-triad.js");
      const result = await executePlanningTriad(pi, ctx, task);

      if (result.success) {
        if (ctx.hasUI) {
          ctx.ui.notify(`Plan created: ${result.planPath}`, "success");
        }

        if (result.planContent) {
          const { parsePlanMarkdown } = await import("./planner.js");
          try {
            const parsed = parsePlanMarkdown(result.planContent);
            state.planMarkdown = result.planContent;
            state.parsedPlan = parsed;
            state.phase = "awaiting-approval";
            helpers.refreshStatus(ctx);

            pi.sendMessage(
              {
                customType: "pi-flow-enforcer",
                content: `Planning triad completed (${result.iterationCount} iterations). Plan ready at ${result.planPath}.\n\nType ${config.approvalToken} to approve and begin execution.`,
                display: true,
              },
              { triggerTurn: false },
            );
          } catch (parseError) {
            if (ctx.hasUI) {
              ctx.ui.notify(`Plan created but parsing failed: ${parseError}`, "warning");
            }
          }
        }
      } else {
        if (ctx.hasUI) {
          ctx.ui.notify(`Planning triad failed: ${result.error}`, "error");
        }
      }
    },
  });

   /**
    * /start-work — Activate bouldering mode with a plan file
    */
   pi.registerCommand("start-work", {
     description: "Activate bouldering mode with a plan file",
     handler: async (args, ctx) => {
       const normalizedArgs = normalizeArgs(args);
       const planName = normalizedArgs.join(" ");
      if (!planName) {
        if (ctx.hasUI) ctx.ui.notify("Usage: /start-work <plan-name>", "warning");
        return;
      }

      const planPath = `.sisyphus/plans/${planName}.md`;
      activateBouldering(planName, planPath);

      if (ctx.hasUI) {
        ctx.ui.notify(`Bouldering mode activated for plan: ${planName}`, "success");
      }

      pi.sendMessage(
        {
          customType: "piflow-boulder-start",
          content: `Bouldering mode activated. Working on: ${planName}\n\nRemaining tasks will be injected into context automatically.\nUse piflow_add_todo, piflow_update_todo, and piflow_list_todos to manage progress.`,
          display: true,
        },
        { triggerTurn: false },
      );
    },
  });

   /**
    * /ralph-loop — Start auto-continuation loop
    */
   pi.registerCommand("ralph-loop", {
     description: "Start Ralph Loop auto-continuation for active bouldering",
     handler: async (args, ctx) => {
       if (!isBoulderingActive()) {
         if (ctx.hasUI) ctx.ui.notify("Bouldering mode not active. Start with /start-work first.", "warning");
         return;
       }

       if (isLooping()) {
         if (ctx.hasUI) ctx.ui.notify("Ralph Loop already active. Stop with /stop-loop first.", "warning");
         return;
       }

        const normalizedArgs = normalizeArgs(args);
        const taskDesc = normalizedArgs.join(" ") || "Continue with active plan";
       const todoManager = helpers.getTodoManager?.();
       const boulderCtx = todoManager ? getBoulderContext(todoManager) : null;

       startLoop(pi, ctx as any, taskDesc, {
         maxIterations: 50,
         cooldownMs: 2000,
       });

       if (ctx.hasUI) {
         ctx.ui.notify(`Ralph Loop started${boulderCtx ? "" : " on active plan"}`, "success");
       }

      pi.sendMessage(
        {
          customType: "piflow-ralph-start",
          content: `Ralph Loop activated. Auto-continuation will trigger after each agent turn until todos are complete or max iterations reached.\n\nTask: ${taskDesc}`,
          display: true,
        },
        { triggerTurn: false },
      );
    },
  });

  /**
   * /stop-loop — Stop Ralph Loop
   */
  pi.registerCommand("stop-loop", {
    description: "Stop Ralph Loop auto-continuation",
    handler: async (_args, ctx) => {
      if (!isLooping()) {
        if (ctx.hasUI) ctx.ui.notify("Ralph Loop is not active.", "warning");
        return;
      }

      stopLoop();

      if (ctx.hasUI) {
        ctx.ui.notify("Ralph Loop stopped", "info");
      }

      pi.sendMessage(
        {
          customType: "piflow-ralph-stop",
          content: "Ralph Loop stopped. Manual continuation required.",
          display: true,
        },
        { triggerTurn: false },
      );
    },
  });

  /**
   * /refactor — Refactor code (not yet implemented)
   */
  pi.registerCommand("refactor", {
    description: "Refactor code with AST-aware transformations (coming soon)",
    handler: async (args, ctx) => {
      if (ctx.hasUI) {
        ctx.ui.notify(
          "/refactor not yet implemented. Use /plan to create a refactoring task instead.",
          "warning",
        );
      }
    },
  });

   /**
    * /status — Show workflow and task status
    */
   pi.registerCommand("status", {
     description: "Show current workflow status and task statistics",
     handler: async (_args, ctx) => {
       const statusInfo: string[] = [];

       statusInfo.push(`Phase: ${state.phase}`);
       statusInfo.push(`Approved: ${state.approved ? "Yes" : "No"}`);

        if (isBoulderingActive()) {
          statusInfo.push("Bouldering: Active");
        } else {
          statusInfo.push("Bouldering: Inactive");
        }

      if (isLooping()) {
        statusInfo.push("Ralph Loop: Running");
      } else {
        statusInfo.push("Ralph Loop: Stopped");
      }

      if (helpers.taskManager) {
        const stats = helpers.taskManager.getStats();
        statusInfo.push(
          `Background Tasks: ${stats.running} running, ${stats.pending} pending, ${stats.completed} completed`,
        );
      }

      const message = statusInfo.join("\n");
      if (ctx.hasUI) ctx.ui.notify(message, "info");
    },
  });

  /**
   * /agents — List discovered agents
   */
  pi.registerCommand("agents", {
    description: "List discovered agents available in this workspace",
    handler: async (_args, ctx) => {
      const { discoverAgents } = await import("./agents.js");
      const agents = discoverAgents(process.cwd());

      if (agents.length === 0) {
        if (ctx.hasUI) ctx.ui.notify("No agents discovered.", "info");
        return;
      }

      const agentList = agents
        .map((a) => `• ${a.name}: ${a.description}`)
        .join("\n");

      const message = `Discovered ${agents.length} agent(s):\n\n${agentList}`;
      if (ctx.hasUI) ctx.ui.notify(message, "info");
    },
  });

   /**
    * /dispatch — Dispatch agent (stub; use tool instead)
    */
   pi.registerCommand("dispatch", {
     description: "Dispatch a single agent task",
     handler: async (args, ctx) => {
       const normalizedArgs = normalizeArgs(args);
       if (normalizedArgs.length < 2) {
         if (ctx.hasUI) {
           ctx.ui.notify("Usage: Use tool piflow_dispatch_agent directly for better control.", "info");
         }
         return;
       }

       const agentName = normalizedArgs[0];
       const task = normalizedArgs.slice(1).join(" ");

      if (ctx.hasUI) ctx.ui.notify(`Dispatching agent: ${agentName}`, "info");

      const { spawnAgent } = await import("./agents.js");
      try {
        const result = await spawnAgent(pi, agentName, task);
        if (ctx.hasUI) {
          ctx.ui.notify(
            `Agent ${result.agentName} completed (exit ${result.exitCode})`,
            result.exitCode === 0 ? "success" : "error",
          );
        }
      } catch (error) {
        if (ctx.hasUI) {
          ctx.ui.notify(`Agent dispatch failed: ${error}`, "error");
        }
      }
    },
  });

  pi.registerCommand("deep", {
    description: "Enter deep analysis mode for thorough research",
    handler: async (_args, ctx) => {
      const { setActiveMode, getModeStatus } = await import("./keyword-modes.js");
      setActiveMode(state, "deep");
      const modeStatus = getModeStatus(state);
      if (ctx.hasUI) {
        ctx.ui.notify(`Activated ${modeStatus}. System will prompt for thorough research.`, "success");
      }
    },
  });

  pi.registerCommand("ultrawork", {
    description: "Enter ultrawork mode for maximum productivity",
    handler: async (_args, ctx) => {
      const { setActiveMode, getModeStatus } = await import("./keyword-modes.js");
      setActiveMode(state, "ultrawork");
      const modeStatus = getModeStatus(state);
      if (ctx.hasUI) {
        ctx.ui.notify(`Activated ${modeStatus}. System will work with extreme focus and minimal interruptions.`, "success");
      }
    },
  });

  pi.registerCommand("normal", {
    description: "Switch back to normal mode",
    handler: async (_args, ctx) => {
      const { setActiveMode, getModeStatus } = await import("./keyword-modes.js");
      setActiveMode(state, "normal");
      const modeStatus = getModeStatus(state);
      if (ctx.hasUI) {
        ctx.ui.notify(`Switched to ${modeStatus}.`, "info");
      }
    },
  });

  /**
   * /cancel-work — Cancel active work (not yet implemented)
   */
  pi.registerCommand("cancel-work", {
    description: "Cancel active work and cleanup (coming soon)",
    handler: async (args, ctx) => {
      if (ctx.hasUI) {
        ctx.ui.notify("/cancel-work not yet implemented. Use /stop-loop to pause auto-continuation.", "warning");
      }
    },
  });
}
