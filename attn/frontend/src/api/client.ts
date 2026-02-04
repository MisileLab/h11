import { 
  User, 
  SetupStatus, 
  ConfigStatus, 
  GithubStatus, 
  Workspace, 
  FileNode,
  TestConfig,
  TestRunResult,
  PrReviewResult,
  Artifact
} from './types';

const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    credentials: 'include',
  });
  if (!res.ok) {
    if (res.status === 401 && !url.includes('/auth/login')) {
      window.location.href = '/login';
    }
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      throw new Error(json.detail || res.statusText);
    } catch {
      throw new Error(text || res.statusText);
    }
  }
  return res.json();
}

export const api = {
  // Auth & Setup
  getSetupStatus: () => fetchJson<SetupStatus>('/setup/status'),
  setup: (data: any) => fetchJson<User>('/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  login: (data: any) => fetchJson<User>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  logout: () => fetchJson<{message: string}>('/auth/logout', { method: 'POST' }),
  getMe: () => fetchJson<User>('/auth/me'),
  changePassword: (data: {current_password: string; new_password: string}) => fetchJson<{message: string}>('/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),

  // Config
  getConfigStatus: () => fetchJson<ConfigStatus>('/config/status'),
  uploadConfig: (type: 'opencode' | 'auth' | 'ohmy', file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return fetchJson<{message: string; filename: string}>(`/config/${type}`, {
      method: 'POST',
      body: formData,
    });
  },

  // GitHub
  getGithubStatus: () => fetchJson<GithubStatus>('/github/status'),
  generateGithubKey: () => fetchJson<{public_key: string; message: string}>('/github/generate-key', { method: 'POST' }),

  // Workspaces
  getWorkspaces: () => fetchJson<Workspace[]>('/workspaces'),
  createWorkspace: (data: {name: string; repo_url?: string}) => fetchJson<Workspace>('/workspaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  deleteWorkspace: (id: string) => fetchJson<{message: string}>(`/workspaces/${id}`, { method: 'DELETE' }),

  // Files
  getFiles: (id: string, path: string = '.') => fetchJson<FileNode[]>(`/workspaces/${id}/files?path=${encodeURIComponent(path)}`),
  getFileContent: (id: string, path: string) => fetchJson<{content: string}>(`/workspaces/${id}/file?path=${encodeURIComponent(path)}`),
  saveFile: (id: string, path: string, content: string) => fetchJson<{message: string}>(`/workspaces/${id}/file?path=${encodeURIComponent(path)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  }),

  // PRs
  reviewPr: (id: string, data: {pr_url: string}) => fetchJson<PrReviewResult>(`/workspaces/${id}/pr/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  createPr: (id: string, data: {title: string; body: string; base: string; head: string}) => fetchJson<{pr_url: string}>(`/workspaces/${id}/pr/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),

  // Tests
  getTestConfig: (id: string) => fetchJson<TestConfig>(`/workspaces/${id}/tests/config`),
  updateTestConfig: (id: string, config: TestConfig) => fetchJson<TestConfig>(`/workspaces/${id}/tests/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  }),
  runTests: (id: string) => fetchJson<TestRunResult>(`/workspaces/${id}/tests/run`, { method: 'POST' }),
  getArtifacts: (id: string) => fetchJson<Artifact[]>(`/workspaces/${id}/artifacts`),
};
