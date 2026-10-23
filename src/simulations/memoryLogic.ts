export type ReplacementAlgo = 'fifo' | 'lru' | 'optimal';

export interface ReplacementResult {
  steps: FrameStep[];
  totalFaults: number;
  totalHits: number;
}

export interface FrameStep {
  reference: number;
  frames: (number | null)[];
  isFault: boolean;
  replacedPage?: number;
}

export function runFifo(references: number[], frameCount: number): ReplacementResult {
  const frames: (number | null)[] = new Array(frameCount).fill(null);
  const queue: number[] = [];
  const steps: FrameStep[] = [];
  let faults = 0;
  let hits = 0;

  for (const ref of references) {
    if (frames.includes(ref)) {
      hits++;
      steps.push({ reference: ref, frames: [...frames], isFault: false });
    } else {
      faults++;
      if (queue.length < frameCount) {
        const slot = queue.length;
        frames[slot] = ref;
        queue.push(ref);
        steps.push({ reference: ref, frames: [...frames], isFault: true, replacedPage: undefined });
      } else {
        const oldest = queue.shift()!;
        const slot = frames.indexOf(oldest);
        const replaced = frames[slot];
        frames[slot] = ref;
        queue.push(ref);
        steps.push({ reference: ref, frames: [...frames], isFault: true, replacedPage: replaced ?? undefined });
      }
    }
  }
  return { steps, totalFaults: faults, totalHits: hits };
}

export function runLru(references: number[], frameCount: number): ReplacementResult {
  const frames: (number | null)[] = new Array(frameCount).fill(null);
  const lastUsed: Map<number, number> = new Map();
  const steps: FrameStep[] = [];
  let faults = 0;
  let hits = 0;

  for (let i = 0; i < references.length; i++) {
    const ref = references[i];
    if (frames.includes(ref)) {
      hits++;
      lastUsed.set(ref, i);
      steps.push({ reference: ref, frames: [...frames], isFault: false });
    } else {
      faults++;
      const emptySlot = frames.findIndex((f) => f === null);
      if (emptySlot !== -1) {
        frames[emptySlot] = ref;
        lastUsed.set(ref, i);
        steps.push({ reference: ref, frames: [...frames], isFault: true });
      } else {
        // Find LRU page
        let lruPage = frames[0]!;
        let lruTime = lastUsed.get(lruPage) ?? -1;
        for (const f of frames) {
          if (f === null) continue;
          const t = lastUsed.get(f) ?? -1;
          if (t < lruTime) {
            lruTime = t;
            lruPage = f;
          }
        }
        const slot = frames.indexOf(lruPage);
        const replaced = frames[slot];
        frames[slot] = ref;
        lastUsed.set(ref, i);
        steps.push({ reference: ref, frames: [...frames], isFault: true, replacedPage: replaced ?? undefined });
      }
    }
  }
  return { steps, totalFaults: faults, totalHits: hits };
}

export function runOptimal(references: number[], frameCount: number): ReplacementResult {
  const frames: (number | null)[] = new Array(frameCount).fill(null);
  const steps: FrameStep[] = [];
  let faults = 0;
  let hits = 0;

  for (let i = 0; i < references.length; i++) {
    const ref = references[i];
    if (frames.includes(ref)) {
      hits++;
      steps.push({ reference: ref, frames: [...frames], isFault: false });
    } else {
      faults++;
      const emptySlot = frames.findIndex((f) => f === null);
      if (emptySlot !== -1) {
        frames[emptySlot] = ref;
        steps.push({ reference: ref, frames: [...frames], isFault: true });
      } else {
        // Find page with furthest next use (or never used again)
        let replaceSlot = 0;
        let furthest = -1;
        for (let s = 0; s < frames.length; s++) {
          const page = frames[s]!;
          let nextUse = -1;
          for (let j = i + 1; j < references.length; j++) {
            if (references[j] === page) {
              nextUse = j;
              break;
            }
          }
          if (nextUse === -1) {
            replaceSlot = s;
            break;
          }
          if (nextUse > furthest) {
            furthest = nextUse;
            replaceSlot = s;
          }
        }
        const replaced = frames[replaceSlot];
        frames[replaceSlot] = ref;
        steps.push({ reference: ref, frames: [...frames], isFault: true, replacedPage: replaced ?? undefined });
      }
    }
  }
  return { steps, totalFaults: faults, totalHits: hits };
}

export function runReplacement(algo: ReplacementAlgo, references: number[], frameCount: number): ReplacementResult {
  switch (algo) {
    case 'fifo': return runFifo(references, frameCount);
    case 'lru': return runLru(references, frameCount);
    case 'optimal': return runOptimal(references, frameCount);
  }
}

export const algoLabels: Record<ReplacementAlgo, string> = {
  fifo: 'FIFO',
  lru: 'LRU',
  optimal: 'Optimal',
};

export const sampleReferences = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2];
export const sampleFrameCount = 3;
