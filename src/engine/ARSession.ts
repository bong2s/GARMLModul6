import * as THREE from 'three';
import { XREstimatedLight } from 'three/examples/jsm/webxr/XREstimatedLight.js';

import type { SceneManager } from './SceneManager';

const SNAP_TO_SURFACE = false;
/**
 * false: susunan ditempatkan di udara pada jarak/elevasi SPAWN di depan kamera, lalu dikunci
 * ke anchor dunia (dekat + bisa dilihat dari bawah). true: perilaku lama — menunggu permukaan
 * hit-test (lantai/meja, bisa jauh sampai 2,5 m) dan menaruh model di sana.
 */
const PREFER_SURFACE_HIT = false;

export type ARState = 'idle' | 'starting' | 'placing' | 'placed';

export interface ARSessionHooks {
  onState: (state: ARState) => void;
  /** Dipanggil setelah sesi berakhir (selalu, termasuk saat gagal dimulai). */
  onEnded: (error?: string) => void;
  /** Dipanggil saat mode AR aktif untuk menampilkan info di panel. */
  onModeInfo?: (info: { mode: string; reason?: string; widthM: number; note?: string }) => void;
}

/**
 * AR markerless berbasis WebXR (immersive-ar + hit-test).
 * Hanya berjalan di browser/perangkat yang mendukung (umumnya Chrome Android + ARCore).
 *
 * Alur: arahkan kamera ke permukaan → reticle muncul → ketuk untuk menempatkan
 * → model tetap di posisi dunia nyata. Gestur: 1 jari = putar, 2 jari = geser
 * di lantai + cubit zoom.
 */
export class ARSession {
  state: ARState = 'idle';

  private session: XRSession | null = null;
  private hitTestSource: XRHitTestSource | null = null;
  private fallbackActive = false;
  private placeStartTime = 0;
  private floorSnapped = false;

  // ---- Penguncian ke dunia nyata (hit-test + anchor) & diagnostik ----
  /** Jumlah frame berturut-turut dengan posisi HP terlacak (bukan perkiraan). */
  private trackedFrames = 0;
  private lastEmulated: boolean | null = null;
  private anchor: XRAnchor | null = null;
  private anchorPending = false;
  private anchorState: 'belum' | 'aktif' | 'tidak didukung' = 'belum';
  private placementMethod = '';
  private lastStatusText = '';
  private hasApplied = false;
  private readonly appliedPos = new THREE.Vector3();
  private readonly appliedQuat = new THREE.Quaternion();
  private readonly anchorQuat0 = new THREE.Quaternion();
  private readonly reticle: THREE.Mesh;
  private xrLight: XREstimatedLight | null = null;
  private readonly guard: (event: Event) => void;

  constructor(
    private readonly sm: SceneManager,
    private readonly overlayRoot: HTMLElement,
    private readonly getBaseScale: () => number,
    private readonly hooks: ARSessionHooks
  ) {
    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.07, 0.09, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 })
    );
    this.reticle.matrixAutoUpdate = false;
    this.reticle.visible = false;
    this.sm.scene.add(this.reticle);

    // beforexrselect: saat 'placing', blok select dari elemen UI (tombol, panel,
    // hotspot) agar tap tombol tidak menempatkan model. Sentuhan pada canvas
    // (area kosong) diizinkan menjadi select.
    // Setelah 'placed', blok semua select agar gestur tidak menempatkan ulang.
    this.guard = (event: Event) => {
      if (this.state !== 'placing' && this.state !== 'placed') {
        event.preventDefault();
        return;
      }
      const target = event.target as Element | null;
      if (target && target.closest('button, .info-panel, .filter-bar, .component-flow, .ar-hud-buttons')) {
        event.preventDefault();
      }
    };
  }

  get isFallbackActive(): boolean { return this.fallbackActive; }

  /** true bila perangkat + browser mendukung immersive-ar. */
  static async isSupported(): Promise<boolean> {
    try {
      if (!window.isSecureContext || !navigator.xr) return false;
      return await navigator.xr.isSessionSupported('immersive-ar');
    } catch {
      return false;
    }
  }

  private setState(state: ARState): void {
    this.state = state;
    this.hooks.onState(state);
  }

  async start(): Promise<void> {
    if (this.session || this.fallbackActive) return;
    this.setState('starting');

    let xrOk = false;
    let xrError = '';
    if (navigator.xr) {
      try {
        const supported = await navigator.xr.isSessionSupported('immersive-ar');
        if (supported) {
          await this.startWebXR();
          xrOk = true;
        } else {
          xrError = 'isSessionSupported=false';
        }
      } catch (error) {
        xrError = String(error instanceof Error ? error.message : error);
        console.warn('MODUL6: WebXR tidak tersedia, beralih ke mode cadangan.', error);
      }
    } else {
      xrError = 'navigator.xr undefined';
    }

    if (!xrOk) {
      await this.startFallback(xrError);
    }
  }

  private async startWebXR(): Promise<void> {
    const xr = navigator.xr!;
    this.sm.stopCameraPreview();
    const session = await xr.requestSession('immersive-ar', {
      requiredFeatures: [],
      optionalFeatures: ['hit-test', 'dom-overlay', 'light-estimation', 'anchors'],
      domOverlay: { root: this.overlayRoot },
    });

    this.session = session;
    session.addEventListener('end', this.handleEnd);
    session.addEventListener('select', this.handleSelect);
    this.overlayRoot.addEventListener('beforexrselect', this.guard);

    await this.sm.renderer.xr.setSession(session);

    // hit-test bersifat opsional — sesi tidak gagal bila tidak didukung.
    try {
      const viewerSpace = await session.requestReferenceSpace('viewer');
      this.hitTestSource = (await session.requestHitTestSource?.({ space: viewerSpace })) ?? null;
    } catch {
      this.hitTestSource = null;
    }

    this.setupLightEstimation(session);

    this.overlayRoot.classList.add('xr-active');
    this.sm.enterAR(this.getBaseScale());
    this.sm.modelRoot.visible = false;
    this.setState('placing');
    this.placeStartTime = performance.now();
    this.emitModeInfo('WebXR');
  }

  private async startFallback(reason?: string): Promise<void> {
    // Minta izin orientasi perangkat (iOS 13+ memerlukan gesture pengguna).
    try {
      const DOE = (window as unknown as { DeviceOrientationEvent?: typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
      if (DOE?.requestPermission) {
        await DOE.requestPermission();
      }
    } catch (error) {
      console.warn('MODUL6: izin orientasi perangkat ditolak.', error);
    }

    // Mode cadangan hanya masuk bila kamera benar-benar tersedia; bila tidak, jangan berpura-pura AR.
    const cameraOk = await this.sm.startCameraPreview();
    if (!cameraOk) {
      this.setState('idle');
      this.hooks.onEnded(
        `izin kamera ditolak atau kamera tidak tersedia${reason ? ` (WebXR: ${reason})` : ''}. Izinkan akses kamera di pengaturan browser lalu coba lagi`
      );
      return;
    }
    this.fallbackActive = true;
    this.sm.startFallback(this.getBaseScale());
    this.setState('placing');
    // Auto-spawn: langsung tempatkan model 1,6 m di depan arah pandang.
    this.sm.fallbackPlace();
    this.setState('placed');
    const limit = window.isSecureContext
      ? 'WebXR AR tidak tersedia di perangkat/browser ini (butuh Android + Chrome + ARCore)'
      : 'halaman bukan HTTPS sehingga WebXR AR tidak tersedia';
    this.emitModeInfo('Gyro', reason, `BUKAN tracking AR: ${limit}. Hanya putaran HP terlacak, posisi/langkah tidak`);
  }

  end(): void {
    if (this.session) {
      void this.session.end();
    } else if (this.fallbackActive) {
      this.cleanup();
      this.handleEnd();
    }
  }

  /** Kembali ke mode menempatkan (pindahkan model ke permukaan lain). */
  replace(): void {
    if (this.state !== 'placed') return;
    this.sm.modelRoot.visible = false;
    this.floorSnapped = false;
    this.releaseAnchor();
    this.trackedFrames = 0;
    this.placementMethod = '';
    this.placeStartTime = performance.now();
    this.setState('placing');
    if (this.fallbackActive) {
      this.sm.fallbackPlace();
      this.setState('placed');
    }
    // WebXR: spawn terjadi otomatis di frame berikutnya via onFrame.
  }

  /** Tempatkan model di mode cadangan (tap layar). */
  fallbackPlace(): void {
    if (!this.fallbackActive) return;
    if (this.state !== 'placing' && this.state !== 'placed') return;
    this.sm.fallbackPlace();
    this.setState('placed');
  }

  private setupLightEstimation(session: XRSession): void {
    if (!session.enabledFeatures?.includes('light-estimation')) return;

    const light = new XREstimatedLight(this.sm.renderer);
    light.addEventListener('estimationstart', () => {
      this.sm.scene.add(light);
      this.sm.setLightEstimation(true, light.environment);
    });
    light.addEventListener('estimationend', () => {
      this.sm.scene.remove(light);
      this.sm.setLightEstimation(false);
    });
    this.xrLight = light;
  }

  private readonly handleSelect = (): void => {
    // Selama AR, select (tap) hanya memicu replace bila reticle terlihat.
    if (this.state !== 'placed' || !this.reticle.visible) return;
    this.placeFromReticle();
  };

  /** Dipanggil tiap frame dari render loop. */
  onFrame(frame?: XRFrame): void {
    if (this.fallbackActive) {
      this.reticle.visible = false;
      return;
    }

    if (!frame) {
      this.reticle.visible = false;
      return;
    }

    const refSpace = this.sm.renderer.xr.getReferenceSpace();
    const viewerPose = refSpace ? frame.getViewerPose(refSpace) : undefined;

    // PENEMPATAN: (1) [opsional, PREFER_SURFACE_HIT] permukaan nyata dari hit-test;
    // (2) pose kamera WebXR: SPAWN.distance di depan kamera, begitu pelacakan stabil
    //     (atau setelah 4 dtk bila pelacakan belum stabil). Hasilnya langsung dikunci ke anchor.
    if (this.state === 'placing') {
      if (!viewerPose || !refSpace) return;
      this.trackedFrames = viewerPose.emulatedPosition ? 0 : this.trackedFrames + 1;
      const tracked = this.trackedFrames >= 15;
      const waited = performance.now() - this.placeStartTime;

      let placed = false;
      if (PREFER_SURFACE_HIT && tracked && this.hitTestSource) {
        const hit = frame.getHitTestResults(this.hitTestSource)[0];
        const hitPose = hit?.getPose(refSpace);
        if (hitPose && hitPose.transform.matrix[5] > 0.8) {
          const m = hitPose.transform.matrix;
          const cam = viewerPose.transform.position;
          const flatDist = Math.hypot(m[12] - cam.x, m[14] - cam.z);
          if (flatDist >= 0.4 && flatDist <= 2.5) {
            const yaw = Math.atan2(cam.x - m[12], cam.z - m[14]);
            this.sm.placeAt(new THREE.Vector3(m[12], m[13], m[14]), yaw);
            this.placementMethod = 'permukaan (hit-test)';
            placed = true;
          }
        }
      }
      if (!placed && (tracked || waited >= 4000) && this.spawnInFrontOfXRCamera(frame)) {
        this.placementMethod = tracked ? 'pose kamera' : 'pose kamera (tracking belum stabil)';
        placed = true;
      }
      if (!placed) {
        this.emitStatus(viewerPose.emulatedPosition);
        return;
      }

      this.placeStartTime = 0;
      this.createAnchorAtModel(frame);
      this.setState('placed');
      this.lastEmulated = null;
      this.emitStatus(viewerPose.emulatedPosition);
    }

    if (this.state === 'placed' && viewerPose) {
      if (this.lastEmulated !== viewerPose.emulatedPosition) {
        this.lastEmulated = viewerPose.emulatedPosition;
        this.emitStatus(viewerPose.emulatedPosition);
      }
    }

    // Model diikat ke anchor dunia: transformasi disimpan dalam koordinat dunia,
    // TIDAK pernah diturunkan dari pose kamera. ARCore memperbaiki anchor seiring peta membaik.
    if (this.state === 'placed' && refSpace) this.followAnchor(frame, refSpace);

    // Saat 'placed': coba hit-test opsional untuk lerp y ke permukaan nyata.
    if (SNAP_TO_SURFACE && this.state === 'placed' && this.hitTestSource && !this.floorSnapped) {
      const refSpace = this.sm.renderer.xr.getReferenceSpace();
      const hit = frame.getHitTestResults(this.hitTestSource)[0];
      const pose = hit && refSpace ? hit.getPose(refSpace) : null;
      if (pose && pose.transform.matrix[5] > 0.8) {
        const hitY = pose.transform.matrix[13];
        this.sm.lerpToFloorY(hitY);
        this.floorSnapped = true;
      }
    }

    this.reticle.visible = false;
  }

  private spawnInFrontOfXRCamera(frame: XRFrame): boolean {
    const refSpace = this.sm.renderer.xr.getReferenceSpace();
    const pose = refSpace ? frame.getViewerPose(refSpace) : undefined;
    if (!pose) return false;
    const p = pose.transform.position;
    const o = pose.transform.orientation;
    const camPos = new THREE.Vector3(p.x, p.y, p.z);
    const q = new THREE.Quaternion(o.x, o.y, o.z, o.w);

    // FOV nyata dari matriks proyeksi kamera XR (bergantung perangkat & orientasi layar).
    const proj = pose.views[0]?.projectionMatrix;
    const tanH = proj && proj[0] > 0 ? 1 / proj[0] : 0.5;
    const tanV = proj && proj[5] > 0 ? 1 / proj[5] : 0.9;

    const { center, yaw, scale } = this.sm.computeSpawn(camPos, q, tanH, tanV);
    this.sm.placeCenterAt(center, yaw, scale);
    return true;
  }

  /** Buat anchor di posisi model sekarang (koordinat dunia, ruang 'local'). */
  private createAnchorAtModel(frame: XRFrame): void {
    const refSpace = this.sm.renderer.xr.getReferenceSpace();
    if (!refSpace || typeof frame.createAnchor !== 'function') {
      this.anchorState = 'tidak didukung';
      return;
    }
    if (this.anchorPending) return;
    const p = this.sm.modelRoot.position;
    this.anchorPending = true;
    frame
      .createAnchor(new XRRigidTransform({ x: p.x, y: p.y, z: p.z, w: 1 }), refSpace)
      .then((anchor) => {
        this.anchorPending = false;
        if (!this.session || this.state !== 'placed') {
          anchor.delete();
          return;
        }
        this.anchor = anchor;
        this.anchorState = 'aktif';
        this.anchorQuat0.copy(this.sm.modelRoot.quaternion);
        this.appliedPos.copy(this.sm.modelRoot.position);
        this.appliedQuat.copy(this.sm.modelRoot.quaternion);
        this.hasApplied = true;
        this.emitStatus(this.lastEmulated ?? false);
      })
      .catch(() => {
        this.anchorPending = false;
        this.anchorState = 'tidak didukung';
        this.emitStatus(this.lastEmulated ?? false);
      });
  }

  private followAnchor(frame: XRFrame, refSpace: XRReferenceSpace): void {
    if (!this.anchor || !this.hasApplied) return;
    const root = this.sm.modelRoot;

    // Pengguna sengaja menggeser/memutar model (kontrol transformasi): anchor dipindah ke posisi baru.
    if (
      root.position.distanceToSquared(this.appliedPos) > 1e-10 ||
      root.quaternion.angleTo(this.appliedQuat) > 1e-5
    ) {
      this.releaseAnchor();
      this.createAnchorAtModel(frame);
      return;
    }

    const anchorPose = frame.getPose(this.anchor.anchorSpace, refSpace);
    if (!anchorPose) return; // anchor sementara tak terlacak: pertahankan posisi dunia terakhir
    const t = anchorPose.transform;
    const q = new THREE.Quaternion(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w);
    root.position.set(t.position.x, t.position.y, t.position.z);
    root.quaternion.copy(q).multiply(this.anchorQuat0);
    this.appliedPos.copy(root.position);
    this.appliedQuat.copy(root.quaternion);
  }

  private releaseAnchor(): void {
    try {
      this.anchor?.delete();
    } catch {
      /* abaikan */
    }
    this.anchor = null;
    this.hasApplied = false;
    this.anchorPending = false;
    if (this.anchorState === 'aktif') this.anchorState = 'belum';
  }

  /** Status diagnostik untuk panel: tracking, anchor, cara penempatan. */
  private emitStatus(emulated: boolean): void {
    const tracking = emulated ? 'tracking: HILANG (posisi dikira-kira)' : 'tracking: 6DoF OK';
    const anchor =
      this.anchorState === 'aktif'
        ? 'anchor: aktif'
        : this.anchorState === 'tidak didukung'
          ? 'anchor: tidak didukung'
          : 'anchor: -';
    const place = this.placementMethod ? ` · tempat: ${this.placementMethod}` : '';
    const text = `${tracking} · ${anchor}${place}`;
    if (text === this.lastStatusText) return;
    this.lastStatusText = text;
    this.emitModeInfo('WebXR', undefined, text);
  }

  private placeFromReticle(): void {
    const position = new THREE.Vector3().setFromMatrixPosition(this.reticle.matrix);
    const camPos = new THREE.Vector3().setFromMatrixPosition(this.sm.activeCamera.matrixWorld);
    const yaw = Math.atan2(camPos.x - position.x, camPos.z - position.z);
    this.sm.placeAt(position, yaw);
    this.reticle.visible = false;
    this.floorSnapped = true;
    this.setState('placed');
  }

  private emitModeInfo(mode: string, reason?: string, note?: string): void {
    this.hooks.onModeInfo?.({ mode, reason, note, widthM: this.sm.modelWidthMeters });
  }

  private readonly handleEnd = (): void => {
    this.cleanup();
    this.hooks.onEnded();
  };

  private cleanup(): void {
    this.overlayRoot.removeEventListener('beforexrselect', this.guard);
    this.overlayRoot.classList.remove('xr-active');

    this.session?.removeEventListener('end', this.handleEnd);
    this.session?.removeEventListener('select', this.handleSelect);
    this.hitTestSource?.cancel();
    this.hitTestSource = null;
    this.releaseAnchor();
    this.anchorState = 'belum';
    this.placementMethod = '';
    this.lastStatusText = '';
    this.trackedFrames = 0;
    this.session = null;
    this.fallbackActive = false;
    this.floorSnapped = false;

    if (this.xrLight) {
      this.sm.scene.remove(this.xrLight);
      this.xrLight.dispose();
      this.xrLight = null;
    }

    this.reticle.visible = false;
    if (this.sm.arMode) this.sm.exitAR();
    this.setState('idle');
  }

  dispose(): void {
    this.end();
    this.sm.scene.remove(this.reticle);
    this.reticle.geometry.dispose();
    (this.reticle.material as THREE.Material).dispose();
  }
}
