import json
import os
import shutil
import threading
import uuid
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any, TypeVar

ROOT_DIR = Path(__file__).resolve().parents[1]
STORAGE_DIR = ROOT_DIR / 'storage'
INDEX_PATH = STORAGE_DIR / 'sessions_index.json'

T = TypeVar('T')

_lock_guard = threading.Lock()
_session_locks: dict[str, threading.Lock] = {}


def _get_lock(session_id: str) -> threading.Lock:
    with _lock_guard:
        if session_id not in _session_locks:
            _session_locks[session_id] = threading.Lock()
        return _session_locks[session_id]


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


def get_session_dir(session_id: str) -> Path:
    return STORAGE_DIR / session_id


def get_data_path(session_id: str) -> Path:
    return get_session_dir(session_id) / 'data.json'


def get_meta_path(session_id: str) -> Path:
    return get_session_dir(session_id) / 'meta.json'


def get_page_state_dir(session_id: str) -> Path:
    return get_session_dir(session_id) / 'state'


def get_page_state_path(session_id: str, page_number: int) -> Path:
    return get_page_state_dir(session_id) / f'page_{page_number:03d}.json'


def get_original_pdf_path(session_id: str) -> Path:
    return get_session_dir(session_id) / 'original.pdf'


def get_page_image_path(session_id: str, page_number: int) -> Path:
    return get_session_dir(session_id) / 'pages' / f'page_{page_number:03d}.png'


def create_session_dirs(session_id: str) -> Path:
    session_dir = get_session_dir(session_id)
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


def _read_index_unlocked() -> list[dict[str, Any]]:
    if not INDEX_PATH.exists():
        return []

    payload = _read_json(INDEX_PATH)
    if not isinstance(payload, list):
        raise ValueError('sessions index must be a list')

    items: list[dict[str, Any]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        try:
            items.append(_normalize_meta(item))
        except Exception:
            continue

    items.sort(key=lambda x: x['createdAt'], reverse=True)
    return items


def _write_index_unlocked(items: list[dict[str, Any]]) -> None:
    normalized = [_normalize_meta(item) for item in items]
    normalized.sort(key=lambda x: x['createdAt'], reverse=True)
    _atomic_write_json(INDEX_PATH, normalized)


def _upsert_index_unlocked(meta_payload: dict[str, Any]) -> None:
    normalized = _normalize_meta(meta_payload)
    items = [item for item in _read_index_unlocked() if item['sessionId'] != normalized['sessionId']]
    items.append(normalized)
    _write_index_unlocked(items)


def _remove_from_index_unlocked(session_id: str) -> None:
    if not INDEX_PATH.exists():
        return
    items = [item for item in _read_index_unlocked() if item['sessionId'] != session_id]
    _write_index_unlocked(items)


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


def _rebuild_index_unlocked() -> list[dict[str, Any]]:
    if not STORAGE_DIR.exists():
        return []

    items: list[dict[str, Any]] = []
    for session_dir in STORAGE_DIR.iterdir():
        if not session_dir.is_dir():
            continue
        meta = _collect_meta_from_session_dir(session_dir)
        if meta:
            items.append(meta)

    _write_index_unlocked(items)
    return _read_index_unlocked()


def initialize_session(
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

    _atomic_write_json(get_meta_path(session_id), meta_payload)

    state_dir = get_page_state_dir(session_id)
    state_dir.mkdir(parents=True, exist_ok=True)
    for page_number in range(1, total_pages + 1):
        _atomic_write_json(
            get_page_state_path(session_id, page_number),
            _default_page_payload(page_number),
        )

    with _lock_guard:
        _upsert_index_unlocked(meta_payload)


def _migrate_legacy_if_needed_unlocked(session_id: str) -> None:
    meta_path = get_meta_path(session_id)
    state_dir = get_page_state_dir(session_id)
    if meta_path.exists() and state_dir.exists():
        return

    legacy_path = get_data_path(session_id)
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
        _atomic_write_json(get_page_state_path(session_id, page_number), normalized)

    with _lock_guard:
        _upsert_index_unlocked(meta_payload)


def _read_meta_unlocked(session_id: str) -> dict[str, Any]:
    _migrate_legacy_if_needed_unlocked(session_id)
    meta = _read_json(get_meta_path(session_id))
    if not isinstance(meta, dict):
        raise ValueError('meta.json must be an object')
    required = {'sessionId', 'filename', 'totalPages', 'createdAt', 'model'}
    missing = required - set(meta)
    if missing:
        raise ValueError(f'meta missing fields: {sorted(missing)}')
    return meta


def _read_page_unlocked(session_id: str, page_number: int) -> dict[str, Any]:
    page_path = get_page_state_path(session_id, page_number)
    if not page_path.exists():
        raise IndexError('page out of range')
    page = _read_json(page_path)
    if int(page.get('pageNumber', -1)) != page_number:
        page['pageNumber'] = page_number
    return page


def _write_page_unlocked(session_id: str, page_number: int, payload: dict[str, Any]) -> None:
    normalized = {
        'pageNumber': page_number,
        'status': payload.get('status', 'pending'),
        'explanation': payload.get('explanation', ''),
        'chat': payload.get('chat', []),
        'lastError': payload.get('lastError', ''),
    }
    _atomic_write_json(get_page_state_path(session_id, page_number), normalized)


def get_session_meta(session_id: str) -> dict[str, Any]:
    lock = _get_lock(session_id)
    with lock:
        return _read_meta_unlocked(session_id)


def get_page(session_id: str, page_number: int) -> dict[str, Any]:
    lock = _get_lock(session_id)
    with lock:
        meta = _read_meta_unlocked(session_id)
        total_pages = int(meta['totalPages'])
        if page_number < 1 or page_number > total_pages:
            raise IndexError('page out of range')
        return _read_page_unlocked(session_id, page_number)


def mutate_page(session_id: str, page_number: int, mutator: Callable[[dict[str, Any]], T]) -> T:
    lock = _get_lock(session_id)
    with lock:
        meta = _read_meta_unlocked(session_id)
        total_pages = int(meta['totalPages'])
        if page_number < 1 or page_number > total_pages:
            raise IndexError('page out of range')

        page_payload = _read_page_unlocked(session_id, page_number)
        result = mutator(page_payload)
        _write_page_unlocked(session_id, page_number, page_payload)
        return result


def _read_session_unlocked(session_id: str) -> dict[str, Any]:
    meta = _read_meta_unlocked(session_id)
    total_pages = int(meta['totalPages'])
    pages = [
        _read_page_unlocked(session_id, page_number)
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


def get_session(session_id: str) -> dict[str, Any]:
    lock = _get_lock(session_id)
    with lock:
        return _read_session_unlocked(session_id)


def list_sessions() -> list[dict[str, Any]]:
    if not STORAGE_DIR.exists():
        return []

    with _lock_guard:
        if not INDEX_PATH.exists():
            return _rebuild_index_unlocked()

        try:
            items = _read_index_unlocked()
        except Exception:
            return _rebuild_index_unlocked()

        if items:
            return items

        has_session_dirs = any(path.is_dir() for path in STORAGE_DIR.iterdir())
        if has_session_dirs:
            return _rebuild_index_unlocked()
        return []


def delete_session(session_id: str) -> None:
    lock = _get_lock(session_id)
    with lock:
        session_dir = get_session_dir(session_id)
        try:
            resolved_dir = session_dir.resolve(strict=True)
        except FileNotFoundError as exc:
            raise FileNotFoundError(f'Session not found: {session_id}') from exc

        storage_dir = STORAGE_DIR.resolve()
        if resolved_dir.parent != storage_dir:
            raise RuntimeError('Invalid session path')

        shutil.rmtree(resolved_dir, ignore_errors=False)

    with _lock_guard:
        _session_locks.pop(session_id, None)
        _remove_from_index_unlocked(session_id)


def ensure_storage_dir() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
