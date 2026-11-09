const path = require('path');
const { Tray, Menu, app, nativeImage } = require('electron');
const store = require('./store');
const windows = require('./windows');

let tray = null;

function createTray() {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icons', 'icon32.png');
  // The macOS menu bar expects an 18 point icon; the Windows tray uses the 32 px file as is.
  const icon = process.platform === 'darwin'
    ? nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 })
    : iconPath;
  tray = new Tray(icon);
  tray.setToolTip('FactChecker Pro');
  refreshMenu();
  // On the Mac a click opens the menu (the menu bar convention); on Windows it opens the app.
  if (process.platform !== 'darwin') tray.on('click', () => windows.openEduWindow());
  return tray;
}

function refreshMenu() {
  if (!tray) return;
  const { apiUser, authToken } = store.get('sync', ['apiUser', 'authToken']);
  const isLoggedIn = !!authToken;

  const menu = Menu.buildFromTemplate([
    { label: isLoggedIn ? `Signed in as ${apiUser?.display_name || apiUser?.username || 'user'}` : 'Not signed in', enabled: false },
    { type: 'separator' },
    { label: 'Open FactChecker Pro Education', click: () => windows.openEduWindow() },
    { label: 'Classic tools (Claim Check, FactNews...)', click: () => windows.openHubWindow() },
    { label: 'Check a Claim', click: () => windows.openHubWindow('check') },
    { label: 'Settings', click: () => windows.openHubWindow('settings') },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setContextMenu(menu);
}

module.exports = { createTray, refreshMenu };
