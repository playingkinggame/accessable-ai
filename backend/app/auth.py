import hashlib
import hmac
import time

from fastapi import Header, HTTPException

from . import config as C


def check_password(pw: str) -> bool:
    return bool(C.APP_PASSWORD) and hmac.compare_digest(pw or "", C.APP_PASSWORD)


def _sig(exp: str) -> str:
    return hmac.new(C.SECRET_KEY.encode(), exp.encode(), hashlib.sha256).hexdigest()


def make_token() -> str:
    exp = str(int(time.time()) + 7 * 86400)
    return f"{exp}.{_sig(exp)}"


def _valid(tok: str) -> bool:
    try:
        exp, sig = tok.split(".", 1)
        return int(exp) > time.time() and hmac.compare_digest(sig, _sig(exp))
    except Exception:
        return False


async def require_user(authorization: str = Header(default="")):
    if not C.APP_PASSWORD:  # auth disabled when no password set
        return
    if not _valid(authorization.removeprefix("Bearer ").strip()):
        raise HTTPException(401, "Unauthorized")


async def require_agent(x_agent_key: str = Header(default="")):
    if not C.AGENT_KEY or not hmac.compare_digest(x_agent_key, C.AGENT_KEY):
        raise HTTPException(401, "Bad agent key")
