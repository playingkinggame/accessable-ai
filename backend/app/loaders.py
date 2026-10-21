import re
from pathlib import Path

_NUL = re.compile(r"[\x00\ufeff]")
_BLANKS = re.compile(r"\n{3,}")


def _clean(text: str) -> str:
    """Drop NUL/word-joiner bytes some PDF font subsets emit, and squeeze blank lines."""
    return _BLANKS.sub("\n\n", _NUL.sub("", text or "")).strip()


def _pdf_pages(path: Path) -> list[tuple[int, str]]:
    """PyMuPDF first: it maps Tamil/Latin glyphs back to real Unicode (pypdf turns many
    Tamil combining marks into \\x00), then pypdf as a fallback."""
    try:
        import pymupdf  # type: ignore
    except ImportError:
        pymupdf = None
    if pymupdf is not None:
        try:
            with pymupdf.open(str(path)) as doc:
                return [(i, _clean(page.get_text("text"))) for i, page in enumerate(doc, 1)]
        except Exception:
            pass  # corrupt/encrypted for PyMuPDF -> try pypdf
    from pypdf import PdfReader
    return [(i, _clean(p.extract_text() or "")) for i, p in enumerate(PdfReader(str(path)).pages, 1)]


def load_pages(path: Path) -> list[tuple[int, str]]:
    """Return [(page_number, text)]. DOCX/TXT get pseudo-pages of ~3000 chars."""
    ext = path.suffix.lower()
    if ext == ".pdf":
        pages = _pdf_pages(path)
    elif ext == ".docx":
        from docx import Document
        text = "\n".join(p.text for p in Document(str(path)).paragraphs)
        return [(i + 1, _clean(text[k:k + 3000])) for i, k in enumerate(range(0, len(text), 3000))]
    elif ext in (".txt", ".md"):
        text = path.read_text(encoding="utf-8", errors="ignore")
        return [(i + 1, _clean(text[k:k + 3000])) for i, k in enumerate(range(0, len(text), 3000))]
    else:
        raise ValueError(f"Unsupported file type: {ext}")
    if not any(t.strip() for _, t in pages):
        raise ValueError("no selectable text in this PDF (it looks like a scanned image). "
                         "Run OCR first (e.g. `ocrmypdf in.pdf out.pdf`) and upload the result.")
    return pages
