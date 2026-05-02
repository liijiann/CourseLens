from pathlib import Path

import fitz
from fastapi import UploadFile

BYTES_PER_MB = 1024 * 1024


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


def render_pdf_page_to_image(
    pdf_path: Path,
    image_path: Path,
    page_number: int,
    width: int = 2048,
) -> int:
    image_path.parent.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(pdf_path)
    try:
        total_pages = int(doc.page_count)
        if page_number < 1 or page_number > total_pages:
            raise IndexError('page out of range')

        page = doc[page_number - 1]
        zoom = width / page.rect.width
        matrix = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=matrix, alpha=False)
        pix.save(image_path.as_posix())
    finally:
        doc.close()

    return total_pages


def extract_pdf_text_by_page(pdf_path: Path) -> dict[int, str]:
    """返回 {page_number(1-based): text} 字典，扫描件页面返回空字符串。"""
    doc = fitz.open(pdf_path)
    try:
        result: dict[int, str] = {}
        for idx, page in enumerate(doc, start=1):
            result[idx] = page.get_text().strip()
        return result
    finally:
        doc.close()


def get_pdf_page_count(pdf_path: Path) -> int:
    doc = fitz.open(pdf_path)
    try:
        return int(doc.page_count)
    finally:
        doc.close()


def bytes_to_mb(size_bytes: int) -> float:
    return round(float(size_bytes) / BYTES_PER_MB, 2)


def estimate_render_size_mb(pdf_path: Path, width: int = 2048) -> float:
    # Estimate output PNG size from target pixel area with a conservative 0.25 byte-per-pixel compression ratio.
    doc = fitz.open(pdf_path)
    try:
        estimated_bytes = 0.0
        for page in doc:
            zoom = width / page.rect.width
            target_height = max(1.0, page.rect.height * zoom)
            estimated_bytes += float(width) * float(target_height) * 0.25
    finally:
        doc.close()
    return bytes_to_mb(int(estimated_bytes))


def get_path_size_bytes(path: Path) -> int:
    if not path.exists():
        return 0
    if path.is_file():
        return int(path.stat().st_size)
    total = 0
    for node in path.rglob('*'):
        if node.is_file():
            total += int(node.stat().st_size)
    return total
