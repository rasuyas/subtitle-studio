/* Subtitle Studio front end (vanilla JS) */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

async function api(url, body, method = 'POST', signal) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal });
  if (!r.ok) {
    let m = await r.text();
    try { m = JSON.parse(m).detail || m; } catch { /* plain text */ }
    throw new Error(m);
  }
  return r;
}

const SAMPLE = ['Highlight', 'every', 'word'].map((w, i) => ({ w, start: i, end: i + 1 }));
const S = {
  job: null, words: [], phrases: [], selPhrase: 0, selWord: 1, t: 0,
  layout: 'split50', pip: 'br', blur: false, reframe: false, mode: 'mp4', showVideo: true,
  chunk: { max_words: 3, max_chars: 24, pause: 0.55 },
  style: {}, main: { x: .2, y: 0, w: .6, h: 1 }, face: { x: .7, y: .55, w: .3, h: .4 },
};

/* ------------------------------------------------------------------ style controls */
const SECTIONS = [
  { title: 'Highlight', show: () => true, controls: [
    { k: 'style', label: 'Style', t: 'select', opts: [['pill', 'Red rounded pill'], ['pop', 'Color pop'], ['popin', 'Word-by-word pop-in']] }] },
  { title: 'Text', show: () => true, controls: [
    { k: 'font', label: 'Font', t: 'select', searchable: true, opts: [] },
    { k: 'font_size', label: 'Size', t: 'range', min: 40, max: 140, step: 1 },
    { k: 'y_pos', label: 'Vertical position', t: 'range', min: .1, max: .9, step: .01, fmt: v => Math.round(v * 100) + '%' },
    { k: 'uppercase', label: 'All caps', t: 'check' },
    { k: 'text_color', label: 'Text color', t: 'color' },
    { k: 'stroke_width', label: 'Outline width', t: 'range', min: 0, max: 14, step: 1 },
    { k: 'stroke_color', label: 'Outline color', t: 'color' }] },
  { title: 'Drop shadow', show: () => true, controls: [
    { k: 'shadow_dx', label: 'Offset X', t: 'range', min: -20, max: 20, step: 1 },
    { k: 'shadow_dy', label: 'Offset Y', t: 'range', min: -20, max: 20, step: 1 },
    { k: 'shadow_blur', label: 'Blur', t: 'range', min: 0, max: 20, step: 1 },
    { k: 'shadow_opacity', label: 'Opacity', t: 'range', min: 0, max: 1, step: .05, fmt: v => Math.round(v * 100) + '%' }] },
  { title: 'Highlight box', show: () => S.style.style === 'pill', controls: [
    { k: 'box_fill', label: 'Filled', t: 'check' },
    { k: 'highlight_color', label: 'Fill color', t: 'color' },
    { k: 'box_stroke', label: 'Border', t: 'check' },
    { k: 'box_stroke_color', label: 'Border color', t: 'color' },
    { k: 'box_stroke_width', label: 'Border width', t: 'range', min: 1, max: 12, step: 1 },
    { k: 'border_radius', label: 'Corner radius', t: 'range', min: 0, max: 60, step: 1 },
    { k: 'pad_x', label: 'Padding X', t: 'range', min: 0, max: 60, step: 1 },
    { k: 'pad_y', label: 'Padding Y', t: 'range', min: 0, max: 40, step: 1 }] },
  { title: 'Active word', show: () => S.style.style === 'pop', controls: [
    { k: 'pop_color', label: 'Color', t: 'color' }] },
  { title: 'Pop animation', show: () => S.style.style === 'pill' || S.style.style === 'pop', controls: [
    { k: 'pop_scale', label: 'Pop scale', t: 'range', min: 1, max: 1.4, step: .01, fmt: v => Math.round(v * 100) + '%' },
    { k: 'pop_duration', label: 'Pop speed', t: 'range', min: 0, max: .35, step: .01, fmt: v => Math.round(v * 1000) + 'ms' }] },
];

function buildControls(host, sections, obj, onChange) {
  host.innerHTML = '';
  sections.forEach(sec => {
    const wrap = document.createElement('div');
    wrap.dataset.sec = sec.title;
    wrap.innerHTML = sec.title ? `<div class="sub">${sec.title}</div>` : '';
    sec.controls.forEach(c => {
      const row = document.createElement('div');
      row.className = 'row';
      const val = `<span class="val"></span>`;
      let input;
      if (c.t === 'select') {
        const select = `<select class="field" data-k="${c.k}">${c.opts.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('')}</select>`;
        input = c.searchable
          ? `<div><input class="field" type="search" placeholder="Search fonts..." aria-label="Search fonts" style="margin-bottom:5px">${select}</div>`
          : select;
      }
      else if (c.t === 'range') input = `<input type="range" data-k="${c.k}" min="${c.min}" max="${c.max}" step="${c.step}">`;
      else if (c.t === 'color') input = `<input type="color" data-k="${c.k}">`;
      else input = `<input type="checkbox" data-k="${c.k}">`;
      row.innerHTML = `<span>${c.label}</span><div>${input}</div>${c.t === 'range' ? val : '<span></span>'}`;
      const el = $('[data-k]', row);
      const search = c.searchable ? $('input[type="search"]', row) : null;
      const sync = () => { const v = $('.val', row); if (v) v.textContent = c.fmt ? c.fmt(obj[c.k]) : obj[c.k]; };
      if (c.t === 'check') el.checked = !!obj[c.k]; else el.value = obj[c.k];
      sync();
      if (search) search.addEventListener('input', () => {
        const query = search.value.toLowerCase();
        const matches = c.opts.filter(([value, label]) => `${value} ${label}`.toLowerCase().includes(query));
        el.replaceChildren();
        if (!matches.length) {
          const option = document.createElement('option');
          option.textContent = 'No matching fonts';
          option.disabled = true;
          option.selected = true;
          el.appendChild(option);
        } else {
          matches.forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            el.appendChild(option);
          });
          const selected = matches.find(([value]) => value === obj[c.k]) || matches[0];
          el.value = selected[0];
          obj[c.k] = selected[0];
        }
        onChange(c.k);
      });
      el.addEventListener('input', () => {
        obj[c.k] = c.t === 'check' ? el.checked : (c.t === 'range' ? parseFloat(el.value) : el.value);
        sync(); onChange(c.k);
      });
      c.el = el;
      wrap.appendChild(row);
    });
    sec.wrap = wrap;
    host.appendChild(wrap);
  });
  sections.forEach(s => { s.wrap.style.display = s.show() ? '' : 'none'; });
}

function refreshSectionVisibility() { SECTIONS.forEach(s => { s.wrap.style.display = s.show() ? '' : 'none'; }); }

/* ------------------------------------------------------------------ status / SSE */
let es = null;
const STAGE = { download: 'Downloading', transcribe: 'Transcribing', render: 'Rendering', upload: 'Uploading' };
function setStatus(stage, pct, msg, state = 'running') {
  $('#stLabel').textContent = STAGE[stage] || 'Status';
  $('#stBar').style.width = Math.round(pct * 100) + '%';
  $('#stBar').style.background = state === 'error' ? '#ff5c5c' : '#E50914';
  $('#stMsg').textContent = msg;
  $('#stMsg').style.color = state === 'error' ? '#ff8a8a' : '';
}

function track(jobId) {
  if (es && es.jobId === jobId) return;
  if (es) es.close();
  es = new EventSource(`/api/progress/${jobId}`);
  es.jobId = jobId;
  es.onmessage = e => onEvent(JSON.parse(e.data));
}

function onEvent(ev) {
  if (ev.stage === 'upload') return;
  setStatus(ev.stage, ev.pct, ev.msg, ev.state);
  const busy = ev.state === 'running';
  $('#go').disabled = busy || !S.job; $('#render').disabled = busy || !S.words.length;
  if (ev.state === 'error') { $('#go').disabled = !S.job; $('#render').disabled = !S.words.length; return; }
  if (ev.state !== 'done') return;
  if (ev.stage === 'download') initJob(ev.result);
  if (ev.stage === 'transcribe') { S.words = ev.result.words; rechunk().then(() => { $('#render').disabled = !S.words.length; }); }
  if (ev.stage === 'render') showResult(ev.result);
}

function showResult(r) {
  const el = $('#result');
  const i = r.info || {};
  const detail = i.pix_fmt ? `${i.codec} · ${i.pix_fmt} · ${i.size} · alpha ${i.alpha_ok ? 'verified' : 'NOT found'}` : `encoder ${i.encoder}`;
  el.className = 'mt-3 text-xs';
  if (desktopApi()) {
    el.innerHTML = `<div class="font-medium text-fg">${r.file}</div>
      <div class="text-mute mt-1">${detail}</div>
      <div class="flex flex-wrap gap-2 mt-2">
        <button class="btn !py-1 !px-2 text-xs" data-act="open">Open file</button>
        <button class="btn !py-1 !px-2 text-xs" data-act="reveal">Show in Explorer</button>
        <button class="btn !py-1 !px-2 text-xs" data-act="save">Save As…</button>
      </div>`;
    $('[data-act="open"]', el).onclick = () => desktopApi().open_export_file(r.file);
    $('[data-act="reveal"]', el).onclick = () => desktopApi().show_in_explorer(r.file);
    $('[data-act="save"]', el).onclick = async () => {
      const saved = await desktopApi().save_export_as(r.file);
      if (saved) setStatus('render', 1, `Saved copy to ${saved}`, 'done');
    };
  } else {
    el.innerHTML = `<a class="underline text-fg" href="${r.url}" download>${r.file}</a><div class="text-mute mt-1">${detail}</div><div class="text-mute">Saved in the exports folder.</div>`;
  }
  $('#render').disabled = false;
}

/* ------------------------------------------------------------------ job init + media playback */
const vid = $('#srcVideo');
const layCanvas = $('#layCanvas');
const layCtx = layCanvas.getContext('2d');
const HOLD_SEC = 0.2;
let isScrubbing = false, wasPlayingBeforeScrub = false, playLoopId = null, triedProxy = false;
let sampleTimer = null;

function fmtClock(s) {
  const v = Math.max(0, Number(s) || 0);
  const m = Math.floor(v / 60);
  return `${m}:${(v - m * 60).toFixed(1).padStart(4, '0')}`;
}

function updateTimeUI(t) {
  const dur = S.job ? (S.job.meta.duration || vid.duration || 0) : 0;
  S.t = Math.max(0, Math.min(dur || 0, t));
  if (!isScrubbing) $('#scrub').value = S.t;
  $('#scrubVal').textContent = `${fmtClock(S.t)} / ${fmtClock(dur)}`;
}

function setPlayLabels() {
  const playing = S.job ? !vid.paused : Boolean(sampleTimer);
  $('#playPause').textContent = playing ? 'Pause' : 'Play';
  $('#playBtn').textContent = playing ? (S.job ? 'Pause' : 'Stop') : (S.job ? 'Play' : 'Play words');
}

function stopSampleLoop() {
  if (sampleTimer) {
    clearInterval(sampleTimer);
    sampleTimer = null;
    if (!S.job) refreshLivePreview(S.phrases.length ? S.selPhrase : -1, S.selWord, false, null);
  }
  setPlayLabels();
}

function startPlaybackLoop() {
  if (playLoopId) return;
  const tick = () => {
    if (!S.job || vid.paused || vid.ended) {
      playLoopId = null;
      setPlayLabels();
      return;
    }
    const t = vid.currentTime || 0;
    updateTimeUI(t);
    drawLayoutFrame();
    syncSubtitleToTime(t, true);
    playLoopId = requestAnimationFrame(tick);
  };
  playLoopId = requestAnimationFrame(tick);
}

function seekTo(t) {
  if (!S.job) return;
  const dur = S.job.meta.duration || vid.duration || 0;
  const clamped = Math.max(0, Math.min(dur, t));
  updateTimeUI(clamped);
  if (vid.readyState >= 1) vid.currentTime = clamped;
  drawLayoutFrame();
  syncSubtitleToTime(clamped, false);
}

function togglePlay() {
  if (!S.job) {
    if (sampleTimer) { stopSampleLoop(); return; }
    setPlayLabels();
    let sampleElapsed = 0;
    sampleTimer = setInterval(() => {
      sampleElapsed += 33 / 1000;
      const ph = S.phrases[S.selPhrase] || { words: SAMPLE };
      if (sampleElapsed >= 0.45) {
        S.selWord = (S.selWord + 1) % ph.words.length;
        sampleElapsed = 0;
      }
      const animT = quantizeAnimT(sampleElapsed);
      refreshLivePreview(
        S.phrases.length ? S.selPhrase : -1,
        S.selWord,
        true,
        animT
      );
    }, 33);
    setPlayLabels();
    return;
  }
  stopSampleLoop();
  if (vid.paused) {
    if (vid.ended || (S.job.meta.duration && vid.currentTime >= S.job.meta.duration - 0.05)) {
      vid.currentTime = 0;
    }
    vid.play().then(() => { setPlayLabels(); startPlaybackLoop(); }).catch(() => {});
  } else {
    vid.pause();
    setPlayLabels();
  }
}

function initJob(job) {
  stopSampleLoop();
  S.job = job; S.words = job.words || [];
  S.reframe = false;
  $('#reframeToggle').checked = false;
  $('#reframeToggle').disabled = job.kind !== 'video';
  updateReframeUI();
  drawLayoutFrame();
  triedProxy = false;
  const m = job.meta, isVideo = job.kind === 'video';
  $('#jobname').textContent = `${job.name} · ${m.duration.toFixed(1)}s${isVideo ? ` · ${m.width}×${m.height} · ${m.fps.toFixed(2)} fps` : ' · audio'}`;
  $('#go').disabled = false;
  $('#cropPanel').classList.toggle('opacity-60', !isVideo);
  $('#frameWrap').classList.toggle('hidden', !isVideo);
  $('#audioNote').classList.toggle('hidden', isVideo);
  $$('#layouts button').forEach(b => { b.disabled = !isVideo; });
  $$('#modes button[data-m=mp4]').forEach(b => { b.disabled = !isVideo; });
  if (!isVideo) { setMode('mov'); S.showVideo = false; }
  else { setMode('mp4'); S.showVideo = true; }
  updateBgToggle();
  track(job.job_id);

  ['#playPause', '#skipBack', '#skipFwd', '#scrub', '#muteBtn', '#vol'].forEach(sel => { $(sel).disabled = false; });
  $('#scrub').max = Math.max(m.duration || 0, 0.1);
  S.t = isVideo ? Math.min(m.duration * .1, 5) : 0;
  updateTimeUI(S.t);

  if (isVideo) applyLayoutDefaults(true);
  vid.pause();
  vid.src = `/api/jobs/${job.job_id}/media`;
  vid.load();
  schedulePreviewResize();
  setPlayLabels();
  invalidateOverlayCache();
  rechunk();
}

vid.addEventListener('loadedmetadata', () => {
  if (!S.job) return;
  if (S.t > 0 && Math.abs((vid.currentTime || 0) - S.t) > 0.05) vid.currentTime = S.t;
  schedulePreviewResize();
  drawLayoutFrame();
});
vid.addEventListener('loadeddata', () => { drawLayoutFrame(); });
vid.addEventListener('seeked', () => { drawLayoutFrame(); });
vid.addEventListener('ended', () => { setPlayLabels(); syncSubtitleToTime(vid.currentTime || 0, false); });
vid.addEventListener('play', () => { setPlayLabels(); startPlaybackLoop(); });
vid.addEventListener('pause', () => { setPlayLabels(); });
vid.addEventListener('error', async () => {
  if (!S.job || triedProxy) return;
  triedProxy = true;
  try {
    setStatus('upload', 0.4, 'preparing playable preview');
    const res = await (await api(`/api/jobs/${S.job.job_id}/proxy`, {})).json();
    vid.src = res.url;
    vid.load();
    setStatus('upload', 1, 'ready');
  } catch (e) {
    setStatus('upload', 0, 'Preview playback unavailable for this codec (export still works)', 'error');
  }
});

/* ------------------------------------------------------------------ sources */
$$('#srcTabs button').forEach(b => b.onclick = () => {
  $$('#srcTabs button').forEach(x => x.setAttribute('aria-pressed', x === b));
  $('#tab-file').classList.toggle('hidden', b.dataset.tab !== 'file');
  $('#tab-yt').classList.toggle('hidden', b.dataset.tab !== 'yt');
});

function desktopApi() {
  return window.pywebview && window.pywebview.api ? window.pywebview.api : null;
}

async function openLocalPath(path) {
  try {
    setStatus('upload', 0.2, 'loading media');
    const job = await (await api('/api/open-local', { path })).json();
    setStatus('upload', 1, 'ready');
    initJob(job);
  } catch (e) { setStatus('upload', 0, e.message, 'error'); }
}

function upload(file) {
  const fd = new FormData(); fd.append('file', file);
  const x = new XMLHttpRequest();
  x.open('POST', '/api/upload');
  x.upload.onprogress = e => setStatus('upload', e.loaded / e.total, `uploading ${Math.round(e.loaded / e.total * 100)}%`);
  x.onload = () => {
    if (x.status === 200) { setStatus('upload', 1, 'ready'); initJob(JSON.parse(x.responseText)); }
    else { let m = x.responseText; try { m = JSON.parse(m).detail; } catch { /* plain */ } setStatus('upload', 0, m, 'error'); }
  };
  x.onerror = () => setStatus('upload', 0, 'Upload failed. Is the server still running?', 'error');
  x.send(fd);
}
$('#file').onchange = e => e.target.files[0] && upload(e.target.files[0]);
const drop = $('#drop');
drop.addEventListener('click', async e => {
  const d = desktopApi();
  if (!d) return;
  e.preventDefault();
  const path = await d.pick_media_file();
  if (path) openLocalPath(path);
});
['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.style.borderColor = '#E50914'; }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.style.borderColor = ''; }));
drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) upload(f); });

$('#ytFetch').onclick = async () => {
  try {
    setStatus('download', 0, 'looking up link');
    const i = await (await api('/api/youtube/info', { url: $('#ytUrl').value.trim() })).json();
    $('#ytInfo').classList.remove('hidden'); $('#ytThumb').src = i.thumbnail || '';
    $('#ytTitle').textContent = i.title || ''; $('#ytMeta').textContent = `${i.uploader || ''} · ${Math.round((i.duration || 0) / 60)} min`;
    S.ytTitle = i.title; setStatus('download', 0, 'Link found. Press Download.');
  } catch (e) { setStatus('download', 0, e.message, 'error'); }
};
$('#ytGo').onclick = async () => {
  try {
    const r = await (await api('/api/youtube/download', { url: $('#ytUrl').value.trim(), audio_only: $('#ytAudio').checked, title: S.ytTitle })).json();
    track(r.job_id); setStatus('download', 0, 'starting download');
  } catch (e) { setStatus('download', 0, e.message, 'error'); }
};

$('#go').onclick = async () => {
  try {
    const model = $('#model').value === '__other__' ? $('#modelOther').value.trim() : $('#model').value;
    if (!model) { setStatus('transcribe', 0, 'Enter a model folder or repo id first.', 'error'); return; }
    await api(`/api/jobs/${S.job.job_id}/transcribe`, { model, language: $('#lang').value });
    $('#go').disabled = true; setStatus('transcribe', 0, 'starting');
  } catch (e) { setStatus('transcribe', 0, e.message, 'error'); }
};

/* ------------------------------------------------------------------ layouts + crop boxes */
const ASPECT = () => ({
  split50: { face: 1080 / 960, main: 1080 / 960 }, split35: { face: 1080 / 672, main: 1080 / 1248 },
  pip: { face: 1, main: 1080 / 1920 }, single: { face: null, main: S.blur ? null : 1080 / 1920 },
}[S.layout]);

const clampBox = b => {
  b.w = Math.min(b.w, 1); b.h = Math.min(b.h, 1);
  b.x = Math.max(0, Math.min(1 - b.w, b.x)); b.y = Math.max(0, Math.min(1 - b.h, b.y)); return b;
};
function fitBox(b, ar) {
  if (!ar || !S.job) return clampBox({ ...b });
  const { width: SW, height: SH } = S.job.meta, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  let w = b.w, h = w * SW / (SH * ar);
  if (h > 1) { h = 1; w = h * SH * ar / SW; }
  return clampBox({ x: cx - w / 2, y: cy - h / 2, w, h });
}

function applyLayoutDefaults(reset = false) {
  const a = ASPECT();
  if (reset) { S.main = { x: .2, y: 0, w: .6, h: 1 }; S.face = { x: .66, y: .5, w: .3, h: .45 }; }
  S.main = a.main ? fitBox(S.main, a.main) : (S.blur ? { x: 0, y: 0, w: 1, h: 1 } : S.main);
  if (a.face) S.face = fitBox(S.face, a.face);
  $('#boxMain').style.display = S.reframe ? '' : 'none';
  $('#boxFace').style.display = S.reframe && a.face ? '' : 'none';
  drawBoxes();
}

function drawBoxes() {
  [['#boxMain', S.main], ['#boxFace', S.face]].forEach(([sel, b]) => {
    const el = $(sel);
    el.style.left = b.x * 100 + '%'; el.style.top = b.y * 100 + '%'; el.style.width = b.w * 100 + '%'; el.style.height = b.h * 100 + '%';
  });
}

function setupBox(el, key) {
  el.addEventListener('pointerdown', e => {
    if (!S.job) return;
    e.preventDefault(); el.setPointerCapture(e.pointerId);
    const rect = $('#srcVideo').getBoundingClientRect();
    const corner = e.target.dataset.c, start = { ...S[key] }, sx = e.clientX, sy = e.clientY;
    const ar = ASPECT()[key], { width: SW, height: SH } = S.job.meta;
    const move = ev => {
      const dx = (ev.clientX - sx) / rect.width, dy = (ev.clientY - sy) / rect.height;
      if (!corner) {
        S[key] = clampBox({ ...start, x: start.x + dx, y: start.y + dy });
      } else {
        const ax = corner.includes('w') ? start.x + start.w : start.x;      // fixed (opposite) corner
        const ay = corner.includes('n') ? start.y + start.h : start.y;
        const px = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        const py = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
        let w = Math.abs(px - ax), h = Math.abs(py - ay);
        const roomW = px < ax ? ax : 1 - ax, roomH = py < ay ? ay : 1 - ay;
        if (ar) {
          h = w * SW / (SH * ar);
          const k = Math.min(1, roomW / Math.max(w, 1e-6), roomH / Math.max(h, 1e-6));
          w *= k; h *= k;
        } else { w = Math.min(w, roomW); h = Math.min(h, roomH); }
        w = Math.max(w, .04); h = Math.max(h, .04);
        S[key] = { x: px < ax ? ax - w : ax, y: py < ay ? ay - h : ay, w, h };
      }
      drawBoxes(); drawLayoutFrame();
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
  });
}
setupBox($('#boxMain'), 'main'); setupBox($('#boxFace'), 'face');

let previewResizePending = false;
function schedulePreviewResize() {
  if (previewResizePending) return;
  previewResizePending = true;
  requestAnimationFrame(() => {
    previewResizePending = false;
    fitPreviewPanes();
  });
}

function fitPreviewPanes() {
  const cropPanel = $('#cropPanel');
  const frame = $('#frameWrap');
  const frameStyle = getComputedStyle(cropPanel);
  const frameWidth = Math.max(0, cropPanel.clientWidth
    - parseFloat(frameStyle.paddingLeft) - parseFloat(frameStyle.paddingRight));
  const sourceWidth = (S.job && S.job.meta.width) || vid.videoWidth || 16;
  const sourceHeight = (S.job && S.job.meta.height) || vid.videoHeight || 9;
  const sourceAspect = sourceWidth / sourceHeight;
  const frameHeight = Math.min(window.innerHeight * 0.42, 420);
  const fittedFrameWidth = Math.min(frameWidth, frameHeight * sourceAspect);
  if (fittedFrameWidth > 0) {
    frame.style.width = `${fittedFrameWidth}px`;
    frame.style.height = `${fittedFrameWidth / sourceAspect}px`;
    frame.style.aspectRatio = `${sourceWidth} / ${sourceHeight}`;
  }

  const outputPanel = $('#outputPanel');
  const outputStyle = getComputedStyle(outputPanel);
  const outputWidth = Math.max(0, outputPanel.clientWidth
    - parseFloat(outputStyle.paddingLeft) - parseFloat(outputStyle.paddingRight));
  const outputHeight = Math.min(window.innerHeight * 0.27, 520);
  const stageWidth = Math.min(outputWidth, 320, outputHeight * 9 / 16);
  if (stageWidth > 0) $('#stage').style.width = `${stageWidth}px`;
}

const previewResizeObserver = new ResizeObserver(schedulePreviewResize);
previewResizeObserver.observe($('#cropPanel'));
previewResizeObserver.observe($('#outputPanel'));
window.addEventListener('resize', schedulePreviewResize, { passive: true });
schedulePreviewResize();

function setLayout(l) {
  S.layout = l;
  $$('#layouts button').forEach(b => b.setAttribute('aria-pressed', b.dataset.l === l));
  $('#pipOpts').classList.toggle('hidden', l !== 'pip');
  $('#blurOpt').classList.toggle('hidden', l !== 'single'); $('#blurOpt').classList.toggle('flex', l === 'single');
  applyLayoutDefaults(); drawLayoutFrame();
}
function updateReframeUI() {
  $('#framingPanel').classList.toggle('hidden', !S.reframe);
  $('#cropHelp').classList.toggle('hidden', !S.reframe);
  if ($('#boxMain')) $('#boxMain').style.display = S.reframe ? '' : 'none';
  if ($('#boxFace')) $('#boxFace').style.display = S.reframe && ASPECT().face ? '' : 'none';
  schedulePreviewResize();
}
function setReframe(enabled) {
  S.reframe = Boolean(enabled && S.job && S.job.kind === 'video');
  $('#reframeToggle').checked = S.reframe;
  updateReframeUI();
  if (S.reframe) applyLayoutDefaults();
  drawLayoutFrame();
}
$('#reframeToggle').onchange = e => setReframe(e.target.checked);
$$('#layouts button').forEach(b => b.onclick = () => setLayout(b.dataset.l));
$$('#corners button').forEach(b => b.onclick = () => {
  S.pip = b.dataset.c; $$('#corners button').forEach(x => x.setAttribute('aria-pressed', x === b)); drawLayoutFrame();
});
$('#blur').onchange = e => { S.blur = e.target.checked; applyLayoutDefaults(); drawLayoutFrame(); };

/* Transport + smooth scrubbing */
$('#playPause').onclick = togglePlay;
$('#playBtn').onclick = togglePlay;
$('#skipBack').onclick = () => seekTo((vid.currentTime || S.t) - 2);
$('#skipFwd').onclick = () => seekTo((vid.currentTime || S.t) + 2);
$('#muteBtn').onclick = () => {
  vid.muted = !vid.muted;
  $('#muteBtn').textContent = vid.muted ? 'Muted' : '🔊';
};
$('#vol').oninput = e => {
  vid.volume = parseFloat(e.target.value);
  if (vid.volume > 0 && vid.muted) { vid.muted = false; $('#muteBtn').textContent = 'Vol'; }
};

const scrub = $('#scrub');
scrub.addEventListener('pointerdown', () => {
  if (!S.job) return;
  isScrubbing = true;
  wasPlayingBeforeScrub = !vid.paused;
  if (wasPlayingBeforeScrub) vid.pause();
});
scrub.addEventListener('input', () => {
  if (!S.job) return;
  seekTo(parseFloat(scrub.value));
});
const finishScrub = () => {
  if (!isScrubbing) return;
  isScrubbing = false;
  if (wasPlayingBeforeScrub && S.job) {
    vid.play().then(() => { setPlayLabels(); startPlaybackLoop(); }).catch(() => {});
  }
};
scrub.addEventListener('pointerup', finishScrub);
scrub.addEventListener('change', finishScrub);

document.addEventListener('keydown', e => {
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if (e.code === 'ArrowLeft' && S.job) { e.preventDefault(); seekTo((vid.currentTime || S.t) - 2); }
  else if (e.code === 'ArrowRight' && S.job) { e.preventDefault(); seekTo((vid.currentTime || S.t) + 2); }
});

/* ------------------------------------------------------------------ live 60fps canvas layout + cached subtitle sync */
function drawCover(box, dx, dy, dw, dh) {
  const sw = vid.videoWidth, sh = vid.videoHeight;
  if (!sw || !sh || vid.readyState < 2) return;
  const sx = Math.max(0, Math.min(sw - 2, box.x * sw));
  const sy = Math.max(0, Math.min(sh - 2, box.y * sh));
  const cw = Math.max(2, Math.min(sw - sx, box.w * sw));
  const ch = Math.max(2, Math.min(sh - sy, box.h * sh));
  const scale = Math.max(dw / cw, dh / ch);
  const srcW = dw / scale, srcH = dh / scale;
  const cropX = sx + (cw - srcW) / 2;
  const cropY = sy + (ch - srcH) / 2;
  layCtx.drawImage(vid, cropX, cropY, srcW, srcH, dx, dy, dw, dh);
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawLayoutFrame() {
  const show = Boolean(S.reframe && S.job && S.job.kind === 'video' && S.showVideo);
  layCanvas.classList.toggle('hidden', !show);
  if (!show || vid.readyState < 2 || !vid.videoWidth) return;

  const CW = 540, CH = 960;
  layCtx.clearRect(0, 0, CW, CH);

  if (S.layout === 'split50' || S.layout === 'split35') {
    const topH = S.layout === 'split50' ? 480 : 336;
    drawCover(S.face, 0, 0, CW, topH);
    drawCover(S.main, 0, topH, CW, CH - topH);
    return;
  }

  if (S.layout === 'pip') {
    drawCover(S.main, 0, 0, CW, CH);
    const fw = 162, m = 24, b = 3, r = 14;
    const pos = {
      tl: [m, m + 40],
      tr: [CW - fw - m, m + 40],
      bl: [m, CH - fw - m - 100],
      br: [CW - fw - m, CH - fw - m - 100],
    }[S.pip];
    layCtx.fillStyle = '#ffffff';
    roundRectPath(layCtx, pos[0] - b, pos[1] - b, fw + b * 2, fw + b * 2, r + b);
    layCtx.fill();
    layCtx.save();
    roundRectPath(layCtx, pos[0], pos[1], fw, fw, r);
    layCtx.clip();
    drawCover(S.face, pos[0], pos[1], fw, fw);
    layCtx.restore();
    return;
  }

  if (S.blur) {
    layCtx.save();
    layCtx.filter = 'blur(20px) brightness(0.92)';
    drawCover({ x: 0, y: 0, w: 1, h: 1 }, -24, -24, CW + 48, CH + 48);
    layCtx.restore();
    const sw = vid.videoWidth, sh = vid.videoHeight;
    const sx = Math.max(0, Math.min(sw - 2, S.main.x * sw));
    const sy = Math.max(0, Math.min(sh - 2, S.main.y * sh));
    const cw = Math.max(2, Math.min(sw - sx, S.main.w * sw));
    const ch = Math.max(2, Math.min(sh - sy, S.main.h * sh));
    const dh = Math.max(2, Math.round(CW * ch / cw / 2) * 2);
    const dy = (CH - dh) / 2;
    layCtx.drawImage(vid, sx, sy, cw, ch, 0, dy, CW, dh);
    return;
  }

  drawCover(S.main, 0, 0, CW, CH);
}

function updateBgToggle() {
  $('#bgToggle').textContent = S.showVideo ? 'Hide video' : 'Show video';
  $('#bgToggle').disabled = !S.job || S.job.kind !== 'video';
  drawLayoutFrame();
}
$('#bgToggle').onclick = () => { S.showVideo = !S.showVideo; updateBgToggle(); };

let ovlVer = 0, ovlController = null, ovlTargetKey = '', ovlActiveKey = '';
let overlayRefreshTimer = null;
const ovlCache = new Map();

function quantizeAnimT(elapsed) {
  const duration = Number(S.style.pop_duration || 0);
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= duration || duration <= 0) return null;
  return Math.round(elapsed * 30) / 30;
}

function cancelOverlayRender() {
  if (ovlController) ovlController.abort();
  ovlController = null;
  ovlTargetKey = '';
}

function invalidateOverlayCache(immediate = false) {
  ovlVer++;
  cancelOverlayRender();
  ovlActiveKey = '';
  for (const url of ovlCache.values()) { if (url) URL.revokeObjectURL(url); }
  ovlCache.clear();
  if (immediate) refreshLivePreview();
  else scheduleOverlay();
}

function setOverlayBlob(url) {
  if (!url) {
    $('#ovl').classList.add('hidden');
  } else {
    $('#ovl').classList.remove('hidden');
    if ($('#ovl').src !== url) $('#ovl').src = url;
  }
}

function overlayStateKey(pi, wi, ver, animT = null) {
  const ph = S.phrases[pi];
  const active = ph ? Math.max(0, Math.min(wi, ph.words.length - 1)) : Math.max(0, Math.min(S.selWord, SAMPLE.length - 1));
  return `${ver}:${ph ? pi : 'sample'}:${active}:${animT === null ? 'static' : animT.toFixed(4)}`;
}

async function fetchOverlayState(pi, wi, ver, signal, animT = null) {
  const ph = S.phrases[pi];
  const words = ph ? ph.words : SAMPLE;
  const active = ph ? Math.max(0, Math.min(wi, ph.words.length - 1)) : Math.max(0, Math.min(S.selWord, SAMPLE.length - 1));
  const key = overlayStateKey(pi, wi, ver, animT);
  if (ovlCache.has(key)) return { key, url: ovlCache.get(key) };
  const blob = await (await api('/api/preview', { words, active, style: S.style, anim_t: animT }, 'POST', signal)).blob();
  const url = URL.createObjectURL(blob);
  if (signal.aborted || ver !== ovlVer) { URL.revokeObjectURL(url); return null; }
  if (ovlCache.size >= 240) {
    const oldest = ovlCache.keys().next().value;
    URL.revokeObjectURL(ovlCache.get(oldest));
    ovlCache.delete(oldest);
  }
  ovlCache.set(key, url);
  return { key, url };
}

function prefetchNextStates(pi, wi, ver, signal, animT = null) {
  if (S.phrases.length) {
    let p = pi, w = wi;
    for (let step = 0; step < 4; step++) {
      w++;
      if (w >= S.phrases[p].words.length) { p++; w = 0; }
      if (p >= S.phrases.length) break;
      const key = overlayStateKey(p, w, ver, null);
      if (!ovlCache.has(key)) fetchOverlayState(p, w, ver, signal, null).catch(() => {});
    }
  }
  if (animT !== null) {
    const duration = Number(S.style.pop_duration || 0);
    for (let step = 1; step <= 30; step++) {
      const nextT = step / 30;
      if (nextT >= duration) break;
      const quantized = quantizeAnimT(nextT);
      if (quantized === null) continue;
      const key = overlayStateKey(pi, wi, ver, quantized);
      if (!ovlCache.has(key)) fetchOverlayState(pi, wi, ver, signal, quantized).catch(() => {});
    }
  }
}

async function renderTargetState(pi, wi, playing = !vid.paused, animT = null) {
  const ver = ovlVer;
  const key = overlayStateKey(pi, wi, ver, animT);
  if (ovlActiveKey === key || ovlTargetKey === key) return;
  cancelOverlayRender();
  const controller = new AbortController();
  ovlController = controller;
  ovlTargetKey = key;
  let succeeded = false;
  try {
    const res = await fetchOverlayState(pi, wi, ver, controller.signal, animT);
    if (!res || controller.signal.aborted || ver !== ovlVer) return;
    ovlActiveKey = res.key;
    setOverlayBlob(res.url);
    succeeded = true;
    if (S.phrases[pi] && playing) prefetchNextStates(pi, wi, ver, controller.signal, animT);
  } catch (e) {
    if (e.name !== 'AbortError') setStatus('render', 0, e.message, 'error');
  }
  if (!succeeded && ovlController === controller) {
    ovlController = null;
    ovlTargetKey = '';
  }
}

function refreshLivePreview(pi, wi, playing, animT = null) {
  if (overlayRefreshTimer !== null) clearTimeout(overlayRefreshTimer);
  overlayRefreshTimer = null;
  if (pi === undefined) {
    pi = S.phrases.length ? Math.min(S.selPhrase, S.phrases.length - 1) : -1;
    wi = S.phrases.length && pi >= 0 ? Math.min(S.selWord, S.phrases[pi].words.length - 1) : S.selWord;
  }
  renderTargetState(pi, wi, playing, animT);
}

function scheduleOverlay() {
  if (overlayRefreshTimer !== null) clearTimeout(overlayRefreshTimer);
  overlayRefreshTimer = setTimeout(() => {
    overlayRefreshTimer = null;
    refreshLivePreview();
  }, 35);
}

function findTimelineState(t) {
  for (let pi = 0; pi < S.phrases.length; pi++) {
    const ws = S.phrases[pi].words;
    const nxt = pi + 1 < S.phrases.length ? S.phrases[pi + 1].words[0].start : Infinity;
    for (let wi = 0; wi < ws.length; wi++) {
      const w = ws[wi];
      const t1 = wi + 1 < ws.length ? ws[wi + 1].start : Math.min(w.end + HOLD_SEC, nxt);
      if (t >= w.start && t < t1) return { pi, wi };
    }
  }
  return null;
}

function updateActiveTranscriptMarks(pi, wi) {
  $$('.prow').forEach((r, idx) => {
    const isAct = idx === pi;
    r.classList.toggle('active', isAct);
    if (isAct) r.classList.add('sel');
    else r.classList.toggle('sel', idx === S.selPhrase);
  });
  $$('.wc.active').forEach(el => el.classList.remove('active'));
  if (pi >= 0 && wi >= 0) {
    const row = $$('.prow')[pi];
    const chip = row ? $$('.wc', row)[wi] : null;
    if (chip) chip.classList.add('active');
    // auto-scroll active phrase into view during playback (not on user click)
    if (row && !isScrubbing && !vid.paused) {
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
}

function syncSubtitleToTime(t, playing) {
  if (!S.phrases.length) {
    updateActiveTranscriptMarks(-1, -1);
    cancelOverlayRender();
    ovlActiveKey = '';
    setOverlayBlob(null);
    return;
  }
  const hit = findTimelineState(t);
  if (!hit) {
    updateActiveTranscriptMarks(-1, -1);
    cancelOverlayRender();
    ovlActiveKey = '';
    setOverlayBlob(null);
    return;
  }

  S.selPhrase = hit.pi;
  S.selWord = hit.wi;
  updateActiveTranscriptMarks(hit.pi, hit.wi);

  const animT = playing ? quantizeAnimT(t - S.phrases[hit.pi].words[hit.wi].start) : null;
  const key = overlayStateKey(hit.pi, hit.wi, ovlVer, animT);
  if (ovlActiveKey === key) return;
  refreshLivePreview(hit.pi, hit.wi, playing, animT);
}

/* ------------------------------------------------------------------ chunking + transcript grid */
async function rechunk() {
  if (!S.words.length) { S.phrases = []; renderGrid(); invalidateOverlayCache(); return; }
  try {
    S.phrases = (await (await api('/api/chunk', { words: S.words, chunk: S.chunk })).json()).phrases;
    S.selPhrase = Math.min(S.selPhrase, S.phrases.length - 1);
    renderGrid();
    ovlVer++;
    ovlActiveKey = '';
    for (const url of ovlCache.values()) { if (url) URL.revokeObjectURL(url); }
    ovlCache.clear();
    if (S.job) syncSubtitleToTime(vid.currentTime || S.t, !vid.paused);
    else scheduleOverlay();
  } catch (e) { setStatus('render', 0, e.message, 'error'); }
}
const scheduleChunk = debounce(rechunk, 45);

const tfmt = s => { const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`; };
function selectWord(pi, wi, seek = false) {
  S.selPhrase = pi; S.selWord = wi;
  $$('.prow').forEach((r, i) => r.classList.toggle('sel', i === pi));
  if (seek && S.job && S.phrases[pi]?.words[wi]) {
    const w = S.phrases[pi].words[wi];
    seekTo(w.start + Math.min(0.01, Math.max(0, (w.end - w.start) / 2)));
  } else {
    scheduleOverlay();
  }
}

function renderGrid() {
  const g = $('#grid'); g.innerHTML = '';
  $('#gridInfo').textContent = S.words.length ? `${S.words.length} words · ${S.phrases.length} phrases. Edit text or timing, no need to transcribe again.` : 'No transcript yet';
  S.phrases.forEach((p, pi) => {
    const row = document.createElement('div');
    row.className = 'prow' + (pi === S.selPhrase ? ' sel' : '');
    const head = document.createElement('button');
    head.className = 'text-xs text-mute mb-2 hover:text-fg'; head.textContent = `${tfmt(p.start)} to ${tfmt(p.end)}`;
    head.onclick = () => { selectWord(pi, 0, true); };
    const cells = document.createElement('div'); cells.className = 'flex flex-wrap gap-2';
    p.words.forEach((w, wi) => {
      const c = document.createElement('div'); c.className = 'wc';
      c.innerHTML = `<input class="w" aria-label="Word" value="${w.w.replace(/"/g, '&quot;')}" size="${Math.max(4, w.w.length)}">
        <div class="flex items-center"><input class="t" aria-label="Start seconds" type="number" step="0.01" value="${w.start}"><input class="t" aria-label="End seconds" type="number" step="0.01" value="${w.end}"><button class="text-mute hover:text-fg px-1" title="Delete word" aria-label="Delete word">×</button></div>`;
      const [tw, ts, te] = $$('input', c);
      c.addEventListener('focusin', () => selectWord(pi, wi, vid.paused));
      tw.oninput = () => {
        const txt = tw.value.trim();
        if (txt) {
          S.words[w.i].w = w.w = txt;
          tw.size = Math.max(4, txt.length);
          invalidateOverlayCache();
        }
      };
      tw.onchange = () => { S.words[w.i].w = w.w = tw.value.trim(); if (!w.w) delWord(w.i); else { tw.size = Math.max(4, w.w.length); invalidateOverlayCache(); } };
      const timeChange = () => {
        const s0 = parseFloat(ts.value), s1 = parseFloat(te.value);
        if (Number.isFinite(s0)) S.words[w.i].start = w.start = s0;
        if (Number.isFinite(s1)) S.words[w.i].end = w.end = s1;
        const sorted = S.words.every((x, k) => !k || x.start >= S.words[k - 1].start);
        if (!sorted) { S.words.sort((a, b) => a.start - b.start); rechunk(); }
        else if (S.job) { syncSubtitleToTime(vid.currentTime || S.t, !vid.paused); }
      };
      ts.oninput = timeChange; te.oninput = timeChange;
      $('button', c).onclick = () => delWord(w.i);
      cells.appendChild(c);
    });
    row.append(head, cells); g.appendChild(row);
  });
}
function delWord(i) { S.words.splice(i, 1); rechunk(); }

/* ------------------------------------------------------------------ export */
function setMode(m) {
  S.mode = m;
  $$('#modes button').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === m));
}
$$('#modes button').forEach(b => b.onclick = () => setMode(b.dataset.m));

$('#render').onclick = async () => {
  try {
    $('#result').classList.add('hidden'); $('#render').disabled = true;
    S.words.sort((a, b) => a.start - b.start);
    await api(`/api/jobs/${S.job.job_id}/render`, {
      mode: S.mode, words: S.words, chunk: S.chunk, style: S.style, layout: S.layout,
      reframe: S.reframe, main_crop: S.main, face_crop: S.face, pip_corner: S.pip, blur_bg: S.blur });
    track(S.job.job_id); setStatus('render', 0, 'starting render');
  } catch (e) { setStatus('render', 0, e.message, 'error'); $('#render').disabled = false; }
};

/* ------------------------------------------------------------------ custom models */
async function loadModels() {
  const sel = $('#model');
  try {
    const m = await (await api('/api/models', null, 'GET')).json();
    m.custom.forEach(n => sel.add(new Option(`Custom: ${n}`, n)));
    $('#modelHint').textContent = `Needs a CTranslate2 (faster-whisper) model. Put model folders in: ${m.folder} (reload the page to list them).`;
  } catch { /* models list is optional */ }
  sel.add(new Option('Other folder or Hugging Face repo…', '__other__'));
  sel.onchange = () => {
    const other = sel.value === '__other__';
    $('#modelOtherRow').classList.toggle('hidden', !other); $('#modelHint').classList.toggle('hidden', !other);
  };
}

function enableDesktopUI() {
  const d = desktopApi();
  if (!d) return;
  initUpdaterUI(d);
  $('#openExportsBtn').classList.remove('hidden');
  $('#openExportsBtn').onclick = () => d.open_exports_folder();
  $('#modelBrowse').classList.remove('hidden');
  $('#modelBrowse').onclick = async () => {
    const dir = await d.pick_model_folder();
    if (dir) $('#modelOther').value = dir;
  };
}

function initUpdaterUI(d) {
  const area = $('#updateArea');
  const button = $('#updateBtn');
  const statusText = $('#updateStatus');
  area.classList.remove('hidden');
  if (button.dataset.bound) return;
  button.dataset.bound = 'true';
  let restartPrompted = false;

  async function refresh() {
    try {
      const status = await d.get_update_status();
      statusText.textContent = status.message;
      statusText.classList.toggle('is-error', status.state === 'error');
      button.disabled = ['checking', 'downloading', 'applying', 'installing'].includes(status.state);
      button.textContent = status.state === 'available' ? 'Install Update'
        : status.state === 'staged' ? 'Restart to Finish' : 'Check for Updates';
      if (status.state === 'staged' && !restartPrompted) {
        restartPrompted = true;
        if (window.confirm('The update is ready. Restart Subtitle Studio now?')) {
          await d.restart_after_update();
        }
      }
    } catch (error) {
      statusText.textContent = `Update status unavailable: ${error.message}`;
      statusText.classList.add('is-error');
    }
  }

  button.onclick = async () => {
    try {
      const status = await d.get_update_status();
      if (status.state === 'staged') {
        if (window.confirm('Restart Subtitle Studio to finish the update?')) {
          await d.restart_after_update();
        }
      } else if (status.state === 'available') {
        await d.stage_update();
      } else {
        await d.check_for_updates();
      }
      await refresh();
    } catch (error) {
      statusText.textContent = `Update failed: ${error.message}`;
      statusText.classList.add('is-error');
    }
  };
  refresh();
  window.setInterval(refresh, 1500);
}
window.addEventListener('pywebviewready', enableDesktopUI);

/* ------------------------------------------------------------------ boot */
(async function boot() {
  loadModels();
  const health = await (await api('/api/health', null, 'GET')).json();
  $('#appVersion').textContent = 'v' + health.version;
  const meta = await (await api('/api/fonts', null, 'GET')).json();
  let saved = {}; try { saved = JSON.parse(localStorage.getItem('subgen.style') || '{}'); } catch { /* ignore */ }
  S.style = { ...meta.default_style, ...saved };
  if (!meta.fonts.includes(S.style.font)) S.style.font = meta.fonts[0] || S.style.font;
  SECTIONS[1].controls[0].opts = meta.fonts.map(f => [f, f.replace(/-/g, ' ')]);
  buildControls($('#styleControls'), SECTIONS, S.style, k => {
    if (k === 'style') refreshSectionVisibility();
    localStorage.setItem('subgen.style', JSON.stringify(S.style));
    invalidateOverlayCache(['style', 'font', 'uppercase', 'box_fill', 'box_stroke',
      'pop_color', 'pop_scale', 'pop_duration', 'highlight_color', 'box_stroke',
      'box_stroke_color', 'box_stroke_width', 'border_radius', 'pad_x', 'pad_y'].includes(k));
  });
  const CHUNK = [{ title: '', show: () => true, controls: [
    { k: 'max_words', label: 'Words per line', t: 'range', min: 1, max: 5, step: 1 },
    { k: 'max_chars', label: 'Max characters', t: 'range', min: 8, max: 40, step: 1 },
    { k: 'pause', label: 'Break on pause', t: 'range', min: .2, max: 1.5, step: .05, fmt: v => v.toFixed(2) + 's' }] }];
  buildControls($('#chunkControls'), CHUNK, S.chunk, scheduleChunk);
  setLayout('split50'); updateBgToggle(); scheduleOverlay(); enableDesktopUI();
})();
