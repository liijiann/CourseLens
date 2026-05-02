import asyncio
from pathlib import Path

from db import get_user_storage, update_user_storage_used
from services import pdf_service, session_service


class StorageQuotaExceeded(Exception):
    pass


_task_guard = asyncio.Lock()
_session_locks: dict[str, asyncio.Lock] = {}
_prefetch_tasks: dict[str, asyncio.Task[None]] = {}
_prefetch_next_page: dict[str, int] = {}
_prefetch_total_pages: dict[str, int] = {}
_prefetch_priority_pages: dict[str, set[int]] = {}


def _session_key(user_id: str, session_id: str) -> str:
    return f'{user_id}:{session_id}'


async def _get_session_lock(key: str) -> asyncio.Lock:
    async with _task_guard:
        lock = _session_locks.get(key)
        if lock is None:
            lock = asyncio.Lock()
            _session_locks[key] = lock
        return lock


def _safe_unlink(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except Exception:
        pass


async def ensure_page_rendered(
    user_id: str,
    session_id: str,
    page_number: int,
    width: int = 2048,
) -> bool:
    key = _session_key(user_id, session_id)
    lock = await _get_session_lock(key)

    async with lock:
        image_path = session_service.get_page_image_path(user_id, session_id, page_number)
        if image_path.exists():
            return False

        pdf_path = session_service.get_original_pdf_path(user_id, session_id)
        if not pdf_path.exists():
            raise FileNotFoundError('PDF file not found')

        quota_mb, used_mb = get_user_storage(int(user_id))
        if used_mb >= quota_mb:
            raise StorageQuotaExceeded('存储空间不足，请充值')

        await asyncio.to_thread(
            pdf_service.render_pdf_page_to_image,
            pdf_path,
            image_path,
            page_number,
            width,
        )

        rendered_bytes = int(image_path.stat().st_size) if image_path.exists() else 0
        rendered_mb = pdf_service.bytes_to_mb(rendered_bytes)
        final_used_mb = round(used_mb + rendered_mb, 2)

        if final_used_mb > quota_mb:
            _safe_unlink(image_path)
            raise StorageQuotaExceeded('存储空间不足，请充值')

        update_user_storage_used(int(user_id), final_used_mb)
        return True


async def _next_prefetch_page(key: str) -> int | None:
    async with _task_guard:
        total_pages = _prefetch_total_pages.get(key, 0)
        if total_pages <= 0:
            return None

        priority = _prefetch_priority_pages.get(key)
        if priority:
            page = min(priority)
            priority.remove(page)
            if not priority:
                _prefetch_priority_pages.pop(key, None)
            return page

        next_page = _prefetch_next_page.get(key, 1)
        if next_page > total_pages:
            return None

        _prefetch_next_page[key] = next_page + 1
        return next_page


async def _cleanup_prefetch_state(key: str) -> None:
    async with _task_guard:
        _prefetch_tasks.pop(key, None)
        _prefetch_total_pages.pop(key, None)
        _prefetch_next_page.pop(key, None)
        _prefetch_priority_pages.pop(key, None)


async def _prefetch_worker(user_id: str, session_id: str) -> None:
    key = _session_key(user_id, session_id)
    try:
        while True:
            page_number = await _next_prefetch_page(key)
            if page_number is None:
                return

            try:
                await ensure_page_rendered(user_id, session_id, page_number)
            except StorageQuotaExceeded:
                return
            except (FileNotFoundError, IndexError):
                return
            except Exception:
                await asyncio.sleep(0.1)

            await asyncio.sleep(0)
    finally:
        await _cleanup_prefetch_state(key)


async def schedule_prefetch(
    user_id: str,
    session_id: str,
    total_pages: int,
    start_page: int = 1,
) -> None:
    if total_pages <= 0:
        return

    key = _session_key(user_id, session_id)
    async with _task_guard:
        _prefetch_total_pages[key] = total_pages
        current_next = _prefetch_next_page.get(key)
        normalized_start = max(1, start_page)
        if current_next is None or normalized_start < current_next:
            _prefetch_next_page[key] = normalized_start

        task = _prefetch_tasks.get(key)
        if task is not None and not task.done():
            return

        _prefetch_tasks[key] = asyncio.create_task(_prefetch_worker(user_id, session_id))


async def bump_priority_page(user_id: str, session_id: str, page_number: int) -> None:
    key = _session_key(user_id, session_id)
    async with _task_guard:
        priority = _prefetch_priority_pages.setdefault(key, set())
        priority.add(page_number)
