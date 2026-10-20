"""AccessAble AI voice worker. Never opens Qdrant: it calls the API with X-Agent-Key."""
import asyncio
import json
import logging
import os
from pathlib import Path
from typing import AsyncIterable

import httpx
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (Agent, AgentSession, JobContext, JobProcess, RunContext, WorkerOptions, cli,
                            function_tool, llm as lk_llm, stt as lk_stt, tts as lk_tts)
from livekit.plugins import google, groq, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

try:
    from .edge_tts_plugin import EdgeTTS
except ImportError:
    from edge_tts_plugin import EdgeTTS

load_dotenv()
log = logging.getLogger("folio.voice")
E = os.getenv
API_BASE = E("API_BASE_URL", "http://localhost:8000")
AGENT_KEY = E("AGENT_KEY", "")
_bg: set = set()

INSTRUCTIONS = """
You are "AccessAble AI", a voice assistant that helps people in Tamil Nadu with government schemes, health advisories
and farming guidance. You answer ONLY from the trusted documents via the search_documents tool.

LANGUAGE AND STYLE
- Always reply in Tamil script (தமிழ்). Use English only for unavoidable names or acronyms.
- Spoken style: 1 to 3 short sentences, each under about 15 words, simple everyday words.
- Never use markdown, bullets, emojis, brackets, or citation markers like [1]. Never read out reasoning.
- Say numbers, money and dates as spoken Tamil words, e.g. ரூ.1,000 -> "ஆயிரம் ரூபாய்", 75% -> "எழுபத்தைந்து சதவீதம்",
  நவம்பர் 15 -> "நவம்பர் பதினைந்தாம் தேதி", 5 ஹெக்டேர் -> "ஐந்து ஹெக்டேர்". Read phone numbers digit by digit in Tamil words.

GROUNDING (strict)
- ALWAYS call search_documents before answering any factual question, with a short query in the user's language.
  Only greetings and thanks may skip it. Never answer from memory.
- Use ONLY what the tool returns. If it returns NO_RESULTS or SEARCH_ERROR, say honestly in Tamil:
  "மன்னிக்கவும், என்னிடம் உள்ள ஆவணங்களில் இதற்கான தகவல் இல்லை." and suggest asking differently or contacting the
  relevant office. NEVER invent an answer.
- End every grounded answer by saying the source aloud: "ஆதாரம்: <source_name>, பக்கம் <page number in Tamil words>".

SAFETY
- Do not diagnose illness. For emergencies, tell the person to go to the nearest government hospital or call 104.
- If the user speaks English, answer in English and end with "Source: <source_name>, page <n>".
""".strip()

GREETING = {"ta": "வணக்கம்! நான் அக்சஸ்எபிள் ஏ.ஐ. அரசுத் திட்டங்கள், சுகாதாரம், விவசாயம் பற்றி என்ன தெரிந்துகொள்ள வேண்டும்?",
            "en": "Hello! I'm AccessAble AI. Ask me about government schemes, health or farming."}


def build_instructions(lang: str) -> str:
    return INSTRUCTIONS + ("\n\nThe user selected English: reply in English." if lang == "en" else "")


def _spoken(doc: str) -> str:
    return Path(doc).stem.replace("_", " ").replace("-", " ")


async def publish(room: rtc.Room, topic: str, payload: dict) -> None:
    try:
        await room.local_participant.publish_data(json.dumps(payload, ensure_ascii=False), reliable=True, topic=topic)
    except Exception:
        log.exception("publish_data(%s) failed", topic)


# ---- strip <think> blocks from text going to TTS (defence in depth; gpt-oss reasoning is a separate field) ----
class _Think:
    O, X = "<think>", "</think>"

    def __init__(self):
        self.buf, self.inside = "", False

    def feed(self, s):
        self.buf += s
        out = ""
        while True:
            if self.inside:
                i = self.buf.find(self.X)
                if i < 0:
                    self.buf = self.buf[-len(self.X):]
                    return out
                self.buf, self.inside = self.buf[i + len(self.X):], False
            else:
                i = self.buf.find(self.O)
                if i >= 0:
                    out += self.buf[:i]
                    self.buf, self.inside = self.buf[i + len(self.O):], True
                    continue
                keep = next((k for k in range(min(len(self.O) - 1, len(self.buf)), 0, -1)
                             if self.O.startswith(self.buf[-k:])), 0)
                out += self.buf[:len(self.buf) - keep]
                self.buf = self.buf[len(self.buf) - keep:]
                return out

    def flush(self):
        out = "" if self.inside else self.buf
        self.buf = ""
        return out


async def strip_reasoning(text: AsyncIterable[str]) -> AsyncIterable[str]:
    f = _Think()
    async for c in text:
        o = f.feed(c)
        if o:
            yield o
    o = f.flush()
    if o:
        yield o


# ---------------- component builders ----------------
def _groq_llm(model: str, effort: str):
    for kw in ({"reasoning_effort": effort}, {"extra_kwargs": {"reasoning_effort": effort}}, {}):  # VERIFY kwarg
        try:
            return groq.LLM(model=model, **kw)
        except TypeError:
            continue
    raise RuntimeError("groq.LLM init failed")


def build_llm():
    effort = E("REASONING_VOICE", "low")
    items = []
    for p in [x.strip().lower() for x in E("LLM_PROVIDERS", "groq,gemini").split(",") if x.strip()]:
        if p == "groq" and E("GROQ_API_KEY"):
            items += [_groq_llm(E("GROQ_MODEL", "openai/gpt-oss-120b"), effort),
                      _groq_llm(E("GROQ_FALLBACK_MODEL", "openai/gpt-oss-20b"), effort)]
        elif p == "gemini" and E("GOOGLE_API_KEY"):
            items.append(google.LLM(model=E("GEMINI_MODEL", "gemini-3.8-flash")))
        elif p == "ollama":
            from livekit.plugins import openai as lk_openai
            items.append(lk_openai.LLM.with_ollama(model=E("OLLAMA_MODEL", "qwen2.5:7b"),
                                                   base_url=E("OLLAMA_BASE_URL", "http://localhost:11434") + "/v1"))
    if not items:
        raise RuntimeError("No LLM configured for the voice worker")
    chain = lk_llm.FallbackAdapter(items, attempt_timeout=15.0, max_retry_per_llm=0)
    chain.on("llm_availability_changed",
             lambda ev: log.warning("LLM %s available=%s", getattr(ev.llm, "model", ev.llm.label), ev.available))
    return chain


def build_stt(lang: str, vad):
    model = E("STT_MODEL", "whisper-large-v3")
    try:
        auto = groq.STT(model=model, detect_language=True)  # VERIFY kwarg
    except TypeError:
        auto = None
        log.warning("groq.STT has no detect_language; auto-detect fallback disabled")
    if lang in ("ta", "en"):
        fixed = groq.STT(model=model, language=lang)
        if auto and E("STT_AUTO_FALLBACK", "true").lower() == "true":
            return lk_stt.FallbackAdapter([fixed, auto], vad=vad)
        return fixed
    return auto or groq.STT(model=model, language="ta")


def build_tts(lang: str):
    ta = lang != "en"
    edge = EdgeTTS(voice=E("EDGE_TTS_VOICE", "ta-IN-PallaviNeural") if ta else E("EDGE_TTS_VOICE_EN", "en-IN-NeerjaNeural"))
    provider = E("TTS_PROVIDER", "auto").lower()
    if provider == "edge":
        return edge
    try:
        g = google.TTS(language="ta-IN" if ta else "en-IN",
                       voice_name=E("GOOGLE_TTS_VOICE", "ta-IN-Wavenet-A") if ta else E("GOOGLE_TTS_VOICE_EN", "en-IN-Wavenet-A"))
    except Exception as e:
        log.warning("Google TTS unavailable (%s) -> edge-tts", e)
        return edge
    return g if provider == "google" else lk_tts.FallbackAdapter([g, edge])


# ---------------- agent ----------------
class FolioAgent(Agent):
    def __init__(self, *, room: rtc.Room, doc_ids: list, language: str, http: httpx.AsyncClient):
        super().__init__(instructions=build_instructions(language))
        self._room, self._doc_ids, self._http = room, doc_ids, http

    @function_tool
    async def search_documents(self, context: RunContext, query: str) -> str:
        """Search the trusted documents (government schemes, health advisories, farming guidance).
        Call this before answering every factual question.

        Args:
            query: Short search query in Tamil or English describing what the user wants to know.
        """
        try:
            r = await self._http.post("/api/voice/search", json={"query": query, "doc_ids": self._doc_ids})
            r.raise_for_status()
            hits = r.json().get("hits", [])
        except Exception:
            log.exception("search_documents failed")
            return "SEARCH_ERROR: documents are unavailable right now. Tell the user honestly; do not guess."
        await publish(self._room, "folio.sources", {"type": "sources", "sources": [
            {"n": h["n"], "doc": h["doc"], "page": h["page"], "text": h["text"][:300], "score": h["score"]}
            for h in hits]})
        if not hits:
            return "NO_RESULTS: nothing relevant in the documents. Say so honestly; never invent an answer."
        return "\n\n".join(f"[{h['n']}] source_name={_spoken(h['doc'])} page={h['page']}\n{h['text']}" for h in hits)

    @function_tool
    async def list_documents(self, context: RunContext) -> str:
        """List the names of the available documents. Use when the user asks what you know about."""
        try:
            r = await self._http.get("/api/voice/documents")
            r.raise_for_status()
            return ", ".join(_spoken(d["name"]) for d in r.json()["documents"]) or "NO_DOCUMENTS"
        except Exception:
            return "SEARCH_ERROR: could not list documents."

    @function_tool
    async def read_document(self, context: RunContext, document_name: str) -> str:
        """Fetch the beginning of one document by its file name, for summaries.

        Args:
            document_name: Exact file name, e.g. farmer_subsidy.pdf
        """
        try:
            r = await self._http.get("/api/voice/document", params={"doc": document_name})
            r.raise_for_status()
            d = r.json()
            return "\n".join(f"page {p['page']}: {p['text']}" for p in d["pages"])[:2500]
        except Exception:
            return "SEARCH_ERROR: document not available."


def prewarm(proc: JobProcess) -> None:
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()  # room metadata is available after connect
    try:
        meta = json.loads(ctx.room.metadata or "{}")
    except Exception:
        meta = {}
    lang = meta.get("language", "ta")
    doc_ids = meta.get("doc_ids", [])
    vad = ctx.proc.userdata["vad"]
    http = httpx.AsyncClient(base_url=API_BASE, headers={"X-Agent-Key": AGENT_KEY}, timeout=20)
    ctx.add_shutdown_callback(http.aclose)

    session = AgentSession(
        stt=build_stt(lang, vad), llm=build_llm(), tts=build_tts(lang), vad=vad,
        turn_detection=MultilingualModel(),
        min_endpointing_delay=0.7,  # Tamil may not be covered by the turn model -> rely on VAD delay
        tts_text_transforms=[strip_reasoning, "filter_markdown", "filter_emoji"],
    )
    states = {"listening": "listening", "thinking": "thinking", "speaking": "speaking",
              "idle": "listening", "initializing": "listening"}

    @session.on("agent_state_changed")
    def _on_state(ev) -> None:
        t = asyncio.create_task(publish(ctx.room, "folio.state", {"state": states.get(ev.new_state, "listening")}))
        _bg.add(t)
        t.add_done_callback(_bg.discard)

    await session.start(agent=FolioAgent(room=ctx.room, doc_ids=doc_ids, language=lang, http=http), room=ctx.room)
    await publish(ctx.room, "folio.state", {"state": "listening"})
    await session.say(GREETING["en" if lang == "en" else "ta"])


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm))
