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
- Categories: bill / medicine / health / school / work / errand / note — covering the whole household (kids' school, everyone's health, work deadlines)
- Customizable shortcuts: add your own one-tap quick-adds (e.g. `gym 7am`, `call mom`) — stored locally
- Smart related suggestions per category (e.g. an exam suggests a revision block; a health task suggests hydration)
- Today's-focus ring + streak: a progress ring for what's due today and a completion streak, to keep momentum
- Search across every task, and pin the ones that matter to the top
- Backup & restore: export your inbox to a JSON file and restore it on another device — still no account, still local-first
- Four themes (Classic / Dark / Girly / Simple), a slide-out settings drawer, and a crisp hand-built line-icon set (no image assets)

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

Live: https://marwasayedhashem.github.io/lazem/

On a phone (free): Android Chrome → Install app. iPhone Safari → Add to Home Screen. Store listings need Google’s $25 / Apple’s $99 — see [STORE.md](STORE.md).

```bash
pytest
```

```bash
docker compose up --build
```

## Host it (public demo)

Live app: https://marwasayedhashem.github.io/lazem/

The UI is local-first: each visitor’s inbox lives in **their** browser. GitHub Pages serves the static app; weather and USD/EGP are fetched in the browser. The FastAPI server in this repo is for local runs, tests, and Docker.

Render blueprint (`render.yaml`) is a **free static site** from `./static`. Python web services on new Render accounts are paid.

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
