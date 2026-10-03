/**
 * Local bridge server — receives live events relayed from the browser
 * extension via the native messaging host (native-host/host.js). Bound to
 * 127.0.0.1 only, with a random per-launch shared secret written to
 * bridge.json so the native host (running as the same OS user) can
 * authenticate; nothing outside localhost can reach this.
 */
const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const notifications = require('./notifications');
const windows = require('./windows');

const MAX_EVENTS = 100;
let recentEvents = [];
let server = null;
let lastHeartbeatAt = 0;
let isConnected = false;

function bridgeInfoPath() {
  return path.join(app.getPath('userData'), 'bridge.json');
}

function startBridgeServer() {
  const secret = crypto.randomBytes(24).toString('hex');

  server = net.createServer((socket) => {
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        handleLine(line, socket);
      }
    });
    socket.on('error', () => {});
  });

  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    fs.mkdirSync(path.dirname(bridgeInfoPath()), { recursive: true });
    fs.writeFileSync(bridgeInfoPath(), JSON.stringify({ port, secret }));
  });

  app.on('before-quit', () => {
    try { fs.unlinkSync(bridgeInfoPath()); } catch (_) {}
  });

  function handleLine(line, socket) {
    let payload;
    try {
      payload = JSON.parse(line);
    } catch (_) {
      socket.end('bad-json');
      return;
    }
    if (payload.secret !== secret) {
      socket.end('unauthorized');
      return;
    }
    handleEvent(payload.message);
    socket.end('ok');
  }
}

function handleEvent(message) {
  if (!message || !message.type) return;

  // Heartbeat — update timestamp and push connection status to hub
  if (message.type === 'FC_HEARTBEAT') {
    lastHeartbeatAt = Date.now();
    isConnected = true;
    const hub = windows.getHubWindow();
    if (hub) hub.webContents.send('fc:bridge-status', { connected: true, ts: lastHeartbeatAt });
    return;
  }

  const event = { ...message, receivedAt: Date.now() };
  recentEvents.unshift(event);
  if (recentEvents.length > MAX_EVENTS) recentEvents.length = MAX_EVENTS;

  const hub = windows.getHubWindow();
  if (hub) hub.webContents.send('fc:live-event', event);

  notifyForEvent(event);
}

function notifyForEvent(event) {
  switch (event.type) {
    case 'FC_LIVE_ANALYSIS':
      if (typeof event.data?.score === 'number' && event.data.score < 30) {
        notifications.notify(`live-${event.ts}`, {
          title: '⚠️ Low-credibility site',
          message: `${event.data.hostname || 'This site'} scored ${event.data.score}/100 while you were browsing.`
        });
      }
      break;
    case 'FC_LIVE_PAGE_FLAGGED':
      notifications.notify(`live-${event.ts}`, {
        title: '🚩 Page flagged',
        message: event.data?.title || event.data?.url || 'A page was flagged in your browser.'
      });
      break;
    case 'FC_LIVE_CLAIM_FLAGGED':
      notifications.notify(`live-${event.ts}`, {
        title: '📝 Claim flagged',
        message: (event.data?.claim || '').slice(0, 100) || 'A claim was flagged in your browser.'
      });
      break;
  }
}

function getRecentEvents() { return recentEvents; }
function getBridgeStatus() {
  const staleSec = lastHeartbeatAt ? Math.round((Date.now() - lastHeartbeatAt) / 1000) : null;
  return { connected: isConnected && staleSec !== null && staleSec < 90, lastHeartbeatAt, staleSec };
}

module.exports = { startBridgeServer, getRecentEvents, getBridgeStatus };
