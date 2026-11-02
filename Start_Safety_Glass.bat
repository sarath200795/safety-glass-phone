@echo off
cd /d "%~dp0"
set PY=%LOCALAPPDATA%\Programs\Python\Python311\python.exe
if not exist "%PY%" set PY=python
echo Starting Safety Glass at http://localhost:8000  (close this window to stop)
start "" http://localhost:8000/index.html
"%PY%" -m http.server 8000 --bind 127.0.0.1
