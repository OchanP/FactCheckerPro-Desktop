/**
 * Window management. Two logical windows replace the extension's two
 * extension-pages (auth.html, dashboard.html) — chrome.tabs.create() in the
 * ported renderer code is redirected here via the preload shim instead of
 * opening a browser tab.
 */
const path = require('path');
const { BrowserWindow, shell } = require('electron');

const RENDERER_DIR = path.join(__dirname, '..', 'renderer');
const PRELOAD = path.join(__dirname, '..', 'preload', 'preload.js');

let authWindow = null;
let hubWindow = null;

/**
 * Route every target="_blank" / window.open() link to the user's default
 * browser instead of a bare Electron child window. The bare child window has
 * no URL bar, no back button, and no right-click menu — users could not copy
 * the URL or navigate. The system browser gives them all of that natively.
 */
function openLinksExternally(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  // Also catch in-page navigations to external sites (e.g. a plain href
  // without target="_blank") so the hub itself never navigates away.
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
}

function baseWindowOptions(extra) {
  return {
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    icon: path.join(__dirname, '..', '..', 'assets', 'icons', 'icon128.png'),
    autoHideMenuBar: true,
    show: false,
    ...extra
  };
}

function openAuthWindow() {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.focus();
    return authWindow;
  }
  authWindow = new BrowserWindow(baseWindowOptions({
    width: 480,
    height: 720,
    resizable: false,
    title: 'FactChecker Pro — Sign In'
  }));
  openLinksExternally(authWindow);
  authWindow.loadFile(path.join(RENDERER_DIR, 'auth', 'auth.html'));
  authWindow.once('ready-to-show', () => authWindow.show());
  authWindow.on('closed', () => { authWindow = null; });
  return authWindow;
}

function closeAuthWindow() {
  if (authWindow && !authWindow.isDestroyed()) authWindow.close();
}

function openHubWindow(tab) {
  if (hubWindow && !hubWindow.isDestroyed()) {
    hubWindow.focus();
    if (tab) hubWindow.webContents.send('fc:navigate', tab);
    return hubWindow;
  }
  hubWindow = new BrowserWindow(baseWindowOptions({
    width: 1180,
    height: 780,
    minWidth: 860,
    minHeight: 560,
    title: 'FactChecker Pro'
  }));
  openLinksExternally(hubWindow);
  hubWindow.loadFile(path.join(RENDERER_DIR, 'hub', 'hub.html'));
  hubWindow.once('ready-to-show', () => hubWindow.show());
  if (tab) {
    hubWindow.webContents.once('did-finish-load', () => hubWindow.webContents.send('fc:navigate', tab));
  }
  hubWindow.on('closed', () => { hubWindow = null; });
  return hubWindow;
}

function getHubWindow() {
  return hubWindow && !hubWindow.isDestroyed() ? hubWindow : null;
}

module.exports = { openAuthWindow, closeAuthWindow, openHubWindow, getHubWindow };
