/**
 * Backend API client — a direct Node port of the extension's background.js
 * apiCall()/refreshAuthToken() logic. Runs in the main process (not the
 * renderer) so requests carry no Origin header, which the existing server
 * CORS rule already allows unconditionally (`!origin` passes) — no backend
 * changes needed.
 *
 * IMPORTANT — net.fetch vs global fetch:
 *   We use Electron's `net.fetch` (not Node's built-in global `fetch`) because
 *   net.fetch runs through Chrome's networking stack. That means it:
 *     • respects the system's HTTP/HTTPS proxy settings (WPAD, PAC files, etc.)
 *     • trusts the Windows/macOS system certificate store, so corporate SSL
 *       inspection and antivirus HTTPS proxies work correctly
 *     • handles system-level VPNs that intercept DNS
 *   Node's built-in fetch bypasses all of that, which causes "Network error"
 *   on machines with corporate networks, proxies, or aggressive antivirus.
 */
const { net } = require('electron');
const store = require('./store');

const API_BASE_URL = 'https://factchecker-pro-production.up.railway.app/api';

async function apiCall(endpoint, options = {}) {
  const { authToken } = store.get('sync', ['authToken']);
  const headers = {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
  };
  try {
    const response = await net.fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: { ...headers, ...options.headers }
    });
    const data = await response.json();

    if (response.status === 401 && data.code === 'TOKEN_EXPIRED') {
      const refreshed = await refreshAuthToken();
      if (refreshed) {
        const { authToken: newToken } = store.get('sync', ['authToken']);
        const retryResponse = await net.fetch(`${API_BASE_URL}${endpoint}`, {
          ...options,
          headers: { ...headers, Authorization: `Bearer ${newToken}` }
        });
        return { ok: retryResponse.ok, status: retryResponse.status, data: await retryResponse.json() };
      }
    }
    return { ok: response.ok, status: response.status, data };
  } catch (err) {
    console.warn('[FCPro] API call failed:', err.message);
    return { ok: false, status: 0, data: { error: 'Network error' } };
  }
}

async function refreshAuthToken() {
  const { refreshToken } = store.get('sync', ['refreshToken']);
  if (!refreshToken) return false;
  try {
    const response = await net.fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    if (response.ok) {
      const data = await response.json();
      store.set('sync', { authToken: data.accessToken, refreshToken: data.refreshToken });
      return true;
    }
    store.remove('sync', ['authToken', 'refreshToken', 'apiUser']);
    return false;
  } catch (_) {
    return false;
  }
}

module.exports = { apiCall, refreshAuthToken, API_BASE_URL };
