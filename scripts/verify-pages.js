#!/usr/bin/env node
'use strict';
/**
 * Structural, SEO and accessibility audit over the served HTML of every route,
 * plus a link check. Pure HTTP — no browser needed.
 *
 *   node scripts/verify-pages.js
 */
const BASE = process.env.BASE || 'http://localhost:5183';

const PAGES = ['/', '/firm', '/strategies', '/insights', '/team', '/contact',
  '/legal', '/privacy', '/terms'];

const all = (re, s) => [...s.matchAll(re)];
let problems = 0;
const fail = (msg) => { problems++; console.log('  ✗ ' + msg); };

(async () => {
  const slugs = (await (await fetch(BASE + '/api/insights')).json()).articles.map((a) => a.slug);
  const routes = PAGES.concat(slugs.map((s) => '/insights/' + s));

  // --- status codes
  console.log('\nroutes');
  for (const p of routes.concat(['/robots.txt', '/sitemap.xml'])) {
    const r = await fetch(BASE + p);
    if (!r.ok) fail(`${p} returned ${r.status}`);
  }
  const nf = await fetch(BASE + '/definitely-not-a-page');
  if (nf.status !== 404) fail(`unknown route returned ${nf.status}, expected 404`);
  console.log(`  checked ${routes.length + 3} routes`);

  // --- per page
  for (const p of routes) {
    const h = await (await fetch(BASE + p)).text();
    const where = (m) => fail(`[${p}] ${m}`);

    const title = (h.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    const desc = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
    if (!(title.length > 10 && title.length <= 70)) where(`title length ${title.length}: ${title}`);
    if (!(desc.length >= 70 && desc.length <= 200)) where(`meta description length ${desc.length}`);
    if (!/<link rel="canonical" href="http/.test(h)) where('missing canonical');
    if (!/<html lang="en-GB"/.test(h)) where('missing lang');
    if (!/<meta name="viewport"[^>]*width=device-width/.test(h)) where('missing viewport');
    if (!(/<meta property="og:title"/.test(h) && /<meta property="og:image"/.test(h))) where('missing og tags');
    try { JSON.parse((h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1]); }
    catch { where('JSON-LD invalid'); }

    const heads = all(/<(h[1-4])\b[^>]*>([\s\S]*?)<\/\1>/gi, h)
      .map((m) => ({ lvl: +m[1][1], text: m[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() }));
    const h1s = heads.filter((x) => x.lvl === 1);
    if (h1s.length !== 1) where(`${h1s.length} h1 elements`);
    let prev = 1;
    for (const x of heads) {
      if (x.lvl > prev + 1) where(`heading jump ${prev}->${x.lvl} at "${x.text.slice(0, 40)}"`);
      prev = x.lvl;
    }

    const imgs = all(/<img\b[^>]*>/gi, h).map((m) => m[0]);
    const noAlt = imgs.filter((t) => !/\balt=/.test(t));
    if (noAlt.length) where(`${noAlt.length} img without alt`);
    const noDim = imgs.filter((t) => !(/width=/.test(t) && /height=/.test(t)));
    if (noDim.length) where(`${noDim.length} img without width/height`);

    const inputs = all(/<(input|select|textarea)\b[^>]*>/gi, h).map((m) => m[0])
      .filter((t) => !/type="(hidden|submit)"/.test(t));
    for (const t of inputs) {
      const id = (t.match(/\bid="([^"]+)"/) || [])[1];
      if (!id) { where(`form control without id`); continue; }
      if (!new RegExp(`<label[^>]*for="${id}"`).test(h)) where(`no <label for="${id}">`);
    }

    const nameless = all(/<button\b[^>]*>([\s\S]*?)<\/button>/gi, h)
      .filter((m) => !m[1].replace(/<[^>]*>/g, '').trim() && !/aria-label=/.test(m[0]));
    if (nameless.length) where(`${nameless.length} buttons without an accessible name`);

    const badLinks = all(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, h)
      .filter((m) => !m[1].replace(/<[^>]*>/g, '').trim() && !/aria-label=/.test(m[0]));
    if (badLinks.length) where(`${badLinks.length} links without an accessible name`);

    const unsafe = all(/<a\b[^>]*href="https?:\/\/[^"]*"[^>]*>/gi, h).map((m) => m[0])
      .filter((t) => /target="_blank"/.test(t) && !/rel="[^"]*noopener/.test(t));
    if (unsafe.length) where(`${unsafe.length} unsafe target=_blank`);

    const toks = [...new Set(all(/\{\{[A-Z_>][^}]*\}\}/g, h).map((m) => m[0]))];
    if (toks.length) where(`unresolved tokens: ${toks.join(' ')}`);

    if (!/proposed investment and asset management brand/.test(h)) where('missing footer disclosure');
    if (!/class="skip-link"/.test(h)) where('no skip link');
    if (!(/<main id="main"/.test(h) && /<footer/.test(h) && /<header/.test(h))) where('missing landmark');

    // every internal href and src must resolve
    const urls = [...new Set(all(/(?:href|src)="(\/[^"#]*)"/g, h).map((m) => m[1]))];
    for (const u of urls) {
      const r = await fetch(BASE + u, { method: 'GET' });
      if (!r.ok) where(`broken link ${u} (${r.status})`);
    }
    // every in-page anchor must have a target
    for (const a of [...new Set(all(/href="#([a-z0-9-]+)"/g, h).map((m) => m[1]))]) {
      if (!new RegExp(`id="${a}"`).test(h)) where(`anchor #${a} has no target`);
    }
  }

  console.log(`\n${'='.repeat(52)}`);
  console.log(problems === 0
    ? `PAGES AUDIT PASSED — ${routes.length} routes, no problems found.\n`
    : `PAGES AUDIT: ${problems} problem(s).\n`);
  process.exit(problems ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
