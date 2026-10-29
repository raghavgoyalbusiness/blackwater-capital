# Prompt — "One Light on Black Water"

Copy everything below the line into a fresh coding session pointed at this repo.

---

## The task

Rebuild the homepage experience of the Blackwater Capital site at
`~/Downloads/blackwater-capital` around a single continuous scene: **a small boat carrying one
light, alone in the middle of black water.** The whole page is one camera move through that
scene. Scrolling doesn't reveal new backgrounds — it moves through one.

The existing site is good but static: eight sections, each with its own CSS-gradient "plate".
Replace that with one persistent canvas behind all content, and let scroll position drive it.

Keep the brand exactly as it is. Palette `#090B0D` / `#171A1E` / `#66717D` / `#F5F4F0` /
`#FFFFFF` / `#07172E`. Newsreader for headings, Inter for everything else. The firm is
discreet, institutional, long-term — this must feel like a held breath, never like a showreel.

### Why a boat

Don't treat it as decoration. A single lit vessel on dark water *is* the thesis: one light,
far from shore, steady through conditions it didn't choose. The one warm element on the entire
site is that lamp — everything else stays in the cold palette. Never explain the metaphor in
copy. Let it sit there.

## The scroll score

The homepage already has eight sections in this order. Give each a `data-scene` attribute and
map global scroll progress `t` (0→1) onto one continuous camera path:

| `t` | Section | Camera and scene |
| --- | --- | --- |
| 0.00–0.12 | `hero` | Night. Camera almost at water level, close. One boat, one lamp. The lamp pools a small circle of light on the swell — the only warm colour on the page. Slow, heavy water. |
| 0.12–0.28 | `philosophy` | Camera lifts and draws back. The boat shrinks against the expanse. Water flattens toward glass. Stillness as the argument for clarity. |
| 0.28–0.45 | `strategies` | The single lamp separates into **four** lights, each taking a different heading, each cutting its own wake. Four strategies, one origin. |
| 0.45–0.58 | `approach` | Camera drops to the waterline so the frame is cut in half — half above, half below. The split-screen layout becomes literal. Hull and stone below, sky above. |
| 0.58–0.72 | `process` | Fully submerged. Dark, quiet, pressured. Five lights descend in sequence, one per research stage, each igniting as its stage scrolls in. What happens under the surface. |
| 0.72–0.85 | `global` | Fast ascent. The horizon curves; water becomes the dark face of a sphere. The lights are now distant ports. Replace the existing wireframe globe with this moment. |
| 0.85–0.95 | `insights` | Altitude holds. Light lifts just enough to read comfortably. |
| 0.95–1.00 | `cta` | Dawn. A narrow navy-to-pale band on the horizon. The boat returns to frame, heading toward it. Land the final line on first light. |

Transitions between acts must be continuous — never a cut, never a cross-fade between two
backgrounds. One camera, one move, start to finish.

## How to build it

- **One `<canvas>`**, `position: fixed; inset: 0; z-index: 0; pointer-events: none;`
  `aria-hidden="true"`. All page content sits above it. No per-section backgrounds.
- **Pure scene function.** `sceneAt(t)` returns `{ cameraY, pitch, dolly, lightCount,
  waterRoughness, submersion, horizonGlow, warmth }` and nothing else — no DOM reads, no
  globals. Everything visual is derived from it, so it is unit-testable without a browser.
  Write those tests.
- **WebGL via Three.js**, pinned to an exact version. A displaced plane with a custom water
  shader is enough — do not reach for a physics or ocean library.
- **The current CSS plates become the fallback, not dead code.** If WebGL is unavailable, the
  user prefers reduced motion, or measured FPS sits below ~24 for two seconds, tear the canvas
  down and let the existing `.plate--*` backgrounds render exactly as they do today. The site
  must be complete and beautiful with zero JavaScript.
- **Budget:** ≤ 200 KB gzipped added JS. Cap `devicePixelRatio` at 1.5. Pause `requestAnimationFrame`
  when the tab is hidden. Don't let the canvas touch LCP — the hero headline paints first.

## Hard constraints — this build was verified, don't regress it

- No horizontal overflow at 320, 375, 414, 768, 1024, 1280, 1600.
- Lowest text contrast currently measured is **7.9:1**. Every text block must stay ≥ 4.5:1
  against *the pixels actually rendered behind it*. Add scrims where the scene brightens.
- One `h1` per page, no heading-level jumps, all images keep `alt` + intrinsic dimensions,
  every control labelled, skip link stays the first tab stop.
- `prefers-reduced-motion` renders exactly one static frame and unbinds scroll entirely.
- Don't touch `server.js` templating, the enquiry API, or `content/insights.json`.
- The reveal fail-safe in `site.js` stays: if `IntersectionObserver` never delivers, content
  shows unconditionally. Never allow a state where text sits at `opacity: 0` permanently.

## Traps that will cost you hours — handle these deliberately

1. **Never animate text opacity on a scroll timeline.** Scroll-driven opacity is
   position-driven, so mid-scroll a heading sits at 0.4 and fails contrast at rest, where it's
   legible at both ends. Animate `transform` only.
2. **`position: sticky` creates a stacking context.** A fixed canvas plus sticky sections will
   trap text underneath it. Split any pinned stage into two sticky layers rather than nesting.
3. **`overflow-x: hidden` on `body` silently kills `sticky`.** If a grid child blows out the
   width, fix it with `minmax(0, 1fr)` — don't reach for `overflow` as the cure.
4. **Verify contrast against real pixels, not tokens.** Hide the text, screenshot the canvas,
   and gate on the *worst* pixel inside each text bounding box — the mean will pass while a
   headline sits over the lamp glow and fails.
5. **Three.js fails silently.** Wrong triangle winding, an object behind the camera, or a ref
   read before effects run all render nothing and log nothing. When the screen is black, check
   those three before the shader.
6. **Probe WebGL support in a Worker via `OffscreenCanvas`.** A main-thread probe context costs
   roughly 200 ms and will show up as a stall on first paint.
7. **If you precompile shaders, compile against the actual render target.** Compiling against
   the default target while rendering to a post-processing buffer recompiles everything on
   frame one.
8. **Headless/software GL runs at 1–3 fps.** Don't wait on wall-clock time in tests — freeze
   the clock, step frames deterministically, and sample state in-page.

## Done when

- Scrolling the homepage top to bottom reads as one unbroken camera move through one scene.
- The lamp is the only warm element on the site.
- Disabling JavaScript, or forcing reduced motion, still gives a complete, elegant, correctly
  contrasted page.
- A contrast sweep over rendered pixels reports nothing below 4.5:1 at any scroll position.
- 60 fps on desktop, no overflow at any width, no console errors, and `sceneAt()` is covered
  by tests that run without a browser.

Show me a side-by-side of the hero before and after, and three frames from the middle of the
scroll, before you commit anything.
