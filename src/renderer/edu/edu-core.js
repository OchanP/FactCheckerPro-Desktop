/* FactChecker Pro Education: core helpers (api, rendering, dialogs, accessibility). */
(function () {
  'use strict';

  const Edu = window.Edu = {
    me: null,          // { user, profile, badges }
    ref: null,         // reference data from /edu/reference
    role: null,        // 'teacher' | 'student' | null
    route: null,
    views: {},         // name -> function(params)
  };

  // ── language: Dutch and English ────────────────────────────────────────────
  (function () {
    let l = null;
    try { l = localStorage.getItem('edu-lang'); } catch (_) {}
    if (l !== 'nl' && l !== 'en') l = /^nl/i.test(navigator.language || '') ? 'nl' : 'en';
    Edu.lang = l;
    document.documentElement.lang = l;
  })();
  Edu.locale = () => (Edu.lang === 'nl' ? 'nl-NL' : 'en-GB');
  Edu.setLang = function (l) {
    try { localStorage.setItem('edu-lang', l); } catch (_) {}
    location.reload();
  };

  // ── safe text and html ─────────────────────────────────────────────────────
  const esc = Edu.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  Edu.$ = (sel, root) => (root || document).querySelector(sel);
  Edu.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  Edu.words = s => (String(s || '').trim().match(/\S+/g) || []).length;

  Edu.fmtDate = iso => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString(Edu.locale(), { day: 'numeric', month: 'short', year: 'numeric' });
  };
  Edu.fmtDateTime = iso => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString(Edu.locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  Edu.toLocalInput = iso => {
    if (!iso) return '';
    const d = new Date(iso); if (isNaN(d)) return '';
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  /** { text, cls } describing a deadline in words, never by colour alone. */
  Edu.dueInfo = iso => {
    if (!iso) return { text: 'No deadline', cls: '' };
    const ms = new Date(iso) - Date.now();
    const days = Math.ceil(ms / 86400000);
    if (ms < 0) return { text: 'Past due ' + Edu.fmtDate(iso), cls: 'bad' };
    if (days <= 1) return { text: 'Due ' + Edu.fmtDateTime(iso), cls: 'warn' };
    if (days <= 3) return { text: 'Due in ' + days + ' days', cls: 'warn' };
    return { text: 'Due ' + Edu.fmtDate(iso), cls: '' };
  };

  Edu.chip = (text, cls, icon) => `<span class="chip ${cls || ''}">${icon ? `<span aria-hidden="true">${icon}</span>` : ''}${esc(text)}</span>`;
  Edu.statusChip = status => {
    switch (status) {
      case 'reviewed': return Edu.chip('Reviewed', 'ok', '✔');
      case 'submitted': return Edu.chip('Submitted', 'info', '➜');
      case 'draft': return Edu.chip('In progress', 'warn', '✎');
      default: return Edu.chip('Not started', '', '○');
    }
  };
  Edu.conclusionLabel = key => ((Edu.ref && Edu.ref.conclusions.find(c => c.key === key)) || {}).label || key || 'No conclusion';
  Edu.compName = key => ((Edu.ref && Edu.ref.competencies.find(c => c.key === key)) || {}).name || key;

  // ── backend calls (through the main process) ────────────────────────────────
  Edu.api = async function (path, method, body) {
    let res;
    try {
      res = await fc.runtime.sendMessage({ type: 'FC_API', path: '/edu' + path + (path.includes('?') ? '&' : '?') + 'lang=' + Edu.lang, method: method || 'GET', body });
    } catch (e) {
      throw new Error('Could not reach the app. Restart FactChecker Pro and try again.');
    }
    if (res && res.ok) return res.data;
    const data = (res && res.data) || {};
    const err = new Error(data.error || (res && res.status === 0 ? 'No connection to the FactChecker Pro server. Check your internet and try again.' : 'Something went wrong.'));
    err.status = res && res.status;
    err.data = data;
    if (res && res.status === 401) err.signedOut = true;
    throw err;
  };
  const get = Edu.get = path => Edu.api(path, 'GET');
  Edu.post = (path, body) => Edu.api(path, 'POST', body || {});
  Edu.put = (path, body) => Edu.api(path, 'PUT', body || {});
  Edu.patch = (path, body) => Edu.api(path, 'PATCH', body || {});
  Edu.del = (path, body) => Edu.api(path, 'DELETE', body || {});

  // ── rendering ──────────────────────────────────────────────────────────────
  Edu.announce = msg => { const a = document.getElementById('announcer'); a.textContent = ''; setTimeout(() => { a.textContent = msg; }, 30); };

  /** Replaces the main area. `title` becomes the page heading and the window title. */
  Edu.render = function (title, html, opts) {
    const view = document.getElementById('view');
    view.innerHTML = `<div class="wrap">${html}</div>`;
    document.title = title + ' | FactChecker Pro Education';
    const h1 = view.querySelector('h1');
    if (h1) { h1.id = 'view-title'; h1.tabIndex = -1; }
    if (!(opts && opts.keepScroll)) view.scrollTop = 0;
    if (!(opts && opts.noFocus)) { (h1 || view).focus({ preventScroll: true }); }
    Edu.announce(title);
  };
  Edu.loading = (msg) => { document.getElementById('view').innerHTML = `<div class="loading" role="status">${esc(msg || 'Loading')}</div>`; };

  Edu.errorView = function (err, retry) {
    const view = document.getElementById('view');
    view.innerHTML = `<div class="wrap"><h1 id="view-title" tabindex="-1">Something went wrong</h1>
      <div class="form-error mt" role="alert">${esc(err.message || err)}</div>
      <div class="row mt"><button class="btn" id="err-retry" type="button">Try again</button></div></div>`;
    document.getElementById('err-retry').onclick = retry || (() => Edu.go('home'));
    document.getElementById('view-title').focus();
  };

  Edu.toast = (msg, isErr) => {
    const host = document.getElementById('toasts');
    const t = document.createElement('div');
    t.className = 'toast' + (isErr ? ' err' : '');
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(() => t.remove(), isErr ? 7000 : 3800);
  };

  // ── dialogs ────────────────────────────────────────────────────────────────
  Edu.dialog = function ({ title, body, actions }) {
    return new Promise(resolve => {
      const dlg = document.getElementById('dialog');
      dlg.innerHTML = `<form method="dialog"><h2 id="dialog-title">${esc(title)}</h2><div class="dlg-body">${body || ''}</div>
        <div class="actions">${(actions || []).map((a, i) => `<button class="btn ${a.cls || ''}" type="${a.submit ? 'submit' : 'button'}" data-i="${i}" value="${esc(a.value)}">${esc(a.label)}</button>`).join('')}</div></form>`;
      const prev = document.activeElement;
      const finish = v => { if (dlg.open) dlg.close(); dlg.innerHTML = ''; if (prev && prev.focus) prev.focus(); resolve(v); };
      Edu.$$('button', dlg).forEach(b => {
        const a = actions[Number(b.dataset.i)];
        b.onclick = ev => {
          ev.preventDefault();
          if (a.validate) { const out = a.validate(dlg); if (out === false) return; return finish(out === undefined ? a.value : out); }
          finish(a.value);
        };
      });
      dlg.oncancel = ev => { ev.preventDefault(); finish(null); };
      dlg.showModal();
      const first = dlg.querySelector('input,textarea,select') || dlg.querySelector('button');
      if (first) first.focus();
    });
  };
  Edu.confirm = (title, message, okLabel, danger) => Edu.dialog({
    title, body: `<p>${esc(message)}</p>`,
    actions: [{ label: 'Cancel', value: false }, { label: okLabel || 'OK', value: true, cls: danger ? 'danger' : '' }],
  }).then(v => v === true);
  /** Asks for typed confirmation (for example DELETE). */
  Edu.confirmTyped = (title, message, word) => Edu.dialog({
    title,
    body: `<p>${esc(message)}</p><div class="field mt"><label for="typed">Type <b>${esc(word)}</b> to confirm</label><input id="typed" type="text" autocomplete="off"></div>`,
    actions: [{ label: 'Cancel', value: false }, { label: 'Delete', value: true, cls: 'danger', validate: d => d.querySelector('#typed').value.trim() === word ? true : false }],
  }).then(v => v === true);
  Edu.prompt = (title, label, value, hint) => Edu.dialog({
    title,
    body: `<div class="field"><label for="p-in">${esc(label)}${hint ? ` <span class="hint">${esc(hint)}</span>` : ''}</label><input id="p-in" type="text" value="${esc(value || '')}"></div>`,
    actions: [{ label: 'Cancel', value: null }, { label: 'Save', value: 'ok', validate: d => d.querySelector('#p-in').value.trim() || false }],
  });

  // ── navigation ─────────────────────────────────────────────────────────────
  Edu.go = function (name, params) {
    Edu.route = { name, params: params || {} };
    Edu.markNav(name);
    const fn = Edu.views[name];
    if (!fn) { Edu.errorView(new Error('That page does not exist.')); return; }
    Edu.loading();
    Promise.resolve(fn(params || {})).catch(err => {
      if (err && err.signedOut) return Edu.signOut(true);
      console.warn('[Edu] view failed', name, err);
      Edu.errorView(err, () => Edu.go(name, params));
    });
  };
  Edu.markNav = name => {
    Edu.$$('#nav button').forEach(b => {
      const on = (b.dataset.nav === name) || (b.dataset.also || '').split(',').includes(name);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  };

  Edu.signOut = async function (expired) {
    if (!expired && !(await Edu.confirm('Sign out', 'Sign out of FactChecker Pro Education?', 'Sign out'))) return;
    await fc.runtime.sendMessage({ type: 'FC_AUTH_LOGOUT' });
    await fc.runtime.sendMessage({ type: 'FC_OPEN_AUTH' });
    window.close();
  };

  /** Reads and writes the text size and contrast settings. */
  Edu.applyDisplay = function (scale, contrast) {
    const s = Math.max(85, Math.min(160, Number(scale) || 100));
    document.documentElement.style.fontSize = s + '%';
    document.body.classList.toggle('hc', !!contrast);
    try { localStorage.setItem('edu-display', JSON.stringify({ s, c: !!contrast })); } catch (_) {}
  };
  Edu.restoreDisplay = function () {
    try { const d = JSON.parse(localStorage.getItem('edu-display') || 'null'); if (d) Edu.applyDisplay(d.s, d.c); } catch (_) {}
  };

  /** Saves a text file through a native save dialog. */
  Edu.saveFile = async function (filename, content) {
    const r = await fc.runtime.sendMessage({ type: 'FC_SAVE_FILE', filename, content });
    if (r && r.ok) Edu.toast('Saved to ' + r.path);
    else if (r && !r.canceled) Edu.toast((r && r.error) || 'Could not save the file.', true);
  };
  Edu.csv = rows => rows.map(r => r.map(v => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;          // stops spreadsheet formula injection
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n');

  Edu.bar = pct => `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct || 0)}"><span style="width:${Math.max(0, Math.min(100, pct || 0))}%"></span></div>`;
  Edu.sparkline = history => {
    if (!history || !history.length) return '';
    return `<span class="spark" aria-hidden="true">${history.slice(-8).map(h => `<i style="height:${Math.max(4, Math.round(h.score * 0.26))}px"></i>`).join('')}</span>`;
  };
  Edu.SRC_LABELS = { news: 'News organisation', official_data: 'Official data or government', academic: 'Academic or research', fact_check: 'Fact checking group', organisation: 'Company or organisation', social_media: 'Social media', original_document: 'Original document', expert: 'Expert or witness', other: 'Other' };
  Edu.KIND_LABELS = { supporting: 'Supports the claim', contradicting: 'Challenges the claim', context: 'Background context' };
  Edu.REL_LABELS = { '': 'Not rated yet', high: 'High', medium: 'Medium', low: 'Low' };
  Edu.opts = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${esc(k)}" ${String(sel) === k ? 'selected' : ''}>${esc(v)}</option>`).join('');
  Edu.openExternal = url => fc.runtime.sendMessage({ type: 'FC_OPEN_EXTERNAL', url });
  Edu.copy = async (text, msg) => { try { await navigator.clipboard.writeText(text); Edu.toast(msg || 'Copied'); } catch (_) { Edu.toast(text); } };
  Edu.empty = (icon, title, text, btn) => `<div class="card empty"><div class="big" aria-hidden="true">${icon}</div><h3>${esc(title)}</h3><p>${esc(text || '')}</p>${btn || ''}</div>`;
})();
