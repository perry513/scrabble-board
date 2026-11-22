'use strict';

/* ---------- Constants ---------- */
const VALUES = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
  N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};
const DICTS = {
  csw21: {
    label: 'Collins CSW21 (UK, Australia, international)',
    url: 'https://raw.githubusercontent.com/scrabblewords/scrabblewords/main/words/British/CSW21.txt',
    size: '12.6 MB',
  },
  nwl2023: {
    label: 'NWL2023 (USA & Canada)',
    url: 'https://raw.githubusercontent.com/scrabblewords/scrabblewords/main/words/North-American/NWL2023.txt',
    size: '7.6 MB',
  },
  enable: {
    label: 'ENABLE (open word list, no definitions)',
    url: 'https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt',
    size: '1.7 MB',
  },
};
const STORE_KEY = 'scrabble-scores-v1';
const DICT_KEY = 'scrabble-board-dict';

/* ---------- Helpers ---------- */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const lettersOnly = (s) => String(s || '').toUpperCase().replace(/[^A-Z]/g, '');
const faceValue = (w) => [...w].reduce((t, ch) => t + (VALUES[ch] || 0), 0);

/* ---------- State ---------- */
let state = loadState();

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && Array.isArray(s.players) && s.players.length >= 2 && Array.isArray(s.turns)) return s;
  } catch (e) { /* ignore */ }
  return null;
}
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}
function newGame(names) {
  state = { players: names.map((name) => ({ name, score: 0 })), current: 0, turns: [], ended: false };
  clearEntry();
  saveState();
  render();
}

/* ---------- Dictionary ---------- */
const dict = { id: null, map: null, status: 'idle', error: '' };
let pendingLookup = null;

function savedDictId() {
  try { const id = localStorage.getItem(DICT_KEY); if (id && DICTS[id]) return id; } catch (e) { /* ignore */ }
  return 'csw21';
}

async function loadDict(id) {
  if (dict.id === id && (dict.map || dict.status === 'loading')) return;
  dict.id = id; dict.map = null; dict.status = 'loading'; dict.error = '';
  try { localStorage.setItem(DICT_KEY, id); } catch (e) { /* ignore */ }
  renderDict();
  const url = DICTS[id].url;
  try {
    let cache = null;
    try { if ('caches' in window) cache = await caches.open('scrabble-word-lists-v1'); } catch (e) { cache = null; }
    let res = cache ? await cache.match(url) : null;
    if (!res) {
      res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      if (cache) { try { await cache.put(url, res.clone()); } catch (e) { /* ignore */ } }
    }
    const text = await res.text();
    if (dict.id !== id) return;
    const map = new Map();
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line[0] === '#') continue;
      const sp = line.indexOf(' ');
      const w = (sp < 0 ? line : line.slice(0, sp)).toUpperCase();
      if (!/^[A-Z]+$/.test(w)) continue;
      // NWL marks cross-references as {word=pos} or <word=pos>; show just the word.
      const def = sp < 0 ? '' : line.slice(sp + 1).trim().replace(/[{<]([^=}>]+)=[^}>]*[}>]/g, '$1');
      map.set(w, def);
    }
    dict.map = map;
    dict.status = 'ready';
  } catch (e) {
    if (dict.id !== id) return;
    dict.status = 'error';
    dict.error = e.message || String(e);
  }
  renderDict();
  renderWordCheck();
  if (pendingLookup) { const w = pendingLookup; pendingLookup = null; lookup(w); }
}

/* ---------- Actions ---------- */
function clearEntry() {
  $('#pointsInput').value = '';
  $('#wordInput').value = '';
  renderWordCheck();
}
function applyDeltas(deltas, sign) {
  deltas.forEach((d, i) => { if (state.players[i]) state.players[i].score += sign * d; });
}
function nextTurn() { state.current = (state.current + 1) % state.players.length; }

function addScore() {
  if (!state || state.ended) return;
  const raw = $('#pointsInput').value.trim();
  const pts = Number(raw);
  if (raw === '' || !Number.isFinite(pts)) { $('#pointsInput').focus(); return; }
  const word = lettersOnly($('#wordInput').value);
  const deltas = state.players.map(() => 0);
  deltas[state.current] = Math.round(pts);
  state.turns.push({ type: 'score', player: state.current, points: Math.round(pts), word, deltas });
  applyDeltas(deltas, 1);
  nextTurn();
  clearEntry();
  saveState();
  render();
}

function pass() {
  if (!state || state.ended) return;
  state.turns.push({ type: 'pass', player: state.current, deltas: state.players.map(() => 0) });
  nextTurn();
  clearEntry();
  saveState();
  render();
}

function undo() {
  if (!state || !state.turns.length) return;
  const t = state.turns[state.turns.length - 1];
  const name = state.players[t.player].name;
  const desc = t.type === 'score' ? `${name}'s ${t.points} points${t.word ? ' for ' + t.word : ''}`
    : t.type === 'pass' ? `${name}'s pass` : 'the end-of-game scoring';
  if (!confirm(`Undo ${desc}?`)) return;
  state.turns.pop();
  applyDeltas(t.deltas, -1);
  if (t.type === 'end') state.ended = false;
  else state.current = t.player;
  saveState();
  render();
}

/* ---------- Rendering ---------- */
function render() {
  if (!state) return;
  renderPlayers();
  renderHistory();
  renderDict();
  renderWordCheck();

  const ended = !!state.ended;
  $('#turnLabel').textContent = ended ? 'Game over' : `${state.players[state.current].name}'s turn`;
  ['#btnAdd', '#btnPass', '#pointsInput', '#wordInput', '#btnEnd'].forEach((s) => { $(s).disabled = ended; });
  $('#btnUndo').disabled = !state.turns.length;

  const banner = $('#banner');
  if (ended) {
    const top = Math.max(...state.players.map((p) => p.score));
    const winners = state.players.filter((p) => p.score === top).map((p) => p.name);
    banner.textContent = winners.length > 1 ? `Tie between ${winners.join(' & ')} on ${top}!` : `${winners[0]} wins with ${top}!`;
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }
}

function renderPlayers() {
  const top = Math.max(...state.players.map((p) => p.score));
  $('#players').innerHTML = state.players.map((p, i) => {
    const cur = i === state.current && !state.ended;
    const lead = p.score === top && top > 0;
    return `
    <button type="button" class="player${cur ? ' current' : ''}" data-i="${i}" aria-label="${esc(p.name)}: ${p.score} points${cur ? ', current turn' : ''}">
      <span class="name">${esc(p.name)}${lead ? ' <span class="lead" title="Leading">★</span>' : ''}</span>
      <span class="score">${p.score}</span>
    </button>`;
  }).join('');
}

function renderWordCheck() {
  const el = $('#wordCheck');
  const w = lettersOnly($('#wordInput').value);
  if (!w) { el.innerHTML = ''; return; }
  if (!dict.map) { el.innerHTML = '<span class="muted">Word list loading…</span>'; return; }
  el.innerHTML = dict.map.has(w)
    ? `<span class="ok">✓ ${w} is allowed</span>`
    : `<span class="bad">✗ ${w} is not in the word list</span>`;
}

function renderHistory() {
  const el = $('#history');
  if (!state.turns.length) { el.innerHTML = '<li class="muted empty">No turns yet.</li>'; return; }
  el.innerHTML = state.turns.map((t, idx) => {
    if (t.type === 'end') {
      const parts = t.deltas.map((d, i) => `${esc(state.players[i].name)} ${d >= 0 ? '+' : ''}${d}`).join(', ');
      return `<li><span class="who">End of game</span><span>${parts}</span></li>`;
    }
    const name = `<span class="who">${esc(state.players[t.player].name)}</span>`;
    if (t.type === 'pass') return `<li>${name}<span class="muted">passed / swapped</span></li>`;
    return `<li>${name}<span>${t.word ? `<span class="w">${t.word}</span> ` : ''}<span class="pts">${t.points}</span></span></li>`;
  }).reverse().join('');
}

function renderDict() {
  const sel = $('#dictSelect');
  if (!sel.options.length) {
    sel.innerHTML = Object.entries(DICTS).map(([id, d]) => `<option value="${id}">${esc(d.label)}</option>`).join('');
  }
  if (dict.id) sel.value = dict.id;
  const st = $('#dictStatus');
  if (!dict.id) { st.textContent = ''; return; }
  const d = DICTS[dict.id];
  if (dict.status === 'loading') st.textContent = `Loading word list (${d.size}, first time only)…`;
  else if (dict.status === 'ready') st.textContent = `${dict.map.size.toLocaleString()} words loaded.`;
  else if (dict.status === 'error') st.textContent = `Could not load the word list (${dict.error}). Check your connection and pick it again.`;
}

/* ---------- Lookup ---------- */
function lookup(raw) {
  const w = lettersOnly(raw);
  const out = $('#lookupResult');
  if (!w) { out.innerHTML = ''; return; }
  if (!dict.map) {
    if (dict.status === 'error') { out.innerHTML = '<span class="bad">Word list unavailable.</span>'; return; }
    pendingLookup = w;
    out.innerHTML = `<span class="muted">Checking ${w} once the word list has loaded…</span>`;
    return;
  }
  const def = dict.map.get(w);
  const listName = DICTS[dict.id].label.split(' (')[0];
  if (def !== undefined) {
    out.innerHTML = `<div class="verdict ok">✓ ${w} is allowed</div>`
      + (def ? `<p class="def">${esc(def)}</p>` : '')
      + `<p class="muted small meta">${listName} · tile value ${faceValue(w)} points</p>`;
  } else {
    out.innerHTML = `<div class="verdict bad">✗ ${w} is not allowed</div>`
      + `<p class="muted small meta">Not in ${listName}.</p>`;
  }
}

/* ---------- Dialogs ---------- */
const setupDialog = $('#setupDialog');
function playerRow(name, i) {
  return `<div class="pi"><input type="text" required maxlength="20" value="${esc(name)}" placeholder="Player ${i + 1}" aria-label="Player ${i + 1} name" autocapitalize="words"><button type="button" class="rm" aria-label="Remove player">✕</button></div>`;
}
function refreshRemoveButtons() {
  const rows = $('#playerInputs').querySelectorAll('.pi');
  rows.forEach((row) => { row.querySelector('.rm').disabled = rows.length <= 2; });
}
function openSetup(first) {
  const names = state ? state.players.map((p) => p.name) : ['Player 1', 'Player 2'];
  $('#playerInputs').innerHTML = names.map(playerRow).join('');
  refreshRemoveButtons();
  $('#setupCancel').hidden = !!first;
  setupDialog.showModal();
}
$('#btnAddPlayer').addEventListener('click', () => {
  const box = $('#playerInputs');
  const n = box.querySelectorAll('.pi').length;
  box.insertAdjacentHTML('beforeend', playerRow(`Player ${n + 1}`, n));
  refreshRemoveButtons();
  box.lastElementChild.querySelector('input').select();
});
$('#playerInputs').addEventListener('click', (e) => {
  const rm = e.target.closest('.rm');
  if (!rm || rm.disabled) return;
  rm.closest('.pi').remove();
  refreshRemoveButtons();
});
$('#setupForm').addEventListener('submit', (e) => {
  const action = e.submitter ? e.submitter.value : 'ok';
  if (action !== 'ok') return;
  const names = [...$('#playerInputs').querySelectorAll('input')].map((i, n) => i.value.trim() || `Player ${n + 1}`);
  if (names.length < 2) { e.preventDefault(); return; }
  if (state && state.turns.length && !state.ended && !confirm('Start a new game? The current scores will be cleared.')) { e.preventDefault(); return; }
  newGame(names);
});
setupDialog.addEventListener('cancel', (e) => { if (!state) e.preventDefault(); });

const endDialog = $('#endDialog');
function openEnd() {
  if (!state || state.ended) return;
  $('#endInputs').innerHTML = state.players.map((p, i) => `
    <div class="ei"><span>${esc(p.name)}</span>
      <input type="text" data-i="${i}" placeholder="e.g. QE?" autocapitalize="characters" autocomplete="off" aria-label="${esc(p.name)} leftover tiles">
      <span class="val" data-v="${i}">0</span></div>`).join('');
  endDialog.showModal();
}
$('#endInputs').addEventListener('input', (e) => {
  const inp = e.target.closest('input');
  if (inp) $(`[data-v="${inp.dataset.i}"]`).textContent = faceValue(lettersOnly(inp.value));
});
$('#endForm').addEventListener('submit', (e) => {
  if (!e.submitter || e.submitter.value !== 'ok') return;
  const vals = state.players.map((_, i) => faceValue(lettersOnly($(`#endInputs input[data-i="${i}"]`).value)));
  const total = vals.reduce((a, b) => a + b, 0);
  const outCount = vals.filter((v) => v === 0).length;
  const deltas = vals.map((v) => -v + (v === 0 && outCount === 1 ? total : 0));
  state.turns.push({ type: 'end', player: state.current, deltas });
  applyDeltas(deltas, 1);
  state.ended = true;
  saveState();
  render();
});

/* ---------- Theme ---------- */
const THEME_KEY = 'scrabble-theme';
function loadTheme() {
  try { return Object.assign({ mode: 'light', accent: 'green' }, JSON.parse(localStorage.getItem(THEME_KEY) || '{}')); } catch (e) { return { mode: 'light', accent: 'green' }; }
}
function applyTheme(t) {
  const root = document.documentElement;
  if (t.mode === 'light' || t.mode === 'dark') root.dataset.theme = t.mode; else delete root.dataset.theme;
  root.dataset.accent = t.accent;
  // Match the phone's browser bar to the page.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--accent').trim() || '#1d5e4f';
  try { localStorage.setItem(THEME_KEY, JSON.stringify(t)); } catch (e) { /* ignore */ }
}
let theme = loadTheme();
applyTheme(theme);
const themeDialog = $('#themeDialog');
$('#btnTheme').addEventListener('click', () => {
  themeDialog.querySelector(`input[name="mode"][value="${theme.mode}"]`).checked = true;
  const sw = themeDialog.querySelector(`input[name="accent"][value="${theme.accent}"]`);
  if (sw) sw.checked = true;
  themeDialog.showModal();
});
themeDialog.addEventListener('change', (e) => {
  if (e.target.name === 'mode') theme.mode = e.target.value;
  if (e.target.name === 'accent') theme.accent = e.target.value;
  applyTheme(theme);
});
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(theme));

/* ---------- Wiring ---------- */
$('#scoreForm').addEventListener('submit', (e) => { e.preventDefault(); addScore(); });
$('#wordInput').addEventListener('input', renderWordCheck);
$('#btnPass').addEventListener('click', pass);
$('#btnUndo').addEventListener('click', undo);
$('#btnNew').addEventListener('click', () => openSetup(false));
$('#btnEnd').addEventListener('click', openEnd);
$('#players').addEventListener('click', (e) => {
  const p = e.target.closest('.player');
  if (!p || state.ended) return;
  const i = Number(p.dataset.i);
  if (i !== state.current && confirm(`Make it ${state.players[i].name}'s turn?`)) { state.current = i; saveState(); render(); }
});
$('#lookupForm').addEventListener('submit', (e) => { e.preventDefault(); lookup($('#lookupInput').value); });
$('#dictSelect').addEventListener('change', (e) => { loadDict(e.target.value); });

/* ---------- Start ---------- */
if (state) {
  render();
} else {
  state = { players: [{ name: 'Player 1', score: 0 }, { name: 'Player 2', score: 0 }], current: 0, turns: [], ended: false };
  render();
  state = null;
  openSetup(true);
}
loadDict(savedDictId());
