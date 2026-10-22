// Pure signal analysis used by the scan page. No DOM access, so it can also run in Node tests.
// Movement and sound are screening signals computed on the device. Raw video and audio never leave the phone.

const SHAKE_LIMIT = 0.5;      // a frame where more than half the pixels change is camera shake or a cut
const PIXEL_THRESHOLD = 18;   // grey level change that counts as movement

export class MotionAnalyzer {
  constructor(w = 96, h = 54) {
    this.w = w; this.h = h; this.n = w * h;
    this.prev = null; this.last = null;
    this.heat = new Float32Array(this.n);
    this.frames = [];
    this.mask = new Uint8Array(this.n);
  }

  // rgba: Uint8ClampedArray of length w*h*4, t: seconds since start
  push(rgba, t) {
    const n = this.n;
    const g = new Uint8Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
    this.last = g;
    if (!this.prev) { this.prev = g; return null; }
    let changed = 0;
    for (let i = 0; i < n; i++) {
      const moved = Math.abs(g[i] - this.prev[i]) > PIXEL_THRESHOLD ? 1 : 0;
      this.mask[i] = moved;
      changed += moved;
    }
    this.prev = g;
    const e = changed / n;
    const shaky = e > SHAKE_LIMIT;
    if (!shaky) for (let i = 0; i < n; i++) this.heat[i] += this.mask[i];
    this.frames.push({ t, e, shaky });
    return { e, shaky };
  }

  finish() {
    const bySecond = new Map();
    let shakySeconds = 0;
    for (const f of this.frames) {
      const s = Math.floor(f.t);
      if (!bySecond.has(s)) bySecond.set(s, { ok: [], shaky: 0 });
      const slot = bySecond.get(s);
      if (f.shaky) slot.shaky += 1; else slot.ok.push(f.e);
    }
    const seconds = [];
    for (const key of [...bySecond.keys()].sort((a, b) => a - b)) {
      const slot = bySecond.get(key);
      if (slot.ok.length < 3) { if (slot.shaky >= 3) shakySeconds += 1; continue; }
      const mean = slot.ok.reduce((a, b) => a + b, 0) / slot.ok.length;
      const variance = slot.ok.reduce((a, b) => a + (b - mean) * (b - mean), 0) / slot.ok.length;
      const cv = mean > 1e-9 ? Math.sqrt(variance) / mean : 0;
      seconds.push([round(Math.min(1, mean), 4), round(Math.min(50, cv), 3)]);
    }
    let max = 0;
    for (let i = 0; i < this.n; i++) if (this.heat[i] > max) max = this.heat[i];
    const heat = new Float32Array(this.n);
    if (max > 0) for (let i = 0; i < this.n; i++) heat[i] = Math.sqrt(this.heat[i] / max);
    return {
      seconds: seconds.slice(0, 60),
      shaky: Math.min(60, shakySeconds),
      frames: this.frames.length,
      heat, w: this.w, h: this.h, lastFrame: this.last
    };
  }
}

const round = (v, d) => { const p = 10 ** d; return Math.round(v * p) / p; };

// ---------- audio ----------
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

const FRAME = 1024, HOP = 512, FFT = 2048;

// samples: Float32Array mono, sr: sample rate. Returns the feature object the server classifies, or null if too short.
export function audioFeatures(samples, sr) {
  const total = Math.min(samples.length, Math.floor(sr * 15));
  if (total < sr * 0.5) return null;
  const x = samples.subarray(0, total);
  const nFrames = Math.floor((total - FRAME) / HOP) + 1;
  const env = new Float32Array(nFrames);
  let sumSq = 0;
  for (let i = 0; i < total; i++) sumSq += x[i] * x[i];
  for (let f = 0; f < nFrames; f++) {
    let s = 0;
    const o = f * HOP;
    for (let i = 0; i < FRAME; i++) s += x[o + i] * x[o + i];
    env[f] = Math.sqrt(s / FRAME);
  }
  const smooth = new Float32Array(nFrames);
  for (let f = 0; f < nFrames; f++) {
    const a = env[Math.max(0, f - 1)], b = env[f], c = env[Math.min(nFrames - 1, f + 1)];
    smooth[f] = (a + b + c) / 3;
  }
  let peak = 0;
  for (let f = 0; f < nFrames; f++) if (smooth[f] > peak) peak = smooth[f];
  const sorted = Array.from(smooth).sort((a, b) => a - b);
  const noise = sorted[Math.floor(sorted.length / 2)];
  const thr = Math.max(noise * 3, peak * 0.3, 0.01);

  // bursts: runs of frames above the threshold, merging gaps of up to 3 frames
  const bursts = [];
  let start = -1, gap = 0, last = -1;
  for (let f = 0; f < nFrames; f++) {
    if (smooth[f] > thr) { if (start < 0) start = f; gap = 0; last = f; }
    else if (start >= 0) {
      gap += 1;
      if (gap > 3) { bursts.push([start, last]); start = -1; gap = 0; }
    }
  }
  if (start >= 0) bursts.push([start, last]);
  const secPerFrame = HOP / sr;
  const lengths = bursts.map(([a, b]) => (b - a + 1) * secPerFrame).filter((l) => l >= 2 * secPerFrame);
  const duration = total / sr;
  const burstCount = lengths.length;
  const meanBurstSec = burstCount ? lengths.reduce((a, b) => a + b, 0) / burstCount : 0;
  const maxBurstSec = burstCount ? Math.max(...lengths) : 0;

  // spectrum of the loudest frames
  const idx = Array.from(smooth.keys()).sort((a, b) => smooth[b] - smooth[a]).slice(0, 16);
  const mag = new Float64Array(FFT / 2);
  const re = new Float64Array(FFT), im = new Float64Array(FFT);
  for (const f of idx) {
    re.fill(0); im.fill(0);
    const o = f * HOP;
    for (let i = 0; i < FRAME; i++) re[i] = x[o + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)));
    fft(re, im);
    for (let k = 0; k < FFT / 2; k++) mag[k] += Math.hypot(re[k], im[k]);
  }
  const binHz = sr / FFT;
  let num = 0, den = 0, low = 0, powTotal = 0, peakBin = 0, peakMag = 0;
  const maxPeakBin = Math.min(FFT / 2 - 1, Math.floor(4000 / binHz));
  for (let k = 1; k < FFT / 2; k++) {
    const hz = k * binHz;
    num += hz * mag[k]; den += mag[k];
    const p = mag[k] * mag[k];
    powTotal += p;
    if (hz < 500) low += p;
    if (hz >= 50 && k <= maxPeakBin && mag[k] > peakMag) { peakMag = mag[k]; peakBin = k; }
  }
  const centroid = den > 0 ? num / den : 0;

  // periodicity of the loudness envelope (breathing or panting rhythm)
  const framesPerSec = sr / HOP;
  const minLag = Math.max(1, Math.ceil(0.2 * framesPerSec));
  const maxLag = Math.floor(1.0 * framesPerSec);
  let periodicity = 0, periodHz = 0;
  if (nFrames > 3 * maxLag) {
    let mean = 0;
    for (let f = 0; f < nFrames; f++) mean += smooth[f];
    mean /= nFrames;
    const e0 = new Float32Array(nFrames);
    let r0 = 0;
    for (let f = 0; f < nFrames; f++) { e0[f] = smooth[f] - mean; r0 += e0[f] * e0[f]; }
    if (r0 > 1e-12) {
      let best = 0, bestLag = 0;
      for (let lag = minLag; lag <= maxLag; lag++) {
        let r = 0;
        for (let f = 0; f + lag < nFrames; f++) r += e0[f] * e0[f + lag];
        r /= r0;
        if (r > best) { best = r; bestLag = lag; }
      }
      periodicity = Math.max(0, Math.min(1, best));
      periodHz = bestLag ? framesPerSec / bestLag : 0;
    }
  }

  return {
    duration: round(duration, 2),
    rms: round(Math.sqrt(sumSq / total), 5),
    peakRms: round(peak, 5),
    centroid: round(centroid, 1),
    peakHz: round(peakBin * binHz, 1),
    burstCount,
    burstRate: round(burstCount / duration, 3),
    meanBurstSec: round(meanBurstSec, 3),
    maxBurstSec: round(maxBurstSec, 3),
    periodicity: round(periodicity, 3),
    periodHz: round(periodHz, 3),
    lowRatio: round(powTotal > 0 ? low / powTotal : 0, 3)
  };
}

// THI, same formula as the server (the server recomputes it and is authoritative)
export function computeTHI(tempC, rh) {
  return Math.round(((1.8 * tempC + 32) - (0.55 - 0.0055 * rh) * (1.8 * tempC - 26)) * 10) / 10;
}
export function thiBandId(thi) {
  return thi < 72 ? 'comfortable' : thi < 79 ? 'mild' : thi < 89 ? 'moderate' : thi < 99 ? 'severe' : 'danger';
}
