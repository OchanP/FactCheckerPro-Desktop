/**
 * Creates a FactChecker Pro shortcut on the Windows Desktop.
 * Run with:  node scripts/create-shortcut.js
 * Or called automatically by the app on first launch.
 */
const { execFileSync } = require('child_process');
const path = require('path');
const os   = require('os');

const appRoot     = path.resolve(__dirname, '..');
const iconPath    = path.join(appRoot, 'assets', 'icons', 'icon.ico');
const launchBat   = path.join(appRoot, 'launch.bat');
const desktopPath = path.join(os.homedir(), 'Desktop');
const shortcut    = path.join(desktopPath, 'FactChecker Pro.lnk');

// Use PowerShell WScript.Shell to create a proper .lnk
const ps = `
$WS  = New-Object -ComObject WScript.Shell
$SC  = $WS.CreateShortcut('${shortcut.replace(/\\/g, '\\\\')}')
$SC.TargetPath       = '${launchBat.replace(/\\/g, '\\\\')}'
$SC.WorkingDirectory = '${appRoot.replace(/\\/g, '\\\\')}'
$SC.Description      = 'FactChecker Pro Desktop'
$SC.IconLocation     = '${iconPath.replace(/\\/g, '\\\\')}'
$SC.WindowStyle      = 1
$SC.Save()
Write-Host 'Shortcut created: ${shortcut.replace(/\\/g, '\\\\')}'
`.trim();

try {
  execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });
} catch (err) {
  console.error('Could not create shortcut:', err.message);
  process.exit(1);
}
