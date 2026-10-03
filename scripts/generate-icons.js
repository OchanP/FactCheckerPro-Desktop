// One-off icon generation: derives the full Windows/Store icon set from the
// extension's 128×128 source icon. Run with: node scripts/generate-icons.js
// NOTE: the source is only 128×128 — sizes above that are upscaled and will
// look soft. Replace assets/icons/source.png with a real 1024×1024 master
// before final Store submission and re-run this script.
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default;

const SRC = path.join(__dirname, '..', 'assets', 'icons', 'source.png');
const OUT = path.join(__dirname, '..', 'assets', 'icons');

// Microsoft Store / MSIX tile sizes (square logo set) + a few loose Windows sizes.
const SIZES = [16, 24, 32, 44, 48, 71, 128, 150, 256, 310, 512];

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error('Missing source icon at', SRC);
    process.exit(1);
  }

  for (const size of SIZES) {
    await sharp(SRC).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(OUT, `icon${size}.png`));
  }

  // Wide tile (310x150) for Store listing
  await sharp(SRC).resize(150, 150, { fit: 'contain', background: { r: 15, g: 23, b: 42, alpha: 1 } })
    .extend({ top: 0, bottom: 0, left: 80, right: 80, background: { r: 15, g: 23, b: 42, alpha: 1 } })
    .png()
    .toFile(path.join(OUT, 'icon310x150.png'));

  const icoBuffer = await pngToIco([
    path.join(OUT, 'icon16.png'),
    path.join(OUT, 'icon24.png'),
    path.join(OUT, 'icon32.png'),
    path.join(OUT, 'icon48.png'),
    path.join(OUT, 'icon128.png'),
    path.join(OUT, 'icon256.png')
  ]);
  fs.writeFileSync(path.join(OUT, 'icon.ico'), icoBuffer);

  console.log('Icon set generated in', OUT);
}

main().catch((err) => { console.error(err); process.exit(1); });
