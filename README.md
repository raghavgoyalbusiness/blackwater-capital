# Blackwater Capital

Website for **Blackwater Capital**, a proposed investment and asset management brand.

Seven pages, server-rendered, zero runtime dependencies. Built to feel like a private
investment firm managing long-term capital: restrained palette, editorial typography,
generous whitespace, understated motion.

> **Status.** Blackwater Capital is a *proposed* brand. The site deliberately contains no
> invented assets under management, performance figures, clients, offices, regulatory status,
> founding date, team members or track record. Anywhere a factual business detail belongs, the
> page shows a visible `[to be confirmed]` placeholder.

---

## Run

```bash
node server.js
```

Then open <http://localhost:5183>. Set `PORT` to use a different port and `SITE_ORIGIN` to the
public origin in production (it drives canonical URLs, Open Graph tags and the sitemap).

```bash
PORT=8080 SITE_ORIGIN=https://blackwatercapital.com NODE_ENV=production node server.js
```

`NODE_ENV=production` turns on template and content caching plus long-lived asset caching.
In development every request re-reads from disk, so edits appear on refresh.

Requires Node 18+. No install step, no build step, no dependencies.

---

## Structure

```
server.js              HTTP server, routing, templating, insights rendering, enquiry API
content/insights.json  All editorial content — the CMS seam
site/
  layouts/base.html    Document shell: <head>, meta, JSON-LD, slots
  partials/            header, footer, cookie banner
  pages/               One file per route, each with a JSON meta header
public/assets/
  css/site.css         The whole design system
  js/                  site.js (shared) + per-page modules
  img/                 Brand assets derived from the supplied logo
data/                  Submitted enquiries (git-ignored, created on first submission)
```

### Pages

| Route | Page |
| --- | --- |
| `/` | Home |
| `/firm` | The Firm |
| `/strategies` | Investment Strategies |
| `/insights` | Insights index (filterable) |
| `/insights/:slug` | Article |
| `/team` | Our Team |
| `/contact` | Contact |
| `/legal`, `/privacy`, `/terms` | Legal and Disclosures, Privacy Policy, Terms of Use |

Plus `/robots.txt` and `/sitemap.xml`, both generated from the same route table and content file.

---

## Templating

Pages are composed on the server so every route ships complete HTML — good for SEO, and the site
works with JavaScript disabled.

Each page file starts with a JSON metadata header:

```html
<!--meta {
  "title": "The Firm — Blackwater Capital",
  "description": "…",
  "path": "/firm",
  "nav": "firm",
  "heroTheme": "dark",
  "scripts": ["contact"]
} -->
```

`{{> header}}` includes a partial. `{{TOKEN}}` fills a slot. The page body is filled before it is
placed into the layout, so content injected through `{{CONTENT}}` can carry tokens of its own.

`heroTheme: "dark"` tells the navigation it is sitting over a dark hero, so it renders in
off-white with the knockout logo until the user scrolls.

---

## Insights as a CMS

`content/insights.json` is the only place editorial content lives. Add an object to `articles`
and the article page, the index, the filters, the home page preview, the related-articles rail
and the sitemap all pick it up — no code changes.

Article bodies are ordered blocks:

| Block | Renders |
| --- | --- |
| `p`, `h2`, `h3` | Prose. `h2`s also build the sticky table of contents. |
| `quote` | Pull quote with optional attribution |
| `list` | Prose list |
| `figure` | Abstract plate image with caption |
| `diagram` | Illustrative schematic (`risk-return`, `capital-structure`, `cycle`) |
| `note` | Set-aside note |

To move to a hosted CMS, replace `loadInsights()` in `server.js` with a fetch that returns the
same shape. Nothing else changes.

**Diagrams carry no data.** Each schematic is conceptual, captioned as illustrative, and depicts
no market, index, portfolio or result.

---

## Enquiry form

`POST /api/enquiry` validates on the server — the client-side rules in `contact.js` mirror it but
are only a convenience. The form works without JavaScript.

- Required: name, work email, enquiry type, message (20–4,000 chars), consent
- Honeypot field plus a rate limit of 8 submissions per IP per 10 minutes
- Request bodies capped at 64 KB
- Valid submissions are appended to `data/enquiries.jsonl` and return a reference like `BWC-4F2A91C0`

`data/` is git-ignored. To deliver enquiries somewhere real (email, CRM, webhook), extend the
handler at the `fs.appendFileSync` call.

---

## Design system

Everything lives in `public/assets/css/site.css`, organised in twelve numbered sections.

| Token | Value |
| --- | --- |
| Near-black | `#090B0D` |
| Charcoal | `#171A1E` |
| Slate grey | `#66717D` |
| Off-white | `#F5F4F0` |
| White | `#FFFFFF` |
| Deep navy accent | `#07172E` |

Two derived tokens keep body text accessible on each ground: `--slate-ink` (`#5A646F`) on
off-white and `--slate-light` (`#9BA5B1`) on near-black. The palette's own slate does not reach
4.5:1 on near-black, so it is used for rules and marks rather than for text.

Type is **Newsreader** for headings and **Inter** for body, navigation and data, loaded
asynchronously with a system-serif and system-sans fallback so text renders immediately.

### Imagery

There is no stock photography. The abstract visuals — dark water, stone, architecture,
coastline, geometry, depth, network — are generated in CSS as layered gradients (`.plate--*`),
so they are original, weightless and infinitely scalable. Swap any `.plate` for an `<img>` if
you later license photography.

### Motion

Restrained by design: slow reveals on scroll, a drifting hero waterline, and underline
transitions. Everything is suppressed under `prefers-reduced-motion`. Content is never left
invisible — if `IntersectionObserver` is unavailable or never reports, `site.js` reveals
everything unconditionally.

---

## The scene — "One Light on Black Water"

The homepage is one continuous shot: a small boat carrying a single light, alone on black
water. Scrolling moves a camera through that one scene rather than cross-fading between
backgrounds. The lamp is the only warm element anywhere on the site.

| Section | Camera |
| --- | --- |
| Hero | Water level, close. One boat, one lamp pooling light on the swell. |
| Philosophy | Lifts and draws back; the boat shrinks, the water flattens toward glass. |
| Strategies | The single lamp separates into four, each taking its own heading. |
| Approach | Drops to the waterline — the frame is cut in half at the meniscus. |
| Process | Fully submerged. Five lights descend in sequence, one per research stage. |
| Global | Fast ascent; the horizon curves and the lights become distant ports. |
| Insights → CTA | Dawn. The boat returns, heading toward first light. |

Two files, no 3D library:

- **`public/assets/js/scene/scene-at.js`** — `sceneAt(t)` is the entire score as a pure
  function of scroll progress. No DOM, no globals, no time. It returns screen-space values
  only (horizon, perspective scale, roughness, submersion, dawn, curvature, boat, lights), so
  the whole camera move is unit-testable in Node. `scripts/test-scene.js` covers it, including
  a continuity check — the brief asks for one unbroken move, so a discontinuity in the score
  *is* a visible cut.
- **`public/assets/js/scene/scene.js`** — one fixed canvas drawn by a single full-screen
  fragment shader. The water is an analytically projected infinite plane, the boat an SDF, the
  lights screen space. WebGL1-compatible GLSL, so it runs on either context.

`t` is derived from which section owns the viewport centre, not from raw document progress, so
each act stays locked to its own content at any viewport height.

**It is an enhancement, and degrades in three stages.** No WebGL, reduced motion, or a frame
rate the machine cannot hold, and the canvas is never added (or is torn down) and the page
falls back to the static `.plate--*` backgrounds it shipped with. With JavaScript off entirely
the homepage is complete and correctly contrasted. `?scene=force` disables the frame-rate guard
for testing on software GL.

### Working on it

Tune the camera by editing the keyframe tracks at the top of `scene-at.js` — they read as a
storyboard. Then:

```bash
npm test                              # the score: ranges, beats, continuity
npm run frames                        # one PNG per act, to review as a storyboard
npm run verify:contrast               # glyph-accurate contrast over the live scene
```

Text legibility over a moving ground is bought with the `[data-scrim]` gradients in section 13
of the stylesheet, and is verified against rendered pixels rather than assumed.

---

## Brand assets

`public/assets/img/` is derived from the supplied logo by `scripts/make-brand-assets.py`, which
reads and writes PNGs using only the Python standard library. It trims the artwork, splits the
monogram from the wordmark, knocks the paper out to transparency while reconstructing the ink
colour, and emits an off-white version for dark backgrounds.

```bash
python3 scripts/make-brand-assets.py path/to/logo.png public/assets/img
python3 scripts/make-og-image.py public/assets/img     # 1200×630 share image
```

---

## Verification

```bash
node server.js &        # the checks run against a live server
npm run verify
```

Four scripts, all dependency-free, driving Chrome over the DevTools protocol where a browser
is needed (`scripts/cdp.js` is a ~140-line CDP client; there is no Puppeteer).

**`test-scene.js`** — the camera score, in Node, no browser. Ranges, finiteness, the narrative
beats, and continuity: every parameter is sampled 2,000 times and may not step more than a
hair between adjacent samples, because a discontinuity in the score is a cut on the page.

**`verify-pages.js`** — every route's status, title and meta-description length, canonical,
`lang`, viewport, Open Graph, JSON-LD validity, one `h1` with no heading-level jumps, `alt`
and intrinsic dimensions on images, a label for every form control, accessible names on links
and buttons, `rel="noopener"`, unresolved template tokens, the footer disclosure, skip link and
landmarks — plus a link check that fetches every internal `href`/`src` and every in-page anchor.

**`verify-contrast.js`** — the one that matters for a moving background. Design tokens cannot
answer it, so the script hides the glyphs, screenshots what is actually behind them, and gates
on the *worst* pixel in each text run; the mean passes while a headline sits over the lamp.
It measures glyph runs rather than element boxes (an element box includes padding, borders and
pseudo-element decoration the text is never drawn on), excludes the strip occluded by the fixed
nav, and samples four scroll positions per act. `NO_WEBGL=1` runs the identical sweep against
the CSS-plate fallback.

**`verify-fallback.js`** — boots with `--disable-3d-apis` and asserts the scene is absent, the
plates render and nothing is left transparent; measures sustained frame rate on a real GPU;
emulates `prefers-reduced-motion` and proves the frame is byte-identical a second later; and
sweeps 80 page/width combinations for horizontal overflow.

Last full run:

- 15 routes + sitemap, robots and the 404 path — all correct; every link and anchor resolves
- 634 glyph runs per viewport swept across all 8 acts at 390, 768, 1024, 1440 and 1920 px —
  every one clears AA against the worst pixel behind it, with the scene live and on the fallback
- 61 fps sustained, Metal renderer; one static frame under reduced motion
- No horizontal overflow in 80 page/width combinations
- No console errors, page exceptions or broken subresources
- Enquiry API rejects empty, malformed, oversized, honeypot and rate-limited submissions;
  accepts and stores valid ones. Path traversal returns 404.

---

## Legal

Blackwater Capital is a proposed investment and asset management brand. Information presented on
this website is for general informational purposes only and does not constitute investment
advice, an offer, a recommendation, or a solicitation to buy or sell any financial product or
service.
