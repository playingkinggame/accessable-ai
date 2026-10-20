#!/usr/bin/env bash
# End-to-end smoke test against a running AccessAble AI backend.
#   bash scripts/smoke.sh
# Overrides: BASE_URL, APP_PASSWORD, PDF_PATH
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
APP_PASSWORD="${APP_PASSWORD:-change-me}"
PDF_PATH="${PDF_PATH:-backend/sample_docs/farmer_subsidy.pdf}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 1; }
}
need curl
need python

echo "==> health"
curl -fsS "$BASE_URL/api/health" | python -m json.tool

echo "==> login"
TOKEN="$(curl -fsS "$BASE_URL/api/login" \
  -H 'content-type: application/json' \
  -d "{\"password\":\"$APP_PASSWORD\"}" |
  python -c 'import json,sys; print(json.load(sys.stdin)["token"])')"
echo "token acquired (${#TOKEN} chars)"
AUTH="Authorization: Bearer $TOKEN"

if [ ! -f "$PDF_PATH" ]; then
  echo "Sample PDF not found at $PDF_PATH — run: cd backend && python scripts/make_sample_docs.py" >&2
  exit 1
fi

echo "==> upload $PDF_PATH"
curl -fsS -H "$AUTH" -F "file=@$PDF_PATH" "$BASE_URL/api/documents" | python -m json.tool

echo "==> documents"
curl -fsS -H "$AUTH" "$BASE_URL/api/documents" | python -m json.tool

echo "==> chat (first 5 SSE lines)"
curl -fsS -N -H "$AUTH" -H 'content-type: application/json' \
  -d '{"message":"சம்பா நெற்பயிர் காப்பீட்டிற்கு பதிவு செய்ய கடைசி நாள் எப்போது?","language":"ta","doc_ids":[],"chat_id":"smoke-test"}' \
  "$BASE_URL/api/chat" | head -n 5

echo
echo "==> stats"
curl -fsS -H "$AUTH" "$BASE_URL/api/stats" | python -m json.tool

echo "==> eval (may take a minute)"
curl -fsS -X POST -H "$AUTH" "$BASE_URL/api/eval/run" |
  python -c 'import json,sys; r=json.load(sys.stdin); print({k: r[k] for k in ("total","correct","accuracy","avg_latency_ms")})'

echo "Smoke test finished."
