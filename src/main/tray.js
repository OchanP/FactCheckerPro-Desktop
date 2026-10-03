const path = require('path');
const { Tray, Menu, app } = require('electron');
const store = require('./store');
const windows = require('./windows');

let tray = null;

function createTray() {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icons', 'icon32.png');
  tray = new Tray(iconPath);
  tray.setToolTip('FactChecker Pro');
  refreshMenu();
  tray.on('click', () => windows.openHubWindow());
  return tray;
}

function refreshMenu() {
  if (!tray) return;
  const { apiUser, authToken } = store.get('sync', ['apiUser', 'authToken']);
  const isLoggedIn = !!authToken;

  const menu = Menu.buildFromTemplate([
    { label: isLoggedIn ? `Signed in as ${apiUser?.display_name || apiUser?.username || 'user'}` : 'Not signed in', enabled: false },
    { type: 'separator' },
    { label: 'Open FactChecker Pro', click: () => windows.openHubWindow() },
    { label: 'Check a Claim', click: () => windows.openHubWindow('check') },
    { label: 'Settings', click: () => windows.openHubWindow('settings') },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setContextMenu(menu);
}

module.exports = { createTray, refreshMenu };
