"""Qdrant (local) + fastembed multilingual-e5. Only the API process opens Qdrant."""
import asyncio
import logging
import re
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastembed import TextEmbedding
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_text_splitters import RecursiveCharacterTextSplitter
from qdrant_client import QdrantClient, models

from . import config as C, llm, loaders

log = logging.getLogger("folio.rag")
_lock = threading.RLock()
_client = None
_embedder = None
TAMIL = re.compile(r"[\u0B80-\u0BFF]")


def client() -> QdrantClient:
    global _client
    with _lock:
        if _client is None:
            _client = QdrantClient(url=C.QDRANT_URL) if C.QDRANT_URL else QdrantClient(path=C.QDRANT_PATH)
        return _client


def embedder() -> TextEmbedding:
    global _embedder
    with _lock:
        if _embedder is None:
            _embedder = TextEmbedding(model_name=C.EMBEDDING_MODEL)
        return _embedder


def embed_passages(texts: list[str]) -> list[list[float]]:
    return [v.tolist() for v in embedder().embed(["passage: " + t for t in texts], batch_size=16)]


def embed_query(q: str) -> list[float]:
    return next(iter(embedder().embed(["query: " + q]))).tolist()


def ensure_collection() -> int:
    dim = len(embed_query("dimension probe"))
    c = client()
    with _lock:
        if c.collection_exists(C.QDRANT_COLLECTION):
            size = c.get_collection(C.QDRANT_COLLECTION).config.params.vectors.size
            if size != dim:
                raise RuntimeError(f"Collection {C.QDRANT_COLLECTION} has dim {size}, model needs {dim}. "
                                   "Change QDRANT_COLLECTION and re-upload documents.")
        else:
            c.create_collection(C.QDRANT_COLLECTION,
                                vectors_config=models.VectorParams(size=dim, distance=models.Distance.COSINE))
    return dim


def _flt(doc_ids):
    if not doc_ids:
        return None
    return models.Filter(must=[models.FieldCondition(key="doc_id", match=models.MatchAny(any=list(doc_ids)))])


def _human_size(num_bytes: int) -> str:
    if num_bytes >= 1024 * 1024:
        return f"{num_bytes / (1024 * 1024):.1f} MB"
    if num_bytes >= 1024:
        return f"{num_bytes / 1024:.0f} KB"
    return f"{num_bytes} B"


def _uploaded_file(doc_id: str) -> Path | None:
    return next(iter(sorted(C.UPLOAD_DIR.glob(f"{doc_id}.*"))), None)


def _scroll(flt=None, payload=True):
    out, offset = [], None
    while True:
        pts, offset = client().scroll(C.QDRANT_COLLECTION, scroll_filter=flt, limit=512, offset=offset,
                                      with_payload=payload, with_vectors=False)
        out += pts
        if offset is None:
            return out


def ingest(path: Path, filename: str, doc_id: str) -> dict:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=C.CHUNK_SIZE, chunk_overlap=C.CHUNK_OVERLAP,
        separators=["\n\n", "\n", "। ", ". ", "? ", "! ", " ", ""])
    chunks = [(page, piece) for page, text in loaders.load_pages(path)
              for piece in splitter.split_text(text) if piece.strip()]
    if not chunks:
        raise ValueError("No extractable text in file")
    pages = max(p for p, _ in chunks)
    size = _human_size(path.stat().st_size)
    uploaded_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    vecs = embed_passages([t for _, t in chunks])
    points = [models.PointStruct(id=str(uuid.uuid4()), vector=v,
                                 payload={"doc_id": doc_id, "doc": filename, "page": p, "idx": i, "text": t,
                                          "pages": pages, "size": size, "uploaded_at": uploaded_at})
              for i, ((p, t), v) in enumerate(zip(chunks, vecs))]
    with _lock:
        client().upsert(C.QDRANT_COLLECTION, points=points)
    return {"id": doc_id, "name": filename, "chunks": len(points),
            "pages": pages, "size": size, "uploaded_at": uploaded_at}


def list_documents() -> list[dict]:
    """Documents with chunk count, max page number, upload size and upload time."""
    docs: dict[str, dict] = {}
    with _lock:
        pts = _scroll(payload=["doc_id", "doc", "page", "pages", "size", "uploaded_at"])
    for p in pts:
        payload = p.payload
        d = docs.setdefault(payload["doc_id"], {
            "id": payload["doc_id"], "name": payload["doc"], "chunks": 0,
            "pages": payload.get("pages") or 0,
            "size": payload.get("size"), "uploaded_at": payload.get("uploaded_at"),
        })
        d["chunks"] += 1
        d["pages"] = max(d["pages"], payload.get("page") or 0)
    for d in docs.values():
        d["pages"] = d["pages"] or None
        if not d["size"]:
            stored = _uploaded_file(d["id"])
            d["size"] = _human_size(stored.stat().st_size) if stored else None
    return sorted(docs.values(), key=lambda d: d["name"])


def delete_document(doc_id: str) -> None:
    with _lock:
        client().delete(C.QDRANT_COLLECTION, points_selector=models.FilterSelector(filter=_flt([doc_id])))
    for f in C.UPLOAD_DIR.glob(f"{doc_id}.*"):
        f.unlink(missing_ok=True)


def get_document(ref: str) -> dict | None:
    """ref = doc_id or filename."""
    match = next((d for d in list_documents() if ref in (d["id"], d["name"])), None)
    if not match:
        return None
    with _lock:
        pts = _scroll(_flt([match["id"]]))
    pts.sort(key=lambda p: p.payload["idx"])
    pages: dict[int, list[str]] = {}
    for p in pts:
        pages.setdefault(p.payload["page"], []).append(p.payload["text"])
    return {"id": match["id"], "doc": match["name"],
            "pages": [{"page": k, "text": "\n".join(v)} for k, v in sorted(pages.items())]}


def search(query: str, doc_ids=None, top_k: int | None = None) -> list[dict]:
    vec = embed_query(query)
    with _lock:
        res = client().query_points(C.QDRANT_COLLECTION, query=vec, limit=top_k or C.TOP_K,
                                    query_filter=_flt(doc_ids), with_payload=True)
    return [{"doc_id": p.payload["doc_id"], "doc": p.payload["doc"], "page": p.payload["page"],
             "text": p.payload["text"], "score": float(p.score)} for p in res.points]


async def translate_query(q: str) -> str:
    target = "English" if TAMIL.search(q) else "Tamil (Tamil script)"
    msgs = [SystemMessage(content=f"Translate the user's search query into {target}. Output ONLY the translation."),
            HumanMessage(content=q)]
    return (await llm.ainvoke_text(msgs, "low")).strip().strip('"')


async def retrieve(query: str, doc_ids=None, top_k: int | None = None) -> list[dict]:
    """Search; if best score < MIN_SCORE translate the query once and retry. Returns only hits >= MIN_SCORE, numbered."""
    hits = await asyncio.to_thread(search, query, doc_ids, top_k)
    best = hits[0]["score"] if hits else 0.0
    if best < C.MIN_SCORE:
        try:
            q2 = await translate_query(query)
            if q2 and q2.lower() != query.strip().lower():
                hits2 = await asyncio.to_thread(search, q2, doc_ids, top_k)
                if hits2 and hits2[0]["score"] > best:
                    log.info("translated retry improved %.3f -> %.3f (%s)", best, hits2[0]["score"], q2)
                    hits = hits2
        except Exception as e:
            log.warning("query translation failed: %s", e)
    hits = [h for h in hits if h["score"] >= C.MIN_SCORE]
    for i, h in enumerate(hits, 1):
        h["n"] = i
    return hits


def stats() -> dict:
    with _lock:
        chunks = client().count(C.QDRANT_COLLECTION, exact=True).count
    return {"documents": len(list_documents()), "chunks": chunks}
