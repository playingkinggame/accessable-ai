from pathlib import Path


def load_pages(path: Path) -> list[tuple[int, str]]:
    """Return [(page_number, text)]. DOCX/TXT get pseudo-pages of ~3000 chars."""
    ext = path.suffix.lower()
    if ext == ".pdf":
        from pypdf import PdfReader
        return [(i, (p.extract_text() or "").strip())
                for i, p in enumerate(PdfReader(str(path)).pages, 1)]
    if ext == ".docx":
        from docx import Document
        text = "\n".join(p.text for p in Document(str(path)).paragraphs)
    elif ext in (".txt", ".md"):
        text = path.read_text(encoding="utf-8", errors="ignore")
    else:
        raise ValueError(f"Unsupported file type: {ext}")
    return [(i + 1, text[k:k + 3000]) for i, k in enumerate(range(0, len(text), 3000))]
