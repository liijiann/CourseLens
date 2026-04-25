@echo off
chcp 65001 >nul
cd /d "%~dp0backend"

if not exist .venv (
    python -m venv .venv
)

call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt

if not exist .env (
    if exist .env.example copy .env.example .env
)

uvicorn main:app --env-file .env --reload --host 127.0.0.1 --port 18000
pause
