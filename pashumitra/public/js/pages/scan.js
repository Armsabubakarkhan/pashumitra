import { h, mount, field, fmtDate, toast, option } from '../ui.js';
import { get, post, ApiError } from '../api.js';
import { t, tSign, tSpecies, tLabel, tAudio } from '../i18n.js';
import { alertCard, bars, heatCanvas, empty, alertText } from '../components.js';
import { MotionAnalyzer, audioFeatures, computeTHI, thiBandId } from '../analysis.js';
import { go } from '../app.js';

const SIGN_GROUPS = {
  cattle: ['fever', 'reduced_appetite', 'isolation', 'abnormal_posture', 'limping', 'drooling', 'mouth_blisters', 'nodules', 'discharge', 'cough_sign', 'laboured_breathing', 'heat_panting', 'swollen_udder', 'reduced_milk', 'diarrhoea', 'bloat', 'poisoning', 'down'],
  poultry: ['reduced_appetite', 'isolation', 'abnormal_posture', 'cough_sign', 'laboured_breathing', 'discharge', 'diarrhoea', 'nervous_signs', 'heat_panting', 'poisoning', 'down']
};
SIGN_GROUPS.buffalo = SIGN_GROUPS.cattle;
SIGN_GROUPS.sheep = SIGN_GROUPS.cattle.filter((s) => s !== 'nodules');
SIGN_GROUPS.goat = SIGN_GROUPS.sheep;

const MAX_VIDEO_SEC = 15;

function pickAnimalId(query, animals) {
  const q = Number(query.animal);
  return animals.some((a) => a.id === q) ? q : (animals[0] && animals[0].id);
}

export async function scanPage({ query }) {
  const { animals } = await get('/api/animals');
  if (!animals.length) {
    return h('div', { class: 'narrow', 'data-title': t('new_scan') }, h('h1', null, t('new_scan')), empty('Add an animal first, then you can scan it.', h('a', { class: 'btn primary', href: '#/animals' }, t('nav_animals'))));
  }
  const root = h('div', { class: 'wrap stack', 'data-title': t('new_scan') });
  const st = { signs: new Set(), motion: null, audio: null, audioInfo: null };

  const animalSel = h('select', null, animals.map((a) => option(a.id, a.tag + ' (' + tSpecies(a.species) + ')', a.id === pickAnimalId(query, animals))));
  const current = () => animals.find((a) => a.id === Number(animalSel.value));

  // ---- signs ----
  const signsBox = h('div', { class: 'checks' });
  function drawSigns() {
    const sp = current().species;
    const allowed = SIGN_GROUPS[sp];
    for (const s of [...st.signs]) if (!allowed.includes(s)) st.signs.delete(s);
    mount(signsBox, allowed.map((s) => {
      const cb = h('input', { type: 'checkbox', checked: st.signs.has(s), onchange: (e) => { if (e.target.checked) st.signs.add(s); else st.signs.delete(s); } });
      return h('label', { class: 'check' }, cb, tSign(s));
    }));
  }
  animalSel.addEventListener('change', drawSigns);
  const bodyTemp = h('input', { type: 'number', step: '0.1', min: 30, max: 46, inputmode: 'decimal' });

  // ---- video ----
  const videoStatus = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' }, 'No video added. You can skip this step.');
  const videoOut = h('div');
  const liveVideo = h('video', { class: 'vid hidden', playsinline: true, muted: true, 'aria-label': 'Camera preview' });
  liveVideo.muted = true;
  const fileVideo = h('input', { type: 'file', accept: 'video/*', class: 'sr', id: 'vfile', onchange: (e) => { if (e.target.files[0]) analyseVideoFile(e.target.files[0]); e.target.value = ''; } });
  let stream = null; let camTimer = null;

  function showMotion(out, label) {
    st.motion = { seconds: out.seconds, shaky: out.shaky };
    const usable = out.seconds.length >= 5;
    mount(videoOut,
      h('p', { role: 'status' }, usable ? label + ': ' + out.seconds.length + ' seconds of usable movement measured' + (out.shaky ? ', ' + out.shaky + ' shaky seconds ignored' : '') + '.' : 'Not enough steady footage (' + out.seconds.length + ' seconds). Hold the phone steady and film at least 6 seconds of the animal walking or standing.'),
      usable ? h('div', { class: 'grid2' }, h('div', null, h('h3', null, 'Movement per second'), bars(out.seconds, 0.75)), h('div', null, h('h3', null, 'Where it moved'), heatCanvas(out))) : null,
      h('p', { class: 'muted' }, 'Only these numbers are sent. The video stays on this device.'));
    if (!usable) st.motion = null;
    videoStatus.textContent = usable ? 'Video analysed.' : 'Video could not be used.';
  }

  async function analyseVideoFile(file) {
    stopCamera();
    if (file.size > 300 * 1024 * 1024) { toast('That video is too large. Use one under 300 MB', true); return; }
    videoStatus.textContent = 'Analysing video...';
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    const url = URL.createObjectURL(file);
    v.src = url;
    try {
      await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('This video format cannot be read by your browser. Try recording with the camera button')); setTimeout(() => rej(new Error('The video took too long to load')), 15000); });
      const dur = Math.min(MAX_VIDEO_SEC, isFinite(v.duration) ? v.duration : MAX_VIDEO_SEC);
      if (dur < 3) throw new Error('The video is too short. Use at least 6 seconds');
      const m = new MotionAnalyzer(96, 54);
      const c = document.createElement('canvas'); c.width = 96; c.height = 54;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      // step through the clip by seeking, so analysis is fast and does not depend on playback speed
      const fps = 8; const frames = Math.floor(dur * fps);
      for (let i = 0; i < frames; i++) {
        await new Promise((res, rej) => { v.onseeked = res; v.onerror = () => rej(new Error('Could not read the video')); v.currentTime = i / fps; });
        ctx.drawImage(v, 0, 0, 96, 54);
        m.push(ctx.getImageData(0, 0, 96, 54).data, i / fps);
        if (i % 16 === 0) videoStatus.textContent = 'Analysing video... ' + Math.round((i / frames) * 100) + '%';
      }
      showMotion(m.finish(), 'Video file');
    } catch (e) { videoStatus.textContent = e.message; st.motion = null; mount(videoOut); }
    finally { URL.revokeObjectURL(url); }
  }

  function stopCamera() {
    if (camTimer) { clearInterval(camTimer); camTimer = null; }
    if (stream) { stream.getTracks().forEach((tr) => tr.stop()); stream = null; }
    liveVideo.srcObject = null; liveVideo.classList.add('hidden');
    recBtn.textContent = t('record_video'); recording = false;
  }
  let recording = false;
  const recBtn = h('button', { type: 'button', onclick: async () => {
    if (recording) { finishCamera(); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { videoStatus.textContent = 'Camera is not available in this browser or this page is not secure. Choose a video file instead.'; return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 360 } }, audio: false });
    } catch (e) { videoStatus.textContent = 'Camera permission was not given. You can choose a video file instead.'; return; }
    liveVideo.srcObject = stream; liveVideo.classList.remove('hidden');
    await liveVideo.play().catch(() => {});
    recording = true; recBtn.textContent = t('stop');
    const m = new MotionAnalyzer(96, 54);
    const c = document.createElement('canvas'); c.width = 96; c.height = 54;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const t0 = performance.now();
    camTimer = setInterval(() => {
      const el = (performance.now() - t0) / 1000;
      ctx.drawImage(liveVideo, 0, 0, 96, 54);
      m.push(ctx.getImageData(0, 0, 96, 54).data, el);
      videoStatus.textContent = 'Recording ' + Math.floor(el) + ' of 10 seconds. Keep the animal in view and the phone steady.';
      if (el >= 10) finishCamera();
    }, 125);
    camMotion = m;
  } }, t('record_video'));
  let camMotion = null;
  function finishCamera() {
    const m = camMotion; camMotion = null;
    stopCamera();
    if (m) showMotion(m.finish(), 'Camera');
  }
  const videoBox = h('div', { class: 'stack' }, h('div', { class: 'row' }, recBtn, h('label', { class: 'btn', for: 'vfile', tabindex: '0', onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileVideo.click(); } } }, t('choose_file')), fileVideo), liveVideo, videoStatus, videoOut);

  // ---- sound ----
  const audioStatus = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' }, 'No sound added. You can skip this step.');
  const audioOut = h('div');
  async function analyseAudioBlob(blob) {
    audioStatus.textContent = 'Analysing sound...';
    try {
      const buf = await blob.arrayBuffer();
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('This browser cannot analyse sound');
      const ctx = new AC();
      let decoded;
      try { decoded = await ctx.decodeAudioData(buf); } finally { ctx.close && ctx.close(); }
      const ch = decoded.getChannelData(0);
      const f = audioFeatures(ch, decoded.sampleRate);
      if (!f) throw new Error('The recording is too short. Record at least 5 seconds');
      const r = await post('/api/analyze/audio', { features: f });
      st.audio = f;
      st.audioInfo = r.audio;
      mount(audioOut, h('p', { role: 'status' }, r.audio.usable ? 'Sound pattern: ' + tAudio(r.audio.cls) + ' (' + r.audio.confidence + '%)' : tAudio('silence') + '. Move closer and record again.'),
        h('p', { class: 'muted' }, 'Only measured numbers are sent. The recording stays on this device.'));
      if (!r.audio.usable) st.audio = null;
      audioStatus.textContent = r.audio.usable ? 'Sound analysed.' : 'Sound could not be used.';
    } catch (e) { audioStatus.textContent = e instanceof ApiError || e instanceof Error ? e.message : 'Could not analyse that sound'; st.audio = null; mount(audioOut); }
  }
  let rec = null; let recChunks = []; let recStream = null; let recTimer = null;
  const sBtn = h('button', { type: 'button', onclick: async () => {
    if (rec) { rec.stop(); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) { audioStatus.textContent = 'Recording is not available here. Choose a sound file instead.'; return; }
    try { recStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
    catch { audioStatus.textContent = 'Microphone permission was not given. You can choose a sound file instead.'; return; }
    recChunks = [];
    rec = new MediaRecorder(recStream);
    rec.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
    rec.onstop = async () => {
      clearInterval(recTimer); recStream.getTracks().forEach((tr) => tr.stop());
      const blob = new Blob(recChunks, { type: rec.mimeType || 'audio/webm' });
      rec = null; sBtn.textContent = t('record_sound');
      await analyseAudioBlob(blob);
    };
    rec.start();
    sBtn.textContent = t('stop');
    const t0 = Date.now();
    recTimer = setInterval(() => { const el = (Date.now() - t0) / 1000; audioStatus.textContent = 'Recording ' + Math.floor(el) + ' of 10 seconds...'; if (el >= 10 && rec) rec.stop(); }, 250);
  } }, t('record_sound'));
  const fileAudio = h('input', { type: 'file', accept: 'audio/*,video/*', class: 'sr', id: 'afile', onchange: (e) => { if (e.target.files[0]) analyseAudioBlob(e.target.files[0]); e.target.value = ''; } });
  const audioBox = h('div', { class: 'stack' }, h('div', { class: 'row' }, sBtn, h('label', { class: 'btn', for: 'afile', tabindex: '0', onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileAudio.click(); } } }, t('choose_file')), fileAudio), audioStatus, audioOut);

  // ---- shed ----
  const temp = h('input', { type: 'number', step: '0.1', min: -10, max: 60, inputmode: 'decimal' });
  const hum = h('input', { type: 'number', step: '1', min: 0, max: 100, inputmode: 'numeric' });
  const amm = h('input', { type: 'number', step: '1', min: 0, max: 500, inputmode: 'numeric' });
  const thiOut = h('output', { class: 'num', 'aria-live': 'polite' });
  const upd = () => { const a = parseFloat(temp.value), b = parseFloat(hum.value); thiOut.textContent = isFinite(a) && isFinite(b) ? 'THI ' + computeTHI(a, b) + ' (' + thiBandId(computeTHI(a, b)) + ')' : ''; };
  temp.addEventListener('input', upd); hum.addEventListener('input', upd);
  const city = h('input', { type: 'text', maxlength: 80, placeholder: 'Nearest town' });
  const wmsg = h('p', { class: 'muted', role: 'status' });
  const wbtn = h('button', { type: 'button', onclick: async () => {
    wmsg.textContent = '...';
    try { const r = await get('/api/weather?city=' + encodeURIComponent(city.value)); temp.value = r.weather.temperature_c; hum.value = r.weather.humidity; upd(); wmsg.textContent = 'Outdoor reading for ' + r.weather.place + '. Adjust if the shed is different.'; }
    catch (e) { wmsg.textContent = e.message; }
  } }, 'Get weather');
  // prefill with the last saved shed reading
  try { const c = await get('/api/conditions?limit=1'); if (c.conditions[0]) { temp.value = c.conditions[0].temperature_c; hum.value = c.conditions[0].humidity; if (c.conditions[0].ammonia_ppm !== null) amm.value = c.conditions[0].ammonia_ppm; upd(); } } catch { /* optional */ }
  const shedBox = h('div', { class: 'stack' }, h('div', { class: 'grid2' }, field(t('temperature'), temp), field(t('humidity'), hum)), field(t('ammonia'), amm, { hint: '(optional)' }), thiOut,
    h('div', { class: 'field' }, h('label', null, 'Fill from live weather'), h('div', { class: 'row' }, city, wbtn), wmsg));

  const note = h('textarea', { maxlength: 300, rows: 2 });
  const err = h('p', { class: 'note bad', role: 'alert' }); err.hidden = true;
  const go1 = h('button', { class: 'primary', type: 'button', onclick: async () => {
    err.hidden = true; go1.disabled = true;
    try {
      const body = { animal_id: Number(animalSel.value), signs: [...st.signs], note: note.value };
      if (bodyTemp.value !== '') body.temp_c = bodyTemp.value;
      if (st.motion) body.motion = st.motion;
      if (st.audio) body.audio = st.audio;
      if (temp.value !== '' || hum.value !== '') body.conditions = { temperature_c: temp.value, humidity: hum.value, ammonia_ppm: amm.value };
      const r = await post('/api/scans', body);
      stopCamera();
      go('/scans/' + r.scan.id);
    } catch (e) { err.textContent = e.message; err.hidden = false; err.scrollIntoView({ block: 'center' }); }
    finally { go1.disabled = false; }
  } }, t('analyse'));

  const sec = (n, title, ...kids) => h('section', { class: 'panel stack' }, h('h2', null, n + '. ' + title), ...kids);
  drawSigns();
  root.append(
    h('div', { class: 'pagehead' }, h('h1', null, t('new_scan'))),
    h('div', { class: 'panel' }, h('div', { class: 'field' }, h('label', { for: 'animalsel' }, t('choose_animal')), Object.assign(animalSel, { id: 'animalsel' }))),
    sec(1, t('step_signs'), h('p', { class: 'hint' }, 'Tick everything you can see. Leave the rest.'), signsBox, field(t('body_temp'), bodyTemp)),
    sec(2, t('step_video') + ' (optional)', h('p', { class: 'hint' }, 'Film the animal walking or standing for about 10 seconds. Hold the phone steady.'), videoBox),
    sec(3, t('step_sound') + ' (optional)', h('p', { class: 'hint' }, 'Hold the phone near the animal for about 10 seconds. Keep other noise low.'), audioBox),
    sec(4, t('farm_conditions') + ' (optional)', shedBox),
    h('section', { class: 'panel stack' }, field('Note for your records', note, { hint: '(optional)' }), err, h('div', { class: 'row' }, go1)));
  return root;
}

export async function scanView({ params }) {
  const { scan } = await get('/api/scans/' + encodeURIComponent(params.id));
  const r = scan.result;
  const { vets } = await get('/api/help/vets');
  const status = h('p', { role: 'status', class: 'muted' });

  let vetBox = null;
  if (scan.vet_status === 'pending') vetBox = h('div', { class: 'note' }, 'Shared with a veterinarian. Waiting for review.');
  else if (scan.vet_status === 'confirmed' || scan.vet_status === 'corrected') {
    vetBox = h('div', { class: scan.vet_status === 'corrected' ? 'note warn' : 'note' },
      h('strong', null, 'Veterinarian review: '), scan.vet_status === 'confirmed' ? 'Confirmed. ' : 'Corrected to ' + tLabel(scan.vet_label) + '. ', scan.vet_note || '',
      h('div', { class: 'muted' }, scan.vet_reviewed_at ? fmtDate(scan.vet_reviewed_at) : ''));
  }

  const vsel = h('select', { 'aria-label': 'Choose a veterinarian' }, vets.map((v) => option(v.id, v.name + (v.clinic ? ', ' + v.clinic : '') + (v.district ? ' (' + v.district + ')' : ''))));
  const share = vets.length ? h('div', { class: 'row' }, vsel, h('button', { onclick: async () => {
    try { const x = await post('/api/scans/' + scan.id + '/share', { vet_id: Number(vsel.value) }); toast('Shared with ' + x.vet.name); go('/scans/' + scan.id); } catch (e) { toast(e.message, true); }
  } }, t('share_vet'))) : h('p', { class: 'muted' }, 'No verified veterinarians are registered yet. Use ', h('a', { href: '#/help' }, t('find_help')), ' to call a clinic.');

  const fb = h('div', { class: 'row' }, h('span', null, 'Was this result right?'),
    h('button', { class: 'small', 'aria-pressed': scan.feedback === 'correct' ? 'true' : 'false', onclick: () => sendFb('correct') }, t('result_correct')),
    h('button', { class: 'small', 'aria-pressed': scan.feedback === 'wrong' ? 'true' : 'false', onclick: () => sendFb('wrong') }, t('result_wrong')));
  async function sendFb(v) { try { await post('/api/scans/' + scan.id + '/feedback', { feedback: v }); toast('Thank you. This helps improve the rules'); } catch (e) { toast(e.message, true); } }

  const extra = h('div', { class: 'alert-foot no-print' },
    h('a', { class: 'btn small', href: '#/help' }, t('find_help')),
    h('button', { class: 'small', onclick: async () => { try { await navigator.clipboard.writeText(alertText(r)); toast('Copied'); } catch { toast('Copy is not available here', true); } } }, 'Copy report'),
    h('button', { class: 'small', onclick: () => window.print() }, 'Print'));

  return h('div', { class: 'wrap stack', 'data-title': tLabel(scan.label) },
    h('div', { class: 'pagehead' }, h('div', null, h('p', { class: 'eyebrow' }, fmtDate(scan.created_at)), h('h1', null, 'Scan result')), h('a', { class: 'btn', href: '#/animals/' + scan.animal_id }, 'Animal card')),
    alertCard(r, { extra }), vetBox,
    h('div', { class: 'panel stack no-print' }, h('h2', null, t('share_vet')), share, h('hr', { class: 'rule' }), fb, status));
}
