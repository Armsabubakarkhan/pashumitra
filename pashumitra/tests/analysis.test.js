import test from 'node:test';
import assert from 'node:assert/strict';
import { MotionAnalyzer, audioFeatures, computeTHI } from '../public/js/analysis.js';
import { classifyAudio, analyzeMotion, normalizeAudio, normalizeMotion, computeTHI as serverTHI } from '../src/engine.js';

const SR = 16000;
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const noise = (amp) => (rnd() * 2 - 1) * amp;

function signal(seconds, fn) {
  const out = new Float32Array(Math.floor(seconds * SR));
  for (let i = 0; i < out.length; i++) out[i] = fn(i / SR);
  return out;
}
const classify = (samples) => classifyAudio(normalizeAudio(audioFeatures(samples, SR)));

test('silence is reported as unusable', () => {
  const r = classify(signal(8, () => noise(0.0006)));
  assert.equal(r.cls, 'silence');
  assert.equal(r.usable, false);
});

test('short noisy bursts classify as cough', () => {
  const s = signal(10, (t) => { const k = [1, 3, 5, 7].some((b) => t >= b && t < b + 0.25); return noise(k ? 0.35 : 0.003); });
  const f = audioFeatures(s, SR);
  assert.equal(f.burstCount, 4);
  assert.ok(f.maxBurstSec < 0.5);
  assert.equal(classify(s).cls, 'cough');
});

test('fast rhythmic bursts classify as panting', () => {
  const s = signal(10, (t) => noise((t % 0.5) < 0.15 ? 0.25 : 0.004));
  const f = audioFeatures(s, SR);
  assert.ok(f.periodicity > 0.45, 'periodicity ' + f.periodicity);
  assert.ok(Math.abs(f.periodHz - 2) < 0.3, 'periodHz ' + f.periodHz);
  assert.equal(classify(s).cls, 'panting');
});

test('long loud harmonic calls classify as distress', () => {
  const tone = (t) => [1, 2, 3, 4, 5].reduce((a, k) => a + Math.sin(2 * Math.PI * 450 * k * t) / k, 0) * 0.18;
  const s = signal(10, (t) => ((t >= 1 && t < 2.5) || (t >= 6 && t < 7.5) ? tone(t) : noise(0.003)));
  assert.equal(classify(s).cls, 'distress');
});

test('long quiet low calls classify as hunger', () => {
  const s = signal(10, (t) => ((t >= 1 && t < 2.2) || (t >= 6 && t < 7.2) ? 0.1 * Math.sin(2 * Math.PI * 200 * t) : noise(0.002)));
  assert.equal(classify(s).cls, 'hunger');
});

test('too short audio is rejected', () => {
  assert.equal(audioFeatures(new Float32Array(1000), SR), null);
});

function frame(w, h, sq, shift, bright = 0) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const inSq = x >= sq + shift && x < sq + shift + 10 && y >= 20 && y < 34;
    const v = (inSq ? 230 : 40) + bright;
    a[i] = a[i + 1] = a[i + 2] = Math.max(0, Math.min(255, v)); a[i + 3] = 255;
  }
  return a;
}

function runClip(seconds, moveAt, brightAt) {
  const m = new MotionAnalyzer(96, 54);
  let pos = 5;
  const n = seconds * 8;
  for (let i = 0; i < n; i++) {
    if (moveAt(i)) pos = (pos + 6) % 70;
    m.push(frame(96, 54, pos, 0, brightAt ? brightAt(i) : 0), i / 8);
  }
  return m.finish();
}

test('steady movement is regular, jerky movement is uneven', () => {
  const steady = runClip(12, () => true);
  const jerky = runClip(12, (i) => i % 8 < 2 || (i * 7) % 5 === 0);
  const a = analyzeMotion(normalizeMotion({ seconds: steady.seconds, shaky: steady.shaky }));
  const b = analyzeMotion(normalizeMotion({ seconds: jerky.seconds, shaky: jerky.shaky }));
  assert.ok(a.usable && b.usable);
  assert.ok(a.ratio < 0.3, 'steady ratio ' + a.ratio);
  assert.ok(b.ratio > 0.5, 'jerky ratio ' + b.ratio);
  assert.ok(steady.heat.some((v) => v > 0.5), 'heatmap has hot cells');
});

test('a still scene has no active seconds and camera shake is discounted', () => {
  const still = runClip(10, () => false);
  const a = analyzeMotion(normalizeMotion({ seconds: still.seconds, shaky: still.shaky }));
  assert.equal(a.active, 0);
  assert.equal(a.still, true);
  const shake = runClip(10, () => false, (i) => (i % 2 ? 120 : -30));
  assert.ok(shake.shaky >= 8, 'shaky seconds ' + shake.shaky);
  assert.equal(shake.seconds.length, 0);
});

test('client and server THI agree', () => {
  for (const [t, h] of [[20, 50], [30, 84], [35, 84], [40, 30]]) assert.equal(computeTHI(t, h), serverTHI(t, h));
});
