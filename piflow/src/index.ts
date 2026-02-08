import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getDiffStats, generateConventionalCommitMessage, autoCommit } from "./commit.js";
import { loadConfig } from "./config.js";
import { runAutoContextManager } from "./context-manager.js";
import {
  extractCompletedCheckpointIds,
  extractManualChecklist,
  getCheckpoint,
  hasProofForCompletion,
  markCheckpointCompleted,
  nextOpenCheckpoint,
  registerCommandProof,
} from "./checkpoints.js";
import { checkBigCommitThreshold, detectUnexpectedExecutionEvent, handleExecutionStop } from "./execution-guard.js";
import {
  buildPlanInstruction,
  detectAmbiguity,
  formatAnswersForFollowup,
  inferKnownCommands,
  issuesToBlockingQuestions,
  parsePlanMarkdown,
} from "./planner.js";
import { askBlockingQuestions } from "./questions.js";
import type { SessionState } from "./types.js";

function isAssistantMessage(message: AgentMessage): message is AssistantMessage {
  return message.role === "assistant" && Array.isArray(message.content);
}

function assistantText(message: AssistantMessage): string {
  return message.content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function lastAssistantText(messages: AgentMessage[]): string {
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

  pi.registerCommand("approve", {
    description: "Approve current plan and unlock execution",
    handler: async (_args, ctx) => {
      if (!state.parsedPlan) {
        if (ctx.hasUI) ctx.ui.notify("No validated plan found. Generate and validate a plan first.", "warning");
        return;
      }

      state.approved = true;
      state.phase = "executing";
      commandProofs = [];
      manualChecklistSteps = [];
      refreshStatus(ctx);

      if (ctx.hasUI) ctx.ui.notify(`Workflow approved via ${config.approvalToken}`, "info");

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

  pi.on("session_start", async (_event, ctx) => {
    state.startedAt = Date.now();
    state.approved = false;
    state.phase = "planning";
    state.planMarkdown = undefined;
    state.parsedPlan = undefined;
    state.latestAnswers = undefined;
    commandProofs = [];
    manualChecklistSteps = [];

    const contextCache = await runAutoContextManager(ctx.cwd, config, ctx);
    state.contextCache = contextCache;
    knownCommands = inferKnownCommands(contextCache.files);

    pi.sendMessage(
      {
        customType: "pi-flow-context",
        content: contextCache.summary,
        details: {
          files: contextCache.files.map((f) => f.path),
          totalChars: contextCache.totalChars,
          knownCommands,
        },
        display: false,
      },
      { triggerTurn: false },
    );

    if (ctx.hasUI) ctx.ui.notify("pi-flow-enforcer active (auto-start)", "info");
    refreshStatus(ctx);
  });

  pi.on("input", async (event) => {
    state.lastUserPrompt = event.text;
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
      const planInstruction = buildPlanInstruction(state.contextCache?.summary ?? "No context", knownCommands);
      const answerContext = state.latestAnswers ? `\n\n${formatAnswersForFollowup(state.latestAnswers)}` : "";
      const approvalNote =
        state.phase === "awaiting-approval"
          ? "\n\nA valid plan exists. Do not execute implementation. Wait for exact /approve."
          : "";

      return {
        message: {
          customType: "pi-flow-enforcer",
          content: `${planInstruction}${answerContext}${approvalNote}`,
          display: false,
        },
      };
    }

    const nextCheckpoint = state.parsedPlan ? nextOpenCheckpoint(state.parsedPlan) : undefined;
    return {
      message: {
        customType: "pi-flow-execution",
        content: nextCheckpoint
          ? [
              `Execution mode active for ${nextCheckpoint.id}: ${nextCheckpoint.name}.`,
              "Rules:",
              "- Validate assumptions continuously.",
              "- Provide at least one proof (passing command OR manual checklist with >=2 steps + expected results).",
              `- End checkpoint with [CHECKPOINT:${nextCheckpoint.id} COMPLETE].`,
            ].join("\n")
          : "Execution mode active. Continue checkpoint flow with proof and completion markers.",
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

    const unexpected = detectUnexpectedExecutionEvent(event.toolName, event.isError, event.details);
    if (unexpected) {
      state.phase = "blocked";
      state.approved = false;
      refreshStatus(ctx);

      const choice = await handleExecutionStop(
        unexpected,
        ctx.hasUI,
        ctx.hasUI ? (title, choices) => ctx.ui.select(title, choices) : undefined,
      );

      if (choice?.includes("Return to planning")) {
        state.phase = "planning";
        state.latestAnswers = undefined;
        commandProofs = [];
        manualChecklistSteps = [];
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

      refreshStatus(ctx);
      return;
    }

    if (event.toolName === "bash") {
      const command = String((event.input as { command?: string } | undefined)?.command ?? "");
      const exitCode = extractExitCode(event.details);
      const success = !event.isError && (typeof exitCode !== "number" || exitCode === 0);
      commandProofs = registerCommandProof(command, success, commandProofs);
    }

    if (event.toolName === "edit" || event.toolName === "write") {
      const bigCommit = await checkBigCommitThreshold(() => getDiffStats(exec), config);
      if (bigCommit) {
        state.phase = "blocked";
        state.approved = false;
        refreshStatus(ctx);

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

        refreshStatus(ctx);
      }
    }
  });

  pi.on("agent_end", async (event, ctx) => {
    const text = lastAssistantText(event.messages as AgentMessage[]);
    if (!text) return;

    if (!state.approved) {
      const parsed = parsePlanMarkdown(text);
      const issues = detectAmbiguity(parsed, state.lastUserPrompt ?? "", knownCommands);

      if (issues.length > 0) {
        const schemaOnly = issues.every((issue) => issue.code === "invalid-plan-schema");
        if (schemaOnly) {
          state.phase = "planning";
          refreshStatus(ctx);
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
        refreshStatus(ctx);

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
      refreshStatus(ctx);
      if (ctx.hasUI) ctx.ui.notify(`Plan validated. Type ${config.approvalToken} to execute.`, "success");
      return;
    }

    if (!state.parsedPlan || state.phase !== "executing") return;

    manualChecklistSteps = extractManualChecklist(text);
    const completedIds = extractCompletedCheckpointIds(text);
    if (completedIds.length === 0) return;

    for (const checkpointId of completedIds) {
      const checkpoint = getCheckpoint(state.parsedPlan, checkpointId);
      if (!checkpoint) continue;

      const hasProof = hasProofForCompletion({
        commandProofs,
        manualChecklistSteps,
      });

      if (!hasProof) {
        state.phase = "blocked";
        state.approved = false;
        refreshStatus(ctx);

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

      const diffStats = await getDiffStats(exec);
      const thresholdExceeded =
        diffStats.locChanged > config.bigCommitThresholds.locChanged ||
        diffStats.filesChanged > config.bigCommitThresholds.filesChanged;

      if (thresholdExceeded) {
        state.phase = "blocked";
        state.approved = false;
        refreshStatus(ctx);

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
      const commitResult = await autoCommit(exec, message);

      if (!commitResult.committed) {
        state.phase = "blocked";
        state.approved = false;
        refreshStatus(ctx);
        if (ctx.hasUI) {
          ctx.ui.notify(`Auto-commit failed: ${commitResult.reason ?? "unknown reason"}`, "error");
        }
        return;
      }

      state.parsedPlan = markCheckpointCompleted(state.parsedPlan, checkpoint.id);
      commandProofs = [];
      manualChecklistSteps = [];

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
        refreshStatus(ctx);
        if (ctx.hasUI) ctx.ui.notify("All checkpoints completed and committed.", "success");
      } else {
        state.phase = "executing";
        state.approved = true;
        refreshStatus(ctx);
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
}
