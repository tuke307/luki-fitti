#!/usr/bin/env node
// Compose App Store screenshots and landing images from raw simulator captures.
// Config: marketing/screenshots.json — { devices, shots }. Each device declares its App
// Store canvas, raw-capture dir ({lang} placeholder), bezel frame and mode:
//   "framed" = headline + subline + framed device on the canvas (iPhone, iPad)
//   "raw"    = the capture copied unchanged (Watch — the store draws its own outline)
// A shot may override "raw", "frame" and "devices" (default: all framed devices).
// Landing: the same framed device WITHOUT text — iPhone/Watch shots at 660px, the iPad
// shot at 880px under screens/<lang>/ipad/. App Store outputs are flattened (no alpha —
// App Store rejects transparency); landing images keep theirs.
// Frames are Apple bezel PNGs in marketing/frames/ (gitignored; extract from Apple's
// design-resource DMGs once via scripts/fetch-frames.sh or manually).
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKETING = path.join(ROOT, 'marketing');
const APPSTORE = path.join(MARKETING, 'appstore');
const FRAMES_DIR = path.join(MARKETING, 'frames');
const LANDING_DIR =
  process.env.LANDING_OUT_DIR ?? path.join(ROOT, '..', 'web', 'public', 'screens');
const CONFIG = JSON.parse(fs.readFileSync(path.join(MARKETING, 'screenshots.json'), 'utf8'));
const DEVICES = new Map(CONFIG.devices.map((d) => [d.id, d]));
const SHOTS = CONFIG.shots;

const DEFAULT_DEVICES = ['iphone-6.9', 'iphone-6.3', 'ipad-13'];
const BASE_W = 1320; // typography and layout scale relative to the 6.9" canvas
const LAND_W = 660;
const IPAD_LAND_W = 880;
const ACCENT = '#E8590C';
const LANGS = ['en', 'de'];
const LOCALE_DIR = { en: 'en-US', de: 'de-DE' };

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

/**
 * CSS iPad bezel used when no Apple frame file exists: dark graphite rounded rect,
 * bezel ~2.2% of width, outer radius ~5.5%, screen clipped to the inner radius.
 */
function bezelComposite(srcUri, dims, width) {
  const b = Math.round(width * 0.022);
  const innerW = width - 2 * b;
  const innerH = Math.round((innerW * dims.h) / dims.w);
  const h = innerH + 2 * b;
  const outerR = Math.round(width * 0.055);
  return {
    html: `<div style="width:${width}px;height:${h}px;box-sizing:border-box;background:#1c1c1e;border-radius:${outerR}px;padding:${b}px;box-shadow:0 0 0 1px rgba(255,255,255,0.09);">
      <div style="width:100%;height:100%;border-radius:${outerR - b}px;overflow:hidden;">
        <img src="${srcUri}" style="width:100%;height:100%;display:block;object-fit:cover;" />
      </div>
    </div>`,
    w: width,
    h,
  };
}

/** Compose shot+frame in the page; returns cutout-aware <img> markup for the composite. */
async function composite(page, { srcUri, frame, fallbackWidth = LAND_W * 1.6, bezel = false }) {
  if (!frame) {
    const dims = await page.evaluate(async (uri) => {
      const img = new Image();
      img.src = uri;
      await img.decode();
      return { w: img.naturalWidth, h: img.naturalHeight };
    }, srcUri);
    if (!dims.w) return null;
    if (bezel) return bezelComposite(srcUri, dims, fallbackWidth);
    const h = Math.round((fallbackWidth * dims.h) / dims.w);
    return {
      html: `<img src="${srcUri}" style="width:${fallbackWidth}px;height:${h}px;border-radius:64px;display:block;object-fit:cover;" />`,
      w: fallbackWidth,
      h,
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
    h: result.h,
  };
}

/** Read PNG size + alpha via sips. */
function pngInfo(file) {
  const out = execSync(`sips -g pixelWidth -g pixelHeight -g hasAlpha "${file}" | awk '{print $2}'`)
    .toString()
    .trim()
    .split('\n')
    .map((s) => s.trim());
  return { w: Number(out[0]), h: Number(out[1]), hasAlpha: out[2] === 'yes' || out[2] === '1' };
}

/** App Store rejects transparent PNGs: composite onto an opaque background. */
function flattenPng(file) {
  execSync(
    `python3 -c "
from PIL import Image
im = Image.open('${file}')
if im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info):
    bg = Image.new('RGB', im.size, (10, 10, 10))
    bg.paste(im.convert('RGBA'), mask=im.convert('RGBA').split()[-1])
    bg.save('${file}')
"`,
  );
}

/** Fail loudly unless the output matches its device canvas and carries no alpha. */
function checkAppStoreOutput(file, canvas) {
  const { w, h, hasAlpha } = pngInfo(file);
  if (w !== canvas[0] || h !== canvas[1]) {
    throw new Error(`${file} is ${w}x${h}, expected ${canvas[0]}x${canvas[1]}`);
  }
  if (hasAlpha) throw new Error(`${file} has an alpha channel — App Store rejects transparency`);
}

/** Corner/centre alpha check for landing images. */
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

async function decodeImages(page) {
  return page.evaluate(async () => {
    const imgs = [...document.images];
    await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
    return imgs.every((i) => i.naturalWidth > 0);
  });
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

/** Load a bezel frame; falls back to the rounded-rect look when the PNG is missing. */
async function loadFrame(page, fileName) {
  if (!fileName) return null;
  const file = path.join(FRAMES_DIR, fileName);
  if (!fs.existsSync(file)) {
    console.warn(`warn: no ${fileName} frame — using rounded fallback`);
    return null;
  }
  checkPortrait(file); // throws on landscape
  const cut = await screenCutout(page, dataUri(file));
  if (!cut) {
    console.warn(`warn: no transparent cutout in ${fileName} — using rounded fallback`);
    return null;
  }
  cut.path = file;
  return cut;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: BASE_W, height: 2868 } });
  const seenHashes = new Map();
  const frameCache = new Map();
  const frameFor = async (name) => {
    if (!frameCache.has(name)) frameCache.set(name, await loadFrame(page, name));
    return frameCache.get(name);
  };

  for (const [i, shot] of SHOTS.entries()) {
    const num = String(i + 1).padStart(2, '0');
    const deviceIds = shot.devices ?? DEFAULT_DEVICES;
    const iphoneFrame = await frameFor(shot.frame ?? 'iphone-17-pro-max.png');

    for (const lang of LANGS) {
      // ---- App Store: one output per (shot, device) ------------------------
      for (const deviceId of deviceIds) {
        const device = DEVICES.get(deviceId);
        if (!device) throw new Error(`shot ${shot.id}: unknown device '${deviceId}'`);
        const rawDir = path.join(MARKETING, (shot.raw ?? device.raw).replace('{lang}', lang));
        const src = rawFileFor(rawDir, shot.id, `${num}-${shot.id}.png`);
        if (!src || !fs.existsSync(src)) {
          console.warn(`skip ${lang}/${deviceId}/${num}-${shot.id}.png — no raw in ${rawDir}`);
          continue;
        }

        const outDir = path.join(APPSTORE, LOCALE_DIR[lang], deviceId);
        fs.mkdirSync(outDir, { recursive: true });
        const appFile = path.join(outDir, `${num}-${shot.id}.png`);

        if (device.mode === 'raw') {
          // Watch: the capture ships as-is — the store renders its own outline and
          // there is no room for text at 422×514.
          fs.copyFileSync(src, appFile);
          flattenPng(appFile);
          checkAppStoreOutput(appFile, device.canvas);
          console.log(`${lang} ${deviceId} ${shot.id} ✓ (raw ${device.canvas.join('x')})`);
          continue;
        }

        const [canvasW, canvasH] = device.canvas;
        const frame = await frameFor(shot.frame ?? device.frame);
        const composed = await composite(page, {
          srcUri: dataUri(src),
          frame,
          fallbackWidth: Math.round(canvasW * (device.bezel ? 1.0 : 0.8)),
          bezel: device.bezel === true,
        });
        if (!composed) {
          console.warn(`skip ${lang} ${deviceId} ${shot.id} — screenshot failed to decode`);
          continue;
        }

        // Everything is derived from the canvas (no fixed px): the smaller iPhone
        // canvas is the 6.9" layout scaled down, so every size shows the same screen
        // region with the same relative gaps. The device is positioned absolutely —
        // centering an unscaled flex child made the 6.3 layout non-proportional.
        const s = canvasW / BASE_W;
        const padTop = Math.round(170 * s);
        const h1 = Math.round(88 * s);
        const sub = Math.round(46 * s);
        const gap = Math.round(26 * s);
        const frac = device.deviceFrac ?? 0.85;
        const scale = Math.min((canvasW * frac) / composed.w, (canvasH * 1.1) / composed.h);
        const visW = composed.w * scale;
        const visH = composed.h * scale;
        const bleed = Math.round(canvasH * 0.081);
        const textBottom = padTop + Math.round(h1 * 1.25) + gap + Math.round(sub * 1.25);
        const devTop = Math.max(canvasH - visH + bleed, textBottom + Math.round(canvasH * 0.03));

        await page.setViewportSize({ width: canvasW, height: canvasH });
        await page.setContent(
          `<!doctype html><body style="margin:0;width:${canvasW}px;height:${canvasH}px;background:#0a0a0a;font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;padding-top:${padTop}px;box-sizing:border-box;position:relative;">
          <h1 style="color:${ACCENT};font-size:${h1}px;font-weight:700;margin:0;text-align:center;letter-spacing:-0.5px;text-wrap:balance;">${shot.headline[lang]}</h1>
          <p style="color:#a0a0a0;font-size:${sub}px;margin:${gap}px 0 0;text-align:center;text-wrap:pretty;">${shot.subline[lang]}</p>
          <div style="position:absolute;left:${Math.round((canvasW - visW) / 2)}px;top:${Math.round(devTop)}px;width:${Math.round(visW)}px;height:${Math.round(visH)}px;">
            <div style="transform:scale(${scale});transform-origin:top left;">${composed.html}</div>
          </div>
        </body>`,
          { waitUntil: 'load' },
        );
        await decodeImages(page);
        await page.screenshot({ path: appFile, type: 'png' });
        flattenPng(appFile);
        checkAppStoreOutput(appFile, device.canvas);

        const v = pixelVariance(appFile);
        if (!(v > 50)) throw new Error(`appstore ${appFile} looks blank (variance ${v})`);
        const hash = execSync(`md5 -q "${appFile}"`).toString().trim();
        // Different shots in the SAME language+device must differ; en↔de may legitimately
        // be identical on locale-invariant screens (numbers, kg).
        const key = `appstore/${deviceId}/${lang}:${hash}`;
        if (seenHashes.has(key)) {
          throw new Error(`appstore ${appFile} is identical to ${seenHashes.get(key)}`);
        }
        seenHashes.set(key, appFile);
        console.log(`${lang} ${deviceId} ${shot.id} ✓ (var ${v})`);
      }

      // ---- Landing: framed device only, iPhone/Watch as before -------------
      const landShot = shot;
      const landFrame = iphoneFrame;
      const landRawDir = path.join(
        MARKETING,
        (landShot.raw ?? DEVICES.get('iphone-6.9').raw).replace('{lang}', lang),
      );
      const landSrc = rawFileFor(landRawDir, landShot.id, `${num}-${landShot.id}.png`);
      if (landSrc && fs.existsSync(landSrc)) {
        const landComposed = await composite(page, { srcUri: dataUri(landSrc), frame: landFrame });
        if (landComposed) {
          const landDir = path.join(LANDING_DIR, lang);
          fs.mkdirSync(landDir, { recursive: true });
          const landFile = path.join(landDir, `${num}-${landShot.id}.png`);
          const scale = LAND_W / landComposed.w;
          const landH = Math.ceil((landFrame ? landFrame.fh : landComposed.h) * scale) + 16;
          await page.setViewportSize({ width: LAND_W, height: landH });
          await page.setContent(
            `<!doctype html><body style="margin:0;background:transparent;"><div style="width:${landComposed.w}px;height:${landFrame ? landFrame.fh : landComposed.h}px;transform:scale(${scale});transform-origin:top left;">${landComposed.html}</div></body>`,
            { waitUntil: 'load' },
          );
          if (await decodeImages(page)) {
            await page.screenshot({ path: landFile, type: 'png', omitBackground: true });
            const v = pixelVariance(landFile);
            if (!(v > 50)) throw new Error(`landing ${landFile} looks blank (variance ${v})`);
            const { corners, centre } = alphaAt(landFile);
            if (corners.some((a) => a > 0))
              throw new Error(`${landFile} corner is opaque — the frame must be the edge`);
            if (centre < 200) throw new Error(`${landFile} centre is transparent`);
            const hash = execSync(`md5 -q "${landFile}"`).toString().trim();
            const key = `landing/${lang}:${hash}`;
            if (seenHashes.has(key)) {
              throw new Error(`landing ${landFile} is identical to ${seenHashes.get(key)}`);
            }
            seenHashes.set(key, landFile);
            console.log(`${lang} landing ${landShot.id} ✓`);
          }
        }
      }

      // ---- iPad landing: only the hero shot, wider, keeps alpha -------------
      if (shot.id === 'active-workout') {
        const ipadDevice = DEVICES.get('ipad-13');
        const ipadRawDir = path.join(
          MARKETING,
          (shot.raw ?? ipadDevice.raw).replace('{lang}', lang),
        );
        const ipadSrc = rawFileFor(ipadRawDir, shot.id, `${num}-${shot.id}.png`);
        if (ipadSrc && fs.existsSync(ipadSrc)) {
          const ipadFrame = await frameFor(ipadDevice.frame);
          const ipadComposed = await composite(page, {
            srcUri: dataUri(ipadSrc),
            frame: ipadFrame,
            fallbackWidth: IPAD_LAND_W * 1.6,
            bezel: ipadDevice.bezel === true,
          });
          if (ipadComposed) {
            const landDir = path.join(LANDING_DIR, lang, 'ipad');
            fs.mkdirSync(landDir, { recursive: true });
            const landFile = path.join(landDir, `${num}-${shot.id}.png`);
            const scale = IPAD_LAND_W / ipadComposed.w;
            const landH = Math.ceil(ipadComposed.h * scale) + 16;
            await page.setViewportSize({ width: IPAD_LAND_W, height: landH });
            await page.setContent(
              `<!doctype html><body style="margin:0;background:transparent;"><div style="width:${ipadComposed.w}px;height:${ipadComposed.h}px;transform:scale(${scale});transform-origin:top left;">${ipadComposed.html}</div></body>`,
              { waitUntil: 'load' },
            );
            if (await decodeImages(page)) {
              await page.screenshot({ path: landFile, type: 'png', omitBackground: true });
              const v = pixelVariance(landFile);
              if (!(v > 50)) throw new Error(`landing ${landFile} looks blank (variance ${v})`);
              console.log(`${lang} ipad landing ${shot.id} ✓`);
            }
          }
        }
      }
    }
  }

  // ---- Creatives: universal 16:9 asset for header + search results ----------
  // Center-cropped downstream to 21:9 (header) and 3:2 (search), so everything
  // that matters stays inside the centered `safe` intersection, with ~4% margin.
  for (const creative of CONFIG.creatives ?? []) {
    const [cw, ch] = creative.canvas;
    const [sw, sh] = creative.safe;
    const margin = Math.round(Math.min(sw, sh) * 0.04);
    const contentW = sw - margin * 2;
    const contentH = sh - margin * 2;
    const shot = SHOTS.find((s) => s.id === creative.shot);
    if (!shot) throw new Error(`creative ${creative.id}: unknown shot '${creative.shot}'`);

    for (const lang of LANGS) {
      const composed = {};
      let missingIpad = false;
      for (const deviceId of creative.devices) {
        const device = DEVICES.get(deviceId);
        const rawDir = path.join(MARKETING, (shot.raw ?? device.raw).replace('{lang}', lang));
        const attId = deviceId === 'watch' ? 'watch' : shot.id;
        const attName = deviceId === 'watch' ? '03-watch.png' : `01-${shot.id}.png`;
        const src = rawFileFor(rawDir, attId, attName);
        if (!src || !fs.existsSync(src)) {
          if (deviceId === 'ipad-13') missingIpad = true;
          else console.warn(`creative ${lang}: no raw for ${deviceId} in ${rawDir}`);
          continue;
        }
        const frame = await frameFor(
          shot.frame && deviceId === 'watch' ? shot.frame : device.frame,
        );
        composed[deviceId] = await composite(page, {
          srcUri: dataUri(src),
          frame,
          fallbackWidth: 2000,
          bezel: device.bezel === true,
        });
      }
      if (missingIpad) console.warn(`creative ${lang}: no iPad raw — iPhone + Watch only`);
      if (!composed['iphone-6.9']) {
        console.warn(`skip creative ${lang} — no iPhone raw`);
        continue;
      }

      const ipadC = composed['ipad-13'];
      const phoneC = composed['iphone-6.9'];
      const watchC = composed['watch'];
      const rightW = Math.round(contentW * 0.62);
      const headFont = Math.round(ch * 0.065);
      const glowW = Math.round(rightW * 1.15);

      // iPad centred at the back (≈78% of safe height), iPhone in front (≈70%)
      // overlapping the iPad's left ~35%, Watch (≈28%) at its lower-right corner.
      const place = (c, h, style) =>
        `<div style="position:absolute;${style}"><div style="transform:scale(${h / c.h});transform-origin:bottom left;">${c.html}</div></div>`;

      const ipadH = ipadC ? Math.round(sh * 0.78) : 0;
      const phoneH = Math.round(sh * 0.7);
      const watchH = watchC ? Math.round(sh * 0.28) : 0;
      const ipadW = ipadC ? Math.round((ipadC.w * ipadH) / ipadC.h) : 0;
      const phoneW = Math.round((phoneC.w * phoneH) / phoneC.h);
      const watchW = watchC ? Math.round((watchC.w * watchH) / watchC.h) : 0;

      const ipadX = Math.round((rightW - ipadW) / 2);
      const phoneX = ipadC
        ? Math.max(0, Math.round(ipadX + ipadW * 0.35 - phoneW))
        : Math.round((rightW - phoneW) / 2);
      const watchX = ipadC ? Math.round(ipadX + ipadW - watchW * 0.6) : Math.round(rightW - watchW);

      let devicesHtml = '';
      if (ipadC) devicesHtml += place(ipadC, ipadH, `left:${ipadX}px;bottom:0;`);
      devicesHtml += place(phoneC, phoneH, `left:${phoneX}px;bottom:0;`);
      if (watchC) devicesHtml += place(watchC, watchH, `left:${watchX}px;bottom:0;z-index:3;`);

      const outDir = path.join(APPSTORE, LOCALE_DIR[lang], 'creative');
      fs.mkdirSync(outDir, { recursive: true });
      const outFile = path.join(outDir, `${creative.id}.png`);

      await page.setViewportSize({ width: cw, height: ch });
      await page.setContent(
        `<!doctype html><body style="margin:0;width:${cw}px;height:${ch}px;background:#0a0a0a;font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;position:relative;overflow:hidden;">
        <div style="position:absolute;right:${Math.round((cw - sw) / 2 - glowW * 0.15)}px;top:50%;transform:translateY(-50%);width:${glowW}px;height:${glowW}px;border-radius:50%;background:radial-gradient(closest-side, ${ACCENT}55, transparent);"></div>
        <div style="position:absolute;left:${Math.round((cw - sw) / 2 + margin)}px;top:50%;transform:translateY(-50%);width:${contentW}px;height:${contentH}px;">
          <div style="position:absolute;left:0;top:50%;transform:translateY(-50%);width:${Math.round(contentW * 0.36)}px;">
            <h1 style="color:${ACCENT};font-size:${headFont}px;font-weight:700;line-height:1.08;margin:0;letter-spacing:-1px;text-wrap:balance;">${creative.headline[lang]}</h1>
          </div>
          <div style="position:absolute;right:0;top:50%;transform:translateY(-50%);width:${rightW}px;height:${contentH}px;">
            ${devicesHtml}
          </div>
        </div>
      </body>`,
        { waitUntil: 'load' },
      );
      await decodeImages(page);
      await page.screenshot({ path: outFile, type: 'png' });
      flattenPng(outFile);
      checkAppStoreOutput(outFile, creative.canvas);
      const v = pixelVariance(outFile);
      if (!(v > 50)) throw new Error(`creative ${outFile} looks blank (variance ${v})`);
      console.log(`${lang} creative ${creative.id} ✓ (var ${v})`);

      // ---- review previews (gitignored) ------------------------------------
      const previewDir = path.join(MARKETING, '.preview', LOCALE_DIR[lang]);
      fs.mkdirSync(previewDir, { recursive: true });
      const sx = Math.round((cw - 4425) / 2);
      const sy = Math.round((ch - 2247) / 2);
      const hx = Math.round((cw - 5244) / 2);
      const hy = Math.round((ch - 2247) / 2);
      execSync(`python3 - <<'PY'
from PIL import Image, ImageDraw
im = Image.open('${outFile}').convert('RGB')
W, H = im.size
# 21:9 header crop (centered), 3:2 search crop (centered), safe rect
hdr = im.crop((0, ${hy}, 5244, ${hy} + 2247))
hdr.save('${previewDir}/header-crop.png')
srch = im.crop((${sx}, 0, ${sx} + 4425, 2950))
srch.save('${previewDir}/search-crop.png')
g = im.copy()
d = ImageDraw.Draw(g)
d.rectangle([0, ${hy}, 5243, ${hy} + 2246], outline=(255, 0, 0), width=10)
d.rectangle([${sx}, 0, ${sx} + 4424, 2949], outline=(0, 90, 255), width=10)
d.rectangle([${sx}, ${sy}, ${sx} + 4424, ${sy} + 2246], outline=(0, 200, 0), width=10)
g.save('${previewDir}/universal-guides.png')
PY`);
      console.log(`${lang} previews → ${previewDir}`);
    }
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
