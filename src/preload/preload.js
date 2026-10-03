/**
 * Preload bridge — implements a `window.fc` shim shaped exactly like the
 * chrome.runtime / chrome.tabs / chrome.storage APIs the ported renderer
 * code (adapted from auth.js / dashboard.js) relies on. Each call is
 * forwarded to the main process over IPC instead of the real browser
 * extension APIs. Note: this can't be exposed as `window.chrome` — Chromium
 * reserves that global (window.chrome.loadTimes etc.), and contextBridge
 * refuses to shadow existing window properties.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fc', {
  runtime: {
    sendMessage: (msg) => ipcRenderer.invoke('fc:message', msg),
    getURL: (p) => p, // logical path only — windows.js maps it to a real window
    openOptionsPage: () => ipcRenderer.invoke('fc:message', { type: 'FC_OPEN_SETTINGS' })
  },
  tabs: {
    // Extension pages open other extension pages via chrome.tabs.create();
    // route known logical paths to the matching desktop window.
    create: ({ url }) => {
      if (url && url.includes('dashboard/dashboard.html')) {
        return ipcRenderer.invoke('fc:message', { type: 'FC_AUTH_SUCCESS' });
      }
      if (url && url.includes('auth/auth.html')) {
        return ipcRenderer.invoke('fc:message', { type: 'FC_OPEN_AUTH' });
      }
      // Anything else (search engines, external links) opens in the default browser.
      return ipcRenderer.invoke('fc:message', { type: 'FC_OPEN_EXTERNAL', url });
    }
  },
  storage: {
    sync: {
      get: (keys) => ipcRenderer.invoke('fc:storage-get', 'sync', keys),
      set: (obj) => ipcRenderer.invoke('fc:storage-set', 'sync', obj),
      remove: (keys) => ipcRenderer.invoke('fc:storage-remove', 'sync', keys)
    },
    local: {
      get: (keys) => ipcRenderer.invoke('fc:storage-get', 'local', keys),
      set: (obj) => ipcRenderer.invoke('fc:storage-set', 'local', obj),
      remove: (keys) => ipcRenderer.invoke('fc:storage-remove', 'local', keys)
    }
  },
  // Desktop-only extras with no extension analog.
  onNavigate: (callback) => ipcRenderer.on('fc:navigate', (_event, tab) => callback(tab)),
  onLiveEvent: (callback) => ipcRenderer.on('fc:live-event', (_event, data) => callback(data)),
  onBridgeStatus: (callback) => ipcRenderer.on('fc:bridge-status', (_event, data) => callback(data))
});
