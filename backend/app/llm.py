"""LLM chain: groq main -> groq fallback -> gemini -> ollama. Only final answer text is returned."""
import asyncio
import logging
import time
from functools import lru_cache

from . import config as C

log = logging.getLogger("folio.llm")


def _text(content) -> str:
    """Final-answer text only. Reasoning/thinking blocks are ignored."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(b if isinstance(b, str) else b.get("text", "")
                       for b in content if isinstance(b, str) or (isinstance(b, dict) and b.get("type") == "text"))
    return ""


class ThinkFilter:
    """Streaming remover for <think>...</think> blocks (some models leak them into content)."""
    O, X = "<think>", "</think>"

    def __init__(self):
        self.buf, self.inside = "", False

    def feed(self, s: str) -> str:
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

    def flush(self) -> str:
        out = "" if self.inside else self.buf
        self.buf = ""
        return out


def _build(kind: str, model: str, effort: str):
    if kind == "groq":
        from langchain_groq import ChatGroq
        return ChatGroq(model=model, api_key=C.GROQ_API_KEY, temperature=0.2,
                        max_retries=0, reasoning_effort=effort)  # VERIFY param name
    if kind == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        kw = dict(model=model, google_api_key=C.GOOGLE_API_KEY, max_retries=0)  # keep default temperature for Gemini 3
        try:
            return ChatGoogleGenerativeAI(thinking_level=C.GEMINI_THINKING_LEVEL, **kw)  # VERIFY param name
        except Exception:
            return ChatGoogleGenerativeAI(**kw)
    from langchain_ollama import ChatOllama
    return ChatOllama(model=model, base_url=C.OLLAMA_BASE_URL, temperature=0.2)


@lru_cache(maxsize=4)
def chain(effort: str = "medium"):
    out, seen = [], set()
    for p in C.LLM_PROVIDERS:
        specs = []
        if p == "groq" and C.GROQ_API_KEY:
            specs = [C.GROQ_MODEL, C.GROQ_FALLBACK_MODEL]
        elif p == "gemini" and C.GOOGLE_API_KEY:
            specs = [C.GEMINI_MODEL]
        elif p == "ollama":
            specs = [C.OLLAMA_MODEL]
        for m in filter(None, specs):
            label = f"{p}:{m}"
            if label in seen:
                continue
            try:
                out.append((label, _build(p, m, effort)))
                seen.add(label)
            except Exception as e:
                log.warning("skipping %s: %s", label, e)
    if not out:
        raise RuntimeError("No LLM provider configured (check LLM_PROVIDERS and keys)")
    return tuple(out)


def labels() -> list[str]:
    try:
        return [l for l, _ in chain(C.REASONING_CHAT)]
    except Exception:
        return []


async def astream(messages, effort: str = "medium", meta: dict | None = None):
    """Yield answer tokens. Falls back to the next model on ANY failure (429, timeout, 5xx, 404 model-not-found, auth)
    as long as no token has been emitted yet."""
    last = None
    for label, model in chain(effort):
        emitted, t0 = False, time.perf_counter()
        it = model.astream(messages).__aiter__()
        flt = ThinkFilter()
        try:
            first = True
            while True:
                try:
                    chunk = await asyncio.wait_for(it.__anext__(), C.LLM_TIMEOUT if first else C.LLM_TIMEOUT * 2)
                except StopAsyncIteration:
                    break
                first = False
                t = flt.feed(_text(chunk.content))
                if t:
                    emitted = True
                    yield t
            tail = flt.flush()
            if tail:
                yield tail
            if meta is not None:
                meta["model"] = label
            log.info("answered by %s in %.0f ms", label, (time.perf_counter() - t0) * 1000)
            return
        except Exception as e:
            last = e
            log.warning("model %s failed (%s: %s)%s", label, type(e).__name__, str(e)[:200],
                        "" if emitted else " -> trying next")
            if emitted:
                raise
        finally:
            aclose = getattr(it, "aclose", None)
            if aclose:
                try:
                    await aclose()
                except Exception:
                    pass
    raise RuntimeError(f"All LLMs failed: {last}")


async def ainvoke_text(messages, effort: str = "low") -> str:
    return "".join([t async for t in astream(messages, effort)]).strip()
