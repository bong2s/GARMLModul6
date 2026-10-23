import {
  type ReplacementAlgo,
  runReplacement,
  sampleReferences,
  sampleFrameCount,
  algoLabels,
} from '@/simulations/memoryLogic';
import { applyAccent, esc, icon, Stepper } from './ui';

const ALGOS: ReplacementAlgo[] = ['fifo', 'lru', 'optimal'];

/** Simulasi penggantian halaman (port dari MemorySim.tsx Modul 6). */
export function mountMemorySim(host: HTMLElement, accent: string): () => void {
  applyAccent(host, accent);
  host.classList.add('sim');

  let algo: ReplacementAlgo = 'fifo';
  let frameCount = sampleFrameCount;
  const references = sampleReferences;

  host.innerHTML = `
    <div class="sim-algos">
      ${ALGOS.map((a) => `<button type="button" class="sim-pill" data-algo="${a}">${esc(algoLabels[a])}</button>`).join('')}
    </div>
    <div class="sim-field">
      <label>Jumlah Frame:</label>
      <input type="number" min="1" max="6" value="${frameCount}" data-role="frames" />
    </div>
    <div>
      <div class="sim-label">Urutan Referensi Halaman</div>
      <div class="sim-refs" data-role="refs"></div>
    </div>
    <div>
      <div class="sim-label">Status Frame</div>
      <div class="sim-scroll"><table class="sim-table compact" data-role="table"></table></div>
    </div>
    <div class="sim-controls">
      <button type="button" class="sim-btn primary" data-act="toggle"></button>
      <button type="button" class="sim-btn" data-act="step">${icon('step')}Langkah</button>
      <button type="button" class="sim-btn" data-act="reset">${icon('reset')}Reset</button>
    </div>
    <div class="sim-results">
      <div class="sim-stat fault"><span>Total Page Fault</span><b data-role="faults"></b></div>
      <div class="sim-stat hit"><span>Total Hit</span><b data-role="hits"></b></div>
    </div>
    <div class="sim-note">${icon('alert')}<span>Urutan referensi dan jumlah frame adalah contoh untuk demonstrasi algoritma.</span></div>
  `;

  const q = <T extends HTMLElement>(sel: string) => host.querySelector(sel) as T;
  const refsEl = q<HTMLElement>('[data-role="refs"]');
  const table = q<HTMLTableElement>('[data-role="table"]');
  const toggle = q<HTMLButtonElement>('[data-act="toggle"]');
  const stepBtn = q<HTMLButtonElement>('[data-act="step"]');
  const framesInput = q<HTMLInputElement>('[data-role="frames"]');

  const result = () => runReplacement(algo, references, frameCount);
  const stepper = new Stepper(() => result().steps.length, () => render());

  function render(): void {
    const res = result();
    const displayIdx = stepper.displayIdx;
    const visibleSteps = res.steps.slice(0, displayIdx + 1);

    host.querySelectorAll<HTMLElement>('[data-algo]').forEach((b) => {
      b.classList.toggle('active', b.dataset.algo === algo);
    });

    refsEl.innerHTML = references
      .map((ref, i) => {
        const state = i === displayIdx ? 'current' : i < displayIdx ? 'past' : 'future';
        return `<span class="sim-ref ${state}">${ref}</span>`;
      })
      .join('');

    const head = Array.from({ length: frameCount }, (_, i) => `<th>F${i}</th>`).join('');
    const rows = visibleSteps
      .map((step, i) => {
        const cells = Array.from({ length: frameCount }, (_, fi) => {
          const page = step.frames[fi];
          const isReplaced =
            step.isFault &&
            step.replacedPage !== undefined &&
            visibleSteps[i - 1]?.frames[fi] === step.replacedPage &&
            page !== step.replacedPage;
          const cls =
            page === null
              ? 'dim'
              : step.isFault && fi === step.frames.indexOf(step.reference)
                ? 'warn'
                : '';
          return `<td class="${cls}">${page === null ? '-' : page}${isReplaced ? '<span class="sim-replaced">*</span>' : ''}</td>`;
        }).join('');
        return `<tr class="${i === displayIdx ? 'sim-row-active' : ''}">
          <td class="l strong">${step.reference}</td>${cells}
          <td>${step.isFault ? '<span class="sim-fault">Fault</span>' : '<span class="sim-hit">Hit</span>'}</td>
        </tr>`;
      })
      .join('');
    table.innerHTML = `<thead><tr><th class="l">Ref</th>${head}<th>Status</th></tr></thead><tbody>${rows}</tbody>`;

    toggle.innerHTML = stepper.playing ? `${icon('pause')}Jeda` : `${icon('play')}Mulai`;
    stepBtn.disabled = stepper.playing || stepper.atEnd;

    q<HTMLElement>('[data-role="faults"]').textContent = String(res.totalFaults);
    q<HTMLElement>('[data-role="hits"]').textContent = String(res.totalHits);
  }

  const onClick = (event: Event) => {
    const el = (event.target as HTMLElement).closest<HTMLElement>('[data-algo], [data-act]');
    if (!el || !host.contains(el)) return;
    if (el.dataset.algo) {
      algo = el.dataset.algo as ReplacementAlgo;
      stepper.reset();
      return;
    }
    switch (el.dataset.act) {
      case 'toggle':
        if (stepper.playing) stepper.pause();
        else stepper.play();
        break;
      case 'step':
        stepper.step();
        break;
      case 'reset':
        stepper.reset();
        break;
    }
  };
  const onFrames = () => {
    const v = parseInt(framesInput.value, 10);
    if (v >= 1 && v <= 6) {
      frameCount = v;
      stepper.reset();
    }
  };

  host.addEventListener('click', onClick);
  framesInput.addEventListener('input', onFrames);
  render();

  return () => {
    stepper.dispose();
    host.removeEventListener('click', onClick);
    framesInput.removeEventListener('input', onFrames);
  };
}
