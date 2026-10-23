@echo off
setlocal
cd /d "%~dp0"
title GARML AR Modul 6 - Server HTTPS untuk HP

where node >nul 2>&1
if errorlevel 1 goto nonode

if exist "node_modules\vite\package.json" goto havedeps
echo Memasang dependensi. Hanya sekali, butuh internet...
call npm install
if errorlevel 1 goto npmfail

:havedeps
netstat -ano | findstr /R /C:":5173 .*LISTENING" >nul
if not errorlevel 1 goto portbusy

echo.
echo  Mode HTTPS untuk HP. WAJIB memakai https:// bukan http://
echo  Di laptop: https://localhost:5173/
echo  Di HP: buka alamat "Network" https://192.168.x.x:5173/ yang tampil di bawah.
echo  Browser akan memperingatkan sertifikat self-signed: pilih Lanjutkan.
echo.
start "" cmd /c "timeout /t 6 /nobreak >nul & start https://localhost:5173/"
call npm run dev:https
pause
exit /b 0

:nonode
echo [ERROR] Node.js belum terpasang. Pasang versi LTS dari https://nodejs.org
pause
exit /b 1

:npmfail
echo [ERROR] npm install gagal. Periksa koneksi internet.
pause
exit /b 1

:portbusy
echo [ERROR] Port 5173 sudah dipakai. Tutup server lama dulu.
pause
exit /b 1
