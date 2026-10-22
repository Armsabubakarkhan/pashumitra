import { h, mount } from '../ui.js';
import { post } from '../api.js';
import { t, tSpecies, tSign } from '../i18n.js';
import { alertCard, bars, heatCanvas } from '../components.js';
import { MotionAnalyzer, audioFeatures, computeTHI } from '../analysis.js';

// ---- synthetic clips, generated in the browser so the demo is real analysis, not a canned answer ----
let seed = 11;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };

function movementClip(kind) {
  const W = 96, H = 54, fps = 8, secs = 12;
  const m = new MotionAnalyzer(W, H);
  let x = 6;
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let f = 0; f < fps * secs; f++) {
    const sec = f / fps;
    let step;
    if (kind === 'steady') step = 3;
    else step = (f % 8 < 2 || (f * 7) % 5 === 0) ? 11 : 0; // uneven: stop-start with sudden jumps
    x = (x + step) % 78;
    for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
      const i = (y * W + xx) * 4;
      const body = xx >= x && xx < x + 14 && y >= 18 && y < 38;
      const v = body ? 220 : 45;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = v; rgba[i + 3] = 255;
    }
    m.push(rgba, sec);
  }
  return m.finish();
}

function soundClip(kind) {
  const SR = 16000, secs = 10;
  const out = new Float32Array(SR * secs);
  const n = (a) => (rnd() * 2 - 1) * a;
  for (let i = 0; i < out.length; i++) {
    const t0 = i / SR;
    if (kind === 'cough') out[i] = n([1, 3, 5, 7].some((b) => t0 >= b && t0 < b + 0.25) ? 0.35 : 0.003);
    else if (kind === 'panting') out[i] = n((t0 % 0.5) < 0.15 ? 0.25 : 0.004);
    else out[i] = n(0.012) * (0.5 + 0.5 * Math.sin(t0 * 0.7));
  }
  return audioFeatures(out, SR);
}

const PRESETS = {
  fmd: { species: 'cattle', signs: ['drooling', 'limping', 'fever'], motion: 'uneven', sound: 'none', temp: 30, hum: 84, label: 'Foot and mouth pattern' },
  heat: { species: 'cattle', signs: ['heat_panting'], motion: 'steady', sound: 'panting', temp: 36, hum: 72, label: 'Heat stress pattern' },
  cough: { species: 'buffalo', signs: ['cough_sign', 'fever'], motion: 'steady', sound: 'cough', temp: 24, hum: 55, label: 'Respiratory pattern' },
  well: { species: 'goat', signs: [], motion: 'steady', sound: 'normal', temp: 24, hum: 50, label: 'Healthy animal' }
};
const DEMO_SIGNS = ['limping', 'drooling', 'fever', 'cough_sign', 'heat_panting', 'nodules', 'swollen_udder', 'bloat'];

export async function home() {
  const out = h('div', { 'aria-live': 'polite' }, h('p', { class: 'muted' }, 'Pick an example or set the inputs, then press Analyse. This calls the same analysis the signed-in app uses.'));
  const sp = h('select', { 'aria-label': t('species') }, ['cattle', 'buffalo', 'sheep', 'goat', 'poultry'].map((s) => h('option', { value: s }, tSpecies(s))));
  const signBoxes = DEMO_SIGNS.map((s) => ({ id: s, el: h('input', { type: 'checkbox', value: s }) }));
  const mv = h('select', { 'aria-label': 'Video clip' }, h('option', { value: 'none' }, 'No video'), h('option', { value: 'steady' }, 'Sample clip: steady walk'), h('option', { value: 'uneven' }, 'Sample clip: stop-start, uneven walk'));
  const sd = h('select', { 'aria-label': 'Sound clip' }, h('option', { value: 'none' }, 'No sound'), h('option', { value: 'normal' }, 'Sample sound: quiet shed'), h('option', { value: 'cough' }, 'Sample sound: coughing'), h('option', { value: 'panting' }, 'Sample sound: fast panting'));
  const temp = h('input', { type: 'number', min: -10, max: 60, step: '0.5', value: '30', 'aria-label': t('temperature') });
  const hum = h('input', { type: 'number', min: 0, max: 100, step: '1', value: '84', 'aria-label': t('humidity') });
  const thiOut = h('p', { class: 'num muted' });
  const refreshThi = () => { const a = Number(temp.value), b = Number(hum.value); thiOut.textContent = Number.isFinite(a) && Number.isFinite(b) ? 'Heat index (THI) ' + computeTHI(a, b) : ''; };
  temp.addEventListener('input', refreshThi); hum.addEventListener('input', refreshThi); refreshThi();

  function apply(p) {
    sp.value = p.species; mv.value = p.motion; sd.value = p.sound; temp.value = p.temp; hum.value = p.hum; refreshThi();
    for (const b of signBoxes) b.el.checked = p.signs.includes(b.id);
    run();
  }

  async function run() {
    mount(out, h('p', { class: 'muted' }, 'Analysing...'));
    try {
      const body = { species: sp.value, signs: signBoxes.filter((b) => b.el.checked).map((b) => b.id), conditions: { temperature_c: Number(temp.value), humidity: Number(hum.value) } };
      const extra = [];
      let motionOut = null;
      if (mv.value !== 'none') {
        motionOut = movementClip(mv.value);
        body.motion = { seconds: motionOut.seconds, shaky: motionOut.shaky };
        extra.push(h('div', null, h('h3', null, 'Video: movement per second'), bars(motionOut.seconds, 0.75), h('p', { class: 'muted' }, 'Orange bars are seconds of uneven movement.')));
      }
      if (sd.value !== 'none') {
        const f = soundClip(sd.value);
        body.audio = f;
        extra.push(h('p', { class: 'num muted' }, 'Sound features measured: loudest ' + f.peakRms + ', bursts ' + f.burstCount + ', rhythm ' + f.periodicity + ' at ' + f.periodHz + ' Hz'));
      }
      const r = await post('/api/demo/analyze', body);
      mount(out, alertCard(r.result, { headingLevel: 3, heat: motionOut ? h('div', { class: 'alert-body' }, h('div', null, h('h3', null, 'Where it moved'), heatCanvas(motionOut)), h('div', null, extra)) : (extra.length ? h('div', { class: 'alert-body' }, extra) : null) }));
    } catch (e) {
      mount(out, h('p', { class: 'note bad', role: 'alert' }, e.message));
    }
  }

  const demo = h('section', { class: 'section', id: 'demo' },
    h('p', { class: 'eyebrow' }, 'Live demonstration'),
    h('h2', null, 'Run the analysis yourself'),
    h('p', null, 'The clips below are generated in your browser and measured by the same on-device code used for real recordings. Nothing is uploaded except the resulting numbers.'),
    h('div', { class: 'row' }, Object.entries(PRESETS).map(([k, p]) => h('button', { class: 'small', onclick: () => apply(PRESETS[k]) }, p.label))),
    h('div', { class: 'cols2', style: null },
      h('form', { class: 'panel stack', onsubmit: (e) => { e.preventDefault(); run(); } },
        h('div', { class: 'field' }, h('label', null, t('species')), sp),
        h('fieldset', { class: 'field', style: null }, h('legend', { class: 'sr' }, t('step_signs')), h('p', { class: 'hint' }, t('step_signs')),
          h('div', { class: 'checks' }, signBoxes.map((b) => h('label', { class: 'check' }, b.el, tSign(b.id))))),
        h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', null, t('temperature')), temp), h('div', { class: 'field' }, h('label', null, t('humidity')), hum)),
        thiOut,
        h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', null, t('step_video')), mv), h('div', { class: 'field' }, h('label', null, t('step_sound')), sd)),
        h('button', { class: 'primary', type: 'submit' }, t('analyse'))),
      h('div', null, out)));

  const hero = h('div', { class: 'hero' },
    h('div', null,
      h('p', { class: 'eyebrow' }, 'Livestock health screening for small farms'),
      h('h1', null, 'Spot a sick animal before the whole herd is sick.'),
      h('p', { class: 'lede' }, 'Point your phone at the animal, record a few seconds of sound, and note the shed temperature. PashuMitra AI combines all of it into one risk level, tells you why, and tells you what to do next, in your language.'),
      h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/signup' }, t('signup')), h('a', { class: 'btn', href: '#demo', onclick: (e) => { e.preventDefault(); document.getElementById('demo').scrollIntoView(); } }, 'Try the demonstration'))),
    h('ul', { class: 'facts', 'aria-label': 'Key facts' },
      h('li', null, h('span', { class: 'k' }, 'Species'), h('span', { class: 'v' }, 'Cattle, buffalo, sheep, goat, poultry')),
      h('li', null, h('span', { class: 'k' }, 'Languages'), h('span', { class: 'v' }, 'English, Hindi, Tamil, Telugu, Kannada, Malayalam')),
      h('li', null, h('span', { class: 'k' }, 'Raw video and audio'), h('span', { class: 'v' }, 'Stay on the phone')),
      h('li', null, h('span', { class: 'k' }, 'Medicine doses'), h('span', { class: 'v' }, 'Never given')),
      h('li', null, h('span', { class: 'k' }, 'Every result'), h('span', { class: 'v' }, 'Shows its reasons'))));

  const how = h('section', { class: 'section' },
    h('p', { class: 'eyebrow' }, 'How a scan works'),
    h('h2', null, 'Four inputs, one explained result'),
    h('ol', { class: 'steps' },
      h('li', null, h('div', null, h('h3', null, 'You describe what you see'), h('p', null, 'Tick the signs on a short list: limping, drooling, lumps, cough, a swollen udder. No typing needed.'))),
      h('li', null, h('div', null, h('h3', null, 'The phone measures movement'), h('p', null, 'A video of up to fifteen seconds is reduced on the phone to movement per second. Uneven, stop-start walking raises the risk. Camera shake is discounted.'))),
      h('li', null, h('div', null, h('h3', null, 'The phone measures sound'), h('p', null, 'A recording is classed as cough-like, panting-like, a loud distress call, a hunger call, or normal. These describe the shape of the sound. They are not a translation.'))),
      h('li', null, h('div', null, h('h3', null, 'Shed conditions are added'), h('p', null, 'Temperature and humidity give the Temperature Humidity Index. Ammonia is checked against safe limits. Heat and bad air raise the risk of illness.'))),
      h('li', null, h('div', null, h('h3', null, 'You get a colour, a reason and a next step'), h('p', null, 'Low, medium or high risk, the reasons in plain words, and what to do now. High-risk results tell you to call a vet.')))));

  const covers = h('section', { class: 'section' },
    h('p', { class: 'eyebrow' }, 'What it looks for'),
    h('h2', null, 'Conditions covered by the rules'),
    h('dl', { class: 'defs' },
      h('dt', null, 'Foot and Mouth Disease'), h('dd', null, 'Drooling, limping and fever or mouth sores, in cattle, buffalo, sheep and goats.'),
      h('dt', null, 'Lumpy Skin Disease'), h('dd', null, 'Skin lumps with fever, discharge or poor appetite, in cattle and buffalo.'),
      h('dt', null, 'Mastitis'), h('dd', null, 'Swollen udder with falling milk or fever.'),
      h('dt', null, 'Respiratory distress'), h('dd', null, 'Hard or fast breathing, or coughing with fever or discharge.'),
      h('dt', null, 'Heat stress'), h('dd', null, 'Panting with a high Temperature Humidity Index.'),
      h('dt', null, 'Newcastle disease'), h('dd', null, 'Nervous signs, or breathing signs with loose droppings, in poultry.'),
      h('dt', null, 'Emergencies'), h('dd', null, 'Bloat, suspected poisoning, and an animal that cannot stand go straight to "call a vet now".')));

  const limits = h('section', { class: 'section' },
    h('div', { class: 'cols2' },
      h('div', null, h('p', { class: 'eyebrow' }, 'Honest limits'), h('h2', null, 'A screening tool'),
        h('p', null, 'The rules were written from standard livestock health guidance and are meant to raise an early flag. They have not been validated on a large field dataset yet, so every result says to consult a vet, and veterinarians can confirm or correct results inside the app. Those corrections are saved so the rules can be improved with real evidence.')),
      h('div', null, h('p', { class: 'eyebrow' }, 'For vets and officers'), h('h2', null, 'Review and district alerts'),
        h('p', null, 'Farmers can share a scan with a verified veterinarian, who confirms or corrects the label. When several farms in a district show the same suspected disease within two weeks, an anonymous cluster alert appears for neighbours and for veterinarians.'),
        h('a', { class: 'btn', href: '#/signup' }, t('signup')))));

  const root = h('div', { class: 'wrap', 'data-title': 'Livestock health screening' }, hero, demo, how, covers, limits);
  return root;
}
