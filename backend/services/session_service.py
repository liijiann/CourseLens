import json
import os
import shutil
import threading
import time
import uuid
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any, TypeVar

ROOT_DIR = Path(__file__).resolve().parents[1]
STORAGE_DIR = ROOT_DIR / 'storage'

T = TypeVar('T')

_lock_guard = threading.Lock()
SESSION_LOCK_IDLE_TTL_SECONDS = max(
    60.0,
    float(os.getenv('SESSION_LOCK_IDLE_TTL_SECONDS', '900')),
)
SESSION_LOCK_SWEEP_INTERVAL_SECONDS = max(
    5.0,
    float(os.getenv('SESSION_LOCK_SWEEP_INTERVAL_SECONDS', '30')),
)


class _SessionLockEntry:
    __slots__ = ('lock', 'ref_count', 'last_used')

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.ref_count = 0
        self.last_used = time.monotonic()


_session_locks: dict[str, _SessionLockEntry] = {}
_last_lock_sweep_at = 0.0


def _lock_key(user_id: str, session_id: str) -> str:
    return f'{user_id}:{session_id}'


def _maybe_reclaim_locks_unlocked(now: float) -> None:
    global _last_lock_sweep_at
    if (now - _last_lock_sweep_at) < SESSION_LOCK_SWEEP_INTERVAL_SECONDS:
        return
    _last_lock_sweep_at = now
    idle_before = now - SESSION_LOCK_IDLE_TTL_SECONDS
    stale_keys = [
        key
        for key, entry in _session_locks.items()
        if entry.ref_count == 0 and entry.last_used <= idle_before
    ]
    for key in stale_keys:
        _session_locks.pop(key, None)


def _acquire_lock_entry(user_id: str, session_id: str) -> tuple[str, _SessionLockEntry]:
    key = _lock_key(user_id, session_id)
    now = time.monotonic()
    with _lock_guard:
        _maybe_reclaim_locks_unlocked(now)
        entry = _session_locks.get(key)
        if entry is None:
            entry = _SessionLockEntry()
            _session_locks[key] = entry
        entry.ref_count += 1
        entry.last_used = now
        return key, entry


def _release_lock_entry(key: str, entry: _SessionLockEntry) -> None:
    now = time.monotonic()
    with _lock_guard:
        current = _session_locks.get(key)
        if current is not entry:
            return
        if entry.ref_count > 0:
            entry.ref_count -= 1
        entry.last_used = now
        _maybe_reclaim_locks_unlocked(now)


def _with_session_lock(user_id: str, session_id: str, callback: Callable[[], T]) -> T:
    key, entry = _acquire_lock_entry(user_id, session_id)
    try:
        with entry.lock:
            return callback()
    finally:
        _release_lock_entry(key, entry)


def _atomic_write_json(path: Path, payload: Any) -> None:
    tmp_path = path.with_suffix('.tmp')
    tmp_path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(',', ':')),
        encoding='utf-8',
    )
    os.replace(tmp_path, path)


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding='utf-8-sig'))


def generate_session_id() -> str:
    return uuid.uuid4().hex[:12]


def get_user_storage_dir(user_id: str) -> Path:
    return STORAGE_DIR / str(user_id)


def get_session_dir(user_id: str, session_id: str) -> Path:
    return get_user_storage_dir(user_id) / session_id


def get_data_path(user_id: str, session_id: str) -> Path:
    return get_session_dir(user_id, session_id) / 'data.json'


def get_meta_path(user_id: str, session_id: str) -> Path:
    return get_session_dir(user_id, session_id) / 'meta.json'


def get_page_state_dir(user_id: str, session_id: str) -> Path:
    return get_session_dir(user_id, session_id) / 'state'


def get_page_state_path(user_id: str, session_id: str, page_number: int) -> Path:
    return get_page_state_dir(user_id, session_id) / f'page_{page_number:03d}.json'


def get_original_pdf_path(user_id: str, session_id: str) -> Path:
    return get_session_dir(user_id, session_id) / 'original.pdf'


def get_page_image_path(user_id: str, session_id: str, page_number: int) -> Path:
    return get_session_dir(user_id, session_id) / 'pages' / f'page_{page_number:03d}.png'


def create_session_dirs(user_id: str, session_id: str) -> Path:
    user_dir = get_user_storage_dir(user_id)
    user_dir.mkdir(parents=True, exist_ok=True)

    session_dir = get_session_dir(user_id, session_id)
    (session_dir / 'pages').mkdir(parents=True, exist_ok=False)
    (session_dir / 'state').mkdir(parents=True, exist_ok=False)
    return session_dir


def _default_page_payload(page_number: int) -> dict[str, Any]:
    return {
        'pageNumber': page_number,
        'status': 'pending',
        'explanation': '',
        'chat': [],
        'lastError': '',
    }


def _normalize_meta(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        'sessionId': str(payload['sessionId']),
        'filename': str(payload['filename']),
        'totalPages': int(payload['totalPages']),
        'createdAt': str(payload['createdAt']),
        'model': str(payload.get('model', 'qwen3.6-flash')),
    }


def initialize_session(
    user_id: str,
    session_id: str,
    filename: str,
    total_pages: int,
    model: str,
) -> None:
    meta_payload = {
        'sessionId': session_id,
        'filename': filename,
        'totalPages': total_pages,
        'createdAt': datetime.utcnow().isoformat() + 'Z',
        'model': model,
        'schemaVersion': 2,
    }

    _atomic_write_json(get_meta_path(user_id, session_id), meta_payload)

    state_dir = get_page_state_dir(user_id, session_id)
    state_dir.mkdir(parents=True, exist_ok=True)
    for page_number in range(1, total_pages + 1):
        _atomic_write_json(
            get_page_state_path(user_id, session_id, page_number),
            _default_page_payload(page_number),
        )


def _migrate_legacy_if_needed_unlocked(user_id: str, session_id: str) -> None:
    meta_path = get_meta_path(user_id, session_id)
    state_dir = get_page_state_dir(user_id, session_id)
    if meta_path.exists() and state_dir.exists():
        return

    legacy_path = get_data_path(user_id, session_id)
    if not legacy_path.exists():
        raise FileNotFoundError(f'Session not found: {session_id}')

    legacy = _read_json(legacy_path)

    meta_payload = {
        'sessionId': legacy['sessionId'],
        'filename': legacy['filename'],
        'totalPages': legacy['totalPages'],
        'createdAt': legacy['createdAt'],
        'model': legacy.get('model', 'qwen3.6-flash'),
        'schemaVersion': 2,
    }

    state_dir.mkdir(parents=True, exist_ok=True)
    _atomic_write_json(meta_path, meta_payload)

    pages = legacy.get('pages', [])
    total_pages = int(legacy.get('totalPages', 0))
    page_by_number = {
        int(page.get('pageNumber', -1)): page
        for page in pages
        if isinstance(page, dict)
    }

    for page_number in range(1, total_pages + 1):
        page_payload = page_by_number.get(page_number, _default_page_payload(page_number))
        normalized = {
            'pageNumber': page_number,
            'status': page_payload.get('status', 'pending'),
            'explanation': page_payload.get('explanation', ''),
            'chat': page_payload.get('chat', []),
            'lastError': page_payload.get('lastError', ''),
        }
        _atomic_write_json(get_page_state_path(user_id, session_id, page_number), normalized)


def _read_meta_unlocked(user_id: str, session_id: str) -> dict[str, Any]:
    _migrate_legacy_if_needed_unlocked(user_id, session_id)
    meta = _read_json(get_meta_path(user_id, session_id))
    if not isinstance(meta, dict):
        raise ValueError('meta.json must be an object')
    required = {'sessionId', 'filename', 'totalPages', 'createdAt', 'model'}
    missing = required - set(meta)
    if missing:
        raise ValueError(f'meta missing fields: {sorted(missing)}')
    return meta


def _read_page_unlocked(user_id: str, session_id: str, page_number: int) -> dict[str, Any]:
    page_path = get_page_state_path(user_id, session_id, page_number)
    if not page_path.exists():
        raise IndexError('page out of range')
    page = _read_json(page_path)
    if int(page.get('pageNumber', -1)) != page_number:
        page['pageNumber'] = page_number
    return page


def _write_page_unlocked(user_id: str, session_id: str, page_number: int, payload: dict[str, Any]) -> None:
    normalized: dict[str, Any] = {
        'pageNumber': page_number,
        'status': payload.get('status', 'pending'),
        'explanation': payload.get('explanation', ''),
        'chat': payload.get('chat', []),
        'lastError': payload.get('lastError', ''),
    }
    if 'text' in payload:
        normalized['text'] = payload['text']
    _atomic_write_json(get_page_state_path(user_id, session_id, page_number), normalized)


def get_session_meta(user_id: str, session_id: str) -> dict[str, Any]:
    def _op() -> dict[str, Any]:
        return _read_meta_unlocked(user_id, session_id)

    return _with_session_lock(user_id, session_id, _op)


def get_page(user_id: str, session_id: str, page_number: int) -> dict[str, Any]:
    def _op() -> dict[str, Any]:
        meta = _read_meta_unlocked(user_id, session_id)
        total_pages = int(meta['totalPages'])
        if page_number < 1 or page_number > total_pages:
            raise IndexError('page out of range')
        return _read_page_unlocked(user_id, session_id, page_number)

    return _with_session_lock(user_id, session_id, _op)


def mutate_page(user_id: str, session_id: str, page_number: int, mutator: Callable[[dict[str, Any]], T]) -> T:
    def _op() -> T:
        meta = _read_meta_unlocked(user_id, session_id)
        total_pages = int(meta['totalPages'])
        if page_number < 1 or page_number > total_pages:
            raise IndexError('page out of range')

        page_payload = _read_page_unlocked(user_id, session_id, page_number)
        result = mutator(page_payload)
        _write_page_unlocked(user_id, session_id, page_number, page_payload)
        return result

    return _with_session_lock(user_id, session_id, _op)


def _read_session_unlocked(user_id: str, session_id: str) -> dict[str, Any]:
    meta = _read_meta_unlocked(user_id, session_id)
    total_pages = int(meta['totalPages'])
    pages = [
        _read_page_unlocked(user_id, session_id, page_number)
        for page_number in range(1, total_pages + 1)
    ]
    return {
        'sessionId': meta['sessionId'],
        'filename': meta['filename'],
        'totalPages': total_pages,
        'createdAt': meta['createdAt'],
        'model': meta['model'],
        'pages': pages,
    }


def get_session(user_id: str, session_id: str) -> dict[str, Any]:
    def _op() -> dict[str, Any]:
        return _read_session_unlocked(user_id, session_id)

    return _with_session_lock(user_id, session_id, _op)


def _collect_meta_from_session_dir(session_dir: Path) -> dict[str, Any] | None:
    meta_path = session_dir / 'meta.json'
    if meta_path.exists():
        try:
            meta = _read_json(meta_path)
            if isinstance(meta, dict):
                return _normalize_meta(meta)
        except Exception:
            return None

    legacy_path = session_dir / 'data.json'
    if not legacy_path.exists():
        return None

    try:
        legacy = _read_json(legacy_path)
        if isinstance(legacy, dict):
            return _normalize_meta(legacy)
    except Exception:
        return None

    return None


def list_sessions(user_id: str) -> list[dict[str, Any]]:
    user_dir = get_user_storage_dir(user_id)
    if not user_dir.exists():
        return []

    items: list[dict[str, Any]] = []
    for session_dir in user_dir.iterdir():
        if not session_dir.is_dir():
            continue
        meta = _collect_meta_from_session_dir(session_dir)
        if meta:
            items.append(meta)

    items.sort(key=lambda x: x['createdAt'], reverse=True)
    return items


def get_user_session_summary(user_id: str) -> tuple[int, int]:
    sessions = list_sessions(user_id)
    session_count = len(sessions)
    total_pages = sum(int(item.get('totalPages', 0)) for item in sessions)
    return session_count, total_pages


def list_sessions_paginated_for_admin(
    user_id: str,
    page: int,
    page_size: int,
) -> dict[str, Any]:
    sessions = list_sessions(user_id)
    total_items = len(sessions)
    total_file_pages = sum(int(item.get('totalPages', 0)) for item in sessions)

    start = (page - 1) * page_size
    end = start + page_size
    items = sessions[start:end] if start < total_items else []

    return {
        'items': items,
        'page': page,
        'page_size': page_size,
        'total_items': total_items,
        'total_file_pages': total_file_pages,
    }


def delete_session(user_id: str, session_id: str) -> None:
    def _op() -> None:
        session_dir = get_session_dir(user_id, session_id)
        try:
            resolved_dir = session_dir.resolve(strict=True)
        except FileNotFoundError as exc:
            raise FileNotFoundError(f'Session not found: {session_id}') from exc

        user_storage_dir = get_user_storage_dir(user_id).resolve()
        if resolved_dir.parent != user_storage_dir:
            raise RuntimeError('Invalid session path')

        shutil.rmtree(resolved_dir, ignore_errors=False)

    _with_session_lock(user_id, session_id, _op)


def delete_user_storage(user_id: str) -> None:
    user_dir = get_user_storage_dir(user_id)
    try:
        resolved_dir = user_dir.resolve(strict=True)
    except FileNotFoundError:
        return

    storage_dir = STORAGE_DIR.resolve()
    if resolved_dir.parent != storage_dir:
        raise RuntimeError('Invalid user storage path')

    shutil.rmtree(resolved_dir, ignore_errors=False)

    key_prefix = f'{user_id}:'
    with _lock_guard:
        _maybe_reclaim_locks_unlocked(time.monotonic())
        keys = [
            key
            for key, entry in _session_locks.items()
            if key.startswith(key_prefix) and entry.ref_count == 0
        ]
        for key in keys:
            _session_locks.pop(key, None)


def ensure_storage_dir() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def write_page_text(user_id: str, session_id: str, page_number: int, text: str) -> None:
    """将提取的 PDF 文字写入对应页 state JSON 的 text 字段。"""
    def _op() -> None:
        page_payload = _read_page_unlocked(user_id, session_id, page_number)
        page_payload['text'] = text
        _write_page_unlocked(user_id, session_id, page_number, page_payload)
    _with_session_lock(user_id, session_id, _op)


def search_session_text(
    user_id: str,
    session_id: str,
    query: str,
    snippet_radius: int = 60,
) -> list[dict[str, Any]]:
    """在所有页的 text 字段中搜索 query，返回命中页列表。
    每条结果格式：{pageNumber, snippet}
    """
    query_lower = query.lower()

    def _op() -> list[dict[str, Any]]:
        meta = _read_meta_unlocked(user_id, session_id)
        total_pages = int(meta['totalPages'])
        results: list[dict[str, Any]] = []
        for page_number in range(1, total_pages + 1):
            page_path = get_page_state_path(user_id, session_id, page_number)
            if not page_path.exists():
                continue
            page = _read_json(page_path)
            text: str = page.get('text', '')
            if not text:
                continue
            idx = text.lower().find(query_lower)
            if idx == -1:
                continue
            start = max(0, idx - snippet_radius)
            end = min(len(text), idx + len(query) + snippet_radius)
            snippet = ('…' if start > 0 else '') + text[start:end].strip() + ('…' if end < len(text) else '')
            results.append({'pageNumber': page_number, 'snippet': snippet})
        return results

    return _with_session_lock(user_id, session_id, _op)
