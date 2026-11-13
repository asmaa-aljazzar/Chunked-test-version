export type Phase = 'focus' | 'break';
export type TimerMode = 'manual' | 'cycle';

export type TimerState = {
  mode: TimerMode;
  phase: Phase;
  focusMinutes: number;
  breakMinutes: number;
  remainingMs: number;
  running: boolean;
  endsAt: number | null;
  cycles: number;
};

export function advanceFocusTimer(current: TimerState, now: number): TimerState {
  if (!current.running || current.endsAt === null || now < current.endsAt) return current;
  if (current.mode === 'cycle') {
    const nextPhase: Phase = current.phase === 'focus' ? 'break' : 'focus';
    const nextDuration = (nextPhase === 'focus' ? current.focusMinutes : current.breakMinutes) * 60_000;
    return {
      ...current,
      phase: nextPhase,
      remainingMs: nextDuration,
      endsAt: now + nextDuration,
      cycles: current.phase === 'break' ? current.cycles + 1 : current.cycles,
    };
  }
  return { ...current, running: false, remainingMs: 0, endsAt: null };
}
