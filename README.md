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

Restrained by design: slow reveals on scroll, a drifting hero waterline, a wireframe globe, and
underline transitions. Everything is suppressed under `prefers-reduced-motion`. Content is never
left invisible — if `IntersectionObserver` is unavailable or never reports, `site.js` reveals
everything unconditionally.

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

Checked before release:

- All 9 pages, 6 articles, `/robots.txt`, `/sitemap.xml` and the 404 route return correct status codes
- Every internal link and asset reference on every page resolves `200`; every in-page anchor has a target
- No horizontal overflow at 320, 375, 414, 768, 1024, 1280 and 1600 px
- Text contrast verified against real rendered backdrops — lowest measured ratio 7.9:1
- One `h1` per page, no heading-level jumps, every image has `alt` and intrinsic dimensions,
  every form control has a label, every link and button has an accessible name
- Skip link is the first tab stop, no positive `tabindex`, focus is trapped in the open mobile drawer
  and Escape closes it
- Enquiry API: rejects empty, malformed, oversized, honeypot and rate-limited submissions;
  accepts and stores valid ones
- Path traversal attempts return 404
- No console errors or broken subresources on any page

---

## Legal

Blackwater Capital is a proposed investment and asset management brand. Information presented on
this website is for general informational purposes only and does not constitute investment
advice, an offer, a recommendation, or a solicitation to buy or sell any financial product or
service.
