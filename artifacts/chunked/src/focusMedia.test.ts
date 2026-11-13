import test from 'node:test';
import assert from 'node:assert/strict';
import { isVideoUrl, validateDirectAudioUrl, validateDirectVisualUrl } from './focusMedia.ts';

test('accepts direct HTTPS visual assets, including query strings', () => {
  assert.equal(validateDirectVisualUrl('https://cdn.example.test/scene.gif?v=2'), 'https://cdn.example.test/scene.gif?v=2');
  assert.equal(validateDirectVisualUrl('https://cdn.example.test/loop.webm'), 'https://cdn.example.test/loop.webm');
  assert.equal(isVideoUrl('https://cdn.example.test/loop.webm'), true);
});

test('rejects non-HTTPS, credentialed, and non-file visual links', () => {
  assert.equal(validateDirectVisualUrl('http://cdn.example.test/scene.gif'), null);
  assert.equal(validateDirectVisualUrl('https://user:pass@cdn.example.test/scene.gif'), null);
  assert.equal(validateDirectVisualUrl('https://youtube.com/watch?v=123'), null);
  assert.equal(validateDirectVisualUrl('javascript:alert(1)'), null);
});

test('only accepts direct HTTPS audio file links', () => {
  assert.equal(validateDirectAudioUrl('https://cdn.example.test/lofi.mp3'), 'https://cdn.example.test/lofi.mp3');
  assert.equal(validateDirectAudioUrl('https://example.test/player'), null);
  assert.equal(validateDirectAudioUrl('http://cdn.example.test/lofi.mp3'), null);
});
