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

export interface SessionState {
  startedAt: number;
  approved: boolean;
}
