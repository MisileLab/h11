import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { SessionState } from "./types.js";
import type { FlowEnforcerConfig } from "./types.js";

/**
 * Registers all pi.dev event handlers for piflow.
 * 
 * Extracts existing inline event logic from index.ts and adds new handlers
 * for the extended event system (22+ events).
 */
export function registerAllEvents(
  pi: ExtensionAPI,
  state: SessionState,
  config: FlowEnforcerConfig,
  context: {
    exec: (command: string, args: string[]) => Promise<{ stdout: string; stderr: string; code: number }>;
    refreshStatus: (ctx: any) => void;
    knownCommands: string[];
    commandProofs: string[];
    manualChecklistSteps: string[];
  }
): void {
  // ============================================================================
  // EXISTING EVENT HANDLERS (extracted from index.ts)
  // ============================================================================

   pi.on("session_start", async (_event, ctx) => {
     const { loadRecoveryState } = await import("./session-recovery.js");
     const recovered = loadRecoveryState(() => (ctx as any).sessionManager?.getEntries?.() ?? []);
     
     if (recovered) {
       Object.assign(state, recovered);
       if (ctx.hasUI) ctx.ui.notify("Session recovered from previous checkpoint", "info");
     } else {
       state.startedAt = Date.now();
       state.approved = false;
       state.phase = "planning";
       state.planMarkdown = undefined;
       state.parsedPlan = undefined;
       state.latestAnswers = undefined;
     }
     
     context.commandProofs.length = 0;
     context.manualChecklistSteps.length = 0;

     const { runAutoContextManager } = await import("./context-manager.js");
     const contextCache = await runAutoContextManager(ctx.cwd, config, ctx);
     state.contextCache = contextCache;

     const { inferKnownCommands } = await import("./planner.js");
     const newKnownCommands = inferKnownCommands(contextCache.files);
     context.knownCommands.length = 0;
     context.knownCommands.push(...newKnownCommands);

     pi.sendMessage(
       {
         customType: "pi-flow-context",
         content: contextCache.summary,
         details: {
           files: contextCache.files.map((f) => f.path),
           totalChars: contextCache.totalChars,
           knownCommands: context.knownCommands,
         },
         display: false,
       },
       { triggerTurn: false },
     );

     if (!recovered && ctx.hasUI) ctx.ui.notify("pi-flow-enforcer active (auto-start)", "info");
     context.refreshStatus(ctx);
   });

  pi.on("input", async (event, ctx) => {
    state.lastUserPrompt = event.text;
    
    const { detectModeActivation, setActiveMode, getModeStatus } = await import("./keyword-modes.js");
    const detectedMode = detectModeActivation(event.text);
    if (detectedMode) {
      setActiveMode(state, detectedMode);
      const modeStatus = getModeStatus(state);
      if (ctx?.hasUI) {
        ctx.ui.notify(`Switched to ${modeStatus}`, "info");
      }
    }
    
    return { action: "continue" as const };
  });

  pi.on("before_agent_start", async () => {
    if (state.phase === "blocked") {
      return {
        message: {
          customType: "pi-flow-enforcer",
          content: "Execution is blocked. Wait for user decision before continuing.",
          display: false,
        },
      };
    }

    if (!state.approved) {
      const { buildPlanInstruction, formatAnswersForFollowup } = await import("./planner.js");
      const planInstruction = buildPlanInstruction(state.contextCache?.summary ?? "No context", context.knownCommands);
      const answerContext = state.latestAnswers ? `\n\n${formatAnswersForFollowup(state.latestAnswers)}` : "";
      const approvalNote =
        state.phase === "awaiting-approval"
          ? "\n\nA valid plan exists. Do not execute implementation. Wait for exact /approve."
          : "";
      
      const { getModeInstruction } = await import("./keyword-modes.js");
      const modeInstruction = getModeInstruction(state);
      const modeContext = modeInstruction ? `\n\n${modeInstruction}` : "";

      return {
        message: {
          customType: "pi-flow-enforcer",
          content: `${planInstruction}${answerContext}${approvalNote}${modeContext}`,
          display: false,
        },
      };
    }

    const { nextOpenCheckpoint } = await import("./checkpoints.js");
    const nextCheckpoint = state.parsedPlan ? nextOpenCheckpoint(state.parsedPlan) : undefined;
    
    const { getModeInstruction } = await import("./keyword-modes.js");
    const modeInstruction = getModeInstruction(state);
    const modeContext = modeInstruction ? `\n\n${modeInstruction}` : "";
    
    return {
      message: {
        customType: "pi-flow-execution",
        content: (nextCheckpoint
          ? [
              `Execution mode active for ${nextCheckpoint.id}: ${nextCheckpoint.name}.`,
              "Rules:",
              "- Validate assumptions continuously.",
              "- Provide at least one proof (passing command OR manual checklist with >=2 steps + expected results).",
              `- End checkpoint with [CHECKPOINT:${nextCheckpoint.id} COMPLETE].`,
            ].join("\n")
          : "Execution mode active. Continue checkpoint flow with proof and completion markers.") + modeContext,
        display: false,
      },
    };
  });

  pi.on("tool_call", async (event) => {
    if (state.phase === "blocked") {
      return {
        block: true,
        reason: "Execution blocked: choose one of the proposed options first.",
      };
    }

    if (!state.approved && (event.toolName === "edit" || event.toolName === "write")) {
      return {
        block: true,
        reason: `Execution blocked. Type ${config.approvalToken} after plan approval.`,
      };
    }
  });

  pi.on("tool_result", async (event, ctx) => {
    if (state.phase !== "executing") return;

    const { detectUnexpectedExecutionEvent, handleExecutionStop } = await import("./execution-guard.js");
    const unexpected = detectUnexpectedExecutionEvent(event.toolName, event.isError, event.details);
    if (unexpected) {
      state.phase = "blocked";
      state.approved = false;
      context.refreshStatus(ctx);

      const choice = await handleExecutionStop(
        unexpected,
        ctx.hasUI,
        ctx.hasUI ? (title, choices) => ctx.ui.select(title, choices) : undefined,
      );

      if (choice?.includes("Return to planning")) {
        state.phase = "planning";
        state.latestAnswers = undefined;
        context.commandProofs.length = 0;
        context.manualChecklistSteps.length = 0;
        pi.sendMessage(
          {
            customType: "pi-flow-enforcer",
            content: "Execution stopped. Return to planning and revise assumptions in full schema.",
            display: true,
          },
          { triggerTurn: true },
        );
      } else if (choice?.includes("Retry")) {
        state.phase = "executing";
        state.approved = true;
        pi.sendMessage(
          {
            customType: "pi-flow-enforcer",
            content: "Retry execution with clarified assumptions. Keep checkpoint proof requirements.",
            display: true,
          },
          { triggerTurn: true },
        );
      }

      context.refreshStatus(ctx);
      return;
    }

    if (event.toolName === "bash") {
      const { registerCommandProof } = await import("./checkpoints.js");
      const command = String((event.input as { command?: string } | undefined)?.command ?? "");
      const exitCode = extractExitCode(event.details);
      const success = !event.isError && (typeof exitCode !== "number" || exitCode === 0);
      const updatedProofs = registerCommandProof(command, success, context.commandProofs);
      context.commandProofs.length = 0;
      context.commandProofs.push(...updatedProofs);
    }

    if (event.toolName === "edit" || event.toolName === "write") {
      const { checkBigCommitThreshold } = await import("./execution-guard.js");
      const { getDiffStats } = await import("./commit.js");
      const bigCommit = await checkBigCommitThreshold(() => getDiffStats(context.exec), config);
      if (bigCommit) {
        state.phase = "blocked";
        state.approved = false;
        context.refreshStatus(ctx);

        if (ctx.hasUI) {
          const choice = await ctx.ui.select("Big commit threshold crossed. Split work?", [
            "Split into smaller checkpoints",
            "Re-plan and reduce scope",
            "Proceed once with explicit override",
          ]);

          if (choice?.startsWith("Split")) {
            state.phase = "planning";
            pi.sendMessage(
              {
                customType: "pi-flow-enforcer",
                content: "Split the remaining work into smaller checkpoints and output revised plan schema.",
                display: true,
              },
              { triggerTurn: true },
            );
          } else if (choice?.startsWith("Proceed")) {
            state.phase = "executing";
            state.approved = true;
          }
        }

        context.refreshStatus(ctx);
      }

      const { checkForAISlop, formatWarning, isCommentCheckerEnabled } = await import("./comment-checker.js");
      if (isCommentCheckerEnabled(config as any)) {
        const toolResult = String((event.output as unknown) ?? "");
        const results = checkForAISlop(toolResult);
        if (results.length > 0) {
          const warning = formatWarning(results);
          pi.sendMessage(
            {
              customType: "pi-flow-comment-check",
              content: warning,
              display: true,
            },
            { triggerTurn: true },
          );
        }
      }
    }
  });

  pi.on("agent_end", async (event, ctx) => {
    const text = lastAssistantText(event.messages as any[]);
    if (!text) return;

    if (!state.approved) {
      const { parsePlanMarkdown, detectAmbiguity, issuesToBlockingQuestions } = await import("./planner.js");
      const { askBlockingQuestions } = await import("./questions.js");
      const { formatAnswersForFollowup } = await import("./planner.js");

      const parsed = parsePlanMarkdown(text);
      const issues = detectAmbiguity(parsed, state.lastUserPrompt ?? "", context.knownCommands);

      if (issues.length > 0) {
        const schemaOnly = issues.every((issue) => issue.code === "invalid-plan-schema");
        if (schemaOnly) {
          state.phase = "planning";
          context.refreshStatus(ctx);
          pi.sendMessage(
            {
              customType: "pi-flow-enforcer",
              content: "Plan schema invalid. Regenerate using the exact required Markdown schema.",
              display: false,
            },
            { triggerTurn: true },
          );
          return;
        }

        const questions = issuesToBlockingQuestions(issues);
        const answers = await askBlockingQuestions(ctx, questions);

        state.phase = "planning";
        state.latestAnswers = answers;
        context.refreshStatus(ctx);

        pi.sendMessage(
          {
            customType: "pi-flow-enforcer",
            content: `${formatAnswersForFollowup(answers)}\n\nRevise and output the complete plan schema only.`,
            display: false,
          },
          { triggerTurn: true },
        );
        return;
      }

      state.planMarkdown = text;
      state.parsedPlan = parsed;
      state.phase = "awaiting-approval";
      context.refreshStatus(ctx);
      if (ctx.hasUI) ctx.ui.notify(`Plan validated. Type ${config.approvalToken} to execute.`, "success");
      return;
    }

    if (!state.parsedPlan || state.phase !== "executing") return;

    const {
      extractManualChecklist,
      extractCompletedCheckpointIds,
      getCheckpoint,
      hasProofForCompletion,
      markCheckpointCompleted,
      nextOpenCheckpoint,
    } = await import("./checkpoints.js");
    const { getDiffStats, generateConventionalCommitMessage, autoCommit } = await import("./commit.js");

    const newManualSteps = extractManualChecklist(text);
    context.manualChecklistSteps.length = 0;
    context.manualChecklistSteps.push(...newManualSteps);
    const completedIds = extractCompletedCheckpointIds(text);
    if (completedIds.length === 0) return;

    for (const checkpointId of completedIds) {
      const checkpoint = getCheckpoint(state.parsedPlan, checkpointId);
      if (!checkpoint) continue;

      const hasProof = hasProofForCompletion({
        commandProofs: context.commandProofs,
        manualChecklistSteps: context.manualChecklistSteps,
      });

      if (!hasProof) {
        state.phase = "blocked";
        state.approved = false;
        context.refreshStatus(ctx);

        if (ctx.hasUI) {
          const proof = await ctx.ui.input(
            `Checkpoint ${checkpoint.id} cannot complete: proof missing. Define proof (blocking).`,
            "e.g. yarn build passes OR 2-step manual checklist with expected results",
          );
          if (proof?.trim()) {
            state.phase = "planning";
            pi.sendMessage(
              {
                customType: "pi-flow-enforcer",
                content: `Proof definition from user: ${proof.trim()}\nRevise plan/checkpoint proof and continue in schema.`,
                display: true,
              },
              { triggerTurn: true },
            );
          }
        }

        return;
      }

      const diffStats = await getDiffStats(context.exec);
      const thresholdExceeded =
        diffStats.locChanged > config.bigCommitThresholds.locChanged ||
        diffStats.filesChanged > config.bigCommitThresholds.filesChanged;

      if (thresholdExceeded) {
        state.phase = "blocked";
        state.approved = false;
        context.refreshStatus(ctx);

        if (ctx.hasUI) {
          const choice = await ctx.ui.select("Checkpoint ready but commit is too large. Choose split strategy.", [
            "Split current checkpoint into smaller checkpoints",
            "Re-plan from this checkpoint",
            "Abort for now",
          ]);

          if (choice?.startsWith("Split") || choice?.startsWith("Re-plan")) {
            state.phase = "planning";
            pi.sendMessage(
              {
                customType: "pi-flow-enforcer",
                content: "Create a revised smaller-checkpoint plan before continuing.",
                display: true,
              },
              { triggerTurn: true },
            );
          }
        }

        return;
      }

      const message = generateConventionalCommitMessage(state.parsedPlan, checkpoint.id, checkpoint.name, diffStats);
      const commitResult = await autoCommit(context.exec, message);

      if (!commitResult.committed) {
        state.phase = "blocked";
        state.approved = false;
        context.refreshStatus(ctx);
        if (ctx.hasUI) {
          ctx.ui.notify(`Auto-commit failed: ${commitResult.reason ?? "unknown reason"}`, "error");
        }
        return;
      }

      state.parsedPlan = markCheckpointCompleted(state.parsedPlan, checkpoint.id);
      context.commandProofs.length = 0;
      context.manualChecklistSteps.length = 0;

      pi.sendMessage(
        {
          customType: "pi-flow-enforcer",
          content: `Committed ${checkpoint.id} with: ${message.subject}`,
          details: {
            checkpoint: checkpoint.id,
            commit: message,
            diff: diffStats,
          },
          display: true,
        },
        { triggerTurn: false },
      );

      const next = nextOpenCheckpoint(state.parsedPlan);
      if (!next) {
        state.phase = "planning";
        state.approved = false;
        context.refreshStatus(ctx);
        if (ctx.hasUI) ctx.ui.notify("All checkpoints completed and committed.", "success");
      } else {
        state.phase = "executing";
        state.approved = true;
        context.refreshStatus(ctx);
        pi.sendMessage(
          {
            customType: "pi-flow-enforcer",
            content: `Continue with next checkpoint ${next.id}: ${next.name}.`,
            display: true,
          },
          { triggerTurn: true },
        );
      }
    }
  });

  // ============================================================================
  // NEW EVENT HANDLERS (extended event system)
  // ============================================================================

    pi.on("session_before_compact", async (_event, ctx) => {
      const { saveRecoveryState } = await import("./session-recovery.js");
      saveRecoveryState(pi, state);
    });

  pi.on("session_compact", async (_event, _ctx) => {
    // Restore state after compaction
    // State manager will handle reloading from appendEntry
  });

  pi.on("session_before_fork", async (_event, _ctx) => {
    // Validate fork is safe
    // Can return { cancel: true } to prevent fork if needed
  });

   pi.on("session_shutdown", async (_event, _ctx) => {
     const { saveRecoveryState } = await import("./session-recovery.js");
     saveRecoveryState(pi, state);
   });

  pi.on("turn_start", async (event, ctx) => {
    // Increment turn counter, check context usage if needed
    if (ctx.hasUI && config.approvalToken) {
      // Future: context monitoring will hook here
    }
  });

   pi.on("turn_end", async (event, ctx) => {
     // Analyze assistant output, check for completion signals
     // Future: todo enforcement and Ralph Loop will hook here

     // Context window monitoring
     const { checkAndNotifyContextUsage } = await import("./context-monitor.js");
     await checkAndNotifyContextUsage(ctx, config);
   });

  pi.on("model_select", async (event, _ctx) => {
    // Log model changes, enforce model constraints
    // Currently no-op, can add logging/enforcement as needed
  });

  pi.on("user_bash", async (event, _ctx) => {
    // Intercept ! and !! commands for safety
    // Currently allow all bash commands through
    return { action: "continue" as const };
  });

  pi.on("context", async (event, _ctx) => {
    // Inject piflow context/state into LLM messages
    // Currently handled via before_agent_start
    // Can add additional context injection here if needed
  });

  pi.on("session_switch", async (_event, _ctx) => {
    // Save state for old session, load for new
    // State manager will handle session-specific state
  });

  pi.on("session_before_switch", async (_event, _ctx) => {
    // Validate switch is safe (warn about unsaved work)
    // Can return { cancel: true } to prevent switch
    if (state.approved && state.phase === "executing") {
      // Future: warn about incomplete work
    }
  });

  pi.on("session_before_tree", async (_event, _ctx) => {
    // Handle tree navigation preparation
  });

  pi.on("session_tree", async (_event, _ctx) => {
    // Update state after tree navigation
  });
}

// Helper function extracted from index.ts
function isAssistantMessage(message: any): boolean {
  return message.role === "assistant" && Array.isArray(message.content);
}

function assistantText(message: any): string {
  return message.content
    .filter((block: any) => block.type === "text")
    .map((block: any) => block.text)
    .join("\n")
    .trim();
}

function lastAssistantText(messages: any[]): string {
  const last = [...messages].reverse().find(isAssistantMessage);
  if (!last) return "";
  return assistantText(last);
}

function extractExitCode(details: unknown): number | undefined {
  if (!details || typeof details !== "object") return undefined;
  const maybe = details as { exitCode?: unknown; code?: unknown };
  if (typeof maybe.exitCode === "number") return maybe.exitCode;
  if (typeof maybe.code === "number") return maybe.code;
  return undefined;
}
