"""All settings come from the environment."""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()


def _s(k, d=""): return os.getenv(k, d).strip()
def _i(k, d): return int(_s(k, str(d)))
def _f(k, d): return float(_s(k, str(d)))
def _b(k, d): return _s(k, str(d)).lower() in ("1", "true", "yes", "on")
def _l(k, d): return [x.strip() for x in _s(k, d).split(",") if x.strip()]


APP_PASSWORD = _s("APP_PASSWORD")
AGENT_KEY = _s("AGENT_KEY")
SECRET_KEY = _s("SECRET_KEY", "change-me")
CORS_ORIGINS = _l("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")
API_BASE_URL = _s("API_BASE_URL", "http://localhost:8000")

DATA_DIR = Path(_s("DATA_DIR", "./data"))
UPLOAD_DIR = Path(_s("UPLOAD_DIR", str(DATA_DIR / "uploads")))
QDRANT_PATH = _s("QDRANT_PATH", str(DATA_DIR / "qdrant"))
QDRANT_URL = _s("QDRANT_URL")
QDRANT_COLLECTION = _s("QDRANT_COLLECTION", "folio_e5")
for _p in (DATA_DIR, UPLOAD_DIR):
    _p.mkdir(parents=True, exist_ok=True)

LLM_PROVIDERS = [p.lower() for p in _l("LLM_PROVIDERS", "groq,gemini")]
GROQ_API_KEY = _s("GROQ_API_KEY")
GROQ_MODEL = _s("GROQ_MODEL", "openai/gpt-oss-120b")
GROQ_FALLBACK_MODEL = _s("GROQ_FALLBACK_MODEL", "openai/gpt-oss-20b")
GOOGLE_API_KEY = _s("GOOGLE_API_KEY")
GEMINI_MODEL = _s("GEMINI_MODEL", "gemini-3.8-flash")
GEMINI_THINKING_LEVEL = _s("GEMINI_THINKING_LEVEL", "low")
OLLAMA_BASE_URL = _s("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = _s("OLLAMA_MODEL", "qwen2.5:7b")
LLM_TIMEOUT = _f("LLM_TIMEOUT", 25)
REASONING_CHAT = _s("REASONING_CHAT", "medium")
REASONING_VOICE = _s("REASONING_VOICE", "low")

EMBEDDING_MODEL = _s("EMBEDDING_MODEL", "intfloat/multilingual-e5-large")
CHUNK_SIZE = _i("CHUNK_SIZE", 700)
CHUNK_OVERLAP = _i("CHUNK_OVERLAP", 100)
TOP_K = _i("TOP_K", 5)
MIN_SCORE = _f("MIN_SCORE", 0.78)

VOICE_ENABLED = _b("VOICE_ENABLED", True)
LIVEKIT_URL = _s("LIVEKIT_URL")
LIVEKIT_API_KEY = _s("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = _s("LIVEKIT_API_SECRET")

EVAL_QUESTIONS = _s("EVAL_QUESTIONS", "eval/questions.json")
EVAL_RESULTS = DATA_DIR / "eval_results.json"

OFFLINE = LLM_PROVIDERS == ["ollama"]
LANGUAGES = ["ta", "en"]
