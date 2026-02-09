import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { chainAgents } from "./agents.js";
import type { PlanningTriadState } from "./types.js";
import { parsePlanMarkdown } from "./planner.js";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Planning triad result
 * Contains the final plan and metadata about the triad execution
 */
export interface PlanningTriadResult {
  success: boolean;
  planPath?: string;
  planContent?: string;
  iterationCount: number;
  momusVerdict?: { approved: boolean; issues?: string[] };
  error?: string;
}

/**
 * Execute the full planning triad workflow:
 * 1. Prometheus generates plan in .sisyphus/plans/*.md
 * 2. Metis reviews for gaps and missing guardrails
 * 3. If gaps found, prometheus revises (max 3 iterations)
 * 4. Optionally: Momus quality gate (if high-accuracy mode)
 * 5. Return final plan result
 *
 * State tracked in PlanningTriadState (via state manager by caller)
 */
export async function executePlanningTriad(
  pi: ExtensionAPI,
  ctx: any,
  task: string,
  options?: {
    highAccuracy?: boolean;
    maxIterations?: number;
    existingPlanPath?: string;
  },
): Promise<PlanningTriadResult> {
  const maxIterations = options?.maxIterations || 3;
  const highAccuracy = options?.highAccuracy ?? isHighAccuracyMode(ctx);
  let iterationCount = 0;
  let planPath: string | undefined = options?.existingPlanPath;
  let planContent: string | undefined;

  // Phase 1: Prometheus generates initial plan
  try {
    const prometheusTask = options?.existingPlanPath
      ? `Review and revise the existing plan at ${options.existingPlanPath}.\n\nOriginal task: ${task}`
      : `Create a detailed implementation plan for: ${task}.\n\nGenerate plan in .sisyphus/plans/ following the standard plan schema.`;

    const prometheusResult = await chainAgents(pi, [
      {
        agent: "prometheus",
        taskTemplate: prometheusTask,
      },
    ]);

    if (prometheusResult.exitCode !== 0) {
      return {
        success: false,
        iterationCount: 0,
        error: `Prometheus failed: ${prometheusResult.output}`,
      };
    }

    // Extract plan path from prometheus output
    planPath = extractPlanPath(prometheusResult.output, options?.existingPlanPath);
    if (!planPath || !existsSync(planPath)) {
      return {
        success: false,
        iterationCount: 0,
        error: `Prometheus did not produce plan file. Output: ${prometheusResult.output.slice(0, 500)}`,
      };
    }

    planContent = readFileSync(planPath, "utf-8");
  } catch (error) {
    return {
      success: false,
      iterationCount: 0,
      error: `Prometheus execution error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // Phase 2: Metis review loop (max iterations)
  let metisGaps: string[] = [];

  while (iterationCount < maxIterations) {
    iterationCount++;

    try {
      const metisTask = `Review this plan for gaps, missing guardrails, scope creep risks, and ambiguities.\n\nPlan file: ${planPath}\n\nProvide specific feedback on what needs improvement. If the plan is solid, respond with "PLAN_READY".`;

      const metisResult = await chainAgents(pi, [
        {
          agent: "metis",
          taskTemplate: metisTask,
        },
      ]);

      if (metisResult.exitCode !== 0) {
        return {
          success: false,
          iterationCount,
          error: `Metis review failed: ${metisResult.output}`,
        };
      }

      // Check if metis approved
      if (metisResult.output.includes("PLAN_READY")) {
        metisGaps = [];
        break; // Plan approved by metis
      }

      // Extract gaps from metis output
      metisGaps = extractGapsFromMetisOutput(metisResult.output);

      if (metisGaps.length === 0) {
        // No specific gaps identified but not explicitly approved
        break;
      }

      // Phase 3: Prometheus revision based on metis feedback
      const revisionTask = `Revise the plan at ${planPath} to address the following gaps identified by Metis:\n\n${metisGaps.map((g, i) => `${i + 1}. ${g}`).join("\n")}\n\nUpdate the plan file with the revisions.`;

      const revisionResult = await chainAgents(pi, [
        {
          agent: "prometheus",
          taskTemplate: revisionTask,
        },
      ]);

      if (revisionResult.exitCode !== 0) {
        return {
          success: false,
          iterationCount,
          error: `Prometheus revision failed: ${revisionResult.output}`,
        };
      }

      // Re-read plan after revision
      if (planPath && existsSync(planPath)) {
        planContent = readFileSync(planPath, "utf-8");
      }
    } catch (error) {
      return {
        success: false,
        iterationCount,
        error: `Metis review loop error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // Phase 4: Optional Momus quality gate (high-accuracy mode)
  let momusVerdict: PlanningTriadResult["momusVerdict"];

  if (highAccuracy && planPath) {
    try {
      const momusTask = `Perform rigorous verification of this plan. Check for:\n- File references that don't exist\n- Missing acceptance criteria\n- Ambiguous success definitions\n- Unvalidated assumptions\n\nPlan file: ${planPath}\n\nRespond with "OKAY" if the plan passes all checks, or list specific issues that must be fixed.`;

      const momusResult = await chainAgents(pi, [
        {
          agent: "momus",
          taskTemplate: momusTask,
        },
      ]);

      if (momusResult.exitCode !== 0) {
        return {
          success: false,
          iterationCount,
          error: `Momus verification failed: ${momusResult.output}`,
        };
      }

      const approved = momusResult.output.trim().toUpperCase() === "OKAY";
      const issues = approved ? undefined : extractIssuesFromMomusOutput(momusResult.output);

      momusVerdict = { approved, issues };

      if (!approved) {
        return {
          success: false,
          planPath,
          planContent,
          iterationCount,
          momusVerdict,
          error: `Momus rejected plan. Issues: ${issues?.join("; ")}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        iterationCount,
        error: `Momus verification error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // Success: plan produced and approved
  return {
    success: true,
    planPath,
    planContent,
    iterationCount,
    momusVerdict,
  };
}

/**
 * Check if high-accuracy mode is enabled
 * Checks config (if available in ctx) or defaults to false
 */
function isHighAccuracyMode(ctx: any): boolean {
  // TODO: Check config via state manager when config is available in ctx
  // For now, default to false (metis-only mode)
  return false;
}

/**
 * Extract plan file path from prometheus agent output
 * Looks for patterns like:
 * - Created plan: .sisyphus/plans/foo.md
 * - Plan file: /absolute/path/to/plan.md
 * - Written to: plans/bar.md
 */
function extractPlanPath(output: string, existingPath?: string): string | undefined {
  if (existingPath && existsSync(existingPath)) {
    // If existing path provided and still exists, return it
    return existingPath;
  }

  // Try to extract from output
  const patterns = [
    /(?:created|wrote|written|saved|plan file:)\s+(.+\.md)/i,
    /\.sisyphus\/plans\/[^\s]+\.md/,
    /plans\/[^\s]+\.md/,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      let path = match[1] || match[0];
      path = path.trim();

      // Make absolute if relative
      if (!path.startsWith("/")) {
        path = join(process.cwd(), path);
      }

      if (existsSync(path)) {
        return path;
      }
    }
  }

  // Fallback: scan .sisyphus/plans/ for most recent .md file
  const plansDir = join(process.cwd(), ".sisyphus", "plans");
  if (existsSync(plansDir)) {
    const files = readdirSync(plansDir)
      .filter((f: string) => f.endsWith(".md"))
      .map((f: string) => join(plansDir, f))
      .filter((f: string) => existsSync(f))
      .sort((a: string, b: string) => statSync(b).mtimeMs - statSync(a).mtimeMs);

    if (files.length > 0) {
      return files[0]; // Most recent plan
    }
  }

  return undefined;
}

/**
 * Extract gap items from metis review output
 * Looks for numbered lists, bullet points, or paragraph-separated issues
 */
function extractGapsFromMetisOutput(output: string): string[] {
  const gaps: string[] = [];

  // Try numbered list pattern: 1. Gap, 2. Gap
  const numberedMatches = output.match(/^\d+\.\s+(.+)$/gm);
  if (numberedMatches && numberedMatches.length > 0) {
    return numberedMatches.map((m) => m.replace(/^\d+\.\s+/, "").trim());
  }

  // Try bullet list pattern: - Gap, * Gap
  const bulletMatches = output.match(/^[-*]\s+(.+)$/gm);
  if (bulletMatches && bulletMatches.length > 0) {
    return bulletMatches.map((m) => m.replace(/^[-*]\s+/, "").trim());
  }

  // Fallback: split by double newlines and take non-empty chunks
  const chunks = output
    .split(/\n\n+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0 && c.length < 500); // Ignore very long chunks

  return chunks.length > 0 ? chunks.slice(0, 10) : [output.slice(0, 500)]; // Max 10 gaps
}

/**
 * Extract specific issues from momus rejection output
 * Looks for structured issue lists or key phrases
 */
function extractIssuesFromMomusOutput(output: string): string[] {
  const issues: string[] = [];

  // Try to extract structured issues (numbered or bulleted)
  const numberedMatches = output.match(/^\d+\.\s+(.+)$/gm);
  if (numberedMatches && numberedMatches.length > 0) {
    return numberedMatches.map((m) => m.replace(/^\d+\.\s+/, "").trim());
  }

  const bulletMatches = output.match(/^[-*]\s+(.+)$/gm);
  if (bulletMatches && bulletMatches.length > 0) {
    return bulletMatches.map((m) => m.replace(/^[-*]\s+/, "").trim());
  }

  // Fallback: return full output as single issue
  return [output.slice(0, 500)];
}

/**
 * Get triad status for UI display
 * Returns current stage and iteration count
 */
export function getTriadStatus(state?: PlanningTriadState): string {
  if (!state) return "idle";

  const stage = state.currentStage || "idle";
  const iteration = state.iterationCount || 0;

  return `${stage} (iteration ${iteration})`;
}
