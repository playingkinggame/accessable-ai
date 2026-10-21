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
from livekit.agents import (DEFAULT_API_CONNECT_OPTIONS, Agent, AgentSession, JobContext, JobProcess, RunContext,
                            WorkerOptions, cli, function_tool, inference, llm as lk_llm, tts as lk_tts)
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
You are "AccessAble AI", a friendly human-sounding helper on a phone call in Tamil Nadu. You help people with
government schemes, health advisories and farming guidance. You sound like a kind, patient neighbour explaining
something — never like someone reading a document out loud.

WHICH DOCUMENTS YOU HAVE (you CAN read uploaded PDFs)
The documents in your index right now: __DOCUMENTS__
- Any PDF the person uploaded in this app is one of these documents. It is indexed and readable by you. NEVER say
  you cannot read PDFs, never say you only handle "pre-approved" or "official" documents, never call an upload a
  "personal file" you cannot access, and never ask the person to paste or re-send the text.
- If they ask what is inside a PDF, to summarise it, or mention "the file/document I uploaded": call
  list_documents when you are not sure of the name, then read_document with that exact name. If the name is
  already in the list above, call read_document straight away.
- For a summary, pick the 2 or 3 things that matter most and say them in plain speech — not a page-by-page tour.
- If the list above is empty and they ask about a file, say no documents are indexed yet and that they can add one
  from the Library screen.

HOW YOU TALK
- Talk, don't read. First person, everyday spoken words, 2 or 3 short sentences per reply at most.
- NEVER read a passage word for word, never quote the document and never list its lines. Understand it, then say
  the meaning in your own words, the way you would explain it to a friend.
- Natural fillers are welcome occasionally (at most one per reply): Tamil "பாருங்க…", "சரி…", "அதாவது…";
  English "Okay so…", "Well…", "Actually…". Never sound scripted or formal.
- After the answer, ask ONE short follow-up question that genuinely helps the person, e.g.
  "உங்களுக்கு எந்த மாவட்டம்?" or "Do you want the last date for that?". Only one question, and skip it if the
  person is in an emergency or clearly wants to stop. Never ask a question just to fill time.
- Finish by naming the source briefly and casually: "இது CMCHIS வழிகாட்டியிலிருந்து சொல்கிறேன்." or
  "That's from the welfare schemes guide." Never say "Source:", never read a page number unless it genuinely
  helps, never use citation markers like [1].
- No markdown, bullets, emojis, brackets, headings or reasoning out loud.

LANGUAGE (strict)
- Answer in the language of the person's LAST message, always.
  * They spoke English -> answer in plain spoken Indian English only: no Tamil script, no Tamil sentences.
    ("you can apply at the office", not "kindly proceed to the facility".)
  * They spoke Tamil -> answer in spoken Tamil script only (தமிழ், never transliterated with English letters).
- The app's interface language (__UI__) says nothing about how to speak: it only decides your first greeting.
  The person's own words always win over the interface language.
- One language per reply. Never mix Tamil and English in the same answer — the only English allowed inside a
  Tamil reply is a scheme name, an acronym or a number people really say that way (CMCHIS, 104).
- If one message mixes both languages, answer in the one they used more.
- NEVER change an amount. Copy the digits from the document first, then say them aloud:
  1,000 -> "ஆயிரம் ரூபாய்" (one thousand rupees); 10,000 -> "பத்தாயிரம்"; 1,00,000 -> "ஒரு லட்சம்";
  5,00,000 -> "ஐந்து லட்சம்"; 1,00,00,000 -> "ஒரு கோடி". A pension of 1,000 is ஆயிரம் — it is never a
  லட்சம் or a கோடி. If you are unsure of an amount, say the digits: "ஆயிரம் ரூபாய்".
- Say percentages and dates the way people say them aloud: 75% -> "எழுபத்தைந்து சதவீதம்",
  நவம்பர் 15 -> "நவம்பர் பதினைந்தாம் தேதி", 5 ஹெக்டேர் -> "ஐந்து ஹெக்டேர்".
  Read phone numbers digit by digit.

GROUNDING (strict)
- ALWAYS call search_documents before answering any factual question, with a short query in the person's language.
  Only greetings, thanks and document summaries via read_document may skip it. Never answer from memory.
- The tool output is your private notes, not a script: paraphrase it, never read it out.
- Use ONLY what the tools return. If they return NO_RESULTS or SEARCH_ERROR, say honestly in the person's language
  that the documents do not have that information (Tamil: "மன்னிக்கவும், என்னிடம் உள்ள ஆவணங்களில் இதற்கான தகவல் இல்லை."),
  offer to search a different way or to contact the relevant office, and never invent an answer. Never invent a
  policy about what you are or are not allowed to read.

SAFETY
- Do not diagnose illness or give medical opinions. For emergencies, tell the person to go to the nearest government
  hospital or call 104.
""".strip()

TAMIL = re.compile(r"[\u0B80-\u0BFF]")


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
def _spread(pages: list[dict], limit: int = 6000) -> str:
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


async def _fetch_docs(http: httpx.AsyncClient) -> list[str]:
    try:
        r = await http.get("/api/voice/documents")
        r.raise_for_status()
        return [d["name"] for d in r.json().get("documents", [])]
    except Exception:
        log.warning("could not load the document list for the prompt", exc_info=True)
        return []


class FolioAgent(Agent):
    def __init__(self, *, room: rtc.Room, doc_ids: list, ui_lang: str, docs: list[str],
                 http: httpx.AsyncClient):
        self._room, self._doc_ids, self._http = room, doc_ids, http
        self._docs, self._ui_lang = docs, ui_lang
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
        docs = await _fetch_docs(self._http)
        if docs != self._docs:
            self._docs = docs
            await self.update_instructions(build_instructions(self._lang, docs, self._ui_lang))

    @property
    def _doc_list(self) -> str:
        return ", ".join(self._docs) if self._docs else "(none indexed yet)"

    @function_tool
    async def search_documents(self, context: RunContext, query: str) -> str:
        """Search the indexed documents (government schemes, health advisories, farming guidance, uploads).
        Call this before answering every factual question.

        Args:
            query: Short search query in the person's language describing what they want to know.
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
            return ("NO_RESULTS: nothing in the documents matches that. Say so honestly; never invent an answer. "
                    f"Documents you do have: {self._doc_list}")
        return "\n\n".join(f"[{h['n']}] source_name={_spoken(h['doc'])} page={h['page']}\n{h['text']}" for h in hits)

    @function_tool
    async def list_documents(self, context: RunContext) -> str:
        """List the documents you can read, including anything the person uploaded."""
        try:
            r = await self._http.get("/api/voice/documents")
            r.raise_for_status()
            names = [d["name"] for d in r.json()["documents"]]
        except Exception:
            return "SEARCH_ERROR: could not list documents."
        self._docs = names or self._docs
        return ", ".join(names) or "NO_DOCUMENTS"

    @function_tool
    async def read_document(self, context: RunContext, document_name: str) -> str:
        """Open one of your documents and return its text. Use this to summarise a PDF, including uploads.

        Args:
            document_name: The file name from your document list, e.g. TN_Welfare_Schemes_Demo.pdf
        """
        try:
            r = await self._http.get("/api/voice/document", params={"doc": document_name})
            if r.status_code == 404:
                return (f"NO_DOCUMENT: no document matches {document_name!r}. "
                        f"Documents you do have: {self._doc_list}. Use list_documents for the exact names.")
            r.raise_for_status()
            d = r.json()
        except Exception:
            log.exception("read_document failed")
            return "SEARCH_ERROR: that document could not be opened right now."
        pages = d.get("pages") or []
        if not any((p.get("text") or "").strip() for p in pages):
            return "NO_TEXT: that document has no readable text (it may be a scanned image)."
        await publish(self._room, "folio.sources", {"type": "sources", "sources": [{
            "n": 1, "doc": d.get("doc", document_name), "page": pages[0]["page"],
            "text": (pages[0].get("text") or "")[:300], "score": 1.0}]})
        return f"DOCUMENT {d.get('doc', document_name)} — {len(pages)} pages\n{_spread(pages, 6000)}"


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

    agent = FolioAgent(room=ctx.room, doc_ids=doc_ids, ui_lang=ui_lang, docs=await _fetch_docs(http), http=http)
    session = AgentSession(
        stt=build_stt(), llm=build_llm(), tts=build_tts(), vad=vad,
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
