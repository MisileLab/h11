# OpenCode Workbench

A self-hosted, browser-based development workbench for PR reviews and code work, powered by OpenCode AI and isolated Docker workspaces.

## Features

- 🔒 **Single Admin Authentication** - One-time setup for local/internal use
- 🐳 **Isolated Docker Workspaces** - Each workspace runs in its own container
- 📁 **File Browser & Editor** - Browse and edit files directly in the browser
- 💻 **Web Terminal** - Full shell access via xterm.js
- 🖥️ **X Preview** - Browser-based GUI access via noVNC
- 🤖 **AI-Powered PR Reviews** - OpenCode integration for structured code reviews
- 🔧 **Custom Test Execution** - Configure and run tests with artifact collection
- 🔑 **GitHub SSH Integration** - SSH-based authentication (no token exposure)
- 📱 **Responsive Design** - Works on mobile and desktop

## Architecture

```
attn/
├── api/              # FastAPI backend
├── web/              # React frontend (Vite + TanStack Router/Query)
├── workspace-image/  # Docker image for workspace containers
├── data/             # Persistent data (databases, configs, SSH keys, repos)
└── docker-compose.yml
```

## Prerequisites

- Docker & Docker Compose
- 2GB+ RAM available
- Network access for same-network device connections

## Quick Start

### 1. Clone and Navigate

```bash
cd attn/
```

### 2. Build Workspace Image

```bash
cd workspace-image
docker build -t opencode-workspace .
cd ..
```

### 3. Start Services

```bash
docker compose up --build
```

This will start:
- **API**: `http://localhost:8000`
- **Web UI**: `http://localhost:3000`

### 4. First-Time Setup

1. Open `http://localhost:3000` in your browser
2. You'll be redirected to `/setup`
3. Create admin account (username + password)
4. Login with your credentials

## Configuration

### Upload Required Configs

Go to **Settings** page and upload these files individually:

1. **opencode.jsonc** - OpenCode configuration
2. **auth.json** - OpenCode authentication credentials
3. **oh-my-opencode.json** - Oh-My-OpenCode configuration

Each file can be uploaded/replaced separately.

### GitHub Authentication Setup

The workbench uses SSH-based GitHub authentication (no tokens).

1. Go to **Settings** → **GitHub** section
2. Click **Generate SSH Key** (or use existing key)
3. Copy the displayed public key
4. In any workspace terminal, run:
   ```bash
   gh auth login --git-protocol ssh
   ```
5. Follow the prompts to authenticate with GitHub
6. The SSH key and gh config persist across workspace restarts

**Why SSH?**
- More secure than environment variable tokens
- Keys are stored in persistent volumes
- Works across all workspace containers

## Usage

### Creating a Workspace

1. Go to Dashboard
2. Click **Create Workspace**
3. Enter a name
4. Workspace container will be created automatically

### Working in a Workspace

**Files Tab:**
- Browse repository files in tree view
- Click to open and edit
- Changes saved directly to workspace

**Terminal Tab:**
- Full bash shell access
- All standard tools available (git, gh, opencode)
- Runs inside the workspace container

**Preview Tab:**
- Access GUI applications running in the workspace
- X11 forwarding via noVNC
- Useful for browsers, GUI tools, etc.

**PR Tab:**
- **Review PR**: Enter PR number/URL, get AI-powered review with inline comments
- **Create PR**: Title, body, base/head branches

**Tests Tab:**
- Configure test command (e.g., `pytest`, `npm test`)
- Run tests and view logs
- Download test artifacts

### Workspace Lifecycle

- Workspaces persist until explicitly deleted
- Containers run continuously (for terminal/preview access)
- Workspace data stored in `data/workspaces/{id}/`

## API Endpoints

### Authentication
- `GET /api/setup/status` - Check if setup complete
- `POST /api/setup` - Create admin account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/me` - Current user info

### Configuration
- `GET /api/config/status` - Config upload status
- `POST /api/config/opencode` - Upload opencode.jsonc
- `POST /api/config/auth` - Upload auth.json
- `POST /api/config/ohmy` - Upload oh-my-opencode.json

### Workspaces
- `POST /api/workspaces` - Create workspace
- `GET /api/workspaces` - List workspaces
- `DELETE /api/workspaces/{id}` - Delete workspace

### Files
- `GET /api/workspaces/{id}/files?path=` - List files
- `GET /api/workspaces/{id}/file?path=` - Read file
- `PUT /api/workspaces/{id}/file?path=` - Write file

### Terminal
- `WS /api/workspaces/{id}/terminal` - WebSocket terminal

### Preview
- `GET /api/workspaces/{id}/preview/*` - noVNC proxy

### GitHub
- `GET /api/github/status` - Auth status & key info
- `GET /api/github/public-key` - Get public key
- `POST /api/github/generate-key` - Generate SSH key

### Pull Requests
- `POST /api/workspaces/{id}/pr/review` - Review PR
- `POST /api/workspaces/{id}/pr/create` - Create PR

### Tests
- `GET /api/workspaces/{id}/tests/config` - Get test command
- `PUT /api/workspaces/{id}/tests/config` - Set test command
- `POST /api/workspaces/{id}/tests/run` - Run tests
- `GET /api/workspaces/{id}/tests/logs` - List logs
- `GET /api/workspaces/{id}/tests/logs/{filename}` - Download log
- `GET /api/workspaces/{id}/artifacts` - List artifacts
- `GET /api/workspaces/{id}/artifacts/{filename}` - Download artifact

## Security Features

- **Argon2 Password Hashing** - Secure password storage
- **HTTP-Only Cookies** - Session cookies with SameSite=Lax
- **Path Traversal Protection** - File access restricted to workspace
- **Workspace Isolation** - Each workspace in separate container
- **No Token Exposure** - SSH-based GitHub auth (no GH_TOKEN)
- **Single Admin Model** - Designed for single-user/internal use

## Mobile Access

Access from mobile devices on the same network:

1. Find your host machine's IP: `ipconfig getifaddr en0` (macOS) or `hostname -I` (Linux)
2. On mobile browser, navigate to: `http://<HOST_IP>:3000`
3. Login and use normally

Responsive design adapts to mobile screens.

## Troubleshooting

### Workspace container won't start
```bash
docker logs workbench-ws-{workspace-id}
```

### API not connecting
```bash
docker logs workbench-api
```

### Terminal not connecting
- Check workspace container is running: `docker ps | grep workbench-ws`
- Check WebSocket connection in browser dev tools

### Preview shows "Connection failed"
- Wait 10-15 seconds after workspace creation for X stack to initialize
- Check container logs for supervisord errors

### GitHub auth fails
- Ensure SSH key is uploaded to GitHub account
- Run `gh auth status` in workspace terminal to debug
- Regenerate key if needed from Settings

## Data Persistence

All data persists in `attn/data/`:
- `db/` - SQLite database
- `configs/` - Uploaded configuration files
- `github/ssh/` - SSH keys
- `github/ghconfig/` - GitHub CLI config
- `workspaces/{id}/repo/` - Workspace repositories
- `workspaces/{id}/test_logs/` - Test execution logs
- `workspaces/{id}/artifacts/` - Test artifacts

## Development

### Run API Locally
```bash
cd attn/api
uv sync
uv run uvicorn app.main:app --reload
```

### Run Web Locally
```bash
cd attn/web
yarn install
yarn dev
```

### Build Workspace Image
```bash
cd attn/workspace-image
docker build -t opencode-workspace .
```

## Technology Stack

**Backend:**
- FastAPI (Python 3.14)
- SQLModel (SQLite)
- Docker SDK
- Argon2 (password hashing)
- uv (Python package management)

**Frontend:**
- React 18
- Vite
- TanStack Router
- TanStack Query
- xterm.js
- TailwindCSS
- yarn

**Workspace Containers:**
- Python 3.14
- git, gh (GitHub CLI)
- opencode
- Xvfb + fluxbox + x11vnc + noVNC
- supervisord

## License

MIT

## Contributing

This is a self-hosted internal tool. Fork and customize as needed for your environment.
