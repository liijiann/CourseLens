@echo off
chcp 65001 >nul
cd /d "%~dp0frontend"

if not exist .env.local (
    if exist .env.example copy .env.example .env.local
)

call npm install
call npm run dev
pause
