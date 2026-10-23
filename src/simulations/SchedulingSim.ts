import {
  type SchedulingAlgo,
  type SimProcess,
  runScheduling,
  sampleProcesses,
  algoLabels,
} from '@/simulations/schedulingLogic';
import { applyAccent, esc, icon, Stepper } from './ui';

const ALGOS: SchedulingAlgo[] = ['fcfs', 'sjf', 'round-robin', 'priority'];

/** Simulasi penjadwalan CPU (port dari SchedulingSim.tsx Modul 6). */
export function mountSchedulingSim(host: HTMLElement, accent: string): () => void {
  applyAccent(host, accent);
  host.classList.add('sim');

  let algo: SchedulingAlgo = 'fcfs';
  let quantum = 2;

  host.innerHTML = `
    <div class="sim-algos">
      ${ALGOS.map((a) => `<button type="button" class="sim-pill" data-algo="${a}">${esc(algoLabels[a])}</button>`).join('')}
    </div>
    <div class="sim-field" data-role="quantum-row" hidden>
      <label>Quantum:</label>
      <input type="number" min="1" max="10" value="${quantum}" data-role="quantum" />
    </div>
    <div class="sim-scroll"><table class="sim-table" data-role="table"></table></div>
    <div>
      <div class="sim-label">Gantt Chart</div>
      <div class="sim-gantt" data-role="gantt"></div>
    </div>
    <div class="sim-controls">
      <button type="button" class="sim-btn primary" data-act="toggle"></button>
      <button type="button" class="sim-btn" data-act="step">${icon('step')}Langkah</button>
      <button type="button" class="sim-btn" data-act="reset">${icon('reset')}Reset</button>
    </div>
    <div class="sim-results">
      <div class="sim-stat"><span>Avg Waiting</span><b data-role="avg-wait"></b></div>
      <div class="sim-stat"><span>Avg Turnaround</span><b data-role="avg-tat"></b></div>
    </div>
    <div class="sim-note">${icon('alert')}<span>Data proses di atas adalah contoh untuk demonstrasi algoritma, bukan data produksi.</span></div>
  `;

  const q = <T extends HTMLElement>(sel: string) => host.querySelector(sel) as T;
  const table = q<HTMLTableElement>('[data-role="table"]');
  const gantt = q<HTMLElement>('[data-role="gantt"]');
  const toggle = q<HTMLButtonElement>('[data-act="toggle"]');
  const stepBtn = q<HTMLButtonElement>('[data-act="step"]');
  const quantumRow = q<HTMLElement>('[data-role="quantum-row"]');
  const quantumInput = q<HTMLInputElement>('[data-role="quantum"]');

  const result = () => runScheduling(algo, sampleProcesses, quantum);
  const stepper = new Stepper(() => result().steps.length, () => render());

  function render(): void {
    const res = result();
    const displayIdx = stepper.displayIdx;
    const activeProcessId = stepper.started ? res.steps[displayIdx]?.processId : null;

    host.querySelectorAll<HTMLElement>('[data-algo]').forEach((b) => {
      b.classList.toggle('active', b.dataset.algo === algo);
    });
    quantumRow.hidden = algo !== 'round-robin';

    table.innerHTML = `
      <thead><tr>
        <th class="l">Proses</th><th>Arrival</th><th>Burst</th><th>Priority</th><th>Wait</th><th>TAT</th>
      </tr></thead>
      <tbody>
        ${sampleProcesses
          .map(
            (p: SimProcess) => `<tr class="${activeProcessId === p.id ? 'sim-row-active' : ''}">
              <td class="l strong">${esc(p.name)}</td>
              <td>${p.arrival}</td><td>${p.burst}</td><td>${p.priority}</td>
              <td>${res.waitingTimes[p.id]}</td><td>${res.turnaroundTimes[p.id]}</td>
            </tr>`
          )
          .join('')}
      </tbody>`;

    gantt.innerHTML = res.steps
      .map((step, i) => {
        const isPast = i <= displayIdx;
        const isCurrent = stepper.playing && i === displayIdx;
        const state = isCurrent ? 'current' : isPast ? 'past' : 'future';
        return `<div class="sim-gantt-cell ${state}"><b>${esc(step.processName)}</b><small>${step.start}-${step.end}</small></div>`;
      })
      .join('');

    toggle.innerHTML = stepper.playing ? `${icon('pause')}Jeda` : `${icon('play')}Mulai`;
    stepBtn.disabled = stepper.playing || stepper.atEnd;

    q<HTMLElement>('[data-role="avg-wait"]').textContent = res.avgWaiting.toFixed(2);
    q<HTMLElement>('[data-role="avg-tat"]').textContent = res.avgTurnaround.toFixed(2);
  }

  const onClick = (event: Event) => {
    const el = (event.target as HTMLElement).closest<HTMLElement>('[data-algo], [data-act]');
    if (!el || !host.contains(el)) return;
    if (el.dataset.algo) {
      algo = el.dataset.algo as SchedulingAlgo;
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
  const onQuantum = () => {
    const v = parseInt(quantumInput.value, 10);
    if (v >= 1) {
      quantum = v;
      stepper.reset();
    }
  };

  host.addEventListener('click', onClick);
  quantumInput.addEventListener('input', onQuantum);
  render();

  return () => {
    stepper.dispose();
    host.removeEventListener('click', onClick);
    quantumInput.removeEventListener('input', onQuantum);
  };
}
