import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { AgentResult } from "./types.js";
import { Type } from "@sinclair/typebox";

/**
 * Background Task Manager
 * 
 * Manages concurrent background agent tasks using native pi.exec() with
 * AbortController-based cancellation. Enforces concurrency limits matching
 * native subagent constraints (max 8 tasks, 4 concurrent by default).
 */

export interface TaskInfo {
  id: string;
  agent: string;
  task: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  startedAt: number;
  completedAt?: number;
  result?: AgentResult;
  error?: string;
}

export class BackgroundTaskManager {
  private tasks = new Map<string, TaskInfo>();
  private abortControllers = new Map<string, AbortController>();
  private runningCount = 0;
  private readonly maxConcurrent: number;
  private readonly maxTotal: number;

  constructor(maxConcurrent = 4, maxTotal = 8) {
    this.maxConcurrent = maxConcurrent;
    this.maxTotal = maxTotal;
  }

  /**
   * Start a background agent task.
   * Returns task ID immediately. Task runs asynchronously.
   */
  startBackgroundTask(
    pi: ExtensionAPI,
    agent: string,
    task: string,
    onComplete?: (taskId: string, result: AgentResult | null, error?: string) => void,
  ): string {
    // Enforce max total tasks limit
    if (this.tasks.size >= this.maxTotal) {
      throw new Error(`Maximum task limit reached (${this.maxTotal})`);
    }

    const taskId = generateTaskId();
    const abortController = new AbortController();

    const taskInfo: TaskInfo = {
      id: taskId,
      agent,
      task,
      status: "pending",
      startedAt: Date.now(),
    };

    this.tasks.set(taskId, taskInfo);
    this.abortControllers.set(taskId, abortController);

    // Queue task for execution
    this.executeWhenSlotAvailable(pi, taskId, abortController, onComplete);

    return taskId;
  }

  /**
   * Execute task when a concurrent slot is available.
   * Respects maxConcurrent limit via runningCount tracking.
   */
  private async executeWhenSlotAvailable(
    pi: ExtensionAPI,
    taskId: string,
    abortController: AbortController,
    onComplete?: (taskId: string, result: AgentResult | null, error?: string) => void,
  ): Promise<void> {
    const taskInfo = this.tasks.get(taskId);
    if (!taskInfo) return;

    // Wait for slot
    while (this.runningCount >= this.maxConcurrent) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      // Check if cancelled while waiting
      if (abortController.signal.aborted) {
        taskInfo.status = "cancelled";
        taskInfo.completedAt = Date.now();
        this.tasks.set(taskId, taskInfo);
        this.abortControllers.delete(taskId);
        if (onComplete) onComplete(taskId, null, "Cancelled before execution");
        return;
      }
    }

    // Acquire slot
    this.runningCount++;
    taskInfo.status = "running";
    this.tasks.set(taskId, taskInfo);

    try {
      const result = await this.executeAgent(pi, taskInfo.agent, taskInfo.task, abortController.signal);
      taskInfo.status = "completed";
      taskInfo.completedAt = Date.now();
      taskInfo.result = result;
      this.tasks.set(taskId, taskInfo);
      if (onComplete) onComplete(taskId, result);
    } catch (err: any) {
      if (abortController.signal.aborted) {
        taskInfo.status = "cancelled";
      } else {
        taskInfo.status = "failed";
        taskInfo.error = err.message || String(err);
      }
      taskInfo.completedAt = Date.now();
      this.tasks.set(taskId, taskInfo);
      if (onComplete) onComplete(taskId, null, taskInfo.error);
    } finally {
      // Release slot
      this.runningCount--;
      this.abortControllers.delete(taskId);
    }
  }

  /**
   * Execute agent via native pi.exec() with JSON mode.
   * Matches native subagent pattern from validation spike.
   */
  private async executeAgent(
    pi: ExtensionAPI,
    agentName: string,
    taskString: string,
    signal: AbortSignal,
  ): Promise<AgentResult> {
    const startTime = Date.now();

    const args = [
      "--mode",
      "json",
      "-p",
      "--no-session",
      taskString,
    ];

    const result = await pi.exec("pi", args, { signal });

    const duration = Date.now() - startTime;

    return {
      agentName,
      output: result.stdout,
      exitCode: result.code ?? 0,
      taskId: undefined,
      duration,
      tokensUsed: undefined,
    };
  }

  /**
   * Get task status by ID.
   */
  getTaskStatus(taskId: string): TaskInfo["status"] | null {
    const task = this.tasks.get(taskId);
    return task ? task.status : null;
  }

  /**
   * Get task result (only available for completed tasks).
   */
  getTaskResult(taskId: string): AgentResult | null {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "completed") return null;
    return task.result ?? null;
  }

  /**
   * Get full task info.
   */
  getTaskInfo(taskId: string): TaskInfo | null {
    return this.tasks.get(taskId) ?? null;
  }

  /**
   * Cancel a running or pending task.
   */
  cancelTask(taskId: string): boolean {
    const abortController = this.abortControllers.get(taskId);
    if (!abortController) return false;

    abortController.abort();
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = "cancelled";
      task.completedAt = Date.now();
      this.tasks.set(taskId, task);
    }
    return true;
  }

  /**
   * List all active tasks (pending or running).
   */
  listActiveTasks(): TaskInfo[] {
    return Array.from(this.tasks.values()).filter((task) => task.status === "pending" || task.status === "running");
  }

  /**
   * List all tasks with optional status filter.
   */
  listTasks(statusFilter?: TaskInfo["status"]): TaskInfo[] {
    const tasks = Array.from(this.tasks.values());
    if (statusFilter) {
      return tasks.filter((task) => task.status === statusFilter);
    }
    return tasks;
  }

  /**
   * Get current stats.
   */
  getStats(): { total: number; running: number; pending: number; completed: number; failed: number; cancelled: number } {
    const tasks = Array.from(this.tasks.values());
    return {
      total: tasks.length,
      running: tasks.filter((t) => t.status === "running").length,
      pending: tasks.filter((t) => t.status === "pending").length,
      completed: tasks.filter((t) => t.status === "completed").length,
      failed: tasks.filter((t) => t.status === "failed").length,
      cancelled: tasks.filter((t) => t.status === "cancelled").length,
    };
  }

  /**
   * Cleanup completed/failed/cancelled tasks older than specified age.
   */
  cleanupOldTasks(maxAgeMs = 60000): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
        if (task.completedAt && now - task.completedAt > maxAgeMs) {
          this.tasks.delete(taskId);
          cleaned++;
        }
      }
    }
    return cleaned;
  }
}

/**
 * Generate unique task ID.
 */
function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Register LLM-callable tools for background task management.
 */
export function registerBackgroundTaskTools(
  pi: any,
  taskManager: BackgroundTaskManager,
  uiCallback?: {
    onTaskComplete?: (taskId: string, result: AgentResult | null, error?: string) => void;
    refreshFooter?: () => void;
  },
): void {
  pi.registerTool({
    name: "piflow_background_task",
    label: "Start Background Task",
    description: "Start a background agent task. Returns task ID immediately. Task runs asynchronously.",
    parameters: Type.Object({
      agent: Type.String({ description: "Agent name (e.g., 'explore', 'prometheus')" }),
      task: Type.String({ description: "Task description for the agent" }),
    }),
    execute: async ({ agent, task }: { agent: string; task: string }) => {
      try {
        const taskId = taskManager.startBackgroundTask(
          pi,
          agent,
          task,
          (id, result, error) => {
            if (uiCallback?.onTaskComplete) {
              uiCallback.onTaskComplete(id, result, error);
            }
            if (uiCallback?.refreshFooter) {
              uiCallback.refreshFooter();
            }
          },
        );
        if (uiCallback?.refreshFooter) {
          uiCallback.refreshFooter();
        }
        return `Background task started: ${taskId}\nAgent: ${agent}\nStatus: pending\n\nUse piflow_task_status to check progress.`;
      } catch (err: any) {
        return `ERROR: ${err.message}`;
      }
    },
  });

  pi.registerTool({
    name: "piflow_task_status",
    label: "Check Task Status",
    description: "Check the status of a background task by ID.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task ID returned from piflow_background_task" }),
    }),
    execute: async ({ taskId }: { taskId: string }) => {
      const info = taskManager.getTaskInfo(taskId);
      if (!info) {
        return `ERROR: Task ${taskId} not found`;
      }
      const elapsed = info.completedAt ? info.completedAt - info.startedAt : Date.now() - info.startedAt;
      return `Task: ${taskId}\nAgent: ${info.agent}\nStatus: ${info.status}\nElapsed: ${elapsed}ms\n${info.error ? `Error: ${info.error}` : ""}`;
    },
  });

  pi.registerTool({
    name: "piflow_task_result",
    label: "Get Task Result",
    description: "Get the result of a completed background task.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task ID of completed task" }),
    }),
    execute: async ({ taskId }: { taskId: string }) => {
      const result = taskManager.getTaskResult(taskId);
      if (!result) {
        const info = taskManager.getTaskInfo(taskId);
        if (!info) {
          return `ERROR: Task ${taskId} not found`;
        }
        return `ERROR: Task ${taskId} status is ${info.status}. Result only available for completed tasks.`;
      }
      return `Task: ${taskId}\nAgent: ${result.agentName}\nExit Code: ${result.exitCode}\nDuration: ${result.duration}ms\n\nOutput:\n${result.output}`;
    },
  });

  pi.registerTool({
    name: "piflow_cancel_task",
    label: "Cancel Background Task",
    description: "Cancel a running or pending background task.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task ID to cancel" }),
    }),
    execute: async ({ taskId }: { taskId: string }) => {
      const cancelled = taskManager.cancelTask(taskId);
      if (uiCallback?.refreshFooter) {
        uiCallback.refreshFooter();
      }
      return cancelled
        ? `Task ${taskId} cancelled successfully`
        : `ERROR: Task ${taskId} not found or already completed`;
    },
  });

  pi.registerTool({
    name: "piflow_list_tasks",
    label: "List Background Tasks",
    description: "List all background tasks with optional status filter.",
    parameters: Type.Object({
      status: Type.Optional(
        Type.Union([
          Type.Literal("pending"),
          Type.Literal("running"),
          Type.Literal("completed"),
          Type.Literal("failed"),
          Type.Literal("cancelled"),
        ]),
      ),
    }),
    execute: async ({ status }: { status?: TaskInfo["status"] }) => {
      const tasks = taskManager.listTasks(status);
      if (tasks.length === 0) {
        return status ? `No ${status} tasks found` : "No background tasks";
      }
      return (
        tasks
          .map((t) => {
            const elapsed = t.completedAt ? t.completedAt - t.startedAt : Date.now() - t.startedAt;
            return `[${t.id}] ${t.agent}: ${t.status} (${elapsed}ms)`;
          })
          .join("\n") + `\n\nTotal: ${tasks.length}`
      );
    },
  });
}
