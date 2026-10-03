// FactChecker Pro Desktop — Hub window script.
// Talks to the main process exclusively through fc.runtime.sendMessage(),
// the same message vocabulary background.js exposes to the extension's
// dashboard.js, so the account/API layer behaves identically to the extension.

const AVATAR_EMOJIS = ['🙂', '😎', '🦉', '🕵️', '🔍', '📰', '🛡️', '⚖️', '🧠', '🚀'];
const AVATAR_COLORS = ['#1d4ed8', '#9333ea', '#16a34a', '#d97706', '#dc2626', '#0891b2'];

let state = {
  apiUser: null,
  profile: null,
  submissions: [],
  selectedEmoji: AVATAR_EMOJIS[0],
  selectedColor: AVATAR_COLORS[0]
};

// ── Navigation ──────────────────────────────────────────────────────────────
const VIEW_META = {
  overview:    ['Overview',         'Your fact-checking activity at a glance'],
  live:        ['Live Activity',    'Real-time events from the browser extension'],
  check:       ['Check a Claim',    'Submit a claim or statement for fact-checking'],
  submissions: ['My Submissions',   'Claims you have flagged or submitted'],
  leaderboard: ['Leaderboard',      'Top community fact-checkers'],
  profile:     ['Profile',          'Your public fact-checker profile'],
  settings:    ['Settings',         'App preferences'],
  newsfeed:    ['News Feed',        'Top headlines filtered for credibility'],
  history:     ['Browse History',   'Pages analysed by the extension'],
  social:      ['Social Intel',     'Monitor social media claims and activity'],
  help:        ['Help & Support',   'FAQs, troubleshooting and contact info'],
  moderation:  ['Moderation Queue', 'Community claim moderation (admins only)'],
  events:      ['Events',           'Upcoming webinars, workshops and community events']
};

function navigate(tab) {
  document.querySelectorAll('.nav-item[data-nav]').forEach(el => el.classList.toggle('active', el.dataset.nav === tab));
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === 'view-' + tab));
  const meta = VIEW_META[tab] || VIEW_META.overview;
  document.getElementById('view-title').textContent = meta[0];
  document.getElementById('view-subtitle').textContent = meta[1];
  if (tab === 'submissions') loadSubmissions();
  if (tab === 'leaderboard') loadLeaderboard();
  if (tab === 'profile') loadProfileView();
  if (tab === 'live') renderLiveFeed();
}

document.querySelectorAll('.nav-item[data-nav]').forEach(el => {
  el.addEventListener('click', () => navigate(el.dataset.nav));
});

// WhatsApp banner dismiss (7-day snooze)
(function initWaBanner() {
  const banner = document.getElementById('wa-channel-banner');
  const closeBtn = document.getElementById('wa-close-btn');
  if (!banner || !closeBtn) return;
  const snoozed = localStorage.getItem('hub_wa_banner_dismissed');
  if (snoozed && Date.now() < parseInt(snoozed)) {
    banner.style.display = 'none';
  }
  closeBtn.addEventListener('click', () => {
    banner.style.display = 'none';
    localStorage.setItem('hub_wa_banner_dismissed', Date.now() + 7 * 24 * 60 * 60 * 1000);
  });
})();

if (window.fc && window.fc.onNavigate) {
  window.fc.onNavigate((tab) => navigate(tab));
}

// ── Sidebar profile ─────────────────────────────────────────────────────────
function renderSidebar() {
  const avEl = document.getElementById('sp-avatar');
  avEl.textContent = state.profile?.emoji || AVATAR_EMOJIS[0];
  avEl.style.background = state.profile?.color || AVATAR_COLORS[0];
  document.getElementById('sp-name').textContent = state.profile?.name || state.apiUser?.display_name || state.apiUser?.username || 'Guest';

  const user = state.apiUser;
  if (!user) {
    document.getElementById('sp-score').textContent = 'Not signed in';
    return;
  }

  // Show tier badge next to score
  const tier = (user.pro_tier || 'free').toLowerCase();
  const tierLabels = { trial:'Pro Trial', promo60:'Promo 60', basic:'Basic', professional:'Pro', institutional:'Institutional', lifetime:'Lifetime' };
  const tierBadge = tier !== 'free' ? ` · ${tierLabels[tier] || tier}` : '';
  document.getElementById('sp-score').textContent = `${user.transparency_score ?? '—'} pts${tierBadge}`;
}

// ── Trial / promo status banner ──────────────────────────────────────────────
function renderTrialBanner(user) {
  const banner = document.getElementById('trial-banner');
  if (!banner || !user) return;
  const tier = (user.pro_tier || '').toLowerCase();
  if (tier !== 'trial' && tier !== 'promo60') { banner.style.display = 'none'; return; }

  // Calculate expiry
  let expiresAt = user.trial_expires_at
    ? new Date(user.trial_expires_at)
    : user.created_at
      ? new Date(new Date(user.created_at).getTime() + (tier === 'promo60' ? 60 : 30) * 24 * 60 * 60 * 1000)
      : null;

  if (expiresAt && Date.now() > expiresAt.getTime()) { banner.style.display = 'none'; return; }

  const title = tier === 'promo60' ? 'Promo 60 Active' : 'Pro Trial Active';
  const desc  = tier === 'promo60' ? '100 AI analyses/day for 60 days at €5' : '100 AI analyses/day — free for 30 days';
  document.getElementById('trial-banner-title').textContent = title;
  document.getElementById('trial-banner-desc').textContent  = desc;
  document.getElementById('trial-banner-expires').textContent = expiresAt
    ? expiresAt.toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' })
    : 'Active';
  banner.style.display = 'flex';
}

// ── Overview ────────────────────────────────────────────────────────────────
async function loadOverview() {
  const result = await fc.runtime.sendMessage({ type: 'FC_REFRESH_API_PROFILE' });
  if (result && result.ok) {
    state.apiUser = result.user;
    renderTrialBanner(result.user);
    document.getElementById('ov-score').textContent = result.user.transparency_score ?? '—';
    document.getElementById('ov-rank').textContent = result.user.rank_title || '—';
    document.getElementById('ov-accuracy').textContent = result.user.accuracy_rate != null ? `${result.user.accuracy_rate}%` : '—';
    const badgesEl = document.getElementById('ov-badges');
    badgesEl.innerHTML = (result.badges || []).length
      ? result.badges.map(b => `<span class="badge-chip">${escapeHtml(b.icon || '🏆')} ${escapeHtml(b.name || b.label || 'Badge')}</span>`).join('')
      : '<span style="font-size:12px;color:var(--gray400);">No badges yet — submit your first claim to start earning.</span>';
  }
  renderSidebar();

  const subsResult = await fc.runtime.sendMessage({ type: 'FC_GET_SUBMISSIONS' });
  const subs = (subsResult && subsResult.submissions) || [];
  state.submissions = subs;
  document.getElementById('ov-submitted').textContent = subs.length;
  document.getElementById('ov-verified').textContent = subs.filter(s => s.status === 'verified' || s.status === 'debunked').length;

  const recentEl = document.getElementById('ov-recent');
  recentEl.innerHTML = subs.length
    ? subs.slice(0, 5).map(renderSubmissionRow).join('')
    : '<div class="empty-state"><div class="icon">📝</div>No submissions yet. Try "Check a Claim" to submit your first one.</div>';
}

function renderSubmissionRow(s) {
  const text = (s.claim_text || s.claim || '').slice(0, 90);
  const status = s.status || 'pending';
  return `<div style="padding:10px 0;border-bottom:1px solid var(--gray100);display:flex;justify-content:space-between;gap:12px;align-items:center;">
    <span style="font-size:13px;">${escapeHtml(text)}${text.length >= 90 ? '…' : ''}</span>
    <span class="status-pill status-${escapeHtml(status)}">${escapeHtml(status.replace('_', ' '))}</span>
  </div>`;
}

// ── Live Activity ───────────────────────────────────────────────────────────
let liveEvents = [];

function describeLiveEvent(event) {
  switch (event.type) {
    case 'FC_LIVE_ANALYSIS':
      return {
        icon: event.data?.score < 45 ? '⚠️' : '✅',
        title: `${event.data?.hostname || 'Page'} scored ${event.data?.score ?? '—'}/100`,
        detail: event.data?.title || event.data?.url || ''
      };
    case 'FC_LIVE_PAGE_FLAGGED':
      return { icon: '🚩', title: 'Page flagged', detail: event.data?.title || event.data?.url || '' };
    case 'FC_LIVE_CLAIM_FLAGGED':
      return { icon: '📝', title: 'Claim flagged', detail: (event.data?.claim || '').slice(0, 120) };
    default:
      return { icon: '📡', title: event.type, detail: '' };
  }
}

function renderLiveFeed() {
  const list = document.getElementById('live-list');
  if (!liveEvents.length) {
    list.innerHTML = '<div class="empty-state"><div class="icon">📡</div>Browse with the FactChecker Pro extension installed and events will appear here in real time.</div>';
    return;
  }
  list.innerHTML = liveEvents.map((event) => {
    const { icon, title, detail } = describeLiveEvent(event);
    const time = new Date(event.receivedAt || event.ts || Date.now()).toLocaleTimeString();
    return `<div style="padding:10px 0;border-bottom:1px solid var(--gray100);display:flex;gap:10px;align-items:flex-start;">
      <span style="font-size:16px;">${icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;">${escapeHtml(title)}</div>
        ${detail ? `<div style="font-size:12px;color:var(--gray600);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(detail)}</div>` : ''}
      </div>
      <span style="font-size:11px;color:var(--gray400);flex-shrink:0;">${time}</span>
    </div>`;
  }).join('');
}

function setLiveConnected(staleSec) {
  const dot  = document.getElementById('live-conn-dot');
  const desc = document.getElementById('live-conn-desc');
  if (staleSec === null || staleSec === undefined) {
    dot.style.background  = 'var(--gray400)';
    desc.textContent = 'Waiting for the browser extension — make sure FactChecker Pro is active in Chrome.';
    return;
  }
  if (staleSec < 60) {
    dot.style.background  = 'var(--green)';
    desc.textContent = staleSec < 5 ? 'Connected — live events flowing from the browser extension.'
                                     : `Connected — last heartbeat ${staleSec}s ago.`;
  } else if (staleSec < 120) {
    dot.style.background  = '#f59e0b';
    desc.textContent = `Signal weak — last contact ${staleSec}s ago. Keep Chrome open with the extension active.`;
  } else {
    dot.style.background  = '#ef4444';
    desc.textContent = `Disconnected — no signal for ${Math.round(staleSec/60)}m. Reload the extension or reopen Chrome.`;
  }
}

async function pollBridgeStatus() {
  const status = await fc.runtime.sendMessage({ type: 'FC_GET_BRIDGE_STATUS' });
  setLiveConnected(status && status.staleSec !== undefined ? status.staleSec : null);
}

async function initLiveActivity() {
  const result = await fc.runtime.sendMessage({ type: 'FC_GET_RECENT_EVENTS' });
  liveEvents = (result && result.events) || [];
  await pollBridgeStatus();

  // Poll connection status every 10 seconds
  setInterval(pollBridgeStatus, 10000);

  if (fc.onLiveEvent) {
    fc.onLiveEvent((event) => {
      liveEvents.unshift(event);
      if (liveEvents.length > 100) liveEvents.length = 100;
      setLiveConnected(0); // just got a message, staleSec = 0
      const activeView = document.querySelector('.nav-item.active');
      if (activeView && (activeView.dataset.nav === 'live' || activeView.dataset.nav === 'overview'))
        renderLiveFeed();
      // Persist browse events for history tab
      if (event.type === 'FC_LIVE_ANALYSIS') {
        fc.runtime.sendMessage({ type:'FC_SAVE_BROWSE_EVENT', event });
      }
    });
  }
}

// ── Check a Claim ───────────────────────────────────────────────────────────
document.getElementById('check-submit').addEventListener('click', async () => {
  const claim = document.getElementById('check-text').value.trim();
  const url = document.getElementById('check-url').value.trim();
  const category = document.getElementById('check-category').value;
  const priority = document.getElementById('check-priority').value;
  const banner = document.getElementById('check-banner');
  const btn = document.getElementById('check-submit');

  if (claim.length < 20) {
    showBanner(banner, 'error', 'Please enter at least 20 characters describing the claim.');
    return;
  }

  btn.disabled = true; btn.textContent = 'Submitting…';
  const result = await fc.runtime.sendMessage({
    type: 'FC_SAVE_SUBMISSION',
    submission: { claim, url, category, priority }
  });
  btn.disabled = false; btn.textContent = 'Submit for Fact-Check (+5 pts)';

  if (result && result.ok) {
    if (result.offline) {
      showBanner(banner, 'success', 'Saved offline — it will sync once the server is reachable.');
    } else {
      showBanner(banner, 'success', `Submitted! +${result.points_awarded || 5} points. New transparency score: ${result.new_transparency_score ?? '—'}.`);
    }
    document.getElementById('check-text').value = '';
    document.getElementById('check-url').value = '';
  } else {
    showBanner(banner, 'error', (result && result.error) || 'Could not submit the claim. Please try again.');
  }
});

function showBanner(el, kind, msg) {
  el.className = 'banner show banner-' + kind;
  el.textContent = msg;
}

// ── Submissions list ────────────────────────────────────────────────────────
async function loadSubmissions() {
  const el = document.getElementById('sub-list');
  el.innerHTML = '<div class="empty-state">Loading…</div>';
  const result = await fc.runtime.sendMessage({ type: 'FC_GET_SUBMISSIONS' });
  const subs = (result && result.submissions) || [];
  state.submissions = subs;
  el.innerHTML = subs.length
    ? subs.map(renderSubmissionRow).join('')
    : '<div class="empty-state"><div class="icon">📝</div>No submissions yet.</div>';
}

// ── Leaderboard ─────────────────────────────────────────────────────────────
async function loadLeaderboard() {
  const body = document.getElementById('lb-body');
  body.innerHTML = '<tr><td colspan="4" class="empty-state">Loading…</td></tr>';
  const result = await fc.runtime.sendMessage({ type: 'FC_GET_LEADERBOARD' });
  const list = (result && result.leaderboard) || [];
  if (!list.length) {
    body.innerHTML = '<tr><td colspan="4" class="empty-state">No leaderboard data yet.</td></tr>';
    return;
  }
  body.innerHTML = list.map((u, i) => {
    const isMe = state.apiUser && u.username === state.apiUser.username;
    return `<tr class="${isMe ? 'me' : ''}">
      <td>${i + 1}</td>
      <td>${escapeHtml(u.display_name || u.username)}</td>
      <td>${u.transparency_score ?? '—'}</td>
      <td>${escapeHtml(u.rank_title || '—')}</td>
    </tr>`;
  }).join('');
}

// ── Profile ─────────────────────────────────────────────────────────────────
async function loadProfileView() {
  const result = await fc.runtime.sendMessage({ type: 'FC_GET_PROFILE' });
  state.profile = (result && result.profile) || null;
  state.selectedEmoji = state.profile?.emoji || AVATAR_EMOJIS[0];
  state.selectedColor = state.profile?.color || AVATAR_COLORS[0];

  document.getElementById('profile-display').value = state.profile?.name || state.apiUser?.display_name || '';
  document.getElementById('profile-bio').value = state.profile?.bio || '';
  document.getElementById('profile-location').value = state.profile?.location || '';
  renderAvatarPicker();
}

function renderAvatarPicker() {
  const el = document.getElementById('avatar-picker');
  el.innerHTML = AVATAR_EMOJIS.map(e =>
    `<span data-emoji="${e}" class="${e === state.selectedEmoji ? 'selected' : ''}">${e}</span>`
  ).join('');
  el.querySelectorAll('span').forEach(s => s.addEventListener('click', () => {
    state.selectedEmoji = s.dataset.emoji;
    renderAvatarPicker();
  }));
}

document.getElementById('profile-save').addEventListener('click', async () => {
  const name = document.getElementById('profile-display').value.trim();
  const banner = document.getElementById('profile-banner');
  if (!name) { showBanner(banner, 'error', 'Please enter a display name.'); return; }
  const profile = {
    name,
    bio: document.getElementById('profile-bio').value.trim(),
    location: document.getElementById('profile-location').value.trim(),
    emoji: state.selectedEmoji,
    color: state.selectedColor,
    updatedAt: Date.now()
  };
  await fc.runtime.sendMessage({ type: 'FC_SAVE_PROFILE', profile });
  state.profile = profile;
  renderSidebar();
  showBanner(banner, 'success', 'Profile saved.');
});

// ── Settings ────────────────────────────────────────────────────────────────
async function loadSettings() {
  const result = await fc.runtime.sendMessage({ type: 'FC_GET_SETTINGS' });
  const settings = (result && result.settings) || {};
  document.getElementById('set-notifications').checked = settings.notificationsEnabled !== false;
  document.getElementById('set-launch').checked = !!settings.launchAtLogin;
  const langEl = document.getElementById('set-language');
  if (langEl) langEl.value = settings.language || 'en';
}

async function saveSettingsField(patch) {
  const result = await fc.runtime.sendMessage({ type: 'FC_GET_SETTINGS' });
  const settings = { ...((result && result.settings) || {}), ...patch };
  await fc.runtime.sendMessage({ type: 'FC_SAVE_SETTINGS', settings });
}

document.getElementById('set-notifications').addEventListener('change', (e) => {
  saveSettingsField({ notificationsEnabled: e.target.checked });
});
document.getElementById('set-launch').addEventListener('change', (e) => {
  saveSettingsField({ launchAtLogin: e.target.checked });
});

document.getElementById('btn-open-extension-note').addEventListener('click', () => {
  alert('FactChecker Pro Desktop v1.0.0\nCompanion app for the FactChecker Pro browser extension.\nReal-time page scanning still happens in the extension — this app is your account hub.');
});

document.getElementById('set-language')?.addEventListener('change', (e) => {
  saveSettingsField({ language: e.target.value });
});

document.getElementById('btn-promo60')?.addEventListener('click', () => {
  fc.runtime.sendMessage({ type: 'FC_OPEN_EXTERNAL', url: 'https://ko-fi.com/factcheckerpro/tiers' });
});

// Extension promo install buttons — open in system browser via shell
['eps-install-btn', 'help-install-btn'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', (e) => {
    e.preventDefault();
    fc.runtime.sendMessage({ type: 'FC_OPEN_EXTERNAL', url: 'https://chrome.google.com/webstore/search/factchecker%20pro' });
  });
});

// ── Sign out ────────────────────────────────────────────────────────────────
document.getElementById('btn-signout').addEventListener('click', async () => {
  if (!confirm('Sign out of FactChecker Pro?')) return;
  await fc.runtime.sendMessage({ type: 'FC_AUTH_LOGOUT' });
  await fc.runtime.sendMessage({ type: 'FC_OPEN_AUTH' });
  window.close();
});

// ── Utils ───────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Init ────────────────────────────────────────────────────────────────────
(async function init() {
  const userResult = await fc.runtime.sendMessage({ type: 'FC_GET_API_USER' });
  state.apiUser = (userResult && userResult.user) || null;
  const profileResult = await fc.runtime.sendMessage({ type: 'FC_GET_PROFILE' });
  state.profile = (profileResult && profileResult.profile) || null;
  renderSidebar();
  await loadSettings();
  await loadOverview();
  await initLiveActivity();
})();

// ═══════════════════════════════════════════════════════════════════════════
// NEWS FEED
// ═══════════════════════════════════════════════════════════════════════════
const SOURCE_TRUST = {
  'ap':1,'associated press':1,'reuters':1,'bbc':1,'bbc news':1,'npr':1,
  'pbs':1,'the guardian':1,'africa check':1,'fullfact':1,
  'cnn':2,'msnbc':2,'fox news':2,'daily mail':2,'new york post':2,
  'natural news':3,'infowars':3,'breitbart':3,'naturalnews':3,
};
function credBadge(name) {
  const t = SOURCE_TRUST[(name||'').toLowerCase().trim()] || 0;
  if (t===1) return '<span class="cred-badge cred-green">✓ Trusted</span>';
  if (t===2) return '<span class="cred-badge cred-yellow">~ Mixed</span>';
  if (t===3) return '<span class="cred-badge cred-red">⚠ Caution</span>';
  return '<span class="cred-badge cred-gray">Unrated</span>';
}
function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.round(diff/60)}m ago`;
  if (diff < 86400) return `${Math.round(diff/3600)}h ago`;
  return `${Math.round(diff/86400)}d ago`;
}

let nfCat = 'general';
let nfInited = false;

async function loadNewsFeed() {
  const grid = document.getElementById('nf-grid');
  grid.innerHTML = '<div class="empty-state">Loading…</div>';
  const country = document.getElementById('nf-country').value;
  const lang    = document.getElementById('nf-lang').value;
  const result  = await fc.runtime.sendMessage({ type:'FC_GET_NEWS', country, lang, category:nfCat, max:'12' });
  const arts    = result.articles || [];
  if (!arts.length) {
    grid.innerHTML = '<div class="empty-state"><div class="icon">📰</div>No articles found. Try a different country or language.</div>';
    return;
  }
  grid.innerHTML = arts.map(a => {
    const src  = a.source?.name || '';
    const img  = a.image ? `<img class="nf-card-img" src="${escapeHtml(a.image)}" alt="" onerror="this.style.display='none'">` : '<div class="nf-card-img nf-card-img-ph">📰</div>';
    return `<a class="nf-card" href="${escapeHtml(a.url)}" target="_blank" rel="noopener">
      ${img}
      <div class="nf-card-body">
        <div class="nf-card-meta">${escapeHtml(src)} · ${timeAgo(a.publishedAt)}</div>
        <div class="nf-card-title">${escapeHtml(a.title)}</div>
        <div class="nf-card-footer">${credBadge(src)}</div>
      </div>
    </a>`;
  }).join('');
}

function initNewsFeed() {
  if (nfInited) return; nfInited = true;
  document.getElementById('nf-refresh').addEventListener('click', loadNewsFeed);
  document.getElementById('nf-country').addEventListener('change', loadNewsFeed);
  document.getElementById('nf-lang').addEventListener('change', loadNewsFeed);
  document.getElementById('nf-chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#nf-chips .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    nfCat = chip.dataset.cat;
    loadNewsFeed();
  });
  loadNewsFeed();
}

// ═══════════════════════════════════════════════════════════════════════════
// BROWSE HISTORY
// ═══════════════════════════════════════════════════════════════════════════
async function loadBrowseHistory() {
  const el = document.getElementById('hist-list');
  el.innerHTML = '<div class="empty-state">Loading…</div>';

  const result  = await fc.runtime.sendMessage({ type:'FC_GET_BROWSE_HISTORY' });
  const hist    = result.history || [];

  // Merge in-memory live events not yet persisted
  const evResult = await fc.runtime.sendMessage({ type:'FC_GET_RECENT_EVENTS' });
  const liveEvs  = (evResult.events || []).filter(e => e.type === 'FC_LIVE_ANALYSIS');

  // Deduplicate: live events already in hist (same savedAt) are dropped
  const savedAts = new Set(hist.map(h => h.savedAt));
  const newLive  = liveEvs.filter(e => !savedAts.has(e.savedAt));

  // Sort newest-first, using whichever timestamp is present
  const tsOf = e => e.savedAt || e.receivedAt || e.ts || 0;
  const all  = [...hist, ...newLive].sort((a, b) => tsOf(b) - tsOf(a)).slice(0, 100);

  if (!all.length) {
    el.innerHTML = `<div class="empty-state"><div class="icon">🕐</div>No browse history yet.<br><span style="font-size:12px;color:var(--gray400);">Browse pages with the FactChecker Pro extension active and they will appear here automatically.</span></div>`;
    return;
  }

  el.innerHTML = all.map(e => {
    const d      = e.data || e;
    const score  = d.score ?? d.credibilityScore ?? null;
    const scoreEl = score !== null
      ? `<span class="hist-score hist-score-${score>=70?'ok':score>=40?'mid':'low'}">${score}</span>`
      : '';
    const time = new Date(tsOf(e)).toLocaleString();
    return `<div class="hist-row">
      ${scoreEl}
      <div class="hist-body">
        <div class="hist-title">${escapeHtml(d.title||d.hostname||d.url||'Unknown page')}</div>
        <div class="hist-url">${escapeHtml(d.hostname||d.url||'')}</div>
      </div>
      <div class="hist-time">${time}</div>
    </div>`;
  }).join('');
}

document.getElementById('hist-clear').addEventListener('click', async () => {
  if (!confirm('Clear all browse history?')) return;
  await fc.runtime.sendMessage({ type:'FC_STORAGE_CLEAR_HIST' });
  loadBrowseHistory();
});

// ═══════════════════════════════════════════════════════════════════════════
// SOCIAL INTEL
// ═══════════════════════════════════════════════════════════════════════════

const API_BASE = 'https://factchecker-pro-production.up.railway.app';
let siInited = false;
let aiHistory = JSON.parse(localStorage.getItem('fc_ai_history') || '[]');
let siKeywords = JSON.parse(localStorage.getItem('fc_si_keywords') || '[]');

async function loadSocialIntel() {
  // Pull stats from live events
  const evResult = await fc.runtime.sendMessage({ type:'FC_GET_RECENT_EVENTS' });
  const events   = evResult.events || [];
  const scans    = events.filter(e=>e.type==='FC_LIVE_ANALYSIS').length;
  const flagged  = events.filter(e=>e.type==='FC_LIVE_CLAIM_FLAGGED'||e.type==='FC_LIVE_PAGE_FLAGGED').length;
  document.getElementById('si-scans').textContent   = scans;
  document.getElementById('si-flagged').textContent = flagged;
  document.getElementById('si-score').textContent   = state.apiUser?.transparency_score ?? '—';

  if (!siInited) {
    siInited = true;
    initSocialIntelTabs();
    initPlatformButtons();
    initAiAnalysis();
    initKeywordMonitor();
    initResearchTools();
  }

  renderAiHistory();
  renderKeywordList();

  // Recent flags in research tab
  const flagEl = document.getElementById('si-recent-flags');
  const flags  = events.filter(e=>e.type==='FC_LIVE_CLAIM_FLAGGED'||e.type==='FC_LIVE_PAGE_FLAGGED').slice(0,10);
  if (flagEl) flagEl.innerHTML = flags.length
    ? flags.map(e=>{
        const d = e.data||{};
        return `<div class="hist-row">
          <span style="font-size:16px">${e.type==='FC_LIVE_CLAIM_FLAGGED'?'📝':'🚩'}</span>
          <div class="hist-body"><div class="hist-title">${escapeHtml((d.claim||d.title||d.url||'').slice(0,100))}</div></div>
          <div class="hist-time">${new Date(e.receivedAt||e.ts||Date.now()).toLocaleTimeString()}</div>
        </div>`;
      }).join('')
    : '<div class="empty-state">No flagged content yet.</div>';
}

// ── Tab switching ───────────────────────────────────────────────────────────
function initSocialIntelTabs() {
  document.querySelectorAll('.si-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.si-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.si-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById('si-panel-' + tab.dataset.sitab);
      if (panel) panel.classList.add('active');
    });
  });
}

// ── Platform buttons ────────────────────────────────────────────────────────
function siOpen(url) {
  fc.runtime.sendMessage({ type:'FC_OPEN_EXTERNAL', url });
}

function initPlatformButtons() {
  // YouTube
  document.getElementById('yt-search').onclick    = () => { const q = encodeURIComponent(document.getElementById('yt-query').value.trim()||'misinformation'); siOpen(`https://www.youtube.com/results?search_query=${q}`); };
  document.getElementById('yt-trending').onclick   = () => siOpen('https://www.youtube.com/feed/trending');
  document.getElementById('yt-factcheck').onclick  = () => { const q = encodeURIComponent(document.getElementById('yt-query').value.trim()||'fact check'); siOpen(`https://www.youtube.com/results?search_query=fact+check+${q}`); };
  document.getElementById('yt-misinfo').onclick    = () => siOpen('https://support.google.com/youtube/answer/2801973');

  // Facebook
  document.getElementById('fb-search').onclick      = () => { const q = encodeURIComponent(document.getElementById('fb-query').value.trim()||'misinformation'); siOpen(`https://www.facebook.com/search/top?q=${q}`); };
  document.getElementById('fb-crowdtangle').onclick  = () => siOpen('https://www.crowdtangle.com/');
  document.getElementById('fb-transparency').onclick = () => siOpen('https://www.facebook.com/ads/library/');
  document.getElementById('fb-report').onclick       = () => siOpen('https://www.facebook.com/help/reportlinks');

  // Instagram
  document.getElementById('ig-search').onclick  = () => { const q = encodeURIComponent((document.getElementById('ig-query').value.trim()||'misinformation').replace(/^#/,'')); siOpen(`https://www.instagram.com/explore/tags/${q}/`); };
  document.getElementById('ig-reverse').onclick = () => siOpen('https://images.google.com/');
  document.getElementById('ig-exif').onclick    = () => siOpen('https://www.metadata2go.com/');
  document.getElementById('ig-report').onclick  = () => siOpen('https://help.instagram.com/165828726894770');

  // TikTok
  document.getElementById('tt-search').onclick   = () => { const q = encodeURIComponent(document.getElementById('tt-query').value.trim()||'misinformation'); siOpen(`https://www.tiktok.com/search?q=${q}`); };
  document.getElementById('tt-trending').onclick  = () => siOpen('https://www.tiktok.com/explore');
  document.getElementById('tt-research').onclick  = () => siOpen('https://developers.tiktok.com/products/research-api/');
  document.getElementById('tt-report').onclick    = () => siOpen('https://www.tiktok.com/transparency');

  // Twitter / X
  document.getElementById('tw-search').onclick          = () => { const q = encodeURIComponent(document.getElementById('tw-query').value.trim()||'misinformation'); siOpen(`https://x.com/search?q=${q}&src=typed_query`); };
  document.getElementById('tw-advanced').onclick        = () => { const q = encodeURIComponent(document.getElementById('tw-query').value.trim()||''); siOpen(`https://x.com/search-advanced?q=${q}`); };
  document.getElementById('tw-community-notes').onclick = () => siOpen('https://communitynotes.x.com/guide/en/about/introduction');
  document.getElementById('tw-trending').onclick        = () => siOpen('https://x.com/explore/tabs/trending');
  document.getElementById('tw-report').onclick          = () => siOpen('https://help.x.com/en/using-x/report-a-post');

  // Reddit
  document.getElementById('rd-search').onclick   = () => { const q = encodeURIComponent(document.getElementById('rd-query').value.trim()||'misinformation'); siOpen(`https://www.reddit.com/search/?q=${q}&sort=relevance`); };
  document.getElementById('rd-factcheck').onclick = () => siOpen('https://www.reddit.com/r/factcheck/');
  document.getElementById('rd-debunk').onclick    = () => { const q = encodeURIComponent(document.getElementById('rd-query').value.trim()||'misinformation'); siOpen(`https://www.reddit.com/r/Debunkthis/search/?q=${q}`); };
  document.getElementById('rd-trending').onclick  = () => siOpen('https://www.reddit.com/r/all/hot/');
  document.getElementById('rd-report').onclick    = () => siOpen('https://www.reddit.com/report');

  // LinkedIn
  document.getElementById('li-search').onclick  = () => { const q = encodeURIComponent(document.getElementById('li-query').value.trim()||'misinformation'); siOpen(`https://www.linkedin.com/search/results/content/?keywords=${q}`); };
  document.getElementById('li-company').onclick = () => { const q = encodeURIComponent(document.getElementById('li-query').value.trim()||''); siOpen(`https://www.linkedin.com/search/results/companies/?keywords=${q}`); };
  document.getElementById('li-news').onclick    = () => siOpen('https://www.linkedin.com/news/');
  document.getElementById('li-report').onclick  = () => siOpen('https://www.linkedin.com/help/linkedin/answer/a1340317');

  // Substack
  document.getElementById('ss-search').onclick      = () => { const q = encodeURIComponent(document.getElementById('ss-query').value.trim()||'misinformation'); siOpen(`https://substack.com/search?query=${q}`); };
  document.getElementById('ss-leaderboard').onclick = () => siOpen('https://substack.com/leaderboard');
  document.getElementById('ss-google').onclick      = () => { const q = encodeURIComponent(document.getElementById('ss-query').value.trim()||''); siOpen(`https://www.google.com/search?q=fact+check+${q}+site:substack.com`); };
  document.getElementById('ss-report').onclick      = () => siOpen('https://support.substack.com/hc/en-us/requests/new');
}

// ── AI Analysis ─────────────────────────────────────────────────────────────
function renderAiHistory() {
  const el = document.getElementById('ai-history-list');
  if (!el) return;
  if (!aiHistory.length) {
    el.innerHTML = '<div class="empty-state"><div class="icon">🤖</div>No analyses yet. Run your first claim check above.</div>';
    return;
  }
  el.innerHTML = aiHistory.slice(0,10).map(h => {
    const scoreColor = h.factual_score >= 70 ? '#16a34a' : h.factual_score >= 40 ? '#d97706' : '#dc2626';
    return `<div class="ai-hist-row">
      <div class="ai-hist-score" style="background:${scoreColor}15;color:${scoreColor};">${h.factual_score ?? '?'}</div>
      <div class="hist-body">
        <div class="hist-title">${escapeHtml((h.claim||'').slice(0,80))}${(h.claim||'').length>80?'…':''}</div>
        <div class="hist-url">${escapeHtml(h.verdict||'')} via ${escapeHtml(h.engine||'AI')} · ${h.platform||'general'}</div>
      </div>
      <div class="hist-time">${new Date(h.ts||Date.now()).toLocaleString()}</div>
    </div>`;
  }).join('');
}

function initAiAnalysis() {
  const btn     = document.getElementById('ai-analyze');
  const claimEl = document.getElementById('ai-claim');
  const platEl  = document.getElementById('ai-platform');
  const resultEl = document.getElementById('ai-result');
  const loadEl   = document.getElementById('ai-loading');
  const loadMsg  = document.getElementById('ai-loading-msg');
  const errEl    = document.getElementById('ai-error');

  btn.addEventListener('click', async () => {
    const text = claimEl.value.trim();
    if (text.length < 10) { errEl.textContent = 'Please enter at least 10 characters.'; errEl.style.display='block'; return; }
    errEl.style.display = 'none';
    resultEl.style.display = 'none';
    loadEl.style.display = 'flex';
    btn.disabled = true;

    const msgs = ['Searching Google for fact-checks…','Analysing claim…','Cross-referencing sources…','Almost done…'];
    let mi = 0;
    const ticker = setInterval(() => { loadMsg.textContent = msgs[Math.min(++mi, msgs.length-1)]; }, 1800);

    try {
      const data = await fc.runtime.sendMessage({ type: 'FC_AI_ANALYZE', text, platform: platEl.value });
      clearInterval(ticker);

      if (!data || !data.ok) throw new Error(data?.error || 'AI analysis failed.');

      // Save to history
      aiHistory.unshift({ ...data, claim: text, ts: Date.now() });
      if (aiHistory.length > 30) aiHistory.length = 30;
      localStorage.setItem('fc_ai_history', JSON.stringify(aiHistory));
      renderAiHistory();

      // Render result
      const score = data.factual_score ?? 50;
      const scoreColor = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626';
      document.getElementById('ai-engine-badge').textContent = `Analysed by ${data.engine || 'AI'}`;
      document.getElementById('ai-verdict').textContent = data.verdict || 'Unknown';
      document.getElementById('ai-confidence').textContent = `${data.confidence ?? '—'}% confidence`;
      document.getElementById('ai-score-fill').style.width  = `${score}%`;
      document.getElementById('ai-score-fill').style.background = scoreColor;
      document.getElementById('ai-summary').textContent = data.summary || '';

      const flagsBlock = document.getElementById('ai-flags-block');
      const flagsEl    = document.getElementById('ai-flags');
      if (data.red_flags && data.red_flags.length) {
        flagsEl.innerHTML = data.red_flags.map(f => `<div class="ai-flag-chip">⚠ ${escapeHtml(f)}</div>`).join('');
        flagsBlock.style.display = 'block';
      } else {
        flagsBlock.style.display = 'none';
      }

      const tipsBlock = document.getElementById('ai-tips-block');
      const tipsEl    = document.getElementById('ai-tips-list');
      if (data.tips && data.tips.length) {
        tipsEl.innerHTML = data.tips.map(t => `<div class="si-tip">💡 ${escapeHtml(t)}</div>`).join('');
        tipsBlock.style.display = 'block';
      } else {
        tipsBlock.style.display = 'none';
      }

      // Sources panel (shown for search-fallback and when grounding sources are returned)
      const sourcesBlock = document.getElementById('ai-sources-block');
      const sourcesEl    = document.getElementById('ai-sources');
      if (sourcesBlock && data.sources && data.sources.length) {
        const labels = { 'snopes.com': 'Snopes', 'politifact.com': 'PolitiFact',
                        'factcheck.org': 'FactCheck.org', 'fullfact.org': 'FullFact', 'google.com': 'Google Fact-Check' };
        sourcesEl.innerHTML = data.sources.map(url => {
          let label = url;
          try { const h = new URL(url).hostname.replace('www.',''); label = labels[h] || h; } catch(_) {}
          return `<a class="ai-source-link" href="#" data-url="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
        }).join('');
        sourcesBlock.style.display = 'block';
        sourcesBlock.querySelectorAll('.ai-source-link').forEach(a => {
          a.addEventListener('click', e => { e.preventDefault(); siOpen(a.dataset.url); });
        });
      } else if (sourcesBlock) {
        sourcesBlock.style.display = 'none';
      }

      resultEl.style.display = 'block';
    } catch (err) {
      clearInterval(ticker);
      errEl.textContent = 'Analysis failed: ' + (err.message || 'could not reach the server. Check your connection.');
      errEl.style.display = 'block';
    } finally {
      loadEl.style.display = 'none';
      btn.disabled = false;
    }
  });
}

// ── Keyword Monitor ─────────────────────────────────────────────────────────
function renderKeywordList() {
  const el      = document.getElementById('kw-list');
  const limitEl = document.getElementById('kw-limit-msg');
  if (!el) return;

  if (limitEl) limitEl.style.display = siKeywords.length >= 5 ? 'block' : 'none';

  if (!siKeywords.length) {
    el.innerHTML = '<div class="empty-state" style="padding:24px 0;">No keywords yet. Add one above to start monitoring.</div>';
    return;
  }

  el.innerHTML = siKeywords.map((kw, i) =>
    `<div class="kw-row">
      <div class="kw-chip">${escapeHtml(kw)}</div>
      <div class="kw-actions">
        <button class="btn btn-sm" data-kw="${escapeHtml(kw)}" data-kwaction="search-all">🔍 Search All</button>
        <button class="btn btn-sm btn-secondary" data-kw="${escapeHtml(kw)}" data-kwaction="ai">🤖 AI Check</button>
        <button class="btn btn-sm btn-secondary" data-kw="${escapeHtml(kw)}" data-kwaction="remove" data-kwi="${i}">✕</button>
      </div>
    </div>`
  ).join('');

  el.querySelectorAll('button[data-kwaction]').forEach(btn => {
    btn.addEventListener('click', () => {
      const kw = btn.dataset.kw;
      const action = btn.dataset.kwaction;
      if (action === 'remove') {
        siKeywords.splice(parseInt(btn.dataset.kwi), 1);
        localStorage.setItem('fc_si_keywords', JSON.stringify(siKeywords));
        renderKeywordList();
      } else if (action === 'search-all') {
        showKeywordSearchPanel(kw);
      } else if (action === 'ai') {
        document.querySelectorAll('.si-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.si-panel').forEach(p => p.classList.remove('active'));
        document.querySelector('.si-tab[data-sitab="ai"]').classList.add('active');
        document.getElementById('si-panel-ai').classList.add('active');
        document.getElementById('ai-claim').value = kw;
        document.getElementById('ai-analyze').click();
      }
    });
  });
}

function showKeywordSearchPanel(kw) {
  const card   = document.getElementById('kw-results-card');
  const termEl = document.getElementById('kw-active-term');
  const rowEl  = document.getElementById('kw-search-row');
  if (!card) return;
  card.style.display = 'block';
  termEl.textContent = kw;
  const q = encodeURIComponent(kw);
  const links = [
    { label: '📺 YouTube',   url: `https://www.youtube.com/results?search_query=${q}`,        cls: 'btn btn-sm' },
    { label: '👥 Facebook',  url: `https://www.facebook.com/search/top?q=${q}`,               cls: 'btn btn-sm btn-secondary' },
    { label: '📸 Instagram', url: `https://www.instagram.com/explore/tags/${q}/`,              cls: 'btn btn-sm btn-secondary' },
    { label: '🎵 TikTok',   url: `https://www.tiktok.com/search?q=${q}`,                      cls: 'btn btn-sm btn-secondary' },
    { label: '🔍 Fact Check',url: `https://www.google.com/search?q=fact+check+${q}`,          cls: 'btn btn-sm btn-secondary' },
    { label: '🐦 X/Twitter', url: `https://twitter.com/search?q=${q}`,                        cls: 'btn btn-sm btn-secondary' },
  ];
  rowEl.innerHTML = links.map((l, i) => `<button class="${l.cls}" data-kwlink="${i}">${l.label}</button>`).join('');
  rowEl.querySelectorAll('button[data-kwlink]').forEach(b => {
    b.addEventListener('click', () => siOpen(links[parseInt(b.dataset.kwlink)].url));
  });
}

function initKeywordMonitor() {
  const input  = document.getElementById('kw-input');
  const addBtn = document.getElementById('kw-add');

  function addKeyword() {
    const kw = input.value.trim();
    if (!kw) return;
    if (siKeywords.length >= 5) return;
    if (siKeywords.includes(kw)) { input.value = ''; return; }
    siKeywords.push(kw);
    localStorage.setItem('fc_si_keywords', JSON.stringify(siKeywords));
    input.value = '';
    renderKeywordList();
  }

  addBtn.addEventListener('click', addKeyword);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') addKeyword(); });
}

// ── Research Tools ──────────────────────────────────────────────────────────
function initResearchTools() {
  document.getElementById('si-google').onclick     = () => { const q = encodeURIComponent(document.getElementById('si-query').value.trim()||'news'); siOpen(`https://www.google.com/search?q=fact+check+${q}`); };
  document.getElementById('si-explorer').onclick   = () => { const q = encodeURIComponent(document.getElementById('si-query').value.trim()||'news'); siOpen(`https://toolbox.google.com/factcheck/explorer/search/${q}`); };
  document.getElementById('si-fullfact').onclick   = () => { const q = encodeURIComponent(document.getElementById('si-query').value.trim()||''); siOpen(`https://fullfact.org/search/?q=${q}`); };
  document.getElementById('si-africacheck').onclick= () => { const q = encodeURIComponent(document.getElementById('si-query').value.trim()||''); siOpen(`https://africacheck.org/?s=${q}`); };
  document.getElementById('si-snopes').onclick     = () => { const q = encodeURIComponent(document.getElementById('si-query').value.trim()||''); siOpen(`https://www.snopes.com/?s=${q}`); };
  document.getElementById('si-politifact').onclick = () => { const q = encodeURIComponent(document.getElementById('si-query').value.trim()||''); siOpen(`https://www.politifact.com/search/?q=${q}`); };

  document.getElementById('res-invid').onclick        = () => siOpen('https://www.invid-project.eu/tools-and-services/invid-verification-plugin/');
  document.getElementById('res-tineye').onclick       = () => siOpen('https://tineye.com/');
  document.getElementById('res-fotoforensics').onclick= () => siOpen('https://fotoforensics.com/');
  document.getElementById('res-google-images').onclick= () => siOpen('https://images.google.com/');
  document.getElementById('res-whoat').onclick        = () => siOpen('https://who.is/');
  document.getElementById('res-wayback').onclick      = () => siOpen('https://web.archive.org/');
  document.getElementById('res-poynter').onclick      = () => siOpen('https://www.poynter.org/ifcn/');
  document.getElementById('res-duke').onclick         = () => siOpen('https://reporterslab.org/fact-checking/');
  document.getElementById('res-firstdraft').onclick   = () => siOpen('https://firstdraftnews.org/');
  document.getElementById('res-claim-buster').onclick = () => siOpen('https://idir.uta.edu/claimbuster/');
  document.getElementById('res-opensecrets').onclick  = () => siOpen('https://www.opensecrets.org/');
  document.getElementById('res-propublica').onclick   = () => siOpen('https://www.propublica.org/datastore/');
  // Academic research
  document.getElementById('res-google-scholar').onclick = () => siOpen('https://scholar.google.com/scholar_labs/search?hl=en');
  document.getElementById('res-pubmed').onclick          = () => siOpen('https://pubmed.ncbi.nlm.nih.gov/');
  document.getElementById('res-arxiv').onclick           = () => siOpen('https://arxiv.org/');
  document.getElementById('res-jstor').onclick           = () => siOpen('https://www.jstor.org/');
}

// ═══════════════════════════════════════════════════════════════════════════
// MODERATION
// ═══════════════════════════════════════════════════════════════════════════
const MOD_ADMIN_EMAILS = ['atocon.youthleader@gmail.com','atocon@protonmail.com','info@factcheckerpro.net','info@newpopin.com'];

function checkModAdmin() {
  const email = (state.apiUser?.email||'').toLowerCase().trim();
  if (MOD_ADMIN_EMAILS.includes(email)) {
    const nav = document.getElementById('nav-mod');
    if (nav) nav.style.display = '';
  }
}

async function loadModQueue() {
  const listEl  = document.getElementById('mod-list');
  const emptyEl = document.getElementById('mod-empty');
  const countEl = document.getElementById('mod-count-lbl');
  listEl.innerHTML = '<div class="empty-state">Loading…</div>';

  const result = await fc.runtime.sendMessage({ type:'FC_GET_MODQUEUE' });
  const queue  = result.queue || [];
  if (countEl) countEl.textContent = `${queue.length} awaiting review`;

  const badge = document.getElementById('mod-badge');
  if (badge) { badge.textContent = queue.length; badge.style.display = queue.length ? '' : 'none'; }

  if (!queue.length) {
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = '';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  function ageLabel(h) { return h<24?`${Math.round(h)}h old`:h<168?`${Math.round(h/24)}d old`:`${Math.round(h/168)}w old`; }

  listEl.innerHTML = queue.map(c => {
    const age = parseFloat(c.age_hours)||0;
    const src  = c.source_url ? `<a class="mod-src-link" href="${escapeHtml(c.source_url)}" target="_blank">${escapeHtml(c.source_url.slice(0,55))}…</a>` : '<em>No source</em>';
    return `<div class="mod-card" data-id="${c.id}">
      <div class="mod-card-top">
        <div class="mod-claim">${escapeHtml(c.claim_text)}</div>
        <span class="mod-age ${age>=48?'mod-age-old':''}">${ageLabel(age)}</span>
      </div>
      <div class="mod-meta-row">
        <span class="status-pill status-${c.status}">${c.status.replace('_',' ')}</span>
        <span>👤 ${escapeHtml(c.display_name||c.username)} (${escapeHtml(c.submitter_email)})</span>
        <span>⚡ Score: ${c.auto_score??'N/A'}/100</span>
        <span>🔗 ${src}</span>
      </div>
      <textarea class="mod-note" placeholder="Optional note to the submitter…" rows="2"></textarea>
      <div class="mod-actions">
        <button class="btn mod-approve" data-id="${c.id}">✅ Approve</button>
        <button class="btn btn-danger mod-reject" data-id="${c.id}">❌ Reject</button>
        <button class="btn btn-secondary mod-fwd" data-id="${c.id}">📧 Forward</button>
      </div>
    </div>`;
  }).join('');

  listEl.addEventListener('click', async e => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    const id   = btn.dataset.id;
    const card = btn.closest('.mod-card');
    const note = card?.querySelector('.mod-note')?.value || '';
    card?.querySelectorAll('button').forEach(b=>b.disabled=true);

    let msg;
    if (btn.classList.contains('mod-approve'))  msg = { type:'FC_MOD_DECIDE', claimId:id, decision:'approved', note };
    else if (btn.classList.contains('mod-reject')) msg = { type:'FC_MOD_DECIDE', claimId:id, decision:'rejected', note };
    else msg = { type:'FC_MOD_EMAIL', claimId:id };

    const res = await fc.runtime.sendMessage(msg);
    if (card) {
      card.style.opacity='0.5';
      card.querySelector('.mod-actions').innerHTML = `<span style="font-size:13px;color:var(--gray600)">${res.ok?'Done — submitter notified':'Error: '+(res.data?.error||'unknown')}</span>`;
    }
    if (btn.classList.contains('mod-fwd')) return; // don't refresh for forward
    setTimeout(loadModQueue, 1000);
  }, { once:true });
}

document.getElementById('mod-refresh').addEventListener('click', loadModQueue);

// ═══════════════════════════════════════════════════════════════════════════
// PATCH navigate() to handle new tabs
// ═══════════════════════════════════════════════════════════════════════════
const _origNavigate = navigate;
window.navigate = function(tab) {
  _origNavigate(tab);
  if (tab === 'newsfeed')   initNewsFeed();
  if (tab === 'history')    loadBrowseHistory();
  if (tab === 'social')     loadSocialIntel();
  if (tab === 'moderation') loadModQueue();
};
// Re-bind nav items to use patched navigate
document.querySelectorAll('.nav-item[data-nav]').forEach(el => {
  el.onclick = () => window.navigate(el.dataset.nav);
});

// Update VIEW_META
Object.assign(VIEW_META, {
  newsfeed:   ['News Feed', 'Latest headlines with credibility ratings'],
  history:    ['Browse History', 'Pages analysed by the extension'],
  social:     ['Social Intel', 'Misinformation radar and quick fact-check tools'],
  moderation: ['Moderation', 'Review and action pending submissions'],
});

// Show mod nav after init
setTimeout(checkModAdmin, 1500);
