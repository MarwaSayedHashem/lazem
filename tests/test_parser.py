from datetime import date

import pytest

from app.parser import classify, parse_amount, parse_due, parse_task, parse_time


def test_electricity_bill_arabic():
    task = parse_task("كهربا 5 أكتوبر 850 جنيه", today=date(2026, 9, 18))
    assert task["category"] == "bill"
    assert task["bill_kind"] == "electricity"
    assert task["amount"] == 850
    assert task["due"] == "2026-10-05"
    assert task["title"] == "Electricity"


def test_water_bill_english():
    task = parse_task("water 12/10 420 EGP", today=date(2026, 9, 18))
    assert task["category"] == "bill"
    assert task["bill_kind"] == "water"
    assert task["amount"] == 420
    assert task["due"] == "2026-10-12"


def test_medicine_tonight():
    task = parse_task("دوا ضغط 9pm", today=date(2026, 9, 18))
    assert task["category"] == "medicine"
    assert task["time"] == "21:00"


def test_errand_grocery():
    task = parse_task("اشتري لبن وعيش من السوق")
    assert task["category"] == "errand"


def test_tomorrow_word():
    assert parse_due("نت بكرة", today=date(2026, 9, 18)) == "2026-09-19"


def test_today_word():
    assert parse_due("today electricity", today=date(2026, 9, 18)) == "2026-09-18"


def test_empty_raises():
    with pytest.raises(ValueError):
        parse_task("  ")


def test_classify_note_fallback():
    assert classify("call the school") == "note"


def test_spanish_electricity():
    task = parse_task("electricidad 5 octubre 80€", today=date(2026, 9, 18))
    assert task["category"] == "bill"
    assert task["bill_kind"] == "electricity"
    assert task["due"] == "2026-10-05"
    assert task["amount"] == 80


def test_french_electricity():
    task = parse_task("électricité 5 octobre 90 EUR", today=date(2026, 9, 18))
    assert task["bill_kind"] == "electricity"
    assert task["due"] == "2026-10-05"


def test_chinese_bill_date():
    task = parse_task("电费 10月5日 850", today=date(2026, 9, 18))
    assert task["bill_kind"] == "electricity"
    assert task["due"] == "2026-10-05"
    assert task["amount"] == 850


def test_japanese_and_korean_dates():
    assert parse_due("電気 10月5日", today=date(2026, 9, 18)) == "2026-10-05"
    assert parse_due("전기 10월 5일", today=date(2026, 9, 18)) == "2026-10-05"


def test_german_strom():
    task = parse_task("Strom 5. Oktober 120€", today=date(2026, 9, 18))
    assert task["bill_kind"] == "electricity"
    assert task["due"] == "2026-10-05"


def test_turkish_and_russian():
    assert parse_task("elektrik 5 Ekim", today=date(2026, 9, 18))["due"] == "2026-10-05"
    assert parse_task("электричество 5 октября", today=date(2026, 9, 18))["due"] == "2026-10-05"


def test_buy_errands_multilingual():
    assert classify("comprar leche") == "errand"
    assert classify("acheter du lait") == "errand"
    assert classify("Milch kaufen") == "errand"
