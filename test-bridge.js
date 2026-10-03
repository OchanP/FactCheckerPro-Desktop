/**
 * FactChecker Pro — Bridge Connection Test
 * Run from the project root while the desktop app is open:
 *   node test-bridge.js
 */
const net  = require('net');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const BRIDGE_PATH = path.join(os.homedir(), 'AppData', 'Roaming', 'factchecker-pro-desktop', 'bridge.json');

console.log('\n=== FactChecker Pro Bridge Test ===\n');

// Step 1: Does bridge.json exist?
console.log('Step 1 — Looking for bridge.json at:');
console.log('         ' + BRIDGE_PATH);

if (!fs.existsSync(BRIDGE_PATH)) {
  console.log('  FAIL: bridge.json not found.\n');
  console.log('  This means the desktop app is not running, or it crashed before');
  console.log('  writing the bridge file. Open the desktop app and try again.\n');
  process.exit(1);
}

let bridge;
try {
  bridge = JSON.parse(fs.readFileSync(BRIDGE_PATH, 'utf8'));
  console.log(`  OK: port=${bridge.port}, secret length=${bridge.secret.length}\n`);
} catch (e) {
  console.log('  FAIL: bridge.json exists but could not be parsed:', e.message, '\n');
  process.exit(1);
}

// Step 2: Can we TCP-connect to the bridge port?
console.log(`Step 2 — Connecting to 127.0.0.1:${bridge.port} ...`);

const socket = net.createConnection({ host: '127.0.0.1', port: bridge.port }, () => {
  console.log('  OK: TCP connection established\n');

  // Step 3: Send a test heartbeat
  console.log('Step 3 — Sending test FC_HEARTBEAT ...');
  const msg = JSON.stringify({
    secret: bridge.secret,
    message: { type: 'FC_HEARTBEAT', data: { ts: Date.now(), source: 'test-bridge.js' } }
  }) + '\n';

  socket.write(msg);
});

socket.on('data', (d) => {
  const reply = d.toString().trim();
  if (reply === 'ok') {
    console.log('  OK: Desktop app acknowledged the heartbeat!\n');
    console.log('The bridge is working. If the hub still shows disconnected, reload');
    console.log('the browser extension (chrome://extensions → Reload button) and wait');
    console.log('up to 60 seconds for the next alarm tick.\n');
  } else {
    console.log('  Unexpected reply:', reply, '\n');
  }
  socket.destroy();
});

socket.on('error', (e) => {
  console.log(`  FAIL: Could not connect — ${e.message}`);
  console.log('  The desktop app is running but the bridge server is not listening.');
  console.log('  Try restarting the desktop app.\n');
  process.exit(1);
});

socket.setTimeout(3000, () => {
  console.log('  FAIL: Connection timed out. Bridge port is not responding.\n');
  socket.destroy();
  process.exit(1);
});
