import type { TopicId } from '@/types/ar';

/**
 * Konfigurasi model 3D per topik.
 *
 * Pemetaan file GLB:
 * - motherboard_components_compressed.glb  → os-fundamentals (Motherboard & Komponen)
 * - pc_cpu_processor_optimized.glb         → scheduling       (CPU / Prosesor)
 * - random_access_memory_ram_ddr4_compressed.glb → memory     (RAM)
 */
export type GlbKey =
  | 'motherboard_components_compressed'
  | 'pc_cpu_processor_optimized'
  | 'random_access_memory_ram_ddr4_compressed';

export interface ModelConfig {
  /** File GLB yang digunakan oleh topik ini. */
  asset: GlbKey;

  /** Panjang sisi terpanjang model setelah normalisasi. */
  targetSize: number;

  /** Posisi sel pada scene dalam koordinat (x, z). */
  cell: [number, number];

  /** Regex nama node yang menjadi target titik hotspot. */
  anchorNode?: RegExp;

  /** Regex nama node yang dihapus sebelum model dinormalisasi. */
  removeNodes?: RegExp;

  /**
   * Putaran awal model pada sumbu X (radian), diterapkan sebelum normalisasi.
   * Seperti seluruh model Modul 4 yang "rebah" di atas meja, model yang aslinya
   * berdiri tegak (motherboard) direbahkan agar permukaannya terlihat dari atas.
   */
  rotateX?: number;
}

/**
 * Susunan mengikuti "meja" Modul 4: jarak antar sel sama (x = ±2,5 ; z = ±2,0)
 * dan ukuran sisi terpanjang 2,2–2,4. Modul 4 punya 4 model (2×2); Modul 6
 * punya 3, sehingga dua model di baris belakang dan RAID di tengah baris depan.
 */
export const MODEL_CONFIG: Record<TopicId, ModelConfig> = {
  'os-fundamentals': {
    asset: 'motherboard_components_compressed',
    targetSize: 2.4,
    cell: [-2.5, -2.0],
    rotateX: -Math.PI / 2,
  },

  scheduling: {
    asset: 'pc_cpu_processor_optimized',
    targetSize: 2.3,
    cell: [2.5, -2.0],
  },

  memory: {
    asset: 'random_access_memory_ram_ddr4_compressed',
    targetSize: 2.3,
    cell: [0, 2.0],
  },
};
