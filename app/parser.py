"""Turn a one-line household note into a structured task.

Arabic, English, and other popular languages. No I/O, no LLM.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from app.lexicon import (
    BILL_HINTS,
    BILL_TITLES,
    CURRENCY_RE,
    ERRAND_HINTS,
    MED_HINTS,
    MONTHS,
    TODAY_WORDS,
    TOMORROW_WORDS,
)

CAIRO = ZoneInfo("Africa/Cairo")
CATEGORIES = ("bill", "medicine", "errand", "note")


def cairo_today() -> date:
    return datetime.now(CAIRO).date()


def _contains_any(text: str, words: tuple[str, ...]) -> bool:
    lowered = text.lower()
    for word in sorted(words, key=len, reverse=True):
        if not word:
            continue
        ascii_short = bool(re.fullmatch(r"[a-z0-9 '\-]+", word.lower())) and len(word) <= 4
        if ascii_short:
            if re.search(rf"(?<![a-z0-9]){re.escape(word.lower())}(?![a-z0-9])", lowered):
                return True
        elif word.lower() in lowered or word in text:
            return True
    return False


def _bill_kind(text: str) -> Optional[str]:
    for kind, hints in BILL_HINTS:
        if _contains_any(text, hints):
            return kind
    return None


def parse_amount(text: str) -> Optional[float]:
    patterns = (
        rf"(\d+(?:[.,]\d+)?)\s*{CURRENCY_RE}(?!\w)",
        rf"{CURRENCY_RE}\s*(\d+(?:[.,]\d+)?)",
        r"(\d+(?:\.\d+)?)\s*ج\b",
    )
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return float(m.group(1).replace(",", "."))
    if _bill_kind(text):
        m = re.search(r"\b(\d{2,6}(?:[.,]\d+)?)\b", text)
        if m:
            return float(m.group(1).replace(",", "."))
    return None


def parse_times(text: str) -> list[str]:
    found: list[str] = []
    for m in re.finditer(
        r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|ص|م|hs|uhr)\b",
        text,
        re.IGNORECASE,
    ):
        hour = int(m.group(1))
        minute = int(m.group(2) or 0)
        suffix = m.group(3).lower()
        if suffix in ("pm", "م") and hour < 12:
            hour += 12
        if suffix in ("am", "ص") and hour == 12:
            hour = 0
        if hour > 23 or minute > 59:
            continue
        clock = f"{hour:02d}:{minute:02d}"
        if clock not in found:
            found.append(clock)
    if not found:
        one = parse_time(text)
        if one:
            found.append(one)
    return found


def shopping_items(text: str, category: str) -> list[str]:
    if category != "errand":
        return []
    stripped = re.sub(r"^(?:please\s+)?(?:buy|get|pick up|اشتري|اشترِ|جيب|هات)\s+", "", text, flags=re.IGNORECASE)
    parts = [p.strip() for p in re.split(r"\s+(?:and|&|\+)\s+|\s+و\s*", stripped, flags=re.IGNORECASE)]
    parts = [p for p in parts if 1 < len(p) < 40]
    return parts[:12] if len(parts) >= 2 else []


def parse_time(text: str) -> Optional[str]:
    m = re.search(
        r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|ص|م|hs|uhr)\b",
        text,
        re.IGNORECASE,
    )
    if m:
        hour = int(m.group(1))
        minute = int(m.group(2) or 0)
        suffix = m.group(3).lower()
        if suffix in ("pm", "م") and hour < 12:
            hour += 12
        if suffix in ("am", "ص") and hour == 12:
            hour = 0
        return f"{hour:02d}:{minute:02d}"
    m = re.search(r"\b([01]?\d|2[0-3])[:h]([0-5]\d)\b", text, re.IGNORECASE)
    if m:
        return f"{int(m.group(1)):02d}:{m.group(2)}"
    m = re.search(r"\b(\d{1,2})h\b", text, re.IGNORECASE)
    if m:
        return f"{int(m.group(1)):02d}:00"
    return None


def _coerce_due(year: int, month: int, day: int, today: date) -> Optional[str]:
    try:
        due = date(year, month, day)
    except ValueError:
        return None
    if due < today:
        try:
            due = due.replace(year=year + 1)
        except ValueError:
            return None
    return due.isoformat()


def parse_due(text: str, today: Optional[date] = None) -> Optional[str]:
    today = today or cairo_today()
    if _contains_any(text, TODAY_WORDS):
        return today.isoformat()
    if _contains_any(text, TOMORROW_WORDS):
        return (today + timedelta(days=1)).isoformat()

    m = re.search(r"(\d{1,2})\s*月\s*(\d{1,2})\s*日?", text)
    if m:
        return _coerce_due(today.year, int(m.group(1)), int(m.group(2)), today)
    m = re.search(r"(\d{1,2})\s*월\s*(\d{1,2})\s*일?", text)
    if m:
        return _coerce_due(today.year, int(m.group(1)), int(m.group(2)), today)

    m = re.search(r"\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b", text)
    if m:
        d, mo = int(m.group(1)), int(m.group(2))
        year = int(m.group(3)) if m.group(3) else today.year
        if year < 100:
            year += 2000
        iso = _coerce_due(year, mo, d, today)
        if iso:
            return iso
        iso = _coerce_due(year, d, mo, today)
        if iso:
            return iso

    lowered = text.lower()
    for name, month in sorted(MONTHS.items(), key=lambda item: len(item[0]), reverse=True):
        escaped = re.escape(name)
        if name.isascii():
            pat = rf"(?:(\d{{1,2}})\.?\s*{escaped}\b)|(?:\b{escaped}\s+(\d{{1,2}})\b)"
            m = re.search(pat, lowered, re.IGNORECASE)
        else:
            pat = rf"(\d{{1,2}})\.?\s*{escaped}|{escaped}\s+(\d{{1,2}})"
            m = re.search(pat, text) or re.search(pat, lowered)
        if not m:
            continue
        day = int(m.group(1) or m.group(2))
        iso = _coerce_due(today.year, month, day, today)
        if iso:
            return iso
    return None


def classify(text: str) -> str:
    if _bill_kind(text):
        return "bill"
    if _contains_any(text, MED_HINTS):
        return "medicine"
    if _contains_any(text, ERRAND_HINTS):
        return "errand"
    return "note"


def _title(text: str, bill_kind: Optional[str]) -> str:
    cleaned = re.sub(r"\s+", " ", text.strip())
    if bill_kind:
        return BILL_TITLES[bill_kind]
    return cleaned[:80] or "Task"


def parse_currency(text: str) -> Optional[str]:
    low = text.lower()
    if re.search(r"usd|\$|dollars?", low):
        return "USD"
    if re.search(r"eur|€|euros?", low):
        return "EUR"
    if re.search(r"gbp|£", low):
        return "GBP"
    if re.search(r"egp|\ble\b|جنيه|جنية", low) or re.search(r"ج\.?\s*م|ج\b", text):
        return "EGP"
    if _bill_kind(text):
        return "EGP"
    return None


def parse_task(text: str, today: Optional[date] = None) -> dict:
    raw = (text or "").strip()
    if not raw:
        raise ValueError("empty")
    today = today or cairo_today()
    bill_kind = _bill_kind(raw)
    category = classify(raw)
    due = parse_due(raw, today)
    times = parse_times(raw)
    when = times[0] if times else None
    items = shopping_items(raw, category)
    if category == "bill" and not due:
        nxt = date(today.year + (today.month == 12), (today.month % 12) + 1, 1)
        due = (nxt - timedelta(days=1)).isoformat()
    if when and not due:
        due = today.isoformat()
    amount = parse_amount(raw)
    out = {
        "title": _title(raw, bill_kind),
        "raw": raw,
        "category": category,
        "bill_kind": bill_kind,
        "amount": amount,
        "currency": parse_currency(raw) if amount is not None else None,
        "due": due,
        "time": when,
    }
    if len(times) > 1:
        out["times"] = times
    if items:
        out["items"] = items
    return out
