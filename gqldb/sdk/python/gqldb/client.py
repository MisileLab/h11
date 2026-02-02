from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any, Dict, Optional
from urllib import request


@dataclass
class GraphQLResponse:
    data: Dict[str, Any]
    errors: Optional[list[dict[str, Any]]] = None


class GQLDBClient:
    def __init__(self, endpoint: str, timeout: float = 10.0) -> None:
        self._endpoint = endpoint
        self._timeout = timeout

    def query(
        self, query: str, variables: Optional[dict[str, Any]] = None
    ) -> GraphQLResponse:
        payload = {"query": query, "variables": variables or {}}
        data = json_bytes(payload)
        req = request.Request(
            self._endpoint,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with request.urlopen(req, timeout=self._timeout) as response:
            body = json.loads(response.read().decode("utf-8"))
        return GraphQLResponse(data=body.get("data", {}), errors=body.get("errors"))

    def health(self) -> bool:
        response = self.query("query { health }")
        return response.errors is None and response.data.get("health") == "ok"


def json_bytes(payload: Dict[str, Any]) -> bytes:
    return json.dumps(payload).encode("utf-8")
