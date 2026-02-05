import docker
from docker.models.containers import Container
from typing import Optional
import os

client = docker.from_env()

WORKSPACE_IMAGE = "opencode-workspace:latest"
WORKSPACE_NETWORK = "opencode_network"


# Get the host path for /data by inspecting our own container
def get_host_data_path() -> str:
    """Get the actual host path for /data volume"""
    try:
        # Try to get our own container (opencode-api)
        api_container = client.containers.get("opencode-api")
        for mount in api_container.attrs["Mounts"]:
            if mount["Destination"] == "/data":
                return mount["Source"]
    except Exception:
        pass
    # Fallback: assume we're running directly on host
    return "/data"


HOST_DATA_PATH = get_host_data_path()


def ensure_network():
    """Ensure Docker network exists"""
    try:
        client.networks.get(WORKSPACE_NETWORK)
    except docker.errors.NotFound:
        client.networks.create(WORKSPACE_NETWORK, driver="bridge")


def create_workspace_container(workspace_id: int, container_name: str) -> str:
    """Create and start workspace container"""
    ensure_network()

    # Prepare volume mounts using actual host paths
    repo_path = f"/data/workspaces/{workspace_id}/repo"
    os.makedirs(repo_path, exist_ok=True)

    # Convert container paths to host paths for Docker volume mounts
    host_repo_path = os.path.join(HOST_DATA_PATH, f"workspaces/{workspace_id}/repo")
    host_configs_path = os.path.join(HOST_DATA_PATH, "configs")
    host_ssh_path = os.path.join(HOST_DATA_PATH, "github/ssh")
    host_ghconfig_path = os.path.join(HOST_DATA_PATH, "github/ghconfig")

    volumes = {
        host_repo_path: {"bind": "/workspace", "mode": "rw"},
        host_configs_path: {"bind": "/workspace/.opencode", "mode": "ro"},
        host_ssh_path: {"bind": "/root/.ssh", "mode": "rw"},
        host_ghconfig_path: {"bind": "/root/.config/gh", "mode": "rw"},
    }

    # Mount auth.json to opencode default location
    auth_json_path = os.path.join(HOST_DATA_PATH, "configs/auth.json")
    if os.path.exists("/data/configs/auth.json"):  # Check in container path
        volumes[auth_json_path] = {
            "bind": "/root/.local/share/opencode/auth.json",
            "mode": "ro",
        }

    environment = {
        "DISPLAY": ":99",
    }

    try:
        container = client.containers.run(
            WORKSPACE_IMAGE,
            name=container_name,
            detach=True,
            volumes=volumes,
            environment=environment,
            network=WORKSPACE_NETWORK,
            hostname=container_name,
            remove=False,
            stdin_open=True,
            tty=True,
        )
        return container.id
    except docker.errors.APIError as e:
        raise Exception(f"Failed to create container: {str(e)}")


def stop_and_remove_container(container_id: str) -> None:
    """Stop and remove workspace container"""
    try:
        container = client.containers.get(container_id)
        container.stop(timeout=10)
        container.remove()
    except docker.errors.NotFound:
        pass  # Already removed
    except docker.errors.APIError as e:
        raise Exception(f"Failed to remove container: {str(e)}")


def get_container(container_id: str) -> Optional[Container]:
    """Get container by ID"""
    try:
        return client.containers.get(container_id)
    except docker.errors.NotFound:
        return None


def exec_in_container(
    container_id: str, command: list[str], workdir: str = "/workspace"
) -> tuple[int, str]:
    """Execute command in container and return exit code and output"""
    try:
        container = client.containers.get(container_id)
        exit_code, output = container.exec_run(
            command,
            workdir=workdir,
            demux=False,
        )
        return exit_code, output.decode("utf-8", errors="replace") if output else ""
    except docker.errors.APIError as e:
        raise Exception(f"Failed to execute command: {str(e)}")
