export type TopicId = 'os-fundamentals' | 'scheduling' | 'memory';

export type TopicFocus = TopicId | 'all';

/**
 * Blok isi panel informasi (bentuk data sama dengan materi Modul 6).
 *   p      paragraf, judul opsional
 *   terms  daftar istilah → penjelasan
 *   steps  daftar bernomor
 *   list   daftar poin
 *   note   catatan kaitan dengan model 3D
 *   cards  kartu ringkas (mis. algoritma)
 *   sim    simulasi interaktif
 */
export type InfoBlockType = 'p' | 'terms' | 'steps' | 'list' | 'note' | 'cards' | 'sim';

export interface InfoBlock {
  type: InfoBlockType;
  title?: string;
  text?: string;
  items?: string[];
  terms?: { term: string; desc: string }[];
  steps?: string[];
  cards?: { title: string; desc: string }[];
  simType?: 'scheduling' | 'memory';
}

export interface Topic {
  id: TopicId;
  /** Nomor urut pembelajaran: 01, 02, 03 */
  displayNumber: string;
  /** Label pendek (pill filter & label hotspot) */
  short: string;
  /** Nama lengkap topik */
  name: string;
  /** Teks kecil di atas judul panel */
  category: string;
  /** Warna aksen topik */
  color: string;
  /** Warna latar pill saat aktif */
  colorActive: string;
  /** Ringkasan satu kalimat */
  summary: string;
  /** false = materi belum diverifikasi terhadap dokumen sumber */
  sourceVerified: boolean;
  /** Isi panel informasi */
  blocks: InfoBlock[];
}
