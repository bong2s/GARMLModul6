import * as THREE from 'three';

/**
 * Menggabungkan mesh statis yang memakai MATERIAL YANG SAMA menjadi satu mesh.
 *
 * Mengapa: motherboard memiliki ratusan mesh kecil. Tiap mesh = satu draw call
 * (dua kali dengan bayangan), sehingga HP kelas menengah tersendat. Setelah
 * digabung, jumlah draw call setara jumlah material.
 *
 * Aman: mesh yang tidak memenuhi syarat (skinned, morph, multi-material, atribut
 * selain position/normal/uv) dibiarkan apa adanya.
 */

const ALLOWED_ATTRIBUTES = new Set(['position', 'normal', 'uv']);

function toFloatAttribute(
  source: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  itemSize: number
): THREE.BufferAttribute {
  const out = new Float32Array(source.count * itemSize);
  for (let i = 0; i < source.count; i++) {
    out[i * itemSize] = source.getX(i);
    if (itemSize > 1) out[i * itemSize + 1] = source.getY(i);
    if (itemSize > 2) out[i * itemSize + 2] = source.getZ(i);
  }
  return new THREE.BufferAttribute(out, itemSize);
}

function bakeGeometry(mesh: THREE.Mesh, rootInverse: THREE.Matrix4): THREE.BufferGeometry | null {
  const src = mesh.geometry;
  const position = src.getAttribute('position');
  if (!position || position.count === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', toFloatAttribute(position, 3));

  // indeks selalu ada (mergeGeometries mewajibkan konsisten)
  const index = src.getIndex();
  const indices = new Uint32Array(index ? index.count : position.count);
  if (index) for (let i = 0; i < index.count; i++) indices[i] = index.getX(i);
  else for (let i = 0; i < indices.length; i++) indices[i] = i;

  const normal = src.getAttribute('normal');
  const uv = src.getAttribute('uv');
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  if (normal) geometry.setAttribute('normal', toFloatAttribute(normal, 3));
  else geometry.computeVertexNormals();
  geometry.setAttribute(
    'uv',
    uv ? toFloatAttribute(uv, 2) : new THREE.BufferAttribute(new Float32Array(position.count * 2), 2)
  );

  const relative = new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
  geometry.applyMatrix4(relative);

  // Transformasi bercermin membalik urutan sisi segitiga → koreksi.
  if (relative.determinant() < 0) {
    const arr = geometry.getIndex()!.array as Uint32Array;
    for (let i = 0; i + 2 < arr.length; i += 3) {
      const t = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = t;
    }
  }
  return geometry;
}

function mergeList(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  let vertexTotal = 0;
  let indexTotal = 0;
  for (const g of list) {
    vertexTotal += g.getAttribute('position').count;
    indexTotal += g.getIndex()!.count;
  }
  const position = new Float32Array(vertexTotal * 3);
  const normal = new Float32Array(vertexTotal * 3);
  const uv = new Float32Array(vertexTotal * 2);
  const index = new Uint32Array(indexTotal);

  let vo = 0;
  let io = 0;
  for (const g of list) {
    const p = g.getAttribute('position').array as Float32Array;
    const n = g.getAttribute('normal').array as Float32Array;
    const t = g.getAttribute('uv').array as Float32Array;
    const idx = g.getIndex()!.array as Uint32Array;
    position.set(p, vo * 3);
    normal.set(n, vo * 3);
    uv.set(t, vo * 2);
    for (let i = 0; i < idx.length; i++) index[io + i] = idx[i] + vo;
    vo += p.length / 3;
    io += idx.length;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function mergeStaticMeshes(root: THREE.Object3D): { before: number; after: number } {
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();

  const byMaterial = new Map<THREE.Material, THREE.Mesh[]>();
  let before = 0;

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    before++;
    if ((mesh as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh) return;
    if ((mesh as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) return;
    if (Array.isArray(mesh.material)) return;
    if (mesh.morphTargetInfluences && mesh.morphTargetInfluences.length > 0) return;
    if (!mesh.geometry.getAttribute('position')) return;
    if (mesh.geometry.groups.length > 1) return;
    if (!Object.keys(mesh.geometry.attributes).every((name) => ALLOWED_ATTRIBUTES.has(name))) return;

    const list = byMaterial.get(mesh.material) ?? [];
    list.push(mesh);
    byMaterial.set(mesh.material, list);
  });

  let merged = 0;
  byMaterial.forEach((meshes, material) => {
    if (meshes.length < 2) return;

    const baked: THREE.BufferGeometry[] = [];
    const used: THREE.Mesh[] = [];
    for (const mesh of meshes) {
      const geometry = bakeGeometry(mesh, rootInverse);
      if (!geometry) continue;
      baked.push(geometry);
      used.push(mesh);
    }
    if (baked.length < 2) return;

    const geometry = mergeList(baked);
    if (!geometry) return;

    const combined = new THREE.Mesh(geometry, material);
    combined.name = `merged-${material.name || 'material'}`;
    root.add(combined);
    merged++;

    for (const mesh of used) {
      mesh.parent?.remove(mesh);
      mesh.geometry.dispose();
    }
  });

  // Buang simpul kosong yang tertinggal.
  const empties: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o !== root && o.children.length === 0 && !(o as THREE.Mesh).isMesh) empties.push(o);
  });
  empties.forEach((o) => o.parent?.remove(o));

  let after = 0;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) after++;
  });
  void merged;
  return { before, after };
}


/**
 * Memperkecil tekstur besar (mis. 2048 → 1024) agar memori GPU dan beban piksel turun.
 * Pada ukuran model di layar HP, selisihnya tidak terlihat.
 */
export function downscaleTextures(root: THREE.Object3D, maxSize: number): void {
  const done = new Set<THREE.Texture>();
  const keys = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'] as const;

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      for (const key of keys) {
        const texture = (material as unknown as Record<string, THREE.Texture | null | undefined>)[key];
        if (!texture || done.has(texture)) continue;
        done.add(texture);

        const image = texture.image as { width?: number; height?: number } | undefined;
        const width = image?.width ?? 0;
        const height = image?.height ?? 0;
        if (!image || Math.max(width, height) <= maxSize) continue;

        const ratio = maxSize / Math.max(width, height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * ratio));
        canvas.height = Math.max(1, Math.round(height * ratio));
        const context = canvas.getContext('2d');
        if (!context) continue;
        try {
          context.drawImage(image as CanvasImageSource, 0, 0, canvas.width, canvas.height);
        } catch {
          continue;
        }
        (image as { close?: () => void }).close?.();
        texture.image = canvas;
        texture.flipY = false;
        texture.needsUpdate = true;
      }
    }
  });
}
