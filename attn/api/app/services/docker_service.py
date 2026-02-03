import docker
from pathlib import Path
from app.core.config import (
    WORKSPACES_DIR,
    GITHUB_SSH_DIR,
    GITHUB_CONFIG_DIR,
    CONFIGS_DIR,
)


def create_workspace_container(workspace_id: str) -> str:
    """
    Build workspace image and create a container.

    Args:
        workspace_id: Unique workspace identifier

    Returns:
        Container ID
    """
    client = docker.from_env()

    # Build image from workspace-image directory
    image_path = Path("/Users/misile/repos/h11/attn/workspace-image")
    image, _ = client.images.build(
        path=str(image_path),
        tag=f"workbench-workspace:{workspace_id}",
        rm=True,
    )

    # Prepare volume mounts
    volumes = {
        str(WORKSPACES_DIR / workspace_id / "repo"): {
            "bind": "/workspace",
            "mode": "rw",
        },
        str(GITHUB_SSH_DIR): {"bind": "/root/.ssh", "mode": "ro"},
        str(GITHUB_CONFIG_DIR): {"bind": "/root/.config/gh", "mode": "ro"},
    }

    # Optional config mounts (only if files exist)
    opencode_jsonc = CONFIGS_DIR / "opencode.jsonc"
    if opencode_jsonc.exists():
        volumes[str(opencode_jsonc)] = {
            "bind": "/workspace/.opencode/opencode.jsonc",
            "mode": "ro",
        }

    opencode_json = CONFIGS_DIR / "oh-my-opencode.json"
    if opencode_json.exists():
        volumes[str(opencode_json)] = {
            "bind": "/workspace/.opencode/oh-my-opencode.json",
            "mode": "ro",
        }

    auth_json = CONFIGS_DIR / "auth.json"
    if auth_json.exists():
        volumes[str(auth_json)] = {
            "bind": "/root/.local/share/opencode/auth.json",
            "mode": "ro",
        }

    # Create and start container
    container = client.containers.run(
        f"workbench-workspace:{workspace_id}",
        detach=True,
        name=f"workbench-ws-{workspace_id}",
        volumes=volumes,
        remove=False,
    )

    container_id = container.id
    if not container_id:
        raise RuntimeError("Failed to create container")
    return container_id


def stop_and_remove_container(container_id: str) -> None:
    """
    Stop and remove a container.

    Args:
        container_id: Docker container ID
    """
    client = docker.from_env()
    try:
        container = client.containers.get(container_id)
        container.stop()
        container.remove()
    except Exception:
        pass  # Container already removed


def list_running_containers() -> list:
    """
    List all workbench containers.

    Returns:
        List of container info dicts
    """
    client = docker.from_env()
    containers = client.containers.list(filters={"name": "workbench-ws-"})
    return [
        {
            "id": c.id,
            "name": c.name,
            "status": c.status,
        }
        for c in containers
    ]
