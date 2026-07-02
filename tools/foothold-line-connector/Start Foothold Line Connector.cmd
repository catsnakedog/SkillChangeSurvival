@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install Node.js or run this from an environment where node is on PATH.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$port=3147; $url='http://localhost:3147/';" ^
  "$running=$false;" ^
  "try { Invoke-WebRequest -Uri ($url + 'api/status') -UseBasicParsing -TimeoutSec 1 | Out-Null; $running=$true } catch { $running=$false }" ^
  "if (-not $running) { Start-Process -WindowStyle Hidden -FilePath 'node' -ArgumentList 'server.mjs' -WorkingDirectory (Get-Location).Path; Start-Sleep -Milliseconds 900 }" ^
  "Start-Process $url"

exit /b 0
