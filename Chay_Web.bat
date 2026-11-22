@echo off
title VTPATE Studio - Story Crawler Web App
cd /d "%~dp0"
echo ==============================================================
echo     DANG KHOI CHAY GIAO DIEN WEB (VTPATE WEB STUDIO)...
echo     Dia chi: http://127.0.0.1:5000
echo ==============================================================
start "" http://127.0.0.1:5000
python web_server.py
pause
