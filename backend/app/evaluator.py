import asyncio
import json
import math
import re
import time
import unicodedata
from pathlib import Path

from . import config as C, pipeline

_lock = asyncio.Lock()


def _norm(s: str) -> str:
    return re.sub(r"[\s,\-–]+", "", unicodedata.normalize("NFC", s).lower())


def _kw_ok(answer_norm: str, kw: str) -> bool:
    return any(_norm(alt) in answer_norm for alt in kw.split("|"))


async def run_eval() -> dict:
    if _lock.locked():
        raise RuntimeError("Evaluation already running")
    async with _lock:
        questions = json.loads(Path(C.EVAL_QUESTIONS).read_text(encoding="utf-8"))
        items = []
        for q in questions:
            t0, ans, sources = time.perf_counter(), "", []
            try:
                async for ev in pipeline.run_chat(q["question"], [], q.get("lang", "ta"), None, track=False):
                    if ev["type"] == "token":
                        ans += ev["text"]
                    elif ev["type"] == "sources":
                        sources = ev["sources"]
            except Exception as e:
                ans = f"ERROR: {e}"
            lat = int((time.perf_counter() - t0) * 1000)
            doc_ok = bool(sources) and sources[0]["doc"] == q["expected_doc"]
            an = _norm(ans)
            kw_ok = all(_kw_ok(an, k) for k in q["expected_keywords"])
            items.append({"q": q["question"], "answer": ans, "correct": doc_ok and kw_ok,
                          "latency_ms": lat, "sources": sources})
        lats = sorted(i["latency_ms"] for i in items)
        total = len(items)
        correct = sum(i["correct"] for i in items)
        res = {"total": total, "correct": correct, "accuracy": round(correct / total, 3) if total else 0,
               "avg_latency_ms": int(sum(lats) / total) if total else 0,
               "p95_latency_ms": lats[max(0, math.ceil(0.95 * total) - 1)] if total else 0,
               "items": items}
        C.EVAL_RESULTS.write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
        return res


def load_results() -> dict:
    try:
        return json.loads(C.EVAL_RESULTS.read_text(encoding="utf-8"))
    except Exception:
        return {"total": 0, "correct": 0, "accuracy": 0, "avg_latency_ms": 0, "p95_latency_ms": 0, "items": []}
