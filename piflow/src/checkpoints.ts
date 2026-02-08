import type { CheckpointDefinition, ParsedPlan } from "./types.js";

const CHECKPOINT_COMPLETE_RE = /\[CHECKPOINT:(C\d+)\s+COMPLETE\]/gi;

export interface ProofEvidence {
  commandProofs: string[];
  manualChecklistSteps: string[];
}

function isProofLikeCommand(command: string): boolean {
  return /(test|build|lint|typecheck|check|astro\s+check|pytest|cargo\s+test|go\s+test|npm\s+test|yarn\s+test)/i.test(
    command,
  );
}

export function registerCommandProof(command: string, success: boolean, proofs: string[]): string[] {
  if (!success) return proofs;
  if (!isProofLikeCommand(command)) return proofs;
  if (proofs.includes(command)) return proofs;
  return [...proofs, command];
}

export function extractManualChecklist(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const checklist = lines
    .map((line) => line.trim())
    .filter((line) => /^(-|\d+[.)])\s+/.test(line) && /expected\s*[:=-]/i.test(line));
  return checklist;
}

export function extractCompletedCheckpointIds(text: string): string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(CHECKPOINT_COMPLETE_RE)) {
    const id = match[1].toUpperCase();
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function getCheckpoint(plan: ParsedPlan, checkpointId: string): CheckpointDefinition | undefined {
  return plan.checkpoints.find((cp) => cp.id.toUpperCase() === checkpointId.toUpperCase());
}

export function markCheckpointCompleted(plan: ParsedPlan, checkpointId: string): ParsedPlan {
  const checkpoints = plan.checkpoints.map((cp) =>
    cp.id.toUpperCase() === checkpointId.toUpperCase() ? { ...cp, completed: true } : cp,
  );
  return { ...plan, checkpoints };
}

export function hasProofForCompletion(evidence: ProofEvidence): boolean {
  if (evidence.commandProofs.length > 0) return true;
  return evidence.manualChecklistSteps.length >= 2;
}

export function nextOpenCheckpoint(plan: ParsedPlan): CheckpointDefinition | undefined {
  return plan.checkpoints.find((cp) => !cp.completed);
}
