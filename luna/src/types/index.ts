/**
 * TypeScript type definitions for Luna PR Review Bot
 */

/**
 * Individual review comment with location and severity
 */
export interface ReviewComment {
  path: string;
  line?: number;
  body: string;
  severity: 'critical' | 'warning' | 'suggestion' | 'info';
  category?: 'bug' | 'security' | 'performance' | 'style' | 'architecture' | 'testing';
}

/**
 * Summary of review findings and statistics
 */
export interface ReviewSummary {
  title: string;
  body: string;
  criticalIssues: number;
  warnings: number;
  suggestions: number;
}

/**
 * Overall review result with verdict
 */
export interface ReviewResult {
  summary: ReviewSummary;
  comments: ReviewComment[];
  verdict: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
}

/**
 * GitHub Pull Request context and metadata
 */
export interface PRContext {
  owner: string;
  repo: string;
  number: number;
  headSha: string;
  baseSha: string;
  diff: string;
  isFork: boolean;
  cloneUrl: string;
}

/**
 * Luna configuration options
 */
export interface LunaConfig {
  appId: string;
  privateKeyPath: string;
  webhookSecret: string;
  webhookProxyUrl?: string;
  ignorePatterns: string[];
  largePRThreshold: number;
  allowedUser?: string;
}

/**
 * OpenCode agent types
 */
export type AgentType = 
  | 'sisyphus'
  | 'hephaestus'
  | 'prometheus'
  | 'atlas';

/**
 * Agent configuration for PRs
 */
export interface AgentConfig {
  defaultAgent: AgentType;
  prAgents: Map<string, AgentType>;
}

/**
 * Incremental review state tracking
 */
export interface ReviewState {
  lastReviewedSha?: string;
}
