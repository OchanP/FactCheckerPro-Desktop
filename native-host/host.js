/**
 * FactChecker Pro — Native Messaging host.
 *
 * Chrome/Edge spawn this process (per the registered native messaging host
 * manifest) whenever the extension calls chrome.runtime.sendNativeMessage().
 * It speaks the native messaging stdio protocol on one side (4-byte
 * little-endian length prefix + UTF-8 JSON) and relays the message to the
 * already-running FactChecker Pro desktop app over a localhost TCP socket
 * on the other side. It does one message in, one ack out, then exits —
 * matching sendNativeMessage's one-shot request/response shape.
 *
 * If the desktop app isn't running, this fails silently: the browser sees
 * an empty/undefined response, which the extension's fail-safe wrapper
 * (native/desktopBridge.js) already ignores.
 */
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BRIDGE_INFO_PATH = path.join(os.homedir(), 'AppData', 'Roaming', 'factchecker-pro-desktop', 'bridge.json');

function readNativeMessage(callback) {
  const lenBuf = Buffer.alloc(4);
  let lenBytesRead = 0;
  const chunks = [];
  let bodyLength = null;
  let bodyBytesRead = 0;
  let delivered = false;

  process.stdin.on('readable', () => {
    let chunk;
    while ((chunk = process.stdin.read()) !== null) {
      let offset = 0;
      if (bodyLength === null) {
        const need = 4 - lenBytesRead;
        const take = Math.min(need, chunk.length);
        chunk.copy(lenBuf, lenBytesRead, 0, take);
        lenBytesRead += take;
        offset = take;
        if (lenBytesRead === 4) {
          bodyLength = lenBuf.readUInt32LE(0);
        }
      }
      if (bodyLength !== null && offset < chunk.length) {
        const rest = chunk.slice(offset);
        chunks.push(rest);
        bodyBytesRead += rest.length;
      }
      if (bodyLength !== null && bodyBytesRead >= bodyLength) {
        const body = Buffer.concat(chunks).slice(0, bodyLength);
        delivered = true;
        callback(body.toString('utf8'));
        return;
      }
    }
  });

  // Chrome (and our own one-shot test harness) closes its write side right
  // after sending the message — that must NOT cut off the async round trip
  // to the desktop app that's still in flight. Only exit here if stdin
  // closed before a complete message ever arrived.
  process.stdin.on('end', () => {
    if (!delivered) process.exit(0);
  });
}

function writeNativeMessage(obj, onDone) {
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(json.length, 0);
  // process.exit() right after write() can truncate the write on a pipe
  // before it flushes (especially on Windows) — wait for the callback.
  process.stdout.write(Buffer.concat([lenBuf, json]), onDone);
}

function relayToDesktopApp(message) {
  let bridgeInfo;
  try {
    bridgeInfo = JSON.parse(fs.readFileSync(BRIDGE_INFO_PATH, 'utf8'));
  } catch (_) {
    writeNativeMessage({ ok: false, error: 'desktop app not running' }, () => process.exit(0));
    return;
  }

  const socket = net.createConnection({ host: '127.0.0.1', port: bridgeInfo.port }, () => {
    socket.write(JSON.stringify({ secret: bridgeInfo.secret, message }) + '\n');
  });

  let responded = false;
  const finish = (ok) => {
    if (responded) return;
    responded = true;
    socket.destroy();
    writeNativeMessage({ ok }, () => process.exit(0));
  };

  socket.on('data', () => finish(true));
  socket.on('error', () => finish(false));
  socket.setTimeout(1500, () => finish(false));
}

readNativeMessage((raw) => {
  let message;
  try {
    message = JSON.parse(raw);
  } catch (_) {
    process.exit(0);
    return;
  }
  relayToDesktopApp(message);
});
