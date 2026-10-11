/**
 * FactChecker Pro: features ported from the mobile app, one file shared by the
 * browser extension dashboard and the desktop hub (keep both copies identical).
 *
 * Adds: Podcasts player, News Videos (with a History explorer by year and topic),
 * Conflict Watch, Job Offer Check with job leads, Activity feed, credits chip and
 * "How credits work", the engage dock (poll, tip, sponsor, comments), reactions,
 * and interests, audience and privacy on the profile.
 *
 * Host differences are handled in two small places: api() and openExternal().
 */
(function () {
  'use strict';
  if (window.__fcpExtras) return;
  window.__fcpExtras = true;

  const IS_DESKTOP = !!(window.fc && window.fc.runtime);
  const BACKEND = 'https://factchecker-pro-production.up.railway.app';
  const LANG = ((navigator.language || 'en').slice(0, 2) || 'en').toLowerCase();

  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
  const store = {
    get(k, d) { try { const v = localStorage.getItem('fx_' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem('fx_' + k, JSON.stringify(v)); } catch (_) {} },
  };

  // ── Host adapter ───────────────────────────────────────────────────────────
  async function extToken() {
    try { const r = await chrome.storage.sync.get('authToken'); return r.authToken || ''; } catch (_) { return ''; }
  }
  async function api(path, opts) {
    const { method = 'GET', body } = opts || {};
    if (IS_DESKTOP) {
      try { return (await window.fc.runtime.sendMessage({ type: 'FC_API', path, method, body })) || { ok: false, status: 0, data: {} }; }
      catch (_) { return { ok: false, status: 0, data: { error: 'Network error' } }; }
    }
    const go = async () => {
      const t = await extToken();
      const res = await fetch(BACKEND + '/api' + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      let data = {};
      try { data = await res.json(); } catch (_) {}
      return { ok: res.ok, status: res.status, data };
    };
    try {
      let r = await go();
      if (r.status === 401 && r.data && r.data.code === 'TOKEN_EXPIRED') {
        try { await chrome.runtime.sendMessage({ type: 'FC_REFRESH_API_PROFILE' }); } catch (_) {}
        r = await go();
      }
      return r;
    } catch (_) { return { ok: false, status: 0, data: { error: 'Network error' } }; }
  }
  function openExternal(url) {
    if (!/^https?:\/\//i.test(url || '')) return;
    if (IS_DESKTOP) window.fc.runtime.sendMessage({ type: 'FC_OPEN_EXTERNAL', url }).catch(() => {});
    else window.open(url, '_blank', 'noopener');
  }
  const signInHint = () => `<div class="fx-empty">Sign in to use this. Open your profile and sign in, it takes a minute.</div>`;
  const ago = iso => {
    const d = new Date(iso); if (isNaN(d)) return '';
    const m = Math.floor((Date.now() - d.getTime()) / 60000);
    if (m < 60) return Math.max(1, m) + 'm ago';
    if (m < 1440) return Math.floor(m / 60) + 'h ago';
    if (m < 43200) return Math.floor(m / 1440) + 'd ago';
    return Math.floor(m / 43200) + 'mo ago';
  };
  const clock = s => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0'); };

  // ── Styles ─────────────────────────────────────────────────────────────────
  const css = `
.fx-root{max-width:980px}
.fx-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}
.fx-chip{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:999px;padding:6px 13px;font-size:13px;font-weight:600;cursor:pointer}
.fx-chip:hover{border-color:#1d4ed8}
.fx-chip.on{background:#1d4ed8;border-color:#1d4ed8;color:#fff}
.fx-btn{border:0;background:#1d4ed8;color:#fff;border-radius:10px;padding:9px 16px;font-weight:700;font-size:13.5px;cursor:pointer}
.fx-btn.sec{background:#e2e8f0;color:#0f172a}
.fx-btn:disabled{opacity:.55;cursor:default}
.fx-input,.fx-select,.fx-area{border:1px solid #cbd5e1;border-radius:10px;padding:9px 12px;font-size:14px;background:#fff;color:#0f172a;font-family:inherit}
.fx-area{width:100%;min-height:120px;box-sizing:border-box;resize:vertical}
.fx-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin:0 0 12px;box-shadow:0 1px 3px rgba(15,23,42,.05)}
.fx-card h3{margin:0 0 6px;font-size:15px;color:#0f172a}
.fx-sub{color:#64748b;font-size:12.5px;line-height:1.4}
.fx-empty{color:#64748b;text-align:center;padding:22px 10px;font-size:14px}
.fx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.fx-vcard{background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;cursor:pointer;display:flex;flex-direction:column}
.fx-vcard:hover{box-shadow:0 6px 18px rgba(15,23,42,.12)}
.fx-vthumb{position:relative;aspect-ratio:16/9;background:#e2e8f0}
.fx-vthumb img{width:100%;height:100%;object-fit:cover;display:block}
.fx-play{position:absolute;inset:0;margin:auto;width:46px;height:46px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;border:2px solid #fff}
.fx-vbody{padding:10px 12px 12px;display:flex;flex-direction:column;gap:6px}
.fx-vtitle{font-weight:800;font-size:14px;line-height:1.3;color:#0f172a}
.fx-vmeta{font-size:12px;color:#1d4ed8;font-weight:700;display:flex;justify-content:space-between;gap:8px}
.fx-vmeta span:last-child{color:#94a3b8;font-weight:500}
.fx-item{display:flex;gap:12px;align-items:flex-start;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:10px;margin:0 0 8px;cursor:pointer}
.fx-item:hover{border-color:#93c5fd}
.fx-item img{width:64px;height:64px;border-radius:10px;object-fit:cover;flex:0 0 auto;background:#e2e8f0}
.fx-item .t{font-weight:700;font-size:14px;color:#0f172a;line-height:1.3}
.fx-item .d{font-size:12.5px;color:#64748b;margin-top:3px;line-height:1.35}
.fx-react{display:flex;flex-wrap:wrap;gap:5px;margin-top:4px}
.fx-react button{border:1px solid #e2e8f0;background:#f8fafc;border-radius:999px;padding:3px 9px;font-size:12px;cursor:pointer;color:#334155}
.fx-react button.on{background:#dbeafe;border-color:#1d4ed8;color:#1e3a8a;font-weight:700}
.fx-badge{display:inline-block;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:800}
.fx-badge.low{background:#dcfce7;color:#166534}.fx-badge.medium{background:#fef3c7;color:#92400e}.fx-badge.high{background:#fee2e2;color:#991b1b}
.fx-list{margin:6px 0 0;padding-left:18px;font-size:13px;color:#334155;line-height:1.5}
.fx-opt{display:block;width:100%;text-align:left;border:1px solid #cbd5e1;background:#fff;border-radius:10px;padding:9px 12px;margin:6px 0;cursor:pointer;font-size:13.5px}
.fx-opt:hover{border-color:#1d4ed8}
.fx-bar{position:relative;border:1px solid #e2e8f0;border-radius:10px;margin:6px 0;padding:8px 12px;overflow:hidden;font-size:13.5px}
.fx-bar i{position:absolute;left:0;top:0;bottom:0;background:#dbeafe;z-index:0}
.fx-bar span{position:relative;z-index:1}
.fx-dock{margin-top:22px;border-top:1px dashed #cbd5e1;padding-top:14px}
.fx-tip{background:#fffbeb;border-color:#fde68a}
.fx-sponsor{background:#f0f9ff;border-color:#bae6fd}
.fx-comment{padding:7px 0;border-bottom:1px solid #f1f5f9;font-size:13px}
.fx-comment b{color:#0f172a}
.fx-modal{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}
.fx-sheet{background:#fff;border-radius:16px;max-width:560px;width:100%;max-height:86vh;overflow:auto;padding:20px;color:#0f172a}
.fx-sheet h2{margin:0 0 6px;font-size:19px}
.fx-credit-chip{position:fixed;top:12px;right:18px;z-index:60;background:#fef3c7;color:#78350f;border:1px solid #fde68a;border-radius:999px;padding:5px 12px;font-weight:800;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.12)}
.fx-player{position:fixed;left:0;right:0;bottom:0;z-index:70;background:#0f172a;color:#fff;padding:8px 16px;display:none;align-items:center;gap:14px;box-shadow:0 -6px 20px rgba(0,0,0,.25)}
.fx-player.show{display:flex}
.fx-player img{width:44px;height:44px;border-radius:8px;object-fit:cover}
.fx-player .pt{flex:1;min-width:0}
.fx-player .pt b{display:block;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fx-player .pt span{font-size:11.5px;color:#94a3b8}
.fx-player audio{width:min(420px,40vw);height:34px}
.fx-player button,.fx-player select{background:#1e293b;color:#fff;border:1px solid #334155;border-radius:8px;padding:5px 9px;cursor:pointer;font-size:12.5px}
.fx-ep{display:flex;gap:12px;align-items:center;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;margin:0 0 8px;cursor:pointer}
.fx-ep:hover{border-color:#93c5fd}.fx-ep.now{border-color:#1d4ed8;background:#eff6ff}
.fx-ep .ic{font-size:26px;color:#1d4ed8}
.fx-pshow{display:flex;gap:10px;align-items:center;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:10px;cursor:pointer}
.fx-pshow:hover{border-color:#93c5fd}
.fx-pshow img{width:52px;height:52px;border-radius:10px;object-fit:cover}
.fx-pshow b{font-size:13.5px;display:block}
.fx-brief{background:linear-gradient(135deg,#eff6ff,#f5f3ff);border-color:#c7d2fe}
.fx-unread{border-left:4px solid #1d4ed8}
body.fx-has-player .main,body.fx-has-player main{padding-bottom:84px}
`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ── View registration ──────────────────────────────────────────────────────
  const views = {};
  function addNav(id, icon, label, afterId) {
    if (IS_DESKTOP) {
      const after = document.querySelector(`.nav-item[data-nav="${afterId}"]`) || document.querySelector('.nav-item[data-nav]:last-of-type');
      if (!after) return;
      const li = el(`<li class="nav-item" data-nav="${id}"><span class="nav-icon">${icon}</span> ${esc(label)} <span class="nav-new-badge">NEW</span></li>`);
      li.addEventListener('click', () => window.navigate && window.navigate(id));
      after.parentNode.insertBefore(li, after.nextSibling);
    } else {
      const after = document.querySelector(`.nav-item[data-view="${afterId}"]`) || document.querySelector('.nav-item[data-view]');
      if (!after) return;
      const b = el(`<button class="nav-item" data-view="${id}"><span class="nav-icon">${icon}</span> ${esc(label)} <span class="nav-new-badge">NEW</span></button>`);
      b.addEventListener('click', () => window.switchView && window.switchView(id));
      after.parentNode.insertBefore(b, after.nextSibling);
    }
  }
  function registerView(o) {
    const anchor = document.getElementById('view-podcast-search') || document.querySelector('.view');
    if (!anchor) return null;
    const view = document.createElement(IS_DESKTOP ? 'section' : 'div');
    view.className = 'view';
    view.id = 'view-' + o.id;
    if (!IS_DESKTOP) view.innerHTML = `<div class="view-header"><div><h1 class="view-title">${o.icon} ${esc(o.title)}</h1><p class="view-subtitle">${esc(o.subtitle)}</p></div></div>`;
    const root = document.createElement('div');
    root.className = 'fx-root';
    view.appendChild(root);
    anchor.parentNode.appendChild(view);
    addNav(o.id, o.icon, o.nav || o.title, o.after || 'podcast-search');
    if (IS_DESKTOP && typeof VIEW_META !== 'undefined') VIEW_META[o.id] = [o.icon + ' ' + o.title, o.subtitle];
    let first = true;
    views[o.id] = { show() { if (first) { first = false; o.init(root); } else if (o.refresh) o.refresh(root); } };
    return root;
  }
  function hookNavigation() {
    const name = IS_DESKTOP ? 'navigate' : 'switchView';
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function (id) {
      const r = orig.apply(this, arguments);
      try { if (views[id]) views[id].show(); } catch (e) { console.warn('[FCP extras]', e); }
      return r;
    };
  }

  // ── Modal ──────────────────────────────────────────────────────────────────
  function modal(html) {
    const m = el(`<div class="fx-modal"><div class="fx-sheet">${html}</div></div>`);
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
    return m;
  }

  // ── Credits ────────────────────────────────────────────────────────────────
  let creditsData = null;
  async function loadCredits() {
    const r = await api('/credits');
    if (r.ok) creditsData = r.data;
    const chip = $('#fx-credit-chip');
    if (chip && creditsData) chip.textContent = '🪙 ' + (creditsData.credits || 0);
    return creditsData;
  }
  function earnRows(d) {
    return (d.earn || []).map(e => `<div style="display:flex;gap:10px;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:13.5px">
      <b style="min-width:34px;color:#b45309">+${e.amount}</b>
      <span style="flex:1">${esc(e.label)}${e.daily_cap ? ` <span class="fx-sub">(up to ${e.daily_cap} a day)</span>` : ''}</span>
      ${e.done ? '<span title="Done">✅</span>' : e.left_today === 0 ? '<span class="fx-sub">limit reached</span>' : ''}
    </div>`).join('');
  }
  async function showCreditsSheet() {
    const d = (await loadCredits()) || {};
    const free = d.free_image_rounds || {};
    modal(`<h2>🪙 ${d.credits || 0} credits</h2>
      <p class="fx-sub">${d.pro ? 'Unlimited picture rounds with your plan.' : `Free picture rounds today: ${free.left == null ? '-' : free.left} / ${free.limit == null ? '-' : free.limit}`}</p>
      <p class="fx-sub">Credits pay for AI picture rounds in Spot the Fake after your free rounds for the day are used.</p>
      ${d.signed_in ? '' : '<p style="color:#b45309;font-weight:700">Create a free account to start earning.</p>'}
      <h3 style="margin:14px 0 6px">Ways to earn</h3>${earnRows(d)}`);
  }
  function mountCreditsChip() {
    const chip = el('<div class="fx-credit-chip" id="fx-credit-chip" title="Your credits">🪙</div>');
    chip.addEventListener('click', showCreditsSheet);
    document.body.appendChild(chip);
    loadCredits();
    setInterval(loadCredits, 120000);
    window.addEventListener('fx-credits', loadCredits);
  }
  async function mountHelpCredits() {
    const view = document.getElementById('view-help');
    if (!view) return;
    const d = (await loadCredits()) || {};
    const card = el(`<div class="fx-card" style="max-width:820px"><h3>🪙 How credits work</h3>
      <p class="fx-sub" style="font-size:13.5px">Credits are a thank you for useful things you do. You earn them by taking part, you never need to pay for them.</p>
      <p style="font-size:13.5px;margin:8px 0"><b>What they are for.</b> Every day you get a few free AI picture rounds in Spot the Fake. When those are used up, each extra round costs 1 credit. Pro members have unlimited rounds.</p>
      <p style="font-size:13.5px;margin:8px 0 4px"><b>How to earn credits</b></p>${earnRows(d) || '<div class="fx-sub">Sign in to see the full list.</div>'}
      <p class="fx-sub" style="margin-top:10px">Each action pays once: the same claim, clip or day never pays twice. Daily limits reset at midnight. A claim only earns the verified bonus after it has been checked. Click the coin counter at the top right any time to see your balance and what is left today.</p></div>`);
    const header = view.querySelector('.view-header');
    if (header && header.nextSibling) view.insertBefore(card, header.nextSibling); else view.insertBefore(card, view.firstChild);
  }

  // ── Reactions ──────────────────────────────────────────────────────────────
  let reactionTypes = null;
  async function getReactionTypes() {
    if (reactionTypes) return reactionTypes;
    const r = await api('/reactions/types');
    reactionTypes = (r.ok && r.data.reactions) || [{ id: 'legit', emoji: '✅', label: 'Legit' }, { id: 'sus', emoji: '🤨', label: 'Sus' }, { id: 'mind_blown', emoji: '🤯', label: 'Mind blown' }, { id: 'lol', emoji: '😂', label: 'LOL' }, { id: 'cap', emoji: '🧢', label: 'Cap' }];
    return reactionTypes;
  }
  function reactionBarHtml(url, title, source) {
    return `<div class="fx-react" data-url="${esc(url)}" data-title="${esc(title)}" data-source="${esc(source || '')}"></div>`;
  }
  async function hydrateReactions(root) {
    const bars = [...root.querySelectorAll('.fx-react')];
    if (!bars.length) return;
    const types = await getReactionTypes();
    const urls = [...new Set(bars.map(b => b.dataset.url))].slice(0, 60);
    const r = await api('/reactions/batch', { method: 'POST', body: { urls } });
    const items = (r.ok && r.data.items) || {};
    const paint = (bar, info) => {
      const counts = (info && info.counts) || {}, mine = info && info.mine;
      bar.innerHTML = types.map(t => `<button data-r="${t.id}" class="${mine === t.id ? 'on' : ''}" title="${esc(t.label)}">${t.emoji} ${counts[t.id] || ''}</button>`).join('');
    };
    bars.forEach(bar => {
      paint(bar, items[bar.dataset.url]);
      bar.addEventListener('click', async e => {
        e.stopPropagation();
        const b = e.target.closest('button'); if (!b) return;
        const was = b.classList.contains('on');
        const res = await api('/reactions', { method: 'POST', body: { url: bar.dataset.url, title: bar.dataset.title, source: bar.dataset.source, reaction: was ? '' : b.dataset.r } });
        if (res.ok) { paint(bar, res.data); window.dispatchEvent(new Event('fx-credits')); }
      });
    });
  }

  // ── Engage dock: poll, tip, sponsor, comments ──────────────────────────────
  function dock(tool) {
    const d = el(`<div class="fx-dock">
      <div data-slot="poll"></div><div data-slot="tip"></div><div data-slot="sponsor"></div><div data-slot="comments"></div></div>`);
    pollCard($('[data-slot=poll]', d));
    tipCard($('[data-slot=tip]', d));
    sponsorCard($('[data-slot=sponsor]', d), tool);
    commentsCard($('[data-slot=comments]', d), tool);
    return d;
  }
  async function pollCard(box) {
    const r = await api('/engage/poll?lang=' + LANG);
    if (!r.ok || !r.data.question) return;
    const render = p => {
      box.innerHTML = `<div class="fx-card"><h3>📊 Poll of the day</h3><div style="font-weight:600;margin-bottom:6px">${esc(p.question)}</div>
        ${p.voted
          ? p.options.map(o => { const x = (p.results || []).find(z => z.id === o.id) || { percent: 0 }; return `<div class="fx-bar"><i style="width:${x.percent}%"></i><span>${esc(o.text)}${p.my_vote === o.id ? ' ✔' : ''} <b style="float:right">${x.percent}%</b></span></div>`; }).join('') + `<div class="fx-sub">${p.total || 0} votes today</div>`
          : p.options.map(o => `<button class="fx-opt" data-o="${o.id}">${esc(o.text)}</button>`).join('') + `<div class="fx-sub">Vote to see the results. +${p.reward || 1} credit</div>`}
      </div>`;
      box.querySelectorAll('.fx-opt').forEach(b => b.addEventListener('click', async () => {
        const v = await api('/engage/poll/vote?lang=' + LANG, { method: 'POST', body: { option: Number(b.dataset.o) } });
        if (v.ok) { render(v.data); window.dispatchEvent(new Event('fx-credits')); }
      }));
    };
    render(r.data);
  }
  async function tipCard(box) {
    const r = await api('/credits/tip?lang=' + LANG);
    if (!r.ok || !r.data.tip) return;
    const d = r.data;
    box.innerHTML = `<div class="fx-card fx-tip"><h3>💡 ${esc(d.tip.title)}</h3><div style="font-size:13.5px;line-height:1.45">${esc(d.tip.text)}</div>
      <div class="fx-row" style="margin:10px 0 0"><button class="fx-btn" ${d.read ? 'disabled' : ''}>${d.read ? 'Read today' : `Mark as read +${d.reward || 1}`}</button>
      <span class="fx-sub">${d.streak ? '🔥 ' + d.streak + ' day streak' : ''}</span><span class="fx-sub" data-msg></span></div></div>`;
    const btn = $('button', box);
    btn.addEventListener('click', async () => {
      const x = await api('/credits/tip/read', { method: 'POST' });
      if (x.status === 401) { $('[data-msg]', box).textContent = 'Sign in to earn credits.'; return; }
      $('[data-msg]', box).textContent = (x.data && x.data.message) || '';
      btn.disabled = true; btn.textContent = 'Read today';
      window.dispatchEvent(new Event('fx-credits'));
    });
  }
  async function sponsorCard(box, tool) {
    const r = await api(`/engage/sponsor?placement=${encodeURIComponent(tool)}&lang=${LANG}`);
    const s = r.ok && r.data.slot; if (!s) return;
    api('/engage/sponsor/event', { method: 'POST', body: { id: s.id, kind: 'view', placement: tool } });
    box.innerHTML = `<div class="fx-card fx-sponsor"><div class="fx-sub">${s.sponsored ? 'Sponsored' + (s.sponsor ? ' by ' + esc(s.sponsor) : '') : 'From FactChecker Pro'}</div>
      <h3>${esc(s.title)}</h3><div style="font-size:13.5px;line-height:1.45">${esc(s.body)}</div>
      <div style="margin-top:10px"><button class="fx-btn">${esc(s.cta || 'Open')}</button></div></div>`;
    $('button', box).addEventListener('click', () => {
      api('/engage/sponsor/event', { method: 'POST', body: { id: s.id, kind: 'click', placement: tool } });
      openExternal(s.url);
    });
  }
  async function commentsCard(box, tool) {
    const draw = async () => {
      const r = await api('/engage/comments?tool=' + encodeURIComponent(tool));
      const list = (r.ok && r.data.comments) || [];
      $('[data-list]', box).innerHTML = list.length
        ? list.map(c => `<div class="fx-comment"><b>${esc(c.username)}</b> <span class="fx-sub">${ago(c.created_at)}</span><div>${esc(c.body)}</div></div>`).join('')
        : '<div class="fx-sub">No comments yet. Be the first.</div>';
    };
    box.innerHTML = `<div class="fx-card"><h3>💬 What do you think?</h3>
      <div class="fx-row"><input class="fx-input" style="flex:1;min-width:200px" maxlength="280" placeholder="Share a helpful thought (no links)"><button class="fx-btn">Post</button></div>
      <div class="fx-sub" data-msg></div><div data-list></div></div>`;
    $('button', box).addEventListener('click', async () => {
      const input = $('input', box); const msg = $('[data-msg]', box);
      const body = input.value.trim(); if (body.length < 3) { msg.textContent = 'Write a little more.'; return; }
      const r = await api('/engage/comments', { method: 'POST', body: { tool, body } });
      if (r.status === 401) { msg.textContent = 'Sign in to comment.'; return; }
      if (!r.ok) { msg.textContent = (r.data && r.data.error) || 'Could not post.'; return; }
      input.value = ''; msg.textContent = r.data.earned ? `+${r.data.earned} credit` : '';
      window.dispatchEvent(new Event('fx-credits')); draw();
    });
    draw();
  }

  // ── Podcasts ───────────────────────────────────────────────────────────────
  const player = { show: null, ep: null, listenedMs: 0, last: 0, asked: false, bar: null, audio: null };
  function ensurePlayer() {
    if (player.bar) return;
    player.bar = el(`<div class="fx-player" id="fx-player"><img alt=""><div class="pt"><b></b><span></span></div>
      <button data-a="back" title="Back 15 seconds">-15s</button><audio controls preload="none"></audio><button data-a="fwd" title="Forward 30 seconds">+30s</button>
      <select data-a="speed" title="Speed"><option>0.75</option><option selected>1</option><option>1.25</option><option>1.5</option><option>2</option></select>
      <button data-a="close" title="Close">✕</button></div>`);
    document.body.appendChild(player.bar);
    player.audio = $('audio', player.bar);
    player.bar.addEventListener('click', e => {
      const a = e.target.dataset && e.target.dataset.a;
      if (a === 'back') player.audio.currentTime = Math.max(0, player.audio.currentTime - 15);
      if (a === 'fwd') player.audio.currentTime += 30;
      if (a === 'close') { player.audio.pause(); player.bar.classList.remove('show'); document.body.classList.remove('fx-has-player'); }
    });
    $('select', player.bar).addEventListener('change', e => { player.audio.playbackRate = Number(e.target.value); });
    player.audio.addEventListener('timeupdate', async () => {
      const t = player.audio.currentTime;
      const d = t - player.last;
      if (!player.audio.paused && d > 0 && d <= 2.5) player.listenedMs += d * 1000;
      player.last = t;
      if (!player.asked && player.listenedMs >= 120000 && player.ep) {
        player.asked = true;
        const r = await api('/credits/podcast/complete', { method: 'POST', body: { episode: player.ep.audioUrl, seconds: Math.floor(player.listenedMs / 1000) } });
        if (r.ok && r.data.granted) { window.dispatchEvent(new Event('fx-credits')); const s = $('span', player.bar); s.textContent = `+${r.data.amount} credit earned`; }
      }
    });
    player.audio.addEventListener('error', () => { $('span', player.bar).textContent = 'This episode could not be played. Try another one.'; });
  }
  function playEpisode(show, ep) {
    ensurePlayer();
    if (player.ep && player.ep.audioUrl === ep.audioUrl) { player.audio.paused ? player.audio.play() : player.audio.pause(); return; }
    player.show = show; player.ep = ep; player.listenedMs = 0; player.last = 0; player.asked = false;
    $('img', player.bar).src = ep.image || show.artwork || '';
    $('b', player.bar).textContent = ep.title;
    $('span', player.bar).textContent = show.name;
    player.audio.src = ep.audioUrl;
    player.audio.playbackRate = Number($('select', player.bar).value);
    player.audio.play().catch(() => {});
    player.bar.classList.add('show');
    document.body.classList.add('fx-has-player');
    api('/credits/podcast/start', { method: 'POST', body: { episode: ep.audioUrl } });
  }
  const POD_GENRES = [['news', 'News'], ['politics', 'Politics'], ['society', 'Society'], ['history', 'History'], ['science', 'Science'], ['education', 'Education'], ['true-crime', 'True crime'], ['business', 'Business'], ['technology', 'Technology'], ['comedy', 'Comedy']];
  function initPodcasts(root) {
    // Hide the older search-only layout, this view replaces it.
    const old = document.getElementById('view-podcast-search');
    if (old) [...old.children].forEach(c => { if (!c.classList.contains('fx-root') && !c.classList.contains('view-header')) c.style.display = 'none'; });
    let genre = 'news';
    root.innerHTML = `<div class="fx-row"><input class="fx-input" id="fx-pod-q" style="flex:1;min-width:240px;max-width:460px" placeholder="Find a show, e.g. Joe Rogan, The Daily"><button class="fx-btn" id="fx-pod-go">Search</button></div>
      <div class="fx-sub" style="margin-bottom:10px">Listen to episodes and fact-check what you hear. Audio keeps playing while you use other tabs or apps. Listen for 2 minutes to earn a credit.</div>
      <div id="fx-pod-top"><div class="fx-row">${POD_GENRES.map(g => `<button class="fx-chip ${g[0] === genre ? 'on' : ''}" data-g="${g[0]}">${g[1]}</button>`).join('')}</div></div>
      <div id="fx-pod-list"></div><div id="fx-pod-dock"></div>`;
    const list = $('#fx-pod-list', root);
    const showCards = shows => {
      list.innerHTML = shows.length ? `<div class="fx-grid">${shows.map((p, i) => `<div class="fx-pshow" data-i="${i}">${p.artwork ? `<img src="${esc(p.artwork)}" alt="">` : '<div style="font-size:30px">🎙️</div>'}<div><b>${esc(p.name)}</b><span class="fx-sub">${esc([p.artist, p.genre].filter(Boolean).join(' · '))}</span></div></div>`).join('')}</div>` : '<div class="fx-empty">No shows found.</div>';
      list.querySelectorAll('.fx-pshow').forEach(c => c.addEventListener('click', () => openShow(shows[Number(c.dataset.i)], shows)));
    };
    const loadTop = async () => { list.innerHTML = '<div class="fx-empty">Loading…</div>'; const r = await api(`/podcasts/top?genre=${genre}&country=${LANG === 'nl' ? 'nl' : (navigator.language.split('-')[1] || 'us').toLowerCase()}`); showCards((r.ok && r.data.podcasts) || []); };
    const search = async () => { const q = $('#fx-pod-q', root).value.trim(); if (!q) return loadTop(); list.innerHTML = '<div class="fx-empty">Searching…</div>'; const r = await api('/podcasts/search?limit=15&q=' + encodeURIComponent(q)); showCards((r.ok && r.data.podcasts) || []); };
    const openShow = async (p, back) => {
      list.innerHTML = `<div class="fx-row"><button class="fx-btn sec" id="fx-pod-back">← Back</button></div>
        <div class="fx-card" style="display:flex;gap:14px;align-items:center">${p.artwork ? `<img src="${esc(p.artwork)}" style="width:84px;height:84px;border-radius:12px" alt="">` : ''}<div><h3 style="font-size:17px">${esc(p.name)}</h3><div class="fx-sub">${esc([p.artist, p.genre].filter(Boolean).join(' · '))}</div></div></div>
        <div id="fx-eps"><div class="fx-empty">Loading episodes…</div></div>`;
      $('#fx-pod-back', list).addEventListener('click', () => showCards(back));
      const r = await api('/podcasts/episodes?feed=' + encodeURIComponent(p.feedUrl || ''));
      const eps = (r.ok && r.data.episodes) || [];
      const box = $('#fx-eps', list);
      box.innerHTML = eps.length ? eps.map((e, i) => `<div class="fx-ep ${player.ep && player.ep.audioUrl === e.audioUrl ? 'now' : ''}" data-i="${i}"><div class="ic">▶</div><div style="flex:1;min-width:0"><div class="t" style="font-weight:700;font-size:14px">${esc(e.title)}</div><div class="fx-sub">${[e.published ? new Date(e.published).toLocaleDateString() : '', e.durationSeconds ? clock(e.durationSeconds) : ''].filter(Boolean).join(' · ')}</div></div></div>`).join('') : '<div class="fx-empty">No episodes could be loaded for this show.</div>';
      box.querySelectorAll('.fx-ep').forEach(row => row.addEventListener('click', () => { box.querySelectorAll('.fx-ep').forEach(x => x.classList.remove('now')); row.classList.add('now'); playEpisode(p, eps[Number(row.dataset.i)]); }));
    };
    root.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => { genre = b.dataset.g; root.querySelectorAll('[data-g]').forEach(x => x.classList.toggle('on', x === b)); $('#fx-pod-q', root).value = ''; loadTop(); }));
    $('#fx-pod-go', root).addEventListener('click', search);
    $('#fx-pod-q', root).addEventListener('keydown', e => { if (e.key === 'Enter') search(); });
    loadTop();
    $('#fx-pod-dock', root).appendChild(dock('podcast'));
  }

  // ── News Videos and History explorer ───────────────────────────────────────
  const LOCAL_CODES = ['nl', 'de', 'fr', 'es', 'it', 'gb', 'ie', 'us', 'ca', 'au', 'in', 'ke', 'ng', 'za', 'gh'];
  const VID_TABS = [['local', 'Local'], ['global', 'Global'], ['europe', 'Europe'], ['africa', 'Africa'], ['history', 'History']];
  const HIST_GENRES = [['', 'All'], ['war', 'War'], ['politics', 'Politics'], ['science', 'Science'], ['space', 'Space'], ['disasters', 'Disasters'], ['sports', 'Sports'], ['culture', 'Culture'], ['africa', 'Africa'], ['health', 'Health'], ['economy', 'Economy'], ['media', 'Media']];
  function initVideos(root) {
    let tab = 'global';
    let country = store.get('country', (navigator.language.split('-')[1] || 'gb').toLowerCase());
    if (!LOCAL_CODES.includes(country)) country = 'gb';
    let hGenre = '', hYear = '', hDecade = '';
    root.innerHTML = `<div class="fx-row" id="fx-vtabs">${VID_TABS.map(t => `<button class="fx-chip ${t[0] === tab ? 'on' : ''}" data-t="${t[0]}">${t[1]}</button>`).join('')}</div>
      <div class="fx-sub" style="margin-bottom:10px">News clips from leading channels. Videos open on their publisher's page. Nothing is downloaded or re-hosted.</div>
      <div id="fx-vcontrols"></div><div id="fx-vout"></div><div id="fx-vdock"></div>`;
    const out = $('#fx-vout', root), ctl = $('#fx-vcontrols', root);
    const card = v => {
      const link = v.kind === 'article' ? (v.url || v.watchUrl) : (v.watchUrl || v.url);
      return `<div class="fx-vcard" data-url="${esc(link)}"><div class="fx-vthumb">${v.thumbnail ? `<img loading="lazy" src="${esc(v.thumbnail)}" alt="">` : ''}<div class="fx-play">${v.kind === 'article' ? '📰' : '▶'}</div></div>
        <div class="fx-vbody"><div class="fx-vtitle">${esc(v.title)}</div><div class="fx-vmeta"><span>${esc(v.channel || '')}</span><span>${ago(v.published)}</span></div>${reactionBarHtml(link, v.title, v.channel)}</div></div>`;
    };
    const wire = () => { out.querySelectorAll('.fx-vcard').forEach(c => c.addEventListener('click', e => { if (e.target.closest('.fx-react')) return; openExternal(c.dataset.url); })); hydrateReactions(out); };
    async function loadVideos() {
      out.innerHTML = '<div class="fx-empty">Loading…</div>';
      const q = `/videos?region=${tab}&max=30&fallback=1&lang=${LANG}` + (tab === 'local' ? '&country=' + country : '');
      const r = await api(q);
      const list = (r.ok && r.data.videos) || [];
      out.innerHTML = list.length ? `<div class="fx-grid">${list.map(card).join('')}</div>` : '<div class="fx-empty">No videos right now. Try again in a moment.</div>';
      wire();
    }
    async function loadHistory() {
      const years = []; for (let y = new Date().getFullYear(); y >= 1900; y--) years.push(y);
      const decades = []; for (let d = 1900; d <= new Date().getFullYear(); d += 10) decades.push(d);
      ctl.innerHTML = `<div class="fx-card"><h3>Explore history</h3><div class="fx-row">
        <select class="fx-select" id="fx-hy"><option value="">Any year</option><optgroup label="Decades">${decades.map(d => `<option value="d${d}">${d}s</option>`).join('')}</optgroup><optgroup label="Years">${years.map(y => `<option value="${y}">${y}</option>`).join('')}</optgroup></select>
        <button class="fx-btn sec" id="fx-hs">🎲 Surprise me</button></div>
        <div class="fx-row" id="fx-hg">${HIST_GENRES.map(g => `<button class="fx-chip ${g[0] === hGenre ? 'on' : ''}" data-g="${g[0]}">${g[1]}</button>`).join('')}</div>
        <div id="fx-hres"></div></div>`;
      const run = async () => {
        const res = $('#fx-hres', ctl);
        if (!hGenre && !hYear && !hDecade) { res.innerHTML = '<div class="fx-sub">Pick a year or a topic to explore.</div>'; return; }
        res.innerHTML = '<div class="fx-empty">Searching…</div>';
        const r = await api('/videos/history?lang=' + LANG + (hYear ? '&year=' + hYear : hDecade ? '&decade=' + hDecade : '') + (hGenre ? '&genre=' + hGenre : ''));
        const items = (r.ok && r.data.items) || [];
        res.innerHTML = items.length ? items.map((e, i) => `<div class="fx-item" data-i="${i}">${e.image ? `<img src="${esc(e.image)}" alt="">` : '<div style="font-size:30px;width:64px;text-align:center">📜</div>'}<div><div class="t">${esc(e.title)}</div><div class="d">${esc(e.text)}</div></div></div>`).join('') + '<div class="fx-sub">Click a result to find archive footage.</div>' : '<div class="fx-empty">Nothing found for this choice. Try another year or topic.</div>';
        res.querySelectorAll('.fx-item').forEach(n => n.addEventListener('click', () => openExternal(items[Number(n.dataset.i)].footageUrl)));
      };
      $('#fx-hy', ctl).addEventListener('change', e => { const v = e.target.value; hYear = /^\d{4}$/.test(v) ? v : ''; hDecade = v.startsWith('d') ? v.slice(1) : ''; run(); });
      $('#fx-hg', ctl).addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (!b) return; hGenre = b.dataset.g; ctl.querySelectorAll('#fx-hg .fx-chip').forEach(x => x.classList.toggle('on', x === b)); run(); });
      $('#fx-hs', ctl).addEventListener('click', () => { const g = HIST_GENRES.slice(1); hYear = String(1920 + Math.floor(Math.random() * 100)); hDecade = ''; hGenre = g[Math.floor(Math.random() * g.length)][0]; $('#fx-hy', ctl).value = hYear; ctl.querySelectorAll('#fx-hg .fx-chip').forEach(x => x.classList.toggle('on', x.dataset.g === hGenre)); run(); });
      // On this day
      const r = await api('/videos/onthisday?lang=' + LANG);
      const ev = (r.ok && r.data.events) || [];
      out.innerHTML = ev.length ? `<h3 style="margin:6px 0 8px">Today in history</h3>${ev.slice(0, 15).map((e, i) => `<div class="fx-item" data-i="${i}">${e.image ? `<img src="${esc(e.image)}" alt="">` : '<div style="font-size:30px;width:64px;text-align:center">📅</div>'}<div><div class="t" style="color:#1d4ed8">${esc(e.year)}</div><div class="d" style="color:#334155">${esc(e.text)}</div></div></div>`).join('')}<div class="fx-sub">Click an event to find archive footage.</div>` : '';
      out.querySelectorAll('.fx-item').forEach(n => n.addEventListener('click', () => openExternal(ev[Number(n.dataset.i)].footageUrl)));
      const arch = await api(`/videos?region=history&max=20&fallback=1&lang=${LANG}`);
      const list = (arch.ok && arch.data.videos) || [];
      if (list.length) { out.insertAdjacentHTML('beforeend', `<h3 style="margin:16px 0 8px">Archive and history clips</h3><div class="fx-grid">${list.map(card).join('')}</div>`); wire(); }
    }
    async function render() {
      ctl.innerHTML = '';
      if (tab === 'local') {
        ctl.innerHTML = `<div class="fx-row"><span class="fx-sub">Country:</span><select class="fx-select" id="fx-vc">${LOCAL_CODES.map(c => `<option value="${c}" ${c === country ? 'selected' : ''}>${c.toUpperCase()}</option>`).join('')}</select></div>`;
        $('#fx-vc', ctl).addEventListener('change', e => { country = e.target.value; store.set('country', country); loadVideos(); });
      }
      if (tab === 'history') return loadHistory();
      loadVideos();
    }
    $('#fx-vtabs', root).addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; tab = b.dataset.t; root.querySelectorAll('#fx-vtabs .fx-chip').forEach(x => x.classList.toggle('on', x === b)); render(); });
    render();
    $('#fx-vdock', root).appendChild(dock('video'));
  }

  // ── Conflict Watch ─────────────────────────────────────────────────────────
  function initConflict(root) {
    let zones = [], picked = store.get('zones', ['ua', 'ps', 'sd']);
    root.innerHTML = `<div class="fx-sub" style="margin-bottom:8px">War is where disinformation spreads fastest. Pick the places you follow to see the latest news, related fact-checks and trusted accounts on X.</div>
      <div class="fx-row" id="fx-zones"></div><div id="fx-cout"><div class="fx-empty">Loading…</div></div><div id="fx-cdock"></div>`;
    let timer;
    const load = async () => {
      const out = $('#fx-cout', root);
      if (!picked.length) { out.innerHTML = '<div class="fx-empty">Pick at least one place above.</div>'; return; }
      out.innerHTML = '<div class="fx-empty">Loading…</div>';
      const r = await api(`/conflict/feed?zones=${picked.join(',')}&max=40&lang=${LANG}`);
      if (!r.ok) { out.innerHTML = '<div class="fx-empty">Could not load conflict news right now.</div>'; return; }
      const d = r.data, news = d.news || [], deb = d.debunks || [], acc = d.accounts || [], tips = d.tips || [];
      out.innerHTML = `<h3 style="margin:6px 0 8px">Latest news</h3>${news.length ? news.map((n, i) => `<div class="fx-item" data-n="${i}">${n.image ? `<img src="${esc(n.image)}" alt="">` : `<div style="font-size:30px;width:64px;text-align:center">${esc(n.flag || '📰')}</div>`}<div style="flex:1"><div class="t">${esc(n.title)}</div><div class="d">${esc((n.source && n.source.name) || '')} · ${esc(n.zoneName || '')} · ${ago(n.publishedAt)}</div>${reactionBarHtml(n.url, n.title, n.source && n.source.name)}</div></div>`).join('') : '<div class="fx-empty">No news found for this choice.</div>'}
        ${deb.length ? `<h3 style="margin:16px 0 8px">Related fact-checks</h3>${deb.map((x, i) => `<div class="fx-item" data-d="${i}"><div style="font-size:26px">🔎</div><div><div class="t">${esc(x.text)}</div><div class="d"><b>${esc(x.rating)}</b> · ${esc(x.publisher)} · ${esc(x.zoneName || '')}</div></div></div>`).join('')}` : ''}
        ${acc.length ? `<h3 style="margin:16px 0 8px">Trusted accounts on X</h3>${acc.map((a, i) => `<div class="fx-item" data-a="${i}"><div style="font-size:26px">𝕏</div><div><div class="t">${esc(a.name)} <span class="fx-sub">@${esc(a.handle)}</span></div><div class="d">${esc(a.about)}</div></div></div>`).join('')}` : ''}
        ${tips.length ? `<div class="fx-card fx-tip" style="margin-top:16px"><h3>How to read war news</h3><ul class="fx-list">${tips.map(t => `<li>${esc(typeof t === 'string' ? t : (t.text || t.title || ''))}</li>`).join('')}</ul></div>` : ''}`;
      out.querySelectorAll('[data-n]').forEach(n => n.addEventListener('click', e => { if (e.target.closest('.fx-react')) return; openExternal(news[Number(n.dataset.n)].url); }));
      out.querySelectorAll('[data-d]').forEach(n => n.addEventListener('click', () => openExternal(deb[Number(n.dataset.d)].url)));
      out.querySelectorAll('[data-a]').forEach(n => n.addEventListener('click', () => openExternal(acc[Number(n.dataset.a)].url)));
      hydrateReactions(out);
    };
    (async () => {
      const r = await api('/conflict/zones');
      zones = (r.ok && r.data.zones) || [];
      $('#fx-zones', root).innerHTML = zones.map(z => `<button class="fx-chip ${picked.includes(z.code) ? 'on' : ''}" data-z="${z.code}">${esc(z.flag)} ${esc(z.name)}</button>`).join('');
      $('#fx-zones', root).addEventListener('click', e => {
        const b = e.target.closest('[data-z]'); if (!b) return;
        const c = b.dataset.z;
        picked = picked.includes(c) ? picked.filter(x => x !== c) : [...picked, c].slice(0, 8);
        store.set('zones', picked); b.classList.toggle('on', picked.includes(c));
        clearTimeout(timer); timer = setTimeout(load, 500);
      });
      load();
    })();
    $('#fx-cdock', root).appendChild(dock('conflict'));
  }

  // ── Job Offer Check and leads ──────────────────────────────────────────────
  function initJobs(root) {
    root.innerHTML = `<div class="fx-card"><h3>🛡️ Check a job offer</h3><div class="fx-sub" style="margin-bottom:8px">Paste a job ad or recruiter message. AI looks for scam signs like fees, unrealistic pay, chat-app contact and requests for ID or bank details.</div>
      <textarea class="fx-area" id="fx-jtext" placeholder="Paste the job offer here"></textarea>
      <div class="fx-row" style="margin-top:8px"><button class="fx-btn" id="fx-jcheck">Check this offer</button></div><div id="fx-jres"></div></div>
      <div class="fx-card"><h3>🔎 Find job leads</h3><div class="fx-sub" style="margin-bottom:8px">Real listings plus links to the main boards for your region. Every lead gets a quick scam screen.</div>
      <div class="fx-row"><input class="fx-input" id="fx-jrole" placeholder="Role, e.g. marketing"><input class="fx-input" id="fx-jskills" placeholder="Skills (optional)"><input class="fx-input" id="fx-jloc" placeholder="Location or country">
      <select class="fx-select" id="fx-jmode"><option value="any">Any</option><option value="remote">Remote</option><option value="onsite">On site</option></select><button class="fx-btn" id="fx-jfind">Search</button></div><div id="fx-jleads"></div></div><div id="fx-jdock"></div>`;
    $('#fx-jcheck', root).addEventListener('click', async () => {
      const text = $('#fx-jtext', root).value.trim(); const out = $('#fx-jres', root);
      if (text.length < 20) { out.innerHTML = '<div class="fx-sub" style="margin-top:8px">Paste more of the job offer to check it.</div>'; return; }
      out.innerHTML = '<div class="fx-empty">Checking…</div>';
      const r = await api('/jobs/check', { method: 'POST', body: { text } });
      if (!r.ok) { out.innerHTML = `<div class="fx-sub" style="margin-top:8px">${esc((r.data && r.data.error) || 'Could not check this offer right now.')}</div>`; return; }
      const d = r.data;
      const list = (t, a) => a && a.length ? `<h3 style="margin:10px 0 0;font-size:13.5px">${t}</h3><ul class="fx-list">${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
      out.innerHTML = `<div style="margin-top:12px"><span class="fx-badge ${esc(d.risk)}">${esc(String(d.risk).toUpperCase())} RISK</span> <span class="fx-sub">scam score ${Math.round(d.score)}/100</span><p style="font-size:13.5px;margin:8px 0">${esc(d.summary)}</p>${list('Red flags', d.red_flags)}${list('Good signs', d.good_signs)}${list('How to verify', d.verify_steps)}</div>`;
    });
    $('#fx-jfind', root).addEventListener('click', async () => {
      const role = $('#fx-jrole', root).value.trim(), skills = $('#fx-jskills', root).value.trim(), location = $('#fx-jloc', root).value.trim(), mode = $('#fx-jmode', root).value;
      const out = $('#fx-jleads', root);
      if (!role && !skills) { out.innerHTML = '<div class="fx-sub" style="margin-top:8px">Tell us the kind of job you want, for example marketing or nurse.</div>'; return; }
      out.innerHTML = '<div class="fx-empty">Searching…</div>';
      const r = await api(`/jobs/leads?role=${encodeURIComponent(role)}&skills=${encodeURIComponent(skills)}&location=${encodeURIComponent(location)}&mode=${mode}`);
      if (!r.ok) { out.innerHTML = `<div class="fx-sub" style="margin-top:8px">${esc((r.data && r.data.error) || 'Could not load job leads right now.')}</div>`; return; }
      const leads = r.data.leads || [];
      out.innerHTML = '<div style="margin-top:10px"></div>' + leads.map((l, i) => `<div class="fx-item" data-i="${i}"><div style="font-size:24px">${l.search ? '🔗' : '💼'}</div><div style="flex:1"><div class="t">${esc(l.title)}</div><div class="d">${esc([l.company, l.location, l.remote ? 'Remote' : ''].filter(Boolean).join(' · '))}${l.match ? ' · ' + l.match + '% match' : ''}</div><div class="d">${esc(l.summary || '')}</div>${l.safety && l.safety !== 'ok' ? `<div class="d" style="color:#b45309">⚠ ${esc(l.safety)}${(l.safety_flags || []).length ? ': ' + esc(l.safety_flags.join(', ')) : ''}</div>` : ''}</div></div>`).join('');
      out.querySelectorAll('.fx-item').forEach(n => n.addEventListener('click', () => openExternal(leads[Number(n.dataset.i)].url)));
    });
    $('#fx-jdock', root).appendChild(dock('jobs'));
  }

  // ── Activity ───────────────────────────────────────────────────────────────
  function initActivity(root) {
    root.innerHTML = '<div class="fx-empty">Loading…</div>';
    const ICON = { claim: '📝', points: '⭐', badge: '🏅', follower: '👤', alert: '🔔' };
    const load = async () => {
      const r = await api('/feed?lang=' + LANG);
      if (r.status === 401) { root.innerHTML = signInHint(); return; }
      if (!r.ok) { root.innerHTML = '<div class="fx-empty">Could not load your activity right now.</div>'; return; }
      const d = r.data, items = d.items || [], b = d.briefing;
      root.innerHTML = `${b ? `<div class="fx-card fx-brief"><h3>☀️ Your daily briefing</h3><div style="font-size:13.5px">🔥 ${b.streak || 0} day streak · score ${b.score || 0} · accuracy ${Math.round(b.accuracy || 0)}%</div>
        ${b.debunk ? `<div style="margin-top:8px;font-size:13.5px"><b>${esc(b.debunk.rating || 'Fact check')}</b>: ${esc(b.debunk.text)} <span class="fx-sub">${esc(b.debunk.publisher || '')}</span></div>` : ''}</div>` : ''}
        <div class="fx-row"><span class="fx-sub">${d.unread || 0} unread</span><button class="fx-btn sec" id="fx-markread">Mark all as read</button></div>
        ${items.length ? items.map((i, n) => `<div class="fx-item ${i.read ? '' : 'fx-unread'}" data-n="${n}"><div style="font-size:24px">${esc(i.emoji || ICON[i.type] || '•')}</div><div style="flex:1"><div class="t">${esc(i.title)}</div><div class="d">${esc(i.body || '')}${i.detail ? ' · ' + esc(i.detail) : ''}</div><div class="d">${ago(i.time)}</div></div></div>`).join('') : '<div class="fx-empty">Nothing yet. Check a claim, play FactPlay or follow a topic and updates will show up here.</div>'}
        <div id="fx-adock"></div>`;
      $('#fx-markread', root).addEventListener('click', async () => { await api('/feed/read', { method: 'POST' }); load(); });
      root.querySelectorAll('[data-n]').forEach(n => n.addEventListener('click', () => { const t = items[Number(n.dataset.n)].target; if (t && t.kind === 'url') openExternal(t.url); }));
      $('#fx-adock', root).appendChild(dock('general'));
    };
    load();
  }

  // ── Profile extras: interests, audience, privacy ───────────────────────────
  async function interestsSheet() {
    const [all, mine] = await Promise.all([api('/engage/interests'), api('/engage/interests/mine')]);
    if (mine.status === 401) { modal(signInHint()); return; }
    const topics = (all.ok && all.data.topics) || [], max = (all.ok && all.data.max) || 8;
    let sel = new Set((mine.ok && mine.data.ids) || []);
    const m = modal(`<h2>Your interests</h2><p class="fx-sub">Pick 3 or more (up to ${max}). We use them to show you things that matter to you. +${(all.data && all.data.reward) || 2} credit the first time.</p>
      <div class="fx-row" id="fx-int">${topics.map(t => `<button class="fx-chip ${sel.has(t.id) ? 'on' : ''}" data-i="${t.id}">${t.emoji} ${esc(t.label)}</button>`).join('')}</div>
      <div class="fx-row"><button class="fx-btn" id="fx-intsave">Save</button><span class="fx-sub" id="fx-intmsg"></span></div>`);
    $('#fx-int', m).addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; const id = b.dataset.i; if (sel.has(id)) sel.delete(id); else if (sel.size < max) sel.add(id); b.classList.toggle('on', sel.has(id)); });
    $('#fx-intsave', m).addEventListener('click', async () => {
      const r = await api('/engage/interests', { method: 'PUT', body: { ids: [...sel] } });
      $('#fx-intmsg', m).textContent = r.ok ? (r.data.earned ? `Saved. +${r.data.earned} credits` : 'Saved.') : 'Could not save.';
      if (r.ok) window.dispatchEvent(new Event('fx-credits'));
    });
  }
  async function mountProfileExtras() {
    const view = document.getElementById('view-profile');
    if (!view) return;
    const card = el(`<div class="fx-card" style="max-width:820px;margin-top:14px"><h3>🌟 Interests, audience and privacy</h3>
      <div class="fx-row"><button class="fx-btn" id="fx-pint">Choose my interests</button><button class="fx-btn sec" id="fx-pshow">Show my name on the leaderboard</button><button class="fx-btn sec" id="fx-phide">Hide my name</button></div>
      <div class="fx-sub" id="fx-pmsg"></div><div id="fx-paud" style="margin-top:10px"></div></div>`);
    view.appendChild(card);
    $('#fx-pint', card).addEventListener('click', interestsSheet);
    const setName = async show => { const r = await api('/auth/profile', { method: 'PATCH', body: { show_name: show } }); $('#fx-pmsg', card).textContent = r.ok ? (show ? 'Your name is shown on the leaderboard.' : 'You now appear as an anonymous fact-checker.') : (r.status === 401 ? 'Sign in first.' : 'Could not save.'); };
    $('#fx-pshow', card).addEventListener('click', () => setName(true));
    $('#fx-phide', card).addEventListener('click', () => setName(false));
    const a = await api('/users/me/audience');
    if (a.ok) {
      const d = a.data;
      $('#fx-paud', card).innerHTML = `<b>My audience</b><div class="fx-sub">${d.followers || 0} followers · ${d.following || 0} following${d.next_milestone ? ` · next milestone at ${d.next_milestone} followers (+5 credits)` : ''}</div>
        ${(d.recent || []).slice(0, 6).map(u => `<div class="fx-sub">${esc(u.display_name || u.username || 'A fact-checker')} started following you</div>`).join('')}`;
    }
  }

  // ── Election Watch Global: African countries and language default ──────────
  async function extendElectionCountries() {
    const sel = document.getElementById('ewg-country-select');
    const langSel = document.getElementById('ewg-lang-select');
    if (!sel) return;
    const r = await api('/electionwatch/global/countries');
    const list = (r.ok && r.data.countries) || [];
    if (!list.length) return;
    const have = new Set([...sel.options].map(o => o.value));
    const add = (v, t) => { if (!have.has(v)) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); have.add(v); } };
    add('africa', '🌍 Africa (general)');
    list.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(c => add(c.code, c.name));
    const langOf = {}; list.forEach(c => { langOf[c.code] = c.lang; });
    // Francophone, Lusophone and Arabic speaking countries default to their language when the app offers it.
    sel.addEventListener('change', () => {
      const l = langOf[sel.value];
      if (l && langSel && [...langSel.options].some(o => o.value === l)) langSel.value = l;
    });
  }

  // ── Boot ───────────────────────────────────────────────────────────────────
  function boot() {
    try {
      registerView({ id: 'videos', icon: '🎬', title: 'News Videos', subtitle: 'Clips from leading channels, plus a history explorer by year and topic', init: initVideos });
      registerView({ id: 'conflict', icon: '🕊️', title: 'Conflict Watch', subtitle: 'News, fact-checks and trusted accounts from conflict zones', init: initConflict, after: 'videos' });
      registerView({ id: 'jobs', icon: '💼', title: 'Job Offer Check', subtitle: 'Spot job scams and find real leads', init: initJobs, after: 'conflict' });
      registerView({ id: 'activity', icon: '🔔', title: 'Activity', subtitle: 'Your claims, points, badges, followers and a daily briefing', init: initActivity, after: 'jobs' });
      // Podcasts reuses the existing podcast-search view and nav item.
      const podView = document.getElementById('view-podcast-search');
      if (podView) {
        const root = document.createElement('div'); root.className = 'fx-root'; podView.appendChild(root);
        let first = true;
        views['podcast-search'] = { show() { if (first) { first = false; initPodcasts(root); } } };
        const nav = document.querySelector('[data-view="podcast-search"], [data-nav="podcast-search"]');
        if (nav) { const t = [...nav.childNodes].find(n => n.nodeType === 3 && /Podcast/.test(n.textContent)); if (t) t.textContent = ' Podcasts '; }
        if (IS_DESKTOP && typeof VIEW_META !== 'undefined') VIEW_META['podcast-search'] = ['🎙️ Podcasts', 'Find a show, listen to episodes and fact-check what you hear'];
        const sub = podView.querySelector('.view-title'); if (sub) sub.textContent = '🎙️ Podcasts';
        const st = podView.querySelector('.view-subtitle'); if (st) st.textContent = 'Find a show, listen to episodes and fact-check what you hear';
      }
      hookNavigation();
      mountCreditsChip();
      mountHelpCredits();
      mountProfileExtras();
      extendElectionCountries();
    } catch (e) { console.warn('[FCP extras] failed to start:', e); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
