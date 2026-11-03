#!/usr/bin/env node
// Compose App Store screenshots and landing images from raw simulator captures.
// App Store: 1320×2868 PNG per shot with accent headline + subline above the device frame.
// Landing:   the raw screenshot resized to a PNG in the site public dir.
// Frames come from Apple's official bezel DMGs (downloaded + extracted on first run into
// marketing/frames/, which is gitignored); on failure we fall back to rounded screenshots.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKETING = path.join(ROOT, 'marketing');
const RAW = path.join(MARKETING, 'raw');
const APPSTORE = path.join(MARKETING, 'appstore');
const FRAMES_DIR = path.join(MARKETING, 'frames');
const LANDING_DIR = process.env.LANDING_OUT_DIR ?? path.join(ROOT, '..', 'web', 'public', 'screens');
const SHOTS = JSON.parse(fs.readFileSync(path.join(MARKETING, 'screenshots.json'), 'utf8'));

const OUT_W = 1320;
const OUT_H = 2868;
const ACCENT = '#E8590C'; // matches the app's oklch primary

const BEZEL_IPHONE_DMG =
  'https://devimages-cdn.apple.com/design/resources/download/Bezel-iPhone-17.dmg';
const BEZEL_WATCH_DMG =
  'https://devimages-cdn.apple.com/design/resources/download/Bezel-Apple-Watch-Ultra-3-2025.dmg';

async function ensureFrame(dmgUrl, needle, outName) {
  const out = path.join(FRAMES_DIR, outName);
  if (fs.existsSync(out)) return out;
  const dmg = path.join(FRAMES_DIR, path.basename(dmgUrl));
  fs.mkdirSync(FRAMES_DIR, { recursive: true });
  try {
    if (!fs.existsSync(dmg)) {
      console.log(`Downloading ${dmgUrl}…`);
      execSync(`curl -fsSL -o "${dmg}" "${dmgUrl}"`, { stdio: 'inherit' });
    }
    const mount = execSync(`hdiutil attach -nobrowse -readonly "${dmg}"`, { encoding: 'utf8' });
    const volume = mount.trim().split('\n').pop().split('\t').pop().trim();
    try {
      const files = execSync(`find "${volume}" -iname '*.png'`, { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(Boolean);
      const pick =
        files.find((f) => f.toLowerCase().includes(needle)) ??
        files.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
      if (!pick) throw new Error(`no ${needle} frame in ${volume}`);
      fs.copyFileSync(pick, out);
      console.log(`Frame cached: ${path.basename(pick)} → ${outName}`);
    } finally {
      execSync(`hdiutil detach "${volume}" -quiet || true`);
    }
    return out;
  } catch (e) {
    console.warn(`warn: could not fetch frame ${outName} (${e.message}) — using rounded fallback`);
    return null;
  }
}

/** Bounding box of the fully transparent hole inside a bezel PNG (the screen cutout). */
async function screenCutout(page, framePath) {
  const data = fs.readFileSync(framePath).toString('base64');
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    // Find the biggest transparent rectangle near the centre.
    let minX = c.width, minY = c.height, maxX = 0, maxY = 0;
    const cx = Math.floor(c.width / 2), cy = Math.floor(c.height / 2);
    const alpha = (x, y) => data[(y * c.width + x) * 4 + 3];
    if (alpha(cx, cy) > 10) return null; // centre isn't transparent — no cutout
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (alpha(x, y) <= 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, fw: c.width, fh: c.height };
  }, data);
}

function html({ shot, lang, src, frame }) {
  return `<!doctype html><html><body style="margin:0;width:${OUT_W}px;height:${OUT_H}px;background:#0a0a0a;font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:170px;box-sizing:border-box;">
  <h1 style="color:${ACCENT};font-size:88px;font-weight:700;margin:0;text-align:center;letter-spacing:-0.5px;">${shot.headline[lang]}</h1>
  <p style="color:#a0a0a0;font-size:46px;margin:26px 0 0;text-align:center;">${shot.subline[lang]}</p>
  <div style="margin-top:80px;${frame ? `width:${frame.fw}px;height:${frame.fh}px;` : ''}position:relative;">
    <img src="file://${src}" style="${frame ? `position:absolute;left:${frame.x}px;top:${frame.y}px;width:${frame.w}px;height:${frame.h}px;object-fit:cover;` : 'width:1050px;border-radius:80px;'}display:block;" />
    ${frame ? `<img src="file://${frame.path}" style="position:relative;width:${frame.fw}px;height:${frame.fh}px;pointer-events:none;" />` : ''}
  </div>
</body></html>`;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: OUT_W, height: OUT_H } });

  const iphoneFrame = await ensureFrame(BEZEL_IPHONE_DMG, 'pro max', 'iphone-17-pro-max.png');
  const watchFrame = await ensureFrame(BEZEL_WATCH_DMG, 'ultra', 'watch-ultra.png');
  let iphoneCut = null, watchCut = null;
  if (iphoneFrame) {
    iphoneCut = await screenCutout(page, iphoneFrame);
    if (iphoneCut) iphoneCut.path = iphoneFrame;
  }
  if (watchFrame) {
    watchCut = await screenCutout(page, watchFrame);
    if (watchCut) watchCut.path = watchFrame;
  }

  for (const [i, shot] of SHOTS.entries()) {
    const isWatch = shot.id === 'watch';
    const frame = isWatch ? watchCut : iphoneCut;
    for (const lang of ['en', 'de']) {
      if (isWatch && lang === 'de') continue; // watch captured in en only
      const rawName = `${String(i + 1).padStart(2, '0')}-${shot.id}.png`;
      // Attachments export with their test names; tolerate prefix variants.
      const rawDir = path.join(RAW, lang);
      const src = fs
        .readdirSync(rawDir)
        .map((f) => path.join(rawDir, f))
        .find((f) => f.endsWith(`${shot.id}.png`) || f.endsWith(rawName));
      if (!src || !fs.existsSync(src)) {
        console.warn(`skip ${lang}/${rawName} — no raw capture`);
        continue;
      }

      // App Store composition
      const outDir = path.join(APPSTORE, lang === 'en' ? 'en-US' : 'de-DE');
      fs.mkdirSync(outDir, { recursive: true });
      await page.setContent(html({ shot, lang, src, frame }), { waitUntil: 'load' });
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(outDir, `${String(i + 1).padStart(2, '0')}-${shot.id}.png`), type: 'png' });

      // Landing image (just the device shot, sized for the web)
      const landDir = path.join(LANDING_DIR, lang);
      fs.mkdirSync(landDir, { recursive: true });
      await page.setContent(
        `<body style="margin:0;background:#000;display:flex;justify-content:center;"><img src="file://${src}" style="height:1434px;"/></body>`,
        { waitUntil: 'load' },
      );
      await page.waitForTimeout(200);
      await page.screenshot({
        path: path.join(landDir, `${String(i + 1).padStart(2, '0')}-${shot.id}.png`),
        type: 'png',
        clip: { x: 0, y: 0, width: OUT_W, height: 1600 },
      });
      console.log(`${lang} ${shot.id} ✓`);
    }
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
