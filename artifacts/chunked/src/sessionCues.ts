export type FocusSessionCueSnapshot = {
  active: boolean;
  paused: boolean;
  phase: 'focus' | 'break';
  status?: string;
  sessionId: number | null;
  remainingSeconds: number;
};

export function getFocusSessionCueEvents(
  previous: FocusSessionCueSnapshot,
  current: FocusSessionCueSnapshot,
) {
  const focusEnded = previous.phase === 'focus'
    && (previous.active || previous.paused)
    && (current.phase === 'break'
      || (!current.active && !current.paused && (current.remainingSeconds <= 0 || current.status === 'boundary')));
  const focusStarted = current.phase === 'focus'
    && current.active && !current.paused
    && ((!previous.active && !previous.paused) || previous.phase === 'break');
  const focusSessionReplaced = previous.phase === 'focus'
    && current.phase === 'focus'
    && previous.active && current.active
    && previous.sessionId !== null
    && current.sessionId !== previous.sessionId;

  return {
    start: focusStarted || focusSessionReplaced,
    end: focusEnded || focusSessionReplaced,
  };
}
