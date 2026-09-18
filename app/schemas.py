from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ParseIn(BaseModel):
    text: str = Field(min_length=1, max_length=240)


class TaskOut(BaseModel):
    title: str
    raw: str
    category: str
    bill_kind: Optional[str] = None
    amount: Optional[float] = None
    due: Optional[str] = None
    time: Optional[str] = None
    done: bool = False


class ProfileIn(BaseModel):
    name: str = ""
    household: str = "self"
    work: str = "remote"
    meds: bool = False
    watch_fx: bool = False
    errand_window: str = "flex"


class CoachIn(BaseModel):
    profile: ProfileIn = Field(default_factory=ProfileIn)
    tasks: list[TaskOut] = Field(default_factory=list)
    now: Optional[datetime] = None


class RelatedIn(BaseModel):
    task: TaskOut
    existing: list[TaskOut] = Field(default_factory=list)
