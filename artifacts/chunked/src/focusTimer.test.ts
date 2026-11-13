import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceFocusTimer, type TimerState } from './focusTimer.ts';

const baseTimer = (overrides: Partial<TimerState> = {}): TimerState => ({
  mode: 'cycle',
  phase: 'focus',
  focusMinutes: 25,
  breakMinutes: 5,
  remainingMs: 0,
  running: true,
  endsAt: 1_000,
  cycles: 0,
  ...overrides,
});

test('automatic mode starts a break when a focus timer ends', () => {
  const next = advanceFocusTimer(baseTimer(), 1_000);

  assert.equal(next.phase, 'break');
  assert.equal(next.running, true);
  assert.equal(next.remainingMs, 5 * 60_000);
  assert.equal(next.endsAt, 301_000);
  assert.equal(next.cycles, 0);
});

test('automatic mode returns to focus and counts the completed cycle', () => {
  const next = advanceFocusTimer(baseTimer({
    phase: 'break',
    endsAt: 10_000,
    remainingMs: 0,
    cycles: 2,
  }), 10_000);

  assert.equal(next.phase, 'focus');
  assert.equal(next.running, true);
  assert.equal(next.remainingMs, 25 * 60_000);
  assert.equal(next.endsAt, 1_510_000);
  assert.equal(next.cycles, 3);
});

test('manual mode stops at zero without switching phases', () => {
  const next = advanceFocusTimer(baseTimer({ mode: 'manual' }), 1_000);

  assert.equal(next.phase, 'focus');
  assert.equal(next.running, false);
  assert.equal(next.remainingMs, 0);
  assert.equal(next.endsAt, null);
});

test('timer does not advance before its end time', () => {
  const current = baseTimer();

  assert.equal(advanceFocusTimer(current, 999), current);
});
