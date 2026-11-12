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
// Frames are Apple bezel PNGs in marketing/frames/ (gitignored, Apple-owned; how to get
// them: docs/release.md → "Device frames"). A missing frame falls back to a rounded
// screenshot, or to the CSS bezel for devices with "bezel": true (iPad).
import { chromium } from 'playwright';
import sharp from 'sharp';
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
async function flattenPng(file) {
  const meta = await sharp(file).metadata();
  if (!meta.hasAlpha) return;
  const tmp = `${file}.flat.png`;
  await sharp(file)
    .flatten({ background: { r: 10, g: 10, b: 10 } })
    .png()
    .toFile(tmp);
  fs.renameSync(tmp, file);
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
async function alphaAt(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const a = (x, y) => data[(y * info.width + x) * 4 + 3];
  const w = info.width;
  const h = info.height;
  return {
    corners: [a(2, 2), a(w - 3, 2), a(2, h - 3), a(w - 3, h - 3)],
    centre: a(Math.floor(w / 2), Math.floor(h / 2)),
  };
}

async function pixelVariance(file) {
  const { data } = await sharp(file)
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .greyscale()
    .resize(64, 64)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const n = data.length;
  let m = 0;
  for (const p of data) m += p;
  m /= n;
  let v = 0;
  for (const p of data) v += (p - m) ** 2;
  return Math.round((v / n) * 10) / 10;
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
          await flattenPng(appFile);
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
        await flattenPng(appFile);
        checkAppStoreOutput(appFile, device.canvas);

        const v = await pixelVariance(appFile);
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
            const v = await pixelVariance(landFile);
            if (!(v > 50)) throw new Error(`landing ${landFile} looks blank (variance ${v})`);
            const { corners, centre } = await alphaAt(landFile);
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
              const v = await pixelVariance(landFile);
              if (!(v > 50)) throw new Error(`landing ${landFile} looks blank (variance ${v})`);
              console.log(`${lang} ipad landing ${shot.id} ✓`);
            }
          }
        }
      }
    }
  }

  // ---- Creatives: dedicated header (21:9) + search-results (3:2) assets ----
  // The canvas is the size Apple expects; the centered `safe` rect is what stays
  // visible on real devices, so headline + iPhone live inside it while iPad and
  // Watch may bleed past as decoration. The background runs edge to edge.
  for (const creative of CONFIG.creatives ?? []) {
    const [cw, ch] = creative.canvas;
    const [sw, sh] = creative.safe;
    const safeX = Math.round((cw - sw) / 2);
    const safeY = Math.round((ch - sh) / 2);
    const margin = Math.round(Math.min(sw, sh) * 0.05);
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

      // Inside the safe rect: headline column on the left ending `gap` px before
      // the iPhone's left edge, the device column on the right. Only the iPhone
      // is constrained to the safe rect; the iPad sits behind it offset to the
      // right (never left of the phone's left edge) and may bleed off canvas.
      const gap = Math.round(sw * 0.04);
      const glowW = Math.round(sw * 1.1);

      const phoneH = contentH;
      const phoneW = Math.round((phoneC.w * phoneH) / phoneC.h);
      const phoneLeft = contentW - phoneW; // phone is right-aligned in content
      const headW = phoneLeft - gap;
      if (headW <= 0) throw new Error(`creative ${creative.id}: no room for headline`);
      const devW = contentW - headW;
      const phoneX = devW - phoneW;
      const ipadH = ipadC ? Math.round(contentH * 1.2) : 0;
      const ipadW = ipadC ? Math.round((ipadC.w * ipadH) / ipadC.h) : 0;
      const ipadX = ipadC ? Math.round(phoneX + phoneW * 0.55) : 0;
      const ipadBottom = Math.round((contentH - ipadH) / 2);
      const watchH = watchC ? Math.round(contentH * 0.45) : 0;
      const watchW = watchC ? Math.round((watchC.w * watchH) / watchC.h) : 0;
      const watchX = Math.max(0, Math.round(phoneX - watchW * 0.55));
      const watchBottom = Math.round(contentH * 0.1);

      const place = (c, h, style) =>
        `<div style="position:absolute;${style}"><div style="transform:scale(${h / c.h});transform-origin:bottom left;">${c.html}</div></div>`;

      let devicesHtml = '';
      if (ipadC) devicesHtml += place(ipadC, ipadH, `left:${ipadX}px;bottom:${ipadBottom}px;`);
      devicesHtml += place(phoneC, phoneH, `left:${phoneX}px;bottom:0;`);
      if (watchC)
        devicesHtml += place(watchC, watchH, `left:${watchX}px;bottom:${watchBottom}px;z-index:3;`);

      // Headline: one nowrap block per sentence, periods kept. Font size is
      // fitted in the page so all lines stay inside the safe content rect.
      const headlineLines = (
        creative.headline[lang].match(/[^.]+\./g) ?? [creative.headline[lang]]
      ).map((l) => l.trim());
      const headlineHtml = headlineLines
        .map((l) => `<div style="white-space:nowrap;width:max-content">${l}</div>`)
        .join('');

      const outDir = path.join(APPSTORE, LOCALE_DIR[lang], 'creative');
      fs.mkdirSync(outDir, { recursive: true });
      const outFile = path.join(outDir, `${creative.id}.png`);

      await page.setViewportSize({ width: cw, height: ch });
      await page.setContent(
        `<!doctype html><body style="margin:0;width:${cw}px;height:${ch}px;background:#0a0a0a;font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;position:relative;overflow:hidden;">
        <div style="position:absolute;left:${Math.round(safeX + (sw - glowW) / 2)}px;top:${Math.round(safeY + (sh - glowW) / 2)}px;width:${glowW}px;height:${glowW}px;border-radius:50%;background:radial-gradient(closest-side, ${ACCENT}55, transparent);"></div>
        <div style="position:absolute;left:${safeX + margin}px;top:${safeY + margin}px;width:${contentW}px;height:${contentH}px;">
          <div style="position:absolute;left:0;top:50%;transform:translateY(-50%);width:${headW}px;">
            <h1 id="headline" style="color:${ACCENT};font-size:100px;font-weight:700;line-height:1.0;margin:0;letter-spacing:-0.02em;">${headlineHtml}</h1>
          </div>
          <div style="position:absolute;right:0;top:0;width:${devW}px;height:${contentH}px;">
            ${devicesHtml}
          </div>
        </div>
      </body>`,
        { waitUntil: 'load' },
      );
      // Fit the headline: largest font size where the widest line (real text
      // width — lines are width:max-content) fits the headline column and the
      // whole block fits the safe content height.
      const { headFont, measured } = await page.evaluate(
        ({ maxW, maxH }) => {
          const el = document.getElementById('headline');
          const lines = [...el.children];
          const fit = (px) => {
            el.style.fontSize = `${px}px`;
            const widest = Math.max(...lines.map((l) => l.getBoundingClientRect().width));
            return widest <= maxW && el.getBoundingClientRect().height <= maxH;
          };
          let lo = 10;
          let hi = 2000;
          while (hi - lo > 1) {
            const mid = Math.floor((lo + hi) / 2);
            if (fit(mid)) lo = mid;
            else hi = mid;
          }
          el.style.fontSize = `${lo}px`;
          const r = el.getBoundingClientRect();
          const widest = Math.max(...lines.map((l) => l.getBoundingClientRect().width));
          return {
            headFont: lo,
            measured: { widest, top: r.top, bottom: r.bottom, left: r.left },
          };
        },
        { maxW: headW, maxH: contentH },
      );
      // Hard assert: headline right edge stops at least `gap` before the
      // iPhone's left edge, and the block is fully inside the safe rect.
      const phoneAbsLeft = safeX + margin + phoneLeft;
      const headAbsRight = safeX + margin + measured.widest;
      if (
        headAbsRight > phoneAbsLeft - gap ||
        measured.top < safeY ||
        measured.bottom > safeY + sh ||
        measured.left < safeX
      ) {
        throw new Error(
          `creative ${creative.id} ${lang}: headline out of safe rect ` +
            `(right ${Math.round(headAbsRight)} > ${phoneAbsLeft - gap} phone-left-minus-gap, ` +
            `top ${Math.round(measured.top)} bottom ${Math.round(measured.bottom)} safe-y ${safeY}..${safeY + sh})`,
        );
      }
      await decodeImages(page);
      await page.screenshot({ path: outFile, type: 'png' });
      await flattenPng(outFile);
      checkAppStoreOutput(outFile, creative.canvas);
      const v = await pixelVariance(outFile);
      if (!(v > 50)) throw new Error(`creative ${outFile} looks blank (variance ${v})`);
      console.log(`${lang} creative ${creative.id} ✓ (var ${v}, headline ${headFont}px)`);

      // ---- review previews (gitignored) ------------------------------------
      const previewDir = path.join(MARKETING, '.preview', LOCALE_DIR[lang]);
      fs.mkdirSync(previewDir, { recursive: true });
      const cropX = Math.round(cw * 0.079);
      const guides = [
        // green: real safe rect (what Apple keeps visible)
        `<rect x="${safeX}" y="${safeY}" width="${sw}" height="${sh}" fill="none" stroke="rgb(0,200,0)" stroke-width="10"/>`,
      ];
      if (creative.id === 'header') {
        // red: approximate iPhone crop (7.9% hidden each side)
        guides.push(
          `<rect x="${cropX}" y="0" width="${cw - 2 * cropX}" height="${ch}" fill="none" stroke="rgb(255,0,0)" stroke-width="10"/>`,
        );
        await sharp(outFile)
          .extract({ left: cropX, top: 0, width: cw - 2 * cropX, height: ch })
          .png()
          .toFile(path.join(previewDir, 'header-iphone-crop.png'));
      }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}">${guides.join('')}</svg>`;
      await sharp(outFile)
        .composite([{ input: Buffer.from(svg) }])
        .png()
        .toFile(path.join(previewDir, `${creative.id}-guides.png`));
      console.log(`${lang} previews → ${previewDir}`);
    }
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
