import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { chainAgents } from "./agents.js";
import type { AgentResult } from "./types.js";
import { Type } from "@sinclair/typebox";

/**
 * Workflow step definition
 * Each step runs an agent with a task template
 * Use {previous} to reference the output from the previous step
 */
export interface WorkflowStep {
  agent: string;
  taskTemplate: string;
}

/**
 * Workflow definition
 * A workflow is a named sequence of agent steps
 * Steps execute in order with output chaining via {previous}
 */
export interface WorkflowDefinition {
  name: string;
  description: string;
  steps: WorkflowStep[];
}

/**
 * Built-in workflows for common piflow patterns
 */
export const BUILTIN_WORKFLOWS: Record<string, WorkflowDefinition> = {
  "scout-and-plan": {
    name: "scout-and-plan",
    description: "Scout the problem space, then create a detailed plan",
    steps: [
      {
        agent: "explore",
        taskTemplate: "Scout and understand: {previous}",
      },
      {
        agent: "prometheus",
        taskTemplate:
          "Based on this exploration: {previous}\n\nCreate a detailed implementation plan.",
      },
    ],
  },

  "implement-and-review": {
    name: "implement-and-review",
    description: "Implement changes, then review for quality and correctness",
    steps: [
      {
        agent: "sisyphus-junior",
        taskTemplate: "Implement: {previous}",
      },
      {
        agent: "momus",
        taskTemplate:
          "Review this implementation for quality, safety, and correctness: {previous}",
      },
    ],
  },

  "plan-review-execute": {
    name: "plan-review-execute",
    description: "Plan a solution, review it, then prepare execution steps",
    steps: [
      {
        agent: "prometheus",
        taskTemplate: "Create a detailed plan for: {previous}",
      },
      {
        agent: "metis",
        taskTemplate:
          "Based on this plan, prepare concrete execution steps: {previous}",
      },
      {
        agent: "sisyphus-junior",
        taskTemplate:
          "Execute these steps: {previous}",
      },
    ],
  },
};

/**
 * Load custom workflows from config
 * Returns map of workflow name -> definition
 * Used internally by executeWorkflow
 */
export function loadCustomWorkflows(
  config?: Record<string, WorkflowDefinition>,
): Record<string, WorkflowDefinition> {
  if (!config) return {};
  return config;
}

/**
 * Execute a workflow by name
 * Chains agents sequentially using {previous} placeholder semantics
 * Returns the final agent result from the last step
 *
 * @param pi ExtensionAPI instance
 * @param workflowName Name of workflow to execute (built-in or custom)
 * @param initialTask Initial task description for the first step
 * @param customWorkflows Optional custom workflows from config
 * @returns AgentResult from the final step in the workflow
 * @throws Error if workflow not found
 */
export async function executeWorkflow(
  pi: ExtensionAPI,
  workflowName: string,
  initialTask: string,
  customWorkflows?: Record<string, WorkflowDefinition>,
): Promise<AgentResult> {
  // Try custom workflows first, then fall back to built-in
  const allWorkflows = {
    ...BUILTIN_WORKFLOWS,
    ...loadCustomWorkflows(customWorkflows),
  };

  const workflow = allWorkflows[workflowName];
  if (!workflow) {
    throw new Error(
      `Workflow "${workflowName}" not found. Available: ${Object.keys(allWorkflows).join(", ")}`,
    );
  }

  if (workflow.steps.length === 0) {
    throw new Error(`Workflow "${workflowName}" has no steps`);
  }

  // Convert workflow steps to chain format expected by chainAgents
  const chain = workflow.steps.map((step) => ({
    agent: step.agent,
    taskTemplate: step.taskTemplate,
  }));

  // Prepend initial task to first step's template
  chain[0].taskTemplate = chain[0].taskTemplate.replace(
    /{previous}/g,
    initialTask,
  );

  // Execute the chain
  return chainAgents(pi, chain);
}

/**
 * Register workflow tool with LLM
 * Exposes piflow_run_workflow for executing built-in/custom workflows
 */
export function registerWorkflowTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "piflow_run_workflow",
    label: "Run Workflow",
    description: "Execute a pre-defined workflow (scout-and-plan, implement-and-review, plan-review-execute)",
    parameters: Type.Object({
      workflowName: Type.String({
        description: "Name of workflow: scout-and-plan, implement-and-review, plan-review-execute",
      }),
      initialTask: Type.String({
        description: "Initial task description for the first agent in workflow",
      }),
    }),
    execute: async ({ workflowName, initialTask }) => {
      try {
        const result = await executeWorkflow(pi, workflowName, initialTask);
        return `Workflow "${workflowName}" completed:\n\nFinal Agent: ${result.agentName}\nExit Code: ${result.exitCode}\nDuration: ${result.duration}ms\n\nOutput:\n${result.output}`;
      } catch (error: any) {
        return `Workflow execution failed: ${error.message}`;
      }
    },
  });
}
