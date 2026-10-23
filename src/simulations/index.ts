import { mountMemorySim } from './MemorySim';
import { mountSchedulingSim } from './SchedulingSim';

export type SimType = 'scheduling' | 'memory';

/** Memasang simulasi ke dalam elemen host; mengembalikan fungsi pembersih. */
export function mountSimulation(host: HTMLElement, type: SimType, accent: string): () => void {
  return type === 'scheduling' ? mountSchedulingSim(host, accent) : mountMemorySim(host, accent);
}
