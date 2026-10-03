/**
 * Native Windows toast notifications — replaces chrome.notifications.create().
 * Electron's Notification class routes through the Windows Action Center
 * automatically when the app has a Start Menu shortcut / AppUserModelId set.
 */
const path = require('path');
const { Notification } = require('electron');

const ICON = path.join(__dirname, '..', '..', 'assets', 'icons', 'icon128.png');

function notify(id, { title, message }) {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title: title || 'FactChecker Pro',
    body: message || '',
    icon: ICON
  });
  n.show();
  return n;
}

module.exports = { notify };
