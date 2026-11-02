"""Extend sample.docx with explicit pages; --check verifies the saved fixture."""
from pathlib import Path
import sys
from docx import Document
from docx.enum.text import WD_BREAK
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parent
TARGET = ROOT / 'sample-long.docx'
MARKER = 'PAGE FIFTEEN MARKER sentence. This is the sentence after the marker.'
FILLER = ('The garden path leads past the old oak tree. Reading aloud should feel smooth '
          'and steady. A small bird rests on the wall while the neighbours walk home. '
          'This sentence appears again on several pages. Tomorrow we will visit the library.')


def check():
    """Count actual OOXML page breaks, including those before the unique marker."""
    doc = Document(TARGET)
    assert '\n'.join(p.text for p in doc.paragraphs).count(MARKER) == 1
    original = [p.text for p in Document(ROOT / 'sample.docx').paragraphs]
    assert [p.text for p in doc.paragraphs if p.text.strip()][:len(original)] == original
    breaks = 0
    markers = []
    for paragraph in doc.paragraphs:
        if MARKER in paragraph.text:
            markers.append(breaks)
        breaks += sum(br.get(qn('w:type')) == 'page'
                      for br in paragraph._p.iter(qn('w:br')))
    assert markers == [14], markers
    assert breaks >= 25, breaks
    print(f'{TARGET.name}: marker once after break 14; {breaks} page breaks')


def make():
    """Keep source text/formatting, breaking before a page grows too full."""
    doc = Document(ROOT / 'sample.docx')
    page, words = 1, 0
    # Leave room for paragraph spacing at default Word formatting.
    for paragraph in list(doc.paragraphs):
        count = len(paragraph.text.split())
        if words + count > 400:
            paragraph.insert_paragraph_before().add_run().add_break(WD_BREAK.PAGE)
            page += 1
            words = 0
        words += count
    while page <= 27:
        if page == 15 and words == 0:
            doc.add_paragraph(MARKER)
            words += len(MARKER.split())
        while words < 400:
            doc.add_paragraph(FILLER)
            words += len(FILLER.split())
        if page == 27:
            break
        doc.add_page_break()
        page += 1
        words = 0
    doc.save(TARGET)
    check()


if __name__ == '__main__':
    check() if '--check' in sys.argv else make()
