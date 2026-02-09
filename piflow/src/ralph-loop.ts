import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { SessionContext } from "./state-manager.js";
import { TodoManager, isBoulderingActive, getBoulderContext } from "./todo-enforcement.js";

/**
 * Ralph Loop — Auto-continuation engine for task completion
 * 
 * Automatically sends continuation prompts when:
 * - Todos exist and incomplete
 * - Bouldering mode is active
 * - Agent appears idle (agent_end without progress)
 * 
 * Respects stop conditions:
 * - All todos completed
 * - Max iterations reached
 * - User abort signal
 * - Explicit /stop-loop command
 */

interface RalphLoopState {
  active: boolean;
  taskDescription?: string;
  startedAt?: number;
  iterations: number;
  maxIterations: number;
  lastContinuationAt?: number;
  cooldownMs: number;
  stopRequested: boolean;
}

interface RalphLoopOptions {
  maxIterations?: number;
  cooldownMs?: number;
}

let loopState: RalphLoopState = {
  active: false,
  iterations: 0,
  maxIterations: 50,
  cooldownMs: 2000,
  stopRequested: false,
};

/**
 * Start Ralph Loop auto-continuation
 */
export function startLoop(
  pi: ExtensionAPI,
  ctx: SessionContext,
  task: string,
  options?: RalphLoopOptions,
): void {
  if (loopState.active) {
    throw new Error("Ralph Loop already active. Stop existing loop first.");
  }

  loopState = {
    active: true,
    taskDescription: task,
    startedAt: Date.now(),
    iterations: 0,
    maxIterations: options?.maxIterations ?? 50,
    cooldownMs: options?.cooldownMs ?? 2000,
    stopRequested: false,
  };
}

/**
 * Stop Ralph Loop
 */
export function stopLoop(): void {
  if (!loopState.active) {
    throw new Error("Ralph Loop is not active.");
  }

  loopState.stopRequested = true;
  loopState.active = false;
}

/**
 * Check if loop is currently active
 */
export function isLooping(): boolean {
  return loopState.active && !loopState.stopRequested;
}

/**
 * Get current loop state for inspection
 */
export function getLoopState(): Readonly<RalphLoopState> {
  return { ...loopState };
}

/**
 * Check if work is complete based on todo/boulder context
 */
function isWorkComplete(todoManager: TodoManager): boolean {
  // If bouldering is active, check if todos are complete
  if (isBoulderingActive()) {
    return !todoManager.hasIncompleteTodos();
  }

  // Otherwise, no way to determine completion
  return false;
}

/**
 * Check if continuation should be triggered
 */
function shouldContinue(todoManager: TodoManager): boolean {
  if (!loopState.active || loopState.stopRequested) {
    return false;
  }

  // Max iterations reached
  if (loopState.iterations >= loopState.maxIterations) {
    return false;
  }

  // Cooldown not elapsed
  const now = Date.now();
  if (loopState.lastContinuationAt && now - loopState.lastContinuationAt < loopState.cooldownMs) {
    return false;
  }

  // Work is complete
  if (isWorkComplete(todoManager)) {
    return false;
  }

  return true;
}

/**
 * Generate continuation prompt based on context
 */
function generateContinuationPrompt(todoManager: TodoManager): string {
  const boulderContext = getBoulderContext(todoManager);

  if (boulderContext) {
    return [
      "**[Ralph Loop Auto-Continuation]**",
      "",
      boulderContext,
      "",
      "Continue working on remaining tasks. Update todo status as you progress.",
    ].join("\n");
  }

  // Fallback if no boulder context
  return [
    "**[Ralph Loop Auto-Continuation]**",
    "",
    loopState.taskDescription
      ? `Task: ${loopState.taskDescription}`
      : "Continue working on the current task.",
    "",
    "Make progress on the next logical step.",
  ].join("\n");
}

/**
 * Register Ralph Loop event handlers
 */
export function registerRalphLoop(
  pi: ExtensionAPI,
  ctx: SessionContext,
  todoManager: TodoManager,
): void {
  // Hook into agent_end to detect idle state and trigger continuation
  pi.on("agent_end", async (event) => {
    if (!shouldContinue(todoManager)) {
      // Check if we just completed due to reaching limits
      if (loopState.active && loopState.iterations >= loopState.maxIterations) {
        loopState.active = false;
        pi.sendMessage(
          {
            customType: "ralph-loop-complete",
            content: `Ralph Loop stopped: max iterations (${loopState.maxIterations}) reached.`,
            display: true,
          },
          { triggerTurn: false },
        );
      } else if (loopState.active && isWorkComplete(todoManager)) {
        loopState.active = false;
        pi.sendMessage(
          {
            customType: "ralph-loop-complete",
            content: "Ralph Loop stopped: all todos completed.",
            display: true,
          },
          { triggerTurn: false },
        );
      }
      return;
    }

    // Check if agent made progress (mentioned todos, checkpoints, etc.)
    const messages = event.messages as any[];
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage || lastMessage.role !== "assistant") {
      return;
    }

    // Simple heuristic: if assistant mentioned todos/progress, likely made progress
    const content = JSON.stringify(lastMessage.content || "").toLowerCase();
    const mentionsProgress =
      content.includes("todo") ||
      content.includes("checkpoint") ||
      content.includes("complete") ||
      content.includes("implemented") ||
      content.includes("updated");

    // If no progress detected AND we're idle, send continuation
    if (!mentionsProgress) {
      loopState.iterations++;
      loopState.lastContinuationAt = Date.now();

      const prompt = generateContinuationPrompt(todoManager);

      pi.sendMessage(
        {
          customType: "ralph-loop-continuation",
          content: prompt,
          display: false,
        },
        { triggerTurn: true },
      );
    }
  });

  // Stop loop on session shutdown
  pi.on("session_shutdown", async () => {
    if (loopState.active) {
      loopState.active = false;
      loopState.stopRequested = true;
    }
  });
}
