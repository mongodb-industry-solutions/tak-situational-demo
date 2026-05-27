from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from dotenv import load_dotenv

load_dotenv()

from routers import tracks, chat, mapitems, alerts, files, telemetry, systemai  # noqa: E402

app = FastAPI(title="TAK Situational Demo")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tracks.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(mapitems.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(files.router, prefix="/api")
app.include_router(telemetry.router, prefix="/api")
app.include_router(systemai.router, prefix="/api")

@app.get("/")
async def health():
    return {"message": "Server is running"}
