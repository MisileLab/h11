from fastapi import APIRouter, Request, Response, Depends, HTTPException
from fastapi.responses import StreamingResponse
import httpx
from app.core.deps import get_current_user
from app.models import User

router = APIRouter()


@router.api_route(
    "/api/workspaces/{workspace_id}/preview/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"],
)
async def preview_proxy(
    workspace_id: str,
    path: str,
    request: Request,
    user: User = Depends(get_current_user),
):
    target_url = f"http://workbench-ws-{workspace_id}:6080/{path}"

    async with httpx.AsyncClient() as client:
        try:
            response = await client.request(
                method=request.method,
                url=target_url,
                headers=dict(request.headers),
                content=await request.body(),
                timeout=30.0,
            )

            return Response(
                content=response.content,
                status_code=response.status_code,
                headers=dict(response.headers),
            )
        except httpx.RequestError:
            raise HTTPException(status_code=502, detail="Preview service unavailable")


@router.websocket("/api/workspaces/{workspace_id}/preview/websockify")
async def preview_websocket(
    workspace_id: str, websocket: WebSocket, user: User = Depends(get_current_user)
):
    await websocket.accept()

    target_url = f"ws://workbench-ws-{workspace_id}:6080/websockify"

    async with websockets.connect(target_url) as ws:

        async def forward_client_to_server():
            try:
                while True:
                    data = await websocket.receive_bytes()
                    await ws.send(data)
            except:
                pass

        async def forward_server_to_client():
            try:
                async for message in ws:
                    await websocket.send_bytes(message)
            except:
                pass

        await asyncio.gather(forward_client_to_server(), forward_server_to_client())
