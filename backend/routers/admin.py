import secrets
import sqlite3
import string

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth_deps import get_current_admin
from db import (
    AnnouncementRecord,
    InviteCodeRecord,
    OrderRecord,
    UserRecord,
    approve_recharge_order,
    clear_active_announcements,
    create_announcement,
    create_invite_code,
    delete_invite_code,
    delete_user,
    get_order_by_id,
    get_user_by_id,
    list_orders_by_status,
    list_invite_codes,
    list_users,
    reject_recharge_order,
    set_user_active,
)
from services import session_service

router = APIRouter(prefix='/api/admin', tags=['admin'])

INVITE_CHARS = string.ascii_uppercase + string.digits
INVITE_CODE_LEN = 8


class AdminUserItem(BaseModel):
    id: int
    email: str
    role: str
    is_active: int
    created_at: str
    session_count: int
    total_pages: int
    storage_quota_mb: int
    storage_used_mb: float
    storage_used_percent: float


class AdminActionResponse(BaseModel):
    message: str


class InviteCodeItem(BaseModel):
    id: int
    code: str
    max_uses: int
    used_count: int
    note: str
    created_at: str


class CreateInviteCodeBody(BaseModel):
    max_uses: int = 1
    note: str = ''


class AnnouncementBody(BaseModel):
    content: str


class AnnouncementItem(BaseModel):
    id: int
    content: str
    created_at: str
    is_active: int


class AdminUserSessionItem(BaseModel):
    session_id: str
    filename: str
    total_pages: int
    created_at: str


class AdminUserSessionsResponse(BaseModel):
    items: list[AdminUserSessionItem]
    page: int
    page_size: int
    total_items: int
    total_file_pages: int


class AdminOrderItem(BaseModel):
    id: int
    user_id: int
    user_email: str
    package_id: str
    quota_mb: int
    amount_fen: int
    status: str
    created_at: str
    paid_at: str | None = None


def _to_invite_item(invite: InviteCodeRecord) -> InviteCodeItem:
    return InviteCodeItem(
        id=int(invite['id']),
        code=str(invite['code']),
        max_uses=int(invite['max_uses']),
        used_count=int(invite['used_count']),
        note=str(invite['note']),
        created_at=str(invite['created_at']),
    )


def _to_announcement_item(announcement: AnnouncementRecord) -> AnnouncementItem:
    return AnnouncementItem(
        id=int(announcement['id']),
        content=str(announcement['content']),
        created_at=str(announcement['created_at']),
        is_active=int(announcement['is_active']),
    )


def _to_admin_user_item(user: UserRecord) -> AdminUserItem:
    session_count, total_pages = session_service.get_user_session_summary(str(user['id']))
    quota_mb = int(user.get('storage_quota_mb') or 60)
    used_mb = round(float(user.get('storage_used_mb') or 0.0), 2)
    used_percent = 0.0 if quota_mb <= 0 else min(100.0, round(used_mb / quota_mb * 100, 2))
    return AdminUserItem(
        id=int(user['id']),
        email=str(user['email']),
        role=str(user['role']),
        is_active=int(user['is_active']),
        created_at=str(user['created_at']),
        session_count=session_count,
        total_pages=total_pages,
        storage_quota_mb=quota_mb,
        storage_used_mb=used_mb,
        storage_used_percent=used_percent,
    )


def _to_admin_order_item(order: OrderRecord) -> AdminOrderItem:
    user = get_user_by_id(int(order['user_id']))
    return AdminOrderItem(
        id=int(order['id']),
        user_id=int(order['user_id']),
        user_email=(str(user['email']) if user else ''),
        package_id=str(order['package_id']),
        quota_mb=int(order['quota_mb']),
        amount_fen=int(order['amount_fen']),
        status=str(order['status']),
        created_at=str(order['created_at']),
        paid_at=(str(order['paid_at']) if order['paid_at'] else None),
    )


def _generate_invite_code() -> str:
    return ''.join(secrets.choice(INVITE_CHARS) for _ in range(INVITE_CODE_LEN))


@router.get('/users', response_model=list[AdminUserItem])
def get_users(_: UserRecord = Depends(get_current_admin)) -> list[AdminUserItem]:
    users = list_users()
    return [_to_admin_user_item(user) for user in users]


@router.get('/users/{user_id}/sessions', response_model=AdminUserSessionsResponse)
def get_user_sessions(
    user_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _: UserRecord = Depends(get_current_admin),
) -> AdminUserSessionsResponse:
    if get_user_by_id(user_id) is None:
        raise HTTPException(status_code=404, detail='\u7528\u6237\u4e0d\u5b58\u5728')

    payload = session_service.list_sessions_paginated_for_admin(str(user_id), page, page_size)
    items = [
        AdminUserSessionItem(
            session_id=str(item['sessionId']),
            filename=str(item['filename']),
            total_pages=int(item['totalPages']),
            created_at=str(item['createdAt']),
        )
        for item in payload['items']
    ]

    return AdminUserSessionsResponse(
        items=items,
        page=int(payload['page']),
        page_size=int(payload['page_size']),
        total_items=int(payload['total_items']),
        total_file_pages=int(payload['total_file_pages']),
    )


@router.post('/users/{user_id}/ban', response_model=AdminActionResponse)
def ban_user(user_id: int, current_admin: UserRecord = Depends(get_current_admin)) -> AdminActionResponse:
    if user_id == int(current_admin['id']):
        raise HTTPException(status_code=400, detail='\u4e0d\u80fd\u64cd\u4f5c\u81ea\u5df1\u7684\u8d26\u53f7')
    user = set_user_active(user_id=user_id, is_active=0)
    if user is None:
        raise HTTPException(status_code=404, detail='\u7528\u6237\u4e0d\u5b58\u5728')
    return AdminActionResponse(message='\u5c01\u7981\u6210\u529f')


@router.post('/users/{user_id}/unban', response_model=AdminActionResponse)
def unban_user(user_id: int, _: UserRecord = Depends(get_current_admin)) -> AdminActionResponse:
    user = set_user_active(user_id=user_id, is_active=1)
    if user is None:
        raise HTTPException(status_code=404, detail='\u7528\u6237\u4e0d\u5b58\u5728')
    return AdminActionResponse(message='\u89e3\u5c01\u6210\u529f')


@router.delete('/users/{user_id}', response_model=AdminActionResponse)
def remove_user(user_id: int, current_admin: UserRecord = Depends(get_current_admin)) -> AdminActionResponse:
    if user_id == int(current_admin['id']):
        raise HTTPException(status_code=400, detail='\u4e0d\u80fd\u64cd\u4f5c\u81ea\u5df1\u7684\u8d26\u53f7')
    deleted = delete_user(user_id=user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail='\u7528\u6237\u4e0d\u5b58\u5728')
    session_service.delete_user_storage(str(user_id))
    return AdminActionResponse(message='\u5220\u9664\u6210\u529f')


@router.get('/invite-codes', response_model=list[InviteCodeItem])
def get_invite_codes(_: UserRecord = Depends(get_current_admin)) -> list[InviteCodeItem]:
    invites = list_invite_codes()
    return [_to_invite_item(invite) for invite in invites]


@router.post('/invite-codes', response_model=InviteCodeItem)
def create_new_invite_code(
    body: CreateInviteCodeBody,
    current_admin: UserRecord = Depends(get_current_admin),
) -> InviteCodeItem:
    if body.max_uses != -1 and body.max_uses < 1:
        raise HTTPException(status_code=400, detail='\u4f7f\u7528\u6b21\u6570\u5fc5\u987b\u4e3a\u6b63\u6574\u6570\u6216 -1')

    note = body.note.strip()
    for _ in range(20):
        code = _generate_invite_code()
        try:
            invite = create_invite_code(
                code=code,
                max_uses=body.max_uses,
                created_by=int(current_admin['id']),
                note=note,
            )
            return _to_invite_item(invite)
        except sqlite3.IntegrityError:
            continue

    raise HTTPException(status_code=500, detail='\u521b\u5efa\u9080\u8bf7\u7801\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5')


@router.delete('/invite-codes/{code_id}', response_model=AdminActionResponse)
def remove_invite_code(code_id: int, _: UserRecord = Depends(get_current_admin)) -> AdminActionResponse:
    deleted = delete_invite_code(code_id)
    if not deleted:
        raise HTTPException(status_code=404, detail='\u9080\u8bf7\u7801\u4e0d\u5b58\u5728')
    return AdminActionResponse(message='\u5220\u9664\u6210\u529f')


@router.post('/announcement', response_model=AnnouncementItem)
def publish_announcement(
    body: AnnouncementBody,
    _: UserRecord = Depends(get_current_admin),
) -> AnnouncementItem:
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail='\u516c\u544a\u5185\u5bb9\u4e0d\u80fd\u4e3a\u7a7a')

    try:
        announcement = create_announcement(content=content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return _to_announcement_item(announcement)


@router.delete('/announcement', response_model=AdminActionResponse)
def clear_announcement(_: UserRecord = Depends(get_current_admin)) -> AdminActionResponse:
    clear_active_announcements()
    return AdminActionResponse(message='\u516c\u544a\u5df2\u6e05\u9664')


@router.get('/orders', response_model=list[AdminOrderItem])
def get_pending_orders(_: UserRecord = Depends(get_current_admin)) -> list[AdminOrderItem]:
    orders = list_orders_by_status('pending')
    return [_to_admin_order_item(item) for item in orders]


@router.post('/orders/{order_id}/approve', response_model=AdminOrderItem)
def approve_order(order_id: int, _: UserRecord = Depends(get_current_admin)) -> AdminOrderItem:
    order = get_order_by_id(order_id)
    if order is None:
        raise HTTPException(status_code=404, detail='订单不存在')
    if str(order['status']) != 'pending':
        raise HTTPException(status_code=400, detail='仅可审批待审核订单')

    updated = approve_recharge_order(order_id)
    if updated is None:
        raise HTTPException(status_code=404, detail='订单不存在')
    return _to_admin_order_item(updated)


@router.post('/orders/{order_id}/reject', response_model=AdminOrderItem)
def reject_order(order_id: int, _: UserRecord = Depends(get_current_admin)) -> AdminOrderItem:
    order = get_order_by_id(order_id)
    if order is None:
        raise HTTPException(status_code=404, detail='订单不存在')
    if str(order['status']) != 'pending':
        raise HTTPException(status_code=400, detail='仅可拒绝待审核订单')

    updated = reject_recharge_order(order_id)
    if updated is None:
        raise HTTPException(status_code=404, detail='订单不存在')
    return _to_admin_order_item(updated)
