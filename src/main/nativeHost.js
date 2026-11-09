/**
 * Registers the FactChecker Pro native messaging host with all major
 * Chromium-based browsers so the extension can reach this app from any of
 * them. Idempotent — safe to call on every app launch; it just rewrites
 * the manifest + registry values.
 *
 * Supported: Chrome, Edge, Brave, Opera, Vivaldi, Chromium, Arc, Yandex.
 * Firefox uses a different extension format and is not supported.
 */
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { app } = require('electron');

const HOST_NAME = 'com.factcheckerpro.desktop';

// The extension's published Chrome Web Store ID. Add the Edge Add-ons ID
// here too once that listing exists (or use a fixed sideload key so it's
// stable across environments).
const ALLOWED_ORIGINS = [
  // Chrome Web Store (published) ID
  'chrome-extension://acohjflpjlnbmpkeenfaeaalcdldeodc/',
  // Microsoft Edge Add-ons store ID
  'chrome-extension://ieenifnihdmlibkobcpjefdjhlnnikon/',
  // Dev / unpacked-load ID — this is the ACTUAL id Chrome assigns when the
  // extension is loaded unpacked, because manifest.json now pins a fixed
  // "key" field. Without a pinned key, Chrome derives the id from a hash of
  // the extension's install path, which is different on every machine (and
  // even every reload after a move/rename) — so any hardcoded guess here
  // would never match, native messaging would be silently refused, and the
  // desktop app's Live Activity / connection status would never light up.
  // If you ever regenerate the manifest key, update this id to match.
  'chrome-extension://ngfjldjdednlnmipnikmhjeledjkjihc/',
  // Older placeholder ids kept for compatibility with any environment still
  // using an unpinned unpacked load — harmless to leave in place.
  'chrome-extension://lllbkhknbjjjpaebhlcenopeebhhldce/',
  'chrome-extension://fignfifoniblkonapihmkfakmlgkbkcf/',
  'chrome-extension://illbkkhknbjjjpaebhlcenopeebhhldce/',
];

// Windows locks down C:\Program Files\WindowsApps\<package>\... so tightly
// that only the packaged app's own sandboxed identity can execute anything
// inside it — a completely unrelated process (Chrome, launching this exe for
// native messaging) gets silently denied. That's harmless for an NSIS install
// (installs to a normal, Chrome-executable folder) but breaks native
// messaging entirely for the Microsoft Store (MSIX) build, since
// process.resourcesPath there resolves into that protected WindowsApps path.
// Fix: copy the exe out to a normal, always-writable/executable location
// (the same AppData\Roaming folder bridge.json already lives in) and point
// the registry/manifest at that copy instead of the original.
function isInProtectedPackageFolder(p) {
  return /\\WindowsApps\\/i.test(p);
}

function getHostExePath() {
  if (app.isPackaged) {
    const packagedPath = path.join(process.resourcesPath, 'native-host', 'fc-native-host.exe');
    if (!isInProtectedPackageFolder(packagedPath)) return packagedPath;

    // MSIX/Store build — extract a runnable copy to userData, which is a
    // normal folder any process (including Chrome) can execute from.
    const extractedDir = path.join(app.getPath('userData'), 'native-host');
    const extractedPath = path.join(extractedDir, 'fc-native-host.exe');
    try {
      fs.mkdirSync(extractedDir, { recursive: true });
      // Re-copy on every launch so app updates propagate; cheap, exe is small.
      fs.copyFileSync(packagedPath, extractedPath);
      return extractedPath;
    } catch (e) {
      console.warn('[FCPro] Could not extract native host from package folder:', e.message);
      return packagedPath; // fall back to the (broken) packaged path rather than crash
    }
  }
  // In dev mode, prefer the compiled exe if it exists; otherwise create a .cmd
  // wrapper that calls node so the extension can relay events without a build step.
  const exePath = path.join(__dirname, '..', '..', 'native-host', 'fc-native-host.exe');
  if (fs.existsSync(exePath)) return exePath;
  return null; // signal to use .cmd wrapper below
}

function getDevCmdPath() {
  const hostJs = path.join(__dirname, '..', '..', 'native-host', 'host.js');
  const cmdPath = path.join(__dirname, '..', '..', 'native-host', 'fc-native-host.cmd');
  // Write a simple .cmd wrapper that invokes node on host.js
  try {
    const nodePath = process.execPath.replace('electron.exe', 'node.exe');
    const nodeExe = fs.existsSync(nodePath) ? nodePath : 'node';
    fs.writeFileSync(cmdPath, `@echo off\r\n"${nodeExe}" "${hostJs}" %*\r\n`);
  } catch (e) {
    console.warn('[FCPro] Could not write native host cmd wrapper:', e.message);
  }
  return cmdPath;
}

// macOS: browsers read a manifest file from their own NativeMessagingHosts folder.
// The host is host.js run by the app's own Electron binary in Node mode, started
// through a small launcher script in userData (browsers need one executable path).
const MAC_BROWSER_DIRS = [
  'Google/Chrome',
  'Google/Chrome Beta',
  'Google/Chrome Canary',
  'Microsoft Edge',
  'BraveSoftware/Brave-Browser',
  'Vivaldi',
  'Chromium',
  'Arc/User Data',
  'Yandex/YandexBrowser',
];

function registerNativeHostMac() {
  const os = require('os');
  const hostJs = app.isPackaged
    ? path.join(process.resourcesPath, 'native-host', 'host.js')
    : path.join(__dirname, '..', '..', 'native-host', 'host.js');
  if (!fs.existsSync(hostJs)) {
    console.warn('[FCPro] host.js not found, live bridge will be offline.');
    return;
  }
  const dir = path.join(app.getPath('userData'), 'native-host');
  const launcher = path.join(dir, 'fc-native-host.sh');
  const bridgeInfo = path.join(app.getPath('userData'), 'bridge.json');
  const q = s => "'" + String(s).replace(/'/g, "'\\''") + "'";
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(launcher,
      '#!/bin/sh\n' +
      'export ELECTRON_RUN_AS_NODE=1\n' +
      'export FCP_BRIDGE_INFO=' + q(bridgeInfo) + '\n' +
      'exec ' + q(process.execPath) + ' ' + q(hostJs) + ' "$@"\n');
    fs.chmodSync(launcher, 0o755);
  } catch (e) {
    console.warn('[FCPro] Could not write the native host launcher:', e.message);
    return;
  }
  const manifest = JSON.stringify({
    name: HOST_NAME,
    description: 'FactChecker Pro Desktop bridge',
    path: launcher,
    type: 'stdio',
    allowed_origins: ALLOWED_ORIGINS,
  }, null, 2);
  const support = path.join(os.homedir(), 'Library', 'Application Support');
  for (const b of MAC_BROWSER_DIRS) {
    const browserDir = path.join(support, b);
    if (!fs.existsSync(browserDir)) continue; // only browsers the user actually has
    try {
      const target = path.join(browserDir, 'NativeMessagingHosts');
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, HOST_NAME + '.json'), manifest);
    } catch (e) {
      console.warn('[FCPro] Could not register native host for', b, e.message);
    }
  }
}

function registerNativeHost() {
  if (process.platform === 'darwin') return registerNativeHostMac();
  if (process.platform !== 'win32') return;

  let hostPath = getHostExePath();
  if (!hostPath) {
    // Dev mode fallback: use .cmd wrapper pointing to host.js
    hostPath = getDevCmdPath();
  }
  if (!fs.existsSync(hostPath)) {
    console.warn('[FCPro] Native host not found — skipping registration. Live bridge will be offline.');
    return;
  }

  const manifest = {
    name: HOST_NAME,
    description: 'FactChecker Pro Desktop bridge',
    path: hostPath,
    type: 'stdio',
    allowed_origins: ALLOWED_ORIGINS
  };
  const manifestPath = path.join(app.getPath('userData'), 'native-host-manifest.json');
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // Registry paths for every major Chromium-based browser on Windows.
  // Each browser checks its own key; writing to all of them means the
  // extension works regardless of which browser the user has installed.
  const registryRoots = [
    // Google Chrome
    `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`,
    // Microsoft Edge (Chromium)
    `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${HOST_NAME}`,
    // Brave
    `HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\${HOST_NAME}`,
    // Opera (stable)
    `HKCU\\Software\\Opera Software\\OperaStable\\NativeMessagingHosts\\${HOST_NAME}`,
    // Opera GX
    `HKCU\\Software\\Opera Software\\OperaGXStable\\NativeMessagingHosts\\${HOST_NAME}`,
    // Vivaldi
    `HKCU\\Software\\Vivaldi\\NativeMessagingHosts\\${HOST_NAME}`,
    // Chromium (open-source build)
    `HKCU\\Software\\Chromium\\NativeMessagingHosts\\${HOST_NAME}`,
    // Yandex Browser
    `HKCU\\Software\\Yandex\\YandexBrowser\\NativeMessagingHosts\\${HOST_NAME}`,
  ];

  for (const key of registryRoots) {
    execFile('reg', ['add', key, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f'], (err) => {
      if (err) console.warn('[FCPro] Failed to register native host key', key, err.message);
    });
  }
}

module.exports = { registerNativeHost, HOST_NAME };
