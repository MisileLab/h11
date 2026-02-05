from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from sqlmodel import Session
import asyncio
import pty
import os
import struct
import fcntl
import termios

from app.core.database import get_session
from app.models.workspace import Workspace
from app.services.docker_manager import get_container

router = APIRouter()


@router.websocket("/{workspace_id}/terminal")
async def terminal_websocket(
    websocket: WebSocket,
    workspace_id: int,
):
    """WebSocket endpoint for terminal access with persistent tmux session"""
    await websocket.accept()

    # Note: Auth via cookie is automatically handled by WebSocket
    # In production, add proper auth validation here

    # Get workspace
    # TODO: Add proper session/auth check for WebSocket
    from app.core.database import engine

    with Session(engine) as session:
        workspace = session.get(Workspace, workspace_id)
        if not workspace or not workspace.container_id:
            await websocket.send_json({"error": "Workspace not found"})
            await websocket.close()
            return

        container = get_container(workspace.container_id)
        if not container:
            await websocket.send_json({"error": "Container not running"})
            await websocket.close()
            return

    # Tmux session name based on workspace ID
    tmux_session = f"workspace-{workspace_id}"

    # Check if tmux session exists, create if not
    check_cmd = [
        "/bin/bash",
        "-c",
        f"tmux has-session -t {tmux_session} 2>/dev/null || tmux new-session -d -s {tmux_session} -c /workspace",
    ]

    container.client.api.exec_create(
        container.id,
        check_cmd,
        stdin=False,
        stdout=False,
        stderr=False,
    )

    exec_check = container.client.api.exec_start(
        container.client.api.exec_create(
            container.id,
            check_cmd,
            stdin=False,
            stdout=False,
            stderr=False,
        )["Id"]
    )

    # Attach to tmux session
    exec_id = container.client.api.exec_create(
        container.id,
        ["/bin/bash", "-c", f"tmux attach-session -t {tmux_session}"],
        stdin=True,
        stdout=True,
        stderr=True,
        tty=True,
        workdir="/workspace",
        environment={"TERM": "xterm-256color"},
    )

    exec_socket = container.client.api.exec_start(
        exec_id,
        socket=True,
        tty=True,
    )

    # Set socket to non-blocking
    exec_socket._sock.setblocking(False)

    async def read_from_exec():
        """Read output from container exec and send to WebSocket"""
        while True:
            try:
                data = exec_socket._sock.recv(4096)
                if not data:
                    break
                await websocket.send_bytes(data)
            except BlockingIOError:
                await asyncio.sleep(0.01)
            except Exception as e:
                print(f"Error reading from exec: {e}")
                break

    async def write_to_exec():
        """Receive input from WebSocket and write to container exec"""
        while True:
            try:
                data = await websocket.receive()

                if "bytes" in data:
                    exec_socket._sock.send(data["bytes"])
                elif "text" in data:
                    exec_socket._sock.send(data["text"].encode("utf-8"))

            except WebSocketDisconnect:
                break
            except Exception as e:
                print(f"Error writing to exec: {e}")
                break

    try:
        # Run both coroutines concurrently
        await asyncio.gather(
            read_from_exec(),
            write_to_exec(),
        )
    except Exception as e:
        print(f"Terminal error: {e}")
    finally:
        try:
            exec_socket.close()
        except:
            pass
        try:
            await websocket.close()
        except:
            pass
