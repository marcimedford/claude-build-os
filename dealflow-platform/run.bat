@echo off
cd /d "%~dp0"
python fetch_data.py
if %errorlevel% equ 0 (
    echo.
    echo Done! Opening dealflow.html...
    start dealflow.html
) else (
    echo.
    echo Error running fetch_data.py - check your .env file and Python installation
    pause
)
