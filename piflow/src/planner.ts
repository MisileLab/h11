import path from "node:path";
import type { AmbiguityIssue, BlockingQuestion, ContextFile, ParsedPlan } from "./types.js";

const SUCCESS_HINT_RE = /(acceptance|success|definition of done|expected result|done when)/i;
const COMMAND_HINT_RE = /(test|build|lint|typecheck|check)\s*[:=]|`[^`]+`/i;
const MULTI_APPROACH_RE = /(option\s+[ab]|either|approach\s+[ab]|\bor\b)/i;
const RISKY_KEYWORDS = ["auth", "authentication", "ci", "dependency", "dependencies", "public api", "api"]; // conservative

function getHeadingSlice(markdown: string, heading: string, nextHeadings: string[]): string {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startRe = new RegExp(`^${escapedHeading}\\s*$`, "m");
  const startMatch = markdown.match(startRe);
  if (!startMatch || startMatch.index === undefined) return "";

  const start = startMatch.index + startMatch[0].length;
  const after = markdown.slice(start);

  let endOffset = after.length;
  for (const nextHeading of nextHeadings) {
    const escapedNext = nextHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nextRe = new RegExp(`^${escapedNext}\\s*$`, "m");
    const nextMatch = after.match(nextRe);
    if (nextMatch?.index !== undefined && nextMatch.index < endOffset) {
      endOffset = nextMatch.index;
    }
  }

  return after.slice(0, endOffset).trim();
}

function parseChecklist(section: string, marker: string): string[] {
  const lineRe = new RegExp(`^\\s*-\\s*\\[${marker}\\d+\\]\\s*(.+)$`, "gim");
  const values: string[] = [];
  for (const match of section.matchAll(lineRe)) {
    values.push(match[1].trim());
  }
  return values;
}

function parseCheckpoints(section: string): ParsedPlan["checkpoints"] {
  const checkpoints: ParsedPlan["checkpoints"] = [];
  const lines = section.split(/\r?\n/);

  let current: ParsedPlan["checkpoints"][number] | undefined;
  for (const line of lines) {
    const cp = line.match(/^\s*-\s*\[(C\d+)\]\s*(.+)$/i);
    if (cp) {
      current = {
        id: cp[1].toUpperCase(),
        name: cp[2].trim(),
      };
      checkpoints.push(current);
      continue;
    }

    if (!current) continue;

    const proof = line.match(/^\s*-\s*Proof:\s*(.+)$/i);
    if (proof) {
      current.proof = proof[1].trim();
      continue;
    }

    const commit = line.match(/^\s*-\s*Commit:\s*(.+)$/i);
    if (commit) {
      current.commit = commit[1].trim();
    }
  }

  return checkpoints;
}

export function parsePlanMarkdown(markdown: string): ParsedPlan {
  const goal = getHeadingSlice(markdown, "# Goal", ["## Context (auto-filled)", "## Plan"]);
  const contextSection = getHeadingSlice(markdown, "## Context (auto-filled)", ["## Plan"]);
  const planSection = getHeadingSlice(markdown, "## Plan", ["## Assumptions"]);
  const assumptionsSection = getHeadingSlice(markdown, "## Assumptions", ["## Questions (blocking)"]);
  const questionsSection = getHeadingSlice(markdown, "## Questions (blocking)", ["## Checkpoints"]);
  const checkpointsSection = getHeadingSlice(markdown, "## Checkpoints", []);

  return {
    raw: markdown,
    goal: goal.trim(),
    context: contextSection
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*-\s*/, "").trim())
      .filter(Boolean),
    plan: parseChecklist(planSection, "P"),
    assumptions: parseChecklist(assumptionsSection, "A"),
    questions: parseChecklist(questionsSection, "Q"),
    checkpoints: parseCheckpoints(checkpointsSection),
  };
}

export function inferKnownCommands(files: ContextFile[]): string[] {
  const commands = new Set<string>();

  for (const file of files) {
    const base = path.basename(file.path).toLowerCase();

    if (base === "package.json") {
      try {
        const parsed = JSON.parse(file.content) as { scripts?: Record<string, string> };
        for (const [name, command] of Object.entries(parsed.scripts ?? {})) {
          if (["test", "build", "lint", "typecheck", "check"].includes(name)) {
            commands.add(`${name}: ${command}`);
          }
        }
      } catch {
        // ignore malformed package.json
      }
    }

    if (base === "makefile") {
      const matches = file.content.match(/^(test|build|lint|check):/gim) ?? [];
      for (const match of matches) commands.add(match.replace(":", ""));
    }

    if (base === "pyproject.toml") {
      if (file.content.includes("[tool.pytest")) commands.add("pytest");
      if (file.content.includes("[tool.ruff")) commands.add("ruff check");
    }
  }

  return Array.from(commands);
}

function hasRiskCoverage(plan: ParsedPlan, keyword: string): boolean {
  const full = [...plan.plan, ...plan.checkpoints.map((c) => c.name)].join("\n").toLowerCase();
  return full.includes(keyword.toLowerCase());
}

export function detectAmbiguity(
  plan: ParsedPlan,
  userPrompt: string,
  knownCommands: string[],
): AmbiguityIssue[] {
  const issues: AmbiguityIssue[] = [];

  const hasRequiredSchema =
    Boolean(plan.goal) && plan.plan.length > 0 && plan.assumptions.length > 0 && plan.checkpoints.length > 0;
  if (!hasRequiredSchema) {
    issues.push({
      code: "invalid-plan-schema",
      message: "Plan schema is incomplete or malformed.",
    });
    return issues;
  }

  if (!SUCCESS_HINT_RE.test(plan.raw)) {
    issues.push({
      code: "missing-acceptance-criteria",
      message: "Missing success definition or acceptance criteria.",
      choices: ["Add explicit acceptance criteria", "Use checkpoint proof as success criteria"],
    });
  }

  const missingProof = plan.checkpoints.some((cp) => !cp.proof || /^(none|tbd|todo|n\/a)$/i.test(cp.proof));
  if (missingProof) {
    issues.push({
      code: "missing-proof",
      message: "One or more checkpoints are missing proof definitions.",
      choices: ["Repo command proof", "Manual verification checklist proof"],
    });
  }

  if (knownCommands.length === 0 && !COMMAND_HINT_RE.test(plan.raw)) {
    issues.push({
      code: "unknown-run-command",
      message: "Run/build/test command is unknown.",
      choices: ["I will provide command(s)", "Use manual verification instead"],
    });
  }

  if (MULTI_APPROACH_RE.test(plan.raw)) {
    issues.push({
      code: "multiple-approaches",
      message: "Multiple plausible approaches detected.",
      choices: ["Pick simpler approach", "Pick lower-risk approach", "Pick faster approach"],
    });
  }

  const riskyMentioned = RISKY_KEYWORDS.filter((k) => userPrompt.toLowerCase().includes(k) || plan.raw.toLowerCase().includes(k));
  for (const keyword of riskyMentioned) {
    if (!hasRiskCoverage(plan, keyword)) {
      issues.push({
        code: "risky-area-without-step",
        message: `Risky area touched without explicit step: ${keyword}`,
        choices: ["Add dedicated mitigation step", "Reduce scope to avoid risky area"],
      });
      break;
    }
  }

  return issues;
}

export function issuesToBlockingQuestions(issues: AmbiguityIssue[]): BlockingQuestion[] {
  return issues
    .filter((issue) => issue.code !== "invalid-plan-schema")
    .slice(0, 5)
    .map((issue, index) => ({
      id: `Q${index + 1}`,
      prompt: issue.message,
      blocking: true,
      choices: issue.choices,
    }));
}

export function buildPlanInstruction(contextSummary: string, knownCommands: string[]): string {
  const commandHint = knownCommands.length > 0 ? knownCommands.join(" | ") : "Unknown (must ask user if needed)";

  return [
    "You are in enforced planning mode.",
    "Do not execute implementation yet.",
    "Produce only a Markdown plan with this exact schema:",
    "",
    "# Goal",
    "## Context (auto-filled)",
    "## Plan",
    "- [P1] ...",
    "- [P2] ...",
    "## Assumptions",
    "- [A1] ...",
    "## Questions (blocking)",
    "- [Q1] ...",
    "## Checkpoints",
    "- [C1] Feature/bugfix name",
    "  - Proof: ...",
    "  - Commit: ...",
    "",
    "Rules:",
    "- Ask questions ONLY when ambiguity is detected.",
    "- Keep max 5 blocking questions.",
    "- Every checkpoint must include proof.",
    "",
    `Auto-context summary:\n${contextSummary}`,
    `Known run/build/test commands: ${commandHint}`,
  ].join("\n");
}

export function formatAnswersForFollowup(answers: Record<string, { answer: string; choiceIndex?: number }>): string {
  const lines = Object.entries(answers).map(([id, answer]) => {
    const choice = answer.choiceIndex ? ` (choice ${answer.choiceIndex})` : "";
    return `- ${id}: ${answer.answer}${choice}`;
  });
  return `Blocking question answers:\n${lines.join("\n")}`;
}
