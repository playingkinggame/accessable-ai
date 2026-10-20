<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# AccessAble AI

Tamil-first voice + grounded RAG assistant. A Vite/React frontend (`src/`) talks to a
FastAPI backend (`backend/`) for documents, chat (SSE), stats, evaluation and LiveKit
voice rooms. No demo data is bundled: every number and answer comes from the API.

## Run it

### 1. Backend (FastAPI + Qdrant)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                # then fill in the keys below
python scripts/make_sample_docs.py                  # needs NOTO_TAMIL_TTF (see .env.example)
uvicorn app.main:app --reload --port 8000
```

### 2. Voice worker (LiveKit agents)

```bash
cd backend
pip install -r requirements-voice.txt
python -m voice_agent.agent download-files
python -m voice_agent.agent dev
```

The worker registers without an `agent_name`, so LiveKit automatically dispatches it to
every room created by `POST /api/voice/token`. Do not rename the data topics
(`folio.sources`, `folio.state`) — the frontend listens for exactly those.

### 3. Frontend (Vite + React)

```bash
npm install
cp .env.example .env        # VITE_API_URL defaults to http://localhost:8000
npm run dev                 # http://localhost:3000
```

`CORS_ORIGINS` on the backend must include `http://localhost:3000`.

### 4. Smoke test

With the backend running:

```bash
bash scripts/smoke.sh      # login -> upload -> list -> chat (SSE) -> stats -> eval
```

## Environment

Frontend (`.env`):

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Base URL of the FastAPI backend (default `http://localhost:8000`). |

Backend (`backend/.env`) — the values you must set:

| Variable | Purpose |
| --- | --- |
| `APP_PASSWORD` | The only credential the app uses (see below). Shipped as `change-me` in `.env.example`. |
| `SECRET_KEY` | HMAC key used to sign the bearer tokens. |
| `AGENT_KEY` | Shared key the voice worker sends as `X-Agent-Key` on agent-only endpoints. |
| `GROQ_API_KEY` | Primary LLM provider (`LLM_PROVIDERS=groq,gemini`). |
| `GOOGLE_API_KEY` | Gemini fallback provider (also used for Google TTS). |
| `LIVEKIT_URL` | LiveKit websocket URL, e.g. `wss://your-project.livekit.cloud`. |
| `LIVEKIT_API_KEY` | LiveKit API key (room creation + token signing). |
| `LIVEKIT_API_SECRET` | LiveKit API secret. |

If `LIVEKIT_URL`/keys are missing, `POST /api/voice/token` returns 503 and the Talk screen
says that voice is not configured instead of pretending to call.

### Where `APP_PASSWORD` is used

`APP_PASSWORD` in `backend/.env` is the only credential in the system:

1. `cp .env.example .env` leaves it as `change-me`, so **`change-me` is the password** until you edit
   `backend/.env`. `scripts/smoke.sh` uses the same default.
2. `POST /api/login` compares it in constant time (`app/auth.py: check_password`) and returns a
   7-day token signed with `SECRET_KEY` (`app/auth.py: make_token`).
3. Every other route runs `require_user`, which demands `Authorization: Bearer <token>`
   (`app/main.py`, dependency `USER`).
4. `GET /api/config` reports `auth_required`, so the frontend opens the sign-in dialog on boot when
   no token is stored; otherwise it waits for a 401, clears the token and opens it again.
5. If `APP_PASSWORD` is empty, authentication is disabled entirely — fine locally, never on a
   public host.
