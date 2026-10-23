import { fileURLToPath } from 'node:url';
import { generateKeyPairSync } from 'node:crypto';
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev`       : HTTP biasa → http://localhost:5173 (localhost sudah dianggap aman,
//                       kamera & WebXR tetap bisa dipakai di laptop).
// `npm run dev:https` : HTTPS self-signed → https://localhost:5173, dipakai untuk membuka
//                       dari HP lewat jaringan (WebXR/kamera di HP wajib HTTPS).
// PENTING: server HTTPS TIDAK menjawab permintaan http:// (hasilnya ERR_EMPTY_RESPONSE /
// "Empty reply from server"), karena itu HTTPS tidak lagi menjadi default.
const canGenerateCert = (() => {
  try {
    generateKeyPairSync('rsa', { modulusLength: 2048 });
    return true;
  } catch {
    return false;
  }
})();

export default defineConfig(({ command, mode }) => ({
  // './' agar hasil build bisa dipasang di folder mana pun (Netlify, GitHub Pages, dll).
  base: './',
  plugins: command === 'serve' && mode === 'https' && canGenerateCert ? [basicSsl()] : [],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: true, port: 5173, strictPort: true },
  preview: { host: true, port: 4173, strictPort: true },
  build: { chunkSizeWarningLimit: 900 },
}));
