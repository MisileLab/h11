import { Type } from "@sinclair/typebox";

function safeGetEntries(ctx) {
  if (!ctx || !ctx.sessionManager || typeof ctx.sessionManager.getEntries !== "function") {
    return [];
  }
  const entries = ctx.sessionManager.getEntries();
  return Array.isArray(entries) ? entries : [];
}

function emit(pi, name, payload, triggerTurn = false) {
  pi.sendMessage(
    {
      customType: "task0-spike",
      content: JSON.stringify({ name, ...payload }),
      display: true,
    },
    { triggerTurn },
  );
}

export default function task0ValidationSpike(pi) {
  pi.registerTool({
    name: "task0_spike_tool",
    label: "Task0 Spike Tool",
    description: "Validation spike tool using TypeBox parameters",
    parameters: Type.Object({
      text: Type.String({ minLength: 1 }),
    }),
    execute: async (args, ctx) => {
      const usage = typeof ctx.getContextUsage === "function" ? ctx.getContextUsage() : null;
      return {
        ok: true,
        echoed: args.text,
        usage,
      };
    },
  });

  pi.registerCommand("spike-status", {
    description: "Show registered tool/command/context usage status",
    handler: async (_args, ctx) => {
      const tools = typeof pi.getAllTools === "function" ? pi.getAllTools() : [];
      const commands = typeof pi.getCommands === "function" ? pi.getCommands() : [];
      const usage = typeof ctx.getContextUsage === "function" ? ctx.getContextUsage() : null;

      emit(pi, "spike-status", {
        toolCount: Array.isArray(tools) ? tools.length : -1,
        commandCount: Array.isArray(commands) ? commands.length : -1,
        hasSpikeTool: Array.isArray(tools) ? tools.some((tool) => tool?.name === "task0_spike_tool") : false,
        hasSpikeCommand: Array.isArray(commands)
          ? commands.some((command) => command?.name === "spike-status")
          : false,
        usage,
      });
    },
  });

  pi.registerCommand("spike-append", {
    description: "Append entry, compact session, and verify persistence",
    handler: async (_args, ctx) => {
      const payload = { persisted: true, at: new Date().toISOString() };
      pi.appendEntry("task0_spike_append", payload);

      let compactResult = "ctx.compact unavailable";
      if (typeof ctx.compact === "function") {
        try {
          await ctx.compact();
          compactResult = "compact-called";
        } catch (error) {
          compactResult = `compact-error:${String(error)}`;
        }
      }

      const entries = safeGetEntries(ctx);
      const spikeEntries = entries.filter((entry) => entry?.customType === "task0_spike_append");
      const last = spikeEntries.length > 0 ? spikeEntries[spikeEntries.length - 1] : null;

      emit(pi, "spike-append", {
        compactResult,
        persistedCount: spikeEntries.length,
        latestHasPayload: Boolean(last && last.data && last.data.persisted === true),
      });
    },
  });

  pi.registerCommand("spike-trigger", {
    description: "Send triggerTurn message",
    handler: async () => {
      emit(pi, "spike-trigger", { triggered: true }, true);
    },
  });

  pi.registerCommand("spike-user", {
    description: "Call sendUserMessage API",
    handler: async () => {
      if (typeof pi.sendUserMessage === "function") {
        pi.sendUserMessage("SPIKE_USER_MESSAGE_PAYLOAD");
        emit(pi, "spike-user", { sendUserMessageCalled: true });
      } else {
        emit(pi, "spike-user", { sendUserMessageCalled: false });
      }
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    const tools = typeof pi.getAllTools === "function" ? pi.getAllTools() : [];
    const commands = typeof pi.getCommands === "function" ? pi.getCommands() : [];
    const usage = typeof ctx.getContextUsage === "function" ? ctx.getContextUsage() : null;
    emit(pi, "session-start", {
      hasSpikeTool: Array.isArray(tools) ? tools.some((tool) => tool?.name === "task0_spike_tool") : false,
      hasSpikeCommand: Array.isArray(commands)
        ? commands.some((command) => command?.name === "spike-status")
        : false,
      usage,
    });
  });
}
