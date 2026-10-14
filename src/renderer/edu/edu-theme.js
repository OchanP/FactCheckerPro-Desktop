/* FactChecker Pro Education: appearance. Mode (light, dark, system), accent colour, card style,
   density and calm motion. Stored on this device, applied before the first view is drawn. */
(function () {
  'use strict';
  const KEY = 'edu-theme';
  const ACCENTS = {
    indigo:  { name: 'Indigo',  a: ['#2563eb', '#4f46e5', '#7c3aed'], rgb: '79,70,229',  side: ['#172554', '#1e1b6b'] },
    ocean:   { name: 'Ocean',   a: ['#0284c7', '#0891b2', '#0d9488'], rgb: '8,145,178',  side: ['#082f49', '#0c4a6e'] },
    forest:  { name: 'Forest',  a: ['#15803d', '#16a34a', '#65a30d'], rgb: '22,163,74',  side: ['#052e16', '#14532d'] },
    sunset:  { name: 'Sunset',  a: ['#ea580c', '#e11d48', '#c026d3'], rgb: '225,29,72',  side: ['#431407', '#4c0519'] },
    rose:    { name: 'Rose',    a: ['#db2777', '#e11d48', '#f97316'], rgb: '219,39,119', side: ['#500724', '#4c0519'] },
    slate:   { name: 'Slate',   a: ['#475569', '#334155', '#1e293b'], rgb: '71,85,105',  side: ['#0f172a', '#1e293b'] },
  };
  const DEFAULTS = { mode: 'light', accent: 'indigo', custom: '#4f46e5', cards: 'soft', compact: false, calm: false };
  const MODES = [['light', 'Light', 'sw-light'], ['dark', 'Dark', 'sw-dark'], ['system', 'Match my device', 'sw-system']];
  const CARDS = [['flat', 'Flat', 'sw-flat'], ['soft', 'Soft', 'sw-soft'], ['float', 'Floating', 'sw-float'], ['glass', 'Glass', 'sw-glass']];

  const hex = h => /^#[0-9a-f]{6}$/i.test(h) ? h : DEFAULTS.custom;
  const rgbOf = h => { const n = parseInt(hex(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (h, t, k) => { const c = rgbOf(h), d = rgbOf(t); return '#' + c.map((v, i) => Math.round(v + (d[i] - v) * k).toString(16).padStart(2, '0')).join(''); };

  let cfg = Object.assign({}, DEFAULTS);
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) {}
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const isDark = () => cfg.mode === 'dark' || (cfg.mode === 'system' && mq && mq.matches);

  function apply() {
    const b = document.body; if (!b) return;
    b.classList.toggle('dark', isDark());
    ['flat', 'soft', 'float', 'glass'].forEach(c => b.classList.toggle('cards-' + c, cfg.cards === c));
    b.classList.toggle('compact', !!cfg.compact);
    b.classList.toggle('calm', !!cfg.calm);
    let a, rgb, side;
    if (cfg.accent === 'custom') {
      const c = hex(cfg.custom); a = [mix(c, '#ffffff', 0), c, mix(c, '#7c3aed', 0.35)]; rgb = rgbOf(c).join(','); side = [mix(c, '#000000', 0.82), mix(c, '#000000', 0.7)];
    } else { const x = ACCENTS[cfg.accent] || ACCENTS.indigo; a = x.a; rgb = x.rgb; side = x.side; }
    const s = b.style;
    s.setProperty('--a1', a[0]); s.setProperty('--a2', a[1]); s.setProperty('--a3', a[2]); s.setProperty('--arg', rgb);
    s.setProperty('--side1', side[0]); s.setProperty('--side2', side[1]);
    const btn = document.getElementById('btn-theme');
    if (btn) { btn.querySelector('.ico').textContent = isDark() ? '☀️' : '🌙'; const tr = s => (window.Edu && Edu.t ? Edu.t(s) : s); btn.querySelector('.lbl').textContent = tr(isDark() ? 'Light mode' : 'Dark mode'); btn.setAttribute('aria-pressed', isDark() ? 'true' : 'false'); }
  }
  function save(patch) {
    Object.assign(cfg, patch);
    try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (_) {}
    apply();
    window.dispatchEvent(new CustomEvent('edu-theme', { detail: cfg }));
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', () => { if (cfg.mode === 'system') apply(); });

  // ── floating cards: pointer tilt and light spot, and reveal on scroll ──────
  const CARD_SEL = '.card, .tile, .role-card';
  let raf = 0;
  document.addEventListener('pointermove', e => {
    if (cfg.cards !== 'float' || cfg.calm || e.pointerType === 'touch') return;
    const el = e.target.closest && e.target.closest(CARD_SEL); if (!el) return;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const r = el.getBoundingClientRect(); if (!r.width) return;
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      const tall = r.height > 340 || r.width > 760;          // large cards only get the light spot, no tilt
      el.style.setProperty('--mx', (x * 100).toFixed(1) + '%'); el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
      el.style.setProperty('--ry', tall ? '0deg' : ((x - 0.5) * 7).toFixed(2) + 'deg');
      el.style.setProperty('--rx', tall ? '0deg' : ((0.5 - y) * 6).toFixed(2) + 'deg');
    });
  }, { passive: true });
  document.addEventListener('pointerout', e => {
    const el = e.target.closest && e.target.closest(CARD_SEL);
    if (el && (!e.relatedTarget || !el.contains(e.relatedTarget))) { el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); }
  }, { passive: true });

  let io = null;
  function watchReveal() {
    if (!('IntersectionObserver' in window)) return;
    io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });
    const scan = root => (root.querySelectorAll ? root.querySelectorAll('.main .card:not(.reveal), .main .tile:not(.reveal)') : []).forEach(el => {
      if (cfg.calm) return;
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight * 0.9) return;                   // already on screen, the rise animation handles it
      el.classList.add('reveal'); io.observe(el);
    });
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) scan(n); }))).observe(document.getElementById('view') || document.body, { childList: true, subtree: true });
    scan(document);
  }

  // ── the appearance card shown in Settings ──────────────────────────────────
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function panel() {
    const t = k => (window.Edu && Edu.t ? Edu.t(k) : k);
    const opt = (grp, [v, label, sw]) => `<button type="button" class="theme-opt" data-grp="${grp}" data-v="${v}" aria-pressed="${(grp === 'mode' ? cfg.mode : cfg.cards) === v}"><span class="sw ${sw}"></span>${esc(t(label))}</button>`;
    return `<div class="card" id="theme-card"><h2>${esc(t('Appearance'))}</h2>
      <p class="muted small">${esc(t('Choose how the app looks. This is saved on this device.'))}</p>
      <div class="field"><label>${esc(t('Mode'))}</label><div class="theme-modes">${MODES.map(m => opt('mode', m)).join('')}</div></div>
      <div class="field"><label>${esc(t('Accent colour'))}</label><div class="accent-row">
        ${Object.entries(ACCENTS).map(([k, x]) => `<button type="button" class="accent-dot" data-accent="${k}" title="${esc(x.name)}" aria-label="${esc(x.name)}" aria-pressed="${cfg.accent === k}" style="background:linear-gradient(135deg,${x.a[0]},${x.a[1]},${x.a[2]})"></button>`).join('')}
        <label class="small muted" style="display:flex;align-items:center;gap:8px;margin:0">${esc(t('Your own colour'))} <input type="color" id="theme-custom" value="${hex(cfg.custom)}" aria-label="${esc(t('Your own colour'))}" style="width:2.6rem;height:2.2rem;padding:0;border:0;background:none"></label>
      </div></div>
      <div class="field"><label>${esc(t('Card style'))}</label><div class="theme-cards">${CARDS.map(c => opt('cards', c)).join('')}</div>
        <p class="small muted mt">${esc(t('Floating cards hover above the page, tilt toward your pointer and glow where you point.'))}</p></div>
      <div class="cols2">
        <div class="field"><label class="radio"><input id="theme-compact" type="checkbox" ${cfg.compact ? 'checked' : ''}> <span><b>${esc(t('Compact layout'))}</b><br><span class="muted small">${esc(t('Tighter spacing to show more on screen.'))}</span></span></label></div>
        <div class="field"><label class="radio"><input id="theme-calm" type="checkbox" ${cfg.calm ? 'checked' : ''}> <span><b>${esc(t('Calm motion'))}</b><br><span class="muted small">${esc(t('Turns off floating, tilting and entrance animations.'))}</span></span></label></div>
      </div>
      <div class="row"><button type="button" class="btn ghost small" id="theme-reset">${esc(t('Reset appearance'))}</button></div>
    </div>`;
  }
  function bind(root) {
    root = root || document;
    const card = root.querySelector('#theme-card'); if (!card) return;
    const refresh = () => { card.querySelectorAll('.theme-opt').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.grp === 'mode' ? cfg.mode : cfg.cards) === b.dataset.v))); card.querySelectorAll('.accent-dot').forEach(b => b.setAttribute('aria-pressed', String(cfg.accent === b.dataset.accent))); };
    card.querySelectorAll('.theme-opt').forEach(b => b.onclick = () => { save(b.dataset.grp === 'mode' ? { mode: b.dataset.v } : { cards: b.dataset.v }); refresh(); });
    card.querySelectorAll('.accent-dot').forEach(b => b.onclick = () => { save({ accent: b.dataset.accent }); refresh(); });
    const cu = card.querySelector('#theme-custom'); cu.oninput = () => { save({ accent: 'custom', custom: cu.value }); refresh(); };
    card.querySelector('#theme-compact').onchange = e => save({ compact: e.target.checked });
    card.querySelector('#theme-calm').onchange = e => save({ calm: e.target.checked });
    card.querySelector('#theme-reset').onclick = () => { save(Object.assign({}, DEFAULTS)); const n = document.querySelector('#theme-card'); if (n) { n.outerHTML = panel(); bind(document); } };
  }

  window.EduTheme = { get: () => Object.assign({}, cfg), set: save, apply, panel, bind, toggle: () => save({ mode: isDark() ? 'light' : 'dark' }) };
  function start() {
    apply();
    const btn = document.getElementById('btn-theme');
    if (btn) btn.onclick = () => window.EduTheme.toggle();
    watchReveal();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
