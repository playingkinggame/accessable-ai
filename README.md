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

#### Voice / TTS

Speech is synthesised by **LiveKit Inference** (`cartesia/sonic-3`), which uses the same
`LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` as the room — no extra TTS key. The
language comes from the room metadata (`ta` or `en`, set by `POST /api/voice/token`), so each
room gets the matching voice from `TTS_VOICE_TA` / `TTS_VOICE_EN`. `edge-tts` is kept only as an
automatic fallback if Inference is unreachable, and Google Cloud TTS is optional: it is used only
when `TTS_PROVIDER=google` (or `auto`) **and** a credentials file exists, otherwise it is skipped
silently instead of failing the worker.

| `TTS_PROVIDER` | Chain |
| --- | --- |
| `inference` (default) | LiveKit Inference → edge-tts |
| `auto` | LiveKit Inference → Google (if credentials) → edge-tts |
| `google` | Google → edge-tts |
| `edge` | edge-tts only |

Exact lines to add to `backend/.env` (voice quality):

```dotenv
STT_LANGUAGE=
TTS_PROVIDER=inference
TTS_MODEL=cartesia/sonic-3
# Copy these IDs from https://play.cartesia.ai/voices (leave blank for the model default)
TTS_VOICE_TA=<cartesia-voice-id-for-tamil>
TTS_VOICE_EN=<cartesia-voice-id-for-indian-english>
EDGE_TTS_VOICE=ta-IN-PallaviNeural
EDGE_TTS_VOICE_EN=en-IN-NeerjaNeural
```

`GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_TTS_VOICE` and `GOOGLE_TTS_VOICE_EN` are no longer part of
`.env.example`. If you still want Google TTS, set `GOOGLE_APPLICATION_CREDENTIALS` to your service
account JSON and (optionally) the two voice names in your own `.env` — without a readable credentials
file the worker just logs and uses the next provider. The persona prompt makes the agent paraphrase
in one or two spoken sentences and name the source conversationally instead of reading passages.

Keep `edge-tts` at **7.3.1 or newer** (`pip install -U "edge-tts>=7.3.1"`): older releases fail the
fallback with a Microsoft `403` WebSocket handshake.

#### Which language the agent speaks

The reply language follows the person, not the UI:

- Whisper runs with `detect_language=True`, so English speech is transcribed as English instead of being
  forced through a Tamil decoder (which used to come back as Tamil script). Set `STT_LANGUAGE=ta` (or `en`)
  to pin it anyway.
- On every final transcript the worker detects Tamil script vs. Latin and rewrites the agent's
  instructions for that turn, so `RIGHT NOW: their last message was in English. Answer in English only.`
  is literally in the prompt. The app's language toggle now only decides the greeting.
- `LanguageRoutingTTS` keeps one TTS chain per language and routes **each sentence** by the script it is
  written in, so an English sentence is never spoken by the Tamil voice mid-call.

#### Reading uploaded PDFs

PDF text is extracted with **PyMuPDF** first and `pypdf` second. `pypdf` maps many Tamil combining marks to
`\x00` (e.g. `த\x00ட்டம்` instead of `திட்டம்`), which corrupted the index and made the agent claim it could
not read the file; PyMuPDF returns clean Unicode. NUL/word-joiner bytes are stripped as a final guard, and a
PDF with no text layer raises a clear "looks like a scanned image, run OCR first" upload error instead of an
empty document.

Documents indexed before this change still hold the old, garbled text. Re-extract them from the originals:

```bash
cd backend && .venv/Scripts/python scripts/reindex.py   # keeps doc ids, names and page numbers
```

At call time the agent's prompt lists every indexed document by name, and `read_document` accepts an
approximate name (exact name, stem or a fuzzy match like "the welfare pdf") and returns up to 6,000
characters spread across all pages — so "summarise the PDF I uploaded" works without a keyword guess.

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
| `GOOGLE_API_KEY` | Gemini fallback LLM provider (not needed for the default TTS). |
| `LIVEKIT_URL` | LiveKit websocket URL, e.g. `wss://your-project.livekit.cloud`. |
| `LIVEKIT_API_KEY` | LiveKit API key (room creation + token signing). |
| `LIVEKIT_API_SECRET` | LiveKit API secret (also authorises LiveKit Inference TTS). |
| `STT_LANGUAGE` | Blank (default) = Whisper auto-detects Tamil/English per utterance; `ta`/`en` pins it. |
| `TTS_PROVIDER` | `inference` (default), `auto`, `google` or `edge` — see Voice / TTS above. |
| `TTS_MODEL` | Inference TTS model, default `cartesia/sonic-3`. |
| `TTS_VOICE_TA` / `TTS_VOICE_EN` | Cartesia voice IDs for Tamil / English rooms; blank uses the model default. |

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
