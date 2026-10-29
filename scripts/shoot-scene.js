#!/usr/bin/env node
'use strict';
/**
 * Capture one frame per act of the scene, so the camera move can be reviewed as
 * a storyboard. Writes PNGs to the directory given as the first argument.
 *
 *   node scripts/shoot-scene.js /tmp/frames [width] [height]
 */
const fs = require('fs');
const path = require('path');
const { launch, open, sleep } = require('./cdp');

const OUT = process.argv[2] || '/tmp/bwc-frames';
const W = Number(process.argv[3] || 1440);
const H = Number(process.argv[4] || 900);
const BASE = process.env.BASE || 'http://localhost:5183';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = await launch({ width: W, height: H });
  const page = await open(chrome.port, BASE + '/?scene=force');
  await page.setViewport(W, H, 1);
  await page.goto(BASE + '/?scene=force');

  // consent banner and reveal animations out of the way for a clean frame
  await page.eval(`
    try { localStorage.setItem('bwc.consent','all') } catch(e) {}
    document.querySelectorAll('.reveal,.reveal-media,.process').forEach(e=>e.classList.add('is-in'));
    const c = document.getElementById('cookie'); if (c) { c.hidden = true; c.classList.remove('is-on'); }
    'ok'`);

  const booted = await (async () => {
    for (let i = 0; i < 60; i++) {
      const on = await page.eval(`document.documentElement.classList.contains('scene-on') && !!document.querySelector('.scene__canvas')`);
      if (on) return true;
      await sleep(200);
    }
    return false;
  })();

  const acts = await page.eval(`JSON.stringify(window.BWScene.ACTS)`);
  const ACTS = JSON.parse(acts);
  const shots = [];

  for (const act of ACTS) {
    const mid = (act.start + act.end) / 2;
    // scroll so the viewport centre lands in the middle of this act's section
    await page.eval(`(() => {
      const el = document.querySelector('[data-scene="${act.name}"]');
      if (!el) return 'missing';
      const r = el.getBoundingClientRect();
      const top = r.top + scrollY;
      const local = ${(mid - act.start) / (act.end - act.start)};
      window.scrollTo({ top: top + r.height * local - innerHeight * 0.5, behavior: 'instant' });
      return 'ok';
    })()`);
    await sleep(700); // let the water animate into a representative frame
    const file = path.join(OUT, `${String(shots.length + 1).padStart(2, '0')}-${act.name}.png`);
    await page.screenshot(file);
    const state = await page.eval(`JSON.stringify((()=>{const s=window.BWScene.sceneAt(0);return 0})()) || 'x'`);
    shots.push(file);
  }

  const diag = await page.eval(`JSON.stringify({
    sceneOn: document.documentElement.classList.contains('scene-on'),
    canvas: (()=>{const c=document.querySelector('.scene__canvas'); return c ? c.width+'x'+c.height : null})(),
    renderer: (()=>{ const c=document.querySelector('.scene__canvas'); if(!c) return null;
      const g=c.getContext('webgl2')||c.getContext('webgl'); if(!g) return 'no-context';
      const d=g.getExtension('WEBGL_debug_renderer_info');
      return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; })(),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  })`);

  console.log('booted:', booted);
  console.log('diagnostics:', diag);
  console.log('console errors:', page.consoleErrors.length ? page.consoleErrors : 'none');
  console.log('page errors:', page.pageErrors.length ? page.pageErrors : 'none');
  console.log('frames:\n' + shots.map((s) => '  ' + s).join('\n'));

  chrome.kill();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
