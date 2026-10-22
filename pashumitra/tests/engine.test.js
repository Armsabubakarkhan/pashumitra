import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTHI, thiBand, ammoniaBand, normalizeInput, runFusion, classifyAudio, analyzeMotion } from '../src/engine.js';
import { answerQuestion, safetyCheck } from '../src/kb.js';
import { cleanText, csvCell } from '../src/util.js';
import { hashPassword, verifyPassword, checkPasswordPolicy } from '../src/password.js';

const run = (body) => runFusion(normalizeInput(body));
const audio = (o) => ({ duration: 10, rms: 0.05, peakRms: 0.1, centroid: 500, peakHz: 200, burstCount: 0, burstRate: 0, meanBurstSec: 0, maxBurstSec: 0, periodicity: 0.1, periodHz: 0, lowRatio: 0.6, ...o });

test('THI formula and bands', () => {
  assert.equal(computeTHI(35, 84), 91.7);
  assert.equal(thiBand(71.9).id, 'comfortable');
  assert.equal(thiBand(72).id, 'mild');
  assert.equal(thiBand(79).id, 'moderate');
  assert.equal(thiBand(89).id, 'severe');
  assert.equal(thiBand(99).id, 'danger');
  assert.equal(ammoniaBand(8).id, 'ok');
  assert.equal(ammoniaBand(30).id, 'high');
});

test('FMD pattern from the project document is flagged red with a vet within 24 hours', () => {
  const seconds = Array.from({ length: 10 }, (_, i) => [0.03, i < 8 ? 1.2 : 0.3]);
  const r = run({ species: 'cattle', signs: ['drooling', 'limping', 'fever'], motion: { seconds, shaky: 0 },
    conditions: { temperature_c: 30, humidity: 84 } });
  assert.equal(r.label, 'fmd');
  assert.equal(r.severity, 'red');
  assert.equal(r.urgency, '24h');
  assert.ok(r.confidence >= 70 && r.confidence <= 92, 'confidence ' + r.confidence);
  assert.ok(r.actions.includes('isolate') && r.actions.includes('call_vet_24h') && r.actions.includes('do_not_medicate'));
  assert.ok(r.reasons.some((x) => x.k === 'motion' && x.uneven === 8 && x.active === 10));
});

test('no signs gives a green healthy result', () => {
  const r = run({ species: 'goat', signs: [] });
  assert.equal(r.label, 'healthy');
  assert.equal(r.severity, 'green');
  assert.equal(r.urgency, 'none');
});

test('emergencies go straight to a vet', () => {
  for (const [sign, label] of [['bloat', 'bloat'], ['poisoning', 'poisoning'], ['down', 'down'], ['laboured_breathing', 'respiratory']]) {
    const r = run({ species: 'cattle', signs: [sign] });
    assert.equal(r.label, label);
    assert.equal(r.emergency, true);
    assert.equal(r.severity, 'red');
    assert.equal(r.actions[0], 'call_vet_now');
  }
});

test('species rules are respected', () => {
  const fmdOnPoultry = run({ species: 'poultry', signs: ['drooling', 'limping', 'fever'] });
  assert.notEqual(fmdOnPoultry.label, 'fmd');
  const nd = run({ species: 'poultry', signs: ['nervous_signs'] });
  assert.equal(nd.label, 'newcastle');
  const lsdOnGoat = run({ species: 'goat', signs: ['nodules', 'fever'] });
  assert.notEqual(lsdOnGoat.label, 'lsd');
});

test('mastitis needs udder swelling plus milk drop or fever', () => {
  assert.equal(run({ species: 'cattle', signs: ['swollen_udder', 'reduced_milk'] }).label, 'mastitis');
  assert.notEqual(run({ species: 'cattle', signs: ['swollen_udder'] }).label, 'mastitis');
});

test('body temperature adds fever by species threshold', () => {
  assert.ok(run({ species: 'cattle', signs: ['nodules'], temp_c: 40.1 }).reasons.some((x) => x.k === 'fever_temp'));
  assert.ok(!run({ species: 'goat', signs: ['nodules'], temp_c: 40.1 }).reasons.some((x) => x.k === 'fever_temp'));
  assert.equal(run({ species: 'cattle', signs: ['nodules'], temp_c: 40.1 }).label, 'lsd');
});

test('heat stress needs panting plus THI of 79 or more', () => {
  const hot = run({ species: 'cattle', signs: ['heat_panting'], conditions: { temperature_c: 36, humidity: 70 } });
  assert.equal(hot.label, 'heat_stress');
  const cool = run({ species: 'cattle', signs: ['heat_panting'], conditions: { temperature_c: 20, humidity: 50 } });
  assert.notEqual(cool.label, 'heat_stress');
});

test('audio classification covers each class and caps confidence', () => {
  assert.equal(classifyAudio(audio({ rms: 0.001, peakRms: 0.005 })).cls, 'silence');
  const panting = classifyAudio(audio({ periodicity: 0.8, periodHz: 2, burstRate: 2, burstCount: 20 }));
  assert.equal(panting.cls, 'panting');
  assert.ok(panting.confidence <= 85);
  const cough = classifyAudio(audio({ burstCount: 4, meanBurstSec: 0.3, maxBurstSec: 0.4, burstRate: 0.4, centroid: 1500, peakRms: 0.2 }));
  assert.equal(cough.cls, 'cough');
  assert.equal(classifyAudio(audio({ burstCount: 2, meanBurstSec: 1.5, maxBurstSec: 2, burstRate: 0.2, peakRms: 0.4, centroid: 900, peakHz: 450 })).cls, 'distress');
  assert.equal(classifyAudio(audio({ burstCount: 2, meanBurstSec: 1.2, maxBurstSec: 1.5, burstRate: 0.2, peakRms: 0.08, centroid: 300, peakHz: 200 })).cls, 'hunger');
  assert.equal(classifyAudio(audio({})).cls, 'normal');
});

test('motion analysis counts uneven seconds only among active seconds', () => {
  const m = analyzeMotion({ seconds: [[0.02, 1], [0.02, 0.2], [0.0, 2], [0.02, 0.9], [0.02, 0.1], [0.02, 0.1]], shaky: 0 });
  assert.equal(m.active, 5);
  assert.equal(m.uneven, 2);
  assert.equal(m.usable, true);
});

test('invalid input is rejected with 400', () => {
  const bad = [
    { species: 'dog' },
    { species: 'cattle', signs: ['not_a_sign'] },
    { species: 'cattle', signs: 'limping' },
    { species: 'cattle', temp_c: 200 },
    { species: 'cattle', conditions: { temperature_c: 'hot', humidity: 50 } },
    { species: 'cattle', conditions: { temperature_c: 30, humidity: 500 } },
    { species: 'cattle', motion: { seconds: [[2, 0]] } },
    { species: 'cattle', motion: { seconds: new Array(100).fill([0.1, 0.1]) } },
    { species: 'cattle', audio: { duration: 5 } }
  ];
  for (const b of bad) assert.throws(() => normalizeInput(b), (e) => e.status === 400, JSON.stringify(b));
});

test('Ask AI refuses doses, escalates emergencies, answers known topics', () => {
  assert.equal(answerQuestion('how much oxytetracycline for my cow', 'cattle').kind, 'blocked');
  assert.equal(answerQuestion('dose of ivermectin 5 ml', 'cattle').kind, 'blocked');
  assert.equal(safetyCheck('how much water should a cow drink'), null);
  const e = answerQuestion('my cow is bloated and swollen on the left side', 'cattle');
  assert.equal(e.kind, 'emergency');
  assert.equal(e.callVet, true);
  assert.equal(answerQuestion('udder is hot and the milk has clots', 'cattle').title, 'Mastitis');
  assert.equal(answerQuestion('hello', 'cattle').kind, 'general');
});

test('sanitizer strips tags, control and bidi characters', () => {
  assert.equal(cleanText('<img src=x onerror=alert(1)>Hi\u0000‮'), 'img src=x onerror=alert(1)Hi');
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
});

test('password hashing and policy', async () => {
  const h = await hashPassword('correct horse 42');
  assert.ok(h.startsWith('scrypt$'));
  assert.equal(await verifyPassword('correct horse 42', h), true);
  assert.equal(await verifyPassword('wrong horse 42', h), false);
  assert.equal(await verifyPassword('x', 'garbage'), false);
  assert.throws(() => checkPasswordPolicy('short1'), (e) => e.status === 400);
  assert.throws(() => checkPasswordPolicy('onlyletters'), (e) => e.status === 400);
  assert.throws(() => checkPasswordPolicy('ramesh12345', { email: 'ramesh@example.com' }), (e) => e.status === 400);
  assert.doesNotThrow(() => checkPasswordPolicy('Field-gate-2026'));
});
