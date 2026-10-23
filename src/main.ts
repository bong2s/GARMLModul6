import './styles/base.css';
import './styles/ar.css';
import { ARApp } from './engine/ARApp';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('MODUL6: #app tidak ditemukan.');
root.classList.add('ar-root');

function showFatal(error: unknown): void {
  console.error('MODUL6 gagal dimulai:', error);
  const reason = error instanceof Error ? error.message : String(error);
  const box = document.createElement('div');
  box.className = 'fatal-error';
  box.setAttribute('role', 'alert');
  const title = document.createElement('strong');
  title.textContent = 'Aplikasi gagal dimulai';
  const detail = document.createElement('p');
  detail.textContent = reason;
  const hint = document.createElement('p');
  hint.textContent = 'Kemungkinan penyebab: WebGL tidak aktif/didukung browser, atau file model gagal dimuat. Coba Chrome/Edge terbaru.';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Muat ulang';
  retry.addEventListener('click', () => location.reload());
  box.append(title, detail, hint, retry);
  root!.replaceChildren(box);
}

try {
  new ARApp(root).init().catch(showFatal);
} catch (error) {
  showFatal(error);
}
