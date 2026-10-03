/**
 * FactChecker Pro — Native Host Registration Fix
 * Run this from the project root:
 *   node fix-native-host.js
 *
 * This manually writes the native messaging manifest and registers
 * the registry key so Chrome and Edge can find the native host exe.
 */
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFileSync } = require('child_process');

const HOST_NAME  = 'com.factcheckerpro.desktop';
const EXE_PATH   = path.join(__dirname, 'native-host', 'fc-native-host.exe');
const MANIFEST_PATH = path.join(os.homedir(), 'AppData', 'Roaming', 'factchecker-pro-desktop', 'native-host-manifest.json');

const ALLOWED_ORIGINS = [
  'chrome-extension://acohjflpjlnbmpkeenfaeaalcdldeodc/',
  'chrome-extension://ieenifnihdmlibkobcpjefdjhlnnikon/',
  'chrome-extension://lllbkhknbjjjpaebhlcenopeebhhldce/',
  'chrome-extension://fignfifoniblkonapihmkfakmlgkbkcf/',
  'chrome-extension://illbkkhknbjjjpaebhlcenopeebhhldce/',
];

console.log('\n=== FactChecker Pro Native Host Fix ===\n');

// Step 1: Check the exe exists
console.log('Step 1 — Checking exe at:');
console.log('         ' + EXE_PATH);
if (!fs.existsSync(EXE_PATH)) {
  console.log('  FAIL: fc-native-host.exe not found. Run npm run build:native-host first.\n');
  process.exit(1);
}
const sizeMB = (fs.statSync(EXE_PATH).size / 1024 / 1024).toFixed(1);
console.log(`  OK: ${sizeMB} MB\n`);

// Step 2: Write the manifest JSON
console.log('Step 2 — Writing manifest to:');
console.log('         ' + MANIFEST_PATH);
const manifest = {
  name: HOST_NAME,
  description: 'FactChecker Pro Desktop bridge',
  path: EXE_PATH,
  type: 'stdio',
  allowed_origins: ALLOWED_ORIGINS
};
fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
console.log('  OK\n');

// Step 3: Register in Windows registry for Chrome, Edge, Brave, Vivaldi
const registryKeys = [
  `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`,
  `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${HOST_NAME}`,
  `HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\${HOST_NAME}`,
  `HKCU\\Software\\Vivaldi\\NativeMessagingHosts\\${HOST_NAME}`,
  `HKCU\\Software\\Chromium\\NativeMessagingHosts\\${HOST_NAME}`,
];

console.log('Step 3 — Registering in Windows registry:');
let allOk = true;
for (const key of registryKeys) {
  try {
    execFileSync('reg', ['add', key, '/ve', '/t', 'REG_SZ', '/d', MANIFEST_PATH, '/f'], { stdio: 'pipe' });
    const browser = key.split('\\')[2].replace('Software', '').trim();
    console.log(`  OK: ${key.split('\\')[3] || key.split('\\')[2]}`);
  } catch (e) {
    console.log(`  SKIP: ${key.split('\\')[3] || key.split('\\')[2]} (browser not installed or key write failed)`);
    allOk = false;
  }
}

console.log('\n=== Registration complete ===\n');
console.log('Now do the following:');
console.log('  1. Keep the FactChecker Pro desktop app open');
console.log('  2. Go to chrome://extensions in Chrome');
console.log('  3. Click the Reload button on FactChecker Pro');
console.log('  4. Wait up to 60 seconds — the hub should turn green\n');
