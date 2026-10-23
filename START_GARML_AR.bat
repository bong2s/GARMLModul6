@echo off
setlocal
cd /d "%~dp0"
title GARML AR Modul 6 - Server

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
echo  Server akan berjalan di:  http://localhost:5173/
echo  Browser terbuka otomatis. Tutup jendela ini untuk menghentikan server.
echo  Untuk mencoba dari HP lewat Wi-Fi, pakai START_GARML_AR_HP_HTTPS.bat
echo.
start "" cmd /c "timeout /t 5 /nobreak >nul & start http://localhost:5173/"
call npm run dev
echo.
echo Server berhenti. Jalankan CHECK_GARML_AR.bat bila ada error di atas.
pause
exit /b 0

:nonode
echo [ERROR] Node.js belum terpasang. Pasang versi LTS dari https://nodejs.org lalu klik ulang file ini.
pause
exit /b 1

:npmfail
echo [ERROR] npm install gagal. Periksa koneksi internet lalu jalankan CHECK_GARML_AR.bat.
pause
exit /b 1

:portbusy
echo [ERROR] Port 5173 sudah dipakai program lain, mungkin jendela server GARML yang lama.
echo Tutup jendela server lama, lalu klik ulang file ini.
pause
exit /b 1
