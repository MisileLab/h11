import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { PiflowState, TaskStatus, TodoItem } from "./types.js";
import { loadState, saveState, updateState } from "./state-manager.js";
import type { SessionContext } from "./state-manager.js";

/**
 * TodoManager — Manages todo items with state persistence
 */
export class TodoManager {
  constructor(
    private pi: ExtensionAPI,
    private ctx: SessionContext,
  ) {}

  /**
   * Add a new todo item
   */
  addTodo(id: string, content: string, priority: "low" | "medium" | "high" = "medium"): TodoItem {
    const newTodo: TodoItem = {
      id,
      content,
      status: "pending",
      priority,
      createdAt: Date.now(),
    };

    updateState(this.pi, this.ctx, (state) => ({
      ...state,
      todos: [...state.todos, newTodo],
    }));

    return newTodo;
  }

  /**
   * Update todo item status
   */
  updateTodo(id: string, status: TaskStatus): TodoItem | null {
    let updated: TodoItem | null = null;

    updateState(this.pi, this.ctx, (state) => {
      const todo = state.todos.find((t) => t.id === id);
      if (!todo) return state;

      updated = {
        ...todo,
        status,
        completedAt: status === "completed" ? Date.now() : todo.completedAt,
      };

      return {
        ...state,
        todos: state.todos.map((t) => (t.id === id ? updated! : t)),
      };
    });

    return updated;
  }

  /**
   * Get todos with optional status filter
   */
  getTodos(statusFilter?: TaskStatus): TodoItem[] {
    const state = loadState(this.ctx);
    if (!state) return [];

    if (!statusFilter) return state.todos;
    return state.todos.filter((todo) => todo.status === statusFilter);
  }

  /**
   * Check if there are incomplete todos
   */
  hasIncompleteTodos(): boolean {
    const state = loadState(this.ctx);
    if (!state) return false;

    return state.todos.some(
      (todo) => todo.status !== "completed" && todo.status !== "cancelled",
    );
  }

  /**
   * Get todo statistics
   */
  getTodoStats(): Record<TaskStatus, number> {
    const state = loadState(this.ctx);
    const stats: Record<TaskStatus, number> = {
      pending: 0,
      in_progress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    if (!state) return stats;

    state.todos.forEach((todo) => {
      stats[todo.status]++;
    });

    return stats;
  }
}

/**
 * Bouldering Mode State
 */
interface BoulderingState {
  active: boolean;
  planName?: string;
  planPath?: string;
  startedAt?: number;
}

let boulderingState: BoulderingState = {
  active: false,
};

/**
 * Activate bouldering mode with a specific plan
 */
export function activateBouldering(planName: string, planPath?: string): void {
  boulderingState = {
    active: true,
    planName,
    planPath,
    startedAt: Date.now(),
  };
}

/**
 * Deactivate bouldering mode
 */
export function deactivateBouldering(): void {
  boulderingState = { active: false };
}

/**
 * Check if bouldering mode is active
 */
export function isBoulderingActive(): boolean {
  return boulderingState.active;
}

/**
 * Get current boulder context message for injection
 */
export function getBoulderContext(todoManager: TodoManager): string | null {
  if (!boulderingState.active) return null;

  const incompleteTodos = todoManager.getTodos().filter(
    (todo) => todo.status !== "completed" && todo.status !== "cancelled",
  );

  if (incompleteTodos.length === 0) return null;

  const planInfo = boulderingState.planName
    ? `You are working on boulder: ${boulderingState.planName}`
    : "You are in bouldering mode";

  const todoList = incompleteTodos
    .slice(0, 10) // Show max 10 todos
    .map((todo, idx) => `  ${idx + 1}. [${todo.status}] ${todo.content}`)
    .join("\n");

  const totalCount = incompleteTodos.length;
  const stats = todoManager.getTodoStats();

  return [
    planInfo,
    `Remaining tasks (${totalCount} total):`,
    todoList,
    totalCount > 10 ? `  ... and ${totalCount - 10} more` : "",
    "",
    `Progress: ${stats.completed} completed, ${stats.in_progress} in progress, ${stats.pending} pending`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Register todo enforcement event handlers
 */
export function registerTodoEnforcement(
  pi: ExtensionAPI,
  ctx: SessionContext,
  todoManager: TodoManager,
): void {
  // Inject boulder context before agent starts
  pi.on("before_agent_start", async () => {
    if (!boulderingState.active) return;

    const context = getBoulderContext(todoManager);
    if (!context) return;

    return {
      message: {
        customType: "piflow-boulder",
        content: context,
        display: false,
      },
    };
  });

  // Warn on session switch if incomplete todos exist
  pi.on("session_before_switch", async (_event, switchCtx) => {
    if (!todoManager.hasIncompleteTodos()) return;

    if (switchCtx.hasUI) {
      const incompleteTodos = todoManager.getTodos().filter(
        (todo) => todo.status !== "completed" && todo.status !== "cancelled",
      );

      const proceed = await switchCtx.ui.confirm(
        "Incomplete todos",
        `You have ${incompleteTodos.length} incomplete todo(s). Switch anyway?`,
      );

      if (!proceed) {
        return { cancel: true };
      }
    }
  });

  // Save todo state on shutdown
  pi.on("session_shutdown", async () => {
    const state = loadState(ctx);
    if (state) {
      saveState(pi, state);
    }
  });

  // Check for progress on agent_end
  pi.on("agent_end", async (event) => {
    if (!boulderingState.active) return;
    if (!todoManager.hasIncompleteTodos()) return;

    // Check if any todos were updated in this turn
    // This is a simple heuristic - in production, track todo updates per turn
    const messages = event.messages as any[];
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage || lastMessage.role !== "assistant") return;

    // If bouldering is active and we have incomplete todos, but the assistant
    // message doesn't mention todos or progress, send a reminder
    // This is a passive reminder, not blocking
    const content = JSON.stringify(lastMessage.content || "").toLowerCase();
    const mentionsTodo =
      content.includes("todo") ||
      content.includes("task") ||
      content.includes("checkpoint") ||
      content.includes("complete");

    if (!mentionsTodo && Math.random() < 0.3) {
      // 30% chance to remind (avoid spam)
      pi.sendMessage(
        {
          customType: "piflow-boulder-reminder",
          content: "Remember to update todo status as you make progress.",
          display: false,
        },
        { triggerTurn: false },
      );
    }
  });
}

/**
 * Format todos for display
 */
export function formatTodoList(todos: TodoItem[]): string {
  if (todos.length === 0) return "No todos found.";

  const statusIcon = (status: TaskStatus): string => {
    switch (status) {
      case "pending":
        return "⏳";
      case "in_progress":
        return "🚧";
      case "completed":
        return "✅";
      case "failed":
        return "❌";
      case "cancelled":
        return "🚫";
      default:
        return "❓";
    }
  };

  const priorityLabel = (priority: string): string => {
    switch (priority) {
      case "high":
        return "🔴";
      case "medium":
        return "🟡";
      case "low":
        return "🟢";
      default:
        return "⚪";
    }
  };

  return todos
    .map(
      (todo) =>
        `${statusIcon(todo.status)} ${priorityLabel(todo.priority)} ${todo.id}: ${todo.content}`,
    )
    .join("\n");
}
