from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth_deps import get_current_user
from db import (
    OrderRecord,
    UserRecord,
    create_recharge_order,
    get_order_by_id,
    get_user_storage,
    list_user_orders,
)

router = APIRouter(prefix='/api/recharge', tags=['recharge'])


RECHARGE_PACKAGES = {
    'small': {
        'id': 'small',
        'name': '小包',
        'quota_mb': 500,
        'price_fen': 300,
    },
    'medium': {
        'id': 'medium',
        'name': '中包',
        'quota_mb': 2048,
        'price_fen': 1000,
    },
    'large': {
        'id': 'large',
        'name': '大包',
        'quota_mb': 10240,
        'price_fen': 4000,
    },
}


class RechargePackageItem(BaseModel):
    id: str
    name: str
    quota_mb: int
    price_fen: int


class StorageStatusResponse(BaseModel):
    quota_mb: int
    used_mb: float
    used_percent: float


class CreateOrderBody(BaseModel):
    package_id: str


class OrderIdResponse(BaseModel):
    order_id: int


class RechargeOrderItem(BaseModel):
    id: int
    user_id: int
    package_id: str
    quota_mb: int
    amount_fen: int
    status: str
    created_at: str
    paid_at: str | None = None


class ActionResponse(BaseModel):
    message: str


def _to_order_item(order: OrderRecord) -> RechargeOrderItem:
    return RechargeOrderItem(
        id=int(order['id']),
        user_id=int(order['user_id']),
        package_id=str(order['package_id']),
        quota_mb=int(order['quota_mb']),
        amount_fen=int(order['amount_fen']),
        status=str(order['status']),
        created_at=str(order['created_at']),
        paid_at=(str(order['paid_at']) if order['paid_at'] else None),
    )


@router.get('/packages', response_model=list[RechargePackageItem])
def get_recharge_packages(_: UserRecord = Depends(get_current_user)) -> list[RechargePackageItem]:
    return [RechargePackageItem(**pkg) for pkg in RECHARGE_PACKAGES.values()]


@router.get('/status', response_model=StorageStatusResponse)
def get_recharge_status(current_user: UserRecord = Depends(get_current_user)) -> StorageStatusResponse:
    quota_mb, used_mb = get_user_storage(int(current_user['id']))
    used_percent = 0.0 if quota_mb <= 0 else min(100.0, round(used_mb / quota_mb * 100, 2))
    return StorageStatusResponse(
        quota_mb=quota_mb,
        used_mb=round(used_mb, 2),
        used_percent=used_percent,
    )


@router.post('/order', response_model=OrderIdResponse)
def create_order(body: CreateOrderBody, current_user: UserRecord = Depends(get_current_user)) -> OrderIdResponse:
    package_id = body.package_id.strip().lower()
    pkg = RECHARGE_PACKAGES.get(package_id)
    if pkg is None:
        raise HTTPException(status_code=400, detail='无效套餐')
    order = create_recharge_order(
        user_id=int(current_user['id']),
        package_id=package_id,
        quota_mb=int(pkg['quota_mb']),
        amount_fen=int(pkg['price_fen']),
    )
    return OrderIdResponse(order_id=int(order['id']))


@router.post('/order/{order_id}/confirm', response_model=ActionResponse)
def confirm_order(order_id: int, current_user: UserRecord = Depends(get_current_user)) -> ActionResponse:
    order = get_order_by_id(order_id)
    if order is None or int(order['user_id']) != int(current_user['id']):
        raise HTTPException(status_code=404, detail='订单不存在')
    if str(order['status']) == 'paid':
        return ActionResponse(message='订单已支付，无需重复提交')
    if str(order['status']) == 'cancelled':
        raise HTTPException(status_code=400, detail='订单已被拒绝，请重新创建')
    return ActionResponse(message='已提交人工审核，请等待管理员确认')


@router.get('/orders', response_model=list[RechargeOrderItem])
def get_orders(current_user: UserRecord = Depends(get_current_user)) -> list[RechargeOrderItem]:
    orders = list_user_orders(int(current_user['id']))
    return [_to_order_item(item) for item in orders]
