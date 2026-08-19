@echo off
cd /d "%~dp0"
title HatClaw - Acesso pela Internet
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-internet-access.ps1"
pause
