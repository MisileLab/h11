import asyncio
import docker
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from sqlmodel import Session, select
from app.core.database import get_session
from app.core.deps import get_current_user
from app.models import User, Workspace

router = APIRouter()

client = docker.from_env()


@router.websocket("/api/workspaces/{workspace_id}/terminal")
async def terminal_websocket(
    workspace_id: str,
    websocket: WebSocket,
):
    await websocket.accept()

    try:
        container = client.containers.get(f"workbench-ws-{workspace_id}")
    except docker.errors.NotFound:
        await websocket.send_text("Error: Container not found")
        await websocket.close()
        return

    exec_instance = client.api.exec_create(
        container.id,
        "/bin/bash",
        stdin=True,
        tty=True,
        stdout=True,
        stderr=True,
    )

    exec_id = exec_instance["Id"]
    socket = client.api.exec_start(exec_id, socket=True, tty=True)
    socket._sock.setblocking(False)

    async def read_from_docker():
        loop = asyncio.get_event_loop()
        while True:
            try:
                data = await loop.run_in_executor(None, socket._sock.recv, 4096)
                if data:
                    await websocket.send_bytes(data)
                else:
                    break
            except BlockingIOError:
                await asyncio.sleep(0.01)
            except Exception:
                break

    async def write_to_docker():
        while True:
            try:
                data = await websocket.receive_bytes()
                await asyncio.get_event_loop().run_in_executor(
                    None, socket._sock.send, data
                )
            except WebSocketDisconnect:
                break
            except Exception:
                break

    try:
        await asyncio.gather(read_from_docker(), write_to_docker())
    finally:
        try:
            socket.close()
        except:
            pass
