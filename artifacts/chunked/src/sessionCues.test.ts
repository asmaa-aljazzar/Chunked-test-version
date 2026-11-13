import assert from 'node:assert/strict';
import test from 'node:test';
import { getFocusSessionCueEvents, type FocusSessionCueSnapshot } from './sessionCues.ts';

const idleFocus: FocusSessionCueSnapshot = {
  active: false,
  paused: false,
  phase: 'focus',
  status: 'ready',
  sessionId: null,
  remainingSeconds: 1500,
};

test('signals a newly started focus timer', () => {
  assert.deepEqual(getFocusSessionCueEvents(idleFocus, {
    ...idleFocus,
    active: true,
    status: 'running',
  }), { start: true, end: false });
});

test('does not signal pause or resume as a new session', () => {
  const active = { ...idleFocus, active: true, status: 'running' };
  const paused = { ...active, active: false, paused: true, status: 'paused' };

  assert.deepEqual(getFocusSessionCueEvents(active, paused), { start: false, end: false });
  assert.deepEqual(getFocusSessionCueEvents(paused, active), { start: false, end: false });
});

test('signals focus completion but not reset', () => {
  const active = { ...idleFocus, active: true, status: 'running' };

  assert.deepEqual(getFocusSessionCueEvents(active, {
    ...active,
    active: false,
    status: 'completed',
    remainingSeconds: 0,
  }), { start: false, end: true });
  assert.deepEqual(getFocusSessionCueEvents(active, idleFocus), { start: false, end: false });
});

test('signals focus ending and starting across automatic break transitions', () => {
  const activeFocus = { ...idleFocus, active: true, status: 'running' };
  const activeBreak = { ...activeFocus, phase: 'break' as const };
  const nextFocus = { ...activeBreak, phase: 'focus' as const, sessionId: 2 };

  assert.deepEqual(getFocusSessionCueEvents(activeFocus, activeBreak), { start: false, end: true });
  assert.deepEqual(getFocusSessionCueEvents(activeBreak, nextFocus), { start: true, end: false });
});

test('signals both cues when a new focus session replaces the prior one', () => {
  const previous = { ...idleFocus, active: true, status: 'running', sessionId: 1 };
  const current = { ...previous, sessionId: 2 };

  assert.deepEqual(getFocusSessionCueEvents(previous, current), { start: true, end: true });
});
