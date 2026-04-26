@echo off
chcp 65001 >nul
cd /d "%~dp0backend"

if not exist .venv (
    python -m venv .venv
)

call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt

uvicorn main:app --reload --host 127.0.0.1 --port 8000
pause
