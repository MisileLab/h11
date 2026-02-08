import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadConfig } from "./config.js";
import { runAutoContextManager } from "./context-manager.js";
import type { SessionState } from "./types.js";

export default function piFlowEnforcer(pi: ExtensionAPI): void {
  const config = loadConfig(process.cwd());

  const state: SessionState = {
    startedAt: Date.now(),
    approved: false,
  };

  pi.registerCommand("approve", {
    description: "Approve current plan and unlock execution",
    handler: async (_args, ctx) => {
      state.approved = true;
      if (ctx.hasUI) ctx.ui.notify(`Workflow approved via ${config.approvalToken}`, "info");
      pi.sendMessage(
        {
          customType: "pi-flow-enforcer",
          content: "Approval received. Execution can proceed.",
          display: true,
        },
        { triggerTurn: false },
      );
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    state.startedAt = Date.now();
    state.approved = false;

    const contextCache = await runAutoContextManager(ctx.cwd, config, ctx);
    state.contextCache = contextCache;

    pi.sendMessage(
      {
        customType: "pi-flow-context",
        content: contextCache.summary,
        details: {
          files: contextCache.files.map((f) => f.path),
          totalChars: contextCache.totalChars,
        },
        display: false,
      },
      { triggerTurn: false },
    );

    if (ctx.hasUI) {
      ctx.ui.setStatus("pi-flow-enforcer", ctx.ui.theme.fg("accent", "flow: planning"));
      ctx.ui.notify("pi-flow-enforcer active (auto-start)", "info");
    }
  });

  pi.on("tool_call", async (event) => {
    if (state.approved) return;
    if (event.toolName === "edit" || event.toolName === "write") {
      return {
        block: true,
        reason: `Execution blocked. Type ${config.approvalToken} after plan approval.`,
      };
    }
  });
}
