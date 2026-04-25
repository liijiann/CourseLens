from pathlib import Path

import fitz
from fastapi import UploadFile


async def save_upload(file: UploadFile, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open('wb') as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)


def render_pdf_to_images(
    pdf_path: Path,
    pages_dir: Path,
    width: int = 2048,
) -> int:
    pages_dir.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(pdf_path)
    try:
        for idx, page in enumerate(doc, start=1):
            zoom = width / page.rect.width
            matrix = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            pix.save((pages_dir / f'page_{idx:03d}.png').as_posix())
    finally:
        total_pages = doc.page_count
        doc.close()

    return total_pages
