// Fusion engine: combines reported signs, movement analysis, sound analysis and farm conditions
// into one explainable risk result. Pure functions, no I/O, so it can be unit tested.
//
// Honest scope: this is a screening heuristic with explicit rules. It is not a trained
// diagnostic model and every result carries a "consult a vet" action.
import { HttpError, cleanText } from './util.js';

export const SPECIES = ['cattle', 'buffalo', 'sheep', 'goat', 'poultry'];

// weight = contribution to the sign score before capping
export const SIGN_DEFS = {
  limping: { w: 14 },
  drooling: { w: 14 },
  mouth_blisters: { w: 16 },
  fever: { w: 14 },
  nodules: { w: 18 },
  discharge: { w: 10 },
  laboured_breathing: { w: 22 },
  cough_sign: { w: 8 },
  reduced_appetite: { w: 8 },
  isolation: { w: 8 },
  abnormal_posture: { w: 8 },
  swollen_udder: { w: 16 },
  reduced_milk: { w: 10 },
  diarrhoea: { w: 10 },
  heat_panting: { w: 10 },
  nervous_signs: { w: 16 },
  bloat: { w: 26 },
  poisoning: { w: 30 },
  down: { w: 30 }
};
export const SIGN_IDS = Object.keys(SIGN_DEFS);

export const LABELS = ['healthy', 'general_illness', 'fmd', 'lsd', 'mastitis', 'respiratory', 'heat_stress', 'newcastle', 'bloat', 'poisoning', 'down'];

export const ACTION_IDS = ['isolate', 'separate_water', 'wash_hands', 'insect_control', 'milk_hygiene', 'clean_shelter',
  'shade_water', 'ventilate', 'offer_water', 'keep_calm', 'remove_source', 'keep_comfortable', 'notify_authority',
  'monitor_recheck', 'do_not_medicate', 'call_vet_24h', 'call_vet_now'];

// ---------- farm conditions ----------
export function computeTHI(tempC, rh) {
  const thi = (1.8 * tempC + 32) - (0.55 - 0.0055 * rh) * (1.8 * tempC - 26);
  return Math.round(thi * 10) / 10;
}

export function thiBand(thi) {
  if (thi < 72) return { id: 'comfortable', level: 0 };
  if (thi < 79) return { id: 'mild', level: 1 };
  if (thi < 89) return { id: 'moderate', level: 2 };
  if (thi < 99) return { id: 'severe', level: 3 };
  return { id: 'danger', level: 4 };
}

export function ammoniaBand(ppm) {
  if (ppm <= 10) return { id: 'ok', level: 0 };
  if (ppm <= 25) return { id: 'caution', level: 1 };
  if (ppm <= 50) return { id: 'high', level: 2 };
  return { id: 'severe', level: 3 };
}

// ---------- input normalisation (never trust the client) ----------
function numIn(obj, key, min, max, { required = false, integer = false, label = key } = {}) {
  const v = obj[key];
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError(400, `${label} is required`, key);
    return null;
  }
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) throw new HttpError(400, `${label} must be a number`, key);
  if (integer && !Number.isInteger(n)) throw new HttpError(400, `${label} must be a whole number`, key);
  if (n < min || n > max) throw new HttpError(400, `${label} must be between ${min} and ${max}`, key);
  return n;
}

export function normalizeSigns(list) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list) || list.length > 40) throw new HttpError(400, 'signs must be a list', 'signs');
  const out = new Set();
  for (const s of list) {
    if (typeof s !== 'string' || !(s in SIGN_DEFS)) throw new HttpError(400, 'Unknown sign in list', 'signs');
    out.add(s);
  }
  return [...out];
}

export function normalizeConditions(c) {
  if (c === undefined || c === null) return null;
  if (typeof c !== 'object' || Array.isArray(c)) throw new HttpError(400, 'conditions must be an object', 'conditions');
  const temperature_c = numIn(c, 'temperature_c', -10, 60, { required: true, label: 'Air temperature' });
  const humidity = numIn(c, 'humidity', 0, 100, { required: true, label: 'Humidity' });
  const ammonia_ppm = numIn(c, 'ammonia_ppm', 0, 500, { label: 'Ammonia' });
  return { temperature_c, humidity, ammonia_ppm, thi: computeTHI(temperature_c, humidity) };
}

export function normalizeMotion(m) {
  if (m === undefined || m === null) return null;
  if (typeof m !== 'object' || Array.isArray(m)) throw new HttpError(400, 'motion must be an object', 'motion');
  if (!Array.isArray(m.seconds) || m.seconds.length > 60) throw new HttpError(400, 'motion.seconds must be a list of up to 60 entries', 'motion');
  const seconds = m.seconds.map((row) => {
    if (!Array.isArray(row) || row.length !== 2) throw new HttpError(400, 'Each motion entry must be [energy, variation]', 'motion');
    const e = Number(row[0]); const cv = Number(row[1]);
    if (!Number.isFinite(e) || !Number.isFinite(cv) || e < 0 || e > 1 || cv < 0 || cv > 50) throw new HttpError(400, 'Motion values are out of range', 'motion');
    return [Math.round(e * 10000) / 10000, Math.round(cv * 1000) / 1000];
  });
  const shaky = numIn(m, 'shaky', 0, 60, { integer: true }) ?? 0;
  return { seconds, shaky };
}

export function normalizeAudio(a) {
  if (a === undefined || a === null) return null;
  if (typeof a !== 'object' || Array.isArray(a)) throw new HttpError(400, 'audio must be an object', 'audio');
  return {
    duration: numIn(a, 'duration', 0.5, 30, { required: true, label: 'duration' }),
    rms: numIn(a, 'rms', 0, 1, { required: true, label: 'rms' }),
    peakRms: numIn(a, 'peakRms', 0, 1, { required: true, label: 'peakRms' }),
    centroid: numIn(a, 'centroid', 0, 24000, { required: true, label: 'centroid' }),
    peakHz: numIn(a, 'peakHz', 0, 24000, { required: true, label: 'peakHz' }),
    burstCount: numIn(a, 'burstCount', 0, 500, { required: true, integer: true, label: 'burstCount' }),
    burstRate: numIn(a, 'burstRate', 0, 50, { required: true, label: 'burstRate' }),
    meanBurstSec: numIn(a, 'meanBurstSec', 0, 30, { required: true, label: 'meanBurstSec' }),
    maxBurstSec: numIn(a, 'maxBurstSec', 0, 30, { required: true, label: 'maxBurstSec' }),
    periodicity: numIn(a, 'periodicity', -1, 1, { required: true, label: 'periodicity' }),
    periodHz: numIn(a, 'periodHz', 0, 100, { required: true, label: 'periodHz' }),
    lowRatio: numIn(a, 'lowRatio', 0, 1, { required: true, label: 'lowRatio' })
  };
}

// ---------- movement ----------
const ACTIVE_MIN_ENERGY = 0.004;
const UNEVEN_VARIATION = 0.75;

export function analyzeMotion(motion) {
  const seconds = motion.seconds;
  const total = seconds.length;
  const active = seconds.filter(([e]) => e >= ACTIVE_MIN_ENERGY);
  const uneven = active.filter(([, cv]) => cv >= UNEVEN_VARIATION);
  const meanEnergy = total ? seconds.reduce((s, [e]) => s + e, 0) / total : 0;
  return {
    usable: total >= 5,
    total,
    active: active.length,
    uneven: uneven.length,
    ratio: active.length ? uneven.length / active.length : 0,
    still: total >= 5 && active.length / total < 0.15,
    meanEnergy: Math.round(meanEnergy * 10000) / 10000,
    shaky: motion.shaky
  };
}

// ---------- sound ----------
// Heuristic acoustic pattern classes. It classifies sound shapes and does not translate animals.
export function classifyAudio(f) {
  if (f.rms < 0.004 && f.peakRms < 0.02) return { cls: 'silence', confidence: 0, usable: false };
  if (f.periodicity >= 0.45 && f.periodHz >= 1.0 && f.periodHz <= 4.0 && f.burstRate >= 1.3) {
    return { cls: 'panting', confidence: Math.min(85, Math.round(50 + f.periodicity * 35)), usable: true };
  }
  if (f.burstCount >= 2 && f.meanBurstSec <= 0.7 && f.maxBurstSec <= 1.0 && f.burstRate < 1.3 && f.centroid >= 700) {
    const c = 45 + Math.min(f.burstCount, 6) * 5 + (f.centroid > 1200 ? 8 : 0);
    return { cls: 'cough', confidence: Math.min(82, Math.round(c)), usable: true };
  }
  if (f.maxBurstSec >= 0.8 && f.peakRms >= 0.15 && (f.centroid >= 600 || f.peakHz >= 350)) {
    return { cls: 'distress', confidence: Math.min(80, Math.round(45 + f.peakRms * 60)), usable: true };
  }
  if (f.maxBurstSec >= 0.8 && f.peakRms >= 0.03 && f.peakRms < 0.15 && f.peakHz < 400) {
    return { cls: 'hunger', confidence: Math.min(70, Math.round(45 + f.burstCount * 4)), usable: true };
  }
  return { cls: 'normal', confidence: 60, usable: true };
}

const AUDIO_POINTS = { cough: 8, distress: 12, panting: 8, hunger: 2, normal: 0, silence: 0 };

// ---------- rules ----------
const RULES = [
  { id: 'poisoning', priority: 100, emergency: true, urgency: 'now', min: 90, test: (c) => c.signs.has('poisoning'), evidence: ['poisoning'], fixedConfidence: 85 },
  { id: 'bloat', priority: 99, emergency: true, urgency: 'now', min: 85, species: ['cattle', 'buffalo', 'sheep', 'goat'], test: (c) => c.signs.has('bloat'), evidence: ['bloat'], fixedConfidence: 85 },
  { id: 'down', priority: 98, emergency: true, urgency: 'now', min: 80, test: (c) => c.signs.has('down'), evidence: ['down'], fixedConfidence: 85 },
  { id: 'respiratory', priority: 90, emergency: true, urgency: 'now', min: 75, test: (c) => c.signs.has('laboured_breathing'), evidence: ['laboured_breathing', 'cough_sign', 'fever', 'discharge'], audioAgree: ['cough', 'distress', 'panting'] },
  { id: 'fmd', priority: 80, urgency: '24h', min: 70, species: ['cattle', 'buffalo', 'sheep', 'goat'],
    test: (c) => c.signs.has('drooling') && c.signs.has('limping') && (c.signs.has('fever') || c.signs.has('mouth_blisters')),
    evidence: ['drooling', 'limping', 'fever', 'mouth_blisters'], motionAgree: true },
  { id: 'lsd', priority: 75, urgency: '24h', min: 65, species: ['cattle', 'buffalo'],
    test: (c) => c.signs.has('nodules') && (c.signs.has('fever') || c.signs.has('discharge') || c.signs.has('reduced_appetite')),
    evidence: ['nodules', 'fever', 'discharge', 'reduced_appetite'] },
  { id: 'newcastle', priority: 74, urgency: '24h', min: 65, species: ['poultry'],
    test: (c) => c.signs.has('nervous_signs') || ((c.signs.has('laboured_breathing') || c.signs.has('cough_sign')) && c.signs.has('diarrhoea')),
    evidence: ['nervous_signs', 'cough_sign', 'diarrhoea', 'isolation'], audioAgree: ['cough'] },
  { id: 'respiratory', priority: 62, urgency: '24h', min: 55,
    test: (c) => c.signs.has('cough_sign') && (c.signs.has('fever') || c.signs.has('discharge') || c.audio?.cls === 'cough'),
    evidence: ['cough_sign', 'fever', 'discharge'], audioAgree: ['cough', 'distress'] },
  { id: 'mastitis', priority: 60, urgency: '24h', min: 50, species: ['cattle', 'buffalo', 'sheep', 'goat'],
    test: (c) => c.signs.has('swollen_udder') && (c.signs.has('reduced_milk') || c.signs.has('fever')),
    evidence: ['swollen_udder', 'reduced_milk', 'fever'] },
  { id: 'heat_stress', priority: 50, urgency: 'watch', min: 45,
    test: (c) => (c.signs.has('heat_panting') || c.audio?.cls === 'panting') && c.thi && c.thi.value >= 79,
    evidence: ['heat_panting'], audioAgree: ['panting'], envAgree: true }
];

const ACTIONS_BY_LABEL = {
  fmd: ['isolate', 'separate_water', 'wash_hands', 'notify_authority', 'do_not_medicate'],
  lsd: ['isolate', 'insect_control', 'notify_authority', 'do_not_medicate'],
  newcastle: ['isolate', 'wash_hands', 'notify_authority', 'do_not_medicate'],
  mastitis: ['milk_hygiene', 'clean_shelter', 'do_not_medicate'],
  respiratory: ['ventilate', 'isolate', 'do_not_medicate'],
  heat_stress: ['shade_water', 'ventilate', 'monitor_recheck'],
  bloat: ['keep_calm', 'do_not_medicate'],
  poisoning: ['remove_source', 'do_not_medicate'],
  down: ['keep_comfortable', 'do_not_medicate'],
  general_illness: ['offer_water', 'clean_shelter', 'monitor_recheck', 'do_not_medicate'],
  healthy: ['monitor_recheck']
};

export function feverThreshold(species) {
  if (species === 'cattle' || species === 'buffalo') return 39.5;
  if (species === 'sheep' || species === 'goat') return 40.5;
  return null; // poultry: body temperature is not used
}

export function normalizeInput(body) {
  const species = body.species;
  if (!SPECIES.includes(species)) throw new HttpError(400, 'species is invalid', 'species');
  const tempC = numIn(body, 'temp_c', 30, 46, { label: 'Body temperature' });
  return {
    species,
    signs: normalizeSigns(body.signs),
    tempC,
    motion: normalizeMotion(body.motion),
    audio: normalizeAudio(body.audio),
    conditions: normalizeConditions(body.conditions)
  };
}

// ---------- fusion ----------
export function runFusion(input) {
  const { species } = input;
  const signs = new Set(input.signs);
  const reasons = [];

  let feverFromTemp = false;
  if (input.tempC !== null && input.tempC !== undefined) {
    const thr = feverThreshold(species);
    if (thr !== null && input.tempC >= thr) { signs.add('fever'); feverFromTemp = true; }
  }

  const motion = input.motion ? analyzeMotion(input.motion) : null;
  const audio = input.audio ? classifyAudio(input.audio) : null;
  const thi = input.conditions ? { value: input.conditions.thi, band: thiBand(input.conditions.thi) } : null;
  const ammonia = input.conditions && input.conditions.ammonia_ppm !== null
    ? { value: input.conditions.ammonia_ppm, band: ammoniaBand(input.conditions.ammonia_ppm) } : null;

  // score parts
  let signPts = 0;
  for (const s of signs) signPts += SIGN_DEFS[s].w;
  signPts = Math.min(70, Math.round(signPts * 0.9));

  let motionPts = 0;
  if (motion && motion.usable) {
    if (motion.active >= 3) motionPts = Math.round(motion.ratio * 12);
    else if (motion.still) motionPts = 4;
  }
  const audioPts = audio && audio.usable ? AUDIO_POINTS[audio.cls] : 0;
  let envPts = 0;
  if (thi) envPts += [0, 2, 5, 8, 12][thi.band.level];
  if (ammonia) envPts += [0, 3, 6, 9][ammonia.band.level];
  envPts = Math.min(12, envPts);

  let score = Math.min(100, signPts + motionPts + audioPts + envPts);

  // rules
  const ctx = { signs, audio, motion, thi };
  const matched = RULES.filter((r) => (!r.species || r.species.includes(species)) && r.test(ctx)).sort((a, b) => b.priority - a.priority);
  const primary = matched[0] || null;
  const also = [...new Set(matched.slice(1).map((r) => r.id).filter((id) => !primary || id !== primary.id))];

  let label = 'healthy';
  let urgency = 'none';
  let emergency = false;
  let confidence;
  let evidenceIds = [];

  if (primary) {
    label = primary.id;
    urgency = primary.urgency;
    emergency = !!primary.emergency;
    score = Math.max(score, primary.min);
    evidenceIds = primary.evidence.filter((e) => signs.has(e));
    if (primary.fixedConfidence) {
      confidence = primary.fixedConfidence;
    } else {
      confidence = 42 + evidenceIds.length * 9;
      if (primary.motionAgree && motion && motion.usable && motion.active >= 3 && motion.ratio >= 0.4) confidence += 8;
      if (primary.audioAgree && audio && audio.usable && primary.audioAgree.includes(audio.cls)) confidence += 8;
      if (primary.envAgree && thi && thi.band.level >= 2) confidence += 6;
      confidence = Math.min(92, confidence);
    }
  } else if (score >= 25) {
    label = 'general_illness';
    urgency = score >= 45 ? '24h' : 'watch';
    confidence = Math.min(75, 30 + Math.round(score * 0.45));
  } else {
    let c = 55;
    if (motion && motion.usable && motion.active >= 3 && motion.ratio < 0.3) c += 10;
    if (audio && audio.usable && audio.cls === 'normal') c += 10;
    if (thi && thi.band.level === 0) c += 5;
    if (signs.size === 0 && !motion && !audio) c = 45;
    confidence = Math.min(85, c);
  }

  const severity = emergency || score >= 60 ? 'red' : score >= 30 ? 'yellow' : 'green';
  const cls = severity === 'red' ? 'critical' : severity === 'yellow' ? 'at_risk' : 'healthy';

  // reasons (structured, rendered and translated by the client)
  const reported = SIGN_IDS.filter((s) => signs.has(s) && !(s === 'fever' && feverFromTemp));
  if (reported.length) reasons.push({ k: 'signs', ids: reported });
  if (feverFromTemp) reasons.push({ k: 'fever_temp', v: input.tempC });
  if (primary && evidenceIds.length >= 2 && !primary.fixedConfidence) reasons.push({ k: 'pattern', label, ids: evidenceIds });
  if (motion && motion.usable) {
    if (motion.active >= 3) reasons.push({ k: 'motion', uneven: motion.uneven, active: motion.active });
    else if (motion.still) reasons.push({ k: 'motion_still' });
  }
  if (audio && audio.usable) reasons.push({ k: 'audio', cls: audio.cls, c: audio.confidence });
  if (thi) reasons.push({ k: 'thi', v: thi.value, band: thi.band.id });
  if (ammonia && ammonia.band.level > 0) reasons.push({ k: 'ammonia', v: ammonia.value, band: ammonia.band.id });
  if (!motion && !audio && !thi) reasons.push({ k: 'signs_only' });
  if (reasons.length === 0) reasons.push({ k: 'nothing_reported' });

  // actions
  const actions = [...(ACTIONS_BY_LABEL[label] || [])];
  if (urgency === 'now') actions.unshift('call_vet_now');
  else if (urgency === '24h') {
    const idx = actions.indexOf('do_not_medicate');
    actions.splice(idx === -1 ? actions.length : idx, 0, 'call_vet_24h');
  } else if (label === 'heat_stress' && thi && thi.band.level >= 3) {
    actions.push('call_vet_24h');
  }

  return {
    version: 1,
    score,
    severity,
    class: cls,
    label,
    confidence,
    emergency,
    urgency,
    reasons,
    actions,
    also,
    parts: { signs: signPts, motion: motionPts, audio: audioPts, environment: envPts },
    thi,
    ammonia,
    audio: audio ? { cls: audio.cls, confidence: audio.confidence } : null,
    motion: motion ? { usable: motion.usable, active: motion.active, uneven: motion.uneven, total: motion.total } : null
  };
}

export function sanitizeFreeText(s, max = 300) { return cleanText(s, max); }
