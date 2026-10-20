import json
import threading
from collections import OrderedDict

from . import config as C

_lock = threading.Lock()
_F = C.DATA_DIR / "metrics.json"
try:
    _state = json.loads(_F.read_text())
except Exception:
    _state = {"n": 0, "sum_ms": 0}
_hist: "OrderedDict[str, list]" = OrderedDict()


def record(ms: int) -> None:
    with _lock:
        _state["n"] = int(_state.get("n", 0)) + 1
        _state["sum_ms"] = int(_state.get("sum_ms", 0)) + ms
        _F.write_text(json.dumps(_state))


def summary() -> dict:
    n = int(_state.get("n", 0))
    return {"questions_answered": n,
            "avg_latency_ms": int(int(_state.get("sum_ms", 0)) / n) if n else 0}


def history(chat_id):
    return list(_hist.get(chat_id, [])) if chat_id else []


def remember(chat_id, q: str, a: str) -> None:
    if not chat_id:
        return
    h = _hist.setdefault(chat_id, [])
    h.append((q, a[:1500]))
    del h[:-6]
    while len(_hist) > 200:
        _hist.popitem(last=False)
