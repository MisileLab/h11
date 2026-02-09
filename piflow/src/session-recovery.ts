/**
 * Session Recovery Layer
 * 
 * Thin wrapper over state-manager.ts for session crash resilience.
 * Saves state on session lifecycle events and restores on startup.
 * Uses pi.appendEntry("piflow_recovery", state) for persistence.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { SessionState, PiflowState } from "./types.js";

export interface RecoveryState {
  state: SessionState;
  timestamp: number;
  recoveryVersion: number;
}

/**
 * Save session state to recovery storage
 * @param pi ExtensionAPI instance
 * @param state Current session state to persist
 */
export function saveRecoveryState(pi: ExtensionAPI, state: SessionState): void {
  const recoveryState: RecoveryState = {
    state,
    timestamp: Date.now(),
    recoveryVersion: 1,
  };

  try {
    pi.appendEntry("piflow_recovery", recoveryState);
  } catch (error) {
    // Silently ignore save failures—recovery is best-effort
    // (error logging would require ctx which may not be available)
  }
}

/**
 * Load most recent recovery state from session manager
 * @param getEntries Function that returns session entries (ctx.sessionManager.getEntries)
 * @returns Latest recovery state or null if not found
 */
export function loadRecoveryState(
  getEntries: () => Array<{ id?: string; customType?: string; data?: any }>,
): SessionState | null {
  try {
    const entries = getEntries();
    const recoveryEntries = entries.filter((e) => e.customType === "piflow_recovery");

    if (recoveryEntries.length === 0) return null;

    const latest = recoveryEntries[recoveryEntries.length - 1];
    if (!latest.data) return null;

    const data = latest.data as RecoveryState;
    return data.state ?? null;
  } catch {
    // Gracefully handle any errors in recovery load
    return null;
  }
}

/**
 * Check if recovery state exists
 * @param getEntries Function that returns session entries
 * @returns True if recoverable state found
 */
export function hasRecoveryState(
  getEntries: () => Array<{ id?: string; customType?: string; data?: any }>,
): boolean {
  try {
    const entries = getEntries();
    return entries.some((e) => e.customType === "piflow_recovery");
  } catch {
    return false;
  }
}

/**
 * Attempt session recovery on startup
 * @param pi ExtensionAPI instance
 * @param ctx Session context
 * @param currentState Current session state (may be partial)
 * @returns Recovered state if available, otherwise currentState
 */
export function recoverSessionState(
  pi: ExtensionAPI,
  ctx: { hasUI?: boolean; ui?: { notify?: (msg: string, level?: string) => void } },
  currentState: SessionState,
): SessionState {
  const recovered = loadRecoveryState(() => (ctx as any).sessionManager?.getEntries?.() ?? []);

  if (recovered) {
    // Notify user of recovery only if UI available
    if (ctx?.hasUI && ctx?.ui?.notify) {
      ctx.ui.notify("Session recovered from previous checkpoint", "info");
    }
    return recovered;
  }

  return currentState;
}

/**
 * Register session recovery hooks
 * @param pi ExtensionAPI instance
 */
export function registerRecoveryHooks(pi: ExtensionAPI): void {
  // Save state on session shutdown
  pi.on("session_shutdown", async (_event, _ctx) => {
    // State is saved via events.ts session_before_compact handler
    // This is a no-op placeholder for symmetry
  });

  // Note: session_before_compact handler lives in events.ts
  // to centralize all event handler registration
}
