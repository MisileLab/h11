# pi-flow-enforcer

Enforces a strict workflow in pi.dev sessions:

`plan -> blocking ambiguity questions -> /approve -> execute -> checkpoint proof -> commit`

## How it works

- Auto-starts each session (when registered in `.pi/settings.json`)
- Runs auto-context manager first (max 6 files or 24k chars)
- Forces plan output in required Markdown schema
- Asks blocking questions only when ambiguity is detected (max 5 per event)
- Blocks execution changes until exact `/approve`
- Stops execution immediately on failed assumptions/unexpected tool output
- Enforces checkpoint proof before completion
- Auto-generates Conventional Commit message and auto-commits per checkpoint
- Stops and asks to split when big-commit threshold is exceeded

## Register (project-local)

Use project settings:

```json
{
  "packages": [
    "../piflow"
  ]
}
```

File: `.pi/settings.json`

## Approve execution

Execution is locked until you run:

```text
/approve
```

Token matching is exact by default.

## Configuration

Create `.pi-flow-enforcer.json` in repo root:

```json
{
  "approvalToken": "/approve",
  "bigCommitThresholds": {
    "locChanged": 350,
    "filesChanged": 12
  },
  "contextManager": {
    "maxFiles": 6,
    "maxChars": 24000,
    "priorities": [
      "README*",
      "docs/README*",
      "docs/overview*",
      "docs/architecture*",
      "package.json",
      "pyproject.toml",
      "Cargo.toml",
      "go.mod",
      "CONTRIBUTING*",
      "Makefile",
      "justfile",
      "main.*",
      "index.*",
      "app.*"
    ]
  },
  "commitStyle": "conventional"
}
```
