"""Day coach: profile + weather + FX + inbox → ranked, timed suggestions."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

CAIRO = ZoneInfo("Africa/Cairo")
RAIN = {51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99}
RELATED = {
    "electricity": ("water", "gas"),
    "water": ("electricity",),
    "gas": ("electricity",),
    "internet": ("phone",),
    "phone": ("internet",),
    "rent": ("electricity", "water"),
}


def cairo_now(now: Optional[datetime] = None) -> datetime:
    if now is None:
        return datetime.now(CAIRO)
    if now.tzinfo is None:
        return now.replace(tzinfo=CAIRO)
    return now.astimezone(CAIRO)


def slot_for(hour: int) -> str:
    if 5 <= hour < 11:
        return "morning"
    if 11 <= hour < 17:
        return "afternoon"
    if 17 <= hour < 21:
        return "evening"
    return "night"


def _open_tasks(tasks: list[dict]) -> list[dict]:
    return [t for t in tasks if not t.get("done")]


def _kinds(tasks: list[dict]) -> set[str]:
    return {t.get("bill_kind") for t in tasks if t.get("bill_kind") and not t.get("done")}


def _has_text(tasks: list[dict], needle: str) -> bool:
    n = needle.lower()
    return any(n in (t.get("raw") or t.get("title") or "").lower() for t in tasks if not t.get("done"))


def _item(code: str, kind: str = "move", add: Optional[str] = None, **params) -> dict:
    return {"code": code, "kind": kind, "add": add, "params": params}


def related_suggestions(task: dict, existing: list[dict], briefing: Optional[dict] = None) -> list[dict]:
    """What usually comes with this note, if it is not already in the inbox."""
    out: list[dict] = []
    kinds = _kinds(existing)
    kind = task.get("bill_kind")
    weather = (briefing or {}).get("weather") or {}
    temp = weather.get("temp_c")
    if kind:
        for nxt in RELATED.get(kind, ()):
            if nxt not in kinds:
                out.append(_item(f"related_{nxt}", "related", nxt, **{"from": kind, "next": nxt}))
    if task.get("category") == "medicine" and not _has_text(existing, "refill") and not _has_text(
        existing, "pharmacy"
    ):
        out.append(_item("related_refill", "related", "pharmacy refill this week"))
    if task.get("category") == "errand" and not _has_text(existing, "bread"):
        out.append(_item("related_staples", "related", "buy bread"))
    if (
        task.get("category") == "errand"
        and temp is not None
        and float(temp) >= 32
        and not _has_text(existing, "drinking water")
    ):
        out.append(_item("related_drink", "related", "buy drinking water"))
    return out[:3]


def plan_day(
    profile: dict,
    tasks: list[dict],
    briefing: dict,
    now: Optional[datetime] = None,
) -> dict:
    now = cairo_now(now)
    today = now.date()
    hour = now.hour
    slot = slot_for(hour)
    weekday = now.weekday()
    weather = briefing.get("weather") or {}
    fx = briefing.get("fx") or {}
    temp = weather.get("temp_c")
    humidity = weather.get("humidity")
    wind = weather.get("wind_kmh")
    code = weather.get("code")
    usd = fx.get("usd_egp")
    open_tasks = _open_tasks(tasks)
    overdue = [t for t in open_tasks if t.get("due") and t["due"] < today.isoformat()]
    due_today = [t for t in open_tasks if t.get("due") == today.isoformat()]
    due_week = [
        t
        for t in open_tasks
        if t.get("due") and today.isoformat() <= t["due"] <= _plus_days(today.isoformat(), 7)
    ]
    meds_today = [t for t in due_today if t.get("category") == "medicine"]
    errands = [t for t in open_tasks if t.get("category") == "errand"]
    bills = [t for t in open_tasks if t.get("category") == "bill"]
    raining = code in RAIN
    hot = temp is not None and float(temp) >= 32
    humid = humidity is not None and float(humidity) >= 55 and hot
    windy = wind is not None and float(wind) >= 28
    friday = weekday == 4
    saturday = weekday == 5
    month_end = today.day >= 25
    name = (profile.get("name") or "").strip() or "there"
    work = profile.get("work") or "flex"
    household = profile.get("household") or "self"
    watch_fx = bool(profile.get("watch_fx"))
    errand_window = profile.get("errand_window") or "flex"
    takes_meds = bool(profile.get("meds"))

    items: list[dict] = []

    if overdue:
        title = overdue[0].get("title") or overdue[0].get("raw") or "bill"
        items.append(_item("overdue_first", "warn", None, title=title, count=len(overdue)))

    if len(bills) >= 2:
        items.append(_item("batch_bills", "move", None, count=len(bills)))

    if len(errands) >= 2 and not raining:
        items.append(_item("one_trip", "move", None, count=len(errands)))

    if meds_today:
        when = meds_today[0].get("time") or ""
        items.append(_item("meds_today", "habit", None, time=when))
    elif takes_meds and not any(t.get("category") == "medicine" for t in open_tasks):
        items.append(_item("ask_meds", "habit", "medicine tonight 9pm"))

    if slot == "night":
        items.append(_item("tonight_quiet", "habit"))
    elif raining:
        items.append(_item("rain_errands", "move"))
    elif humid:
        items.append(
            _item("heat_humid", "move", None, temp=int(round(float(temp))), humidity=int(humidity))
        )
    elif hot and work == "commute" and 6 <= hour < 16:
        items.append(_item("heat_commute", "move", None, temp=int(round(float(temp)))))
    elif hot and work == "remote":
        items.append(_item("heat_remote", "move", None, temp=int(round(float(temp)))))
    elif hot and errand_window == "morning" and hour >= 11:
        items.append(_item("heat_missed_morning", "move", None, temp=int(round(float(temp)))))

    if windy and work == "commute" and not raining:
        items.append(_item("wind_commute", "move"))

    if friday:
        items.append(_item("friday_cairo"))
    elif saturday and household in {"family", "couple"}:
        items.append(_item("saturday_family", "habit"))
    elif weekday == 6 and hour >= 17:
        items.append(_item("week_prep", "habit"))

    if household == "family" and weekday < 4 and 6 <= hour <= 9:
        items.append(_item("school_run", "habit"))

    if watch_fx and usd is not None and float(usd) >= 50:
        items.append(_item("dollar_high", "warn", None, rate=usd))

    if month_end:
        missing = [k for k in ("electricity", "water", "internet") if k not in _kinds(open_tasks)]
        if missing:
            items.append(_item("month_end_bills", "related", missing[0], next=missing[0]))

    if work == "commute" and 7 <= hour <= 10 and not raining:
        items.append(_item("commute_window"))

    if errand_window == "evening" and hour < 17 and any(t.get("category") == "errand" for t in due_today):
        items.append(_item("hold_errands"))

    if not open_tasks:
        starter = "electricity this month" if month_end else "what is due this week"
        items.append(_item("empty_start", "related", starter))

    if due_week and not overdue and slot in {"morning", "afternoon"}:
        first = due_week[0].get("title") or due_week[0].get("raw")
        items.append(_item("week_due", "habit", None, title=first, count=len(due_week)))

    seen = set()
    slim = []
    for item in items:
        if item["code"] in seen:
            continue
        seen.add(item["code"])
        slim.append(item)
    slim = slim[:5]

    nxt = None
    for item in slim:
        if item["code"] == "overdue_first":
            nxt = item
            break
    if nxt is None:
        for item in slim:
            if item.get("add"):
                nxt = item
                break

    if overdue:
        headline = "headline_overdue"
    elif slot == "night":
        headline = "headline_night"
    elif raining:
        headline = "headline_rain"
    elif friday:
        headline = "headline_friday"
    elif hot:
        headline = "headline_heat"
    else:
        headline = "headline_clear"

    return {
        "headline": headline,
        "name": name,
        "when": now.isoformat(timespec="minutes"),
        "slot": slot,
        "next": nxt,
        "items": slim,
        "related": related_suggestions(open_tasks[0], open_tasks[1:], briefing) if open_tasks else [],
    }


def _plus_days(iso: str, days: int) -> str:
    from datetime import date, timedelta

    y, m, d = (int(p) for p in iso.split("-"))
    return (date(y, m, d) + timedelta(days=days)).isoformat()
