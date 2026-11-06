#!/usr/bin/env node
// Compose App Store screenshots and landing images from raw simulator captures.
// App Store: 1320×2868 PNG per shot — accent headline + subline above the device frame.
// Landing:   the same framed device WITHOUT text, ~660px wide, for the site.
// Frames are Apple bezel PNGs in marketing/frames/ (gitignored; extract from Apple's
// design-resource DMGs once via scripts/fetch-frames.sh or manually).
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
const LANDING_DIR =
  process.env.LANDING_OUT_DIR ?? path.join(ROOT, '..', 'web', 'public', 'screens');
const SHOTS = JSON.parse(fs.readFileSync(path.join(MARKETING, 'screenshots.json'), 'utf8'));

const OUT_W = 1320;
const OUT_H = 2868;
const LAND_W = 660;
const ACCENT = '#E8590C';

const dataUri = (p) => `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`;

/** Ensure a frame is portrait; fail loudly otherwise. */
function checkPortrait(file) {
  const [w, h] = execSync(`sips -g pixelWidth -g pixelHeight "${file}" | awk '/pixel/{print $2}'`)
    .toString()
    .trim()
    .split('\n')
    .map(Number);
  if (!(h > w)) throw new Error(`frame ${path.basename(file)} is not portrait (${w}x${h})`);
  return { w, h };
}

/** Flood-fill the transparent interior from the centre → the screen cutout rect. */
async function screenCutout(page, frameUri) {
  return page.evaluate(async (uri) => {
    const img = new Image();
    img.src = uri;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    const alpha = (x, y) => data[(y * c.width + x) * 4 + 3];
    const cx = Math.floor(c.width / 2),
      cy = Math.floor(c.height / 2);
    if (alpha(cx, cy) > 10) return null;
    // Flood fill from centre over transparent pixels.
    const seen = new Uint8Array(c.width * c.height);
    const q = [[cx, cy]];
    let minX = c.width,
      minY = c.height,
      maxX = 0,
      maxY = 0;
    while (q.length) {
      const [x, y] = q.pop();
      const i = y * c.width + x;
      if (x < 0 || y < 0 || x >= c.width || y >= c.height || seen[i] || alpha(x, y) > 10) continue;
      seen[i] = 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    if (maxX <= minX || maxY <= minY) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, fw: c.width, fh: c.height };
  }, frameUri);
}

/** Compose shot+frame in the page; returns cutout-aware <img> markup for the composite. */
async function composite(page, { srcUri, frame }) {
  if (!frame) {
    return {
      html: `<img src="${srcUri}" style="width:${LAND_W * 1.6}px;border-radius:64px;display:block;" />`,
      w: LAND_W * 1.6,
    };
  }
  // Scale the screenshot onto the cutout and mask it with the cutout alpha.
  const result = await page.evaluate(
    async ({ srcUri, cut }) => {
      const shot = new Image();
      shot.src = srcUri;
      await shot.decode();
      if (!shot.naturalWidth) return null;
      const c = document.createElement('canvas');
      c.width = cut.w;
      c.height = cut.h;
      const ctx = c.getContext('2d');
      // Cover-fit the screenshot into the cutout.
      const scale = Math.max(cut.w / shot.naturalWidth, cut.h / shot.naturalHeight);
      const sw = shot.naturalWidth * scale,
        sh = shot.naturalHeight * scale;
      ctx.drawImage(shot, (cut.w - sw) / 2, (cut.h - sh) / 2, sw, sh);
      return { dataUrl: c.toDataURL('image/png'), w: cut.fw, h: cut.fh };
    },
    { srcUri, cut: frame },
  );
  if (!result) return null;
  const frameUri = dataUri(frame.path);
  return {
    html: `<div style="position:relative;width:${result.w}px;height:${result.h}px;">
      <img src="${result.dataUrl}" style="position:absolute;left:${frame.x}px;top:${frame.y}px;width:${frame.w}px;height:${frame.h}px;border-radius:8%;display:block;" />
      <img src="${frameUri}" style="position:relative;width:${result.w}px;height:${result.h}px;pointer-events:none;display:block;" />
    </div>`,
    w: result.w,
  };
}

/** Fail if the rendered PNG is (nearly) a single colour. */
function alphaAt(file) {
  const out = execSync(
    `python3 -c "
from PIL import Image
im = Image.open('${file}').convert('RGBA')
w, h = im.size
px = im.load()
corners = [px[2, 2][3], px[w - 3, 2][3], px[2, h - 3][3], px[w - 3, h - 3][3]]
centre = px[w // 2, h // 2][3]
print(','.join(str(a) for a in corners) + '|' + str(centre))
"`,
    { encoding: 'utf8' },
  ).trim();
  const [corners, centre] = out.split('|');
  return { corners: corners.split(',').map(Number), centre: Number(centre) };
}

function pixelVariance(file) {
  const out = execSync(
    `python3 -c "
from PIL import Image
import sys
src = Image.open('${file}').convert('RGBA')
im = Image.new('RGB', src.size, (0, 0, 0))
im.paste(src, mask=src.split()[3])
im = im.convert('L').resize((64, 64))
px = list(im.getdata())
m = sum(px) / len(px)
print(round(sum((p - m) ** 2 for p in px) / len(px), 1))
"`,
    { encoding: 'utf8' },
  ).trim();
  return Number(out);
}

function landingHtml({ html, dark }) {
  return `<!doctype html><body style="margin:0;background:${dark ? '#0a0a0a' : 'transparent'};display:flex;align-items:center;justify-content:center;min-height:100vh;">${html}</body>`;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: OUT_W, height: OUT_H } });
  const seenHashes = new Map();

  const iphoneFrame = path.join(FRAMES_DIR, 'iphone-17-pro-max.png');
  const watchFrame = path.join(FRAMES_DIR, 'watch-ultra.png');
  let iphoneCut = null,
    watchCut = null;
  for (const [file, name] of [
    [iphoneFrame, 'iphone'],
    [watchFrame, 'watch'],
  ]) {
    if (!fs.existsSync(file)) {
      console.warn(`warn: no ${name} frame — using rounded fallback`);
      continue;
    }
    checkPortrait(file); // throws on landscape
    const cut = await screenCutout(page, dataUri(file));
    if (!cut) {
      console.warn(`warn: no transparent cutout in ${name} frame — using rounded fallback`);
      continue;
    }
    cut.path = file;
    if (name === 'iphone') iphoneCut = cut;
    else watchCut = cut;
  }

  for (const [i, shot] of SHOTS.entries()) {
    const isWatch = shot.id === 'watch';
    const frame = isWatch ? watchCut : iphoneCut;
    for (const lang of ['en', 'de']) {
      const num = String(i + 1).padStart(2, '0');
      const rawDir = path.join(RAW, isWatch ? `watch-${lang}` : lang);
      const src = rawFileFor(rawDir, shot.id, `${num}-${shot.id}.png`);
      if (!src || !fs.existsSync(src)) {
        console.warn(`skip ${lang}/${num}-${shot.id}.png — no raw capture in ${rawDir}`);
        continue;
      }

      const composed = await composite(page, { srcUri: dataUri(src), frame });
      if (!composed) {
        console.warn(`skip ${lang} ${shot.id} — screenshot failed to decode`);
        continue;
      }

      // ---- App Store: text + framed device, 1320x2868 ----------------------
      const outDir = path.join(APPSTORE, lang === 'en' ? 'en-US' : 'de-DE');
      fs.mkdirSync(outDir, { recursive: true });
      const appFile = path.join(outDir, `${num}-${shot.id}.png`);
      await page.setViewportSize({ width: OUT_W, height: OUT_H });
      await page.setContent(
        `<!doctype html><body style="margin:0;width:${OUT_W}px;height:${OUT_H}px;background:#0a0a0a;font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;padding-top:170px;box-sizing:border-box;">
        <h1 style="color:${ACCENT};font-size:88px;font-weight:700;margin:0;text-align:center;letter-spacing:-0.5px;">${shot.headline[lang]}</h1>
        <p style="color:#a0a0a0;font-size:46px;margin:26px 0 0;text-align:center;">${shot.subline[lang]}</p>
        <div style="flex:1;display:flex;align-items:center;justify-content:center;">
          <div style="transform:scale(${isWatch ? 1120 / composed.w : Math.min(1100 / composed.w, 1)});transform-origin:center;">${composed.html}</div>
        </div>
      </body>`,
        { waitUntil: 'load' },
      );
      // Wait for the framed composition to decode before rasterising.
      await page.evaluate(async () => {
        const imgs = [...document.images];
        await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
      });
      await page.screenshot({ path: appFile, type: 'png' });

      // ---- Landing: framed device only, ~660px wide ------------------------
      const landDir = path.join(LANDING_DIR, lang);
      fs.mkdirSync(landDir, { recursive: true });
      const landFile = path.join(landDir, `${num}-${shot.id}.png`);
      const scale = LAND_W / composed.w;
      const landH = Math.ceil((frame ? frame.fh : 1450) * scale) + 16;
      await page.setViewportSize({ width: LAND_W, height: landH });
      await page.setContent(
        `<!doctype html><body style="margin:0;background:transparent;"><div style="width:${composed.w}px;height:${frame ? frame.fh : 1450}px;transform:scale(${scale});transform-origin:top left;">${composed.html}</div></body>`,
        { waitUntil: 'load' },
      );
      const decoded = await page.evaluate(async () => {
        const imgs = [...document.images];
        await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
        return imgs.every((i) => i.naturalWidth > 0);
      });
      if (!decoded) {
        console.warn(`skip ${lang} ${shot.id} landing — image failed to decode`);
        continue;
      }
      await page.screenshot({ path: landFile, type: 'png', omitBackground: true });

      // ---- guards ----------------------------------------------------------
      for (const [label, file] of [
        ['appstore', appFile],
        ['landing', landFile],
      ]) {
        const v = pixelVariance(file);
        if (!(v > 50)) throw new Error(`${label} ${file} looks blank (variance ${v})`);
        if (label === 'landing') {
          const { corners, centre } = alphaAt(file);
          if (corners.some((a) => a > 0))
            throw new Error(`${file} corner is opaque — the frame must be the edge`);
          if (centre < 200) throw new Error(`${file} centre is transparent`);
        }
        const hash = execSync(`md5 -q "${file}"`).toString().trim();
        // Different shots in the SAME language must differ; en↔de may legitimately be
        // identical on locale-invariant screens (numbers, kg).
        const key = `${label}/${lang}:${hash}`;
        if (seenHashes.has(key)) {
          throw new Error(`${label} ${file} is identical to ${seenHashes.get(key)}`);
        }
        seenHashes.set(key, file);
      }
      console.log(`${lang} ${shot.id} ✓ (var ${pixelVariance(appFile)})`);
    }
  }
  await browser.close();
}

/** Resolve the exported PNG for a shot via xcresulttool's manifest.json. */
function rawFileFor(rawDir, shotId, rawName) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(rawDir, 'manifest.json'), 'utf8'));
    for (const entry of manifest) {
      for (const att of entry.attachments ?? []) {
        const n = att.suggestedHumanReadableName ?? '';
        if (n.startsWith(shotId) || n.includes(`-${shotId}`)) {
          return path.join(rawDir, att.exportedFileName);
        }
      }
    }
  } catch {}
  try {
    return fs
      .readdirSync(rawDir)
      .map((f) => path.join(rawDir, f))
      .find((f) => f.endsWith(`${shotId}.png`) || f.endsWith(rawName));
  } catch {
    return undefined;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
