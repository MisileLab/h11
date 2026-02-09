import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadConfig } from "./config.js";
import type { SessionState } from "./types.js";
import { BackgroundTaskManager } from "./background-tasks.js";
import { TodoManager } from "./todo-enforcement.js";

// Event and command registration
import { registerAllEvents } from "./events.js";
import { registerAllCommands } from "./commands.js";

// Tool module registrations
import { registerAgentTools } from "./agents.js";
import { registerBackgroundTaskTools } from "./background-tasks.js";
import { registerTmuxTools } from "./tools/tmux-tool.js";
import { registerAstGrepTools } from "./tools/ast-grep-tools.js";
import { registerLSPTools } from "./tools/lsp-tools.js";
import { registerWorkflowTools } from "./workflows.js";
import { registerTodoEnforcement } from "./todo-enforcement.js";
import { registerRalphLoop } from "./ralph-loop.js";

export default function piFlowEnforcer(pi: ExtensionAPI): void {
  const config = loadConfig(process.cwd());

  const state: SessionState = {
    startedAt: Date.now(),
    approved: false,
    phase: "planning",
  };

  let knownCommands: string[] = [];
  let commandProofs: string[] = [];
  let manualChecklistSteps: string[] = [];

  const exec = async (command: string, args: string[]) => {
    const result = await pi.exec(command, args);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      code: result.code,
    };
  };

  const refreshStatus = (ctx: { hasUI: boolean; ui: { setStatus: (id: string, text?: string) => void; theme: any } }) => {
    if (!ctx.hasUI) return;
    const phaseText =
      state.phase === "planning"
        ? ctx.ui.theme.fg("accent", "flow: planning")
        : state.phase === "awaiting-approval"
          ? ctx.ui.theme.fg("warning", "flow: waiting /approve")
          : state.phase === "executing"
            ? ctx.ui.theme.fg("success", "flow: executing")
            : ctx.ui.theme.fg("error", "flow: blocked");
    ctx.ui.setStatus("pi-flow-enforcer", phaseText);
  };

  // Register modular events and commands
  registerAllEvents(pi, state, config, {
    exec,
    refreshStatus,
    knownCommands,
    commandProofs,
    manualChecklistSteps,
  });

  registerAllCommands(pi, state, { approvalToken: config.approvalToken }, {
    exec,
    refreshStatus,
    knownCommands,
    commandProofs,
    manualChecklistSteps,
  });

  // Register tool modules
  registerAgentTools(pi);
  registerWorkflowTools(pi);
  registerTmuxTools(pi);
  registerAstGrepTools(pi);
  registerLSPTools(pi);

  // Register event-driven enforcement systems
  pi.on("session_start", async (_event, ctx) => {
    // Initialize shared managers once per session
    const taskManager = new BackgroundTaskManager();
    const todoManager = new TodoManager(pi, ctx);

    // Register background task tools with manager instance
    registerBackgroundTaskTools(pi, taskManager);

    // Register session-scoped enforcement handlers with shared managers
    registerTodoEnforcement(pi, ctx, todoManager);
    registerRalphLoop(pi, ctx, todoManager);
  });
}
