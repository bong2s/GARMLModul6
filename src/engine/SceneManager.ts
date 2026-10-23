import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Port dari SceneManager Modul 2 — algoritma gerak identik:
 *
 *   SENTUH : 1 jari = putar (arcball), 2 jari = geser (pan) + cubit (zoom)
 *   MOUSE  : kiri = putar, kanan = geser, roda = zoom
 *
 * Perbedaan terhadap Modul 2 (karena Modul 4 menampilkan 4 model sekaligus):
 *   • resetView() menghitung jarak kamera dari bounding sphere seluruh
 *     susunan model, lalu mengembalikan orientasi awal (`homeQuaternion`).
 */
export class SceneManager {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly modelRoot: THREE.Group;

  /** Orientasi "rumah" modelRoot — dipakai saat Reset View. */
  readonly homeQuaternion = new THREE.Quaternion();

  private readonly container: HTMLElement;
  private animationRunning = false;
  private resetAnimationFrame: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private frameCallback: ((frame?: XRFrame) => void) | null = null;

  private cameraVideo: HTMLVideoElement | null = null;
  private cameraStream: MediaStream | null = null;

  private modelScale = 1;
  private readonly minModelScale = 0.08;
  private readonly maxModelScale = 8;
  private readonly arScaleMin = 0.4;
  private readonly arScaleMax = 3.0;

  // Pointer state
  private readonly activePointers = new Map<number, THREE.Vector2>();
  private readonly lastSinglePointer = new THREE.Vector2();
  private readonly twoFingerLastMidpoint = new THREE.Vector2();
  private twoFingerLastDistance = 0;
  private twoFingerMode = false;

  // Mouse state
  private mouseRotateActive = false;
  private mousePanActive = false;
  private readonly lastMousePosition = new THREE.Vector2();

  // Virtual trackball (arcball)
  private readonly ballCenter = new THREE.Vector2();
  private ballRadius = 1;
  private readonly ballPrev = new THREE.Vector3();
  private readonly ballCurr = new THREE.Vector3();
  private readonly ballDelta = new THREE.Quaternion();
  private readonly cameraQuat = new THREE.Quaternion();
  private readonly cameraQuatInv = new THREE.Quaternion();
  private readonly projectedCenter = new THREE.Vector3();
  private ballActive = false;

  // Pan helpers
  private readonly panRight = new THREE.Vector3();
  private readonly panUp = new THREE.Vector3();

  private readonly disposers: Array<() => void> = [];

  // ---- Mode AR (WebXR) ----
  /** true selama sesi WebXR berjalan: kontrol berubah menjadi yaw / geser lantai / skala. */
  arMode = false;
  private baseScale = 1;
  /** y lokal dasar susunan model (lantai) terhadap pusat modelRoot */
  floorY = 0;
  private yawLastX = 0;
  placedYaw = 0;
  private previewState: { pos: THREE.Vector3; quat: THREE.Quaternion; camPos: THREE.Vector3 } | null = null;
  // ---- Mode cadangan AR (DeviceOrientation) ----
  private fallbackActive = false;
  private deviceOrientationHandler: ((e: DeviceOrientationEvent) => void) | null = null;
  private readonly fallbackCamPos = new THREE.Vector3(0, 1.4, 0);
  private readonly fallbackTarget = new THREE.Vector3();
  private orientQuat = new THREE.Quaternion();
  private screenOrientHandler: (() => void) | null = null;
  /**
   * Konfigurasi penempatan awal susunan komponen di AR (satuan meter / radian).
   *  - distance     : jarak kamera → PUSAT susunan (3D, bukan hanya horizontal).
   *  - minElevation / maxElevation : elevasi pusat susunan di atas horizon kamera.
   *    Susunan sengaja sedikit DI ATAS tinggi kamera supaya sisi bawah komponen
   *    terlihat bila HP diturunkan/dimiringkan. Dibatasi agar tetap masuk layar.
   *  - fill         : porsi maksimum setengah-FOV horizontal yang boleh dipakai susunan.
   *  - width        : batas atas lebar susunan (meter).
   */
  static readonly SPAWN = {
    distance: 0.6,
    minElevation: THREE.MathUtils.degToRad(6),
    maxElevation: THREE.MathUtils.degToRad(16),
    fill: 0.9,
    width: 0.5,
  };
  get spawn() { return SceneManager.SPAWN; }

  /** Setengah-ukuran susunan (x,y,z) pada skala 1, diisi oleh ARApp setelah model dirakit. */
  readonly arHalfExtent = new THREE.Vector3(0.5, 0.05, 0.5);

  /**
   * Hitung pusat, yaw, dan skala spawn dari pose kamera + FOV nyata.
   * Pusat susunan berada `distance` dari kamera pada arah pandang (pitch dibatasi),
   * skala dipilih agar sudut terluar susunan (sudut terdekat) tetap dalam `fill` × setengah FOV.
   * Hanya dipanggil saat spawn/penempatan ulang — TIDAK dipanggil tiap frame.
   */
  computeSpawn(
    camPos: THREE.Vector3,
    camQuat: THREE.Quaternion,
    tanHalfH: number,
    tanHalfV: number
  ): { center: THREE.Vector3; yaw: number; scale: number } {
    const S = SceneManager.SPAWN;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat).normalize();
    const pitch = Math.asin(THREE.MathUtils.clamp(f.y, -1, 1));

    // Arah horizontal: bila HP menunduk/menengadah ekstrem pakai arah atas layar.
    const h = new THREE.Vector3(f.x, 0, f.z);
    if (h.lengthSq() < 0.15) { h.set(0, 1, 0).applyQuaternion(camQuat); h.y = 0; }
    if (h.lengthSq() < 1e-6) h.set(0, 0, -1);
    h.normalize();

    // Elevasi pusat: di atas horizon (supaya bisa dilihat dari bawah), tetapi tidak
    // lebih dari ~60% setengah-FOV vertikal dari sumbu kamera agar tidak keluar layar.
    const vHalf = Math.atan(Math.max(tanHalfV, 0.2));
    let elev = THREE.MathUtils.clamp(pitch, S.minElevation, S.maxElevation);
    elev = Math.min(elev, pitch + 0.6 * vHalf);
    // Jangan pernah di bawah horizon kamera: sisi bawah komponen harus tetap bisa dilihat.
    elev = Math.max(elev, THREE.MathUtils.degToRad(2));

    const center = new THREE.Vector3(
      camPos.x + h.x * S.distance * Math.cos(elev),
      camPos.y + S.distance * Math.sin(elev),
      camPos.z + h.z * S.distance * Math.cos(elev)
    );
    const yaw = Math.atan2(camPos.x - center.x, camPos.z - center.z);

    // Skala: sisi lebar (x lokal) berada lateral, sisi dalam (z lokal) mengarah ke kamera.
    const t = Math.tan(S.fill * Math.atan(Math.max(tanHalfH, 0.2)));
    const hx = Math.max(this.arHalfExtent.x, 1e-6);
    const hz = Math.max(this.arHalfExtent.z, 1e-6);
    const fitScale = (t * S.distance) / (hx + t * hz);
    const capScale = S.width / (2 * Math.max(hx, hz));
    return { center, yaw, scale: Math.min(fitScale, capScale) };
  }

  /** Set skala dasar AR (dipakai placeAt/resetAR) — hanya efektif saat mode AR. */
  setARBaseScale(scale: number): void {
    if (scale > 0 && Number.isFinite(scale)) this.baseScale = scale;
  }

  /** Letakkan susunan sehingga PUSATNYA berada di `center` (koordinat dunia). */
  placeCenterAt(center: THREE.Vector3, yaw: number, scale: number): void {
    this.setARBaseScale(scale);
    this.placeAt(new THREE.Vector3(center.x, center.y + this.floorY * scale, center.z), yaw);
  }
  private gotOrientation = false;
  private pendingPlace = false;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;

  // ---- Pencahayaan yang mengikuti model ----
  private keyLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private readonly lightTarget = new THREE.Object3D();
  private readonly keyOffset = new THREE.Vector3(6, 10, 8);
  private lastLightScale = -1;
  private readonly defaultEnvironment: THREE.Texture;
  private lightEstimating = false;

  constructor(container: HTMLElement) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.background = null;

    this.modelRoot = new THREE.Group();
    this.scene.add(this.modelRoot);

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);

    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.01, 400);
    this.camera.position.set(0, 0, 8);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Bayangan hanya dihitung ulang saat susunan bergerak (lihat updateLights).
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local');

    // Pantulan lingkungan agar material logam/kaca tampak realistis.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.defaultEnvironment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.defaultEnvironment;
    this.scene.environmentIntensity = 0.6;
    this.renderer.setClearAlpha(0);

    const canvas = this.renderer.domElement;
    canvas.style.position = 'relative';
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.background = 'transparent';
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    (canvas.style as CSSStyleDeclaration & { webkitUserSelect: string }).webkitUserSelect = 'none';
    canvas.style.zIndex = '1';
    container.appendChild(canvas);

    this.setupLights();
    this.setupPointerControls();

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
  }

  // ============================================================
  // LIGHTING (sama dengan Modul 2)
  // ============================================================

  private setupLights(): void {
    this.hemiLight = new THREE.HemisphereLight('#fff1dc', '#2b211d', 1.5);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight('#fff8ef', 2.2);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight, this.lightTarget);
    this.keyLight.target = this.lightTarget;

    const fill = new THREE.DirectionalLight('#9fc4e4', 0.8);
    fill.position.set(-7, 5, 2);
    this.scene.add(fill);
  }

  /** Lampu utama + bayangan mengikuti posisi & skala modelRoot (preview maupun AR). */
  updateLights(): void {
    this.syncShadowMap();
    const k = this.modelRoot.scale.x;
    this.lightTarget.position.copy(this.modelRoot.position);
    this.keyLight.position.copy(this.modelRoot.position).addScaledVector(this.keyOffset, k);

    if (Math.abs(k - this.lastLightScale) > this.lastLightScale * 0.01) {
      this.lastLightScale = k;
      const cam = this.keyLight.shadow.camera;
      const half = 8 * k;
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      cam.near = 0.5 * k;
      cam.far = 40 * k;
      cam.updateProjectionMatrix();
    }
  }

  private readonly shadowSigPos = new THREE.Vector3(NaN, 0, 0);
  private readonly shadowSigQuat = new THREE.Quaternion();
  private shadowSigScale = NaN;

  /** Minta bayangan dihitung ulang hanya bila posisi/arah/ukuran susunan berubah. */
  private syncShadowMap(): void {
    const m = this.modelRoot;
    const changed =
      Number.isNaN(this.shadowSigScale) ||
      !m.position.equals(this.shadowSigPos) ||
      !m.quaternion.equals(this.shadowSigQuat) ||
      m.scale.x !== this.shadowSigScale;
    if (!changed) return;
    this.shadowSigPos.copy(m.position);
    this.shadowSigQuat.copy(m.quaternion);
    this.shadowSigScale = m.scale.x;
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** Dipanggil saat estimasi cahaya WebXR aktif/nonaktif. */
  setLightEstimation(active: boolean, environment?: THREE.Texture | null): void {
    this.lightEstimating = active;
    this.hemiLight.intensity = active ? 0.5 : 1.5;
    this.keyLight.intensity = active ? 0.8 : 2.2;
    this.scene.environment = active && environment ? environment : this.defaultEnvironment;
    this.scene.environmentIntensity = active ? 1 : 0.6;
  }

  // ============================================================
  // POINTER CONTROLS
  // ============================================================

  private setupPointerControls(): void {
    const canvas = this.renderer.domElement;

    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      handler: (event: HTMLElementEventMap[K]) => void,
      options?: AddEventListenerOptions
    ) => {
      canvas.addEventListener(type, handler as EventListener, options);
      this.disposers.push(() =>
        canvas.removeEventListener(type, handler as EventListener)
      );
    };

    on(
      'pointerdown',
      (event) => {
        if (this.arMode) return;
        event.preventDefault();
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }

        this.activePointers.set(
          event.pointerId,
          new THREE.Vector2(event.clientX, event.clientY)
        );

        // MOUSE
        if (event.pointerType === 'mouse') {
          if (event.button === 0) {
            this.mouseRotateActive = true;
            this.mousePanActive = false;
            this.beginRotate(event.clientX, event.clientY);
          }
          if (event.button === 2) {
            this.mouseRotateActive = false;
            this.mousePanActive = true;
          }
          this.lastMousePosition.set(event.clientX, event.clientY);
          return;
        }

        // TOUCH / PEN
        if (this.activePointers.size === 1) {
          this.twoFingerMode = false;
          this.lastSinglePointer.set(event.clientX, event.clientY);
          this.beginRotate(event.clientX, event.clientY);
          return;
        }

        if (this.activePointers.size === 2) {
          this.ballActive = false;
          this.beginTwoFingerGesture();
        }
      },
      { passive: false }
    );

    on(
      'pointermove',
      (event) => {
        if (!this.activePointers.has(event.pointerId)) return;
        if (this.arMode) return;
        event.preventDefault();

        this.activePointers.set(
          event.pointerId,
          new THREE.Vector2(event.clientX, event.clientY)
        );

        if (event.pointerType === 'mouse') {
          const dx = event.clientX - this.lastMousePosition.x;
          const dy = event.clientY - this.lastMousePosition.y;

          if (this.mouseRotateActive) this.rotateArcball(event.clientX, event.clientY);
          if (this.mousePanActive) this.panModel(dx, dy);

          this.lastMousePosition.set(event.clientX, event.clientY);
          return;
        }

        if (this.activePointers.size === 1 && !this.twoFingerMode) {
          this.rotateArcball(event.clientX, event.clientY);
          this.lastSinglePointer.set(event.clientX, event.clientY);
          return;
        }

        if (this.activePointers.size === 2) this.handleTwoFingerGesture();
      },
      { passive: false }
    );

    const endPointer = (event: PointerEvent) => {
      this.activePointers.delete(event.pointerId);

      if (event.pointerType === 'mouse') {
        this.mouseRotateActive = false;
        this.mousePanActive = false;
        this.ballActive = false;
      }

      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }

      if (this.activePointers.size === 0) {
        this.twoFingerMode = false;
        this.twoFingerLastDistance = 0;
        return;
      }

      if (this.activePointers.size === 1) {
        const remaining = [...this.activePointers.values()][0];
        this.lastSinglePointer.copy(remaining);
        this.beginRotate(remaining.x, remaining.y);
        this.twoFingerMode = false;
        this.twoFingerLastDistance = 0;
      }
    };

    on('pointerup', endPointer);
    on('pointercancel', endPointer);
    on('contextmenu', (event) => event.preventDefault());

    on(
      'wheel',
      (event) => {
        if (this.arMode) return;
        event.preventDefault();
        this.scaleModel(Math.exp(-event.deltaY * 0.0015));
      },
      { passive: false }
    );
  }

  // ============================================================
  // TWO FINGER: PAN + PINCH
  // ============================================================

  private beginTwoFingerGesture(): void {
    const points = [...this.activePointers.values()];
    if (points.length !== 2) return;
    const [a, b] = points;

    this.twoFingerLastMidpoint.set((a.x + b.x) * 0.5, (a.y + b.y) * 0.5);
    this.twoFingerLastDistance = Math.max(a.distanceTo(b), 0.001);
    this.twoFingerMode = true;
  }

  private handleTwoFingerGesture(): void {
    const points = [...this.activePointers.values()];
    if (points.length !== 2) return;
    const [a, b] = points;

    const mx = (a.x + b.x) * 0.5;
    const my = (a.y + b.y) * 0.5;

    const dx = mx - this.twoFingerLastMidpoint.x;
    const dy = my - this.twoFingerLastMidpoint.y;
    if (dx !== 0 || dy !== 0) this.panModel(dx, dy);

    const distance = Math.max(a.distanceTo(b), 0.001);
    if (this.twoFingerLastDistance > 0) {
      this.scaleModel(distance / this.twoFingerLastDistance);
    }

    this.twoFingerLastMidpoint.set(mx, my);
    this.twoFingerLastDistance = distance;
  }

  // ============================================================
  // ARCBALL — permukaan yang disentuh mengikuti jari
  // ============================================================

  private mapToBall(clientX: number, clientY: number, out: THREE.Vector3): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = (clientX - rect.left - this.ballCenter.x) / this.ballRadius;
    const y = -(clientY - rect.top - this.ballCenter.y) / this.ballRadius;
    const d2 = x * x + y * y;
    const z = d2 <= 0.5 ? Math.sqrt(1 - d2) : 0.5 / Math.sqrt(d2);
    out.set(x, y, z).normalize();
  }

  private beginRotate(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      this.ballActive = false;
      return;
    }

    this.modelRoot.updateMatrixWorld(true);
    this.projectedCenter.copy(this.modelRoot.position).project(this.camera);

    this.ballCenter.set(
      (this.projectedCenter.x * 0.5 + 0.5) * rect.width,
      (-this.projectedCenter.y * 0.5 + 0.5) * rect.height
    );
    this.ballRadius = Math.max(Math.min(rect.width, rect.height) * 0.5, 1);

    this.mapToBall(clientX, clientY, this.ballPrev);
    this.yawLastX = clientX;
    this.ballActive = true;
  }

  private rotateArcball(clientX: number, clientY: number): void {
    if (!this.ballActive) {
      this.beginRotate(clientX, clientY);
      return;
    }

    // AR: tidak ada gestur jari yang memutar modelRoot.
    if (this.arMode) {
      return;
    }

    this.mapToBall(clientX, clientY, this.ballCurr);
    if (this.ballPrev.distanceToSquared(this.ballCurr) < 1e-12) return;

    this.ballDelta.setFromUnitVectors(this.ballPrev, this.ballCurr);

    this.camera.updateMatrixWorld(true);
    this.camera.getWorldQuaternion(this.cameraQuat);
    this.cameraQuatInv.copy(this.cameraQuat).invert();

    this.ballDelta.premultiply(this.cameraQuat).multiply(this.cameraQuatInv);
    this.modelRoot.quaternion.premultiply(this.ballDelta).normalize();

    this.ballPrev.copy(this.ballCurr);
  }

  // ============================================================
  // PAN — model mengikuti jari di bidang layar (tidak terpengaruh rotasi)
  // ============================================================

  private panModel(dx: number, dy: number): void {
    // AR: geser sepanjang bidang lantai mengikuti arah pandang kamera.
    if (this.arMode) {
      const cam = this.activeCamera;
      const forward = cam.getWorldDirection(new THREE.Vector3());
      forward.y = 0;
      if (forward.lengthSq() < 1e-6) return;
      forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
      const camPos = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
      const k = Math.max(camPos.distanceTo(this.modelRoot.position), 0.3) * 0.0012;
      this.modelRoot.position.addScaledVector(right, dx * k);
      this.modelRoot.position.addScaledVector(forward, -dy * k);
      return;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    const height = Math.max(rect.height, 1);
    const width = Math.max(rect.width, 1);

    const distance = Math.max(
      this.camera.position.distanceTo(this.modelRoot.position),
      0.01
    );

    const visibleWorldHeight =
      2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) * 0.5);
    const visibleWorldWidth = visibleWorldHeight * (width / height);

    this.panRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion).normalize();
    this.panUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion).normalize();

    this.modelRoot.position.addScaledVector(this.panRight, dx * (visibleWorldWidth / width));
    this.modelRoot.position.addScaledVector(this.panUp, -dy * (visibleWorldHeight / height));
  }

  // ============================================================
  // SCALE
  // ============================================================

  private scaleModel(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;

    const [min, max] = this.arMode ? [this.arScaleMin, this.arScaleMax] : [this.minModelScale, this.maxModelScale];

    // AR: pertahankan lantai model tetap di permukaan nyata saat skala berubah.
    const oldWorldScale = this.modelRoot.scale.x;
    const floorWorldY = this.modelRoot.position.y + this.floorY * oldWorldScale;

    this.modelScale = THREE.MathUtils.clamp(this.modelScale * factor, min, max);
    this.modelRoot.scale.setScalar(this.modelScale * this.baseScale);

    if (this.arMode) {
      this.modelRoot.position.y = floorWorldY - this.floorY * this.modelRoot.scale.x;
    }
  }

  // ============================================================
  // CAMERA BACKGROUND (kamera belakang sebagai latar AR)
  // ============================================================

  async startCameraPreview(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) return false;
    if (this.cameraStream && this.cameraVideo) return true;

    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
        },
        audio: false,
      });
    } catch (error) {
      console.warn('MODUL6: tidak dapat mengakses kamera belakang.', error);
      this.cameraStream = null;
      return false;
    }

    const video = document.createElement('video');
    video.className = 'ar-camera-bg';
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.srcObject = this.cameraStream;

    if (window.getComputedStyle(this.container).position === 'static') {
      this.container.style.position = 'relative';
    }

    this.container.prepend(video);
    this.cameraVideo = video;
    this.updateCameraVideoLayout();

    try {
      await video.play();
    } catch (error) {
      console.warn('MODUL6: pemutaran kamera tertunda.', error);
    }

    return true;
  }

  stopCameraPreview(): void {
    this.cameraStream?.getTracks().forEach((track) => track.stop());
    this.cameraStream = null;
    if (this.cameraVideo) {
      this.cameraVideo.pause();
      this.cameraVideo.srcObject = null;
      this.cameraVideo.remove();
      this.cameraVideo = null;
    }
  }

  private updateCameraVideoLayout(): void {
    if (this.cameraVideo) {
      const s = this.cameraVideo.style;
      s.position = 'absolute';
      s.inset = '0';
      s.width = '100%';
      s.height = '100%';
      s.objectFit = 'cover';
      s.display = 'block';
      s.zIndex = '0';
      s.pointerEvents = 'none';
    }

    const cs = this.renderer.domElement.style;
    cs.position = 'relative';
    cs.zIndex = '1';
    cs.background = 'transparent';
  }

  // ============================================================
  // LOOP
  // ============================================================

  setFrameCallback(callback: (frame?: XRFrame) => void): void {
    this.frameCallback = callback;
  }

  start(): void {
    if (this.animationRunning) return;
    this.animationRunning = true;

    this.renderer.setAnimationLoop((_time, frame) => {
      this.frameCallback?.(frame);
      this.renderer.render(this.scene, this.camera);
    });
  }

  // ============================================================
  // RESET VIEW
  // ============================================================

  /** Bounding sphere seluruh isi modelRoot pada orientasi "rumah". */
  private computeHomeSphere(): THREE.Sphere {
    const savedQuat = this.modelRoot.quaternion.clone();
    const savedPos = this.modelRoot.position.clone();
    const savedScale = this.modelRoot.scale.clone();

    this.modelRoot.position.set(0, 0, 0);
    this.modelRoot.scale.setScalar(1);
    this.modelRoot.quaternion.copy(this.homeQuaternion);
    this.modelRoot.updateMatrixWorld(true);

    const sphere = new THREE.Box3()
      .setFromObject(this.modelRoot)
      .getBoundingSphere(new THREE.Sphere());

    this.modelRoot.quaternion.copy(savedQuat);
    this.modelRoot.position.copy(savedPos);
    this.modelRoot.scale.copy(savedScale);
    this.modelRoot.updateMatrixWorld(true);

    return sphere;
  }

  resetView(animate = true): void {
    if (this.arMode) {
      this.resetAR();
      return;
    }
    this.cancelResetAnimation();

    const sphere = this.computeHomeSphere();

    this.modelRoot.position.set(0, 0, 0);
    this.modelRoot.quaternion.copy(this.homeQuaternion);
    this.modelScale = 1;
    this.modelRoot.scale.setScalar(1);
    this.modelRoot.updateMatrixWorld(true);

    const verticalHalf = THREE.MathUtils.degToRad(this.camera.fov * 0.5);
    const horizontalHalf = Math.atan(Math.tan(verticalHalf) * this.camera.aspect);
    const halfFov = Math.min(verticalHalf, horizontalHalf);

    const distance = THREE.MathUtils.clamp(
      (Math.max(sphere.radius, 0.5) / Math.sin(halfFov)) * 0.8,
      2,
      150
    );

    const center = sphere.center.clone();
    const endPosition = center.clone();
    endPosition.z += distance;

    if (!animate) {
      this.camera.position.copy(endPosition);
      this.camera.lookAt(center);
      return;
    }

    const startPosition = this.camera.position.clone();
    const startedAt = performance.now();

    const tween = () => {
      const progress = Math.min((performance.now() - startedAt) / 500, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      this.camera.position.lerpVectors(startPosition, endPosition, eased);
      this.camera.lookAt(center);

      this.resetAnimationFrame =
        progress < 1 ? requestAnimationFrame(tween) : null;
    };

    tween();
  }

  private cancelResetAnimation(): void {
    if (this.resetAnimationFrame === null) return;
    cancelAnimationFrame(this.resetAnimationFrame);
    this.resetAnimationFrame = null;
  }

  // ============================================================
  // AR (WebXR)
  // ============================================================

  /** Kamera yang sebenarnya dipakai render (kamera XR saat sesi AR aktif). */
  get activeCamera(): THREE.PerspectiveCamera {
    return this.renderer.xr.isPresenting
      ? (this.renderer.xr.getCamera() as unknown as THREE.PerspectiveCamera)
      : this.camera;
  }

  get isLightEstimating(): boolean {
    return this.lightEstimating;
  }

  /** Masuk mode AR: model langsung terlihat, siap di-spawn di frame pertama. */
  enterAR(baseScale: number): void {
    this.cancelResetAnimation();
    this.previewState = {
      pos: this.modelRoot.position.clone(),
      quat: this.modelRoot.quaternion.clone(),
      camPos: this.camera.position.clone(),
    };
    this.arMode = true;
    this.baseScale = baseScale;
    this.modelScale = 1;
    this.modelRoot.scale.setScalar(baseScale);
    this.modelRoot.rotation.set(0, 0, 0);
    this.modelRoot.visible = true;
    this.modelRoot.traverse((o) => { o.frustumCulled = false; });
  }

  /** Letakkan model: lantai model tepat di titik, menghadap pengguna (yaw saja). */
  placeAt(point: THREE.Vector3, yaw: number): void {
    this.placedYaw = yaw;
    this.modelScale = 1;
    this.modelRoot.scale.setScalar(this.baseScale);
    this.modelRoot.rotation.set(0, yaw, 0);
    this.modelRoot.position.set(
      point.x,
      point.y - this.floorY * this.modelRoot.scale.x,
      point.z
    );
    this.modelRoot.visible = true;
    this.modelRoot.matrixAutoUpdate = true;
    this.modelRoot.traverse((o) => { o.frustumCulled = false; });
  }

  /** Lerp halus modelRoot.position.y ke y permukaan (x,z tetap). Sekali saja. */
  lerpToFloorY(targetY: number): void {
    const currentFloorY = this.modelRoot.position.y + this.floorY * this.modelRoot.scale.x;
    const targetFloorY = targetY;
    const startY = this.modelRoot.position.y;
    const deltaY = targetFloorY - currentFloorY;
    const startedAt = performance.now();
    const duration = 500;

    const tween = () => {
      const t = Math.min((performance.now() - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      this.modelRoot.position.y = startY + deltaY * eased;
      if (t < 1) requestAnimationFrame(tween);
    };
    tween();
  }

  /** Reset AR: rotasi & skala awal, posisi tetap di tempat model diletakkan. */
  resetAR(): void {
    const floorWorldY = this.modelRoot.position.y + this.floorY * this.modelRoot.scale.x;
    this.modelScale = 1;
    this.modelRoot.scale.setScalar(this.baseScale);
    this.modelRoot.rotation.set(0, this.placedYaw, 0);
    this.modelRoot.position.y = floorWorldY - this.floorY * this.modelRoot.scale.x;
  }

  exitAR(): void {
    this.stopFallback();
    this.arMode = false;
    this.baseScale = 1;
    this.modelRoot.visible = true;
    this.setLightEstimation(false);
    this.previewState = null;
    this.handleResize();
    this.resetView(false);
  }

  // ============================================================
  // MODE CADANGAN AR (DeviceOrientation — world-anchored tanpa WebXR)
  // ============================================================

  // Rumus baku three.js DeviceOrientationControls: koreksi orientasi layar.
  private static readonly Z_EULER_QUAT = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

  /** Mulai mode cadangan: kamera mengikuti orientasi perangkat. */
  startFallback(baseScale: number): void {
    this.enterAR(baseScale);
    this.fallbackActive = true;
    this.camera.position.copy(this.fallbackCamPos);
    this.camera.up.set(0, 1, 0);
    this.camera.fov = 60;
    this.camera.near = 0.01;
    this.camera.updateProjectionMatrix();

    const applyOrientation = () => {
      const so = (window.screen?.orientation?.angle) ?? (window.orientation as number | undefined ?? 0);
      const screenQuat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1), -THREE.MathUtils.degToRad(so)
      );
      this.camera.quaternion.copy(this.orientQuat)
        .multiply(SceneManager.Z_EULER_QUAT)
        .multiply(screenQuat);
      this.camera.updateMatrixWorld();
    };

    this.gotOrientation = false;
    this.deviceOrientationHandler = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      const alpha = e.alpha != null ? THREE.MathUtils.degToRad(e.alpha) : 0;
      const beta = THREE.MathUtils.degToRad(e.beta);
      const gamma = THREE.MathUtils.degToRad(e.gamma);
      this.orientQuat.setFromEuler(new THREE.Euler(beta, alpha, -gamma, 'YXZ'));
      applyOrientation();
      if (!this.gotOrientation) {
        this.gotOrientation = true;
        if (this.pendingPlace) {
          this.pendingPlace = false;
          this.fallbackPlace();
        }
      }
    };
    // HANYA 'deviceorientation' (relatif, halus). Jangan pasang versi absolute: nilai alpha-nya berbeda dan membuat kamera bolak-balik.
    window.addEventListener('deviceorientation', this.deviceOrientationHandler, true);

    this.screenOrientHandler = applyOrientation;
    window.screen?.orientation?.addEventListener?.('change', applyOrientation);
    window.addEventListener('orientationchange', applyOrientation);

    applyOrientation();
  }

  /** Arah pandang awal (dikunci saat spawn pertama mode cadangan). */
  private fallbackSpawnDir: THREE.Vector3 | null = null;

  /** Tempatkan model di depan arah pandang (arah dihitung SEKALI lalu dikunci). */
  fallbackPlace(): void {
    // Tunggu data sensor pertama supaya arah pandang benar (cadangan 800 ms).
    if (!this.gotOrientation) {
      this.modelRoot.visible = false;
      this.pendingPlace = true;
      if (!this.pendingTimer) {
        this.pendingTimer = setTimeout(() => {
          this.pendingTimer = null;
          if (!this.pendingPlace) return;
          this.pendingPlace = false;
          this.gotOrientation = true;
          this.fallbackPlace();
        }, 800);
      }
      return;
    }
    // Arah pandang SAAT INI (tiap kali ditempatkan/ditempatkan ulang).
    this.fallbackSpawnDir = this.camera.getWorldDirection(new THREE.Vector3());
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const tanH = tanV * (this.camera.aspect || 1);
    const { center, yaw, scale } = this.computeSpawn(
      this.fallbackCamPos, this.camera.quaternion, tanH, tanV
    );
    this.placeCenterAt(center, yaw, scale);
  }

  private stopFallback(): void {
    if (!this.fallbackActive) return;
    this.fallbackActive = false;
    this.fallbackSpawnDir = null;
    this.pendingPlace = false;
    if (this.pendingTimer) { clearTimeout(this.pendingTimer); this.pendingTimer = null; }
    this.camera.fov = 42;
    this.camera.updateProjectionMatrix();
    if (this.deviceOrientationHandler) {
      window.removeEventListener('deviceorientation', this.deviceOrientationHandler, true);
      this.deviceOrientationHandler = null;
    }
    if (this.screenOrientHandler) {
      window.screen?.orientation?.removeEventListener?.('change', this.screenOrientHandler);
      window.removeEventListener('orientationchange', this.screenOrientHandler);
      this.screenOrientHandler = null;
    }
  }

  get isFallbackActive(): boolean { return this.fallbackActive; }

  /** Lebar modelRoot dalam meter pada skala AR saat ini. */
  get modelWidthMeters(): number {
    if (!this.arMode) return 0;
    const box = new THREE.Box3().setFromObject(this.modelRoot);
    const size = box.getSize(new THREE.Vector3());
    return Math.max(size.x, size.z);
  }

  // ============================================================
  // RESIZE / DISPOSE
  // ============================================================

  private handleResize(): void {
    if (this.renderer.xr.isPresenting) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width <= 0 || height <= 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.updateCameraVideoLayout();
  }

  dispose(): void {
    this.stopFallback();
    this.cancelResetAnimation();
    this.renderer.setAnimationLoop(null);
    this.animationRunning = false;
    this.resizeObserver?.disconnect();
    this.disposers.forEach((fn) => fn());
    this.disposers.length = 0;

    this.cameraStream?.getTracks().forEach((track) => track.stop());
    this.cameraStream = null;

    if (this.cameraVideo) {
      this.cameraVideo.pause();
      this.cameraVideo.srcObject = null;
      this.cameraVideo.remove();
      this.cameraVideo = null;
    }

    this.activePointers.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
