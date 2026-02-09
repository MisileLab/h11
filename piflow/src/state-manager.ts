import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { PiflowState, TaskStatus, TodoItem } from "./types.js";

export interface SessionManager {
  getEntries(): Array<{ id?: string; customType?: string; data?: any }>;
}

export interface SessionContext {
  sessionManager: SessionManager;
}

/**
 * Initialize a new piflow session state
 */
export function initializeState(sessionId: string): PiflowState {
  return {
    sessionId,
    startedAt: Date.now(),
    phase: "planning",
    approved: false,
    todos: [],
    activeTasks: new Map(),
    ralphLoopIterations: 0,
    lastSavedAt: Date.now(),
  };
}

/**
 * Save state to session persistence via pi.appendEntry()
 * @param pi ExtensionAPI instance
 * @param state Current state to persist
 */
export function saveState(pi: ExtensionAPI, state: PiflowState): void {
  const stateCopy = {
    ...state,
    activeTasks: Array.from(state.activeTasks.entries()),
    lastSavedAt: Date.now(),
  };
  pi.appendEntry("piflow_state", stateCopy);
}

/**
 * Load state from session persistence
 * Filters entries by customType "piflow_state" and returns the latest
 * @param ctx Session context with sessionManager
 * @returns Latest PiflowState or null if not found
 */
export function loadState(ctx: SessionContext): PiflowState | null {
  const entries = ctx.sessionManager.getEntries();
  const stateEntries = entries.filter((e) => e.customType === "piflow_state");

  if (stateEntries.length === 0) return null;

  const latest = stateEntries[stateEntries.length - 1];
  if (!latest.data) return null;

  const data = latest.data as any;
  return {
    sessionId: data.sessionId ?? "unknown",
    startedAt: data.startedAt ?? Date.now(),
    phase: data.phase ?? "planning",
    approved: data.approved ?? false,
    todos: data.todos ?? [],
    activeTasks: new Map(data.activeTasks ?? []),
    planningTriad: data.planningTriad,
    contextSnapshot: data.contextSnapshot,
    activeKeywordMode: data.activeKeywordMode,
    ralphLoopIterations: data.ralphLoopIterations ?? 0,
    lastSavedAt: data.lastSavedAt ?? Date.now(),
  };
}

/**
 * Atomic read-modify-write of state
 * Loads current state, applies updater function, saves result
 * @param pi ExtensionAPI instance
 * @param ctx Session context
 * @param updater Function to transform state
 * @returns Updated state
 */
export function updateState(
  pi: ExtensionAPI,
  ctx: SessionContext,
  updater: (state: PiflowState) => PiflowState,
): PiflowState {
  const current = loadState(ctx);
  const updated = updater(current ?? initializeState("unknown"));
  saveState(pi, updated);
  return updated;
}

/**
 * Add a todo item
 * @param state Current state
 * @param id Unique todo ID
 * @param content Todo description
 * @param priority Priority level
 * @returns Updated state with new todo
 */
export function addTodo(
  state: PiflowState,
  id: string,
  content: string,
  priority: "low" | "medium" | "high" = "medium",
): PiflowState {
  const newTodo: TodoItem = {
    id,
    content,
    status: "pending",
    priority,
    createdAt: Date.now(),
  };
  return {
    ...state,
    todos: [...state.todos, newTodo],
  };
}

/**
 * Update a todo item status
 * @param state Current state
 * @param id Todo ID to update
 * @param status New status
 * @returns Updated state
 */
export function updateTodo(state: PiflowState, id: string, status: TaskStatus): PiflowState {
  return {
    ...state,
    todos: state.todos.map((todo) =>
      todo.id === id
        ? {
            ...todo,
            status,
            completedAt: status === "completed" ? Date.now() : todo.completedAt,
          }
        : todo,
    ),
  };
}

/**
 * Get todos filtered by status
 * @param state Current state
 * @param statusFilter Optional status filter
 * @returns Filtered todos
 */
export function getTodos(state: PiflowState, statusFilter?: TaskStatus): TodoItem[] {
  if (!statusFilter) return state.todos;
  return state.todos.filter((todo) => todo.status === statusFilter);
}

/**
 * Check if there are incomplete todos
 * @param state Current state
 * @returns True if any todos have status other than "completed" or "cancelled"
 */
export function hasIncompleteTodos(state: PiflowState): boolean {
  return state.todos.some(
    (todo) => todo.status !== "completed" && todo.status !== "cancelled",
  );
}

/**
 * Get count of todos by status
 * @param state Current state
 * @returns Object with counts for each status
 */
export function getTodoStats(state: PiflowState): Record<TaskStatus, number> {
  const stats: Record<TaskStatus, number> = {
    pending: 0,
    in_progress: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };
  state.todos.forEach((todo) => {
    stats[todo.status]++;
  });
  return stats;
}
