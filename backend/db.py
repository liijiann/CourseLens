import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

ROOT_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv('SQLITE_DB_PATH', ROOT_DIR / 'courselens.db'))
DEFAULT_USER_PAGE_LIMIT = 200

UserRecord = dict[str, Any]
InviteCodeRecord = dict[str, Any]
AnnouncementRecord = dict[str, Any]
OrderRecord = dict[str, Any]


class InviteCodeInvalidError(Exception):
    pass


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _to_user_record(row: sqlite3.Row | None) -> UserRecord | None:
    if row is None:
        return None
    page_limit_raw = row['page_limit'] if 'page_limit' in row.keys() else None
    return {
        'id': int(row['id']),
        'email': str(row['email']),
        'hashed_password': str(row['hashed_password']),
        'role': str(row['role']),
        'is_active': int(row['is_active']),
        'created_at': str(row['created_at']),
        'page_limit': int(page_limit_raw) if page_limit_raw is not None else None,
        'storage_quota_mb': int(row['storage_quota_mb']) if 'storage_quota_mb' in row.keys() else 60,
        'storage_used_mb': float(row['storage_used_mb']) if 'storage_used_mb' in row.keys() else 0.0,
    }


def _to_invite_code_record(row: sqlite3.Row | None) -> InviteCodeRecord | None:
    if row is None:
        return None
    return {
        'id': int(row['id']),
        'code': str(row['code']),
        'max_uses': int(row['max_uses']),
        'used_count': int(row['used_count']),
        'created_by': int(row['created_by']),
        'created_at': str(row['created_at']),
        'note': str(row['note'] or ''),
    }


def _to_announcement_record(row: sqlite3.Row | None) -> AnnouncementRecord | None:
    if row is None:
        return None
    return {
        'id': int(row['id']),
        'content': str(row['content']),
        'created_at': str(row['created_at']),
        'is_active': int(row['is_active']),
    }


def _to_order_record(row: sqlite3.Row | None) -> OrderRecord | None:
    if row is None:
        return None
    return {
        'id': int(row['id']),
        'user_id': int(row['user_id']),
        'package_id': str(row['package_id']),
        'quota_mb': int(row['quota_mb']),
        'amount_fen': int(row['amount_fen']),
        'status': str(row['status']),
        'created_at': str(row['created_at']),
        'paid_at': (str(row['paid_at']) if row['paid_at'] is not None else None),
    }


@contextmanager
def _get_conn() -> Iterator[sqlite3.Connection]:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def init_db() -> None:
    with _get_conn() as conn:
        conn.execute(
            '''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                hashed_password TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                page_limit INTEGER,
                storage_quota_mb INTEGER NOT NULL DEFAULT 60,
                storage_used_mb REAL NOT NULL DEFAULT 0
            )
            '''
        )
        conn.execute(
            '''
            CREATE TABLE IF NOT EXISTS invite_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE NOT NULL,
                max_uses INTEGER NOT NULL DEFAULT 1,
                used_count INTEGER NOT NULL DEFAULT 0,
                created_by INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                note TEXT DEFAULT ''
            )
            '''
        )
        conn.execute(
            '''
            CREATE TABLE IF NOT EXISTS announcements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1
            )
            '''
        )
        conn.execute(
            '''
            CREATE TABLE IF NOT EXISTS recharge_orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                package_id TEXT NOT NULL,
                quota_mb INTEGER NOT NULL,
                amount_fen INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                paid_at TEXT
            )
            '''
        )
        user_columns = {str(row['name']) for row in conn.execute("PRAGMA table_info(users)").fetchall()}
        if 'page_limit' not in user_columns:
            conn.execute('ALTER TABLE users ADD COLUMN page_limit INTEGER')
        if 'storage_quota_mb' not in user_columns:
            conn.execute('ALTER TABLE users ADD COLUMN storage_quota_mb INTEGER NOT NULL DEFAULT 60')
        if 'storage_used_mb' not in user_columns:
            conn.execute('ALTER TABLE users ADD COLUMN storage_used_mb REAL NOT NULL DEFAULT 0')
        conn.execute(
            'UPDATE users SET page_limit = ? WHERE role = ? AND page_limit IS NULL',
            (DEFAULT_USER_PAGE_LIMIT, 'user'),
        )
        conn.execute(
            'UPDATE users SET storage_quota_mb = 60 WHERE storage_quota_mb IS NULL OR storage_quota_mb < 1',
        )
        conn.execute(
            'UPDATE users SET storage_used_mb = 0 WHERE storage_used_mb IS NULL OR storage_used_mb < 0',
        )
        conn.commit()


def create_user_with_invite(
    email: str,
    hashed_password: str,
    invite_code: str,
) -> UserRecord:
    normalized_email = email.strip().lower()
    normalized_invite_code = invite_code.strip().upper()
    row: sqlite3.Row | None = None

    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute('BEGIN IMMEDIATE')
        try:
            user_count = int(cur.execute('SELECT COUNT(*) FROM users').fetchone()[0])
            role = 'admin' if user_count == 0 else 'user'
            page_limit = None if role == 'admin' else DEFAULT_USER_PAGE_LIMIT

            if user_count > 0:
                if not normalized_invite_code:
                    raise InviteCodeInvalidError('邀请码无效或已被使用')

                result = cur.execute(
                    '''
                    UPDATE invite_codes
                    SET used_count = used_count + 1
                    WHERE code = ?
                      AND (max_uses = -1 OR used_count < max_uses)
                    ''',
                    (normalized_invite_code,),
                )
                if result.rowcount == 0:
                    raise InviteCodeInvalidError('邀请码无效或已被使用')

            created_at = _utc_now_iso()
            cur.execute(
                '''
                INSERT INTO users (email, hashed_password, role, is_active, created_at, page_limit)
                VALUES (?, ?, ?, 1, ?, ?)
                ''',
                (normalized_email, hashed_password, role, created_at, page_limit),
            )
            user_id = int(cur.lastrowid)
            row = cur.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
            conn.commit()
        except Exception:
            conn.rollback()
            raise

    user = _to_user_record(row)
    if user is None:
        raise RuntimeError('创建用户失败')
    return user


def get_user_by_email(email: str) -> UserRecord | None:
    normalized_email = email.strip().lower()
    with _get_conn() as conn:
        row = conn.execute('SELECT * FROM users WHERE email = ?', (normalized_email,)).fetchone()
    return _to_user_record(row)


def get_user_by_id(user_id: int) -> UserRecord | None:
    with _get_conn() as conn:
        row = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
    return _to_user_record(row)


def list_users() -> list[UserRecord]:
    with _get_conn() as conn:
        rows = conn.execute(
            '''
            SELECT id, email, role, is_active, created_at, hashed_password, page_limit, storage_quota_mb, storage_used_mb
            FROM users
            ORDER BY id ASC
            '''
        ).fetchall()
    users: list[UserRecord] = []
    for row in rows:
        user = _to_user_record(row)
        if user is not None:
            users.append(user)
    return users


def set_user_active(user_id: int, is_active: int) -> UserRecord | None:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute('UPDATE users SET is_active = ? WHERE id = ?', (1 if is_active else 0, user_id))
        if cur.rowcount == 0:
            conn.commit()
            return None
        conn.commit()
        row = cur.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
    return _to_user_record(row)


def delete_user(user_id: int) -> bool:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute('DELETE FROM users WHERE id = ?', (user_id,))
        deleted = cur.rowcount > 0
        conn.commit()
    return deleted


def create_invite_code(code: str, max_uses: int, created_by: int, note: str = '') -> InviteCodeRecord:
    normalized_code = code.strip().upper()
    if not normalized_code:
        raise ValueError('邀请码不能为空')
    if max_uses != -1 and max_uses < 1:
        raise ValueError('max_uses 必须为 -1 或正整数')

    created_at = _utc_now_iso()
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            '''
            INSERT INTO invite_codes (code, max_uses, used_count, created_by, created_at, note)
            VALUES (?, ?, 0, ?, ?, ?)
            ''',
            (normalized_code, max_uses, created_by, created_at, note.strip()),
        )
        invite_id = int(cur.lastrowid)
        conn.commit()
        row = cur.execute('SELECT * FROM invite_codes WHERE id = ?', (invite_id,)).fetchone()

    invite = _to_invite_code_record(row)
    if invite is None:
        raise RuntimeError('创建邀请码失败')
    return invite


def list_invite_codes() -> list[InviteCodeRecord]:
    with _get_conn() as conn:
        rows = conn.execute(
            '''
            SELECT id, code, max_uses, used_count, created_by, created_at, note
            FROM invite_codes
            ORDER BY id DESC
            '''
        ).fetchall()

    invites: list[InviteCodeRecord] = []
    for row in rows:
        invite = _to_invite_code_record(row)
        if invite is not None:
            invites.append(invite)
    return invites


def delete_invite_code(code_id: int) -> bool:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute('DELETE FROM invite_codes WHERE id = ?', (code_id,))
        deleted = cur.rowcount > 0
        conn.commit()
    return deleted


def create_announcement(content: str) -> AnnouncementRecord:
    normalized_content = content.strip()
    if not normalized_content:
        raise ValueError('公告内容不能为空')

    created_at = _utc_now_iso()
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute('BEGIN IMMEDIATE')
        try:
            cur.execute('UPDATE announcements SET is_active = 0 WHERE is_active = 1')
            cur.execute(
                '''
                INSERT INTO announcements (content, created_at, is_active)
                VALUES (?, ?, 1)
                ''',
                (normalized_content, created_at),
            )
            announcement_id = int(cur.lastrowid)
            conn.commit()
        except Exception:
            conn.rollback()
            raise

        row = cur.execute('SELECT * FROM announcements WHERE id = ?', (announcement_id,)).fetchone()

    announcement = _to_announcement_record(row)
    if announcement is None:
        raise RuntimeError('发布公告失败')
    return announcement


def clear_active_announcements() -> int:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute('UPDATE announcements SET is_active = 0 WHERE is_active = 1')
        updated = int(cur.rowcount)
        conn.commit()
    return updated


def get_active_announcement() -> AnnouncementRecord | None:
    with _get_conn() as conn:
        row = conn.execute(
            '''
            SELECT id, content, created_at, is_active
            FROM announcements
            WHERE is_active = 1
            ORDER BY id DESC
            LIMIT 1
            '''
        ).fetchone()
    return _to_announcement_record(row)


def get_user_storage(user_id: int) -> tuple[int, float]:
    with _get_conn() as conn:
        row = conn.execute(
            'SELECT storage_quota_mb, storage_used_mb FROM users WHERE id = ?',
            (user_id,),
        ).fetchone()
    if row is None:
        raise ValueError('用户不存在')
    quota_mb = int(row['storage_quota_mb'])
    used_mb = round(float(row['storage_used_mb']), 2)
    return quota_mb, used_mb


def add_user_quota(user_id: int, quota_mb: int) -> UserRecord | None:
    if quota_mb <= 0:
        raise ValueError('配额增加值必须大于 0')
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            'UPDATE users SET storage_quota_mb = storage_quota_mb + ? WHERE id = ?',
            (int(quota_mb), user_id),
        )
        if cur.rowcount == 0:
            conn.commit()
            return None
        conn.commit()
        row = cur.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
    return _to_user_record(row)


def update_user_storage_used(user_id: int, used_mb: float) -> UserRecord | None:
    normalized = round(max(0.0, float(used_mb)), 2)
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            'UPDATE users SET storage_used_mb = ? WHERE id = ?',
            (normalized, user_id),
        )
        if cur.rowcount == 0:
            conn.commit()
            return None
        conn.commit()
        row = cur.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
    return _to_user_record(row)


def create_recharge_order(
    user_id: int,
    package_id: str,
    quota_mb: int,
    amount_fen: int,
) -> OrderRecord:
    created_at = _utc_now_iso()
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            '''
            INSERT INTO recharge_orders (user_id, package_id, quota_mb, amount_fen, status, created_at, paid_at)
            VALUES (?, ?, ?, ?, 'pending', ?, NULL)
            ''',
            (user_id, package_id, quota_mb, amount_fen, created_at),
        )
        order_id = int(cur.lastrowid)
        conn.commit()
        row = cur.execute('SELECT * FROM recharge_orders WHERE id = ?', (order_id,)).fetchone()
    order = _to_order_record(row)
    if order is None:
        raise RuntimeError('创建订单失败')
    return order


def get_order_by_id(order_id: int) -> OrderRecord | None:
    with _get_conn() as conn:
        row = conn.execute('SELECT * FROM recharge_orders WHERE id = ?', (order_id,)).fetchone()
    return _to_order_record(row)


def list_user_orders(user_id: int) -> list[OrderRecord]:
    with _get_conn() as conn:
        rows = conn.execute(
            '''
            SELECT *
            FROM recharge_orders
            WHERE user_id = ?
            ORDER BY id DESC
            ''',
            (user_id,),
        ).fetchall()
    items: list[OrderRecord] = []
    for row in rows:
        order = _to_order_record(row)
        if order is not None:
            items.append(order)
    return items


def list_orders_by_status(status: str) -> list[OrderRecord]:
    with _get_conn() as conn:
        rows = conn.execute(
            '''
            SELECT *
            FROM recharge_orders
            WHERE status = ?
            ORDER BY id ASC
            ''',
            (status,),
        ).fetchall()
    items: list[OrderRecord] = []
    for row in rows:
        order = _to_order_record(row)
        if order is not None:
            items.append(order)
    return items


def approve_recharge_order(order_id: int) -> OrderRecord | None:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute('BEGIN IMMEDIATE')
        try:
            row = cur.execute(
                'SELECT * FROM recharge_orders WHERE id = ?',
                (order_id,),
            ).fetchone()
            order = _to_order_record(row)
            if order is None:
                conn.rollback()
                return None
            if str(order['status']) != 'pending':
                conn.rollback()
                return order

            paid_at = _utc_now_iso()
            cur.execute(
                "UPDATE recharge_orders SET status = 'paid', paid_at = ? WHERE id = ?",
                (paid_at, order_id),
            )
            cur.execute(
                'UPDATE users SET storage_quota_mb = storage_quota_mb + ? WHERE id = ?',
                (int(order['quota_mb']), int(order['user_id'])),
            )
            conn.commit()
            updated_row = cur.execute('SELECT * FROM recharge_orders WHERE id = ?', (order_id,)).fetchone()
            return _to_order_record(updated_row)
        except Exception:
            conn.rollback()
            raise


def reject_recharge_order(order_id: int) -> OrderRecord | None:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE recharge_orders SET status = 'cancelled', paid_at = NULL WHERE id = ?",
            (order_id,),
        )
        if cur.rowcount == 0:
            conn.commit()
            return None
        conn.commit()
        row = cur.execute('SELECT * FROM recharge_orders WHERE id = ?', (order_id,)).fetchone()
    return _to_order_record(row)
