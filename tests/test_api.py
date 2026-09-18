from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_parse_endpoint():
    r = client.post("/api/parse", json={"text": "كهربا 5 أكتوبر 850 جنيه"})
    assert r.status_code == 200
    body = r.json()
    assert body["category"] == "bill"
    assert body["amount"] == 850


def test_parse_empty():
    r = client.post("/api/parse", json={"text": ""})
    assert r.status_code == 422


def test_index_served():
    r = client.get("/")
    assert r.status_code == 200
    assert "Lazem" in r.text
    assert "themes" in r.text


def test_related_endpoint():
    r = client.post(
        "/api/related",
        json={
            "task": {
                "title": "Electricity",
                "raw": "electricity",
                "category": "bill",
                "bill_kind": "electricity",
            },
            "existing": [],
        },
    )
    assert r.status_code == 200
    codes = [i["code"] for i in r.json()["items"]]
    assert "related_water" in codes
    r = client.get("/api/languages")
    assert r.status_code == 200
    codes = {row["code"] for row in r.json()["languages"]}
    assert {"en", "ar", "es", "zh", "hi", "ja", "tr", "ur"} <= codes
