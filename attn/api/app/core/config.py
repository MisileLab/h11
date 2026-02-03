import os
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent.parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "db" / "workbench.db"
WORKSPACES_DIR = DATA_DIR / "workspaces"
CONFIGS_DIR = DATA_DIR / "configs"
GITHUB_SSH_DIR = DATA_DIR / "github" / "ssh"
GITHUB_CONFIG_DIR = DATA_DIR / "github" / "ghconfig"

DATABASE_URL = f"sqlite:///{DB_PATH}"

SESSION_COOKIE_NAME = "workbench_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 7

MAX_FILE_SIZE = 10 * 1024 * 1024
