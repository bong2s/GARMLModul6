# GARML Modul 6 — Sistem Operasi, Penjadwalan & Manajemen Memori (AR)

Aplikasi web AR (Three.js + WebXR). Mesin, tampilan, dan permodelan identik
dengan Modul 4; isi (materi, model, alur, simulasi) adalah Modul 6.

## Isi modul

| No | Topik | Model 3D | Isi tambahan |
|----|-------|----------|--------------|
| 01 | Kompetensi Sistem Operasi | Motherboard & Komponen | — |
| 02 | Penjadwalan Proses | CPU / Prosesor | Simulasi penjadwalan (FCFS, SJF, Round Robin, Priority) |
| 03 | Manajemen Memori | RAM | Simulasi penggantian halaman (FIFO, LRU, Optimal) |

## Menjalankan di Windows (cara termudah)

1. Pasang **Node.js LTS** dari https://nodejs.org (sekali saja).
2. Ekstrak ZIP, lalu **klik dua kali `START_GARML_AR.bat`**. Dependensi dipasang otomatis pada
   pemakaian pertama (butuh internet), lalu browser terbuka di **http://localhost:5173/**.
3. Bila ada masalah, klik dua kali **`CHECK_GARML_AR.bat`**: memeriksa Node, dependensi, file GLB,
   port 5173, TypeScript, dan build, dengan pesan `[OK]` / `[GAGAL]`.
4. Untuk mencoba dari **HP** lewat Wi-Fi yang sama: klik **`START_GARML_AR_HP_HTTPS.bat`**, lalu buka
   alamat `https://192.168.x.x:5173` ("Network") di HP. Wajib `https://`; terima peringatan sertifikat.

> **Penyebab ERR_EMPTY_RESPONSE sebelumnya:** `npm run dev` lama memakai HTTPS (sertifikat self-signed),
> sedangkan alamat yang dibuka `http://...`. Server HTTPS tidak menjawab permintaan `http://` sehingga
> browser menampilkan ERR_EMPTY_RESPONSE dan curl "Empty reply from server". Sekarang `npm run dev`
> memakai HTTP biasa; HTTPS hanya lewat `npm run dev:https`.

Perintah manual (opsional):

```bash
npm install
npm run dev          # http://localhost:5173  (laptop)
npm run dev:https    # https://localhost:5173 (untuk HP)
npm run typecheck
npm run build        # hasil di dist/
npm run preview      # http://localhost:4173, menguji hasil build
```

`dist/` harus disajikan lewat server (hosting statis / `npm run preview`), bukan dibuka langsung dengan
klik dua kali `index.html`. AR terlacak (WebXR) memerlukan **Android + Chrome + ARCore** lewat **HTTPS**.
Perangkat tanpa WebXR memakai mode cadangan (kamera + sensor orientasi, bukan AR terlacak), dan bila
kamera ditolak tetap tersedia viewer 3D biasa.

## Cara pakai di aplikasi (sama persis dengan Modul 4)

**Pratinjau 3D**
- 1 jari = putar seluruh susunan, 2 jari = geser + cubit zoom
  (mouse: kiri putar, kanan geser, roda zoom).
- Ketuk komponen / titik berwarna / pill / chip alur: materinya terbuka dan komponen lain
  meredup 20%. Rotasi, posisi, dan zoom **tidak** direset saat berganti komponen.
- **Reset View** / **ALL** mengembalikan tampilan awal (meja dilihat serong dari atas).

**Mulai AR**
- Seluruh komponen tampil utuh, muncul sekitar 0,6 m di depan kamera (sedikit di atas tinggi kamera agar sisi bawah mudah dilihat),
  skala dihitung dari FOV kamera supaya tidak terpotong, dan terkunci di ruang.
- Tidak ada gestur jari yang menggerakkan model: sudut pandang berubah dengan
  **menggerakkan/memutar HP** (kanan, kiri, atas, bawah).
- Ketuk titik berwarna / komponen untuk materinya. Tombol: Tempatkan ulang, Reset, Keluar AR.
- Jarak/elevasi awal diubah di `SceneManager.SPAWN` (`src/engine/SceneManager.ts`).

## Permodelan (mengikuti Modul 4)

- `ARSession.ts` = ARSession Modul 4 + penguncian dunia (build AR-v8): penempatan di udara pada pose kamera (jarak SPAWN.distance) begitu tracking stabil (hit-test ke permukaan bisa diaktifkan lewat `PREFER_SURFACE_HIT`), lalu model diikat ke anchor WebXR. Transformasi model tidak pernah diturunkan dari pose kamera. `SceneManager.ts` identik kecuali bayangan yang hanya dihitung ulang saat susunan bergerak (lebih ringan, tampilan sama).
- `ARApp.ts` = ARApp Modul 4 + penyaji materi Modul 6, simulasi, dan kotak penanda bila GLB gagal dimuat.
- Tiap model: dirata-skalakan ke sisi terpanjang 2,3–2,4, berpusat di x/z, alas di y = 0,
  ditaruh pada sel meja dengan jarak Modul 4 (x = ±2,5 ; z = ±2,0), lalu seluruh susunan
  dipusatkan di titik asal.
- Motherboard aslinya berdiri tegak; direbahkan (`rotateX` di `models.ts`) seperti model
  Modul 4 supaya permukaannya terlihat dari atas.
- Bayangan, pencahayaan, estimasi cahaya WebXR, hotspot + label + garis penunjuk,
  peredupan 20%, dan orientasi awal `Euler(0.62, -0.42, 0, 'YXZ')` sama dengan Modul 4.

## Struktur

```
src/
  engine/      ARApp, SceneManager, ARSession (permodelan Modul 4), optimize (gabung mesh)
  styles/      ar.css, base.css (Modul 4 + blok list/note/simulasi Modul 6 di bagian bawah)
  data/        learningContent.ts, topics.ts  ← SUMBER MATERI (dari Modul 6, tidak diubah)
  constants/   models.ts (pemetaan GLB, ukuran, sel, rotateX), topics.ts (adaptor), module.ts (teks modul)
  simulations/ logika simulasi (dari Modul 6) + tampilan tanpa framework
public/models/ tiga file GLB
```

## Mengubah isi

- **Materi**: edit `src/data/learningContent.ts` / `src/data/topics.ts`.
- **Model / posisi / ukuran**: `src/constants/models.ts`.
- **Menghapus catatan "Verifikasi konten final…"**: setel `sourceVerified: true` pada tiap topik di
  `src/data/learningContent.ts` dan `src/data/topics.ts` setelah materi diperiksa.
- **Teks modul** (judul, intro panel): `src/constants/module.ts` dan `index.html`.

## Catatan teknis

- Panel AR menampilkan status `tracking`, `anchor`, `tempat` (cara penempatan) dan baris debug seperti Modul 4: `jarak … m · kotak … · skala …`. Saat HP digerakkan, nilai *jarak* harus berubah; bila tetap, model menempel ke kamera.
- Beban render diringankan tanpa mengubah tampilan: tekstur > 1024 px diperkecil, oklusi hotspot memakai kotak pembatas (bukan tiap segitiga), bayangan tidak dihitung tiap frame.

- Mesh bermaterial sama digabung saat dimuat (`src/engine/optimize.ts`): motherboard 720 → 59 mesh,
  jumlah segitiga dan tampilan tidak berubah.
- Model yang gagal dimuat diganti kotak penanda berwarna agar topiknya tetap bisa dipilih.
