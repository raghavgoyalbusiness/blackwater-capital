#!/usr/bin/env node
'use strict';
/**
 * Full-page screenshot of every route, for reviewing the whole site at once.
 *
 *   node scripts/shoot-pages.js /tmp/bwc-pages [width]
 *
 * The homepage is excluded: its background is a fixed canvas, so a
 * beyond-viewport capture of it is meaningless. Use shoot-scene.js for that —
 * the camera move is the homepage.
 */
const fs = require('fs');
const path = require('path');
const { launch, open, sleep } = require('./cdp');

const OUT = process.argv[2] || '/tmp/bwc-pages';
const W = Number(process.argv[3] || 1440);
const BASE = process.env.BASE || 'http://localhost:5183';

const ROUTES = [
  ['firm', '/firm'],
  ['strategies', '/strategies'],
  ['insights', '/insights'],
  ['article', '/insights/the-importance-of-capital-discipline'],
  ['team', '/team'],
  ['contact', '/contact'],
  ['legal', '/legal']
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = await launch({ width: W, height: 1000 });
  const page = await open(chrome.port, BASE + '/firm');
  await page.setViewport(W, 1000, 1);

  const shots = [];
  for (const [name, route] of ROUTES) {
    await page.goto(BASE + route);
    await page.eval(`
      try { localStorage.setItem('bwc.consent','all') } catch(e) {}
      document.querySelectorAll('.reveal,.reveal-media,.process').forEach(e=>e.classList.add('is-in'));
      const c = document.getElementById('cookie'); if (c) { c.hidden = true; c.classList.remove('is-on'); }
      'ok'`);
    await sleep(450);

    const h = await page.eval(`Math.ceil(document.documentElement.scrollHeight)`);
    // Grow the viewport to the document so fixed elements land once, at the top,
    // instead of being painted over the whole strip.
    await page.setViewport(W, Math.min(h, 24000), 1);
    // The resize needs a scroll reset and a couple of frames to settle, or the
    // previous route's paint ghosts into the top of the capture.
    await page.eval(`window.scrollTo(0, 0);
      new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    await sleep(900);
    const file = path.join(OUT, `${String(shots.length + 1).padStart(2, '0')}-${name}.png`);
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    shots.push([file, W + '×' + h]);
    await page.setViewport(W, 1000, 1);
  }

  console.log('console errors:', page.consoleErrors.length ? page.consoleErrors : 'none');
  console.log('page errors:', page.pageErrors.length ? page.pageErrors : 'none');
  shots.forEach(([f, dim]) => console.log(`  ${dim.padEnd(12)} ${f}`));
  chrome.kill();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
