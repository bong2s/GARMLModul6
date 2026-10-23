/** Utilitas kecil untuk simulasi (tanpa framework). */

export const ICONS = {
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  step: '<polygon points="13 19 22 12 13 5 13 19"/><polygon points="2 19 11 12 2 5 2 19"/>',
  reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  alert:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
} as const;

export function icon(name: keyof typeof ICONS): string {
  return `<svg class="sim-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

export function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function applyAccent(host: HTMLElement, hex: string): void {
  host.style.setProperty('--sim-c', hex);
  host.style.setProperty('--sim-c-bg', rgba(hex, 0.15));
  host.style.setProperty('--sim-c-bd', rgba(hex, 0.4));
  host.style.setProperty('--sim-c-soft', rgba(hex, 0.1));
}

export function esc(text: string | number): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Pemutar langkah: Mulai / Jeda / Langkah / Reset, auto-lanjut 700 ms. */
export class Stepper {
  /** true setelah pengguna menekan Mulai atau Langkah; false = tampilkan hasil akhir. */
  started = false;
  playing = false;
  stepIdx = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly total: () => number,
    private readonly onChange: () => void
  ) {}

  /** Indeks langkah yang ditampilkan. */
  get displayIdx(): number {
    return this.started ? this.stepIdx : Math.max(this.total() - 1, 0);
  }

  get atEnd(): boolean {
    return this.started && this.stepIdx >= this.total() - 1;
  }

  private clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    this.clear();
    if (!this.playing) return;
    if (this.stepIdx >= this.total() - 1) {
      this.playing = false;
      this.onChange();
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.stepIdx++;
      this.onChange();
      this.schedule();
    }, 700);
  }

  play(): void {
    if (!this.started || this.stepIdx >= this.total() - 1) this.stepIdx = 0;
    this.started = true;
    this.playing = true;
    this.onChange();
    this.schedule();
  }

  pause(): void {
    this.playing = false;
    this.clear();
    this.onChange();
  }

  step(): void {
    if (this.playing) return;
    if (!this.started) {
      this.started = true;
      this.stepIdx = 0;
    } else if (this.stepIdx < this.total() - 1) {
      this.stepIdx++;
    }
    this.onChange();
  }

  reset(): void {
    this.clear();
    this.playing = false;
    this.started = false;
    this.stepIdx = 0;
    this.onChange();
  }

  dispose(): void {
    this.clear();
    this.playing = false;
  }
}
