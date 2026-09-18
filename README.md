# Lazem (لازم)

A one-line household inbox for Cairo: bills, medicine, groceries.

Type `electricity 5 Oct 850 EGP` or `كهربا 5 أكتوبر 850 جنيه` or `电费 10月5日 850`. It becomes a bill with a due date and an amount. Nothing is uploaded.

Built as a small FastAPI service plus a local-first web UI. The parser is a lexicon over 20 popular languages — not an LLM.

## Why this exists

Household admin lives in chat screenshots and “I’ll remember”. That fails at the end of the month. Lazem files the day: one input, Cairo weather, USD/EGP, overdue in red.

## What it does

- Parses household notes in 20 languages (`app/lexicon.py` + `app/parser.py`, unit-tested)
- UI: English, Spanish, Chinese, Hindi, Arabic, French, Portuguese, Russian, Bengali, Indonesian, German, Japanese, Turkish, Korean, Italian, Vietnamese, Polish, Dutch, Urdu, Persian — RTL where it belongs, browser language on first visit
- Cairo briefing: Open-Meteo weather + USD/EGP (15-minute cache, never 500s if a feed dies)
- Local-first: no account
- Categories: bill / medicine / errand / note

## Stack

| Layer | Choice |
|---|---|
| API | FastAPI |
| Validation | Pydantic v2 |
| HTTP client | httpx |
| UI | static HTML/CSS/JS (no SPA framework) |
| Tests | pytest + TestClient |

## Run

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8766
```

Open http://127.0.0.1:8766

```bash
pytest
```

```bash
docker compose up --build
```

## Host it (public demo)

The UI stays local-first: each visitor’s inbox lives in **their** browser. The server only parses notes and fetches Cairo weather / USD-EGP.

1. Push this repo to GitHub (`MarwaSayedHashem/lazem`).
2. On [Render](https://render.com) (free web service): New → Blueprint → this repo, or New Web Service → Python → start command from the Procfile.
3. Health check: `/api/health`. Open the `onrender.com` URL.

Same start command works on Railway or Fly if you prefer those.

## API

| Method | Path | Description |
|---|---|---|
| GET | `/` | App |
| GET | `/api/languages` | UI language list |
| GET | `/api/health` | Liveness |
| GET | `/api/briefing` | Cairo weather + USD/EGP |
| POST | `/api/parse` | `{ "text": "كهربا 5 أكتوبر 850 جنيه" }` → structured task |

## Architecture

```
app/lexicon.py    # 20-language bills, dates, errands
app/parser.py     # no I/O — classify, amount, due date, time of day
app/briefing.py   # public feeds, in-memory cache
app/main.py       # HTTP + static files
static/           # the phone UI
tests/            # parser + API
```

## License

MIT.
