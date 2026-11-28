/* Subtitle Studio front end (vanilla JS) */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* non-blocking status message; container and aria-live live in index.html */
function showToast(message, kind = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  $('.toast-stack').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/* in-app replacement for confirm(); Escape cancels, Enter activates the focused button.
   Destructive actions focus Cancel so a stray Enter is safe.
   shortcut: no focus trap and one dialog at a time, upgrade if a second dialog can open over it */
function confirmDialog({ title, message, confirmLabel = 'OK', danger = false }) {
  const modal = $('#confirmModal'), ok = $('#confirmOk'), cancel = $('#confirmCancel');
  $('#confirmTitle').textContent = title;
  $('#confirmMessage').textContent = message;
  ok.textContent = confirmLabel;
  ok.className = `btn text-xs ${danger ? 'btn-danger-solid' : 'btn-primary'}`;
  const returnFocus = document.activeElement;
  modal.classList.remove('hidden');
  (danger ? cancel : ok).focus();
  return new Promise(resolve => {
    const finish = result => {
      modal.classList.add('hidden');
      document.removeEventListener('keydown', onKey);
      ok.onclick = cancel.onclick = null;
      returnFocus?.focus();
      resolve(result);
    };
    const onKey = e => { if (e.key === 'Escape') finish(false); };
    ok.onclick = () => finish(true);
    cancel.onclick = () => finish(false);
    document.addEventListener('keydown', onKey);
  });
}

/* fills the range track left of the thumb; styles.css reads --range-fill */
const paintRange = el => el.style.setProperty('--range-fill', `${(el.value - el.min) / (el.max - el.min) * 100}%`);
document.addEventListener('input', e => { if (e.target.type === 'range') paintRange(e.target); });

/* Windows draws native <select> menus in the OS style, so select.field opens this styled list instead; the select stays the value source */
let selectMenu = null;
function closeSelectMenu(restoreFocus) {
  if (!selectMenu) return;
  const { sel, el } = selectMenu;
  el.remove();
  selectMenu = null;
  if (restoreFocus) sel.focus();
}
function openSelectMenu(sel) {
  closeSelectMenu(false);
  const r = sel.getBoundingClientRect();
  const width = Math.max(r.width, 180);
  const below = innerHeight - r.bottom - 8;
  const up = below < 160 && r.top > below;
  const el = document.createElement('div');
  el.className = 'font-picker-popup select-menu';
  el.innerHTML = `<div class="font-picker-list" role="listbox">${[...sel.options].map((o, i) =>
    `<button type="button" class="font-picker-option" role="option" data-i="${i}" aria-selected="${o.selected}">${esc(o.text)}</button>`).join('')}</div>`;
  el.style.width = `${width}px`;
  el.style.left = `${Math.max(8, Math.min(r.left, innerWidth - width - 8))}px`;
  if (up) { el.style.top = 'auto'; el.style.bottom = `${innerHeight - r.top + 4}px`; }
  else el.style.top = `${r.bottom + 4}px`;
  el.firstElementChild.style.maxHeight = `${Math.max(120, (up ? r.top : below) - 14)}px`;
  el.addEventListener('click', e => {
    const item = e.target.closest('[data-i]');
    if (!item) return;
    sel.selectedIndex = +item.dataset.i;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    closeSelectMenu(true);
  });
  el.addEventListener('keydown', e => {
    const items = [...el.querySelectorAll('[data-i]')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.stopPropagation(); closeSelectMenu(true); }
    else if (e.key === 'Tab') closeSelectMenu(true);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus({ preventScroll: true });
    }
  });
  document.body.appendChild(el);
  selectMenu = { sel, el };
  el.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
}
document.addEventListener('mousedown', e => {
  if (selectMenu?.el.contains(e.target)) return;
  const sel = e.target.closest?.('select.field');
  if (!sel) return closeSelectMenu(false);
  e.preventDefault(); // stops the native menu from opening
  if (selectMenu?.sel === sel) closeSelectMenu(true);
  else openSelectMenu(sel);
});
document.addEventListener('keydown', e => {
  const sel = e.target.closest?.('select.field');
  if (sel && !selectMenu && (e.key === ' ' || e.key === 'Enter' || (e.altKey && e.key === 'ArrowDown'))) {
    e.preventDefault();
    openSelectMenu(sel);
  }
});
window.addEventListener('resize', () => closeSelectMenu(false));
window.addEventListener('scroll', e => { if (!selectMenu?.el.contains(e.target)) closeSelectMenu(false); }, { capture: true, passive: true });

async function api(url, body, method = 'POST', signal) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal });
  if (!r.ok) {
    let m = await r.text();
    try { m = JSON.parse(m).detail || m; } catch { /* plain text */ }
    throw new Error(m);
  }
  return r;
}
let settingsSaveQueue = Promise.resolve();
function saveJobSettings(jobId) {
  const settings = JSON.parse(JSON.stringify({
    layout: S.layout, pip: S.pip, blur: S.blur, reframe: S.reframe, mode: S.mode,
    showVideo: S.showVideo, chunk: S.chunk, style: S.style, main: S.main, face: S.face, highlight: S.highlight,
    words: S.words,
  }));
  const save = settingsSaveQueue.then(() => api(`/api/jobs/${jobId}/settings`, settings, 'POST'));
  settingsSaveQueue = save.catch(e => {
    console.error('saveJobSettings', e);
    setStatus('upload', 0, `Could not save project changes: ${e.message}`, 'error');
  });
  return save.then(() => true, () => false);
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
    { k: 'line_spacing', label: 'Line spacing', t: 'range', min: .8, max: 2, step: .05, fmt: v => v.toFixed(2) + 'x' },
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

let fontFileIds = {};
let fontFaceRules = new Set();
let fontFaceStylesheet;

function fontFamilyFor(name) {
  const fileId = fontFileIds[name];
  if (!fileId) return JSON.stringify(name || 'sans-serif');
  if (!fontFaceRules.has(fileId)) {
    if (!fontFaceStylesheet) {
      fontFaceStylesheet = document.createElement('style');
      document.head.appendChild(fontFaceStylesheet);
    }
    fontFaceStylesheet.sheet.insertRule(
      `@font-face { font-family: "SubtitleStudio_${fileId}"; src: url("/api/fonts/file/${fileId}"); font-display: swap; }`,
      fontFaceStylesheet.sheet.cssRules.length,
    );
    fontFaceRules.add(fileId);
  }
  return `"SubtitleStudio_${fileId}"`;
}

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
        input = c.searchable
          ? `<div class="font-picker">
              <button class="field font-picker-trigger" type="button" data-k="${c.k}" role="combobox"
                aria-haspopup="listbox" aria-expanded="false">
                <span class="font-picker-label" data-font-label></span><span class="font-picker-caret" aria-hidden="true">▾</span>
              </button>
              <div class="font-picker-popup hidden">
                <input class="field font-picker-search" type="search" placeholder="Search fonts..." aria-label="Search fonts" autocomplete="off">
                <div class="font-picker-list" role="listbox" aria-label="Fonts"></div>
              </div>
            </div>`
          : `<select class="field" data-k="${c.k}">${c.opts.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('')}</select>`;
      }
      else if (c.t === 'range') input = `<input type="range" data-k="${c.k}" min="${c.min}" max="${c.max}" step="${c.step}">`;
      else if (c.t === 'color') input = `<input type="color" data-k="${c.k}">`;
      else input = `<input type="checkbox" data-k="${c.k}">`;
      row.innerHTML = `<span>${c.label}</span><div>${input}</div>${c.t === 'range' ? val : '<span></span>'}`;
      const el = $('[data-k]', row);
      const sync = () => { const v = $('.val', row); if (v) v.textContent = c.fmt ? c.fmt(obj[c.k]) : obj[c.k]; };

      if (c.searchable) {
        const picker = $('.font-picker', row);
        const trigger = $('.font-picker-trigger', picker);
        const label = $('[data-font-label]', picker);
        const popup = $('.font-picker-popup', picker);
        const search = $('.font-picker-search', picker);
        const list = $('.font-picker-list', picker);
        const rowHeight = 36;
        const maxListHeight = 280;
        let matches = c.opts;
        let renderScheduled = false;

        const syncPicker = () => {
          label.textContent = obj[c.k] || '';
          label.style.fontFamily = fontFamilyFor(obj[c.k]);
          trigger.setAttribute('aria-label', `Font: ${obj[c.k] || 'Select font'}`);
        };
        const renderRows = () => {
          const scrollTop = list.scrollTop;
          list.replaceChildren();
          if (!matches.length) {
            list.style.height = `${rowHeight}px`;
            list.scrollTop = 0;
            const empty = document.createElement('div');
            empty.className = 'font-picker-empty';
            empty.textContent = 'No matching fonts';
            list.appendChild(empty);
            return;
          }
          const viewportHeight = Math.min(maxListHeight, Math.max(rowHeight, matches.length * rowHeight));
          list.style.height = `${viewportHeight}px`;
          const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 3);
          const count = Math.ceil(viewportHeight / rowHeight) + 6;
          const end = Math.min(matches.length, start + count);
          const top = document.createElement('div');
          top.setAttribute('aria-hidden', 'true');
          top.style.height = `${start * rowHeight}px`;
          list.appendChild(top);
          for (const [name] of matches.slice(start, end)) {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'font-picker-option';
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', String(name === obj[c.k]));
            option.textContent = name;
            option.style.fontFamily = fontFamilyFor(name);
            option.addEventListener('pointerdown', event => event.preventDefault());
            option.addEventListener('click', () => {
              obj[c.k] = name;
              syncPicker();
              closePicker(true);
              onChange(c.k);
            });
            list.appendChild(option);
          }
          const bottom = document.createElement('div');
          bottom.setAttribute('aria-hidden', 'true');
          bottom.style.height = `${Math.max(0, (matches.length - end) * rowHeight)}px`;
          list.appendChild(bottom);
          list.scrollTop = scrollTop;
        };
        const filterRows = () => {
          const query = search.value.trim().toLowerCase();
          matches = c.opts.filter(([name, labelText]) =>
            `${name} ${labelText}`.toLowerCase().includes(query));
          list.scrollTop = 0;
          renderRows();
        };
        const closePicker = restoreFocus => {
          popup.classList.add('hidden');
          trigger.setAttribute('aria-expanded', 'false');
          if (restoreFocus) trigger.focus();
        };
        const openPicker = () => {
          search.value = '';
          matches = c.opts;
          list.scrollTop = 0;
          popup.classList.remove('hidden');
          trigger.setAttribute('aria-expanded', 'true');
          renderRows();
          search.focus();
        };

        syncPicker();
        trigger.addEventListener('click', () => {
          if (popup.classList.contains('hidden')) openPicker();
          else closePicker(false);
        });
        trigger.addEventListener('keydown', event => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            openPicker();
          }
        });
        search.addEventListener('input', filterRows);
        search.addEventListener('keydown', event => {
          if (event.key === 'Escape') {
            event.preventDefault();
            closePicker(true);
          }
        });
        list.addEventListener('scroll', () => {
          if (renderScheduled) return;
          renderScheduled = true;
          requestAnimationFrame(() => {
            renderScheduled = false;
            renderRows();
          });
        }, { passive: true });
        picker.addEventListener('focusout', () => {
          window.setTimeout(() => {
            if (!picker.contains(document.activeElement)) closePicker(false);
          }, 0);
        });
        document.addEventListener('pointerdown', event => {
          if (!picker.contains(event.target)) closePicker(false);
        });
        document.addEventListener('keydown', event => {
          if (event.key === 'Escape' && !popup.classList.contains('hidden')) closePicker(true);
        });
        c.el = trigger;
        wrap.appendChild(row);
        return;
      }

      if (c.t === 'check') el.checked = !!obj[c.k]; else el.value = obj[c.k];
      if (c.t === 'range') paintRange(el);
      sync();
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
  $('#stBar').style.transform = `scaleX(${Math.min(1, Math.max(0, pct))})`;
  $('#stBar').style.background = state === 'error' ? 'var(--danger)' : 'var(--accent)';
  $('#stMsg').textContent = msg;
  $('#stMsg').style.color = state === 'error' ? 'var(--danger)' : '';
}

function updateRenderButton(busy = false) {
  $('#render').disabled = busy || !S.job || !S.words.length;
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
  $('#go').disabled = busy || !S.job;
  updateRenderButton(busy);
  if (ev.state === 'error') { $('#go').disabled = !S.job; updateRenderButton(); return; }
  if (ev.state !== 'done') return;
  if (ev.stage === 'download') initJob(ev.result);
  if (ev.stage === 'transcribe') {
    S.words = ev.result.words;
    rechunk().then(() => updateRenderButton());
    if (S.job) saveJobSettings(S.job.job_id);
  }
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
  updateRenderButton();
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
// shortcut: hh:mm:ss via Date, wraps after 24h, upgrade to manual h/m/s split if media ever runs that long
const fmtHMS = s => new Date(Math.max(0, Number(s) || 0) * 1000).toISOString().slice(11, 19);

function updateTimeUI(t) {
  const dur = S.job ? (S.job.meta.duration || vid.duration || 0) : 0;
  S.t = Math.max(0, Math.min(dur || 0, t));
  if (!isScrubbing) { $('#scrub').value = S.t; paintRange($('#scrub')); }
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
  updateRenderButton();
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
  paintRange($('#scrub'));
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
['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.style.borderColor = 'var(--accent)'; }));
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
      if (S.job) await saveJobSettings(S.job.job_id); // Auto-save before transcribing
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

  // size comes from CSS: the stage takes the panel's leftover height (see .output-stage)
  const stageAspect = S.reframe || !S.job || S.job.kind !== 'video' ? 9 / 16 : sourceAspect;
  $('#stage').style.aspectRatio = `${stageAspect}`;
  $('#ovl').style.objectFit = S.reframe ? 'fill' : 'contain';
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
paintRange($('#vol'));

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
  if (selectMenu) return; // keys belong to the open select menu
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
  const show = Boolean(S.job && S.job.kind === 'video' && S.showVideo);
  layCanvas.classList.toggle('hidden', !show);
  if (!show || vid.readyState < 2 || !vid.videoWidth) return;

  const CW = 540;
  const CH = S.reframe ? 960 : Math.max(1, Math.round(CW * vid.videoHeight / vid.videoWidth));
  if (layCanvas.width !== CW || layCanvas.height !== CH) {
    layCanvas.width = CW;
    layCanvas.height = CH;
  }
  layCtx.clearRect(0, 0, CW, CH);

  if (!S.reframe) {
    layCtx.drawImage(vid, 0, 0, CW, CH);
    return;
  }

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
  if (!S.words.length) {
    S.phrases = [];
    renderGrid();
    invalidateOverlayCache();
    updateRenderButton();
    return;
  }
  try {
    S.phrases = (await (await api('/api/chunk', { words: S.words, chunk: S.chunk })).json()).phrases;
    S.selPhrase = Math.min(S.selPhrase, S.phrases.length - 1);
    renderGrid();
    updateRenderButton();
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
let transcriptMatches = [];
let selectedTranscriptMatch = -1;
let searchNavigationFocus = false;

function findTranscriptMatches() {
  const query = $('#transcriptFind').value;
  if (!query || !S.words.length) return [];
  const tokenRanges = [];
  let text = '';
  S.words.forEach((word, index) => {
    if (index) text += ' ';
    const start = text.length;
    const tokenText = String(word.w ?? '');
    text += tokenText;
    tokenRanges.push({ index, start, end: text.length });
  });
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = new RegExp(escaped, $('#transcriptCase').checked ? 'g' : 'gi');
  const matches = [];
  let rangeIndex = 0;
  let match;
  while ((match = matcher.exec(text))) {
    const start = match.index;
    const end = start + match[0].length;
    while (rangeIndex < tokenRanges.length && tokenRanges[rangeIndex].end <= start) rangeIndex++;
    const touched = [];
    for (let i = rangeIndex; i < tokenRanges.length && tokenRanges[i].start < end; i++) {
      if (tokenRanges[i].end > start) touched.push(tokenRanges[i]);
    }
    if (touched.length) {
      const first = touched[0], last = touched[touched.length - 1];
      matches.push({
        start,
        end,
        firstIndex: first.index,
        lastIndex: last.index,
        firstOffset: Math.max(0, start - first.start),
        lastOffset: Math.max(0, end - last.start),
        wordMatches: touched.map(token => ({
          index: token.index,
          start: Math.max(start, token.start) - token.start,
          end: Math.min(end, token.end) - token.start,
        })).filter(token => token.end > token.start),
      });
    }
  }
  return matches;
}

function refreshTranscriptSearch(resetSelection = false, preferredIndex = selectedTranscriptMatch) {
  transcriptMatches = findTranscriptMatches();
  selectedTranscriptMatch = transcriptMatches.length
    ? Math.max(0, Math.min(resetSelection ? 0 : preferredIndex, transcriptMatches.length - 1))
    : -1;
  const matchedWords = new Set();
  const currentWords = new Set();
  transcriptMatches.forEach((match, index) => {
    match.wordMatches.forEach(token => matchedWords.add(token.index));
    if (index === selectedTranscriptMatch) match.wordMatches.forEach(token => currentWords.add(token.index));
  });
  $$('.wc[data-word-index]').forEach(cell => {
    const wordIndex = Number(cell.dataset.wordIndex);
    cell.classList.toggle('search-hit', matchedWords.has(wordIndex));
    cell.classList.toggle('search-current', currentWords.has(wordIndex));
  });
  $('#transcriptMatchCount').textContent = `${selectedTranscriptMatch < 0 ? 0 : selectedTranscriptMatch + 1} / ${transcriptMatches.length}`;
  $('#transcriptPrev').disabled = transcriptMatches.length < 2;
  $('#transcriptNext').disabled = transcriptMatches.length < 2;
  $('#transcriptReplaceBtn').disabled = selectedTranscriptMatch < 0;
  $('#transcriptReplaceAll').disabled = transcriptMatches.length === 0;
}

function navigateTranscriptMatch(step = 0) {
  if (!transcriptMatches.length) return;
  selectedTranscriptMatch = selectedTranscriptMatch < 0
    ? 0
    : (selectedTranscriptMatch + step + transcriptMatches.length) % transcriptMatches.length;
  refreshTranscriptSearch(false, selectedTranscriptMatch);
  if (!vid.paused || sampleTimer) return;
  const match = transcriptMatches[selectedTranscriptMatch];
  const firstWordMatch = match.wordMatches[0];
  const cell = $(`.wc[data-word-index="${firstWordMatch.index}"]`);
  if (cell) cell.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  const input = cell && $('input.w', cell);
  if (input) {
    searchNavigationFocus = true;
    try {
      input.focus({ preventScroll: true });
      input.setSelectionRange(firstWordMatch.start, firstWordMatch.end);
    } finally {
      searchNavigationFocus = false;
    }
  }
}

async function applyTranscriptMatches(matches, replacement) {
  const payload = await (await api('/api/transcript/replace', {
    words: S.words, matches, replacement,
  })).json();
  S.words = payload.words;
  if (S.job) await saveJobSettings(S.job.job_id);
}

async function replaceSelectedTranscriptMatch() {
  if (selectedTranscriptMatch < 0) return;
  const index = selectedTranscriptMatch;
  await applyTranscriptMatches([transcriptMatches[index]], $('#transcriptReplace').value);
  await rechunk();
  refreshTranscriptSearch(false, index);
  if (!S.job) refreshLivePreview();
}

async function replaceAllTranscriptMatches() {
  const matches = [...transcriptMatches].sort((a, b) => b.start - a.start);
  if (!matches.length) return;
  const replacement = $('#transcriptReplace').value;
  await applyTranscriptMatches(matches, replacement);
  await rechunk();
  refreshTranscriptSearch(true);
  if (!S.job) refreshLivePreview();
}

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
  updateScriptButton();
  S.phrases.forEach((p, pi) => {
    const row = document.createElement('div');
    row.className = 'prow' + (pi === S.selPhrase ? ' sel' : '');
    const head = document.createElement('button');
    head.className = 'text-xs text-mute mb-2 hover:text-fg'; head.textContent = `${tfmt(p.start)} to ${tfmt(p.end)}`;
    head.onclick = () => { selectWord(pi, 0, true); };
    const cells = document.createElement('div'); cells.className = 'flex flex-wrap gap-2';
    p.words.forEach((w, wi) => {
      const c = document.createElement('div'); c.className = 'wc';
      c.dataset.wordIndex = w.i;
      c.innerHTML = `<input class="w" aria-label="Word" value="${w.w.replace(/"/g, '&quot;')}" size="${Math.max(4, w.w.length)}">
        <div class="flex items-center"><input class="t" aria-label="Start seconds" type="number" step="0.01" value="${w.start}"><input class="t" aria-label="End seconds" type="number" step="0.01" value="${w.end}"><button class="text-mute hover:text-fg px-1" title="Delete word" aria-label="Delete word">×</button></div>`;
      const [tw, ts, te] = $$('input', c);
      c.addEventListener('focusin', () => { if (!searchNavigationFocus) selectWord(pi, wi, vid.paused); });
      tw.oninput = () => {
        const txt = tw.value.trim();
        if (txt) {
          S.words[w.i].w = w.w = txt;
          tw.size = Math.max(4, txt.length);
          invalidateOverlayCache();
          refreshTranscriptSearch();
          if (S.job) saveJobSettings(S.job.job_id);
        }
      };
      tw.onchange = () => {
        S.words[w.i].w = w.w = tw.value.trim();
        if (!w.w) { delWord(w.i); return; }
        tw.size = Math.max(4, w.w.length); invalidateOverlayCache(); refreshTranscriptSearch();
        if (S.job) saveJobSettings(S.job.job_id);
      };
      const timeChange = () => {
        const s0 = parseFloat(ts.value), s1 = parseFloat(te.value);
        if (Number.isFinite(s0)) S.words[w.i].start = w.start = s0;
        if (Number.isFinite(s1)) S.words[w.i].end = w.end = s1;
        const sorted = S.words.every((x, k) => !k || x.start >= S.words[k - 1].start);
        if (!sorted) { S.words.sort((a, b) => a.start - b.start); rechunk(); }
        else if (S.job) { syncSubtitleToTime(vid.currentTime || S.t, !vid.paused); }
        if (S.job) saveJobSettings(S.job.job_id);
      };
      ts.oninput = timeChange; te.oninput = timeChange;
      $('button', c).onclick = () => delWord(w.i);
      cells.appendChild(c);
    });
    row.append(head, cells); g.appendChild(row);
  });
  refreshTranscriptSearch();
}
function delWord(i) {
  S.words.splice(i, 1);
  rechunk();
  if (S.job) saveJobSettings(S.job.job_id);
  updateRenderButton();
}

$('#transcriptFind').addEventListener('input', () => refreshTranscriptSearch(true));
$('#transcriptCase').addEventListener('change', () => refreshTranscriptSearch(true));
$('#transcriptFind').addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); navigateTranscriptMatch(event.shiftKey ? -1 : 0); }
});
$('#transcriptFindBtn').onclick = () => navigateTranscriptMatch();
$('#transcriptPrev').onclick = () => navigateTranscriptMatch(-1);
$('#transcriptNext').onclick = () => navigateTranscriptMatch(1);
$('#transcriptReplaceBtn').onclick = replaceSelectedTranscriptMatch;
$('#transcriptReplaceAll').onclick = replaceAllTranscriptMatches;

function updateScriptButton() {
  $('#fixScript').disabled = !S.words.length || !$('#referenceScript').value.trim() || $('#fixScript').dataset.busy === 'true';
}

$('#referenceScript').addEventListener('input', updateScriptButton);
$('#clearReferenceScript').onclick = () => {
  $('#referenceScript').value = '';
  $('#scriptStatus').textContent = '';
  updateScriptButton();
};
$('#fixScript').onclick = async () => {
  const button = $('#fixScript');
  const status = $('#scriptStatus');
  button.dataset.busy = 'true';
  updateScriptButton();
  status.textContent = 'Aligning script...';
  try {
    const result = await (await api('/api/fix-script', {
      words: S.words,
      reference: $('#referenceScript').value,
    })).json();
    S.words = result.words;
    if (S.job) await saveJobSettings(S.job.job_id);
    await rechunk();
    status.textContent = `Fixed ${result.fixed} words from script`;
  } catch (e) {
    status.textContent = e.message;
    setStatus('render', 0, e.message, 'error');
  } finally {
    button.dataset.busy = 'false';
    updateScriptButton();
  }
};

/* ------------------------------------------------------------------ export */
function setMode(m) {
  S.mode = m;
  $$('#modes button').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === m));
}
$$('#modes button').forEach(b => b.onclick = () => setMode(b.dataset.m));

$('#render').onclick = async () => {
    if (!S.job || !S.words.length) {
      updateRenderButton();
      return;
    }
    try {
      await saveJobSettings(S.job.job_id); // Auto-save before rendering
      $('#result').classList.add('hidden'); $('#render').disabled = true;
      S.words.sort((a, b) => a.start - b.start);
      await api(`/api/jobs/${S.job.job_id}/render`, {
        mode: S.mode, words: S.words, chunk: S.chunk, style: S.style, layout: S.layout,
        reframe: S.reframe, main_crop: S.main, face_crop: S.face, pip_corner: S.pip, blur_bg: S.blur });
      track(S.job.job_id); setStatus('render', 0, 'starting render');
    } catch (e) { setStatus('render', 0, e.message, 'error'); updateRenderButton(); }
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
  const channelSelect = $('#updateChannel');
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
        if (await confirmDialog({ title: 'Update ready', message: 'The update is ready. Restart Subtitle Studio now?', confirmLabel: 'Restart' })) {
          await d.restart_after_update();
        }
      }
    } catch (error) {
      statusText.textContent = `Update status unavailable: ${error.message}`;
      statusText.classList.add('is-error');
    }
  }

  let selectedChannel = channelSelect.value;
  channelSelect.disabled = true;
  channelSelect.onchange = async () => {
    channelSelect.disabled = true;
    try {
      await d.set_update_channel(channelSelect.value);
      selectedChannel = channelSelect.value;
      await refresh();
    } catch (error) {
      channelSelect.value = selectedChannel;
      statusText.textContent = `Could not change update channel: ${error.message}`;
      statusText.classList.add('is-error');
    } finally {
      channelSelect.disabled = false;
    }
  };

  d.get_update_channel().then(channel => {
    channelSelect.value = channel;
    selectedChannel = channel;
  }).catch(error => {
    statusText.textContent = `Update channel unavailable: ${error.message}`;
    statusText.classList.add('is-error');
  }).finally(() => {
    channelSelect.disabled = false;
  });

  button.onclick = async () => {
    try {
      const status = await d.get_update_status();
      if (status.state === 'staged') {
        if (await confirmDialog({ title: 'Update ready', message: 'Restart Subtitle Studio to finish the update?', confirmLabel: 'Restart' })) {
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
  if (!meta.fonts.includes(S.style.font)) {
    S.style.font = meta.font_aliases?.[S.style.font] || meta.font_aliases?.[S.style.font.toLowerCase()] || meta.fonts[0] || S.style.font;
  }
  fontFileIds = meta.font_files || {};
  SECTIONS[1].controls[0].opts = meta.fonts.map(f => [f, f]);
  buildControls($('#styleControls'), SECTIONS, S.style, k => {
    if (k === 'style') refreshSectionVisibility();
    localStorage.setItem('subgen.style', JSON.stringify(S.style));
    invalidateOverlayCache(['style', 'font', 'uppercase', 'box_fill', 'box_stroke',
      'pop_color', 'pop_scale', 'pop_duration', 'highlight_color', 'box_stroke',
      'box_stroke_color', 'box_stroke_width', 'border_radius', 'pad_x', 'pad_y',
      'line_spacing'].includes(k));
    if (S.job) saveJobSettings(S.job.job_id);
  });
  const CHUNK = [{ title: '', show: () => true, controls: [
    { k: 'max_words', label: 'Words per line', t: 'range', min: 1, max: 5, step: 1 },
    { k: 'max_chars', label: 'Max characters', t: 'range', min: 8, max: 40, step: 1 },
    { k: 'pause', label: 'Break on pause', t: 'range', min: .2, max: 1.5, step: .05, fmt: v => v.toFixed(2) + 's' }] }];
  buildControls($('#chunkControls'), CHUNK, S.chunk, () => {
    scheduleChunk();
    if (S.job) saveJobSettings(S.job.job_id);
  });
  setLayout('split50'); updateBgToggle(); scheduleOverlay(); enableDesktopUI();

  $('#openJobsBtn').onclick = async () => {
    $('#jobsModal').classList.remove('hidden');
    $('#jobsList').innerHTML = '<div class="text-xs text-mute p-4 text-center">Loading...</div>';
    try {
      // Load cleanup settings
      const settingsRes = await api('/api/settings/cleanup', null, 'GET');
      const settings = await settingsRes.json();
      $('#cleanupDays').value = settings.max_age_days || 3;

      const res = await api('/api/jobs', null, 'GET');
      const jobs = await res.json();
      if (!jobs.length) {
        $('#jobsList').innerHTML = '<div class="text-xs text-mute p-4 text-center">No saved jobs found</div>';
        return;
      }
      $('#jobsList').innerHTML = jobs.map(j => {
        const words = Number(j.word_count) || 0;
        return `
        <div class="job-item" data-id="${j.job_id}">
          <div class="info" data-open="${j.job_id}">
            <div class="name" data-rename="${j.job_id}" tabindex="0" role="button" aria-label="Rename ${esc(j.name)}" title="${esc(j.name)} — double-click or press Enter to rename">${esc(j.name)}</div>
            <div class="meta">${fmtHMS(j.meta.duration)} · ${words.toLocaleString()} ${words === 1 ? 'word' : 'words'}</div>
          </div>
          <div class="actions">
            <button class="btn btn-danger text-xs !p-1" data-del="${j.job_id}" data-name="${esc(j.name)}">Delete</button>
          </div>
        </div>
      `;
      }).join('');
    } catch (e) {
      $('#jobsList').innerHTML = '<div class="text-xs text-error p-4 text-center">Failed to load jobs</div>';
    }
  };

  const saveBtn = $('#saveProjectBtn');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      if (!S.job) return;
      saveBtn.textContent = 'Saving...';
      const success = await saveJobSettings(S.job.job_id);
      saveBtn.textContent = 'Save';
      if (success) {
        const origText = saveBtn.innerHTML;
        saveBtn.textContent = 'Saved!';
        setTimeout(() => { saveBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M11 2H9v3h2V2z"/><path d="M1.5 0h11.586a1 1 0 0 1 .707.293l1.414 1.414a1 1 0 0 1 .293.707V14a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V1a1 1 0 0 1 1-1zM2 1v13h12V3.05L12.95 2H2z"/><path d="M7 14h2v-3H7v3zM5 14h4v-4H5v4z"/></svg> Save'; }, 1500);
      } else {
        showToast('Failed to save project.', 'error');
      }
    };
  }

  // Bind to existing initJob logic
  const _origInit = window.initJob;
  window.initJob = (job) => {
    if (typeof _origInit === 'function') _origInit(job);
    else initJob(job);
    if (saveBtn) saveBtn.classList.remove('hidden');
  };

  $('#saveCleanupBtn').onclick = async () => {
    const days = parseInt($('#cleanupDays').value);
    try {
      await api('/api/settings/cleanup', { max_age_days: days }, 'POST');
      showToast('Cleanup settings saved');
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  $('#closeJobsBtn').onclick = () => $('#jobsModal').classList.add('hidden');

  window.deleteJob = async (e, id, name) => {
    e.stopPropagation();
    const ok = await confirmDialog({
      title: 'Delete project',
      message: `This permanently deletes the folder and all its data for "${name}".`,
      confirmLabel: 'Delete',
      danger: true
    });
    if (!ok) return;

    try {
      await api(`/api/jobs/${id}`, null, 'DELETE');
      $('#openJobsBtn').click(); // Refresh list
    } catch (e) {
      showToast('Failed to delete job.', 'error');
    }
  };

  let openTimer;
  $('#jobsList').addEventListener('click', (ev) => {
    const del = ev.target.closest('[data-del]');
    if (del) return deleteJob(ev, del.dataset.del, del.dataset.name);
    const open = ev.target.closest('[data-open]');
    if (!open) return;
    // wait briefly so a double-click on the name can rename before the modal closes
    clearTimeout(openTimer);
    if (ev.detail > 1) return;
    openTimer = setTimeout(() => loadSavedJob(open.dataset.open), 300);
  });

  const renameJob = async (el) => {
    const id = el.dataset.rename;
    const current = el.textContent;
    const name = prompt('Project name', current);
    if (!name || name.trim() === current) return;
    try {
      const r = await (await api(`/api/jobs/${id}/rename`, { name })).json();
      if (S.job && S.job.job_id === id) {
        const jn = $('#jobname');
        jn.textContent = jn.textContent.replace(S.job.name, r.name);
        S.job.name = r.name;
        $('#ytTitle').textContent = r.name;
      }
      $('#openJobsBtn').click(); // Refresh list
    } catch (e) {
      showToast(e.message, 'error');
    }
  };
  $('#jobsList').addEventListener('dblclick', (ev) => {
    const el = ev.target.closest('[data-rename]');
    if (el) renameJob(el);
  });
  // Keyboard path: the name is focusable, Enter renames (touch users can't double-click)
  $('#jobsList').addEventListener('keydown', (ev) => {
    const el = ev.target.closest('[data-rename]');
    if (el && ev.key === 'Enter') renameJob(el);
  });
  window.getJobSettings = () => ({ layout: S.layout, pip: S.pip, blur: S.blur, reframe: S.reframe, mode: S.mode, showVideo: S.showVideo, chunk: S.chunk, style: S.style, main: S.main, face: S.face });
  window.setJobSettings = (s) => {
    S.layout = s.layout || S.layout; S.pip = s.pip || S.pip; S.blur = s.blur ?? S.blur;
    S.reframe = s.reframe ?? S.reframe; S.mode = s.mode || S.mode; S.showVideo = s.showVideo ?? S.showVideo;
    if (s.chunk) Object.assign(S.chunk, s.chunk);
    if (s.style) Object.assign(S.style, s.style);
    if (s.main) Object.assign(S.main, s.main);
    if (s.face) Object.assign(S.face, s.face);
  };
  window.loadSavedJob = async (id) => {
    $('#jobsModal').classList.add('hidden');
    try {
      const res = await api(`/api/jobs/${id}`, null, 'GET');
      if (!res.ok) throw new Error('Failed to fetch job data');
      const job = await res.json();
      if (S.job && S.job.job_id !== id) {
        if (vid) vid.pause();
        $('#grid').innerHTML = '';
        S.words = [];
      }
      // initJob resets reframe/layout/mode defaults, so apply saved settings AFTER it
      initJob(job);
      window.setJobSettings(job.settings || {});
      applyLoadedSettings();
      // Rebuild controls to reflect loaded settings (in-place merged by setJobSettings)
      buildControls($('#styleControls'), SECTIONS, S.style, k => {
        if (k === 'style') refreshSectionVisibility();
        localStorage.setItem('subgen.style', JSON.stringify(S.style));
        invalidateOverlayCache(['style', 'font', 'uppercase', 'box_fill', 'box_stroke',
          'pop_color', 'pop_scale', 'pop_duration', 'highlight_color', 'box_stroke',
          'box_stroke_color', 'box_stroke_width', 'border_radius', 'pad_x', 'pad_y',
          'line_spacing'].includes(k));
        if (S.job) saveJobSettings(S.job.job_id);
      });
      buildControls($('#chunkControls'), CHUNK, S.chunk, () => {
        scheduleChunk();
        if (S.job) saveJobSettings(S.job.job_id);
      });
      if (job.words && job.words.length > 0) scheduleChunk();
      return job;
    } catch (e) {
      console.error(e);
      showToast('Could not open project.', 'error');
    }
  };

  function applyLoadedSettings() {
    if (!S.job) return;
    const isVideo = S.job.kind === 'video';
    $('#reframeToggle').checked = !!S.reframe;
    $('#reframeToggle').disabled = !isVideo;
    updateReframeUI();
    setLayout(S.layout || 'split50');
    if (S.mode) setMode(S.mode);
    updateBgToggle();
    drawLayoutFrame();
    scheduleOverlay();
    refreshSectionVisibility();
  }
  window.addEventListener('beforeunload', async (e) => {
    if (S.job) {
      try { await saveJobSettings(S.job.job_id); } catch (_) { /* best-effort */ }
    }
  });
})();
