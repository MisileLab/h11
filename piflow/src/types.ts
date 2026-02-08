export interface BigCommitThresholds {
  locChanged: number;
  filesChanged: number;
}

export interface ContextManagerConfig {
  maxFiles: number;
  maxChars: number;
  priorities: string[];
}

export interface FlowEnforcerConfig {
  approvalToken: string;
  bigCommitThresholds: BigCommitThresholds;
  contextManager: ContextManagerConfig;
  commitStyle: "conventional";
}

export interface ContextFile {
  path: string;
  content: string;
  chars: number;
}

export type FlowPhase = "planning" | "awaiting-approval" | "executing" | "blocked";

export interface CheckpointDefinition {
  id: string;
  name: string;
  proof?: string;
  commit?: string;
  completed?: boolean;
}

export interface ParsedPlan {
  raw: string;
  goal: string;
  context: string[];
  plan: string[];
  assumptions: string[];
  questions: string[];
  checkpoints: CheckpointDefinition[];
}

export interface AmbiguityIssue {
  code:
    | "missing-acceptance-criteria"
    | "missing-proof"
    | "unknown-run-command"
    | "multiple-approaches"
    | "risky-area-without-step"
    | "invalid-plan-schema";
  message: string;
  choices?: string[];
}

export interface BlockingQuestion {
  id: string;
  prompt: string;
  blocking: true;
  choices?: string[];
}

export interface StructuredAnswer {
  questionId: string;
  blocking: true;
  answer: string;
  choiceIndex?: number;
}

export type StructuredAnswers = Record<string, StructuredAnswer>;

export interface SessionState {
  startedAt: number;
  approved: boolean;
  phase: FlowPhase;
  lastUserPrompt?: string;
  contextCache?: {
    summary: string;
    files: ContextFile[];
    totalChars: number;
  };
  planMarkdown?: string;
  parsedPlan?: ParsedPlan;
  latestAnswers?: StructuredAnswers;
}
