import type { FlowEnforcerConfig } from "./types.js";

export interface UnexpectedExecutionEvent {
  reason: string;
  options: string[];
}

function extractBashExitCode(details: unknown): number | undefined {
  if (!details || typeof details !== "object") return undefined;
  const maybe = details as { exitCode?: unknown; code?: unknown };
  if (typeof maybe.exitCode === "number") return maybe.exitCode;
  if (typeof maybe.code === "number") return maybe.code;
  return undefined;
}

export function detectUnexpectedExecutionEvent(
  toolName: string,
  isError: boolean,
  details: unknown,
): UnexpectedExecutionEvent | null {
  if (isError) {
    return {
      reason: `Tool ${toolName} returned an error result.`,
      options: [
        "Return to planning and revise assumptions",
        "Retry execution after clarifying assumptions",
        "Abort execution for this session",
      ],
    };
  }

  if (toolName === "bash") {
    const exitCode = extractBashExitCode(details);
    if (typeof exitCode === "number" && exitCode !== 0) {
      return {
        reason: `Unexpected bash exit code: ${exitCode}`,
        options: [
          "Return to planning and revise assumptions",
          "Retry command with refined approach",
          "Abort execution for this session",
        ],
      };
    }
  }

  return null;
}

export async function handleExecutionStop(
  event: UnexpectedExecutionEvent,
  hasUI: boolean,
  select: ((title: string, choices: string[]) => Promise<string | undefined>) | undefined,
): Promise<string | undefined> {
  if (!hasUI || !select) return undefined;
  return select(`Execution stopped: ${event.reason}`, event.options.slice(0, 3));
}

export async function checkBigCommitThreshold(
  getDiffStats: () => Promise<{ locChanged: number; filesChanged: number }>,
  config: FlowEnforcerConfig,
): Promise<boolean> {
  const stats = await getDiffStats();
  return (
    stats.locChanged > config.bigCommitThresholds.locChanged ||
    stats.filesChanged > config.bigCommitThresholds.filesChanged
  );
}
