"""Shared RAG answer pipeline used by /api/chat, /api/solve and eval."""
import time

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from . import llm, metrics, rag, config as C

LANG = {"ta": "Tamil (தமிழ்), written in Tamil script", "en": "English"}
NOT_FOUND = {
    "ta": "மன்னிக்கவும், நம்பகமான ஆவணங்களில் இதற்கான தகவல் கிடைக்கவில்லை. வேறு விதமாகக் கேட்கவும் அல்லது தொடர்புடைய அலுவலகத்தை அணுகவும்.",
    "en": "Sorry, I could not find this in the trusted documents. Please rephrase or contact the relevant office.",
}
SYSTEM = (
    "You are AccessAble AI, a careful assistant that answers ONLY from the numbered CONTEXT passages "
    "taken from trusted documents.\n"
    "- Reply in {lang}.\n"
    "- Put the source marker, e.g. [1], right after each fact you use.\n"
    "- If the CONTEXT does not contain the answer, say so plainly. Never guess or add outside facts.\n"
    "- Keep amounts, dates, percentages and phone numbers exactly as written in the context.\n"
    "- Be brief: at most 5 short sentences, simple words, no tables."
)


def ui_source(h: dict) -> dict:
    return {"n": h["n"], "doc": h["doc"], "page": h["page"], "text": h["text"][:400], "score": round(h["score"], 3)}


def _context(hits) -> str:
    return "\n\n".join(f"[{h['n']}] ({h['doc']}, page {h['page']})\n{h['text']}" for h in hits)


async def run_chat(message: str, doc_ids, language: str, chat_id, track: bool = True):
    t0 = time.perf_counter()
    lang = language if language in C.LANGUAGES else "ta"
    hits = await rag.retrieve(message, doc_ids)
    answer, meta = "", {}
    if not hits:
        answer = NOT_FOUND[lang]
        yield {"type": "token", "text": answer}
    else:
        msgs = [SystemMessage(content=SYSTEM.format(lang=LANG[lang]))]
        for q, a in metrics.history(chat_id):
            msgs += [HumanMessage(content=q), AIMessage(content=a)]
        msgs.append(HumanMessage(content=f"CONTEXT:\n{_context(hits)}\n\nQUESTION: {message}"))
        async for tok in llm.astream(msgs, C.REASONING_CHAT, meta):
            answer += tok
            yield {"type": "token", "text": tok}
    yield {"type": "sources", "sources": [ui_source(h) for h in hits]}
    ms = int((time.perf_counter() - t0) * 1000)
    if track:
        metrics.record(ms)
        metrics.remember(chat_id, message, answer)
    yield {"type": "done", "latency_ms": ms, "model": meta.get("model")}
