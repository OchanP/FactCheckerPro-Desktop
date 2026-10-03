/**
 * IPC message router — a near-verbatim port of background.js's
 * chrome.runtime.onMessage switch statement. Content-script-only message
 * types (tied to a browser tab's DOM) are intentionally omitted; everything
 * that drives the account/hub experience is preserved.
 */
const { ipcMain, shell, app, BrowserWindow } = require('electron');
const store = require('./store');
const { apiCall } = require('./api');
const notifications = require('./notifications');
const windows = require('./windows');
const tray = require('./tray');
const { getRecentEvents, getBridgeStatus } = require('./bridgeServer');

// ── Google OAuth ──────────────────────────────────────────────────────────────
// Paste your Google OAuth 2.0 Client ID here (or set GOOGLE_CLIENT_ID in the
// environment). Get one at: https://console.cloud.google.com → APIs & Services
// → Credentials → Create OAuth 2.0 Client ID (Web application).
// Required redirect URI to register there:
//   https://factchecker-pro-production.up.railway.app/auth/google/desktop-callback
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '490835659683-sfhlk1ttoopau3c9idbgduj7lih4kmdo.apps.googleusercontent.com';
// ─────────────────────────────────────────────────────────────────────────────

function registerIpc() {
  ipcMain.handle('fc:message', async (event, msg) => {
    switch (msg.type) {
      case 'FC_PING':
        return { ok: true, alive: true };

      case 'FC_AUTH_LOGIN': {
        const result = await apiCall('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ login: msg.login, password: msg.password, rememberMe: !!msg.rememberMe })
        });
        if (result.ok) {
          store.set('sync', {
            authToken: result.data.accessToken,
            refreshToken: result.data.refreshToken,
            apiUser: result.data.user
          });
          // Save email to local store for pre-fill on next launch
          if (msg.rememberMe) {
            store.set('local', { savedEmail: msg.login });
          } else {
            store.remove('local', ['savedEmail']);
          }
          tray.refreshMenu();
        }
        return { ok: result.ok, data: result.data };
      }

      case 'FC_AUTH_REGISTER': {
        const result = await apiCall('/auth/register', {
          method: 'POST',
          body: JSON.stringify(msg.userData)
        });
        if (result.ok) {
          store.set('sync', {
            authToken: result.data.accessToken,
            refreshToken: result.data.refreshToken,
            apiUser: result.data.user
          });
          tray.refreshMenu();
        }
        return { ok: result.ok, data: result.data };
      }

      case 'FC_GOOGLE_AUTH': {
        // Opens a popup BrowserWindow to the Google OAuth consent page.
        // We use the implicit token flow (response_type=token) so no server-side
        // callback is required. Electron intercepts the redirect before it fires,
        // pulls the access_token from the URL fragment, and hands it to our backend.
        if (!GOOGLE_CLIENT_ID) {
          return {
            ok: false,
            error: 'Google Sign-In is not configured. Ask the developer to set the GOOGLE_CLIENT_ID environment variable.'
          };
        }

        // This URI must be registered in Google Cloud Console → OAuth 2.0 Client.
        // Electron intercepts the navigation before the page loads — the backend
        // does not need to handle this path at all.
        const REDIRECT_URI = 'https://factchecker-pro-production.up.railway.app/auth/google/desktop-callback';

        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
        authUrl.searchParams.set('response_type', 'token');
        authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
        authUrl.searchParams.set('scope', 'email profile');
        authUrl.searchParams.set('prompt', 'select_account');

        return new Promise((resolve) => {
          const authWin = new BrowserWindow({
            width: 500,
            height: 680,
            show: true,
            title: 'Sign in with Google',
            webPreferences: { nodeIntegration: false, contextIsolation: true }
          });

          let settled = false;
          function finish(result) {
            if (settled) return;
            settled = true;
            try { if (!authWin.isDestroyed()) authWin.close(); } catch (_) {}
            resolve(result);
          }

          // Called when the OAuth redirect lands. Extracts access_token from fragment.
          function handleRedirectUrl(url) {
            if (!url || !url.startsWith(REDIRECT_URI)) return false;
            let accessToken;
            try {
              const fragment = new URLSearchParams(new URL(url).hash.slice(1));
              accessToken = fragment.get('access_token');
            } catch (_) {}
            if (!accessToken) return false;

            // Exchange with our backend immediately
            apiCall('/auth/google', {
              method: 'POST',
              body: JSON.stringify({ accessToken })
            }).then(result => {
              if (result.ok && result.data) {
                store.set('sync', {
                  authToken: result.data.accessToken,
                  refreshToken: result.data.refreshToken,
                  apiUser: result.data.user
                });
                tray.refreshMenu();
                finish({ ok: true, user: result.data.user });
              } else {
                finish({ ok: false, error: (result.data && result.data.error) || 'Google authentication failed.' });
              }
            }).catch(() => finish({ ok: false, error: 'Google authentication failed. Check your connection.' }));

            return true;
          }

          // Catch server-side 3xx redirects (the final OAuth redirect is one)
          authWin.webContents.on('will-redirect', (event, url) => {
            if (handleRedirectUrl(url)) event.preventDefault();
          });

          // Safety net: catch client-side navigations to the same URI
          authWin.webContents.on('will-navigate', (event, url) => {
            if (handleRedirectUrl(url)) event.preventDefault();
          });

          authWin.on('closed', () => {
            finish({ ok: false, error: 'Google sign-in was cancelled.' });
          });

          authWin.loadURL(authUrl.toString());
        });
      }

      case 'FC_AUTH_LOGOUT': {
        await apiCall('/auth/logout', { method: 'POST' });
        store.remove('sync', ['authToken', 'refreshToken', 'apiUser']);
        tray.refreshMenu();
        return { ok: true };
      }

      case 'FC_AUTH_FORGOT_PASSWORD': {
        const result = await apiCall('/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email: msg.email })
        });
        return { ok: result.ok, data: result.data };
      }

      case 'FC_GET_API_USER': {
        const { apiUser, authToken } = store.get('sync', ['apiUser', 'authToken']);
        const { savedEmail } = store.get('local', ['savedEmail']);
        return { user: apiUser || null, isLoggedIn: !!authToken, savedEmail: savedEmail || null };
      }

      case 'FC_REFRESH_API_PROFILE': {
        const result = await apiCall('/auth/me');
        if (result.ok) {
          store.set('sync', { apiUser: result.data.user });
          return { ok: true, user: result.data.user, badges: result.data.badges };
        }
        return { ok: false };
      }

      case 'FC_GET_PROFILE': {
        const { userProfile } = store.get('sync', ['userProfile']);
        return { profile: userProfile || null };
      }

      case 'FC_SAVE_PROFILE':
        store.set('sync', { userProfile: msg.profile });
        return { ok: true };

      case 'FC_GET_LEADERBOARD': {
        const result = await apiCall('/users/leaderboard');
        return result.ok ? { leaderboard: result.data.leaderboard } : { leaderboard: [] };
      }

      case 'FC_GET_SCORE_HISTORY': {
        const result = await apiCall('/users/me/score-history?limit=30');
        return result.ok ? { history: result.data.history } : { history: [] };
      }

      case 'FC_VOTE_CLAIM': {
        const result = await apiCall(`/claims/${msg.claimId}/vote`, {
          method: 'POST',
          body: JSON.stringify({ vote_type: msg.voteType })
        });
        return { ok: result.ok, data: result.data };
      }

      case 'FC_GET_SUBMISSIONS': {
        const result = await apiCall('/claims?filter=mine&limit=50');
        if (result.ok && result.data.claims) {
          return { submissions: result.data.claims, fromApi: true };
        }
        const { submissions } = store.get('local', ['submissions']);
        return { submissions: submissions || [], fromApi: false };
      }

      case 'FC_SAVE_SUBMISSION': {
        const result = await apiCall('/claims', {
          method: 'POST',
          body: JSON.stringify({
            claim_text: msg.submission.claim,
            source_url: msg.submission.url || 'https://unknown.com',
            category: msg.submission.category || 'general',
            priority: msg.submission.priority || 'medium',
            reason: msg.submission.reason || '',
            evidence_url: msg.submission.evidenceUrl || undefined
          })
        });
        if (result.ok) {
          const { submissions: existing } = store.get('local', ['submissions']);
          const subs = existing || [];
          subs.unshift({
            ...msg.submission,
            id: result.data.claim?.id || 'sub_' + Date.now(),
            status: 'pending',
            timestamp: Date.now(),
            synced: true,
            points_awarded: result.data.points_awarded || 0,
            new_transparency_score: result.data.new_transparency_score
          });
          store.set('local', { submissions: subs });
          notifications.notify(`fc-claim-${Date.now()}`, {
            title: 'Claim submitted',
            message: result.data.points_awarded ? `+${result.data.points_awarded} points — thanks for contributing!` : 'Your claim is now pending review.'
          });
          return {
            ok: true,
            count: subs.length,
            points_awarded: result.data.points_awarded,
            new_transparency_score: result.data.new_transparency_score,
            new_badges: result.data.new_badges || []
          };
        }
        const firstErr = result.data?.errors?.[0];
        const errMsg = result.data?.error || (firstErr ? `${firstErr.path}: ${firstErr.msg}` : 'Unknown error');
        if (result.status === 0 || result.status >= 500) {
          const { submissions: existing } = store.get('local', ['submissions']);
          const subs = existing || [];
          subs.unshift({ ...msg.submission, id: 'sub_' + Date.now(), status: 'pending_sync', timestamp: Date.now(), synced: false });
          store.set('local', { submissions: subs });
          return { ok: true, count: subs.length, offline: true };
        }
        return { ok: false, status: result.status, error: errMsg };
      }

      case 'FC_GET_SETTINGS': {
        const { settings } = store.get('sync', ['settings']);
        return { settings: settings || defaultSettings() };
      }

      case 'FC_SAVE_SETTINGS':
        store.set('sync', { settings: msg.settings });
        if (typeof msg.settings.launchAtLogin === 'boolean') {
          app.setLoginItemSettings({ openAtLogin: msg.settings.launchAtLogin });
        }
        return { ok: true };

      case 'FC_GET_RECENT_EVENTS':
        return { events: getRecentEvents() };

      case 'FC_GET_BRIDGE_STATUS':
        return getBridgeStatus();

      case 'FC_GET_NEWS': {
        const { country='us', lang='en', category='general', max='12', q='' } = msg;
        // Route through our own backend — keeps the GNews key server-side
        let url = `/news/headlines?country=${encodeURIComponent(country)}&lang=${encodeURIComponent(lang)}&category=${encodeURIComponent(category)}&max=${encodeURIComponent(max)}`;
        if (q) url += `&q=${encodeURIComponent(q)}`;
        const result = await apiCall(url);
        return result.ok ? { ok:true, articles: result.data.articles||[] } : { ok:false, articles:[], error: result.data.error||'Failed' };
      }

      case 'FC_GET_DEBUNKED': {
        const { lang='en', pageSize='8', q='' } = msg;
        let url = `/factcheck/search?languageCode=${encodeURIComponent(lang)}&pageSize=${encodeURIComponent(pageSize)}`;
        if (q) url += `&q=${encodeURIComponent(q)}`;
        const result = await apiCall(url);
        return result.ok ? { ok:true, claims: result.data.claims||[] } : { ok:false, claims:[], error: result.data.error||'Failed' };
      }

      // ── Election Watch NL: pilot panel, Dutch-sourced election claims ────────
      case 'FC_GET_ELECTIONWATCH_NL': {
        const { q='' } = msg;
        const qs = q ? `?q=${encodeURIComponent(q)}` : '';
        const [claimsResult, newsResult] = await Promise.all([
          apiCall(`/electionwatch/nl/claims${qs}`),
          apiCall(`/electionwatch/nl/news${qs}`)
        ]);
        return {
          ok: true,
          claims: claimsResult.ok ? (claimsResult.data.claims || []) : [],
          articles: newsResult.ok ? (newsResult.data.articles || []) : []
        };
      }

      // ── Election Watch — Global: same panel, parameterized by country/lang ──
      case 'FC_GET_ELECTIONWATCH_GLOBAL': {
        const { q='', country='us', lang='en' } = msg;
        const qs = new URLSearchParams({ country, lang });
        if (q) qs.set('q', q);
        const [claimsResult, newsResult] = await Promise.all([
          apiCall(`/electionwatch/global/claims?${qs}`),
          apiCall(`/electionwatch/global/news?${qs}`)
        ]);
        return {
          ok: true,
          claims: claimsResult.ok ? (claimsResult.data.claims || []) : [],
          articles: newsResult.ok ? (newsResult.data.articles || []) : []
        };
      }

      // ── Podcast Search: directory lookup (iTunes Search API) ────────────────
      case 'FC_SEARCH_PODCASTS': {
        const { q='' } = msg;
        if (!q) return { ok:true, podcasts:[] };
        const result = await apiCall(`/podcasts/search?q=${encodeURIComponent(q)}&limit=15`);
        return result.ok ? { ok:true, podcasts: result.data.podcasts||[] } : { ok:false, podcasts:[], error: result.data.error||'Failed' };
      }

      // ── FactNews: comment/discussion thread on an article ────────────────────
      case 'FC_GET_NEWS_COMMENTS': {
        const { url='' } = msg;
        if (!url) return { ok:true, comments:[] };
        const result = await apiCall(`/news/comments?url=${encodeURIComponent(url)}`);
        return result.ok ? { ok:true, comments: result.data.comments||[] } : { ok:false, comments:[], error: result.data.error||'Failed' };
      }

      case 'FC_POST_NEWS_COMMENT': {
        const { url='', title='', body='' } = msg;
        if (!url || !body) return { ok:false, error:'Missing url or comment text' };
        const payload = { url, body };
        if (title) payload.title = title;
        const result = await apiCall('/news/comments', {
          method: 'POST', body: JSON.stringify(payload)
        });
        if (result.ok) return { ok:true };
        const errs = result.data.errors;
        return { ok:false, error: (errs && errs[0] && errs[0].msg) || result.data.error || 'Failed to post comment' };
      }

      // ── FactPlay: Spot the Fake daily challenge + squads ─────────────────────
      case 'FC_FACTPLAY_STATUS': {
        const result = await apiCall('/factplay/challenge/status');
        return result.ok ? { ok:true, ...result.data } : { ok:false, error: result.data.error||'Failed' };
      }

      case 'FC_FACTPLAY_SUBMIT': {
        const { correct } = msg;
        const result = await apiCall('/factplay/challenge/submit', {
          method: 'POST', body: JSON.stringify({ correct })
        });
        return result.ok ? { ok:true, ...result.data } : { ok:false, error: result.data.error||'Failed' };
      }

      case 'FC_FACTPLAY_SQUAD_CREATE': {
        const { name } = msg;
        const result = await apiCall('/factplay/squads', {
          method: 'POST', body: JSON.stringify({ name })
        });
        return result.ok ? { ok:true, squad: result.data.squad } : { ok:false, error: result.data.error||'Failed' };
      }

      case 'FC_FACTPLAY_SQUAD_JOIN': {
        const { inviteCode } = msg;
        const result = await apiCall('/factplay/squads/join', {
          method: 'POST', body: JSON.stringify({ inviteCode })
        });
        return result.ok ? { ok:true, squad: result.data.squad } : { ok:false, error: result.data.error||'Failed' };
      }

      case 'FC_FACTPLAY_SQUADS_MINE': {
        const result = await apiCall('/factplay/squads/mine');
        return result.ok ? { ok:true, squads: result.data.squads||[] } : { ok:false, squads:[], error: result.data.error||'Failed' };
      }

      case 'FC_FACTPLAY_LEADERBOARD': {
        const { squadId } = msg;
        const result = await apiCall(`/factplay/squads/${encodeURIComponent(squadId)}/leaderboard`);
        return result.ok ? { ok:true, leaderboard: result.data.leaderboard||[] } : { ok:false, leaderboard:[], error: result.data.error||'Failed' };
      }

      case 'FC_GET_MODQUEUE': {
        const result = await apiCall('/admin/modqueue');
        return result.ok ? { ok:true, queue:result.data.queue||[] } : { ok:false, queue:[] };
      }

      case 'FC_MOD_DECIDE': {
        const result = await apiCall(`/admin/claims/${msg.claimId}/decide`, {
          method:'POST', body:JSON.stringify({ decision:msg.decision, note:msg.note||'' })
        });
        return { ok:result.ok, data:result.data };
      }

      case 'FC_MOD_EMAIL': {
        const result = await apiCall(`/admin/claims/${msg.claimId}/email`, { method:'POST', body:'{}' });
        return { ok:result.ok, data:result.data };
      }

      case 'FC_SAVE_BROWSE_EVENT': {
        const { browseHistory } = store.get('local',['browseHistory']);
        const hist = browseHistory||[];
        hist.unshift({ ...msg.event, savedAt:Date.now() });
        if (hist.length>200) hist.length=200;
        store.set('local',{ browseHistory:hist });
        return { ok:true };
      }

      case 'FC_GET_BROWSE_HISTORY': {
        const { browseHistory } = store.get('local',['browseHistory']);
        return { history: browseHistory||[] };
      }

      case 'FC_STORAGE_CLEAR_HIST':
        store.set('local',{ browseHistory:[] });
        return { ok:true };

      case 'FC_OPEN_DASHBOARD':
      case 'FC_OPEN_HUB':
        windows.openHubWindow(msg.tab);
        return { ok: true };

      case 'FC_OPEN_SETTINGS':
        windows.openHubWindow('settings');
        return { ok: true };

      case 'FC_OPEN_AUTH':
        windows.openAuthWindow();
        return { ok: true };

      case 'FC_OPEN_EXTERNAL':
        if (msg.url) shell.openExternal(msg.url);
        return { ok: true };

      case 'FC_AI_ANALYZE': {
        // Route through the FactChecker Pro backend server — no per-user API key needed.
        // The server's GEMINI_API_KEY env var handles the AI call and applies the
        // user's daily usage limit based on their account tier.
        const text = (msg.text || '').trim().substring(0, 600);
        if (!text || text.length < 10) return { ok: false, error: 'Text too short.' };

        const result = await apiCall('/social/analyze', {
          method: 'POST',
          body: JSON.stringify({ text, platform: msg.platform || 'desktop' })
        });

        if (result.ok && result.data) {
          return { ok: true, ...result.data, platform: msg.platform || 'desktop' };
        }

        // Surface rate-limit errors clearly without breaking the UI
        if (result.status === 429) {
          return {
            ok: false,
            error: result.data?.error || 'Daily analysis limit reached. Upgrade your account for more.',
            upgrade_prompt: result.data?.upgrade_prompt,
            limit_hit: true
          };
        }

        // Any other server error — fall through to a friendly message
        return { ok: false, error: result.data?.error || 'Analysis temporarily unavailable. Please try again in a moment.' };
      }

      case 'FC_AUTH_SUCCESS':
        windows.closeAuthWindow();
        windows.openHubWindow();
        return { ok: true };

      default:
        return { ok: false, error: 'Unknown message type: ' + msg.type };
    }
  });

  ipcMain.handle('fc:notify', (event, id, opts) => {
    notifications.notify(id, opts);
    return { ok: true };
  });

  ipcMain.handle('fc:storage-get', (event, area, keys) => store.get(area, keys));
  ipcMain.handle('fc:storage-set', (event, area, obj) => { store.set(area, obj); return { ok: true }; });
  ipcMain.handle('fc:storage-remove', (event, area, keys) => { store.remove(area, keys); return { ok: true }; });
}

function defaultSettings() {
  return {
    notificationsEnabled: true,
    darkMode: false,
    launchAtLogin: false,
    language: 'en'
  };
}

module.exports = { registerIpc };
