import asyncio
import base64
import email.utils
import json
import os
import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

MODELS = {
    'qwen3.6-plus': 'qwen3.6-plus',
    'qwen3.6-flash': 'qwen3.6-flash',
    'qwen3.5-flash': 'qwen3.5-flash',
}

_REQUEST_TIMEOUT = httpx.Timeout(60.0, read=600.0)
_shared_client: httpx.AsyncClient | None = None


def _env_int(name: str, default: int, minimum: int) -> int:
    raw = os.getenv(name, '').strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return max(minimum, value)


def _env_float(name: str, default: float, minimum: float) -> float:
    raw = os.getenv(name, '').strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    return max(minimum, value)


_MAX_CONCURRENCY = _env_int('AI_MAX_CONCURRENCY', 10, 1)
_MAX_RETRIES = _env_int('AI_MAX_RETRIES', 3, 0)
_BACKOFF_BASE_SECONDS = _env_float('AI_RETRY_BACKOFF_BASE_SECONDS', 1.0, 0.0)
_RATE_LIMIT_COOLDOWN_SECONDS = _env_float('AI_RATE_LIMIT_COOLDOWN_SECONDS', 30.0, 1.0)
_CONSECUTIVE_429_THRESHOLD = _env_int('AI_CONSECUTIVE_429_THRESHOLD', 2, 1)

_request_semaphore = asyncio.Semaphore(_MAX_CONCURRENCY)
_limiter_lock = asyncio.Lock()
_consecutive_429 = 0
_degraded = False
_degraded_until = 0.0
_degraded_slot_held = False
_degraded_slot_task: asyncio.Task[None] | None = None


class AIServiceError(Exception):
    pass


def set_http_client(client: httpx.AsyncClient | None) -> None:
    global _shared_client
    _shared_client = client


@asynccontextmanager
async def _get_http_client() -> AsyncGenerator[httpx.AsyncClient, None]:
    if _shared_client is not None:
        yield _shared_client
        return

    async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
        yield client


def _get_api_key(model_key: str, override: str | None) -> str:
    if override and override.strip():
        return override.strip()
    raise AIServiceError('未提供 API Key，请通过设置页面配置')


def _get_base_url(model_key: str) -> str:
    return os.getenv('DASHSCOPE_BASE_URL', 'https://dashscope.aliyuncs.com/compatible-mode/v1').rstrip('/')


def _image_to_data_url(image_path: Path) -> str:
    encoded = base64.b64encode(image_path.read_bytes()).decode('utf-8')
    return f'data:image/png;base64,{encoded}'


def _extract_text(payload: Any) -> str:
    if isinstance(payload, str):
        return payload
    if isinstance(payload, dict):
        if isinstance(payload.get('text'), str):
            return payload['text']
        return ''
    if isinstance(payload, list):
        parts: list[str] = []
        for item in payload:
            if isinstance(item, str):
                parts.append(item)
                continue
            if isinstance(item, dict):
                text = item.get('text')
                if isinstance(text, str):
                    parts.append(text)
        return ''.join(parts)
    return ''


def _retry_backoff_seconds(retry_index: int) -> float:
    return _BACKOFF_BASE_SECONDS * (2 ** max(0, retry_index - 1))


def _parse_retry_after_seconds(header_value: str | None) -> float | None:
    if not header_value:
        return None
    value = header_value.strip()
    if not value:
        return None

    try:
        return max(0.0, float(value))
    except ValueError:
        pass

    parsed = email.utils.parsedate_to_datetime(value)
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return max(0.0, (parsed - datetime.now(timezone.utc)).total_seconds())


def _is_retryable_status(status_code: int) -> bool:
    return status_code == 429 or 500 <= status_code <= 599


def _maybe_restore_capacity_unlocked() -> None:
    global _degraded, _degraded_slot_held, _degraded_slot_task
    if not _degraded:
        return
    if time.monotonic() < _degraded_until:
        return

    _degraded = False
    if _degraded_slot_held:
        _request_semaphore.release()
        _degraded_slot_held = False
    elif _degraded_slot_task is not None and not _degraded_slot_task.done():
        _degraded_slot_task.cancel()
    _degraded_slot_task = None


async def _hold_degraded_slot() -> None:
    global _degraded_slot_held
    await _request_semaphore.acquire()
    should_release = True
    try:
        async with _limiter_lock:
            if _degraded:
                _degraded_slot_held = True
                should_release = False
    finally:
        if should_release:
            _request_semaphore.release()


async def _record_response_status(status_code: int) -> None:
    global _consecutive_429, _degraded, _degraded_until, _degraded_slot_task
    async with _limiter_lock:
        _maybe_restore_capacity_unlocked()

        if status_code != 429:
            _consecutive_429 = 0
            return

        _consecutive_429 += 1
        _degraded_until = max(_degraded_until, time.monotonic() + _RATE_LIMIT_COOLDOWN_SECONDS)
        if _MAX_CONCURRENCY <= 1:
            return
        if _consecutive_429 < _CONSECUTIVE_429_THRESHOLD:
            return
        if _degraded:
            return

        _degraded = True
        if _degraded_slot_task is None or _degraded_slot_task.done():
            _degraded_slot_task = asyncio.create_task(_hold_degraded_slot())


@asynccontextmanager
async def _acquire_request_slot() -> AsyncGenerator[None, None]:
    async with _limiter_lock:
        _maybe_restore_capacity_unlocked()

    await _request_semaphore.acquire()
    try:
        yield
    finally:
        _request_semaphore.release()


async def _stream_chat_completions(
    messages: list[dict[str, Any]],
    model: str,
    api_key_override: str | None = None,
) -> AsyncGenerator[str, None]:
    api_key = _get_api_key(model, api_key_override)
    model_name = MODELS.get(model)
    if not model_name:
        raise AIServiceError(f'不支持的模型: {model}')

    url = f"{_get_base_url(model)}/chat/completions"
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
    }
    body = {
        'model': model_name,
        'messages': messages,
        'stream': True,
        'temperature': 0.2,
        'enable_thinking': True,
    }

    emitted = False
    for retry_index in range(_MAX_RETRIES + 1):
        try:
            async with _acquire_request_slot():
                async with _get_http_client() as client:
                    async with client.stream('POST', url, headers=headers, json=body) as response:
                        await _record_response_status(response.status_code)

                        try:
                            response.raise_for_status()
                        except httpx.HTTPStatusError as exc:
                            await exc.response.aread()
                            detail = exc.response.text
                            should_retry = (
                                not emitted
                                and _is_retryable_status(exc.response.status_code)
                                and retry_index < _MAX_RETRIES
                            )
                            if should_retry:
                                retry_after = _parse_retry_after_seconds(
                                    exc.response.headers.get('Retry-After')
                                )
                                wait_seconds = (
                                    retry_after
                                    if retry_after is not None
                                    else _retry_backoff_seconds(retry_index + 1)
                                )
                                if wait_seconds > 0:
                                    await asyncio.sleep(wait_seconds)
                                continue
                            raise AIServiceError(
                                f'模型请求失败: {exc.response.status_code} {detail}'
                            ) from exc

                        async for line in response.aiter_lines():
                            if not line or not line.startswith('data:'):
                                continue
                            raw = line[len('data:') :].strip()
                            if raw == '[DONE]':
                                break
                            try:
                                event = json.loads(raw)
                            except json.JSONDecodeError:
                                continue

                            if event.get('error'):
                                raise AIServiceError(str(event['error']))

                            choices = event.get('choices')
                            if not choices:
                                continue
                            delta = choices[0].get('delta', {})
                            text = _extract_text(delta.get('content'))
                            if not text:
                                message = choices[0].get('message', {})
                                text = _extract_text(message.get('content'))
                            if text:
                                emitted = True
                                yield text
            return
        except httpx.TransportError as exc:
            if emitted or retry_index >= _MAX_RETRIES:
                raise AIServiceError(f'模型连接失败: {exc}') from exc
            wait_seconds = _retry_backoff_seconds(retry_index + 1)
            if wait_seconds > 0:
                await asyncio.sleep(wait_seconds)

    raise AIServiceError('模型请求重试次数已用尽')


async def stream_page_explanation(
    *,
    image_path: Path,
    page_number: int,
    total_pages: int,
    model: str,
    api_key_override: str | None = None,
    prev_image_path: Path | None = None,
) -> AsyncGenerator[str, None]:
    data_url = _image_to_data_url(image_path)
    prev_data_url = _image_to_data_url(prev_image_path) if prev_image_path else None

    system_prompt = (
        '你是课件伴学助手。默认风格：短、直、实用。\n'
        '仔细观察图片，提取其中的所有重要文本信息、图表结构和说明文字\n'
        '任务：帮用户快速理解并能用上本页内容，不做演讲式讲解\n'
        '硬性要求：不寒暄，不自我介绍，禁止出现套话\n'
        'Markdown格式输出：段落、列表、行内公式 $...$、块公式 $$...$$\n'
        '优先用 ##、### 标题，不要只写"1. 2. 3."伪标题\n'
    )

    if prev_data_url:
        user_content: list[dict] = [
            {'type': 'text', 'text': (
                f'以下是课件第 {page_number - 1} 页（上一页）和第 {page_number} 页（当前页），共 {total_pages} 页。\n'
                '请专注解读【当前页】（第二张图）的内容。\n'
                '上一页图片仅供识别跨页延续的概念、推导或题目，不要重复或总结上一页内容。\n'
                '尽量不要用括号做行内注释，术语直接用，必要时单独一行解释\n'
                '不要仅仅描述图片内容，对考试重难点必须做出解读\n'
                '简体中文回答\n'
            )},
            {'type': 'image_url', 'image_url': {'url': prev_data_url}},
            {'type': 'image_url', 'image_url': {'url': data_url}},
        ]
    else:
        user_content = [
            {'type': 'text', 'text': (
                f'这是课件第 {page_number} 页（共 {total_pages} 页）。\n'
                '尽量不要用括号做行内注释，术语直接用，必要时单独一行解释\n'
                '不要仅仅描述图片内容，对考试重难点必须做出解读\n'
                '简体中文回答\n'
            )},
            {'type': 'image_url', 'image_url': {'url': data_url}},
        ]

    messages = [
        {'role': 'system', 'content': system_prompt},
        {'role': 'user', 'content': user_content},
    ]

    async for text in _stream_chat_completions(messages, model, api_key_override):
        yield text


async def stream_chat_answer(
    *,
    page_number: int,
    explanation: str,
    history: list[dict[str, str]],
    user_message: str,
    model: str,
    api_key_override: str | None = None,
) -> AsyncGenerator[str, None]:
    system_prompt = (
        f'你是课程助教，正在帮学生理解课件第 {page_number} 页。\n'
        '该页解读如下：\n'
        '---\n'
        f'{explanation}\n'
        '---\n'
        '回答规则：\n'
        '1. 优先结合本页内容回答\n'
        '2. 超出本页范围时可适当扩展，但要说明"这超出了本页范围"\n'
        '3. 直接回答，不要废话\n'
        '4. 公式用文字解释\n'
        '5. 回答时禁止堆叠emoji\n'
        '可用 Markdown：段落、列表、行内公式 $...$、块公式 $$...$$'
    )

    messages: list[dict[str, Any]] = [{'role': 'system', 'content': system_prompt}]
    for turn in history:
        role = turn.get('role', 'user')
        content = turn.get('content', '')
        if role not in {'user', 'assistant'}:
            continue
        if not isinstance(content, str) or not content.strip():
            continue
        messages.append({'role': role, 'content': content})

    messages.append({'role': 'user', 'content': user_message})

    async for text in _stream_chat_completions(messages, model, api_key_override):
        yield text
