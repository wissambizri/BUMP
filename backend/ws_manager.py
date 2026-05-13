"""WebSocket connection manager (singleton)."""
from typing import Dict, List
from fastapi import WebSocket


class WSManager:
    def __init__(self):
        self.rooms: Dict[str, List[WebSocket]] = {}

    async def connect(self, match_id: str, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(match_id, []).append(ws)

    def disconnect(self, match_id: str, ws: WebSocket):
        if match_id in self.rooms:
            try:
                self.rooms[match_id].remove(ws)
            except ValueError:
                pass

    async def broadcast(self, match_id: str, data: dict):
        for ws in list(self.rooms.get(match_id, [])):
            try:
                await ws.send_json(data)
            except Exception:
                pass


ws_manager = WSManager()
