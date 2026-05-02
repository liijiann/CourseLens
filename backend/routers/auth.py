import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth_deps import create_access_token, get_current_user, hash_password, verify_password
from db import InviteCodeInvalidError, UserRecord, create_user_with_invite, get_user_by_email

router = APIRouter(prefix='/api/auth', tags=['auth'])


class RegisterBody(BaseModel):
    email: str
    password: str
    invite_code: str = ''


class LoginBody(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = 'bearer'


class MeResponse(BaseModel):
    id: int
    email: str
    role: str


def _normalize_email(email: str) -> str:
    normalized = email.strip().lower()
    if not normalized:
        raise HTTPException(status_code=400, detail='邮箱不能为空')
    if '@' not in normalized:
        raise HTTPException(status_code=400, detail='邮箱格式不正确')
    return normalized


def _validate_password(password: str) -> str:
    if len(password) < 8:
        raise HTTPException(status_code=400, detail='密码长度不能少于 8 位')
    if len(password.encode('utf-8')) > 72:
        raise HTTPException(status_code=400, detail='密码过长，请控制在 72 字节以内')
    return password


@router.post('/register', response_model=TokenResponse)
def register(body: RegisterBody) -> TokenResponse:
    email = _normalize_email(body.email)
    password = _validate_password(body.password)

    if get_user_by_email(email) is not None:
        raise HTTPException(status_code=400, detail='邮箱已被注册')

    try:
        user = create_user_with_invite(
            email=email,
            hashed_password=hash_password(password),
            invite_code=body.invite_code,
        )
    except InviteCodeInvalidError as exc:
        raise HTTPException(status_code=400, detail='邀请码无效或已被使用') from exc
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=400, detail='邮箱已被注册') from exc

    token = create_access_token(user)
    return TokenResponse(access_token=token)


@router.post('/login', response_model=TokenResponse)
def login(body: LoginBody) -> TokenResponse:
    email = _normalize_email(body.email)
    password = body.password

    user = get_user_by_email(email)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='邮箱未注册')
    if not verify_password(password, user['hashed_password']):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='密码错误')
    if int(user['is_active']) != 1:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='账号已被封禁')

    token = create_access_token(user)
    return TokenResponse(access_token=token)


@router.get('/me', response_model=MeResponse)
def me(current_user: UserRecord = Depends(get_current_user)) -> MeResponse:
    return MeResponse(
        id=int(current_user['id']),
        email=str(current_user['email']),
        role=str(current_user['role']),
    )
