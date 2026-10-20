import asyncio
import json
import logging
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from . import auth, config as C, evaluator, llm, metrics, pipeline, rag

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("folio")
USER = [Depends(auth.require_user)]
AGENT = [Depends(auth.require_agent)]
ALLOWED = {".pdf", ".docx", ".txt", ".md"}
MAX_BYTES = 25 * 1024 * 1024


@asynccontextmanager
async def lifespan(_):
    await asyncio.to_thread(rag.ensure_collection)  # also warms the embedder
    log.info("LLM chain: %s", llm.labels())
    yield


app = FastAPI(title="AccessAble AI", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=C.CORS_ORIGINS, allow_credentials="*" not in C.CORS_ORIGINS,
                   allow_methods=["*"], allow_headers=["*"])


def _voice_enabled() -> bool:
    return C.VOICE_ENABLED and bool(C.LIVEKIT_URL and C.LIVEKIT_API_KEY and C.LIVEKIT_API_SECRET)


class LoginReq(BaseModel):
    password: str


class ChatReq(BaseModel):
    message: str
    doc_ids: list[str] = Field(default_factory=list)
    language: str = "ta"
    chat_id: str | None = None


class VoiceTokenReq(BaseModel):
    doc_ids: list[str] = Field(default_factory=list)
    language: str = "ta"


class VoiceSearchReq(BaseModel):
    query: str
    doc_ids: list[str] = Field(default_factory=list)


@app.get("/api/config")
async def get_config():
    return {"voice_enabled": _voice_enabled(), "languages": C.LANGUAGES,
            "providers": C.LLM_PROVIDERS, "offline": C.OFFLINE,
            "auth_required": bool(C.APP_PASSWORD)}


@app.post("/api/login")
async def login(req: LoginReq):
    if C.APP_PASSWORD and not auth.check_password(req.password):
        raise HTTPException(401, "Wrong password")
    return {"token": auth.make_token()}


@app.get("/api/health")
async def health():
    return {"status": "ok", "models": llm.labels()}


# ---------- documents ----------
@app.get("/api/documents", dependencies=USER)
async def documents():
    return {"documents": await asyncio.to_thread(rag.list_documents)}


@app.post("/api/documents", dependencies=USER)
async def upload(file: UploadFile | None = File(default=None), files: list[UploadFile] = File(default=[])):
    out = []
    for f in ([file] if file else []) + list(files):
        ext = Path(f.filename or "").suffix.lower()
        if ext not in ALLOWED:
            raise HTTPException(400, f"Unsupported type {ext}")
        data = await f.read()
        if len(data) > MAX_BYTES:
            raise HTTPException(413, "File too large")
        doc_id = uuid.uuid4().hex
        path = C.UPLOAD_DIR / f"{doc_id}{ext}"
        path.write_bytes(data)
        try:
            out.append(await asyncio.to_thread(rag.ingest, path, f.filename, doc_id))
        except Exception as e:
            path.unlink(missing_ok=True)
            raise HTTPException(422, f"{f.filename}: {e}")
    return {"documents": out}


@app.delete("/api/documents/{doc_id}", dependencies=USER)
async def delete_doc(doc_id: str):
    await asyncio.to_thread(rag.delete_document, doc_id)
    return {"deleted": doc_id}


# ---------- chat (SSE) ----------
@app.post("/api/chat", dependencies=USER)
async def chat(req: ChatReq):
    async def gen():
        try:
            async for ev in pipeline.run_chat(req.message, req.doc_ids, req.language, req.chat_id):
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
        except Exception as e:
            log.exception("chat failed")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)[:300]}, ensure_ascii=False)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/solve", dependencies=USER)
async def solve(req: ChatReq):
    ans, sources, ms = "", [], 0
    async for ev in pipeline.run_chat(req.message, req.doc_ids, req.language, req.chat_id):
        if ev["type"] == "token":
            ans += ev["text"]
        elif ev["type"] == "sources":
            sources = ev["sources"]
        elif ev["type"] == "done":
            ms = ev["latency_ms"]
    return {"answer": ans, "sources": sources, "latency_ms": ms}


# ---------- voice ----------
@app.post("/api/voice/token", dependencies=USER)
async def voice_token(req: VoiceTokenReq):
    if not _voice_enabled():
        raise HTTPException(503, "Voice is not configured")
    from livekit import api
    lang = req.language if req.language in C.LANGUAGES else "ta"
    room = f"folio-{uuid.uuid4().hex[:8]}"
    http_url = C.LIVEKIT_URL.replace("wss://", "https://").replace("ws://", "http://")
    lk = api.LiveKitAPI(http_url, C.LIVEKIT_API_KEY, C.LIVEKIT_API_SECRET)
    try:
        await lk.room.create_room(api.CreateRoomRequest(
            name=room, empty_timeout=120, metadata=json.dumps({"language": lang, "doc_ids": req.doc_ids})))
    finally:
        await lk.aclose()
    token = (api.AccessToken(C.LIVEKIT_API_KEY, C.LIVEKIT_API_SECRET)
             .with_identity(f"user-{uuid.uuid4().hex[:6]}").with_name("User")
             .with_grants(api.VideoGrants(room_join=True, room=room, can_publish=True,
                                          can_subscribe=True, can_publish_data=True))
             .to_jwt())
    return {"url": C.LIVEKIT_URL, "token": token, "room": room}


@app.post("/api/voice/search", dependencies=AGENT)
async def voice_search(req: VoiceSearchReq):
    hits = await rag.retrieve(req.query, req.doc_ids)
    return {"found": bool(hits), "hits": [{**h, "score": round(h["score"], 3)} for h in hits]}


@app.get("/api/voice/documents", dependencies=AGENT)
async def voice_documents():
    return {"documents": await asyncio.to_thread(rag.list_documents)}


@app.get("/api/voice/document", dependencies=AGENT)
async def voice_document(doc: str):
    d = await asyncio.to_thread(rag.get_document, doc)
    if not d:
        raise HTTPException(404, "Document not found")
    return d


# ---------- stats / eval ----------
@app.get("/api/stats", dependencies=USER)
async def stats():
    return {**await asyncio.to_thread(rag.stats), **metrics.summary()}


@app.post("/api/eval/run", dependencies=USER)
async def eval_run():
    try:
        return await evaluator.run_eval()
    except RuntimeError as e:
        raise HTTPException(409, str(e))


@app.get("/api/eval/results", dependencies=USER)
async def eval_results():
    return evaluator.load_results()
