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
  newsfeed:    ['FactNews',        'Top headlines filtered for credibility'],
  history:     ['Browse History',   'Pages analysed by the extension'],
  social:      ['Social Intel',     'Monitor social media claims and activity'],
  factplay:    ['FactPlay',         'Daily games, live trends and squads that make fact-checking a habit'],
  'election-nl': ['🗳️ Election Watch NL', 'Pilot: Dutch-language election disinformation monitoring'],
  'election-global': ['🌐 Election Watch — Global', 'Election claims and news for any country and language'],
  'podcast-search': ['🎙️ Podcast Search', 'Find a podcaster or show to fact-check an episode claim from'],
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
  if (tab === 'factplay' && typeof initFactPlay === 'function') initFactPlay();
  if (tab === 'election-nl' && typeof initElectionWatchNL === 'function') initElectionWatchNL();
  if (tab === 'election-global' && typeof initElectionWatchGlobal === 'function') initElectionWatchGlobal();
  if (tab === 'podcast-search' && typeof initPodcastSearch === 'function') initPodcastSearch();
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
  alert('FactChecker Pro Desktop v1.3.0\nCompanion app for the FactChecker Pro browser extension.\nReal-time page scanning still happens in the extension — this app is your account hub.\n\nNew in this version: FactPlay — Spot the Fake, Live Event Fact-Check Rail, Viral Radar, Screenshot Check, Creator Credibility, Job Offer Check and Squad Mode.');
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
let nfSearchQuery = '';
let nfSearchDebounceTimer = null;
let nfHiddenCats = [];
let nfDensity = 'comfortable';
const NF_CATEGORIES = ['general','world','politics','health','science','business','technology'];

function nfEscAttr(s) {
  return String(s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// LinkedIn-style single feed card — fixed aspect-ratio thumbnail keeps
// images proportional regardless of their native size (replaces the old
// fixed 72px-tall crop).
function renderFeedCard(a) {
  const src = a.source?.name || '';
  const img = a.image
    ? `<img class="nf-feed-thumb" src="${escapeHtml(a.image)}" alt="" onerror="this.style.display='none'">`
    : '<div class="nf-feed-thumb-placeholder">📰</div>';
  return `<a class="nf-feed-card" href="${escapeHtml(a.url)}" target="_blank" rel="noopener" data-title="${nfEscAttr((a.title||'').toLowerCase())}" data-desc="${nfEscAttr((a.description||'').toLowerCase())}">
    ${img}
    <div class="nf-feed-body">
      <div class="nf-feed-meta">${escapeHtml(src)} · ${timeAgo(a.publishedAt)}</div>
      <div class="nf-feed-title">${escapeHtml(a.title)}</div>
      <div class="nf-feed-footer">${credBadge(src)}<button type="button" class="nf-comment-btn" data-comment-url="${nfEscAttr(a.url||'')}" data-comment-title="${nfEscAttr(a.title||'')}">💬 Comments</button></div>
    </div>
  </a>`;
}

// ── Comments modal (discussion on a FactNews article) ───────────────────────
let nfCommentsUrl = '';

function nfEnsureCommentsModal() {
  if (document.getElementById('nf-comments-modal')) return;
  const div = document.createElement('div');
  div.id = 'nf-comments-modal';
  div.className = 'nf-comments-overlay';
  div.style.display = 'none';
  div.innerHTML = `
    <div class="nf-comments-box">
      <div class="nf-comments-head">
        <span class="nf-comments-title" id="nf-comments-article-title"></span>
        <button type="button" class="nf-comments-close" id="nf-comments-close">✕</button>
      </div>
      <div class="nf-comments-list" id="nf-comments-list"><p class="empty-state">Loading…</p></div>
      <div class="nf-comments-compose">
        <textarea id="nf-comments-input" rows="2" placeholder="Share a thought on this story…"></textarea>
        <button type="button" class="nf-comments-post" id="nf-comments-post">Post</button>
      </div>
    </div>`;
  document.body.appendChild(div);
  document.getElementById('nf-comments-close').addEventListener('click', nfCloseCommentsModal);
  div.addEventListener('click', (e) => { if (e.target === div) nfCloseCommentsModal(); });
  document.getElementById('nf-comments-post').addEventListener('click', nfSubmitComment);
}

function nfCloseCommentsModal() {
  const el = document.getElementById('nf-comments-modal');
  if (el) el.style.display = 'none';
}

function nfRenderComments(list) {
  const wrap = document.getElementById('nf-comments-list');
  if (!wrap) return;
  if (!list.length) {
    wrap.innerHTML = '<p class="empty-state">No comments yet. Be the first to weigh in.</p>';
    return;
  }
  wrap.innerHTML = list.map(c => `
    <div class="nf-comment-row">
      <div class="nf-comment-author">${escapeHtml(c.username || 'Anonymous')}</div>
      <div class="nf-comment-text">${escapeHtml(c.body || '')}</div>
      <div class="nf-comment-time">${c.created_at ? new Date(c.created_at).toLocaleString() : ''}</div>
    </div>`).join('');
}

async function nfLoadComments(url) {
  try {
    const result = await fc.runtime.sendMessage({ type: 'FC_GET_NEWS_COMMENTS', url });
    nfRenderComments(result.comments || []);
  } catch (_) {
    const wrap = document.getElementById('nf-comments-list');
    if (wrap) wrap.innerHTML = '<p class="empty-state">Couldn\'t load comments.</p>';
  }
}

let nfCommentsTitle = '';

async function nfSubmitComment() {
  const input = document.getElementById('nf-comments-input');
  const text = (input?.value || '').trim();
  if (!text || !nfCommentsUrl) return;
  const btn = document.getElementById('nf-comments-post');
  if (btn) btn.disabled = true;
  try {
    const result = await fc.runtime.sendMessage({ type: 'FC_POST_NEWS_COMMENT', url: nfCommentsUrl, title: nfCommentsTitle, body: text });
    if (result.ok) {
      input.value = '';
      nfLoadComments(nfCommentsUrl);
    } else if (result.error) {
      alert(result.error);
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

function nfOpenCommentsModal(url, title) {
  nfEnsureCommentsModal();
  nfCommentsUrl = url;
  nfCommentsTitle = title || '';
  const titleEl = document.getElementById('nf-comments-article-title');
  if (titleEl) titleEl.textContent = title || 'Discussion';
  const listEl = document.getElementById('nf-comments-list');
  if (listEl) listEl.innerHTML = '<p class="empty-state">Loading…</p>';
  document.getElementById('nf-comments-modal').style.display = 'flex';
  nfLoadComments(url);
}

async function loadNewsFeed() {
  const grid = document.getElementById('nf-grid');
  grid.innerHTML = '<div class="empty-state">Loading…</div>';
  const country = document.getElementById('nf-country').value;
  const lang    = document.getElementById('nf-lang').value;
  const msg = { type:'FC_GET_NEWS', country, lang, category:nfCat, max:'12' };
  if (nfSearchQuery) msg.q = nfSearchQuery;
  const result  = await fc.runtime.sendMessage(msg);
  const arts    = result.articles || [];
  if (!arts.length) {
    grid.innerHTML = nfSearchQuery
      ? `<div class="empty-state"><div class="icon">🔍</div>No results for "${escapeHtml(nfSearchQuery)}". Try a different search term.</div>`
      : '<div class="empty-state"><div class="icon">📰</div>No articles found. Try a different country or language.</div>';
    return;
  }
  grid.innerHTML = arts.map(renderFeedCard).join('');
  applyNfDensity();
}

function applyNfClientFilter(term) {
  const t = term.trim().toLowerCase();
  document.querySelectorAll('#nf-grid .nf-feed-card').forEach(card => {
    const match = !t || card.dataset.title.includes(t) || card.dataset.desc.includes(t);
    card.style.display = match ? '' : 'none';
  });
}

function applyNfDensity() {
  const grid = document.getElementById('nf-grid');
  if (grid) grid.classList.toggle('nf-density-compact', nfDensity === 'compact');
}

function initNfSearch() {
  const input = document.getElementById('nf-search-input');
  const clearBtn = document.getElementById('nf-search-clear');
  if (!input) return;
  input.addEventListener('input', () => {
    const val = input.value;
    if (clearBtn) clearBtn.style.display = val ? '' : 'none';
    applyNfClientFilter(val);
    clearTimeout(nfSearchDebounceTimer);
    nfSearchDebounceTimer = setTimeout(() => { nfSearchQuery = val.trim(); loadNewsFeed(); }, 600);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      clearTimeout(nfSearchDebounceTimer);
      nfSearchQuery = input.value.trim();
      loadNewsFeed();
    }
  });
  if (clearBtn) clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    nfSearchQuery = '';
    applyNfClientFilter('');
    loadNewsFeed();
  });
}

// ── Notifications (based on newly-debunked items) ────────────────────────────
let nfLatestNotifUrls = [];
function updateNfNotifications(claims) {
  const items = (claims || []).map(c => {
    const review = (c.claimReview || [])[0] || {};
    return {
      text: c.text || '',
      url: review.url || '#',
      publisher: review.publisher?.name || '',
      rating: review.textualRating || 'Debunked'
    };
  });
  nfLatestNotifUrls = items.map(it => it.url);

  let seen = [];
  try { seen = JSON.parse(localStorage.getItem('nf-notif-seen') || '[]'); } catch (_) {}
  const seenSet = new Set(seen);
  const unread = items.filter(it => !seenSet.has(it.url));

  const badge = document.getElementById('nf-notif-badge');
  if (badge) {
    if (unread.length > 0) {
      badge.textContent = unread.length > 9 ? '9+' : String(unread.length);
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  const listEl = document.getElementById('nf-notif-list');
  if (listEl) {
    listEl.innerHTML = items.length
      ? items.slice(0, 10).map(it => `
          <a class="nf-notif-item" href="${escapeHtml(it.url)}" target="_blank" rel="noopener">
            <div class="nf-notif-item-title">${escapeHtml(it.rating)}: ${escapeHtml(it.text.slice(0, 90))}</div>
            ${it.publisher ? `<div class="nf-notif-item-meta">${escapeHtml(it.publisher)}</div>` : ''}
          </a>`).join('')
      : '<div class="nf-notif-empty">No new fact-checks yet.</div>';
  }
}

function initNfNotifications() {
  const btn = document.getElementById('nf-notif-btn');
  const dropdown = document.getElementById('nf-notif-dropdown');
  const markBtn = document.getElementById('nf-notif-mark-read');
  if (!btn || !dropdown) return;
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const willOpen = dropdown.style.display === 'none';
    dropdown.style.display = willOpen ? '' : 'none';
    const customize = document.getElementById('nf-customize-panel');
    if (willOpen && customize) customize.style.display = 'none';
  });
  if (markBtn) markBtn.addEventListener('click', e => {
    e.stopPropagation();
    try { localStorage.setItem('nf-notif-seen', JSON.stringify(nfLatestNotifUrls)); } catch (_) {}
    if (badgeEl()) badgeEl().style.display = 'none';
  });
  function badgeEl() { return document.getElementById('nf-notif-badge'); }
  document.addEventListener('click', e => {
    if (!dropdown.contains(e.target) && e.target !== btn) dropdown.style.display = 'none';
  });
}

// ── Customize feed (category visibility + density) ───────────────────────────
function renderNfCustomizeCats() {
  const wrap = document.getElementById('nf-customize-cats');
  if (!wrap) return;
  wrap.innerHTML = NF_CATEGORIES.map(c => {
    const on = !nfHiddenCats.includes(c);
    const label = c.charAt(0).toUpperCase() + c.slice(1);
    return `<button type="button" class="nf-customize-cat-toggle ${on ? 'on' : ''}" data-cat="${c}">${label}</button>`;
  }).join('');
}

function applyNfChipVisibility() {
  document.querySelectorAll('#nf-chips .chip').forEach(chip => {
    chip.style.display = nfHiddenCats.includes(chip.dataset.cat) ? 'none' : '';
  });
}

function initNfCustomize() {
  const btn = document.getElementById('nf-customize-btn');
  const panel = document.getElementById('nf-customize-panel');
  if (!btn || !panel) return;

  try { nfHiddenCats = JSON.parse(localStorage.getItem('nf-hidden-cats') || '[]'); } catch (_) { nfHiddenCats = []; }
  nfDensity = localStorage.getItem('nf-density') || 'comfortable';

  renderNfCustomizeCats();
  applyNfChipVisibility();
  applyNfDensity();
  document.querySelectorAll('.nf-density-btn').forEach(b => b.classList.toggle('active', b.dataset.density === nfDensity));

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const willOpen = panel.style.display === 'none';
    panel.style.display = willOpen ? '' : 'none';
    const notif = document.getElementById('nf-notif-dropdown');
    if (willOpen && notif) notif.style.display = 'none';
  });
  document.addEventListener('click', e => {
    if (!panel.contains(e.target) && e.target !== btn) panel.style.display = 'none';
  });

  const catsWrap = document.getElementById('nf-customize-cats');
  if (catsWrap) catsWrap.addEventListener('click', e => {
    const toggle = e.target.closest('[data-cat]');
    if (!toggle) return;
    const cat = toggle.dataset.cat;
    const idx = nfHiddenCats.indexOf(cat);
    if (idx > -1) nfHiddenCats.splice(idx, 1); else nfHiddenCats.push(cat);
    toggle.classList.toggle('on', !nfHiddenCats.includes(cat));
    applyNfChipVisibility();
    try { localStorage.setItem('nf-hidden-cats', JSON.stringify(nfHiddenCats)); } catch (_) {}
  });

  document.querySelectorAll('.nf-density-btn').forEach(b => {
    b.addEventListener('click', () => {
      nfDensity = b.dataset.density;
      document.querySelectorAll('.nf-density-btn').forEach(x => x.classList.toggle('active', x === b));
      applyNfDensity();
      try { localStorage.setItem('nf-density', nfDensity); } catch (_) {}
    });
  });
}

function initNewsFeed() {
  if (nfInited) return; nfInited = true;
  document.getElementById('nf-refresh').addEventListener('click', () => { loadNewsFeed(); loadDebunked(); });
  document.getElementById('nf-country').addEventListener('change', loadNewsFeed);
  document.getElementById('nf-lang').addEventListener('change', () => { loadNewsFeed(); loadDebunked(); });
  document.getElementById('nf-chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#nf-chips .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    nfCat = chip.dataset.cat;
    loadNewsFeed();
  });
  initNfSearch();
  initNfNotifications();
  initNfCustomize();
  document.getElementById('nf-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.nf-comment-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    nfOpenCommentsModal(btn.dataset.commentUrl, btn.dataset.commentTitle);
  });
  loadNewsFeed();
  loadDebunked();
}

// ── Debunked & fact-checked rail ─────────────────────────────────────────────
function renderDebunkedCard(c) {
  const review = (c.claimReview || [])[0] || {};
  const verdict = review.textualRating || 'Debunked';
  const publisher = review.publisher?.name || '';
  const url = review.url || '#';
  return `<a class="nf-debunked-card" href="${escapeHtml(url)}" target="_blank" rel="noopener">
    <span class="nf-debunked-rating">${escapeHtml(verdict)}</span>
    <div class="nf-debunked-text">${escapeHtml(c.text || '')}</div>
    ${publisher ? `<div class="nf-debunked-source">${escapeHtml(publisher)}</div>` : ''}
  </a>`;
}

async function loadDebunked() {
  const list = document.getElementById('nf-debunked-list');
  const empty = document.getElementById('nf-debunked-empty');
  if (!list) return;
  list.innerHTML = '<div class="empty-state" style="padding:16px 8px;">Loading…</div>';
  if (empty) empty.style.display = 'none';
  const lang = (document.getElementById('nf-lang') || {}).value || 'en';
  const result = await fc.runtime.sendMessage({ type: 'FC_GET_DEBUNKED', lang, pageSize: '8' });
  const claims = (result && result.claims) || [];
  if (!claims.length) {
    list.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  list.innerHTML = claims.map(renderDebunkedCard).join('');
  updateNfNotifications(claims);
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
  newsfeed:   ['FactNews', 'Latest headlines with credibility ratings'],
  history:    ['Browse History', 'Pages analysed by the extension'],
  social:     ['Social Intel', 'Misinformation radar and quick fact-check tools'],
  moderation: ['Moderation', 'Review and action pending submissions'],
});

// Show mod nav after init
setTimeout(checkModAdmin, 1500);

// ═══════════════════════════════════════════════════════════════════════════
// HOLIDAY MISINFORMATION SAFETY TIPS — seasonal panel (Overview view)
// Educational, not promotional: warns users about the scam/misinformation
// patterns that spike around each holiday shopping and giving season. The
// active season is picked from today's date; each has its own icon, title
// and 3 tips. Dismiss is remembered per-season so it reappears next year.
// ═══════════════════════════════════════════════════════════════════════════
(function() {
  const SEASONS = [
    {
      key: 'halloween', icon: '🎃', title: 'Halloween Safety Tips',
      subtitle: 'Spooky season brings spookier misinformation',
      // Oct 10 – Nov 1
      start: [10, 10], end: [11, 1],
      tips: [
        'Costume and decoration "flash sale" ads with countdown timers are a classic pressure tactic — verify the retailer before entering card details.',
        'AI-generated "haunted house caught on camera" videos circulate every October. A viral clip with no verifiable location or date is a red flag.',
        'Trick-or-treat safety alerts (razor blades in candy, poisoned treats) resurface every year with no new evidence — check a fact-checking source before sharing.'
      ]
    },
    {
      key: 'blackfriday', icon: '🛍️', title: 'Black Friday & Cyber Monday Safety Tips',
      subtitle: 'The biggest shopping scams of the year peak now',
      // Nov 2 – Dec 2
      start: [11, 2], end: [12, 2],
      tips: [
        'Doorbuster deals shared via text or social ads are a top phishing vector — go directly to the retailer\'s site instead of clicking the link.',
        'Fake "leaked" discount codes and AI-generated product images are common this week. If a deal looks too steep, check the retailer\'s official channels first.',
        'Track fake delivery/shipping notification texts — they spike alongside real Black Friday orders. Never enter login details from a link in an SMS.'
      ]
    },
    {
      key: 'holidayseason', icon: '🎄', title: 'Holiday Season Safety Tips',
      subtitle: 'Gift shopping and giving season needs extra scrutiny',
      // Dec 3 – Dec 31
      start: [12, 3], end: [12, 31],
      tips: [
        'Charity donation requests surge in December — verify a charity on a registry like Charity Navigator before giving, especially from a social media link.',
        'Counterfeit "luxury gift" listings and AI-generated product photos are common on marketplaces this month — check seller reviews and return policies.',
        'Gift card scams (asking you to pay via gift card codes) increase sharply around the holidays — no legitimate retailer or agency asks for payment this way.'
      ]
    },
    {
      key: 'newyear', icon: '🎆', title: 'New Year Safety Tips',
      subtitle: 'Resolution season is prime time for fad claims',
      // Jan 1 – Jan 20
      start: [1, 1], end: [1, 20],
      tips: [
        '"New Year, new you" health and diet claims often cite studies that don\'t exist or are years out of date — check the actual source before trying anything drastic.',
        'Fake "clearance" sales on unsold holiday stock use urgency tactics similar to Black Friday — the same verification rules apply.',
        'Set your fact-checking habits for the year: use the Check Info button on anything shocking before you share it.'
      ]
    }
  ];

  const LOOKAHEAD_DAYS = 60; // show a season's tips this many days before it starts

  function dateFor(now, [m, d], yearOffset = 0) {
    return new Date(now.getFullYear() + yearOffset, m - 1, d);
  }

  function inRange(now, [sm, sd], [em, ed]) {
    const start = dateFor(now, [sm, sd]);
    const end = new Date(now.getFullYear(), em - 1, ed, 23, 59, 59);
    return now >= start && now <= end;
  }

  function daysUntilStart(now, [sm, sd]) {
    let start = dateFor(now, [sm, sd]);
    if (start < now) start = dateFor(now, [sm, sd], 1); // wrap to next year
    return Math.ceil((start - now) / 86400000);
  }

  // Pick whichever season is either currently active, or soonest upcoming
  // within LOOKAHEAD_DAYS — so the panel stays useful year-round instead of
  // going dark for the months between seasons.
  function pickSeason() {
    const now = new Date();
    const active = SEASONS.find(s => inRange(now, s.start, s.end));
    if (active) return { season: active, daysAway: 0 };

    let best = null;
    for (const s of SEASONS) {
      const days = daysUntilStart(now, s.start);
      if (days <= LOOKAHEAD_DAYS && (!best || days < best.daysAway)) {
        best = { season: s, daysAway: days };
      }
    }
    return best;
  }

  // Rendered as the first card in the News Feed — styled like a sponsored/
  // promoted post (icon + eyebrow label + headline + CTA that expands the
  // tips) rather than a plain notice box in the Overview.
  function initHolidayTips() {
    const slot = document.getElementById('nf-promo-slot');
    if (!slot) return;

    const picked = pickSeason();
    if (!picked) return; // nothing active or upcoming — leave the slot empty

    const { season, daysAway } = picked;
    const dismissKey = 'htp-dismissed-' + season.key + '-' + new Date().getFullYear();
    if (localStorage.getItem(dismissKey) === '1') return;

    const subtitle = daysAway > 0
      ? `Coming up in ${daysAway} day${daysAway === 1 ? '' : 's'} — here's what to watch for`
      : season.subtitle;

    slot.innerHTML = `
      <div class="nf-promo-card" id="nf-promo-card">
        <div class="nf-promo-top">
          <div class="nf-promo-icon">${season.icon}</div>
          <div class="nf-promo-body">
            <div class="nf-promo-eyebrow">Safety Tip · Sponsored by FactChecker Pro</div>
            <div class="nf-promo-title">${escapeHtml(season.title)}</div>
            <div class="nf-promo-subtitle">${escapeHtml(subtitle)}</div>
          </div>
          <button class="nf-promo-dismiss" id="nf-promo-dismiss" title="Hide this card">✕</button>
        </div>
        <button class="nf-promo-cta" id="nf-promo-cta">👀 See the tips</button>
        <ul class="nf-promo-tips" id="nf-promo-tips">
          ${season.tips.map(t => `<li>${escapeHtml(t)}</li>`).join('')}
        </ul>
      </div>`;

    const card = document.getElementById('nf-promo-card');
    const cta  = document.getElementById('nf-promo-cta');
    const tips = document.getElementById('nf-promo-tips');
    cta.addEventListener('click', () => {
      const open = tips.classList.toggle('open');
      cta.textContent = open ? '🙈 Hide tips' : '👀 See the tips';
    });

    document.getElementById('nf-promo-dismiss').addEventListener('click', () => {
      card.style.transition = 'opacity 0.3s, max-height 0.4s';
      card.style.opacity = '0';
      card.style.maxHeight = '0';
      card.style.overflow = 'hidden';
      card.style.marginBottom = '0';
      setTimeout(() => { slot.innerHTML = ''; }, 400);
      try { localStorage.setItem(dismissKey, '1'); } catch (_) {}
    });
  }

  initHolidayTips();
})();

// ═══════════════════════════════════════════════════════════════════════════
// FACTPLAY — Spot the Fake, Live Event Rail, Viral Radar, Screenshot Check,
// Creator Credibility, Squad Mode. Ported from the extension dashboard;
// talks to the backend exclusively through fc.runtime.sendMessage(), same
// as every other feature in this file.
// ═══════════════════════════════════════════════════════════════════════════
let fpInited = false;
let fpSfRound = null; // { real: {text,source}, fake: {text,source,url}, realIsA: bool }

function fpSwitchTab(tab) {
  document.querySelectorAll('#view-factplay .fp-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.fptab === tab));
  document.querySelectorAll('#view-factplay .fp-panel').forEach(p =>
    p.classList.toggle('active', p.id === `fp-panel-${tab}`));

  if (tab === 'radar') fpLoadRadar();
  if (tab === 'squad') fpLoadSquads();
}

// ── Spot the Fake ────────────────────────────────────────────────────────────
const FP_STREAK_BADGES = [
  { min: 30, badge: '🏅 Legend' },
  { min: 7,  badge: '🔥 On fire' },
  { min: 3,  badge: '✨ Building' },
];
function fpStreakBadge(streak) {
  const hit = FP_STREAK_BADGES.find(b => streak >= b.min);
  return hit ? hit.badge : '';
}

function fpRenderStats(stats) {
  const streak = stats ? stats.streak : null;
  document.getElementById('fp-sf-streak').textContent   = streak !== null ? streak : '–';
  document.getElementById('fp-sf-accuracy').textContent = stats ? `${stats.accuracy}%` : '–';
  document.getElementById('fp-sf-played').textContent   = stats ? stats.totalPlayed  : '–';
  const xpEl = document.getElementById('fp-sf-xp');
  if (xpEl) {
    const xp = stats ? (stats.totalPlayed * 10) + (stats.streak * 25) + Math.round(stats.accuracy * 2) : 0;
    xpEl.textContent = stats ? `⭐ ${xp} XP` : '';
  }
  const badgeEl = document.getElementById('fp-sf-badge');
  if (badgeEl) badgeEl.textContent = streak !== null ? fpStreakBadge(streak) : '';
}

let fpTimerInterval = null;
function fpStartCountdown(seconds, onTick) {
  if (fpTimerInterval) clearInterval(fpTimerInterval);
  let remaining = seconds;
  onTick(remaining);
  fpTimerInterval = setInterval(() => {
    remaining -= 1;
    onTick(remaining);
    if (remaining <= 0) clearInterval(fpTimerInterval);
  }, 1000);
}
function fpStopCountdown() {
  if (fpTimerInterval) clearInterval(fpTimerInterval);
}

function fpConfetti(container) {
  const burst = document.createElement('div');
  burst.className = 'fp-confetti';
  const emojis = ['🎉', '✨', '🎊', '⭐'];
  for (let i = 0; i < 14; i++) {
    const piece = document.createElement('span');
    piece.textContent = emojis[i % emojis.length];
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.animationDelay = `${Math.random() * 0.3}s`;
    burst.appendChild(piece);
  }
  container.appendChild(burst);
  setTimeout(() => burst.remove(), 1400);
}

async function fpBuildRound() {
  let real = null;
  try {
    const result = await fc.runtime.sendMessage({ type: 'FC_GET_NEWS', category: 'general', max: '20' });
    const articles = ((result && result.articles) || []).filter(a => a.title);
    if (articles.length) {
      const a = articles[Math.floor(Math.random() * articles.length)];
      real = { text: a.title, source: a.source?.name || 'News' };
    }
  } catch (_) {}

  let fake = null;
  try {
    const result = await fc.runtime.sendMessage({ type: 'FC_GET_DEBUNKED', lang: 'en', pageSize: '20' });
    const claims = ((result && result.claims) || []).filter(c => c.text);
    if (claims.length) {
      const c = claims[Math.floor(Math.random() * claims.length)];
      const review = (c.claimReview || [])[0] || {};
      fake = { text: c.text, source: review.publisher?.name || 'Fact-check', url: review.url || '#' };
    }
  } catch (_) {}

  if (!real || !fake) return null;
  return { real, fake, realIsA: Math.random() < 0.5 };
}

function fpRenderRound(round) {
  const a = round.realIsA ? round.real : round.fake;
  const b = round.realIsA ? round.fake : round.real;
  return `
    <div class="fp-sf-timer-row"><span id="fp-sf-timer" class="fp-sf-timer">⏱ 15s</span></div>
    <div class="fp-sf-cards">
      <button class="fp-sf-card" data-choice="a">
        <div class="fp-sf-card-label">A</div>
        <div class="fp-sf-card-text">${escapeHtml(a.text)}</div>
      </button>
      <button class="fp-sf-card" data-choice="b">
        <div class="fp-sf-card-label">B</div>
        <div class="fp-sf-card-text">${escapeHtml(b.text)}</div>
      </button>
    </div>
    <div class="fp-sf-hint">Which one is real news — and which is a debunked claim?</div>
  `;
}

// Practice rounds: the daily round counts toward streak/accuracy on the
// server. After it (or if it's already been played today) the user can keep
// going with unlimited practice rounds — each a fresh random pair — tallied
// locally for the session. Lets people at a live event play repeatedly.
let fpPracticePlayed = 0;
let fpPracticeCorrect = 0;

function fpPracticeTallyHtml() {
  if (!fpPracticePlayed) return '';
  return `<div class="fp-sf-practice-tally">Practice this session: <strong>${fpPracticeCorrect}/${fpPracticePlayed}</strong> correct</div>`;
}

function fpPlayAgainHtml(label) {
  return `<div class="fp-sf-again-row">
    <button class="fp-sf-again-btn" id="fp-sf-again">${label}</button>
    ${fpPracticeTallyHtml()}
  </div>`;
}

function fpWirePlayAgain(gameEl) {
  const btn = gameEl.querySelector('#fp-sf-again');
  if (btn) btn.addEventListener('click', () => fpStartRound(true));
}

async function fpStartRound(practice = false) {
  const gameEl = document.getElementById('fp-sf-game');
  gameEl.innerHTML = `<div class="empty-state">${practice ? 'Loading a practice round…' : "Loading today's round…"}</div>`;
  const round = await fpBuildRound();
  if (!round) {
    gameEl.innerHTML = '<div class="empty-state">Couldn\'t load a round right now — try again shortly.</div>';
    return;
  }
  round.practice = practice;
  fpSfRound = round;
  gameEl.innerHTML = (practice ? '<div class="fp-sf-practice-badge">Practice round · doesn\'t affect your streak</div>' : '') + fpRenderRound(round);
  gameEl.querySelectorAll('.fp-sf-card').forEach(btn => {
    btn.addEventListener('click', () => fpAnswerRound(btn.dataset.choice));
  });
  const timerEl = document.getElementById('fp-sf-timer');
  fpStartCountdown(15, (remaining) => {
    if (!timerEl) return;
    timerEl.textContent = remaining > 0 ? `⏱ ${remaining}s` : '⏱ Time\'s up — pick one!';
    timerEl.classList.toggle('fp-sf-timer-low', remaining <= 5 && remaining > 0);
  });
}

async function fpAnswerRound(choice) {
  if (!fpSfRound) return;
  fpStopCountdown();
  const chosenIsReal = (choice === 'a') === fpSfRound.realIsA;
  const gameEl = document.getElementById('fp-sf-game');

  gameEl.innerHTML = `
    <div class="fp-sf-result ${chosenIsReal ? 'fp-sf-correct' : 'fp-sf-wrong'}">
      <div class="fp-sf-result-icon">${chosenIsReal ? '✅' : '❌'}</div>
      <div class="fp-sf-result-title">${chosenIsReal ? 'Nice — that was the real headline.' : 'Not quite — that one was the debunked claim.'}</div>
      <div class="fp-sf-result-detail">
        <div><strong>Real:</strong> ${escapeHtml(fpSfRound.real.text)} <span style="color:var(--gray400)">— ${escapeHtml(fpSfRound.real.source)}</span></div>
        <div><strong>Debunked:</strong> ${escapeHtml(fpSfRound.fake.text)} <span style="color:var(--gray400)">— ${escapeHtml(fpSfRound.fake.source)}</span></div>
      </div>
    </div>`;
  if (chosenIsReal) fpConfetti(gameEl);

  if (fpSfRound.practice) {
    fpPracticePlayed += 1;
    if (chosenIsReal) fpPracticeCorrect += 1;
    gameEl.insertAdjacentHTML('beforeend', fpPlayAgainHtml('▶ Next practice round'));
    fpWirePlayAgain(gameEl);
    return;
  }

  try {
    const result = await fc.runtime.sendMessage({ type: 'FC_FACTPLAY_SUBMIT', correct: chosenIsReal });
    if (result && result.ok) fpRenderStats(result);
  } catch (_) {}
  gameEl.insertAdjacentHTML('beforeend', fpPlayAgainHtml('▶ Keep playing (practice)'));
  fpWirePlayAgain(gameEl);
}

async function fpInitSpotFake() {
  let stats = null;
  try {
    const result = await fc.runtime.sendMessage({ type: 'FC_FACTPLAY_STATUS' });
    if (result && result.ok) stats = result;
  } catch (_) {}
  fpRenderStats(stats);
  if (stats && stats.playedToday) {
    const gameEl = document.getElementById('fp-sf-game');
    gameEl.innerHTML =
      '<div class="empty-state">You\'ve already played today\'s round — your streak is safe. Want more? Practice rounds are unlimited.</div>' +
      fpPlayAgainHtml('▶ Play a practice round');
    fpWirePlayAgain(gameEl);
  } else {
    fpStartRound();
  }
}

// ── Live Event Fact-Check Rail ───────────────────────────────────────────────
function fpSocialLinks(q) {
  return [
    { name: '🟠 Reddit',    url: `https://www.reddit.com/search/?q=${encodeURIComponent(q)}` },
    { name: '🐦 X',         url: `https://twitter.com/search?q=${encodeURIComponent(q)}&src=typed_query&f=live` },
    { name: '🎵 TikTok',    url: `https://www.tiktok.com/search?q=${encodeURIComponent(q)}` },
    { name: '✍️ Substack',  url: `https://substack.com/search/${encodeURIComponent(q)}` },
    { name: '💼 LinkedIn',  url: `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(q)}` },
    { name: '📷 Instagram', url: `https://www.instagram.com/explore/tags/${q.replace(/\s+/g, '')}/` },
  ];
}

async function fpSearchLive() {
  const q = document.getElementById('fp-live-query').value.trim();
  const out = document.getElementById('fp-live-results');
  if (!q) { out.innerHTML = ''; return; }
  out.innerHTML = '<div class="empty-state">Searching…</div>';

  let headlines = [], claims = [];
  try {
    const result = await fc.runtime.sendMessage({ type: 'FC_GET_NEWS', q, max: '6' });
    headlines = (result && result.articles) || [];
  } catch (_) {}
  try {
    const result = await fc.runtime.sendMessage({ type: 'FC_GET_DEBUNKED', lang: 'en', pageSize: '6', q });
    claims = (result && result.claims) || [];
  } catch (_) {}

  const socialLinks = fpSocialLinks(q).map(s =>
    `<a class="fp-social-chip" href="#" data-url="${escapeHtml(s.url)}">${s.name} →</a>`).join('');

  const headlinesHtml = headlines.length
    ? headlines.map(a => `
        <a class="nf-feed-card" href="#" data-url="${escapeHtml(a.url)}">
          <div class="nf-feed-body">
            <div class="nf-feed-meta">${escapeHtml(a.source?.name || '')}</div>
            <div class="nf-feed-title">${escapeHtml(a.title || '')}</div>
          </div>
        </a>`).join('')
    : '<div class="empty-state">No matching headlines yet.</div>';

  const claimsHtml = claims.length ? claims.map(renderDebunkedCard).join('') : '<div class="empty-state">No fact-checked claims found for this yet.</div>';

  out.innerHTML = `
    <div class="fp-live-section">
      <div class="fp-live-heading">Trending claims about "${escapeHtml(q)}"</div>
      ${claimsHtml}
    </div>
    <div class="fp-live-section">
      <div class="fp-live-heading">Latest headlines</div>
      ${headlinesHtml}
    </div>
    <div class="fp-live-section">
      <div class="fp-live-heading">Check what's spreading on social</div>
      <div class="fp-social-chips">${socialLinks}</div>
    </div>`;

  out.querySelectorAll('[data-url]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      fc.runtime.sendMessage({ type: 'FC_OPEN_EXTERNAL', url: el.dataset.url });
    });
  });
}

// ── Viral Radar ──────────────────────────────────────────────────────────────
async function fpLoadRadar() {
  const out = document.getElementById('fp-radar-list');
  out.innerHTML = '<div class="empty-state">Loading…</div>';
  try {
    const result = await fc.runtime.sendMessage({ type: 'FC_GET_DEBUNKED', lang: 'en', pageSize: '10' });
    const claims = (result && result.claims) || [];
    if (!claims.length) {
      out.innerHTML = '<div class="empty-state">Nothing being tracked right now — check back soon.</div>';
      return;
    }
    out.innerHTML = claims.map(renderDebunkedCard).join('');
  } catch (_) {
    out.innerHTML = '<div class="empty-state">Couldn\'t load the radar right now.</div>';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ELECTION WATCH NL — pilot module. Mirrors the extension dashboard's EWNL
// module. Fetches through the main process (FC_GET_ELECTIONWATCH_NL) so
// requests go via electron net.fetch, same as the rest of the app.
// ═══════════════════════════════════════════════════════════════════════════════
let ewnlInited = false;

function renderEwnlClaims(claims) {
  const list = document.getElementById('ewnl-claims-list');
  if (!list) return;
  if (!claims.length) {
    list.innerHTML = '<div class="empty-state">Nog geen resultaten voor dit onderwerp — probeer een andere zoekterm.</div>';
    return;
  }
  list.innerHTML = claims.map(c => {
    const r = (c.claimReview || [])[0] || {};
    return `<div class="ewnl-claim-card">
      <div class="ewnl-claim-text">${escapeHtml(c.text || '')}</div>
      <div class="ewnl-claim-meta">
        ${r.textualRating ? `<span class="ewnl-claim-rating">${escapeHtml(r.textualRating)}</span>` : ''}
        ${r.publisher?.name ? `<span class="ewnl-claim-source">${escapeHtml(r.publisher.name)}</span>` : ''}
        <a class="ewnl-claim-link" href="${r.url || '#'}" target="_blank" rel="noopener">Bekijk factcheck →</a>
      </div>
    </div>`;
  }).join('');
}

function renderEwnlNews(articles) {
  const el = document.getElementById('ewnl-news-list');
  if (!el) return;
  if (!articles.length) {
    el.innerHTML = '<p style="font-size:12px;color:var(--gray600)">Geen recent nieuws gevonden.</p>';
    return;
  }
  el.innerHTML = articles.map(a => `
    <div class="ewnl-news-item">
      <a href="${a.url || '#'}" target="_blank" rel="noopener">${escapeHtml(a.title || '')}</a>
      <span class="ewnl-news-source">${escapeHtml(a.source?.name || 'GNews')}</span>
    </div>
  `).join('');
}

async function loadElectionWatchNL(q) {
  const list = document.getElementById('ewnl-claims-list');
  const newsList = document.getElementById('ewnl-news-list');
  if (list) list.innerHTML = '<div class="empty-state">Loading…</div>';
  if (newsList) newsList.innerHTML = '<div class="empty-state">Loading…</div>';
  try {
    const result = await fc.runtime.sendMessage({ type: 'FC_GET_ELECTIONWATCH_NL', q: q || '' });
    renderEwnlClaims((result && result.claims) || []);
    renderEwnlNews((result && result.articles) || []);
  } catch (_) {
    if (list) list.innerHTML = '<div class="empty-state">Kon de gegevens niet laden. Probeer het later opnieuw.</div>';
  }
}

function initElectionWatchNL() {
  if (ewnlInited) { return; }
  ewnlInited = true;
  const input = document.getElementById('ewnl-search-input');
  const clearBtn = document.getElementById('ewnl-search-clear');
  let debounceTimer;
  input?.addEventListener('input', () => {
    clearBtn.style.display = input.value ? 'block' : 'none';
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => loadElectionWatchNL(input.value.trim()), 450);
  });
  clearBtn?.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    loadElectionWatchNL('');
  });
  loadElectionWatchNL('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ELECTION WATCH — GLOBAL. Same panel as EWNL above, parameterized by
// country/language instead of fixed to the Netherlands. Mirrors the
// extension dashboard's EWGlobal module — backed by FC_GET_ELECTIONWATCH_GLOBAL
// in the main process (src/main/ipc.js), which hits
// /api/electionwatch/global/*.
// ═══════════════════════════════════════════════════════════════════════════════
let ewgInited = false;

function renderEwgClaims(claims) {
  const list = document.getElementById('ewg-claims-list');
  if (!list) return;
  if (!claims.length) {
    list.innerHTML = '<div class="empty-state">No claims for this search yet.</div>';
    return;
  }
  list.innerHTML = claims.map(c => {
    const r = (c.claimReview || [])[0] || {};
    return `<div class="ewnl-claim-card">
      <div class="ewnl-claim-text">${escapeHtml(c.text || '')}</div>
      <div class="ewnl-claim-meta">
        ${r.textualRating ? `<span class="ewnl-claim-rating">${escapeHtml(r.textualRating)}</span>` : ''}
        ${r.publisher?.name ? `<span class="ewnl-claim-source">${escapeHtml(r.publisher.name)}</span>` : ''}
        <a class="ewnl-claim-link" href="${r.url || '#'}" target="_blank" rel="noopener">View fact-check →</a>
      </div>
    </div>`;
  }).join('');
}

function renderEwgNews(articles) {
  const el = document.getElementById('ewg-news-list');
  if (!el) return;
  if (!articles.length) {
    el.innerHTML = '<p style="font-size:12px;color:var(--gray600)">No related news right now.</p>';
    return;
  }
  el.innerHTML = articles.map(a => `
    <div class="ewnl-news-item">
      <a href="${a.url || '#'}" target="_blank" rel="noopener">${escapeHtml(a.title || '')}</a>
      <span class="ewnl-news-source">${escapeHtml(a.source?.name || 'GNews')}</span>
    </div>
  `).join('');
}

async function loadElectionWatchGlobal(q) {
  const list = document.getElementById('ewg-claims-list');
  const newsList = document.getElementById('ewg-news-list');
  const country = document.getElementById('ewg-country-select')?.value || 'us';
  const lang = document.getElementById('ewg-lang-select')?.value || 'en';
  if (list) list.innerHTML = '<div class="empty-state">Loading…</div>';
  if (newsList) newsList.innerHTML = '<div class="empty-state">Loading…</div>';
  try {
    const result = await fc.runtime.sendMessage({ type: 'FC_GET_ELECTIONWATCH_GLOBAL', q: q || '', country, lang });
    renderEwgClaims((result && result.claims) || []);
    renderEwgNews((result && result.articles) || []);
  } catch (_) {
    if (list) list.innerHTML = '<div class="empty-state">Could not load Election Watch right now. Try again later.</div>';
  }
}

function initElectionWatchGlobal() {
  if (ewgInited) { return; }
  ewgInited = true;
  const input = document.getElementById('ewg-search-input');
  const clearBtn = document.getElementById('ewg-search-clear');
  let debounceTimer;
  const currentQuery = () => input?.value.trim() || '';
  input?.addEventListener('input', () => {
    clearBtn.style.display = input.value ? 'block' : 'none';
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => loadElectionWatchGlobal(input.value.trim()), 450);
  });
  clearBtn?.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    loadElectionWatchGlobal('');
  });
  document.getElementById('ewg-country-select')?.addEventListener('change', () => loadElectionWatchGlobal(currentQuery()));
  document.getElementById('ewg-lang-select')?.addEventListener('change', () => loadElectionWatchGlobal(currentQuery()));
  loadElectionWatchGlobal('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// PODCAST SEARCH — directory lookup via FC_SEARCH_PODCASTS (iTunes Search
// API under the hood, see server/routes/podcasts.js). Mirrors the extension
// dashboard's PodSearch module.
// ═══════════════════════════════════════════════════════════════════════════════
let podInited = false;
const POD_STARTING_NAMES = ['Joe Rogan', 'The Daily', 'Call Her Daddy', 'Serial', 'Freakonomics'];

function renderPodChips() {
  const el = document.getElementById('pod-starting-chips');
  if (!el) return;
  el.innerHTML = POD_STARTING_NAMES.map(n => `<button class="pod-chip" data-name="${escapeHtml(n)}">${escapeHtml(n)}</button>`).join('');
  el.querySelectorAll('.pod-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById('pod-search-input');
      if (input) input.value = btn.dataset.name;
      searchPodcasts(btn.dataset.name);
    });
  });
}

function renderPodResults(podcasts) {
  const el = document.getElementById('pod-results');
  if (!el) return;
  if (!podcasts.length) {
    el.innerHTML = '<div class="empty-state">No matching podcasts found.</div>';
    return;
  }
  el.innerHTML = podcasts.map(p => `
    <a class="pod-card" href="${p.itunesUrl || '#'}" target="_blank" rel="noopener">
      ${p.artwork ? `<img class="pod-card-art" src="${escapeHtml(p.artwork)}" alt="">` : `<div class="pod-card-icon">🎙️</div>`}
      <div>
        <div class="pod-card-name">${escapeHtml(p.name || '')}</div>
        <div class="pod-card-meta">${escapeHtml([p.artist, p.genre].filter(Boolean).join(' · '))}</div>
      </div>
    </a>
  `).join('');
}

async function searchPodcasts(q) {
  const query = (q || '').trim();
  const chips = document.getElementById('pod-starting-chips');
  const loading = document.getElementById('pod-loading');
  const results = document.getElementById('pod-results');
  if (!query) {
    if (results) results.innerHTML = '';
    if (chips) chips.style.display = 'flex';
    return;
  }
  if (chips) chips.style.display = 'none';
  if (loading) loading.style.display = 'flex';
  if (results) results.innerHTML = '';
  try {
    const result = await fc.runtime.sendMessage({ type: 'FC_SEARCH_PODCASTS', q: query });
    if (loading) loading.style.display = 'none';
    renderPodResults((result && result.podcasts) || []);
  } catch (_) {
    if (loading) loading.style.display = 'none';
    if (results) results.innerHTML = '<div class="empty-state">Could not search podcasts right now.</div>';
  }
}

function initPodcastSearch() {
  if (podInited) { return; }
  podInited = true;
  renderPodChips();
  const input = document.getElementById('pod-search-input');
  const clearBtn = document.getElementById('pod-search-clear');
  let debounceTimer;
  input?.addEventListener('input', () => {
    clearBtn.style.display = input.value ? 'block' : 'none';
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => searchPodcasts(input.value), 450);
  });
  clearBtn?.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    searchPodcasts('');
  });
}

// ── Screenshot Check ─────────────────────────────────────────────────────────
function fpInitScreenshot() {
  const fileInput = document.getElementById('fp-ss-file');
  if (!fileInput || fileInput._fpWired) return;
  fileInput._fpWired = true;
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    const preview = document.getElementById('fp-ss-preview');
    const tools   = document.getElementById('fp-ss-tools');
    if (!file) { preview.innerHTML = ''; tools.style.display = 'none'; return; }
    const url = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${url}" alt="Screenshot preview" style="max-width:100%;max-height:280px;border-radius:10px;border:1px solid var(--gray200);margin-bottom:14px;">`;
    tools.style.display = '';
  });

  ['fp-ss-google', 'fp-ss-tineye', 'fp-ss-yandex'].forEach(id => {
    const el = document.getElementById(id);
    if (!el || el._fpWired) return;
    el._fpWired = true;
    const urls = {
      'fp-ss-google': 'https://images.google.com/',
      'fp-ss-tineye': 'https://tineye.com/',
      'fp-ss-yandex': 'https://yandex.com/images/'
    };
    el.addEventListener('click', (e) => {
      e.preventDefault();
      fc.runtime.sendMessage({ type: 'FC_OPEN_EXTERNAL', url: urls[id] });
    });
  });
}

// ── Creator Credibility ──────────────────────────────────────────────────────
const FP_SOURCE_TRUST = {
  'ap':1,'associated press':1,'reuters':1,'bbc':1,'bbc news':1,'npr':1,'pbs':1,
  'the guardian':1,'guardian':1,'new york times':1,'nytimes':1,'washington post':1,
  'the economist':1,'science':1,'nature':1,'agence france-presse':1,'bloomberg':1,
  'financial times':1,'abc news':1,'cbs news':1,'politico':1,'axios':1,'the hill':1,
  'snopes':1,'politifact':1,'fullfact':1,'africa check':1,'factcheck.org':1,
  'cnn':2,'msnbc':2,'fox news':2,'daily mail':2,'new york post':2,'ny post':2,
  'huffpost':2,'buzzfeed':2,'vice':2,'vox':2,'salon':2,'newsweek':2,'time':2,
  'usa today':2,'business insider':2,'the telegraph':2,'the sun':2,
  'natural news':3,'naturalnews':3,'infowars':3,'breitbart':3,'daily caller':3,
  'epoch times':3,'oann':3,'one america news':3,'the gateway pundit':3,'newsmax':3,
};

function fpCheckCreator() {
  const q = document.getElementById('fp-creator-query').value.trim();
  const out = document.getElementById('fp-creator-result');
  if (!q) { out.innerHTML = ''; return; }
  const tier = FP_SOURCE_TRUST[q.toLowerCase()];
  let label, cls, desc;
  if (tier === 1)      { label = 'Trusted';  cls = 'cred-green';  desc = 'Consistently reliable, with strong editorial standards and a track record of accuracy.'; }
  else if (tier === 2) { label = 'Mixed';     cls = 'cred-yellow'; desc = 'Generally factual but sometimes uses sensational framing or has a strong editorial slant — verify big claims elsewhere.'; }
  else if (tier === 3) { label = 'Caution';   cls = 'cred-red';    desc = 'Known history of publishing misleading or false claims. Cross-check anything from this source before sharing.'; }
  else                 { label = 'Unrated';   cls = 'cred-gray';   desc = 'Not yet in our trust database. Check the publisher on Media Bias/Fact Check or Snopes before trusting a big claim.'; }

  out.innerHTML = `
    <div class="fp-creator-card">
      <div class="fp-creator-name">${escapeHtml(q)}</div>
      <span class="nf-cred-badge ${cls}">${label}</span>
      <p class="fp-creator-desc">${desc}</p>
      <a class="fp-creator-link" href="#" id="fp-creator-mbfc">Look up on Media Bias/Fact Check →</a>
    </div>`;
  document.getElementById('fp-creator-mbfc')?.addEventListener('click', (e) => {
    e.preventDefault();
    fc.runtime.sendMessage({ type: 'FC_OPEN_EXTERNAL', url: `https://mediabiasfactcheck.com/?s=${encodeURIComponent(q)}` });
  });
}

// ── Job Offer Check — rule-based scam red-flag scanner (no external API) ───
const FP_JOB_RED_FLAGS = [
  { re: /(pay|send).{0,20}(fee|deposit|training cost|registration cost|starter kit)/i,
    label: 'Asks you to pay to get the job', why: 'Legitimate employers never charge you to be hired.' },
  { re: /western union|moneygram|gift card|cryptocurrency|bitcoin|wire transfer/i,
    label: 'Unusual payment method requested', why: 'These payment methods are hard to trace or reverse — a favorite of scammers.' },
  { re: /bank account (number|details)|routing number|social security number|\bssn\b/i,
    label: 'Asks for banking or ID details early', why: 'Real employers only need this after you\'ve signed a formal, verified offer.' },
  { re: /\$\d{3,}\s*\/?\s*(per\s+)?(day|week)\b|guaranteed income|no experience.{0,15}\$\d|earn \$\d{3,}/i,
    label: 'Pay sounds too good for the effort described', why: 'Unrealistic pay for minimal work is a classic lure.' },
  { re: /immediate(ly)? hir(e|ing)|urgent(ly)? (hiring|need)|start (today|tomorrow).{0,20}no interview|no interview (required|needed)/i,
    label: 'Pressure to start immediately with no real interview', why: 'Legitimate hiring almost always includes a verification step.' },
  { re: /(only|via|on) (telegram|whatsapp)\b|personal (gmail|email) only/i,
    label: 'Communication routed through personal chat apps', why: 'Real companies correspond from a verifiable company domain.' },
  { re: /cash(ing)? (a |this )?check|deposit.{0,20}check.{0,20}send (back|remainder)|overpayment/i,
    label: 'Overpayment / deposit-and-send-back-the-difference scheme', why: 'This is the classic fake-check scam — the check later bounces and you\'re liable.' },
  { re: /purchase (your own|the) (equipment|laptop|kit) (from us|through us)/i,
    label: 'Asks you to buy equipment through them specifically', why: 'A red flag for equipment-reimbursement scams.' },
];

function fpCheckJob() {
  const text = document.getElementById('fp-job-input').value.trim();
  const out = document.getElementById('fp-job-result');
  if (!text) { out.innerHTML = ''; return; }

  const hits = FP_JOB_RED_FLAGS.filter(f => f.re.test(text));
  let verdict, cls;
  if (hits.length === 0)      { verdict = 'No obvious red flags found';    cls = 'cred-green'; }
  else if (hits.length <= 2)  { verdict = 'Some red flags — verify carefully'; cls = 'cred-yellow'; }
  else                        { verdict = 'High risk of scam';            cls = 'cred-red'; }

  out.innerHTML = `
    <div class="fp-creator-card">
      <span class="nf-cred-badge ${cls}">${escapeHtml(verdict)}</span>
      ${hits.length ? `
        <ul class="fp-job-flags">
          ${hits.map(h => `<li><strong>${escapeHtml(h.label)}</strong><br><span>${escapeHtml(h.why)}</span></li>`).join('')}
        </ul>` : `<p class="fp-creator-desc">This doesn't match our common scam patterns, but always verify the company independently before sharing any personal or financial information.</p>`}
    </div>`;
}

// ── Squad Mode ───────────────────────────────────────────────────────────────
async function fpLoadSquads() {
  const out = document.getElementById('fp-squad-list');
  out.innerHTML = '<div class="empty-state">Loading your squads…</div>';
  try {
    const result = await fc.runtime.sendMessage({ type: 'FC_FACTPLAY_SQUADS_MINE' });
    if (!result || !result.ok) throw new Error((result && result.error) || 'Failed to load squads');
    const squads = result.squads || [];
    if (!squads.length) {
      out.innerHTML = '<div class="empty-state">You\'re not in a squad yet — create one or join with an invite code.</div>';
      return;
    }
    out.innerHTML = squads.map(s => `
      <div class="fp-squad-card">
        <div class="fp-squad-card-head">
          <div class="fp-squad-card-name">${escapeHtml(s.name)}</div>
          <div class="fp-squad-card-meta">${s.memberCount} member${s.memberCount === 1 ? '' : 's'} · code <code>${escapeHtml(s.inviteCode)}</code></div>
        </div>
        <div class="fp-squad-leaderboard" id="fp-squad-lb-${s.id}">
          <div class="empty-state">Loading leaderboard…</div>
        </div>
      </div>`).join('');
    squads.forEach(s => fpLoadLeaderboard(s.id));
  } catch (err) {
    out.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

async function fpLoadLeaderboard(squadId) {
  const el = document.getElementById(`fp-squad-lb-${squadId}`);
  if (!el) return;
  try {
    const result = await fc.runtime.sendMessage({ type: 'FC_FACTPLAY_LEADERBOARD', squadId });
    if (!result || !result.ok) throw new Error((result && result.error) || 'Failed to load leaderboard');
    const board = result.leaderboard || [];
    el.innerHTML = `
      <table class="fp-lb-table">
        <thead><tr><th>#</th><th>Player</th><th>Streak</th><th>Accuracy</th></tr></thead>
        <tbody>
          ${board.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${escapeHtml(r.username)}</td>
              <td>🔥 ${r.streak}</td>
              <td>${r.accuracy}%</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    el.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

async function fpCreateSquad() {
  const nameInput = document.getElementById('fp-squad-name');
  const name = nameInput.value.trim();
  if (!name) return;
  try {
    const result = await fc.runtime.sendMessage({ type: 'FC_FACTPLAY_SQUAD_CREATE', name });
    if (!result || !result.ok) throw new Error((result && result.error) || 'Failed to create squad');
    nameInput.value = '';
    fpLoadSquads();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function fpJoinSquad() {
  const codeInput = document.getElementById('fp-squad-code');
  const inviteCode = codeInput.value.trim();
  if (!inviteCode) return;
  try {
    const result = await fc.runtime.sendMessage({ type: 'FC_FACTPLAY_SQUAD_JOIN', inviteCode });
    if (!result || !result.ok) throw new Error((result && result.error) || 'Failed to join squad');
    codeInput.value = '';
    fpLoadSquads();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────
function initFactPlay() {
  if (fpInited) return;
  fpInited = true;

  document.querySelectorAll('#view-factplay .fp-tab').forEach(btn => {
    btn.addEventListener('click', () => fpSwitchTab(btn.dataset.fptab));
  });

  document.getElementById('fp-live-search')?.addEventListener('click', fpSearchLive);
  document.getElementById('fp-live-query')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') fpSearchLive();
  });

  document.getElementById('fp-creator-search')?.addEventListener('click', fpCheckCreator);
  document.getElementById('fp-creator-query')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') fpCheckCreator();
  });

  document.getElementById('fp-squad-create')?.addEventListener('click', fpCreateSquad);
  document.getElementById('fp-squad-join')?.addEventListener('click', fpJoinSquad);

  document.getElementById('fp-job-check')?.addEventListener('click', fpCheckJob);

  fpInitScreenshot();
  fpInitSpotFake();
}
