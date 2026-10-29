/**
 * sceneAt(t) — the entire "One Light on Black Water" camera move as a pure function.
 *
 * t is global scroll progress, 0 at the top of the hero and 1 at the end of the final
 * call to action. Nothing here touches the DOM, reads globals or depends on time, so the
 * whole visual score can be tested in Node without a browser.
 *
 * Returns screen-space description only: the renderer projects nothing itself.
 *   horizon   0..1   screen y of the horizon (0 top, 1 bottom)
 *   scale     >0     perspective scale — small is a low camera, large is high altitude
 *   rough     0..1   chop on the water
 *   sub       0..1   blend to the fully submerged render
 *   split     0..1   waterline split mode (frame cut in half at the meniscus)
 *   dawn      0..1   night to first light
 *   curve     0..1   horizon curvature, flat to sphere
 *   boat      {x,y,scale,alpha}
 *   lights    [{x,y,i,r}]  up to 7, screen space, i is intensity
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BWScene = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /** Sections in scroll order, each owning a slice of t. */
  var ACTS = [
    { name: 'hero', start: 0.0, end: 0.12 },
    { name: 'philosophy', start: 0.12, end: 0.28 },
    { name: 'strategies', start: 0.28, end: 0.45 },
    { name: 'approach', start: 0.45, end: 0.58 },
    { name: 'process', start: 0.58, end: 0.72 },
    { name: 'global', start: 0.72, end: 0.85 },
    { name: 'insights', start: 0.85, end: 0.95 },
    { name: 'cta', start: 0.95, end: 1.0 }
  ];

  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var smooth = function (e0, e1, x) {
    if (e1 === e0) return x < e0 ? 0 : 1;
    var u = clamp((x - e0) / (e1 - e0), 0, 1);
    return u * u * (3 - 2 * u);
  };
  var mix = function (a, b, u) { return a + (b - a) * u; };

  /** Keyframe track: [[t, value], ...] ascending in t, eased between stops. */
  function track(kf) {
    return function (t) {
      if (t <= kf[0][0]) return kf[0][1];
      var last = kf[kf.length - 1];
      if (t >= last[0]) return last[1];
      for (var i = 0; i < kf.length - 1; i++) {
        if (t >= kf[i][0] && t <= kf[i + 1][0]) {
          return mix(kf[i][1], kf[i + 1][1], smooth(kf[i][0], kf[i + 1][0], t));
        }
      }
      return last[1];
    };
  }

  /** 0 before a, 1 across [b,c], 0 after d. */
  function bump(t, a, b, c, d) {
    return smooth(a, b, t) * (1 - smooth(c, d, t));
  }

  // --- the score -----------------------------------------------------------

  var HORIZON = track([
    [0.00, 0.455], // hero: water level, intimate — most of the frame is water
    [0.12, 0.44],
    [0.28, 0.285], // philosophy: lifted and drawn back, looking down on the expanse
    [0.40, 0.315],
    [0.45, 0.40],
    [0.50, 0.50], // approach: dead centre, the frame cut in half
    [0.555, 0.50],
    [0.638, 0.17], // process: submerged, the surface recedes to the top of frame
    [0.72, 0.13],
    [0.80, 0.235], // global: fast ascent, the horizon starts to bend
    [0.85, 0.25],
    [0.95, 0.335],
    [1.00, 0.40] // cta: horizon back toward centre so the dawn band reads
  ]);

  var SCALE = track([
    [0.00, 0.052], // low camera: large, close swell
    [0.12, 0.062],
    [0.28, 0.30], // altitude: waves compress, the water reads as vast
    [0.45, 0.26],
    [0.50, 0.048], // back down to the waterline
    [0.58, 0.06],
    [0.72, 0.09],
    [0.82, 0.95], // high altitude
    [0.88, 0.80],
    [1.00, 0.34]
  ]);

  var ROUGH = track([
    [0.00, 0.88], // heavy, slow swell
    [0.14, 0.72],
    [0.26, 0.16], // flattening toward glass — stillness as the argument for clarity
    [0.40, 0.22],
    [0.50, 0.46],
    [0.62, 0.30],
    [0.78, 0.18],
    [1.00, 0.32]
  ]);

  var SUB = track([
    [0.50, 0.0],
    [0.575, 0.0],
    [0.60, 0.35],
    [0.645, 1.0],
    [0.735, 1.0],
    [0.780, 0.0]
  ]);

  var SPLIT = track([
    [0.45, 0.0],
    [0.495, 1.0],
    [0.555, 1.0],
    [0.596, 0.0]
  ]);

  var DAWN = track([
    [0.00, 0.0],
    [0.88, 0.0],
    [0.93, 0.18],
    [0.97, 0.55],
    [1.00, 1.0]
  ]);

  var CURVE = track([
    [0.72, 0.0],
    [0.80, 0.55],
    [0.85, 1.0],
    [0.92, 0.35],
    [1.00, 0.0]
  ]);

  var BOAT_SCALE = track([
    [0.00, 0.095], // close enough to read as a vessel
    [0.12, 0.078],
    [0.28, 0.021], // tiny against the expanse
    [0.45, 0.019],
    [0.50, 0.044],
    [0.58, 0.030],
    [0.63, 0.0], // gone once we are under
    [0.93, 0.0],
    [1.00, 0.042] // returns at dawn
  ]);

  var LAMP = track([
    [0.00, 1.0],
    [0.16, 0.90],
    [0.28, 0.50], // far off: a distant lamp is dimmer, and must not wash the copy
    [0.45, 0.50],
    [0.52, 1.00],
    [0.60, 0.55],
    [0.645, 0.0],
    [0.93, 0.0],
    [1.00, 0.9]
  ]);

  /* Glow radius follows distance: tight at altitude, open when we are close. */
  var LAMP_R = track([
    [0.00, 1.35],
    [0.20, 1.00],
    [0.28, 0.60],
    [0.46, 0.60],
    [0.52, 1.25],
    [0.62, 1.10],
    [0.95, 1.00],
    [1.00, 1.15]
  ]);

  /** Headings the four strategy lights take, in screen-x offset per unit weight. */
  var STRATEGY_SPREAD = [-0.26, -0.085, 0.105, 0.275];
  var STRATEGY_LIFT = [0.016, 0.004, 0.008, 0.02];

  function sceneAt(tRaw) {
    var t = clamp(tRaw, 0, 1);

    var horizon = HORIZON(t);
    var sub = SUB(t);
    var split = SPLIT(t);
    var boatScale = BOAT_SCALE(t);

    // The boat sits on the waterline and drifts very slightly off centre as the
    // camera rises, so the composition never feels mechanically centred.
    // Drifts right as the camera rises, then swings left during the approach act
    // so the vessel sits inside the editorial aperture rather than behind copy.
    var boatX = 0.53 + 0.055 * smooth(0.12, 0.45, t)
      - 0.27 * bump(t, 0.45, 0.503, 0.553, 0.605)
      - 0.012 * smooth(0.9, 1.0, t);
    var boat = {
      x: boatX,
      y: horizon + boatScale * 0.22,
      scale: boatScale,
      alpha: boatScale > 0.0005 ? 1 - sub : 0
    };

    var lights = [];

    // Slot 0 — the lamp. The only warm element anywhere on the site.
    lights.push({ x: boat.x, y: horizon - boatScale * 0.30, i: LAMP(t), r: LAMP_R(t) });

    var wStrat = bump(t, 0.285, 0.345, 0.465, 0.515);
    var wDesc = bump(t, 0.578, 0.652, 0.730, 0.775);
    var wPort = bump(t, 0.742, 0.80, 0.862, 0.90);

    for (var k = 1; k <= 6; k++) {
      var modes = [];

      // Strategies: the single lamp separates into four, each on its own heading.
      if (k <= 3) {
        var si = k; // slots 1..3 are the three lights that leave the boat
        modes.push({
          w: wStrat,
          x: boat.x + STRATEGY_SPREAD[si] * wStrat,
          y: horizon - boatScale * 0.3 + STRATEGY_LIFT[si] * wStrat,
          i: wStrat * 0.9,
          r: 1.05
        });
      }

      // Process: five lights descending in sequence, one per research stage.
      if (k <= 5) {
        var stage = k - 1; // 0..4 ignite in order as their stage scrolls in
        var lit = smooth(0.598 + stage * 0.020, 0.653 + stage * 0.020, t);
        // Kept to the right of frame, clear of the five stage descriptions.
        modes.push({
          w: wDesc * lit,
          x: 0.68 + 0.115 * Math.sin(stage * 1.9),
          y: 0.165 + stage * 0.138,
          i: wDesc * lit * 1.05,
          r: mix(1.35, 0.78, stage / 4)
        });
      }

      // Global: the lights are now distant ports on a curving horizon.
      var pa = (k - 1) / 6;
      modes.push({
        w: wPort,
        x: 0.085 + pa * 0.83 + 0.03 * Math.sin(k * 1.7),
        y: horizon + 0.004 + 0.012 * Math.sin(k * 2.3 + 1.1),
        i: wPort * (0.34 + 0.2 * Math.sin(k * 1.3)),
        r: 0.42
      });

      var dom = modes[0];
      var sum = 0;
      for (var m = 0; m < modes.length; m++) {
        sum += modes[m].i;
        if (modes[m].w > dom.w) dom = modes[m];
      }
      lights.push({ x: dom.x, y: dom.y, i: clamp(sum, 0, 1.2), r: dom.r });
    }

    return {
      t: t,
      act: actAt(t),
      horizon: horizon,
      scale: SCALE(t),
      rough: ROUGH(t),
      sub: sub,
      split: split,
      dawn: DAWN(t),
      curve: CURVE(t),
      boat: boat,
      lights: lights
    };
  }

  function actAt(t) {
    for (var i = 0; i < ACTS.length; i++) {
      if (t >= ACTS[i].start && t <= ACTS[i].end) return ACTS[i].name;
    }
    return t < 0.5 ? ACTS[0].name : ACTS[ACTS.length - 1].name;
  }

  /** Map a named act plus 0..1 local progress onto global t. */
  function tForAct(name, local) {
    for (var i = 0; i < ACTS.length; i++) {
      if (ACTS[i].name === name) {
        return ACTS[i].start + clamp(local, 0, 1) * (ACTS[i].end - ACTS[i].start);
      }
    }
    return 0;
  }

  return { sceneAt: sceneAt, tForAct: tForAct, ACTS: ACTS, _clamp: clamp, _smooth: smooth };
});
