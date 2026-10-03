const { app, BrowserWindow } = require('electron');
const store = require('./store');
const { registerIpc } = require('./ipc');
const windows = require('./windows');
const tray = require('./tray');
const { registerNativeHost } = require('./nativeHost');
const { startBridgeServer } = require('./bridgeServer');

// Windows Toast notifications need a stable AppUserModelId to route correctly.
app.setAppUserModelId('com.factcheckerpro.desktop');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const hub = windows.getHubWindow();
    if (hub) {
      // The app stays alive in the tray after the window is closed, so a
      // relaunch (e.g. `npm start` during dev, or double-clicking the icon
      // again) would otherwise just refocus the SAME window instance with
      // whatever hub.html/hub.js/hub.css it loaded last time — any edits
      // made since then would silently not appear. Reload it so a relaunch
      // always reflects the current files on disk.
      hub.webContents.reload();
      hub.show();
      hub.focus();
    } else {
      windows.openHubWindow();
    }
  });

  // Auto-create desktop shortcut on very first launch
  function createDesktopShortcutOnce() {
    if (process.platform !== 'win32') return;
    const { shortcutCreated } = store.get('local', ['shortcutCreated']);
    if (shortcutCreated) return;
    // Mark done immediately so we never retry on error
    store.set('local', { shortcutCreated: true });
    try {
      const { execFile } = require('child_process');
      const path = require('path');
      const os = require('os');
      const appDir = app.isPackaged
        ? path.dirname(process.execPath)
        : path.join(__dirname, '..', '..');
      const target = app.isPackaged
        ? process.execPath
        : path.join(appDir, 'launch.bat');
      const lnk = path.join(os.homedir(), 'Desktop', 'FactChecker Pro.lnk');
      const ps = `$s=(New-Object -COM WScript.Shell).CreateShortcut('${lnk}');$s.TargetPath='${target}';$s.WorkingDirectory='${appDir}';$s.Save()`;
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps]);
    } catch (_) {}
  }

  app.whenReady().then(async () => {
    registerIpc();
    tray.createTray();
    createDesktopShortcutOnce();
    registerNativeHost();
    startBridgeServer();

    // Proactively refresh the access token on launch so the user is never
    // greeted with a session-expired error after a long break.
    const { refreshAuthToken } = require('./api');
    const { authToken, refreshToken } = store.get('sync', ['authToken', 'refreshToken']);
    if (authToken) {
      // Try a silent refresh in the background; if it fails we still open the hub
      // and let the first API call handle the error gracefully.
      if (refreshToken) refreshAuthToken().catch(() => {});
      windows.openHubWindow();
    } else {
      windows.openAuthWindow();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const { authToken: token } = store.get('sync', ['authToken']);
        if (token) windows.openHubWindow();
        else windows.openAuthWindow();
      }
    });
  });

  // Keep running in the tray on window close (standard tray-app behavior on Windows).
  app.on('window-all-closed', () => {
    // no-op — tray keeps the app alive
  });
}
