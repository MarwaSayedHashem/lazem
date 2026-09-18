"""Lazem API — parse a daily note, Cairo briefing, static app."""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.briefing import get_briefing
from app.coach import plan_day, related_suggestions
from app.lexicon import LANGUAGES, RTL
from app.parser import parse_task
from app.schemas import CoachIn, ParseIn, RelatedIn, TaskOut

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"

app = FastAPI(
    title="Lazem",
    description="Household daily ops for Egypt — bills, meds, errands. Local-first.",
    version="0.1.0",
)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "service": "lazem"}


@app.get("/api/languages")
def languages() -> dict:
    return {
        "languages": [{"code": code, "name": name, "rtl": code in RTL} for code, name in LANGUAGES]
    }


@app.get("/api/briefing")
def briefing() -> dict:
    return get_briefing()


@app.post("/api/parse", response_model=TaskOut)
def parse(body: ParseIn) -> TaskOut:
    try:
        return TaskOut(**parse_task(body.text))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/coach")
def coach(body: CoachIn) -> dict:
    briefing = get_briefing()
    tasks = [t.model_dump() for t in body.tasks]
    return plan_day(body.profile.model_dump(), tasks, briefing, body.now)


@app.post("/api/related")
def related(body: RelatedIn) -> dict:
    existing = [t.model_dump() for t in body.existing]
    return {"items": related_suggestions(body.task.model_dump(), existing)}


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC / "index.html")


app.mount("/static", StaticFiles(directory=STATIC), name="static")
