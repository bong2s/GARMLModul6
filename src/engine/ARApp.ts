import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { MODEL_CONFIG } from '@/constants/models';
import { MODULE } from '@/constants/module';
import { TOPICS } from '@/constants/topics';
import { mountSimulation, type SimType } from '@/simulations';
import type { InfoBlock, Topic, TopicFocus, TopicId } from '@/types/ar';

import { glbUrlForTopic } from './assets';
import { ARSession, type ARState } from './ARSession';
import { downscaleTextures, mergeStaticMeshes } from './optimize';
import { SceneManager } from './SceneManager';

/**
 * ARApp — mesin permodelan identik Modul 4 (port Modul 2); hanya materi, model, dan simulasi yang Modul 6.
 *
 * Pola yang dipertahankan dari Modul 2:
 *   • kamera belakang sebagai latar + canvas three.js transparan
 *   • top bar: pill filter kategori (+ jumlah) dan tombol "Reset View"
 *   • hotspot: titik berwarna di model + label di luar bounding box model
 *     dengan garis penunjuk SVG, anti-tabrakan, smoothing LERP,
 *     memudar saat gestur, dan redup bila tertutup model
 *   • hint gestur (PUTAR / PINDAH / ZOOM), panel "ALUR URUTAN KOMPONEN"
 *   • bottom sheet informasi (handle + tombol tutup)
 *   • memilih komponen TIDAK mereset rotasi / posisi / zoom
 *   • komponen non-aktif diredupkan menjadi 20% opacity
 */

interface HotspotElement {
  topicId: TopicId;
  dot: HTMLButtonElement;
  label: HTMLButtonElement;
  leader: SVGLineElement;
  /** Titik tempel pada ruang lokal modelRoot */
  anchor: THREE.Vector3;
  smoothedX: number;
  smoothedY: number;
  smoothedVisible: boolean;
  occluded: boolean;
}

interface MaterialState {
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
}

const GESTURE_SVG = {
  rotate:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3.5-7.1"/><path d="M21 4v5h-5"/></svg>',
  pan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3"/><path d="M12 2v20M2 12h20"/></svg>',
  zoom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35M8 11h6M11 8v6"/></svg>',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderBlocksToHtml(blocks: InfoBlock[], color: string): string {
  const heading = (title?: string) => (title ? `<h3 class="info-sub">${esc(title)}</h3>` : '');

  return blocks
    .map((block) => {
      switch (block.type) {
        case 'p':
          return `${heading(block.title)}<p>${esc(block.text ?? '')}</p>`;

        case 'terms':
          return `${heading(block.title)}
            <dl class="info-terms" style="--c:${color}">
              ${(block.terms ?? [])
                .map((t) => `<div><dt>${esc(t.term)}</dt><dd>${esc(t.desc)}</dd></div>`)
                .join('')}
            </dl>`;

        case 'steps':
          return `${heading(block.title)}
            <ol class="info-steps" style="--c:${color}">
              ${(block.steps ?? [])
                .map(
                  (step, i) =>
                    `<li><span class="info-step-n">${i + 1}</span><div><span>${esc(step)}</span></div></li>`
                )
                .join('')}
            </ol>`;

        case 'list':
          return `${heading(block.title)}
            <ul class="info-list" style="--c:${color}">
              ${(block.items ?? []).map((item) => `<li>${esc(item)}</li>`).join('')}
            </ul>`;

        case 'note':
          return `<div class="info-note" style="--c:${color}">${esc(block.text ?? '')}</div>`;

        case 'cards':
          return `${heading(block.title)}
            <div class="info-cards" style="--c:${color}">
              ${(block.cards ?? [])
                .map(
                  (card) => `<article class="info-card">
                    <header><strong>${esc(card.title)}</strong></header>
                    <p>${esc(card.desc)}</p>
                  </article>`
                )
                .join('')}
            </div>`;

        case 'sim':
          return `${heading(block.title)}<div class="sim-host" data-sim="${block.simType ?? 'scheduling'}" data-accent="${color}"></div>`;

        default:
          return '';
      }
    })
    .join('');
}

export class ARApp {
  private readonly root: HTMLElement;
  private disposed = false;

  private viewport!: HTMLElement;
  private canvasContainer!: HTMLElement;
  private sceneManager!: SceneManager;

  // overlay
  private filterButtons = new Map<string, HTMLButtonElement>();
  private flowButtons = new Map<TopicId, HTMLButtonElement>();
  private panel!: HTMLElement;
  private panelTitle!: HTMLElement;
  private panelCategory!: HTMLElement;
  private panelBody!: HTMLElement;
  private arStatus!: HTMLElement;
  private gestureHints!: HTMLElement;
  private leaderSvg!: SVGSVGElement;
  private arButton!: HTMLButtonElement;
  private modeBadge!: HTMLElement;
  private hud!: HTMLElement;
  private hudMessage!: HTMLElement;
  private hudButtons!: HTMLElement;

  // AR
  private arSession: ARSession | null = null;
  private arSupported = false;
  private arState: ARState = 'idle';
  private arBaseScale = 0.09;
  private simDisposers: Array<() => void> = [];
  private shownTopicId: TopicId | null = null;

  // scene
  private readonly topicGroups = new Map<TopicId, THREE.Group>();
  private modelMeshes: THREE.Mesh[] = [];
  private readonly meshTopic = new Map<THREE.Mesh, TopicId>();
  private readonly materialStates = new Map<THREE.Material, MaterialState>();
  private hotspots: HotspotElement[] = [];
  private readonly occlusionRay = new THREE.Ray();
  private readonly occlusionHit = new THREE.Vector3();
  private readonly groupBox = new THREE.Box3();

  // interaction
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private pointerDown: { id: number; x: number; y: number } | null = null;
  private activePointerCount = 0;
  private gestureActive = false;
  private gestureTimeout: ReturnType<typeof setTimeout> | null = null;
  private frameCounter = 0;

  private readonly cleanups: Array<() => void> = [];

  constructor(root: HTMLElement) {
    this.root = root;
  }

  // ============================================================
  // INIT
  // ============================================================

  async init(): Promise<void> {
    this.buildDom();
    if (this.disposed) return;

    this.sceneManager = new SceneManager(this.canvasContainer);
    this.bindCanvasInteraction();
    this.showLoading(true);

    const loaded = await this.loadAllModels();
    if (this.disposed) {
      // Komponen sudah di-unmount saat model dimuat.
      return;
    }
    this.showLoading(false);

    this.assembleScene(loaded);
    if (this.modelErrors.length > 0) {
      this.setStatus(`Model 3D gagal dimuat — ${this.modelErrors.join('; ')}. Kotak penanda dipakai sementara.`);
    }
    this.applyVisibility('all');
    this.hotspots = this.createHotspots();

    this.sceneManager.setFrameCallback((frame) => {
      this.arSession?.onFrame(frame);
      this.sceneManager.updateLights();
      this.updateHotspots();
    });
    this.sceneManager.start();

    this.arSession = new ARSession(
      this.sceneManager,
      this.viewport,
      () => this.arBaseScale,
      {
        onState: (state) => this.handleARState(state),
        onEnded: (error) => this.handleAREnded(error),
        onModeInfo: (info) => this.handleModeInfo(info),
      }
    );

    this.arSupported = await ARSession.isSupported();
    if (this.disposed) return;
    this.configureARButton();

    await this.startPreviewCamera();
  }

  /** Kamera hanya sebagai latar pratinjau — BUKAN AR terlacak. */
  private async startPreviewCamera(): Promise<void> {
    const ok = await this.sceneManager.startCameraPreview();
    if (this.disposed) return;
    if (!ok) {
      this.setStatus('Kamera tidak tersedia / izin ditolak — pratinjau 3D tanpa kamera.');
    } else if (!this.arSupported) {
      this.setStatus('WebXR: tidak didukung perangkat ini. Mode cadangan (orientasi perangkat) tersedia — tekan Mulai AR.');
    } else {
      this.arStatus.hidden = true;
    }
  }

  private setStatus(text: string): void {
    this.arStatus.textContent = '';
    const msg = document.createElement('span');
    msg.textContent = text;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ar-status-close';
    close.textContent = 'Buka viewer 3D';
    close.addEventListener('click', () => { this.arStatus.hidden = true; });
    this.arStatus.append(msg, close);
    this.arStatus.hidden = false;
  }

  private unsupportedReason(): string {
    if (!window.isSecureContext) {
      return 'AR terlacak tidak tersedia: halaman harus dibuka lewat HTTPS. Pratinjau 3D aktif.';
    }
    return 'AR terlacak (WebXR) tidak didukung perangkat/browser ini — diperlukan Android + Chrome dengan ARCore. Pratinjau 3D aktif.';
  }

  private configureARButton(): void {
    // Tombol AR selalu aktif: WebXR bila didukung, jika tidak jatuh ke mode cadangan.
    this.arButton.disabled = false;
    if (this.arSupported) {
      this.arButton.title = '';
    } else {
      this.arButton.title = 'WebXR tidak didukung — mode cadangan (orientasi perangkat) akan dipakai.';
    }
  }

  private async startAR(): Promise<void> {
    if (!this.arSession || this.arState !== 'idle') return;
    this.arStatus.hidden = true;
    await this.arSession.start();
  }

  private handleARState(state: ARState): void {
    this.arState = state;
    const inAR = state === 'placing' || state === 'placed';

    // Saat AR dimulai, tampilkan SELURUH komponen utuh (tanpa peredupan sisa pilihan).
    if (state === 'starting') {
      this.closePanel();
      this.setActiveCategory('all');
      this.applyVisibility('all');
    }

    this.modeBadge.hidden = inAR || state === 'starting';
    this.hud.hidden = !inAR;
    this.arButton.hidden = inAR;
    this.hudButtons.hidden = state !== 'placed';

    const isFallback = this.arSession?.isFallbackActive ?? false;

    // Teks status/debug AR dihapus. Pesan hanya muncul sebentar saat mencari posisi (placing)
    // dan pada mode cadangan (agar tidak menyesatkan: itu BUKAN tracking AR). Saat 'placed' di
    // WebXR tidak ada teks sama sekali — hanya tombol.
    let message = '';
    if (state === 'placing') {
      message = isFallback ? 'Memulai AR...' : 'Gerakkan HP perlahan sampai susunan komponen muncul.';
    } else if (state === 'placed' && isFallback) {
      message = 'Mode cadangan (bukan tracking AR): model hanya mengikuti putaran HP.';
    }
    this.hudMessage.textContent = message;
    this.hudMessage.hidden = message === '';
  }

  /** Info mode hanya untuk konsol (tidak ditampilkan di layar AR). */
  private handleModeInfo(info: { mode: string; reason?: string; widthM: number; note?: string }): void {
    console.debug('MODUL6 AR:', info.mode, info.note ?? '', info.reason ?? '', `${info.widthM.toFixed(2)} m`);
  }

  private handleAREnded(error?: string): void {
    if (this.disposed) return;
    this.closePanel();
    this.setActiveCategory('all');
    this.applyVisibility('all');
    this.gestureHints.classList.remove('hidden');
    void this.startPreviewCamera().then(() => {
      if (error) {
        const isFallback = this.arSession?.isFallbackActive ?? false;
        if (isFallback) {
          this.setStatus(`WebXR: ${error}. Mode cadangan aktif (orientasi perangkat).`);
        } else {
          this.setStatus(`Sesi AR gagal dimulai: ${error}. Pratinjau 3D aktif.`);
        }
      }
    });
  }

  dispose(): void {
    this.disposed = true;
    if (this.gestureTimeout) clearTimeout(this.gestureTimeout);
    this.cleanups.forEach((fn) => fn());
    this.cleanups.length = 0;

    this.disposeSims();
    this.arSession?.dispose();
    this.sceneManager?.dispose();

    this.modelMeshes.forEach((mesh) => {
      mesh.geometry?.dispose();
    });
    this.materialStates.forEach((_, material) => material.dispose());

    this.root.innerHTML = '';
  }

  // ============================================================
  // DOM
  // ============================================================

  private buildDom(): void {
    this.root.innerHTML = '';

    this.viewport = document.createElement('main');
    this.viewport.className = 'viewport';
    this.root.appendChild(this.viewport);

    this.canvasContainer = document.createElement('div');
    this.canvasContainer.className = 'canvas-container';
    this.viewport.appendChild(this.canvasContainer);

    this.buildTopBar();
    this.buildGestureHints();
    this.buildComponentFlow();
    this.buildARStatus();
    this.buildPanel();
    this.buildModeUi();
  }

  private buildModeUi(): void {
    this.modeBadge = document.createElement('div');
    this.modeBadge.className = 'mode-badge';
    this.modeBadge.textContent = 'PRATINJAU 3D · bukan AR terlacak';
    this.viewport.appendChild(this.modeBadge);

    this.hud = document.createElement('div');
    this.hud.className = 'ar-hud';
    this.hud.hidden = true;
    this.hud.innerHTML = `
      <p class="ar-hud-message"></p>
      <div class="ar-hud-buttons">
        <button type="button" data-act="replace">Tempatkan ulang</button>
        <button type="button" data-act="reset">Reset</button>
        <button type="button" data-act="exit" class="danger">Keluar AR</button>
      </div>`;
    this.hudMessage = this.hud.querySelector('.ar-hud-message') as HTMLElement;
    this.hudMessage.hidden = true;
    this.hudButtons = this.hud.querySelector('.ar-hud-buttons') as HTMLElement;
    this.hudButtons.hidden = true;

    this.hud.querySelector('[data-act="replace"]')?.addEventListener('click', () => this.arSession?.replace());
    this.hud.querySelector('[data-act="reset"]')?.addEventListener('click', () => this.sceneManager.resetView());
    this.hud.querySelector('[data-act="exit"]')?.addEventListener('click', () => this.arSession?.end());
    this.viewport.appendChild(this.hud);
  }

  private buildTopBar(): void {
    const topBar = document.createElement('div');
    topBar.className = 'top-bar';

    const bar = document.createElement('div');
    bar.className = 'filter-bar';

    const entries: Array<{ id: TopicFocus; label: string; count: number }> = [
      { id: 'all', label: 'ALL', count: TOPICS.length },
      ...TOPICS.map((t) => ({ id: t.id as TopicFocus, label: t.short, count: 1 })),
    ];

    for (const entry of entries) {
      const button = document.createElement('button');
      button.className = `filter-btn filter-${entry.id}`;
      button.type = 'button';
      button.dataset.category = entry.id;
      button.innerHTML = `<span>${esc(entry.label)}</span><small>${entry.count}</small>`;

      if (entry.id !== 'all') {
        const topic = TOPICS.find((t) => t.id === entry.id) as Topic;
        button.style.setProperty('--pill-color', topic.color);
        button.style.setProperty('--pill-bg', topic.colorActive);
      }
      if (entry.id === 'all') button.classList.add('active');

      button.addEventListener('click', () => {
        if (entry.id === 'all') {
          this.setActiveCategory('all');
          this.applyVisibility('all');
          this.closePanel();
        } else {
          this.selectTopic(entry.id);
        }
      });

      bar.appendChild(button);
      this.filterButtons.set(entry.id, button);
    }
    topBar.appendChild(bar);

    const reset = document.createElement('button');
    reset.className = 'reset-btn';
    reset.type = 'button';
    reset.textContent = 'Reset View';
    reset.addEventListener('click', () => {
      this.sceneManager.resetView();
      this.setActiveCategory('all');
      this.applyVisibility('all');
      this.closePanel();
      this.gestureHints.classList.remove('hidden');
    });

    const arButton = document.createElement('button');
    arButton.className = 'ar-btn';
    arButton.type = 'button';
    arButton.textContent = 'Mulai AR';
    arButton.disabled = true;
    arButton.addEventListener('click', () => void this.startAR());
    this.arButton = arButton;

    const actions = document.createElement('div');
    actions.className = 'top-actions';
    actions.append(reset, arButton);
    topBar.appendChild(actions);

    this.viewport.appendChild(topBar);
  }

  private buildGestureHints(): void {
    const hints = document.createElement('div');
    hints.className = 'gesture-hints';
    hints.innerHTML = `
      <span class="gesture-hint">${GESTURE_SVG.rotate}<strong>PUTAR</strong><small>1 JARI</small></span>
      <span class="gesture-hint">${GESTURE_SVG.pan}<strong>PINDAH</strong><small>2 JARI</small></span>
      <span class="gesture-hint">${GESTURE_SVG.zoom}<strong>ZOOM</strong><small>PINCH</small></span>
    `;
    this.viewport.appendChild(hints);
    this.gestureHints = hints;
  }

  private buildComponentFlow(): void {
    const flow = document.createElement('section');
    flow.className = 'component-flow';
    flow.setAttribute('aria-label', 'Alur urutan komponen');
    flow.innerHTML = `
      <h2>ALUR URUTAN KOMPONEN</h2>
      <div class="component-flow-list">
        ${TOPICS.map(
          (topic, index) => `
          <button class="component-flow-item" type="button" data-category="${topic.id}">
            <span class="component-flow-number">${index + 1}</span>
            <span>${esc(topic.name)}</span>
          </button>`
        ).join('')}
      </div>
    `;

    flow.querySelectorAll<HTMLButtonElement>('.component-flow-item').forEach((button) => {
      const id = button.dataset.category as TopicId;
      this.flowButtons.set(id, button);
      button.addEventListener('click', () => this.selectTopic(id));
    });

    this.viewport.appendChild(flow);
  }

  private buildARStatus(): void {
    this.arStatus = document.createElement('div');
    this.arStatus.className = 'ar-status';
    this.arStatus.textContent = 'Kamera tidak tersedia — mode 3D aktif';
    this.arStatus.hidden = true;
    this.viewport.appendChild(this.arStatus);
  }

  private buildPanel(): void {
    const panel = document.createElement('section');
    panel.className = 'info-panel';
    panel.setAttribute('aria-label', 'Informasi komponen');
    panel.innerHTML = `
      <div class="panel-handle"></div>
      <button class="panel-close" type="button" aria-label="Tutup panel informasi">×</button>
      <div class="info-category">${esc(MODULE.panelCategory)}</div>
      <h2 class="info-title">${esc(MODULE.panelTitle)}</h2>
      <div class="info-body">
        <p>${esc(MODULE.panelIntro)}</p>
      </div>
    `;
    this.viewport.appendChild(panel);

    this.panel = panel;
    this.panelTitle = panel.querySelector('.info-title') as HTMLElement;
    this.panelCategory = panel.querySelector('.info-category') as HTMLElement;
    this.panelBody = panel.querySelector('.info-body') as HTMLElement;
    panel.querySelector('.panel-close')?.addEventListener('click', () => this.closePanel());
  }

  private showLoading(show: boolean): void {
    this.viewport.classList.toggle('is-loading', show);
    if (show) {
      const loading = document.createElement('div');
      loading.className = 'loading-indicator';
      loading.textContent = 'Memuat model 3D…';
      loading.dataset.loading = 'true';
      this.viewport.appendChild(loading);
    } else {
      this.viewport.querySelector('[data-loading="true"]')?.remove();
    }
  }

  // ============================================================
  // UI STATE
  // ============================================================

  private setActiveCategory(category: TopicFocus): void {
    this.filterButtons.forEach((button, id) =>
      button.classList.toggle('active', id === category)
    );
    this.flowButtons.forEach((button, id) =>
      button.classList.toggle('active', id === category)
    );
  }

  private showTopic(topic: Topic): void {
    this.panel.style.setProperty('--panel-accent', topic.color);

    // Topik yang sama sudah tampil: jangan render ulang (simulasi tidak ter-reset).
    if (this.shownTopicId === topic.id && this.panel.classList.contains('open')) return;

    this.disposeSims();
    this.panelCategory.textContent = topic.category;
    this.panelTitle.textContent = `${topic.displayNumber} · ${topic.name}`;
    this.panelBody.innerHTML =
      renderBlocksToHtml(topic.blocks, topic.color) +
      (topic.sourceVerified ? '' : `<p class="info-disclaimer">${esc(MODULE.unverifiedNote)}</p>`);

    this.panelBody.querySelectorAll<HTMLElement>('.sim-host').forEach((host) => {
      const type = (host.dataset.sim ?? 'scheduling') as SimType;
      this.simDisposers.push(mountSimulation(host, type, host.dataset.accent ?? topic.color));
    });

    this.shownTopicId = topic.id;
    this.panel.classList.add('open');
    this.gestureHints.classList.add('hidden');
    this.panel.scrollTop = 0;
  }

  private disposeSims(): void {
    this.simDisposers.forEach((dispose) => dispose());
    this.simDisposers = [];
  }

  private closePanel(): void {
    this.panel.classList.remove('open');
    this.disposeSims();
    this.shownTopicId = null;
  }

  /**
   * PENTING: tidak memanggil resetView di sini. Pengguna mungkin sedang
   * melihat sisi belakang lalu memilih sebuah topik — rotasi, posisi, dan
   * zoom harus tetap (sama seperti Modul 2).
   */
  private selectTopic(id: TopicId): void {
    const topic = TOPICS.find((t) => t.id === id);
    if (!topic) return;

    this.setActiveCategory(id);
    this.showTopic(topic);
    this.applyVisibility(id);
  }

  // ============================================================
  // MODEL LOADING
  // ============================================================

  /** Daftar model yang gagal dimuat (file + alasan) untuk ditampilkan ke pengguna. */
  private readonly modelErrors: string[] = [];

  private loadGltf(url: string): Promise<THREE.Object3D | null> {
    console.log(`MODUL6: memuat "${url}"`);
    return new Promise((resolve) => {
      new GLTFLoader().load(
        url,
        (gltf) => { console.log(`MODUL6: berhasil "${url}"`); resolve(gltf.scene); },
        undefined,
        (error) => {
          console.error(`MODUL6: GAGAL memuat "${url}"`, error);
          const file = url.split('/').pop() ?? url;
          const reason = error instanceof Error ? error.message : (error as { message?: string })?.message ?? 'tidak diketahui (periksa file ada di public/models)';
          this.modelErrors.push(`${file}: ${reason}`);
          resolve(null);
        }
      );
    });
  }

  private async loadAllModels(): Promise<Map<TopicId, THREE.Object3D | null>> {
    const entries = await Promise.all(
      TOPICS.map(async (topic) => {
        const model = await this.loadGltf(glbUrlForTopic(topic.id));
        return [topic.id, model] as const;
      })
    );
    return new Map(entries);
  }

  private makePlaceholder(topic: Topic, size: number): THREE.Object3D {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size, size * 0.4, size),
      new THREE.MeshStandardMaterial({ color: topic.color, roughness: 0.5 })
    );
    mesh.name = `placeholder-${topic.id}`;
    return mesh;
  }

  /**
   * Menormalkan tiap model (ukuran seragam, bertumpu di y=0, berpusat di x/z),
   * menaruhnya di "meja" 2×2, lalu menyusun orientasi awal.
   */
  private assembleScene(loaded: Map<TopicId, THREE.Object3D | null>): void {
    const modelRoot = this.sceneManager.modelRoot;
    const arrangement = new THREE.Group();
    arrangement.name = 'arrangement';
    modelRoot.add(arrangement);

    for (const topic of TOPICS) {
      const config = MODEL_CONFIG[topic.id];
      let model: THREE.Object3D | null = loaded.get(topic.id) ?? null;
      if (!model) {
        console.error(`MODUL6: model untuk topik "${topic.id}" tidak tersedia, memakai penanda kotak.`);
        model = this.makePlaceholder(topic, config.targetSize);
      } else {
        // Gabungkan mesh bermaterial sama: tampilan tidak berubah, draw call turun drastis.
        downscaleTextures(model, 1024);
        const stats = mergeStaticMeshes(model);
        console.log(`MODUL6: mesh "${topic.id}" ${stats.before} → ${stats.after}`);
      }

      // Lepas bagian yang menutupi komponen penting (mis. bangunan data center).
      if (config.removeNodes) {
        const doomed: THREE.Object3D[] = [];
        model.traverse((o) => {
          if (o !== model && config.removeNodes!.test(o.name)) doomed.push(o);
        });
        doomed.forEach((o) => o.parent?.remove(o));
      }

      // Rebahkan model yang aslinya berdiri (mis. motherboard) seperti model Modul 4.
      if (config.rotateX) model.rotation.x += config.rotateX;

      // Normalisasi skala
      model.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      console.log(`MODUL6: bbox "${topic.id}" pre-scale = ${size.x.toFixed(3)} × ${size.y.toFixed(3)} × ${size.z.toFixed(3)}`);
      const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
      model.scale.multiplyScalar(config.targetSize / maxDim);
      model.updateMatrixWorld(true);

      // Pusat x/z di origin, alas di y = 0
      const box = new THREE.Box3().setFromObject(model);
      const postSize = box.getSize(new THREE.Vector3());
      console.log(`MODUL6: bbox "${topic.id}" post-scale = ${postSize.x.toFixed(3)} × ${postSize.y.toFixed(3)} × ${postSize.z.toFixed(3)}`);
      model.position.set(
        model.position.x - (box.min.x + box.max.x) / 2,
        model.position.y - box.min.y,
        model.position.z - (box.min.z + box.max.z) / 2
      );

      const group = new THREE.Group();
      group.name = `topic-${topic.id}`;
      group.userData.topicId = topic.id;
      group.position.set(config.cell[0], 0, config.cell[1]);
      group.add(model);
      arrangement.add(group);
      this.topicGroups.set(topic.id, group);

      model.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = true;
          this.modelMeshes.push(o);
          this.meshTopic.set(o, topic.id);
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m: THREE.Material) => {
            if (!this.materialStates.has(m)) {
              this.materialStates.set(m, {
                transparent: m.transparent,
                opacity: m.opacity,
                depthWrite: m.depthWrite,
              });
            }
          });
        }
      });
    }

    // Pusatkan seluruh susunan pada origin agar rotasi berporos di tengah.
    arrangement.updateMatrixWorld(true);
    const center = new THREE.Box3().setFromObject(arrangement).getCenter(new THREE.Vector3());
    arrangement.position.sub(center);
    modelRoot.updateMatrixWorld(true);

    // Lantai & skala AR: hitung dari bounding box modelRoot pada scale=1.
    // arBaseScale hanya nilai awal; skala akhir dihitung saat spawn (SceneManager.computeSpawn)
    // dari jarak + FOV kamera nyata supaya susunan tidak terpotong di layar.
    const finalBox = new THREE.Box3().setFromObject(arrangement);
    const finalSize = finalBox.getSize(new THREE.Vector3());
    this.sceneManager.floorY = finalBox.min.y;
    this.sceneManager.arHalfExtent.copy(finalSize).multiplyScalar(0.5);
    this.arBaseScale =
      SceneManager.SPAWN.width / Math.max(finalSize.x, finalSize.z, 1e-6);

    // Bidang penangkap bayangan: model "menempel" pada permukaan, bukan melayang.
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(finalSize.x * 1.15, finalSize.z * 1.15),
      new THREE.ShadowMaterial({ opacity: 0.35 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = finalBox.min.y - 0.005;
    shadowPlane.receiveShadow = true;
    shadowPlane.name = 'shadow-catcher';
    modelRoot.add(shadowPlane);

    // Hotspot dihitung saat modelRoot masih identitas (puncak = +Y dunia).
    this.pendingAnchors = this.computeAnchors();

    // Orientasi awal: meja dilihat sedikit dari atas dan serong,
    // supaya model datar (HDD, optical drive) tampak 3D, bukan sekadar garis.
    this.sceneManager.homeQuaternion.setFromEuler(new THREE.Euler(0.62, -0.42, 0, 'YXZ'));
    this.sceneManager.resetView(false);
  }

  private pendingAnchors = new Map<TopicId, THREE.Vector3>();

  /** Titik tempel hotspot = puncak bounding box komponen (ruang lokal modelRoot). */
  private computeAnchors(): Map<TopicId, THREE.Vector3> {
    const result = new Map<TopicId, THREE.Vector3>();
    const modelRoot = this.sceneManager.modelRoot;
    modelRoot.updateMatrixWorld(true);
    const inverseRoot = modelRoot.matrixWorld.clone().invert();

    for (const topic of TOPICS) {
      const group = this.topicGroups.get(topic.id);
      if (!group) continue;

      const pattern = MODEL_CONFIG[topic.id].anchorNode;
      const box = new THREE.Box3();

      if (pattern) {
        group.traverse((o) => {
          // Hanya node induk yang cocok; anaknya ikut lewat expandByObject.
          if (pattern.test(o.name) && !(o.parent && pattern.test(o.parent.name))) {
            box.expandByObject(o);
          }
        });
      }
      if (box.isEmpty()) box.setFromObject(group);

      const topPoint = new THREE.Vector3(
        (box.min.x + box.max.x) / 2,
        box.max.y + 0.02,
        (box.min.z + box.max.z) / 2
      );
      result.set(topic.id, topPoint.applyMatrix4(inverseRoot));
    }
    return result;
  }

  // ============================================================
  // VISIBILITY — komponen non-aktif diredupkan 20%
  // ============================================================

  private applyVisibility(focus: TopicFocus): void {
    const dimmed = new Set<THREE.Material>();
    const active = new Set<THREE.Material>();

    for (const mesh of this.modelMeshes) {
      const topicId = this.meshTopic.get(mesh);
      const isActive = focus === 'all' || topicId === focus;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m: THREE.Material) => (isActive ? active : dimmed).add(m));
    }

    active.forEach((m) => {
      const original = this.materialStates.get(m);
      if (!original) return;
      m.transparent = original.transparent;
      m.opacity = original.opacity;
      m.depthWrite = original.depthWrite;
      m.needsUpdate = true;
    });

    dimmed.forEach((m) => {
      const original = this.materialStates.get(m);
      if (!original) return;
      m.transparent = true;
      m.opacity = original.opacity * 0.2;
      m.depthWrite = false;
      m.needsUpdate = true;
    });

    for (const hotspot of this.hotspots) {
      const muted = focus !== 'all' && hotspot.topicId !== focus;
      hotspot.dot.classList.toggle('muted', muted);
      hotspot.label.classList.toggle('muted', muted);
    }
  }

  // ============================================================
  // CANVAS INTERACTION — tap vs gestur
  // ============================================================

  private markGesture(): void {
    this.gestureActive = true;
    if (this.gestureTimeout) clearTimeout(this.gestureTimeout);
    this.gestureTimeout = setTimeout(() => {
      this.gestureActive = false;
      this.gestureTimeout = null;
    }, 250);
  }

  private bindCanvasInteraction(): void {
    const el = this.canvasContainer;

    const listen = <K extends keyof HTMLElementEventMap>(
      type: K,
      handler: (event: HTMLElementEventMap[K]) => void,
      options?: AddEventListenerOptions
    ) => {
      el.addEventListener(type, handler as EventListener, options);
      this.cleanups.push(() => el.removeEventListener(type, handler as EventListener));
    };

    listen('pointerdown', (event) => {
      this.markGesture();
      this.activePointerCount++;

      if (this.activePointerCount !== 1) {
        this.pointerDown = null;
        return;
      }
      this.pointerDown = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });

    listen('pointermove', () => {
      if (this.activePointerCount > 0) this.markGesture();
    });

    listen('wheel', () => this.markGesture(), { passive: true });

    listen('pointerup', (event) => {
      this.activePointerCount = Math.max(0, this.activePointerCount - 1);

      if (!this.pointerDown || this.pointerDown.id !== event.pointerId) return;

      // Pernah multi-touch → bukan klik.
      if (this.activePointerCount !== 0) {
        this.pointerDown = null;
        return;
      }

      const movement = Math.hypot(
        event.clientX - this.pointerDown.x,
        event.clientY - this.pointerDown.y
      );
      this.pointerDown = null;

      // Gerak > 8 px = gestur, bukan klik.
      if (movement > 8) return;

      // Mode cadangan AR: tap layar = tempatkan ulang.
      if (this.arSession?.isFallbackActive && this.arState === 'placed') {
        this.arSession.fallbackPlace();
        return;
      }

      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      this.pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      this.raycaster.setFromCamera(this.pointer, this.sceneManager.activeCamera);

      const hit = this.raycaster.intersectObjects(this.modelMeshes, false)[0];
      if (!hit) return;

      const topicId = this.meshTopic.get(hit.object as THREE.Mesh);
      if (topicId) this.selectTopic(topicId);
    });

    listen('pointercancel', () => {
      this.activePointerCount = 0;
      this.pointerDown = null;
    });
  }

  // ============================================================
  // HOTSPOTS
  // ============================================================

  private createHotspots(): HotspotElement[] {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.classList.add('hotspot-leaders');
    this.viewport.appendChild(svg);
    this.leaderSvg = svg;

    return TOPICS.map((topic) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = `hotspot-dot hotspot-dot-${topic.id}`;
      dot.style.setProperty('--hotspot-color', topic.color);
      dot.setAttribute('aria-label', topic.name);

      const label = document.createElement('button');
      label.type = 'button';
      label.className = `hotspot-label hotspot-label-${topic.id}`;
      label.style.setProperty('--hotspot-color', topic.color);
      label.textContent = topic.short;

      const leader = document.createElementNS(SVG_NS, 'line');
      leader.classList.add('hotspot-leader');
      leader.setAttribute('stroke', topic.color);
      svg.appendChild(leader);

      const dispatch = (event: Event) => {
        event.stopPropagation();
        this.selectTopic(topic.id);
      };
      dot.addEventListener('click', dispatch);
      label.addEventListener('click', dispatch);

      this.viewport.appendChild(dot);
      this.viewport.appendChild(label);

      return {
        topicId: topic.id,
        dot,
        label,
        leader,
        anchor: (this.pendingAnchors.get(topic.id) ?? new THREE.Vector3()).clone(),
        smoothedX: 0,
        smoothedY: 0,
        smoothedVisible: false,
        occluded: false,
      };
    });
  }

  /** Port dari updateHotspots() Modul 2 (koordinat relatif terhadap canvas). */
  private updateHotspots(): void {
    const camera = this.sceneManager.activeCamera;
    const modelRoot = this.sceneManager.modelRoot;
    const rect = this.canvasContainer.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    // AR: sebelum model diletakkan, sembunyikan titik & label.
    if (this.sceneManager.arMode && this.arState !== 'placed') {
      for (const h of this.hotspots) {
        h.dot.classList.add('offscreen');
        h.label.classList.add('offscreen');
        h.leader.style.opacity = '0';
        h.smoothedVisible = false;
      }
      return;
    }

    this.frameCounter++;

    this.leaderSvg.setAttribute('width', String(rect.width));
    this.leaderSvg.setAttribute('height', String(rect.height));

    modelRoot.updateMatrixWorld(true);

    // ----- bounding box model pada layar -----
    const modelBox = new THREE.Box3().setFromObject(modelRoot);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < 8; i++) {
      const c = new THREE.Vector3(
        i & 1 ? modelBox.max.x : modelBox.min.x,
        i & 2 ? modelBox.max.y : modelBox.min.y,
        i & 4 ? modelBox.max.z : modelBox.min.z
      ).project(camera);
      const sx = (c.x * 0.5 + 0.5) * rect.width;
      const sy = (-c.y * 0.5 + 0.5) * rect.height;
      minX = Math.min(minX, sx);
      maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy);
      maxY = Math.max(maxY, sy);
    }

    const modelCenterX = (minX + maxX) / 2;
    const modelCenterY = (minY + maxY) / 2;

    const MODEL_MARGIN = 40;
    const CLAMP_LEFT = 8;
    const CLAMP_RIGHT = rect.width - 8;
    const CLAMP_TOP = 118; // di bawah top bar (pill + tombol) dan badge mode
    // di atas hint gestur & panel alur; saat HUD AR tampil, label tidak boleh tertutup HUD.
    const hudTop = this.hud.hidden ? Infinity : this.hud.getBoundingClientRect().top - rect.top - 8;
    const CLAMP_BOTTOM = Math.min(rect.height - 150, hudTop);
    const LABEL_W = 90;
    const LABEL_H = 28;
    const LERP = 0.2;

    interface Placement {
      dotX: number;
      dotY: number;
      targetX: number;
      targetY: number;
      visible: boolean;
    }
    const placements: Placement[] = [];
    const checkOcclusion = this.frameCounter % 6 === 0;

    // ----- fase 1: posisi target -----
    for (const hotspot of this.hotspots) {
      const worldPoint = new THREE.Vector3().copy(hotspot.anchor);
      modelRoot.localToWorld(worldPoint);

      if (checkOcclusion) {
        // Cek tertutup memakai kotak pembatas komponen lain (murah), bukan tiap segitiga.
        const camOrigin = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
        const toPoint = worldPoint.clone().sub(camOrigin);
        const dist = toPoint.length();
        this.occlusionRay.set(camOrigin, toPoint.normalize());
        const margin = Math.max(0.05 * modelRoot.scale.x, dist * 0.01);
        let blocked = false;
        for (const [id, group] of this.topicGroups) {
          if (id === hotspot.topicId) continue;
          const box = this.groupBox.setFromObject(group);
          const hit = this.occlusionRay.intersectBox(box, this.occlusionHit);
          if (hit && hit.distanceTo(camOrigin) < dist - margin) {
            blocked = true;
            break;
          }
        }
        hotspot.occluded = blocked;
      }

      worldPoint.project(camera);

      const dotX = (worldPoint.x * 0.5 + 0.5) * rect.width;
      const dotY = (-worldPoint.y * 0.5 + 0.5) * rect.height;
      const visible =
        worldPoint.z > -1 &&
        worldPoint.z < 1 &&
        Number.isFinite(dotX) &&
        Number.isFinite(dotY);

      let dirX = dotX - modelCenterX;
      let dirY = dotY - modelCenterY;
      const dirLen = Math.hypot(dirX, dirY);
      if (dirLen < 0.001) {
        dirX = 0;
        dirY = -1;
      } else {
        dirX /= dirLen;
        dirY /= dirLen;
      }

      // dorong label keluar dari bounding box model
      let labelX = dotX;
      let labelY = dotY;
      for (let step = 0; step < 60; step++) {
        const outsideX =
          dirX > 0 ? labelX > maxX + MODEL_MARGIN : labelX < minX - MODEL_MARGIN;
        const outsideY =
          dirY > 0 ? labelY > maxY + MODEL_MARGIN : labelY < minY - MODEL_MARGIN;
        if (outsideX && outsideY) break;
        labelX += dirX * 12;
        labelY += dirY * 12;
      }

      // jika model memenuhi layar, tempel ke tepi viewport terdekat
      const insideX = labelX >= minX - MODEL_MARGIN && labelX <= maxX + MODEL_MARGIN;
      const insideY = labelY >= minY - MODEL_MARGIN && labelY <= maxY + MODEL_MARGIN;
      if (insideX && insideY) {
        const dLeft = Math.abs(dotX - CLAMP_LEFT);
        const dRight = Math.abs(dotX - CLAMP_RIGHT);
        const dTop = Math.abs(dotY - CLAMP_TOP);
        const dBottom = Math.abs(dotY - CLAMP_BOTTOM);
        const nearest = Math.min(dLeft, dRight, dTop, dBottom);

        if (nearest === dLeft) labelX = CLAMP_LEFT + LABEL_W / 2;
        else if (nearest === dRight) labelX = CLAMP_RIGHT - LABEL_W / 2;
        else if (nearest === dTop) labelY = CLAMP_TOP + LABEL_H / 2;
        else labelY = CLAMP_BOTTOM - LABEL_H / 2;
      }

      labelX = Math.max(CLAMP_LEFT + LABEL_W / 2, Math.min(CLAMP_RIGHT - LABEL_W / 2, labelX));
      labelY = Math.max(CLAMP_TOP + LABEL_H / 2, Math.min(CLAMP_BOTTOM - LABEL_H / 2, labelY));

      placements.push({ dotX, dotY, targetX: labelX, targetY: labelY, visible });
    }

    // ----- fase 2: hindari tabrakan label -----
    const clampY = (y: number) =>
      Math.max(CLAMP_TOP + LABEL_H / 2, Math.min(CLAMP_BOTTOM - LABEL_H / 2, y));

    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        const a = placements[i];
        const b = placements[j];
        if (!a.visible || !b.visible) continue;

        if (
          Math.abs(a.targetX - b.targetX) < LABEL_W &&
          Math.abs(a.targetY - b.targetY) < LABEL_H
        ) {
          if (a.targetY < b.targetY) b.targetY = a.targetY + LABEL_H + 4;
          else a.targetY = b.targetY + LABEL_H + 4;
          a.targetY = clampY(a.targetY);
          b.targetY = clampY(b.targetY);
        }
      }
    }

    // ----- fase 3: terapkan dengan smoothing -----
    for (let i = 0; i < this.hotspots.length; i++) {
      const hotspot = this.hotspots[i];
      const p = placements[i];

      if (!hotspot.smoothedVisible) {
        hotspot.smoothedX = p.targetX;
        hotspot.smoothedY = p.targetY;
      } else {
        hotspot.smoothedX += (p.targetX - hotspot.smoothedX) * LERP;
        hotspot.smoothedY += (p.targetY - hotspot.smoothedY) * LERP;
      }
      hotspot.smoothedVisible = p.visible;

      hotspot.dot.style.transform = `translate3d(${p.dotX - 8}px, ${p.dotY - 8}px, 0)`;
      hotspot.label.style.transform = `translate3d(${hotspot.smoothedX - LABEL_W / 2}px, ${hotspot.smoothedY - LABEL_H / 2}px, 0)`;

      hotspot.dot.classList.toggle('offscreen', !p.visible);
      hotspot.label.classList.toggle('offscreen', !p.visible);
      hotspot.dot.classList.toggle('occluded', hotspot.occluded);
      hotspot.label.classList.toggle('gesture-hidden', this.gestureActive);

      if (p.visible) {
        hotspot.leader.setAttribute('x1', String(p.dotX));
        hotspot.leader.setAttribute('y1', String(p.dotY));
        hotspot.leader.setAttribute('x2', String(hotspot.smoothedX));
        hotspot.leader.setAttribute('y2', String(hotspot.smoothedY));
        hotspot.leader.style.opacity = this.gestureActive ? '0' : '0.5';
      } else {
        hotspot.leader.style.opacity = '0';
      }
    }
  }
}