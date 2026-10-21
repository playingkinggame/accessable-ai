"""AccessAble AI voice worker. Never opens Qdrant: it calls the API with X-Agent-Key."""
import asyncio
import json
import logging
import os
import re
from pathlib import Path
from typing import AsyncIterable

import httpx
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (DEFAULT_API_CONNECT_OPTIONS, Agent, AgentSession, JobContext, JobProcess,
                            WorkerOptions, cli, inference, llm as lk_llm, tts as lk_tts)
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


def _int_env(name: str, default: int) -> int:
    try:
        return int(E(name) or default)
    except ValueError:
        return default


# Token budget per turn. Groq's free tier is 8k tokens/minute and one request used to ask ~5.2k, so every
# number here is deliberately small: a short answer, three short passages, six turns of history.
MAX_COMPLETION_TOKENS = _int_env("VOICE_MAX_TOKENS", 400)
MAX_PASSAGES = _int_env("VOICE_PASSAGES", 3)
PASSAGE_CHARS = _int_env("VOICE_PASSAGE_CHARS", 400)
DOCUMENT_CHARS = _int_env("VOICE_DOCUMENT_CHARS", 4000)
HISTORY_ITEMS = 2 * _int_env("VOICE_HISTORY_TURNS", 6)  # one user + one assistant item per turn

INSTRUCTIONS = """
You are "AccessAble AI", a warm, human-sounding helper on a phone call in Tamil Nadu. You help people with
government schemes, health advisories and farming guidance. You sound like a kind, patient neighbour explaining
something, never like someone reading a document.

WHAT YOU KNOW
Indexed documents right now: __DOCUMENTS__
- Any PDF the person uploaded in this app is on that list: it is indexed and you can read it. Never say you
  cannot read PDFs, never call an upload a "personal file" you cannot access, and never ask them to paste text.
- For every question the app hands you the relevant passages in a private CONTEXT note just before the turn.
  That note is your only source of facts; you have no tools and no other memory.

ANSWERING (strict)
- Answer ONLY from the private CONTEXT note. If it is empty or says NO_RESULTS, say honestly in the person's
  language that the documents do not have that information, offer another way to ask or the relevant office,
  and never invent facts, amounts, dates or rules.
- Never read the note aloud, never quote a passage word for word, and never mention notes, passages or search.
- Paraphrase in your own words, the way you would tell a friend. 1 to 3 short spoken sentences.
- End by naming the source casually: "இது CMCHIS வழிகாட்டியிலிருந்து சொல்கிறேன்." or "That's from the welfare
  schemes guide." Never say "Source:" and never cite numbers like [1] or a page number unless it truly helps.
- If the CONTEXT is a whole document, give the 2 or 3 things that matter most, not a page-by-page tour.
- At most one natural filler per reply (பாருங்க…, சரி…, Okay so…). Never sound scripted or formal.
- No markdown, bullets, emojis, brackets, headings or reasoning out loud.

LANGUAGE (strict)
- Answer in the language of the person's LAST message, always.
  * They spoke English -> plain spoken Indian English only: no Tamil script, no Tamil sentences.
  * They spoke Tamil -> spoken Tamil script only (தமிழ், never transliterated with English letters).
- One language per reply. Inside a Tamil reply the only English allowed is a scheme name, an acronym or a number
  people really say that way (CMCHIS, 104).
- The interface language (__UI__) only decides your greeting; the person's own words always win.
- NEVER change an amount; copy the digits from the document first, then say them aloud:
  1,000 -> "ஆயிரம் ரூபாய்"; 10,000 -> "பத்தாயிரம்"; 1,00,000 -> "ஒரு லட்சம்"; 5,00,000 -> "ஐந்து லட்சம்";
  1,00,00,000 -> "ஒரு கோடி". If unsure of an amount, say the digits.
- Say percentages, dates and phone numbers the way people say them aloud:
  75% -> "எழுபத்தைந்து சதவீதம்", நவம்பர் 15 -> "நவம்பர் பதினைந்தாம் தேதி". Read phone numbers digit by digit.

SAFETY
- Do not diagnose illness or give medical opinions. In an emergency, send the person to the nearest government
  hospital or tell them to call 104.
""".strip()

NOT_FOUND_NOTE = ("NO_RESULTS: nothing in the indexed documents matches the person's question. Tell them honestly, "
                  "in their own language, that the documents do not have this information; never guess or invent an "
                  "answer. Documents you do have: {docs}")
NO_TEXT_NOTE = ("DOCUMENT {name} has no readable text (it may be a scanned image). Tell the person honestly and "
                "suggest they contact the relevant office.")
UNAVAILABLE_NOTE = ("SEARCH_ERROR: the documents cannot be checked right now. Say honestly that you cannot look at "
                    "them at the moment and that they should try again shortly; never guess.")

TAMIL = re.compile(r"[\u0B80-\u0BFF]")
# "summarise the PDF I uploaded" is handled by fetching that document, not by a search hit.
DOC_HINT = re.compile(r"pdf|document|file|report|upload|ஆவண|கோப்பு|அறிக்கை", re.I)
SUMMARY_HINT = re.compile(r"summar|overview|what'?s (inside|in)|what is (inside|in)|tell me about|read (it|that|this)|"
                          r"explain (it|that|this|the)|சுருக்க|என்ன இருக்கு|என்ன உள்ளது|பற்றி சொல்|சொல்லுங்க", re.I)


def detect_lang(text: str) -> str | None:
    """Tamil script -> ta, Latin letters -> en, otherwise no opinion."""
    text = text or ""
    if TAMIL.search(text):
        return "ta"
    return "en" if re.search(r"[A-Za-z]", text) else None


GREETING = {"ta": "வணக்கம்! நான் அக்சஸ்எபிள் ஏஐ. பாருங்க… அரசு திட்டங்கள், உடல்நலம், விவசாயம் பற்றி எதுவும் கேளுங்க. எதிலிருந்து ஆரம்பிக்கலாம்?",
            "en": "Hi, I'm AccessAble AI. I can help with government schemes, health or farming — what would you like to know?"}


def build_instructions(lang: str | None = None, docs: list[str] | None = None, ui_lang: str = "ta") -> str:
    """`lang` is the language of the person's last message (None before they speak)."""
    text = (INSTRUCTIONS.replace("__DOCUMENTS__", ", ".join(docs) if docs else "(none indexed yet)")
            .replace("__UI__", "Tamil" if ui_lang == "ta" else "English"))
    if lang == "en":
        return text + "\n\nRIGHT NOW: their last message was in English. Answer in English only."
    if lang == "ta":
        return text + "\n\nRIGHT NOW: their last message was in Tamil. Answer in Tamil script only."
    return text + (f"\n\nRIGHT NOW: they have not spoken yet. Greet them once, in "
                   f"{'Tamil' if ui_lang == 'ta' else 'English'}.")


def _spoken(doc: str) -> str:
    return Path(doc).stem.replace("_", " ").replace("-", " ")


def _wants_full_document(text: str) -> bool:
    return bool(DOC_HINT.search(text) and SUMMARY_HINT.search(text))


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
def _groq_llm(model: str) -> lk_llm.LLM:
    """gpt-oss spends reasoning tokens from the same budget as the answer, so keep effort low and the cap small."""
    kw: dict = {"model": model, "max_completion_tokens": MAX_COMPLETION_TOKENS}
    if "gpt-oss" in model.lower():
        kw["reasoning_effort"] = E("REASONING_VOICE", "low")
    for attempt in (kw, {"model": model}):
        try:
            return groq.LLM(**attempt)
        except TypeError:
            continue
    raise RuntimeError(f"groq.LLM init failed for {model}")


def _gemini_llm() -> lk_llm.LLM:
    kw: dict = {"max_output_tokens": MAX_COMPLETION_TOKENS}
    model = (E("GEMINI_MODEL") or "").strip()
    if model:
        kw["model"] = model
    level = (E("GEMINI_THINKING_LEVEL", "low") or "").strip().lower()
    if level and "gemini-3" in model.lower():  # thinking_level exists on 3.x; 2.x takes a token budget instead
        kw["thinking_config"] = {"thinking_level": level}
    return google.LLM(**kw)


def _log_llm_metrics(metrics) -> None:
    """Which model actually answered the turn, and what it cost — the numbers that explain a 429."""
    try:
        log.info("LLM served by %s | prompt=%d completion=%d reasoning=%d | ttft=%.0f ms",
                 metrics.label, metrics.prompt_tokens, metrics.completion_tokens,
                 metrics.reasoning_tokens or 0, max(metrics.ttft, 0.0) * 1000)
    except Exception:
        log.info("LLM metrics: %s", metrics)


class _OrderedFallback(lk_llm.FallbackAdapter):
    """FallbackAdapter retires a model after its first failure: it is marked unavailable and only a background
    recovery probe can bring it back. One Groq 429 therefore parked every later turn on Gemini (5 RPM free
    tier) until that failed too. Retry the configured order on every request instead: a 429 is rejected before
    any prompt tokens are billed, and the primary's quota recovers within seconds."""

    def _llm_order(self) -> list[int]:
        status = getattr(self, "_status", None)
        if isinstance(status, list):
            for entry in status:
                entry.available = True
        try:
            return super()._llm_order()
        except Exception:
            return list(range(len(getattr(self, "_llm_instances", []) or [])))


def build_llm():
    items = []
    providers = [x.strip().lower() for x in (E("LLM_PROVIDERS", "groq,gemini") or "").split(",") if x.strip()]
    for p in ("groq", "gemini", "ollama"):  # fixed order: 120b -> 20b -> gemini
        if p not in providers:
            continue
        if p == "groq" and E("GROQ_API_KEY"):
            items += [_groq_llm(E("GROQ_MODEL", "openai/gpt-oss-120b")),
                      _groq_llm(E("GROQ_FALLBACK_MODEL", "openai/gpt-oss-20b"))]
        elif p == "gemini" and E("GOOGLE_API_KEY"):
            items.append(_gemini_llm())
        elif p == "ollama":
            from livekit.plugins import openai as lk_openai
            items.append(lk_openai.LLM.with_ollama(model=E("OLLAMA_MODEL", "qwen2.5:7b"),
                                                   base_url=E("OLLAMA_BASE_URL", "http://localhost:11434") + "/v1"))
    if not items:
        raise RuntimeError("No LLM configured for the voice worker")
    for child in items:
        child.on("metrics_collected", _log_llm_metrics)
    chain = _OrderedFallback(items, attempt_timeout=15.0, max_retry_per_llm=0)
    log.info("LLM chain: %s", " -> ".join(f"{c.provider}/{c.model}" for c in items))
    return chain


def build_stt():
    """Let Whisper detect the spoken language.

    Pinning it to the app's UI language made English speech come back transliterated into Tamil script,
    which then got a Tamil answer. Detection keeps the transcript in the language actually spoken.
    Set STT_LANGUAGE=ta|en to pin it anyway.
    """
    model = E("STT_MODEL", "whisper-large-v3")
    pinned = (E("STT_LANGUAGE", "") or "").strip()
    if pinned:
        log.info("STT: %s pinned to %s", model, pinned)
        return groq.STT(model=model, language=pinned)
    try:
        return groq.STT(model=model, detect_language=True)
    except TypeError:
        log.warning("groq.STT has no detect_language; pinning Tamil")
        return groq.STT(model=model, language="ta")


def _edge_tts(lang: str) -> lk_tts.TTS:
    voice = ((E("EDGE_TTS_VOICE") or "ta-IN-PallaviNeural") if lang == "ta"
             else (E("EDGE_TTS_VOICE_EN") or "en-IN-NeerjaNeural"))
    return EdgeTTS(voice=voice)


def _inference_tts(lang: str):
    """LiveKit Inference (cartesia/sonic-3 by default). Needs LIVEKIT_API_KEY/SECRET; None if unset."""
    if not (E("LIVEKIT_API_KEY", "").strip() and E("LIVEKIT_API_SECRET", "").strip()):
        log.info("LiveKit Inference TTS skipped: LIVEKIT_API_KEY / LIVEKIT_API_SECRET not set")
        return None
    voice = (E("TTS_VOICE_TA", "") if lang == "ta" else E("TTS_VOICE_EN", "")).strip()
    kwargs = {"language": lang}
    if voice:  # blank -> the model's default voice
        kwargs["voice"] = voice
    try:
        return inference.TTS(model=E("TTS_MODEL") or "cartesia/sonic-3", **kwargs)
    except Exception as e:
        log.info("LiveKit Inference TTS unavailable (%s); falling back", e)
        return None


def _google_tts(lang: str):
    """Optional Google Cloud TTS. Silently skipped when no credentials file is present."""
    cred = E("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    if cred:
        if not Path(cred).expanduser().is_file():
            log.info("Google TTS skipped: credentials file %s not found", cred)
            return None
    else:
        local = Path(__file__).resolve().parent.parent / "gcp-tts.json"
        if not local.is_file():
            log.debug("Google TTS skipped: no gcp-tts.json and no GOOGLE_APPLICATION_CREDENTIALS")
            return None
        os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", str(local))
    voice = ((E("GOOGLE_TTS_VOICE") or "ta-IN-Wavenet-A") if lang == "ta"
             else (E("GOOGLE_TTS_VOICE_EN") or "en-IN-Wavenet-A"))
    try:
        return google.TTS(language="ta-IN" if lang == "ta" else "en-IN", voice_name=voice)
    except Exception as e:
        log.info("Google TTS unavailable (%s); skipping", e)
        return None


def _tts_chain(lang: str) -> lk_tts.TTS:
    edge = _edge_tts(lang)
    provider = (E("TTS_PROVIDER", "inference") or "inference").strip().lower()
    if provider == "edge":
        log.info("TTS[%s]: edge-tts (%s)", lang, "ta-IN" if lang == "ta" else "en-IN")
        return edge
    if provider not in ("inference", "livekit", "google", "auto"):
        log.warning("Unknown TTS_PROVIDER=%r, using inference", provider)
        provider = "inference"

    chain = []
    if provider in ("inference", "livekit", "auto"):
        primary = _inference_tts(lang)
        if primary is not None:
            chain.append(primary)
    if provider in ("google", "auto"):
        chain.append(_google_tts(lang))
    chain = [c for c in chain if c is not None] + [edge]
    if len(chain) == 1:
        log.info("TTS[%s]: edge-tts only (%s)", lang, "ta-IN" if lang == "ta" else "en-IN")
        return edge
    log.info("TTS[%s]: %s -> edge-tts fallback", lang, E("TTS_MODEL") or "cartesia/sonic-3")
    return lk_tts.FallbackAdapter(chain, max_retry_per_tts=1)


class LanguageRoutingTTS(lk_tts.TTS):
    """Speaks each sentence with the voice of the language it is written in.

    The room language used to be fixed when the token was created, so a Tamil room read English replies with a
    Tamil voice. Routing on the text keeps the spoken language in step with the written one, sentence by
    sentence, even when the person switches mid-call.
    """

    def __init__(self, voices: dict[str, lk_tts.TTS], default: str = "ta"):
        self._voices = {k: v for k, v in voices.items() if v is not None}
        self._default = default if default in self._voices else next(iter(self._voices))
        head = self._voices[self._default]
        # Deliberately NOT streaming: routing happens per sentence, so the framework wraps this in a
        # StreamAdapter and calls synthesize() for each sentence of the reply. Advertising the head's
        # streaming=True made AgentSession call stream() here, which is not implemented for a router and
        # killed every turn with "streaming is not supported by this TTS".
        super().__init__(capabilities=lk_tts.TTSCapabilities(streaming=False, aligned_transcript=False),
                         sample_rate=head.sample_rate, num_channels=head.num_channels)
        for lang, voice in self._voices.items():
            if (voice.sample_rate, voice.num_channels) != (head.sample_rate, head.num_channels):
                log.warning("TTS[%s] is %d Hz/%dch but the session runs %d Hz/%dch",
                            lang, voice.sample_rate, voice.num_channels, head.sample_rate, head.num_channels)

    def synthesize(self, text: str, *, conn_options=DEFAULT_API_CONNECT_OPTIONS) -> lk_tts.ChunkedStream:
        lang = detect_lang(text) or self._default
        return (self._voices.get(lang) or self._voices[self._default]).synthesize(text, conn_options=conn_options)

    def stream(self, *, conn_options=DEFAULT_API_CONNECT_OPTIONS) -> lk_tts.SynthesizeStream:
        """Safety net: if a caller ignores `capabilities.streaming`, split sentences and route each one."""
        from livekit.agents import tokenize
        adapter = lk_tts.StreamAdapter(
            tts=self,
            sentence_tokenizer=tokenize.blingfire.SentenceTokenizer(retain_format=True,
                                                                    xml_aware=False))
        return adapter.stream(conn_options=conn_options)


def build_tts():
    """One voice per language, routed by the reply text."""
    return LanguageRoutingTTS({lang: _tts_chain(lang) for lang in ("ta", "en")})


# ---------------- agent ----------------
def _spread(pages: list[dict], limit: int = 4000) -> str:
    """Text from every page, trimmed evenly so a long PDF still has its last pages represented."""
    total = sum(len(p.get("text") or "") for p in pages)
    if total <= limit:
        return "\n".join(f"page {p['page']}: {p.get('text', '')}" for p in pages)
    budget = max(250, limit // max(len(pages), 1))
    out = []
    for p in pages:
        t = (p.get("text") or "").strip()
        out.append(f"page {p['page']}: {t[:budget]}{'…' if len(t) > budget else ''}")
    return "\n".join(out)


async def _fetch_docs(http: httpx.AsyncClient) -> tuple[list[str], str | None]:
    """Names for the prompt, plus the most recent upload ("the PDF I uploaded")."""
    try:
        r = await http.get("/api/voice/documents")
        r.raise_for_status()
        docs = r.json().get("documents", [])
        latest = max(docs, key=lambda d: d.get("uploaded_at") or "").get("name") if docs else None
        return [d["name"] for d in docs], latest
    except Exception:
        log.warning("could not load the document list for the prompt", exc_info=True)
        return [], None


def _strip_tool_items(ctx: lk_llm.ChatContext) -> None:
    """Rewrite any tool item as plain text.

    This agent has no tools, so history never contains a call. If a stale item ever appears, Gemini 3.x must not
    see it: it answers another provider's function-call history with 400 "missing a thought_signature".
    """
    kept = []
    changed = False
    for item in list(ctx.items):
        if isinstance(item, lk_llm.ChatMessage):
            kept.append(item)
            continue
        changed = True
        if isinstance(item, lk_llm.FunctionCall):
            args = item.arguments
            if not isinstance(args, str):
                args = json.dumps(args or {}, ensure_ascii=False)
            kept.append(lk_llm.ChatMessage(role="assistant",
                                           content=[f"(earlier lookup: {item.name} {args or '{}'})"]))
        elif isinstance(item, lk_llm.FunctionCallOutput):
            kept.append(lk_llm.ChatMessage(role="assistant",
                                           content=[f"(earlier lookup result: {item.output or ''})"]))
    if changed:
        ctx.items[:] = kept
        log.warning("flattened tool history to plain text before the LLM request")


def _context_note(hits: list[dict]) -> str:
    body = "\n\n".join(f"[{h['n']}] source_name={_spoken(h['doc'])} page={h['page']}\n"
                       f"{(h.get('text') or '')[:PASSAGE_CHARS]}" for h in hits)
    return ("CONTEXT from the indexed documents — the only facts you may use, never read aloud:\n" + body)


class FolioAgent(Agent):
    def __init__(self, *, room: rtc.Room, doc_ids: list, ui_lang: str, docs: list[str],
                 latest: str | None, http: httpx.AsyncClient):
        self._room, self._doc_ids, self._http = room, doc_ids, http
        self._docs, self._latest, self._ui_lang = docs, latest, ui_lang
        self._lang: str | None = None
        super().__init__(instructions=build_instructions(None, docs, ui_lang))

    @property
    def language(self) -> str | None:
        return self._lang

    async def set_language(self, lang: str) -> None:
        """Follow the language the person actually speaks instead of the one the app was opened in."""
        if lang == self._lang:
            return
        self._lang = lang
        await self.update_instructions(build_instructions(lang, self._docs, self._ui_lang))
        log.info("conversation language -> %s", lang)

    async def refresh_documents(self) -> None:
        docs, latest = await _fetch_docs(self._http)
        if docs != self._docs:
            self._docs, self._latest = docs, latest
            await self.update_instructions(build_instructions(self._lang, docs, self._ui_lang))

    @property
    def _doc_list(self) -> str:
        return ", ".join(self._docs) if self._docs else "(none indexed yet)"

    # ---- retrieval-first: the app fetches context, the model never calls a tool ----
    async def on_user_turn_completed(self, turn_ctx: lk_llm.ChatContext, new_message: lk_llm.ChatMessage) -> None:
        """Inject the passages this turn needs instead of exposing a search tool.

        No tool call ever reaches the model, so a Groq -> Gemini fallback can never hand Gemini a function-call
        history, and one user turn costs exactly one LLM request.
        """
        text = (new_message.text_content or "").strip()
        if not text:
            return
        turn_ctx.truncate(max_items=HISTORY_ITEMS)  # last 6 turns only
        _strip_tool_items(turn_ctx)
        try:
            if _wants_full_document(text) and (name := self._pick_document(text)):
                if await self._inject_document(turn_ctx, name):
                    return
            hits = await self._search(text)
            if hits is None:
                turn_ctx.add_message(role="assistant", content=UNAVAILABLE_NOTE)
                return
            await publish(self._room, "folio.sources", {
                "type": "sources",
                "sources": [{"n": h["n"], "doc": h["doc"], "page": h["page"],
                             "text": h["text"][:300], "score": h["score"]} for h in hits]})
            if hits:
                turn_ctx.add_message(role="assistant", content=_context_note(hits))
            else:
                turn_ctx.add_message(role="assistant",
                                     content=NOT_FOUND_NOTE.format(docs=self._doc_list))
        except Exception:
            log.exception("context injection failed")
            turn_ctx.add_message(role="assistant", content=UNAVAILABLE_NOTE)

    async def _search(self, text: str) -> list[dict] | None:
        """Top MAX_PASSAGES hits, or None when the documents cannot be reached."""
        try:
            r = await self._http.post("/api/voice/search", json={"query": text, "doc_ids": self._doc_ids})
            r.raise_for_status()
            return (r.json().get("hits") or [])[:MAX_PASSAGES]
        except Exception:
            log.exception("voice search failed")
            return None

    def _pick_document(self, text: str) -> str | None:
        """The document the person means: named, or the one they just uploaded."""
        low = text.lower()
        for name in self._docs:
            stem = Path(name).stem.lower().replace("_", " ").replace("-", " ")
            if name.lower() in low or stem in low:
                return name
        words = {w for w in re.split(r"[^a-z0-9\u0b80-\u0bff]+", low) if len(w) > 3}
        best, score = None, 0
        for name in self._docs:
            name_words = {w for w in re.split(r"[^a-z0-9\u0b80-\u0bff]+", Path(name).stem.lower()) if len(w) > 3}
            hit = len(words & name_words)
            if hit > score:
                best, score = name, hit
        if best:
            return best
        if self._latest and re.search(r"upload|பதிவேற்ற", low):
            return self._latest
        return self._docs[0] if len(self._docs) == 1 else None

    async def _inject_document(self, turn_ctx: lk_llm.ChatContext, name: str) -> bool:
        try:
            r = await self._http.get("/api/voice/document", params={"doc": name})
            r.raise_for_status()
            d = r.json()
        except Exception:
            log.warning("document fetch failed for %r", name, exc_info=True)
            return False
        pages = [p for p in d.get("pages") or [] if (p.get("text") or "").strip()]
        if not pages:
            turn_ctx.add_message(role="assistant", content=NO_TEXT_NOTE.format(name=name))
            return True
        await publish(self._room, "folio.sources", {"type": "sources", "sources": [{
            "n": 1, "doc": d.get("doc") or name, "page": pages[0]["page"],
            "text": (pages[0].get("text") or "")[:300], "score": 1.0}]})
        turn_ctx.add_message(role="assistant", content=(
            f"DOCUMENT {d.get('doc') or name} — {len(pages)} pages (private notes; never read aloud):\n"
            f"{_spread(pages, DOCUMENT_CHARS)}\n\n"
            "Summarise the 2 or 3 things that matter most for this person, in 1-3 spoken sentences, "
            "then name the document."))
        return True


def prewarm(proc: JobProcess) -> None:
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()  # room metadata is available after connect
    try:
        meta = json.loads(ctx.room.metadata or "{}")
    except Exception:
        meta = {}
    ui_lang = meta.get("language", "ta") if meta.get("language") in ("ta", "en") else "ta"
    doc_ids = meta.get("doc_ids", [])
    vad = ctx.proc.userdata["vad"]
    http = httpx.AsyncClient(base_url=API_BASE, headers={"X-Agent-Key": AGENT_KEY}, timeout=20)
    ctx.add_shutdown_callback(http.aclose)

    docs, latest = await _fetch_docs(http)
    agent = FolioAgent(room=ctx.room, doc_ids=doc_ids, ui_lang=ui_lang, docs=docs, latest=latest, http=http)
    session = AgentSession(
        stt=build_stt(), llm=build_llm(), tts=build_tts(), vad=vad,
        tts_text_transforms=[strip_reasoning, "filter_markdown", "filter_emoji"],
        turn_handling={
            "turn_detection": MultilingualModel(),
            # Tamil is not covered by the turn model, so end-of-turn comes from the VAD delay.
            "endpointing": {"min_delay": 0.7},
            # One user turn must cost exactly one LLM request: speculation doubles the prompt tokens and is
            # discarded anyway whenever on_user_turn_completed injects context.
            "preemptive_generation": {"enabled": False},
        },
    )
    states = {"listening": "listening", "thinking": "thinking", "speaking": "speaking",
              "idle": "listening", "initializing": "listening"}

    @session.on("agent_state_changed")
    def _on_state(ev) -> None:
        t = asyncio.create_task(publish(ctx.room, "folio.state", {"state": states.get(ev.new_state, "listening")}))
        _bg.add(t)
        t.add_done_callback(_bg.discard)

    @session.on("user_input_transcribed")
    def _on_transcript(ev) -> None:
        # The person's own words decide the reply language, not the language the app is set to.
        if not ev.is_final:
            return
        lang = detect_lang(ev.transcript)
        if lang and lang != agent.language:
            t = asyncio.create_task(agent.set_language(lang))
            _bg.add(t)
            t.add_done_callback(_bg.discard)

    await session.start(agent=agent, room=ctx.room)
    await publish(ctx.room, "folio.state", {"state": "listening"})
    await session.say(GREETING["en" if ui_lang == "en" else "ta"])


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm))
