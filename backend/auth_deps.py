import os
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from db import UserRecord, get_user_by_id

JWT_SECRET = os.getenv('JWT_SECRET', 'courselens-dev-secret')
JWT_ALGORITHM = 'HS256'
ACCESS_TOKEN_EXPIRE_DAYS = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl='/api/auth/login')


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed_password.encode('utf-8'))
    except ValueError:
        return False


def create_access_token(user: UserRecord) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        'sub': str(user['id']),
        'email': user['email'],
        'role': user['role'],
        'iat': int(now.timestamp()),
        'exp': int((now + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme)) -> UserRecord:
    auth_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail='认证失败，请重新登录',
        headers={'WWW-Authenticate': 'Bearer'},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id_raw = payload.get('sub')
        if user_id_raw is None:
            raise auth_error
        user_id = int(user_id_raw)
    except (JWTError, ValueError) as exc:
        raise auth_error from exc

    user = get_user_by_id(user_id)
    if user is None:
        raise auth_error
    if int(user['is_active']) != 1:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='账号已被封禁')
    return user


def get_current_admin(user: UserRecord = Depends(get_current_user)) -> UserRecord:
    if user.get('role') != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='无管理员权限')
    return user
