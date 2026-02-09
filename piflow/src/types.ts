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
  activeKeywordMode?: KeywordMode;
  lastSavedAt?: number;
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

export type TaskStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled";

export interface TodoItem {
  id: string;
  content: string;
  status: TaskStatus;
  priority: "low" | "medium" | "high";
  createdAt: number;
  completedAt?: number;
}

export interface AgentDefinition {
  name: string;
  description: string;
  tools: string[];
  model: string;
  systemPrompt?: string;
}

export interface AgentResult {
  agentName: string;
  output: string;
  exitCode: number;
  taskId?: string;
  duration: number;
  tokensUsed?: number;
}

export interface PlanningTriadState {
  prometheusResult?: string;
  metisGaps?: string[];
  momusVerdict?: {
    approved: boolean;
    issues?: string[];
  };
  currentStage?: "prometheus" | "metis" | "momus";
  iterationCount: number;
}

export interface CommentCheckResult {
  file: string;
  line: number;
  pattern: string;
  severity: "info" | "warning" | "error";
  message: string;
}

export interface ContextUsageSnapshot {
  tokens: number;
  percentage: number;
  threshold: number;
  timestamp: number;
}

export type KeywordMode = "ultrawork" | "deep" | "normal";

export interface PiflowState {
  sessionId: string;
  startedAt: number;
  phase: FlowPhase;
  approved: boolean;
  todos: TodoItem[];
  activeTasks: Map<string, AgentResult>;
  planningTriad?: PlanningTriadState;
  contextSnapshot?: ContextUsageSnapshot;
  activeKeywordMode?: KeywordMode;
  ralphLoopIterations: number;
  lastSavedAt: number;
}

export interface AgentConfig {
  enabled: boolean;
  maxConcurrent?: number;
  models?: Record<string, string>;
  timeout?: number;
}

export interface HooksConfig {
  onPlanCreated?: string;
  onTodoUpdated?: string;
  onContextWarning?: string;
  onToolError?: string;
  onModeSwitch?: string;
}

export interface ToolsConfig {
  disabled?: string[];
  lsp?: {
    enabled?: boolean;
  };
  astGrep?: {
    enabled?: boolean;
    dryRunDefault?: boolean;
  };
  tmux?: {
    enabled?: boolean;
  };
}

export interface CommandsConfig {
  disabled?: string[];
  aliases?: Record<string, string>;
}

export interface ThresholdsConfig {
  contextPercentage?: number;
  commentCheckEnabled?: boolean;
  maxCommentIssues?: number;
}

export interface ModesConfig {
  ultrawork?: boolean;
  deep?: boolean;
  ralphLoop?: {
    enabled?: boolean;
    maxIterations?: number;
    cooldownMs?: number;
  };
}

export interface TodoConfig {
  enforceCompletion?: boolean;
  blockOnIncomplete?: boolean;
  showBoulderContext?: boolean;
  maxDisplayItems?: number;
}

export interface ExtendedFlowEnforcerConfig extends FlowEnforcerConfig {
  agents?: AgentConfig;
  hooks?: HooksConfig;
  tools?: ToolsConfig;
  commands?: CommandsConfig;
  thresholds?: ThresholdsConfig;
  modes?: ModesConfig;
  todo?: TodoConfig;
}
