# FactChecker Pro — Desktop (Windows companion app)

Electron companion app for the FactChecker Pro browser extension. It targets the
Microsoft Store and covers the account/hub side of the product — sign in,
transparency score, submissions, leaderboard, profile, native notifications,
and a manual "Check a Claim" form. Real-time page scanning and the Social
Media Shield stay in the browser extension; a native desktop process cannot
inject into an arbitrary browser tab's DOM, which is why that half of the
product isn't (and can't be) duplicated here.

It talks to the same backend the extension uses
(`https://factchecker-pro-production.up.railway.app`) — no server changes
were made or are required.

## Architecture

Mirrors the extension's own split on purpose:

| Extension | Desktop equivalent |
|---|---|
| `background.js` service worker | `src/main/*.js` (main process) |
| `chrome.runtime.sendMessage` | `fc.runtime.sendMessage` (preload-bridged IPC) |
| `chrome.storage.sync` / `.local` | `src/main/store.js` (electron-store) |
| `auth/auth.html` + `auth.js` | `src/renderer/auth/` (ported near-verbatim) |
| `dashboard/dashboard.html` + `dashboard.js` | `src/renderer/hub/` (rebuilt, scoped to v1 features) |
| `chrome.notifications` | `src/main/notifications.js` (Windows toast via Electron `Notification`) |
| toolbar badge / icon | System tray (`src/main/tray.js`) |

`window.chrome` couldn't be reused as the bridge name — Chromium reserves that
global — so the preload script exposes `window.fc` instead, shaped identically
to `chrome.runtime` / `chrome.tabs` / `chrome.storage`.

All backend HTTP calls run in the main process (Node fetch, not the
renderer), which is why no CORS changes were needed on the server: Node's
fetch sends no `Origin` header, and the existing `!origin` rule in
`server/index.js` already allows that.

## What's in v1 vs. deferred

Included: auth, Overview, Live Activity (see below), Check a Claim (submits
into the same `/api/claims` + auto-verify pipeline the extension uses), My
Submissions, Leaderboard, Profile (local vanity profile, same as the
extension), Settings (notifications toggle, launch-at-login), system tray,
Windows toast notifications.

Deferred (not built, to keep v1 scoped): the News/Fact-Check feed module and
the "Social Intel" (Reddit/X/LinkedIn handle) module from the extension's
dashboard — both are straightforward to port later using the same `fc.*`
pattern, routed through new `FC_*` cases in `src/main/ipc.js`.

## Live Activity — Native Messaging bridge to the extension

The extension has DOM access the desktop app fundamentally can't get (see
above), but it can *tell* the desktop app what it's seeing. `background.js`
in the extension (see `native/desktopBridge.js`) fire-and-forgets three event
types — page credibility scored, page flagged, claim flagged — to a Chrome
[Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
host (`native-host/host.js`, compiled to `fc-native-host.exe` via `pkg`).
That host relays over a localhost-only TCP socket (with a per-launch shared
secret in `bridge.json`) to `src/main/bridgeServer.js`, which triggers
Windows toast notifications and feeds the Hub's **Live Activity** tab in
real time.

This is entirely optional and fail-safe on the extension side — if the
desktop app isn't installed or not running, `chrome.runtime.sendNativeMessage`
just sets `chrome.runtime.lastError`, which `desktopBridge.js` silently
swallows. It required one small addition to the extension: the
`nativeMessaging` permission (bumps the extension's permission set, so
existing users will see a one-time permission-upgrade prompt on next update).

`registerNativeHost()` in `src/main/nativeHost.js` writes the host manifest
and Windows registry keys (`HKCU\...\NativeMessagingHosts\com.factcheckerpro.desktop`)
on every launch. `ALLOWED_ORIGINS` currently only lists the published Chrome
Web Store ID (`acohjflpjlnbmpkeenfaeaalcdldeodc`) — add the Edge Add-ons ID
there too once that listing exists.

If you touch `native-host/host.js`, re-run `npm run build:native-host`
before testing — Chrome always spawns the compiled `.exe`, not the source.

## Run it

```
npm install
npm start
```

## Package for the Microsoft Store

```
npm run dist
```

Produces an `.appx` in `release/`. Before submitting:

1. **Icons**: `assets/icons/source.png` is only 128×128 (upscaled from the
   extension's icon). Replace it with a real 1024×1024 master and re-run
   `node scripts/generate-icons.js` for crisp Store tiles.
2. **Publisher identity**: `package.json`'s `build.appx.publisher` is a
   placeholder (`CN=FactCheckerPro`). Reserve the app name in
   [Partner Center](https://partner.microsoft.com/dashboard) and replace
   `identityName` / `publisher` with the values it assigns you.
3. Electron's MSIX/appx target is still relatively new — build on a real
   Windows machine (not CI) the first time and sanity-check the installed
   package before submitting.
