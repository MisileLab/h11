# Luna - AI-Powered GitHub PR Review Bot

> Multi-agent code review using OpenCode.ai - Deep analysis with Oracle, Explore, and Librarian agents

## Overview

Luna is an intelligent GitHub Pull Request review bot that leverages the power of OpenCode.ai's multi-agent system. It provides deep, automated code analysis by orchestrating specialized agents (Oracle, Explore, and Librarian) to review your changes.

Luna automatically reviews Pull Requests when they are opened or synchronized, providing a comprehensive summary of changes along with specific inline suggestions. It also responds to natural language requests via `@luna` mentions in PR comments, making it a collaborative partner in your development workflow.

## Features

- ✅ **Auto-review on PR open/sync**: Immediate feedback on every change.
- ✅ **@luna mention**: Natural language interaction for specific requests or explanations.
- ✅ **Multi-agent analysis**: Deep insights from Oracle, Explore, and Librarian agents.
- ✅ **Rich formatted comments**: Clear summaries with tables, emojis, and code suggestions.
- ✅ **Security highlighting (🚨)**: Critical security issues are prominently flagged.
- ✅ **Large PR detection**: Automatically switches to summary-only mode for PRs with 50+ files to maintain performance.
- ✅ **Incremental review**: Intelligently tracks reviewed states to focus only on new commits.
- ✅ **Smart ignore patterns**: Built-in and customizable file filtering via `.lunaignore`.
- ✅ **Auto verdict**: Automatically provides Approve or Request Changes verdicts based on finding severity.

## Prerequisites

- **Bun 1.0+** (Recommended) or **Node.js 18+**
- **GitHub App**: Configured with appropriate permissions.
- **OpenCode API access**: An active OpenCode.ai session/API key.

## Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/luna.git
   cd luna
   ```

2. **Install dependencies**:
   ```bash
   bun install
   # or
   npm install
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

## GitHub App Setup

Luna requires a GitHub App to interact with your repositories. Follow these steps to set it up:

1. Go to your GitHub [Settings > Developer settings > GitHub Apps > New GitHub App](https://github.com/settings/apps/new).
2. **App name**: Luna (or your preferred name).
3. **Homepage URL**: Your repository or website.
4. **Webhook**:
   - Enable **Active**.
   - **Webhook URL**: Your deployment URL (or smee.io URL for local development).
   - **Webhook secret**: A strong, random string.
5. **Permissions**:
   - **Repository permissions**:
     - **Pull requests**: Read & write (for reviews and comments).
     - **Issues**: Read & write (for @luna mention responses).
     - **Contents**: Read-only (for cloning and analyzing code).
6. **Subscribe to events**:
   - **Pull request**: opened, synchronize.
   - **Issue comment**: created.
7. **Install App**: Install the app on the repositories you want Luna to monitor.
8. **Private Key**: Generate and download a private key from the app settings page.

## Configuration

Luna is configured via environment variables. Create a `.env` file in the root directory.

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `APP_ID` | Yes | GitHub App ID (found in app settings) | `12345` |
| `PRIVATE_KEY_PATH` | Yes | Path to the downloaded private key file | `./private-key.pem` |
| `WEBHOOK_SECRET` | Yes | Secret used to verify webhook signatures | `your-secret-string` |
| `WEBHOOK_PROXY_URL` | Dev only | smee.io URL for local development | `https://smee.io/xyz` |

## Usage

### Auto-Review Flow

When a PR is opened or new commits are pushed:
1. Luna detects the event and clones the PR branch to a temporary directory.
2. It filters out ignored files (lock files, build artifacts, etc.).
3. Specialized agents analyze the diff and the codebase.
4. Luna posts a summary review with a verdict and specific inline comments for findings.

### @luna Mentions

You can talk to Luna directly by mentioning it in any PR or Issue comment:
- `@luna explain this function`
- `@luna can you find potential performance issues in this file?`
- `@luna summarize the changes in this PR`

## .lunaignore

Luna supports a `.lunaignore` file in the root of your repository to exclude specific files from analysis. It uses the standard gitignore format.

### Default Ignored Files

By default, Luna ignores common generated and non-code files:
- `**/package-lock.json`
- `**/yarn.lock`
- `**/pnpm-lock.yaml`
- `**/bun.lockb`
- `**/dist/**`
- `**/build/**`
- `**/*.min.js`
- `**/*.d.ts`

### Custom Ignore Patterns

Create a `.lunaignore` file to add your own patterns:
```text
# Ignore documentation files
docs/**/*.md

# Ignore specific test data
tests/fixtures/*.json
```

## Development

To run Luna locally for development:

1. **Start a smee.io proxy**:
   ```bash
   npx smee -u https://smee.io/your-unique-id -p 3000
   ```
2. **Update `.env`**: Set `WEBHOOK_PROXY_URL` to your smee URL.
3. **Start the dev server**:
   ```bash
   bun run dev
   ```
4. **Run tests**:
   ```bash
   bun test
   ```

## License

[MIT](LICENSE)
