export interface User {
  username: string;
  is_authenticated: boolean;
}

export interface SetupStatus {
  is_setup: boolean;
}

export interface ConfigStatus {
  opencode: boolean;
  auth: boolean;
  ohmy: boolean;
}

export interface GithubStatus {
  has_key: boolean;
  public_key: string | null;
}

export interface Workspace {
  id: number;
  name: string;
  repo_url: string | null;
  created_at: string;
  status: string;
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

export interface TestConfig {
  command: string;
}

export interface TestRunResult {
  output: string;
  exit_code: number;
}

export interface PrReviewResult {
  summary_posted: boolean;
  comments_posted: number;
  errors: string[];
}

export interface Artifact {
  name: string;
  path: string;
  size: number;
  created_at: string;
}
