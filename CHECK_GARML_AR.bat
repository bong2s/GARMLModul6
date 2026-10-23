@echo off
setlocal
cd /d "%~dp0"
title GARML AR Modul 6 - Pemeriksaan
set FAIL=0

echo ===== 1. Node.js dan npm =====
where node >nul 2>&1
if errorlevel 1 ( echo [GAGAL] Node.js tidak ditemukan. Pasang LTS dari https://nodejs.org & goto summary )
for /f "delims=" %%v in ('node -v') do echo Node.js %%v
for /f "delims=" %%v in ('npm -v') do echo npm %%v

echo.
echo ===== 2. Dependensi =====
if not exist "node_modules\vite\package.json" ( echo [GAGAL] node_modules belum lengkap. Jalankan: npm install & set FAIL=1 ) else ( echo [OK] vite terpasang )
if not exist "node_modules\three\package.json" ( echo [GAGAL] three belum terpasang & set FAIL=1 ) else ( echo [OK] three terpasang )
if not exist "node_modules\typescript\package.json" ( echo [GAGAL] typescript belum terpasang & set FAIL=1 ) else ( echo [OK] typescript terpasang )
if "%FAIL%"=="1" goto summary

echo.
echo ===== 3. File model GLB =====
for %%f in (motherboard_components_compressed pc_cpu_processor_optimized random_access_memory_ram_ddr4_compressed) do (
  if exist "public\models\%%f.glb" ( echo [OK] %%f.glb ) else ( echo [GAGAL] public\models\%%f.glb tidak ada & set FAIL=1 )
)

echo.
echo ===== 4. Port server 5173 =====
netstat -ano | findstr /R /C:":5173 .*LISTENING" >nul
if errorlevel 1 (
  echo Port 5173 bebas. Server belum berjalan, jalankan START_GARML_AR.bat.
) else (
  echo Port 5173 dipakai. Menguji respons...
  curl.exe -s -o nul -m 8 -w "HTTP biasa  http://localhost:5173/  -> kode %%{http_code}\n" http://localhost:5173/
  curl.exe -sk -o nul -m 8 -w "HTTPS       https://localhost:5173/ -> kode %%{http_code}\n" https://localhost:5173/
  echo Kode 200 = benar. Kode 000 = server tidak menjawab di protokol itu.
  echo Jika hanya HTTPS yang 200, server berjalan mode HTTPS: buka alamat https://.
)

echo.
echo ===== 5. TypeScript =====
call npx tsc --noEmit
if errorlevel 1 ( echo [GAGAL] Ada error TypeScript di atas. & set FAIL=1 ) else ( echo [OK] TypeScript bersih )

echo.
echo ===== 6. Build =====
call npm run build
if errorlevel 1 ( echo [GAGAL] Build gagal. Lihat pesan di atas. & set FAIL=1 ) else ( echo [OK] Build berhasil, hasil di folder dist )

:summary
echo.
if "%FAIL%"=="0" ( echo ===== SEMUA PEMERIKSAAN LULUS ===== ) else ( echo ===== ADA PEMERIKSAAN YANG GAGAL, lihat tanda [GAGAL] di atas ===== )
pause
