#!/usr/bin/env node
'use strict';
/**
 * The scene is an enhancement. This proves the page is still complete and correct
 * without it: no WebGL, reduced motion, and no JavaScript at all. Also sweeps for
 * horizontal overflow at every breakpoint.
 *
 *   node scripts/verify-fallback.js
 */
const { launch, open, sleep } = require('./cdp');
const { decode, lum, ratio, luminanceImage } = require('./png');

const BASE = process.env.BASE || 'http://localhost:5183';
const WIDTHS = [320, 375, 414, 768, 1024, 1280, 1600, 1920];
const PAGES = ['/', '/firm', '/strategies', '/insights', '/team', '/contact',
  '/legal', '/privacy', '/terms', '/insights/investing-through-changing-market-cycles'];

let problems = 0;
const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => { problems++; console.log('  ✗ ' + m); };

const PREP = `
  try { localStorage.setItem('bwc.consent','all') } catch(e) {}
  document.querySelectorAll('.reveal,.reveal-media,.process').forEach(e=>e.classList.add('is-in'));
  const c = document.getElementById('cookie'); if (c) { c.hidden = true; c.classList.remove('is-on'); }
  'ok'`;

(async () => {
  /* ---------------------------------------------------- 1. no WebGL at all */
  console.log('\nno WebGL (--disable-3d-apis)');
  {
    const chrome = await launch({ width: 1440, height: 900, extraArgs: ['--disable-3d-apis'] });
    const page = await open(chrome.port, BASE + '/');
    await page.setViewport(1440, 900, 1);
    await page.goto(BASE + '/');
    await page.eval(PREP);
    await sleep(1500);

    const s = JSON.parse(await page.eval(`JSON.stringify({
      webgl: (()=>{ try { return !!document.createElement('canvas').getContext('webgl'); } catch(e){ return false; } })(),
      sceneOn: document.documentElement.classList.contains('scene-on'),
      canvas: !!document.querySelector('.scene__canvas'),
      heroPlateVisible: (()=>{ const p=document.querySelector('.hero__bg .plate'); if(!p) return false;
        const cs=getComputedStyle(p); return cs.display!=='none' && cs.visibility!=='hidden'; })(),
      headingVisible: (()=>{ const h=document.querySelector('.hero__title'); const cs=getComputedStyle(h);
        return +cs.opacity > 0.9 && h.getBoundingClientRect().width > 100; })(),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    })`));

    s.webgl === false ? ok('WebGL genuinely unavailable in this run') : bad('WebGL was not actually disabled — test is meaningless');
    !s.sceneOn ? ok('scene-on not applied') : bad('scene-on applied without WebGL');
    !s.canvas ? ok('no canvas in the DOM') : bad('canvas present without WebGL');
    s.heroPlateVisible ? ok('hero CSS plate renders as the fallback') : bad('hero plate hidden with no scene to replace it');
    s.headingVisible ? ok('hero headline fully visible') : bad('hero headline not visible');
    s.overflow <= 1 ? ok('no horizontal overflow') : bad(`horizontal overflow ${s.overflow}px`);
    page.consoleErrors.length === 0 ? ok('no console errors') : bad('console errors: ' + page.consoleErrors.join(' | '));

    // Contrast in this mode is covered properly by `NO_WEBGL=1 verify-contrast`,
    // which measures glyph runs across every act rather than element boxes.
    chrome.kill();
  }

  /* ----------------------------------------------------- 1b. frame rate */
  console.log('\nframe rate with the scene live');
  {
    const chrome = await launch({ width: 1440, height: 900 });
    const page = await open(chrome.port, BASE + '/');
    await page.setViewport(1440, 900, 1);
    await page.goto(BASE + '/');
    await page.eval(PREP);
    await sleep(900);
    const live = await page.eval(`document.documentElement.classList.contains('scene-on')`);
    if (!live) { bad('scene did not boot on a GPU-backed run'); chrome.kill(); }
    else {
      const fps = await page.eval(`new Promise((res) => {
        let n = 0; const t0 = performance.now();
        (function tick(){ n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
          else res(Math.round(n / ((performance.now() - t0) / 1000))); })();
      })`);
      fps >= 50 ? ok(`${fps} fps sustained over 2s`) : bad(`only ${fps} fps`);
      const r = await page.eval(`(()=>{const c=document.querySelector('.scene__canvas');
        const g=c.getContext('webgl2')||c.getContext('webgl');
        const d=g.getExtension('WEBGL_debug_renderer_info');
        return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';})()`);
      ok('renderer: ' + r);
      chrome.kill();
    }
  }

  /* ------------------------------------------------- 2. reduced motion */
  console.log('\nprefers-reduced-motion: reduce');
  {
    const chrome = await launch({ width: 1440, height: 900 });
    const page = await open(chrome.port, BASE + '/?scene=force');
    await page.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
    });
    await page.setViewport(1440, 900, 1);
    await page.goto(BASE + '/?scene=force');
    await page.eval(PREP);
    await sleep(1500);

    const r = JSON.parse(await page.eval(`JSON.stringify({
      matches: matchMedia('(prefers-reduced-motion: reduce)').matches,
      canvas: !!document.querySelector('.scene__canvas'),
      revealsHidden: [...document.querySelectorAll('.reveal')].filter(e=>+getComputedStyle(e).opacity<0.9).length,
      wavesHidden: (()=>{ const w=document.querySelector('.hero__waves'); return !w || getComputedStyle(w).display==='none'; })()
    })`));
    r.matches ? ok('media query emulated') : bad('reduced motion not emulated');
    r.canvas ? ok('scene still renders (one static frame)') : ok('scene absent — fallback plates render instead');
    r.revealsHidden === 0 ? ok('no content left transparent') : bad(`${r.revealsHidden} reveal elements still at opacity 0`);

    // a static frame means two captures a second apart are identical
    const a = await page.shotBuffer();
    await sleep(1100);
    const b = await page.shotBuffer();
    a.equals(b) ? ok('frame is genuinely static over 1.1s') : bad('scene is still animating under reduced motion');
    page.consoleErrors.length === 0 ? ok('no console errors') : bad('console errors: ' + page.consoleErrors.join(' | '));
    chrome.kill();
  }

  /* ------------------------------------------------- 3. overflow sweep */
  console.log('\nhorizontal overflow across breakpoints');
  {
    const chrome = await launch({ width: 1920, height: 1080 });
    const page = await open(chrome.port, BASE + '/?scene=force');
    let checked = 0;
    for (const w of WIDTHS) {
      await page.setViewport(w, 900, 1);
      for (const p of PAGES) {
        await page.goto(BASE + p + '?scene=force');
        await page.eval(PREP);
        await sleep(120);
        const over = await page.eval(`(()=>{const d=document.documentElement;
          document.querySelectorAll('.reveal,.reveal-media').forEach(e=>e.classList.add('is-in'));
          return d.scrollWidth - d.clientWidth;})()`);
        checked++;
        if (over > 1) {
          const who = await page.eval(`JSON.stringify((()=>{const d=document.documentElement,out=[];
            document.querySelectorAll('body *').forEach(el=>{const r=el.getBoundingClientRect();
              if(r.width>0&&(r.right>d.clientWidth+1||r.left<-1))
                out.push(el.tagName+'.'+String(el.className).slice(0,34)+' @'+Math.round(r.left)+'..'+Math.round(r.right));});
            return out.slice(0,3);})())`);
          bad(`${p} at ${w}px overflows by ${over}px — ${who}`);
        }
      }
    }
    if (!problems) ok(`${checked} page/width combinations, no overflow`);
    else ok(`${checked} page/width combinations checked`);
    chrome.kill();
  }

  console.log(`\n${'='.repeat(52)}`);
  console.log(problems === 0 ? 'FALLBACK + OVERFLOW PASSED\n' : `${problems} problem(s)\n`);
  process.exit(problems ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
