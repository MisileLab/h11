import type { ContextUsageSnapshot, ExtendedFlowEnforcerConfig } from "./types.js";

/**
 * Context Window Monitor
 * 
 * Wraps pi.dev native context usage tracking and provides:
 * - Threshold-based warnings (50%, 75%, 90%)
 * - Auto-compaction support
 * - Footer display integration
 */

/**
 * Check current context usage via native ctx.getContextUsage()
 * Returns a snapshot for threshold checking
 */
export function checkContextUsage(ctx: any): ContextUsageSnapshot | undefined {
  if (!ctx || typeof ctx.getContextUsage !== "function") {
    return undefined;
  }

  const usage = ctx.getContextUsage();
  if (!usage || typeof usage !== "object") {
    return undefined;
  }

  // Extract token count and calculate percentage
  const tokens = typeof usage.tokens === "number" ? usage.tokens : 0;
  const maxTokens = typeof usage.maxTokens === "number" ? usage.maxTokens : 128000; // Default claude max
  
  // Ensure percentage is between 0-100
  const percentage = maxTokens > 0 ? Math.round((tokens / maxTokens) * 100) : 0;
  const safePercentage = Math.min(100, Math.max(0, percentage));

  return {
    tokens,
    percentage: safePercentage,
    threshold: maxTokens,
    timestamp: Date.now(),
  };
}

/**
 * Determine if a warning should be shown based on threshold
 */
export function shouldWarn(
  snapshot: ContextUsageSnapshot | undefined,
  config: ExtendedFlowEnforcerConfig,
): { warn: boolean; level: "info" | "warning" | "critical"; message: string } {
  if (!snapshot) {
    return { warn: false, level: "info", message: "" };
  }

  // Get thresholds from config, with sensible defaults
  const infoThreshold = 50;
  const warningThreshold = 75;
  const criticalThreshold = 90;

  const { percentage } = snapshot;

  if (percentage >= criticalThreshold) {
    return {
      warn: true,
      level: "critical",
      message: `Context window at ${percentage}% — consider compacting to avoid token limit. Auto-compact available.`,
    };
  }

  if (percentage >= warningThreshold) {
    return {
      warn: true,
      level: "warning",
      message: `Context window at ${percentage}% — suggest compacting soon to prevent overflow.`,
    };
  }

  if (percentage >= infoThreshold) {
    return {
      warn: true,
      level: "info",
      message: `Context window at ${percentage}% usage.`,
    };
  }

  return { warn: false, level: "info", message: "" };
}

/**
 * Trigger context compaction with custom piflow summary
 * Only if user consents or at critical level with auto-confirm
 */
export async function autoCompact(
  ctx: any,
  options?: {
    force?: boolean;
    summary?: string;
  },
): Promise<{ success: boolean; reason?: string }> {
  if (!ctx || typeof ctx.compact !== "function") {
    return { success: false, reason: "Context compaction not available" };
  }

  try {
    // Create custom summary preserving piflow state
    const summary = options?.summary ?? "piflow session compact";

    // Call native compact with custom summary
    await ctx.compact({
      summary,
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Format context usage for footer display
 */
export function formatContextFooter(snapshot: ContextUsageSnapshot | undefined): string[] {
  if (!snapshot) {
    return [];
  }

  const percentage = snapshot.percentage;
  const bar = createPercentageBar(percentage, 20);
  
  return [`Context: ${bar} ${percentage}%`];
}

/**
 * Create a text-based percentage bar
 */
function createPercentageBar(percentage: number, width: number): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return `[${"█".repeat(filled)}${" ".repeat(empty)}]`;
}

/**
 * Integration helper: call this from turn_end event
 * Returns whether a critical warning was shown
 */
export async function checkAndNotifyContextUsage(
  ctx: any,
  config: ExtendedFlowEnforcerConfig,
): Promise<{ critical: boolean; compacted: boolean }> {
  const snapshot = checkContextUsage(ctx);
  if (!snapshot) {
    return { critical: false, compacted: false };
  }

  const { warn, level, message } = shouldWarn(snapshot, config);
  if (!warn || !ctx.hasUI) {
    return { critical: false, compacted: false };
  }

  // Notify user of context status
  if (ctx.ui && typeof ctx.ui.notify === "function") {
    ctx.ui.notify(message, level);
  }

  // At critical level, offer auto-compaction
  if (level === "critical" && ctx.ui && typeof ctx.ui.confirm === "function") {
    const shouldCompact = await ctx.ui.confirm(
      "Context Limit Approaching",
      "Would you like to compact the context window now? This will clear history but preserve your current work.",
    );

    if (shouldCompact) {
      const result = await autoCompact(ctx, {
        summary: "piflow auto-compact at critical threshold",
      });
      return { critical: true, compacted: result.success };
    }
  }

  return { critical: level === "critical", compacted: false };
}
