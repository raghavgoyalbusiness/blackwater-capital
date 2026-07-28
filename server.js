'use strict';
/**
 * Blackwater Capital — zero-dependency Node server.
 *
 * Pages are composed server-side from site/layouts + site/partials so every
 * route ships complete HTML (good for SEO and works with JS disabled).
 * Insights are rendered from content/insights.json, which is the CMS seam:
 * replace that file — or the loadInsights() function — with a real CMS feed
 * and nothing else needs to change.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 5183;
const ROOT = __dirname;
const SITE = path.join(ROOT, 'site');
const PUBLIC = path.join(ROOT, 'public');
const CONTENT = path.join(ROOT, 'content');
const DATA = path.join(ROOT, 'data');
const DEV = process.env.NODE_ENV !== 'production';
const ORIGIN = process.env.SITE_ORIGIN || `http://localhost:${PORT}`;

/* ------------------------------------------------------------------ utils */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

const cache = new Map();
function readFileCached(file) {
  if (!DEV && cache.has(file)) return cache.get(file);
  const txt = fs.readFileSync(file, 'utf8');
  cache.set(file, txt);
  return txt;
}

const escapeHtml = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/* -------------------------------------------------------------- templating */

function partial(name) {
  return readFileCached(path.join(SITE, 'partials', name + '.html'));
}

/** Resolve {{> partial}} includes recursively (depth-capped). */
function includes(html, depth = 0) {
  if (depth > 6) return html;
  return html.replace(/\{\{>\s*([a-z0-9_-]+)\s*\}\}/gi, (_, name) =>
    includes(partial(name), depth + 1)
  );
}

/** Fill {{TOKEN}} slots; unknown tokens collapse to ''. */
function fill(html, vars) {
  return html.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key] ?? '') : ''
  );
}

/** Page files start with an HTML comment holding their metadata as JSON. */
function loadPage(name) {
  const raw = readFileCached(path.join(SITE, 'pages', name + '.html'));
  const m = raw.match(/^\s*<!--meta\s*([\s\S]*?)-->/);
  let meta = {};
  let body = raw;
  if (m) {
    meta = JSON.parse(m[1]);
    body = raw.slice(m[0].length);
  }
  return { meta, body };
}

function organisationJsonLd() {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Blackwater Capital',
    url: ORIGIN,
    logo: ORIGIN + '/assets/img/logo-lockup.png',
    description:
      'Blackwater Capital is a proposed investment and asset management brand focused on long-term capital allocation across public markets, private equity, private credit and real assets.',
    disambiguatingDescription:
      'Proposed brand. This website is informational only and is not an offer or solicitation.'
  });
}

function renderPage(name, overrides = {}) {
  const layout = readFileCached(path.join(SITE, 'layouts', 'base.html'));
  const { meta, body } = loadPage(name);
  const m = Object.assign({}, meta, overrides.meta || {});
  const vars = Object.assign(
    {
      TITLE: escapeHtml(m.title || 'Blackwater Capital'),
      DESCRIPTION: escapeHtml(m.description || ''),
      CANONICAL: ORIGIN + (m.path || '/'),
      CANONICAL_ORIGIN: ORIGIN,
      BODY_CLASS: m.bodyClass || '',
      NAV_KEY: m.nav || '',
      HERO_THEME: m.heroTheme || 'light',
      JSONLD: overrides.jsonld || organisationJsonLd(),
      HEAD_EXTRA: overrides.headExtra || '',
      SCRIPTS: m.scripts
        ? m.scripts
            .map((s) => `<script src="/assets/js/${s}.js" defer></script>`)
            .join('\n    ')
        : '',
      YEAR: new Date().getFullYear()
    },
    overrides.vars || {}
  );
  // The page body is filled first: it carries its own tokens (e.g. rendered
  // insight cards), and a single pass over the assembled document would leave
  // anything injected via {{CONTENT}} unprocessed.
  vars.CONTENT = fill(overrides.content != null ? overrides.content : body, vars);
  // Includes before the outer fill so partials can also use {{TOKENS}}.
  return fill(includes(layout), vars);
}

/* ------------------------------------------------------- insights "CMS" */

let insightsCache = null;
function loadInsights() {
  if (!DEV && insightsCache) return insightsCache;
  const json = JSON.parse(fs.readFileSync(path.join(CONTENT, 'insights.json'), 'utf8'));
  json.articles.sort((a, b) => (a.date < b.date ? 1 : -1));
  insightsCache = json;
  return json;
}

const fmtDate = (iso) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  });

function articleCard(a, opts = {}) {
  return `<article class="card card--insight reveal">
    <a class="card__hit" href="/insights/${a.slug}" aria-label="${escapeHtml(a.title)}"></a>
    <div class="card__media">
      <div class="card__plate plate plate--${a.plate || 'water'}" aria-hidden="true"></div>
      ${opts.sample === false ? '' : '<span class="card__badge">Sample</span>'}
    </div>
    <div class="card__body">
      <p class="eyebrow">${escapeHtml(a.category)}</p>
      <h3 class="card__title">${escapeHtml(a.title)}</h3>
      <p class="card__excerpt">${escapeHtml(a.excerpt)}</p>
      <p class="meta meta--card">
        <span>${escapeHtml(a.author)}</span>
        <span aria-hidden="true">·</span>
        <time datetime="${a.date}">${fmtDate(a.date)}</time>
        <span aria-hidden="true">·</span>
        <span>${a.readingTime} min read</span>
      </p>
      <span class="link-arrow" aria-hidden="true">Read insight</span>
    </div>
  </article>`;
}

/** Article body blocks -> HTML. Block types are the CMS contract. */
function renderBlocks(blocks) {
  return blocks
    .map((b) => {
      switch (b.type) {
        case 'p':
          return `<p>${b.text}</p>`;
        case 'h2':
          return `<h2 id="${escapeHtml(
            b.text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
          )}">${escapeHtml(b.text)}</h2>`;
        case 'h3':
          return `<h3>${escapeHtml(b.text)}</h3>`;
        case 'quote':
          return `<blockquote class="pullquote"><p>${escapeHtml(b.text)}</p>${
            b.attribution ? `<cite>${escapeHtml(b.attribution)}</cite>` : ''
          }</blockquote>`;
        case 'list':
          return `<ul class="prose-list">${b.items
            .map((i) => `<li>${i}</li>`)
            .join('')}</ul>`;
        case 'figure':
          return `<figure class="prose-figure">
            <div class="plate plate--${b.plate || 'stone'} plate--figure" role="img" aria-label="${escapeHtml(
              b.alt || b.caption || 'Abstract illustration'
            )}"></div>
            <figcaption>${escapeHtml(b.caption || '')}</figcaption>
          </figure>`;
        case 'diagram':
          return `<figure class="prose-figure prose-figure--diagram">
            ${schematic(b.schematic)}
            <figcaption>${escapeHtml(b.caption || '')}</figcaption>
          </figure>`;
        case 'note':
          return `<aside class="prose-note"><p>${b.text}</p></aside>`;
        default:
          return '';
      }
    })
    .join('\n');
}

/**
 * Illustrative schematics only. These are conceptual diagrams — they carry no
 * data, no performance and no statistics, and each is captioned as such.
 */
function schematic(kind) {
  if (kind === 'risk-return') {
    return `<svg class="schematic" viewBox="0 0 720 320" role="img" aria-label="Conceptual diagram: a range of possible outcomes widening as risk increases.">
      <defs><linearGradient id="sg1" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#66717D" stop-opacity=".05"/>
        <stop offset="1" stop-color="#07172E" stop-opacity=".18"/>
      </linearGradient></defs>
      <path d="M60 160 C 240 158, 420 120, 660 40 L660 280 C 420 200, 240 162, 60 160 Z" fill="url(#sg1)"/>
      <path d="M60 160 C 240 158, 420 120, 660 40" fill="none" stroke="#07172E" stroke-width="1.25"/>
      <path d="M60 160 C 240 162, 420 200, 660 280" fill="none" stroke="#66717D" stroke-width="1.25" stroke-dasharray="4 5"/>
      <line x1="60" y1="20" x2="60" y2="300" stroke="#090B0D" stroke-opacity=".28"/>
      <line x1="60" y1="300" x2="690" y2="300" stroke="#090B0D" stroke-opacity=".28"/>
      <text x="60" y="14" class="schematic__lbl">Range of outcomes</text>
      <text x="690" y="316" text-anchor="end" class="schematic__lbl">Risk assumed</text>
    </svg>`;
  }
  if (kind === 'capital-structure') {
    return `<svg class="schematic" viewBox="0 0 720 320" role="img" aria-label="Conceptual diagram: the ordering of claims in a capital structure, from senior secured debt at the base to equity at the top.">
      ${[
        ['Equity', 40, '#07172E', 0.9],
        ['Subordinated / mezzanine', 100, '#22303f', 0.75],
        ['Senior unsecured', 160, '#3f4b58', 0.6],
        ['Senior secured', 220, '#66717D', 0.45]
      ]
        .map(
          ([label, y, fill, op], i) =>
            `<rect x="${60 + i * 18}" y="${y}" width="${560 - i * 36}" height="44" fill="${fill}" fill-opacity="${op}"/>
             <text x="${72 + i * 18}" y="${Number(y) + 28}" class="schematic__lbl schematic__lbl--inv">${label}</text>`
        )
        .join('')}
      <text x="60" y="296" class="schematic__lbl">Lower priority of claim  ↑   ·   Higher priority of claim  ↓</text>
    </svg>`;
  }
  if (kind === 'cycle') {
    return `<svg class="schematic" viewBox="0 0 720 320" role="img" aria-label="Conceptual diagram: a market cycle drawn as a wave, with capital discipline applied consistently across it.">
      <path d="M40 200 C 140 60, 240 60, 340 200 S 540 340, 680 120" fill="none" stroke="#07172E" stroke-width="1.5"/>
      <line x1="40" y1="200" x2="680" y2="200" stroke="#090B0D" stroke-opacity=".2" stroke-dasharray="3 6"/>
      ${[
        [130, 96, 'Optimism'],
        [340, 200, 'Transition'],
        [520, 268, 'Dislocation'],
        [660, 132, 'Recovery']
      ]
        .map(
          ([x, y, l]) =>
            `<circle cx="${x}" cy="${y}" r="4.5" fill="#F5F4F0" stroke="#07172E" stroke-width="1.5"/>
             <text x="${x}" y="${Number(y) - 16}" text-anchor="middle" class="schematic__lbl">${l}</text>`
        )
        .join('')}
    </svg>`;
  }
  return '';
}

function renderArticle(slug) {
  const data = loadInsights();
  const idx = data.articles.findIndex((a) => a.slug === slug);
  if (idx === -1) return null;
  const a = data.articles[idx];
  const related = data.articles.filter((x) => x.slug !== slug).slice(0, 3);

  const toc = a.body
    .filter((b) => b.type === 'h2')
    .map((b) => {
      const id = b.text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return `<li><a href="#${id}">${escapeHtml(b.text)}</a></li>`;
    })
    .join('');

  const content = `
  <article class="article">
    <header class="article__head">
      <div class="shell shell--narrow">
        <nav class="crumbs" aria-label="Breadcrumb">
          <a href="/insights">Insights</a><span aria-hidden="true">/</span><span>${escapeHtml(a.category)}</span>
        </nav>
        <p class="eyebrow reveal">${escapeHtml(a.category)} <span class="tag tag--sample">Sample insight</span></p>
        <h1 class="article__title reveal">${escapeHtml(a.title)}</h1>
        <p class="article__standfirst reveal">${escapeHtml(a.excerpt)}</p>
        <p class="meta reveal">
          <span>${escapeHtml(a.author)}</span><span aria-hidden="true">·</span>
          <time datetime="${a.date}">${fmtDate(a.date)}</time><span aria-hidden="true">·</span>
          <span>${a.readingTime} min read</span>
        </p>
      </div>
    </header>

    <div class="article__hero plate plate--${a.plate || 'water'} reveal" role="img" aria-label="Abstract illustration"></div>

    <div class="shell article__layout">
      <aside class="article__aside">
        ${toc ? `<nav class="toc" aria-label="On this page"><p class="eyebrow">On this page</p><ul>${toc}</ul></nav>` : ''}
        <div class="share">
          <p class="eyebrow">Share</p>
          <button class="share__btn" type="button" data-copy-link>Copy link</button>
        </div>
      </aside>
      <div class="prose article__body">
        ${renderBlocks(a.body)}
        <div class="prose-disclaimer">
          <p>This article is sample editorial content published for general informational
          purposes. It does not constitute investment advice, an offer, a recommendation or a
          solicitation to buy or sell any financial product or service, and it does not describe
          any actual portfolio, holding or result.</p>
        </div>
      </div>
    </div>

    <section class="section section--related">
      <div class="shell">
        <div class="section__head">
          <h2 class="h3">Related insights</h2>
          <a class="link-arrow" href="/insights">All insights</a>
        </div>
        <div class="grid grid--3">${related.map((r) => articleCard(r)).join('')}</div>
      </div>
    </section>
  </article>`;

  const jsonld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title,
    description: a.excerpt,
    datePublished: a.date,
    author: { '@type': 'Organization', name: a.author },
    publisher: { '@type': 'Organization', name: 'Blackwater Capital' },
    mainEntityOfPage: `${ORIGIN}/insights/${a.slug}`,
    isAccessibleForFree: true
  });

  return renderPage('article', {
    content,
    jsonld,
    meta: {
      title: `${a.title} — Blackwater Capital`,
      description: a.excerpt,
      path: `/insights/${a.slug}`,
      nav: 'insights',
      scripts: ['article']
    }
  });
}

/* ----------------------------------------------------------------- routes */

function send(res, status, body, type, extra = {}) {
  const headers = Object.assign(
    {
      'Content-Type': type,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'SAMEORIGIN'
    },
    extra
  );
  res.writeHead(status, headers);
  res.end(body);
}

function serveStatic(res, urlPath) {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, '');
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) return false; // traversal guard
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return false;
  }
  if (!st.isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  const etag = `W/"${st.size}-${st.mtimeMs.toString(36)}"`;
  send(res, 200, fs.readFileSync(file), MIME[ext] || 'application/octet-stream', {
    'Cache-Control': DEV
      ? 'no-cache'
      : ext === '.html'
      ? 'public, max-age=300'
      : 'public, max-age=31536000, immutable',
    ETag: etag
  });
  return true;
}

const PAGES = {
  '/': 'index',
  '/firm': 'firm',
  '/strategies': 'strategies',
  '/insights': 'insights',
  '/team': 'team',
  '/contact': 'contact',
  '/legal': 'legal',
  '/privacy': 'privacy',
  '/terms': 'terms'
};

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const chunks = [];
    req.on('data', (c) => {
      n += c.length;
      if (n > limit) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const ENQUIRY_TYPES = [
  'Investor enquiries',
  'Business and investment opportunities',
  'Media enquiries',
  'Careers',
  'General enquiries'
];

function validateEnquiry(b) {
  const errors = {};
  const s = (v) => (typeof v === 'string' ? v.trim() : '');
  const name = s(b.name);
  const email = s(b.email);
  const org = s(b.organisation);
  const role = s(b.role);
  const type = s(b.enquiryType);
  const message = s(b.message);

  if (name.length < 2 || name.length > 120) errors.name = 'Please enter your full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 180)
    errors.email = 'Please enter a valid work email address.';
  if (org && org.length > 160) errors.organisation = 'Organisation name is too long.';
  if (role && role.length > 120) errors.role = 'Role is too long.';
  if (!ENQUIRY_TYPES.includes(type)) errors.enquiryType = 'Please select an enquiry type.';
  if (message.length < 20) errors.message = 'Please provide at least a short description (20 characters).';
  if (message.length > 4000) errors.message = 'Please keep your message under 4,000 characters.';
  if (b.consent !== true) errors.consent = 'Please confirm you consent to us handling your enquiry.';
  if (s(b.company)) errors._bot = 'Submission rejected.'; // honeypot

  return { errors, clean: { name, email, organisation: org, role, enquiryType: type, message } };
}

const rate = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const win = 10 * 60 * 1000;
  const hits = (rate.get(ip) || []).filter((t) => now - t < win);
  hits.push(now);
  rate.set(ip, hits);
  if (rate.size > 5000) rate.clear();
  return hits.length > 8;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, ORIGIN);
  let pathname = url.pathname.replace(/\/+$/, '') || '/';

  try {
    /* API ---------------------------------------------------------------- */
    if (pathname === '/api/insights' && req.method === 'GET') {
      const data = loadInsights();
      const cat = url.searchParams.get('category');
      const articles = data.articles
        .filter((a) => !cat || cat === 'All' || a.category === cat)
        .map(({ body, ...rest }) => rest);
      return send(
        res,
        200,
        JSON.stringify({ categories: data.categories, articles }),
        MIME['.json']
      );
    }

    if (pathname === '/api/enquiry' && req.method === 'POST') {
      const ip = req.socket.remoteAddress || 'unknown';
      if (rateLimited(ip))
        return send(
          res,
          429,
          JSON.stringify({ ok: false, message: 'Too many submissions. Please try again later.' }),
          MIME['.json']
        );
      let payload;
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        return send(res, 400, JSON.stringify({ ok: false, message: 'Invalid request.' }), MIME['.json']);
      }
      const { errors, clean } = validateEnquiry(payload);
      if (Object.keys(errors).length)
        return send(res, 422, JSON.stringify({ ok: false, errors }), MIME['.json']);

      const reference = 'BWC-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      const record = { reference, receivedAt: new Date().toISOString(), ...clean };
      try {
        fs.mkdirSync(DATA, { recursive: true });
        fs.appendFileSync(path.join(DATA, 'enquiries.jsonl'), JSON.stringify(record) + '\n');
      } catch (e) {
        console.error('enquiry write failed', e);
      }
      return send(res, 200, JSON.stringify({ ok: true, reference }), MIME['.json']);
    }

    /* Static -------------------------------------------------------------- */
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (pathname === '/robots.txt')
        return send(res, 200, `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`, MIME['.txt']);

      if (pathname === '/sitemap.xml') {
        const urls = Object.keys(PAGES).concat(
          loadInsights().articles.map((a) => '/insights/' + a.slug)
        );
        const xml =
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          urls
            .map(
              (u) =>
                `  <url><loc>${ORIGIN}${u === '/' ? '/' : u}</loc><changefreq>monthly</changefreq><priority>${
                  u === '/' ? '1.0' : '0.7'
                }</priority></url>`
            )
            .join('\n') +
          `\n</urlset>\n`;
        return send(res, 200, xml, MIME['.xml']);
      }

      if (pathname.startsWith('/assets/') && serveStatic(res, pathname)) return;

      if (PAGES[pathname]) {
        const html =
          pathname === '/insights'
            ? renderPage('insights', {
                vars: {
                  INSIGHT_CARDS: loadInsights().articles.map((a) => articleCard(a)).join(''),
                  INSIGHT_FILTERS: ['All']
                    .concat(loadInsights().categories)
                    .map(
                      (c, i) =>
                        `<button class="filter${i === 0 ? ' is-active' : ''}" type="button" data-filter="${escapeHtml(
                          c
                        )}" aria-pressed="${i === 0}">${escapeHtml(c)}</button>`
                    )
                    .join('')
                }
              })
            : pathname === '/'
            ? renderPage('index', {
                vars: {
                  HOME_INSIGHTS: loadInsights()
                    .articles.slice(0, 3)
                    .map((a) => articleCard(a))
                    .join('')
                }
              })
            : renderPage(PAGES[pathname]);
        return send(res, 200, html, MIME['.html'], { 'Cache-Control': 'no-cache' });
      }

      const m = pathname.match(/^\/insights\/([a-z0-9-]+)$/);
      if (m) {
        const html = renderArticle(m[1]);
        if (html) return send(res, 200, html, MIME['.html'], { 'Cache-Control': 'no-cache' });
      }

      if (serveStatic(res, pathname)) return;

      return send(res, 404, renderPage('404'), MIME['.html']);
    }

    send(res, 405, 'Method not allowed', MIME['.txt']);
  } catch (err) {
    console.error(err);
    send(res, 500, DEV ? `<pre>${escapeHtml(err.stack)}</pre>` : 'Server error', MIME['.html']);
  }
});

server.listen(PORT, () => {
  console.log(`\n  Blackwater Capital — running at http://localhost:${PORT}\n`);
});
