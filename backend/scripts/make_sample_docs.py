#!/usr/bin/env python
"""Generate 3 Tamil demo PDFs into ./sample_docs. Needs a STATIC Noto Sans Tamil TTF (not the variable font).
Set NOTO_TAMIL_TTF or place it at assets/fonts/NotoSansTamil-Regular.ttf (Linux: apt install fonts-noto-core)."""
import os
import sys
import unicodedata
from pathlib import Path

from pypdf import PdfReader
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer

OUT = Path("sample_docs")
NOTE = "(செயல்விளக்கத்திற்கான மாதிரி ஆவணம் – தமிழ்நாடு)"

DOCS = [
    {"file": "farmer_subsidy.pdf", "title": "உழவர் நுண்ணீர்ப் பாசன மானியத் திட்டம்", "probes": ["மானியம்", "சிட்டா"],
     "pages": [
         ["சிறு மற்றும் குறு விவசாயிகளுக்குச் சொட்டு நீர்ப் பாசனக் கருவிகள் வாங்க 100 சதவீதம் மானியம் வழங்கப்படும்.",
          "மற்ற விவசாயிகளுக்கு 75 சதவீதம் மானியம் வழங்கப்படும்.",
          "ஒரு விவசாயிக்கு அதிகபட்சம் 5 ஹெக்டேர் நிலத்திற்கு மட்டுமே மானியம் கிடைக்கும்.",
          "விண்ணப்பத்தை வட்டார வேளாண்மை உதவி இயக்குநர் அலுவலகத்தில் அல்லது உழவன் செயலி மூலம் சமர்ப்பிக்கலாம்."],
         ["தேவையான ஆவணங்கள்: சிட்டா, அடங்கல், ஆதார் அட்டை, வங்கிக் கணக்குப் புத்தகம், புகைப்படம்.",
          "சம்பா நெற்பயிர்க் காப்பீட்டிற்குப் பதிவு செய்ய கடைசி நாள் நவம்பர் 15.",
          "விவசாயிகள் உதவி எண்: 1800-425-1111."]]},
    {"file": "health_advisory.pdf", "title": "டெங்கு காய்ச்சல் தடுப்பு – சுகாதார அறிவுரை", "probes": ["கொசு", "நிலவேம்பு"],
     "pages": [
         ["டெங்கு காய்ச்சலைப் பரப்பும் ஏடிஸ் கொசு, தேங்கி நிற்கும் சுத்தமான நீரில் முட்டையிடும்.",
          "வீடுகளில் உள்ள தண்ணீர்த் தொட்டிகள், பீப்பாய்கள், பழைய டயர்கள், உடைந்த பானைகளில் நீர் தேங்காமல் ஒவ்வொரு வாரமும் காலி செய்து உலர வைக்க வேண்டும்.",
          "அறிகுறிகள்: அதிகக் காய்ச்சல், கடுமையான தலைவலி, கண்களுக்குப் பின்னால் வலி, மூட்டு வலி, உடலில் தடிப்புகள்."],
         ["காய்ச்சல் இரண்டு நாட்களுக்கு மேல் நீடித்தால் உடனே அரசு மருத்துவமனைக்குச் செல்ல வேண்டும்.",
          "காய்ச்சலுக்குப் பாராசிட்டமால் மாத்திரை மட்டும் எடுத்துக்கொள்ளவும். ஆஸ்பிரின் மற்றும் ஐபுப்ரோஃபென் மாத்திரைகளைத் தவிர்க்கவும்.",
          "நிலவேம்புக் குடிநீர் அரசு ஆரம்ப சுகாதார நிலையங்களில் இலவசமாக வழங்கப்படும்.",
          "சுகாதார உதவி எண்: 104."]]},
    {"file": "student_scholarship.pdf", "title": "மாணவர் உயர்கல்வி உதவித்தொகைத் திட்டம்", "probes": ["உதவித்தொகை", "வருமானம்"],
     "pages": [
         ["குடும்ப ஆண்டு வருமானம் ரூ.2,50,000-க்குக் குறைவாக உள்ள மாணவர்கள் இத்திட்டத்திற்குத் தகுதியானவர்கள்.",
          "அரசுப் பள்ளியில் 12-ஆம் வகுப்பு முடித்து, கல்லூரியில் சேர்ந்த மாணவர்களுக்கு மாதம் ரூ.1,000 உதவித்தொகை வழங்கப்படும்.",
          "உதவித்தொகை நேரடியாக மாணவரின் வங்கிக் கணக்கில் செலுத்தப்படும்."],
         ["விண்ணப்பத்தைக் கல்லூரி இணையதளம் வழியாக ஆகஸ்ட் 31-க்குள் சமர்ப்பிக்க வேண்டும்.",
          "தேவையான ஆவணங்கள்: வருமானச் சான்றிதழ், சாதிச் சான்றிதழ், ஆதார் அட்டை, வங்கிக் கணக்குப் புத்தகம், கல்லூரிச் சான்றிதழ்.",
          "ஒவ்வொரு ஆண்டும் உதவித்தொகையைப் புதுப்பிக்கக் குறைந்தது 75 சதவீத வருகைப்பதிவு தேவை.",
          "மாணவர் உதவி எண்: 1800-599-2222."]]},
]


def find_font() -> str:
    for c in (os.getenv("NOTO_TAMIL_TTF", ""), "assets/fonts/NotoSansTamil-Regular.ttf",
              "/usr/share/fonts/truetype/noto/NotoSansTamil-Regular.ttf",
              "/usr/share/fonts/noto/NotoSansTamil-Regular.ttf",
              str(Path.home() / ".fonts/NotoSansTamil-Regular.ttf")):
        if c and Path(c).is_file():
            return c
    sys.exit("Noto Sans Tamil static TTF not found. Download from fonts.google.com/noto/specimen/Noto+Sans+Tamil "
             "and set NOTO_TAMIL_TTF=/path/NotoSansTamil-Regular.ttf")


def build(out: Path, doc: dict, font: str) -> None:
    h = ParagraphStyle("h", fontName=font, fontSize=17, leading=28, spaceAfter=4 * mm)
    n = ParagraphStyle("n", fontName=font, fontSize=9, leading=14, textColor="#666666", spaceAfter=6 * mm)
    p = ParagraphStyle("p", fontName=font, fontSize=13, leading=24, spaceAfter=4 * mm)
    story = []
    for i, page in enumerate(doc["pages"]):
        if i:
            story.append(PageBreak())
        story += [Paragraph(f"{doc['title']} – பக்கம் {i + 1}", h), Paragraph(NOTE, n)]
        story += [Paragraph(t, p) for t in page]
        story.append(Spacer(1, 4 * mm))
    SimpleDocTemplate(str(out), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
                      title=doc["title"]).build(story)


def extracted_ok(path: Path, probes) -> bool:
    text = unicodedata.normalize("NFC", " ".join((pg.extract_text() or "") for pg in PdfReader(str(path)).pages))
    return all(unicodedata.normalize("NFC", w) in text for w in probes)


def main() -> None:
    path = find_font()
    OUT.mkdir(exist_ok=True)
    pdfmetrics.registerFont(TTFont("TamilPlain", path))
    shaped = False
    try:
        pdfmetrics.registerFont(TTFont("TamilShaped", path, shapable=True))
        shaped = True
    except Exception as e:
        print(f"[info] shaping unavailable ({type(e).__name__}); using plain font")
    for d in DOCS:
        out = OUT / d["file"]
        build(out, d, "TamilShaped" if shaped else "TamilPlain")
        if shaped and not extracted_ok(out, d["probes"]):
            print(f"[warn] {d['file']}: shaped text did not extract cleanly -> rebuilding with plain font")
            build(out, d, "TamilPlain")
        ok = extracted_ok(out, d["probes"])
        print(f"{'OK ' if ok else 'BAD'} {out}  (text extraction {'verified' if ok else 'FAILED - RAG will not work on this PDF'})")


if __name__ == "__main__":
    main()
