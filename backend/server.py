"""BUMP backend — FastAPI bootstrap. All route logic lives in routes/*.
Run: uvicorn server:app --host 0.0.0.0 --port 8001
"""
from fastapi import APIRouter, FastAPI, WebSocket, WebSocketDisconnect
from starlette.middleware.cors import CORSMiddleware

from config import logger
from db import client
from seed import seed_data
from ws_manager import ws_manager

# Route modules
from routes import (
    auth as auth_routes,
    account as account_routes,
    profile as profile_routes,
    venues as venues_routes,
    checkin as checkin_routes,
    social as social_routes,
    safety as safety_routes,
    push as push_routes,
    admin as admin_routes,
)

app = FastAPI(title="BUMP API")
api = APIRouter(prefix="/api")

# Mount all route modules under /api
api.include_router(auth_routes.router)
api.include_router(account_routes.router)
api.include_router(profile_routes.router)
api.include_router(venues_routes.router)
api.include_router(checkin_routes.router)
api.include_router(social_routes.router)
api.include_router(safety_routes.router)
api.include_router(push_routes.router)
api.include_router(admin_routes.router)


@api.get("/")
async def root():
    return {"app": "BUMP", "tagline": "Break the ice nearby."}


app.include_router(api)


# WebSocket lives directly on the app (not on the API router) per FastAPI conventions.
@app.websocket("/api/ws/chat/{match_id}")
async def chat_ws(websocket: WebSocket, match_id: str):
    await ws_manager.connect(match_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            await ws_manager.broadcast(match_id, data)
    except WebSocketDisconnect:
        ws_manager.disconnect(match_id, websocket)
    except Exception as e:
        logger.error(f"WS err: {e}")
        ws_manager.disconnect(match_id, websocket)


@app.on_event("startup")
async def on_startup():
    try:
        await seed_data()
    except Exception as e:
        logger.error(f"Seed err: {e}")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
