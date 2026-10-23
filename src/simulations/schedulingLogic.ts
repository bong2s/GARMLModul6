export type SchedulingAlgo = 'fcfs' | 'sjf' | 'round-robin' | 'priority';

export interface SimProcess {
  id: string;
  name: string;
  arrival: number;
  burst: number;
  priority: number;
}

export interface GanttStep {
  processId: string;
  processName: string;
  start: number;
  end: number;
}

export interface SchedulingResult {
  steps: GanttStep[];
  totalTime: number;
  waitingTimes: Record<string, number>;
  turnaroundTimes: Record<string, number>;
  avgWaiting: number;
  avgTurnaround: number;
}

function makeResult(steps: GanttStep[], processes: SimProcess[]): SchedulingResult {
  const completion: Record<string, number> = {};
  for (const step of steps) {
    completion[step.processId] = step.end;
  }
  const waitingTimes: Record<string, number> = {};
  const turnaroundTimes: Record<string, number> = {};
  let totalWait = 0;
  let totalTAT = 0;
  for (const p of processes) {
    const tat = (completion[p.id] ?? 0) - p.arrival;
    const wt = tat - p.burst;
    turnaroundTimes[p.id] = tat;
    waitingTimes[p.id] = wt;
    totalWait += wt;
    totalTAT += tat;
  }
  return {
    steps,
    totalTime: steps.length > 0 ? steps[steps.length - 1].end : 0,
    waitingTimes,
    turnaroundTimes,
    avgWaiting: processes.length > 0 ? totalWait / processes.length : 0,
    avgTurnaround: processes.length > 0 ? totalTAT / processes.length : 0,
  };
}

export function runFcfs(processes: SimProcess[]): SchedulingResult {
  const sorted = [...processes].sort((a, b) => a.arrival - b.arrival);
  const steps: GanttStep[] = [];
  let t = 0;
  for (const p of sorted) {
    if (t < p.arrival) t = p.arrival;
    steps.push({ processId: p.id, processName: p.name, start: t, end: t + p.burst });
    t += p.burst;
  }
  return makeResult(steps, processes);
}

export function runSjf(processes: SimProcess[]): SchedulingResult {
  // Non-preemptive SJF
  const remaining = [...processes];
  const steps: GanttStep[] = [];
  let t = 0;
  while (remaining.length > 0) {
    const available = remaining.filter((p) => p.arrival <= t);
    if (available.length === 0) {
      t = Math.min(...remaining.map((p) => p.arrival));
      continue;
    }
    available.sort((a, b) => a.burst - b.burst);
    const next = available[0];
    steps.push({ processId: next.id, processName: next.name, start: t, end: t + next.burst });
    t += next.burst;
    remaining.splice(remaining.indexOf(next), 1);
  }
  return makeResult(steps, processes);
}

export function runRoundRobin(processes: SimProcess[], quantum: number): SchedulingResult {
  const remaining = processes.map((p) => ({ ...p, remaining: p.burst }));
  const steps: GanttStep[] = [];
  let t = 0;
  const queue: typeof remaining = [];
  const sortedByArrival = [...remaining].sort((a, b) => a.arrival - b.arrival);
  let idx = 0;

  // Add initial arrivals
  while (idx < sortedByArrival.length && sortedByArrival[idx].arrival <= t) {
    queue.push(sortedByArrival[idx]);
    idx++;
  }

  while (queue.length > 0 || idx < sortedByArrival.length) {
    if (queue.length === 0) {
      t = sortedByArrival[idx].arrival;
      while (idx < sortedByArrival.length && sortedByArrival[idx].arrival <= t) {
        queue.push(sortedByArrival[idx]);
        idx++;
      }
      continue;
    }
    const current = queue.shift()!;
    const runTime = Math.min(quantum, current.remaining);
    steps.push({ processId: current.id, processName: current.name, start: t, end: t + runTime });
    t += runTime;
    current.remaining -= runTime;

    // Add newly arrived during this quantum
    while (idx < sortedByArrival.length && sortedByArrival[idx].arrival <= t) {
      queue.push(sortedByArrival[idx]);
      idx++;
    }
    if (current.remaining > 0) {
      queue.push(current);
    }
  }
  return makeResult(steps, processes);
}

export function runPriority(processes: SimProcess[]): SchedulingResult {
  // Non-preemptive, lower number = higher priority
  const remaining = [...processes];
  const steps: GanttStep[] = [];
  let t = 0;
  while (remaining.length > 0) {
    const available = remaining.filter((p) => p.arrival <= t);
    if (available.length === 0) {
      t = Math.min(...remaining.map((p) => p.arrival));
      continue;
    }
    available.sort((a, b) => a.priority - b.priority);
    const next = available[0];
    steps.push({ processId: next.id, processName: next.name, start: t, end: t + next.burst });
    t += next.burst;
    remaining.splice(remaining.indexOf(next), 1);
  }
  return makeResult(steps, processes);
}

export function runScheduling(algo: SchedulingAlgo, processes: SimProcess[], quantum: number): SchedulingResult {
  switch (algo) {
    case 'fcfs': return runFcfs(processes);
    case 'sjf': return runSjf(processes);
    case 'round-robin': return runRoundRobin(processes, quantum);
    case 'priority': return runPriority(processes);
  }
}

export const sampleProcesses: SimProcess[] = [
  { id: 'P1', name: 'P1', arrival: 0, burst: 5, priority: 3 },
  { id: 'P2', name: 'P2', arrival: 1, burst: 3, priority: 1 },
  { id: 'P3', name: 'P3', arrival: 2, burst: 8, priority: 4 },
  { id: 'P4', name: 'P4', arrival: 3, burst: 6, priority: 2 },
];

export const algoLabels: Record<SchedulingAlgo, string> = {
  'fcfs': 'FCFS',
  'sjf': 'SJF',
  'round-robin': 'Round Robin',
  'priority': 'Priority',
};
