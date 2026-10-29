#!/usr/bin/env node
'use strict';
/**
 * Contrast sweep over the live scene.
 *
 * Design tokens cannot answer this: the ground behind the homepage text is a moving
 * shader. So we hide the text, screenshot what is actually behind it, and gate on the
 * WORST pixel inside each text box — the mean would pass while a headline sits over
 * the lamp glow and fails.
 *
 *   node scripts/verify-contrast.js [width] [height]
 */
const { launch, open, sleep } = require('./cdp');
const { decode, lum, ratio, luminanceImage } = require('./png');

const BASE = process.env.BASE || 'http://localhost:5183';
const W = Number(process.argv[2] || 1440);
const H = Number(process.argv[3] || 900);

// Measure the glyph runs themselves, not the elements containing them. An element
// box can include its own padding, borders and pseudo-element decoration, none of
// which the text is actually drawn on — sampling those invents failures.
const COLLECT = `(() => {
  const out = [];
  // Content scrolls under the fixed navigation by design; that strip is occluded,
  // not low-contrast, so it must not be sampled.
  const nav = document.querySelector('.nav');
  const navBottom = nav && getComputedStyle(nav).position === 'fixed'
    ? nav.getBoundingClientRect().bottom : 0;
  const sel = 'h1,h2,h3,h4,p,li,a,span,dt,dd,time,cite,figcaption,button,label,strong';
  const probes = [];
  document.querySelectorAll(sel).forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return;
    Array.prototype.slice.call(el.childNodes).forEach((n) => {
      if (n.nodeType !== 3 || n.nodeValue.trim().length < 2) return;
      const s = document.createElement('span');
      s.setAttribute('data-probe', '');
      el.insertBefore(s, n);
      s.appendChild(n);
      probes.push({ s: s, el: el, cs: cs });
    });
  });

  probes.forEach(({ s, el, cs }) => {
    const m = cs.color.match(/[\\d.]+/g);
    if (!m) return;
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const txt = s.textContent.trim();
    for (const r of s.getClientRects()) {
      // erode a pixel so rounding never samples the row just outside the run
      const left = Math.max(0, r.left + 1), top = Math.max(navBottom, r.top + 1);
      const right = Math.min(innerWidth, r.right - 1), bottom = Math.min(innerHeight, r.bottom - 1);
      if (right - left < 3 || bottom - top < 3) continue;
      out.push({
        x: Math.round(left), y: Math.round(top),
        w: Math.round(right - left), h: Math.round(bottom - top),
        c: [+m[0], +m[1], +m[2]],
        large: size >= 24 || (size >= 18.66 && bold),
        text: txt.slice(0, 44),
        tag: el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : '')
      });
    }
  });

  // put the DOM back exactly as it was before the screenshot is taken
  probes.forEach(({ s, el }) => {
    while (s.firstChild) el.insertBefore(s.firstChild, s);
    s.remove();
    el.normalize();
  });
  return JSON.stringify(out);
})()`;

// Remove the glyphs, not the elements. visibility:hidden also removes an element's
// own background — which is exactly the ground a button's label sits on — so the
// sweep would measure the page behind the button instead of the button.
const HIDE = `(() => {
  const s = document.createElement('style');
  s.id = '__hide_text__';
  s.textContent = '*{color:transparent !important;-webkit-text-fill-color:transparent !important;text-shadow:none !important}';
  document.head.appendChild(s);
  return 'hidden';
})()`;

const SHOW = `(() => { const s = document.getElementById('__hide_text__'); if (s) s.remove(); return 'shown'; })()`;

// NO_WEBGL=1 runs the identical sweep against the static CSS-plate fallback.
const NO_WEBGL = !!process.env.NO_WEBGL;

(async () => {
  const chrome = await launch({ width: W, height: H, extraArgs: NO_WEBGL ? ['--disable-3d-apis'] : [] });
  const page = await open(chrome.port, BASE + '/?scene=force');
  await page.setViewport(W, H, 1);
  await page.goto(BASE + '/?scene=force');
  await page.eval(`
    try { localStorage.setItem('bwc.consent','all') } catch(e) {}
    document.querySelectorAll('.reveal,.reveal-media,.process').forEach(e=>e.classList.add('is-in'));
    const c = document.getElementById('cookie'); if (c) { c.hidden = true; c.classList.remove('is-on'); }
    'ok'`);

  if (NO_WEBGL) {
    const live = await page.eval(`document.documentElement.classList.contains('scene-on')`);
    if (live) throw new Error('expected the fallback, but the scene booted');
    await sleep(600);
  } else {
    for (let i = 0; i < 50; i++) {
      if (await page.eval(`document.documentElement.classList.contains('scene-on')`)) break;
      await sleep(200);
    }
  }

  const ACTS = JSON.parse(await page.eval(`JSON.stringify(window.BWScene.ACTS)`));
  const AA_LARGE = 3.0, AA_SMALL = 4.5;
  const findings = [];
  let boxesChecked = 0;

  // Several stops per act: the ground moves continuously, so a single frame per
  // section would miss the position where a light passes under a headline.
  for (const act of ACTS) {
    for (const local of [0.15, 0.4, 0.65, 0.9]) {
      await page.eval(`(() => {
        const el = document.querySelector('[data-scene="${act.name}"]');
        if (!el) return 'missing';
        const r = el.getBoundingClientRect(), top = r.top + scrollY;
        window.scrollTo({ top: top + r.height * ${local} - innerHeight * 0.5, behavior: 'instant' });
        return 'ok';
      })()`);
      await sleep(260);

      const boxes = JSON.parse(await page.eval(COLLECT));
      await page.eval(HIDE);
      await sleep(90);
      const png = decode(await page.shotBuffer());
      await page.eval(SHOW);

      const L = luminanceImage(png);
      const { width, height, data, channels } = png;
      for (const b of boxes) {
        boxesChecked++;
        const need = b.large ? AA_LARGE : AA_SMALL;
        const tl = lum(b.c[0], b.c[1], b.c[2]);
        // Worst contrast is against whichever extreme sits closest to the text
        // luminance, so min and max of the box bound the answer exactly.
        let lo = Infinity, hi = -Infinity, loAt = null, hiAt = null;
        const x1 = Math.min(b.x + b.w, width), y1 = Math.min(b.y + b.h, height);
        for (let y = b.y; y < y1; y++) {
          const row = y * width;
          for (let x = b.x; x < x1; x++) {
            const v = L[row + x];
            if (v < lo) { lo = v; loAt = row + x; }
            if (v > hi) { hi = v; hiAt = row + x; }
          }
        }
        if (loAt === null) continue;
        const rLo = ratio(tl, lo), rHi = ratio(tl, hi);
        const worst = Math.min(rLo, rHi);
        if (worst < need) {
          const idx = rLo < rHi ? loAt : hiAt;
          const o = idx * channels;
          findings.push({
            act: act.name, local, ratio: +worst.toFixed(2), need,
            text: b.text, tag: b.tag,
            pixel: `rgb(${data[o]},${data[o + 1]},${data[o + 2]}) @ ${idx % width},${(idx / width) | 0}`
          });
        }
      }
    }
  }

  console.log(`\n  viewport ${W}x${H}${NO_WEBGL ? ' (CSS-plate fallback)' : ''} — ${boxesChecked} text boxes swept across ${ACTS.length} acts\n`);
  if (!findings.length) {
    console.log('  ✓ every text box clears AA against the worst pixel behind it\n');
    chrome.kill();
    process.exit(0);
  }
  // collapse duplicates of the same text, keeping the worst
  const worstBy = new Map();
  for (const f of findings) {
    const k = f.tag + '|' + f.text;
    if (!worstBy.has(k) || worstBy.get(k).ratio > f.ratio) worstBy.set(k, f);
  }
  [...worstBy.values()].sort((a, b) => a.ratio - b.ratio).forEach((f) => {
    console.log(`  ✗ ${f.ratio} (needs ${f.need})  [${f.act} @${f.local}]  ${f.tag}  "${f.text}"`);
    console.log(`      worst pixel ${f.pixel}`);
  });
  console.log(`\n  ${worstBy.size} distinct failing elements\n`);
  chrome.kill();
  process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
