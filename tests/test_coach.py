from datetime import datetime
from zoneinfo import ZoneInfo

from app.coach import plan_day, related_suggestions

CAIRO = ZoneInfo("Africa/Cairo")


def test_electricity_suggests_water():
    items = related_suggestions(
        {"bill_kind": "electricity", "category": "bill"},
        [],
    )
    codes = [i["code"] for i in items]
    assert "related_water" in codes
    assert "related_gas" in codes


def test_no_duplicate_related_bill():
    items = related_suggestions(
        {"bill_kind": "electricity", "category": "bill"},
        [{"bill_kind": "water", "done": False}],
    )
    codes = [i["code"] for i in items]
    assert "related_water" not in codes


def test_overdue_outranks_weather():
    plan = plan_day(
        {"name": "Marwa", "work": "remote", "watch_fx": False},
        [{"title": "Electricity", "due": "2026-09-01", "done": False}],
        {"weather": {"temp_c": 33, "code": 1}, "fx": {"usd_egp": 48}},
        now=datetime(2026, 9, 18, 10, 0, tzinfo=CAIRO),
    )
    assert plan["headline"] == "headline_overdue"
    assert plan["items"][0]["code"] == "overdue_first"


def test_friday_and_heat_remote():
    plan = plan_day(
        {"name": "Marwa", "work": "remote", "household": "self"},
        [],
        {"weather": {"temp_c": 34, "code": 1}, "fx": {"usd_egp": 52}},
        now=datetime(2026, 9, 18, 13, 0, tzinfo=CAIRO),  # Friday
    )
    codes = [i["code"] for i in plan["items"]]
    assert "friday_cairo" in codes
    assert "heat_remote" in codes
    assert plan["headline"] in {"headline_friday", "headline_heat"}


def test_family_school_run_weekday_morning():
    plan = plan_day(
        {"name": "Marwa", "household": "family", "work": "commute"},
        [],
        {"weather": {"temp_c": 28, "code": 1}, "fx": {}},
        now=datetime(2026, 9, 16, 7, 30, tzinfo=CAIRO),  # Wednesday
    )
    codes = [i["code"] for i in plan["items"]]
    assert "school_run" in codes


def test_one_trip_when_two_errands():
    plan = plan_day(
        {"name": "Marwa", "work": "remote"},
        [
            {"title": "buy milk", "category": "errand", "done": False, "due": "2026-09-16"},
            {"title": "buy bread", "category": "errand", "done": False, "due": "2026-09-16"},
        ],
        {"weather": {"temp_c": 24, "code": 1}, "fx": {}},
        now=datetime(2026, 9, 16, 11, 0, tzinfo=CAIRO),
    )
    assert any(i["code"] == "one_trip" for i in plan["items"])


def test_empty_inbox_offers_start():
    plan = plan_day(
        {"name": "Marwa", "work": "remote"},
        [],
        {"weather": {"temp_c": 24, "code": 1}, "fx": {}},
        now=datetime(2026, 9, 16, 11, 0, tzinfo=CAIRO),
    )
    assert any(i["code"] == "empty_start" for i in plan["items"])
    assert plan["next"] and plan["next"]["add"]


def test_dollar_watch():
    plan = plan_day(
        {"name": "Marwa", "watch_fx": True, "work": "remote"},
        [],
        {"weather": {"temp_c": 24, "code": 1}, "fx": {"usd_egp": 52.1}},
        now=datetime(2026, 9, 16, 11, 0, tzinfo=CAIRO),
    )
    assert any(i["code"] == "dollar_high" for i in plan["items"])


def test_next_is_overdue_when_nothing_to_add():
    plan = plan_day(
        {"name": "Marwa", "work": "remote"},
        [{"title": "Electricity", "due": "2026-09-01", "done": False, "category": "bill"}],
        {"weather": {"temp_c": 24, "code": 1}, "fx": {}},
        now=datetime(2026, 9, 16, 11, 0, tzinfo=CAIRO),
    )
    assert plan["next"]["code"] == "overdue_first"
    assert plan["slot"] == "afternoon"


def test_humid_heat_and_night_slot():
    humid = plan_day(
        {"name": "Marwa", "work": "remote"},
        [],
        {"weather": {"temp_c": 34, "humidity": 70, "code": 1}, "fx": {}},
        now=datetime(2026, 9, 16, 13, 0, tzinfo=CAIRO),
    )
    codes = [i["code"] for i in humid["items"]]
    assert "heat_humid" in codes
    assert "heat_remote" not in codes
    night = plan_day(
        {"name": "Marwa", "work": "remote"},
        [],
        {"weather": {"temp_c": 28, "code": 1}, "fx": {}},
        now=datetime(2026, 9, 16, 22, 0, tzinfo=CAIRO),
    )
    assert night["slot"] == "night"
    assert night["headline"] == "headline_night"
    assert any(i["code"] == "tonight_quiet" for i in night["items"])
