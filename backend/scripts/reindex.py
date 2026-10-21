"""Re-extract and re-embed every document that is still stored in UPLOAD_DIR.

Run this after upgrading the PDF text extractor (pypdf wrote NUL bytes for Tamil
combining marks; PyMuPDF does not). Doc ids, file names and page numbers are kept,
so links/progress in the UI stay valid.

    cd backend && .venv/Scripts/python scripts/reindex.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from qdrant_client import models  # noqa: E402

from app import rag  # noqa: E402
from app import config as C  # noqa: E402


def _drop_points(doc_id: str) -> None:
    with rag._lock:
        rag.client().delete(C.QDRANT_COLLECTION,
                            points_selector=models.FilterSelector(filter=rag._flt([doc_id])))


def main() -> int:
    docs = rag.list_documents()
    if not docs:
        print("No indexed documents.")
        return 0
    failed = 0
    for d in docs:
        path = rag._uploaded_file(d["id"])
        if path is None:
            print(f"skip  {d['name']}: original file no longer in {C.UPLOAD_DIR}")
            failed += 1
            continue
        try:
            _drop_points(d["id"])
            got = rag.ingest(path, d["name"], d["id"])
            print(f"ok    {got['name']}: {got['chunks']} chunks, {got['pages']} pages")
        except Exception as e:
            failed += 1
            print(f"FAIL  {d['name']}: {e}")
    print(f"\n{len(docs) - failed}/{len(docs)} reindexed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
