/**
 * Keyword-Based Mode Activation
 * 
 * Detects and manages three activation modes:
 * - normal: Standard piflow behavior (default)
 * - deep: Thorough research mode. Activates on "deep" keyword
 * - ultrawork: Maximum productivity mode. Activates on "ultrawork" keyword
 * 
 * Modes persist within a session and are stored in PiflowState.activeKeywordMode.
 */

import type { KeywordMode } from "./types.js";

type KeywordModeState = {
  activeKeywordMode?: KeywordMode;
  lastSavedAt?: number;
};

/**
 * Keywords that activate each mode.
 * Check user input for these patterns (case-insensitive).
 */
const MODE_KEYWORDS = {
  deep: ["deep mode", "deep analysis", "do deep", "enter deep", "deep dive"],
  ultrawork: ["ultrawork", "ultra work", "max productivity", "maximum focus"],
  normal: ["normal mode", "switch to normal", "exit deep", "exit ultrawork"],
};

/**
 * System prompt injections for each mode.
 * Appended to before_agent_start context when mode is active.
 */
export const MODE_INSTRUCTIONS = {
  normal: "",
  deep:
    "Take your time. Research thoroughly before acting. Check all references. Consider multiple approaches before implementation.",
  ultrawork:
    "Work with extreme focus. Complete all tasks efficiently. Minimize unnecessary questions. Prioritize rapid task completion.",
};

/**
 * Detects if user input contains a keyword for mode activation.
 * Returns the new mode, or null if no activation keyword found.
 */
export function detectModeActivation(userInput: string): KeywordMode | null {
  const lowerInput = userInput.toLowerCase();

  // Check for ultrawork first (has priority over deep)
  for (const keyword of MODE_KEYWORDS.ultrawork) {
    if (lowerInput.includes(keyword)) {
      return "ultrawork";
    }
  }

  // Check for deep
  for (const keyword of MODE_KEYWORDS.deep) {
    if (lowerInput.includes(keyword)) {
      return "deep";
    }
  }

  // Check for normal (explicit switch back)
  for (const keyword of MODE_KEYWORDS.normal) {
    if (lowerInput.includes(keyword)) {
      return "normal";
    }
  }

  return null;
}

/**
 * Sets the active mode in session state.
 * Updates the state immediately; persistence handled by state manager.
 */
export function setActiveMode(state: KeywordModeState, mode: KeywordMode): void {
  state.activeKeywordMode = mode;
  state.lastSavedAt = Date.now();
}

/**
 * Gets the currently active mode, defaulting to "normal".
 */
export function getActiveMode(state: KeywordModeState): KeywordMode {
  return state.activeKeywordMode || "normal";
}

/**
 * Gets the system prompt instruction for the current mode.
 * Empty string for normal mode (no injection needed).
 */
export function getModeInstruction(state: KeywordModeState): string {
  const mode = getActiveMode(state);
  return MODE_INSTRUCTIONS[mode] || "";
}

/**
 * Checks if a mode is currently active.
 */
export function isModeActive(state: KeywordModeState, mode: KeywordMode): boolean {
  return getActiveMode(state) === mode;
}

/**
 * Deactivates the current mode, returning to normal.
 */
export function deactivateMode(state: KeywordModeState): void {
  setActiveMode(state, "normal");
}

/**
 * Gets formatted status string for current mode.
 * Used in status display and logging.
 */
export function getModeStatus(state: KeywordModeState): string {
  const mode = getActiveMode(state);
  const statuses: Record<KeywordMode, string> = {
    normal: "Standard mode",
    deep: "Deep mode (thorough research)",
    ultrawork: "Ultrawork mode (maximum focus)",
  };
  return statuses[mode];
}
