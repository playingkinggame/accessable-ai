# AccessAble AI backend change-set

Drop these files into your Folio repo (same folder layout). Notes:
- `app/store.py` is no longer imported by `app/main.py` (replaced by `rag.py` + `metrics.py`). Keep or delete it.
- Embedding model changed, so the Qdrant collection is renamed `folio_e5`; re-upload documents.
- Nothing here has been executed. Verify the lines marked `# VERIFY` (plugin kwargs) and the Gemini model ID.

## Run
1. pip install -r requirements.txt -r requirements-voice.txt && cp .env.example .env   # fill keys
2. python scripts/make_sample_docs.py        # needs NOTO_TAMIL_TTF (static Noto Sans Tamil TTF)
3. uvicorn app.main:app --port 8000          # single process, no --workers
4. TOKEN=$(curl -s localhost:8000/api/login -H 'content-type: application/json' -d '{"password":"change-me"}' | python -c "import sys,json;print(json.load(sys.stdin)['token'])")
5. curl -H "Authorization: Bearer $TOKEN" -F files=@sample_docs/farmer_subsidy.pdf -F files=@sample_docs/health_advisory.pdf -F files=@sample_docs/student_scholarship.pdf localhost:8000/api/documents
6. curl -N -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"message":"சம்பா காப்பீடு கடைசி நாள் எப்போது?","language":"ta"}' localhost:8000/api/chat
7. python voice_agent/agent.py download-files && python voice_agent/agent.py dev
8. python -m eval.run                        # via HTTP while the API runs
9. python -m eval.run --local                # in-process; stop the API first (Qdrant lock)
10. curl -H "Authorization: Bearer $TOKEN" localhost:8000/api/stats; curl localhost:8000/api/config
