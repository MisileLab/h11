from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from sqlmodel import Session
import httpx

from app.core.database import get_session
from app.core.auth import get_current_user
from app.models.user import User
from app.models.workspace import Workspace
from app.services.docker_manager import get_container

router = APIRouter()


async def proxy_request(target_url: str, request: Request) -> Response:
    """Proxy HTTP/WebSocket request to target URL"""
    async with httpx.AsyncClient() as client:
        try:
            # Proxy the request
            response = await client.request(
                method=request.method,
                url=target_url,
                headers={
                    k: v
                    for k, v in request.headers.items()
                    if k.lower() not in ["host", "connection"]
                },
                content=await request.body(),
                timeout=30.0,
            )

            return Response(
                content=response.content,
                status_code=response.status_code,
                headers=dict(response.headers),
            )
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Proxy error: {str(e)}")


@router.api_route(
    "/{workspace_id}/preview/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "HEAD"],
)
async def preview_proxy(
    workspace_id: int,
    path: str,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Proxy requests to workspace noVNC server"""
    workspace = session.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if workspace.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    container = get_container(workspace.container_id)
    if not container:
        raise HTTPException(status_code=404, detail="Container not running")

    # noVNC runs on port 6080 inside container
    target_url = f"http://{workspace.container_name}:6080/{path}"

    return await proxy_request(target_url, request)
