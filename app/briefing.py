"""Cairo daily briefing: weather + USD/EGP. Cached, degrades if a feed is down."""
from __future__ import annotations

import time
from typing import Any, Optional

import httpx

CAIRO_LAT = 30.0444
CAIRO_LON = 31.2357
CACHE_SECONDS = 15 * 60

_cache: dict[str, Any] = {"at": 0.0, "payload": None}

WMO = {
    0: ("صافي", "Clear"),
    1: ("غالباً صافي", "Mostly clear"),
    2: ("غائم جزئياً", "Partly cloudy"),
    3: ("غائم", "Overcast"),
    45: ("شبورة", "Fog"),
    48: ("شبورة", "Fog"),
    51: ("رذاذ", "Drizzle"),
    61: ("مطر خفيف", "Light rain"),
    63: ("مطر", "Rain"),
    65: ("مطر غزير", "Heavy rain"),
    71: ("ثلج", "Snow"),
    80: ("زخات", "Showers"),
    95: ("رعد", "Thunder"),
}


def _weather() -> dict[str, Any]:
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={CAIRO_LAT}&longitude={CAIRO_LON}"
        "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m"
        "&timezone=Africa%2FCairo"
    )
    data = httpx.get(url, timeout=8.0).json()
    current = data.get("current") or {}
    code = int(current.get("weather_code") or 0)
    ar, en = WMO.get(code, ("", ""))
    return {
        "temp_c": current.get("temperature_2m"),
        "humidity": current.get("relative_humidity_2m"),
        "wind_kmh": current.get("wind_speed_10m"),
        "code": code,
        "label_ar": ar,
        "label_en": en,
    }


def _fx() -> dict[str, Any]:
    data = httpx.get("https://open.er-api.com/v6/latest/USD", timeout=8.0).json()
    rates = data.get("rates") or {}
    egp = rates.get("EGP")
    return {
        "usd_egp": round(float(egp), 2) if egp is not None else None,
        "as_of": data.get("time_last_update_utc"),
    }


def get_briefing(force: bool = False) -> dict[str, Any]:
    now = time.time()
    if not force and _cache["payload"] and now - _cache["at"] < CACHE_SECONDS:
        return _cache["payload"]

    weather: Optional[dict] = None
    fx: Optional[dict] = None
    errors: list[str] = []
    try:
        weather = _weather()
    except Exception as exc:  # noqa: BLE001 — briefing must never 500
        errors.append(f"weather:{exc.__class__.__name__}")
    try:
        fx = _fx()
    except Exception as exc:  # noqa: BLE001
        errors.append(f"fx:{exc.__class__.__name__}")

    payload = {
        "city": "Cairo",
        "weather": weather,
        "fx": fx,
        "errors": errors,
        "cached_seconds": CACHE_SECONDS,
    }
    if weather or fx:
        _cache["at"] = now
        _cache["payload"] = payload
    return payload
