import { topics as content } from '@/data/topics';
import type { Topic } from '@/types/ar';

/**
 * Adaptor: materi Modul 6 (src/data) → bentuk yang dipakai mesin AR.
 * Teks materi TIDAK diubah di sini; sumbernya src/data/learningContent.ts.
 * Urutan array = urutan alur pembelajaran (01 → 03).
 */
export const TOPICS: Topic[] = content.map((t) => ({
  id: t.id,
  displayNumber: String(t.index + 1).padStart(2, '0'),
  short: t.shortLabel,
  name: t.title,
  category: t.assetLabel.toUpperCase(),
  color: t.accentColor,
  colorActive: t.accentColorActive,
  summary: t.overview,
  sourceVerified: t.sourceVerified,
  blocks: t.blocks,
}));
