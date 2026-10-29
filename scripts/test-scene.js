#!/usr/bin/env node
/**
 * Tests for the scene score. Runs in plain Node — no browser, no DOM, no WebGL.
 *
 *   node scripts/test-scene.js
 *
 * The continuity test is the important one: the brief asks for one unbroken camera
 * move, so any discontinuity in the score is a visible cut on the page.
 */
'use strict';

const path = require('path');
const { sceneAt, tForAct, ACTS } = require(path.join(__dirname, '..', 'public', 'assets', 'js', 'scene', 'scene-at.js'));

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; return; }
  failures.push(detail ? `${name} — ${detail}` : name);
}

/* ---------------------------------------------------------------- sampling */

const N = 2000;
const samples = [];
for (let i = 0; i <= N; i++) samples.push(sceneAt(i / N));

/* ------------------------------------------------------------- basic shape */

check('clamps below 0', sceneAt(-5).t === 0);
check('clamps above 1', sceneAt(99).t === 1);
check('handles exactly 0 and 1', Number.isFinite(sceneAt(0).horizon) && Number.isFinite(sceneAt(1).horizon));

const ranges = {
  horizon: [0, 1], scale: [0.001, 3], rough: [0, 1],
  sub: [0, 1], split: [0, 1], dawn: [0, 1], curve: [0, 1]
};
for (const [key, [lo, hi]] of Object.entries(ranges)) {
  const bad = samples.find((s) => !(Number.isFinite(s[key]) && s[key] >= lo && s[key] <= hi));
  check(`${key} stays finite within [${lo}, ${hi}]`, !bad, bad && `${key}=${bad[key]} at t=${bad.t.toFixed(4)}`);
}

const badLight = samples.find((s) =>
  s.lights.length > 7 ||
  s.lights.some((L) => ![L.x, L.y, L.i, L.r].every(Number.isFinite) || L.i < 0 || L.i > 1.2 || L.r <= 0));
check('lights: at most 7, all finite, intensity within [0, 1.2]', !badLight,
  badLight && `at t=${badLight.t.toFixed(4)}`);

const badBoat = samples.find((s) =>
  ![s.boat.x, s.boat.y, s.boat.scale, s.boat.alpha].every(Number.isFinite) ||
  s.boat.scale < 0 || s.boat.alpha < 0 || s.boat.alpha > 1);
check('boat stays finite with sane scale and alpha', !badBoat, badBoat && `at t=${badBoat.t.toFixed(4)}`);

/* -------------------------------------------------------------- continuity */
// One camera, one move: no parameter may jump between adjacent scroll samples.
const limits = { horizon: 0.004, scale: 0.02, rough: 0.01, sub: 0.02, split: 0.02, dawn: 0.02, curve: 0.02 };
for (const [key, limit] of Object.entries(limits)) {
  let worst = 0, at = 0;
  for (let i = 1; i < samples.length; i++) {
    const d = Math.abs(samples[i][key] - samples[i - 1][key]);
    if (d > worst) { worst = d; at = samples[i].t; }
  }
  check(`${key} is continuous (no cut)`, worst <= limit,
    `max step ${worst.toFixed(5)} > ${limit} near t=${at.toFixed(4)}`);
}

let worstBoat = 0, boatAt = 0;
for (let i = 1; i < samples.length; i++) {
  const d = Math.abs(samples[i].boat.scale - samples[i - 1].boat.scale);
  if (d > worstBoat) { worstBoat = d; boatAt = samples[i].t; }
}
check('boat scale is continuous', worstBoat <= 0.004, `max step ${worstBoat.toFixed(5)} near t=${boatAt.toFixed(4)}`);

let worstBoatX = 0, boatXAt = 0;
for (let i = 1; i < samples.length; i++) {
  const d = Math.abs(samples[i].boat.x - samples[i - 1].boat.x);
  if (d > worstBoatX) { worstBoatX = d; boatXAt = samples[i].t; }
}
check('boat does not jump across frame', worstBoatX <= 0.006,
  `max step ${worstBoatX.toFixed(5)} near t=${boatXAt.toFixed(4)}`);

let worstLight = 0, lightAt = 0;
for (let i = 1; i < samples.length; i++) {
  for (let k = 0; k < 7; k++) {
    const a = samples[i - 1].lights[k], b = samples[i].lights[k];
    if (!a || !b) continue;
    const d = Math.abs(b.i - a.i);
    if (d > worstLight) { worstLight = d; lightAt = samples[i].t; }
  }
}
// A real cut would be a step of ~1.0; this bound is two orders below that and
// still well under what reads as a flicker at typical scroll speeds.
check('light intensities are continuous', worstLight <= 0.028,
  `max step ${worstLight.toFixed(5)} near t=${lightAt.toFixed(4)}`);

/* ------------------------------------------------------------------- score */

check('acts tile [0,1] with no gap or overlap',
  ACTS[0].start === 0 && ACTS[ACTS.length - 1].end === 1 &&
  ACTS.every((a, i) => i === 0 || a.start === ACTS[i - 1].end));

check('tForAct maps the start of each act', ACTS.every((a) => tForAct(a.name, 0) === a.start));
check('tForAct maps the end of each act', ACTS.every((a) => tForAct(a.name, 1) === a.end));
check('tForAct clamps out-of-range progress', tForAct('hero', -3) === 0 && tForAct('hero', 7) === ACTS[0].end);
check('unknown act name does not throw', tForAct('nope', 0.5) === 0);

// the narrative beats the brief specifies
const at = (t) => sceneAt(t);
check('hero: the lamp is lit', at(0.05).lights[0].i > 0.8);
check('hero: the boat is the largest it ever is',
  at(0).boat.scale >= Math.max(...samples.map((s) => s.boat.scale)) - 1e-9);
check('philosophy: water flattens toward glass', at(0.22).rough < at(0.03).rough * 0.45);
check('philosophy: the boat shrinks against the expanse', at(0.26).boat.scale < at(0.03).boat.scale * 0.5);
check('strategies: the single lamp becomes four lights',
  at(0.37).lights.filter((L) => L.i > 0.25).length >= 4);
check('strategies: the four take different headings',
  new Set(at(0.37).lights.slice(0, 4).map((L) => L.x.toFixed(3))).size === 4);
check('approach: the frame is cut at the waterline', at(0.52).split > 0.95);
check('approach: the horizon sits at centre frame', Math.abs(at(0.52).horizon - 0.5) < 0.02);
check('approach: the vessel moves into the left aperture', at(0.527).boat.x < 0.33);
check('process: the descending lights stay clear of the stage copy',
  at(0.73).lights.filter((L) => L.i > 0.2).every((L) => L.x > 0.55));
check('process: fully submerged', at(0.68).sub > 0.95);
check('process: the boat is not drawn underwater', at(0.68).boat.alpha < 0.05);
check('process: five lights descend', at(0.73).lights.filter((L) => L.i > 0.2).length >= 5);
check('process: they ignite in sequence, not together',
  at(0.62).lights.filter((L) => L.i > 0.2).length < at(0.73).lights.filter((L) => L.i > 0.2).length);
check('global: altitude is at its highest', at(0.82).scale >= Math.max(...samples.map((s) => s.scale)) - 1e-9);
check('global: the horizon curves', at(0.85).curve > 0.95);
check('global: back above the surface', at(0.82).sub < 0.05);
check('cta: dawn arrives only at the very end', at(0.85).dawn === 0 && at(1).dawn > 0.95);
check('cta: the boat returns', at(1).boat.scale > 0.02 && at(1).boat.alpha > 0.9);
check('cta: the horizon is flat again', at(1).curve < 0.05);

// never underwater and split at the same time — they are different treatments
check('sub and split are never both fully on',
  !samples.some((s) => s.sub > 0.5 && s.split > 0.5));

/* ------------------------------------------------------------------ report */

console.log(`\n  scene score: ${pass} passed, ${failures.length} failed\n`);
if (failures.length) {
  failures.forEach((f) => console.log('  ✗ ' + f));
  console.log('');
  process.exit(1);
}
console.log('  ✓ one unbroken camera move, all beats present\n');
