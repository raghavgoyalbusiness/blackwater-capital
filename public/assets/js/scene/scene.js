/**
 * "One Light on Black Water" — the homepage scene.
 *
 * One fixed canvas behind all content, drawn by a single full-screen fragment shader.
 * No 3D library: the water is an analytically projected infinite plane, the boat is an
 * SDF, and the lights are screen space. Scroll drives sceneAt(t); nothing else does.
 *
 * Progressive enhancement throughout. If WebGL is missing, the user prefers reduced
 * motion, or we cannot hold a frame rate, the canvas is torn down and the page falls
 * back to the static CSS plates it shipped with.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var host = document.querySelector('[data-scene-host]');
  if (!host || !window.BWScene) return;

  var sceneAt = window.BWScene.sceneAt;
  var tForAct = window.BWScene.tForAct;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var MAX_LIGHTS = 7;
  // ?scene=force keeps the scene up on software GL, where the frame-rate guard
  // would otherwise correctly tear it down. Verification only.
  var FORCE = /[?&]scene=force\b/.test(location.search);

  /* ------------------------------------------------------------------ shader */

  var VERT = [
    'attribute vec2 aPos;',
    'void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform vec2  uRes;',
    'uniform float uTime;',
    'uniform float uHorizon, uScale, uRough, uSub, uSplit, uDawn, uCurve;',
    'uniform vec4  uLights[7];', // x, y, intensity, radius
    'uniform vec4  uBoat;', // x, y, scale, alpha

    'const vec3 BLACK = vec3(0.035,0.043,0.051);',
    'const vec3 NAVY  = vec3(0.027,0.090,0.180);',
    'const vec3 SLATE = vec3(0.400,0.443,0.490);',
    'const vec3 OFFW  = vec3(0.961,0.957,0.941);',
    'const vec3 LAMP  = vec3(1.000,0.806,0.548);', // the only warm colour on the site

    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }',

    // Layered swell. Amplitude rides on uRough so the water can go to glass.
    'float waveH(vec2 p, float rough){',
    '  float h = 0.0;',
    '  h += sin(p.x*0.85 + uTime*0.33) * 0.55;',
    '  h += sin(p.y*1.21 - uTime*0.26 + 1.7) * 0.45;',
    '  h += sin((p.x*0.57 + p.y*0.79) + uTime*0.18) * 0.34;',
    '  h += sin((p.x*2.21 - p.y*1.83) - uTime*0.49) * 0.17 * rough;',
    '  h += sin((p.x*4.07 + p.y*3.31) + uTime*0.71) * 0.085 * rough;',
    '  return h * (0.28 + 0.72*rough);',
    '}',

    /* ---- above the waterline ---- */
    'vec3 renderAbove(vec2 uv, float aspect, float horizon){',
    '  float above = horizon - uv.y;',
    '  float below = uv.y - horizon;',

    // sky: near-black overhead lifting to navy at the horizon, dawn band on top
    '  vec3 top    = BLACK * 0.62;',
    '  vec3 near   = mix(NAVY*0.62, NAVY*1.15, uDawn);',
    '  vec3 col    = mix(near, top, smoothstep(0.0, 0.52, above));',
    '  float band  = exp(-max(above,0.0) * 11.0);',
    '  col = mix(col, mix(vec3(0.34,0.40,0.47), vec3(0.78,0.74,0.70), uDawn*0.55), band * uDawn * 0.85);',

    '  if (below > 0.0) {',
    // infinite plane projection: distance grows as we approach the horizon
    '    float d  = uScale / max(below, 1e-4);',
    '    vec2  wp = vec2((uv.x-0.5) * aspect * d * 2.0, d);',
    '    float fade = smoothstep(0.0, 0.055, below);',
    '    float e = 0.045 + d*0.004;',
    '    float h  = waveH(wp, uRough);',
    '    float hx = waveH(wp + vec2(e,0.0), uRough);',
    '    float hz = waveH(wp + vec2(0.0,e), uRough);',
    '    vec3 n = normalize(vec3(h-hx, 0.55, h-hz));',

    '    vec3 water = mix(NAVY*0.55, BLACK*0.85, smoothstep(0.0,0.42,below));',
    '    water = mix(water*0.9, water + NAVY*0.5, fade);',
    // glancing sheen so the surface reads as liquid even when nearly still
    '    float sheen = pow(max(n.x*0.5 + 0.5, 0.0), 6.0) * fade;',
    '    water += SLATE * sheen * 0.16 * (0.35 + uRough);',
    '    water += OFFW * pow(max(h,0.0), 3.0) * 0.012 * fade * uRough;',
    '    col = water;',

    // each light lays a broken vertical reflection on the swell
    '    for (int i = 0; i < 7; i++) {',
    '      vec4 L = uLights[i];',
    '      if (L.z <= 0.001) continue;',
    '      float dy = uv.y - L.y;',
    '      if (dy <= 0.0) continue;',
    '      float w = 0.0035 + dy * 0.13 * (0.45 + uRough*0.9);',
    '      float dx = (uv.x - L.x) * aspect;',
    '      float lateral = exp(-(dx*dx)/(2.0*w*w));',
    '      float falloff = exp(-dy * 3.0);',
    '      float broken  = 0.38 + 0.62 * smoothstep(-0.35, 0.55, n.x*3.4 + sin(wp.y*1.9 + uTime*0.7));',
    '      col += LAMP * lateral * falloff * broken * L.z * 0.80 * fade;',
    '    }',
    '  }',

    // the lamps themselves: tight core plus a wide, restrained halo
    '  for (int i = 0; i < 7; i++) {',
    '    vec4 L = uLights[i];',
    '    if (L.z <= 0.001) continue;',
    '    vec2 dp = (uv - L.xy) * vec2(aspect, 1.0);',
    '    float r = length(dp) / max(L.w, 0.05);',
    '    col += LAMP * L.z * (0.00022/(r*r + 0.00012) + 0.016*exp(-r*11.0));',
    '  }',
    '  return col;',
    '}',

    /* ---- below the waterline ---- */
    'vec3 renderBelow(vec2 uv, float aspect){',
    '  float depth = clamp(uv.y, 0.0, 1.0);',
    '  vec3 col = mix(vec3(0.038,0.072,0.124), vec3(0.009,0.012,0.017), smoothstep(0.0,0.82,depth));',

    // the underside of the surface, rippling overhead
    '  float ceil = smoothstep(0.26, 0.0, uv.y);',
    '  float rip  = sin(uv.x*26.0 + uTime*0.75) * sin(uv.x*14.5 - uTime*0.43 + 1.2);',
    '  col += vec3(0.075,0.125,0.175) * ceil * (0.5 + 0.3*rip);',

    // suspended particulate, drifting up
    '  vec2 g = floor(uv * vec2(70.0*aspect, 70.0));',
    '  float sp = hash(g);',
    '  if (sp > 0.991) {',
    '    vec2 c = (fract(uv * vec2(70.0*aspect,70.0)) - 0.5);',
    '    float drift = fract(sp*31.0 + uTime*0.018);',
    '    col += vec3(0.26,0.31,0.36) * exp(-dot(c,c)*62.0) * (0.3+0.7*drift) * 0.5;',
    '  }',

    // the descending lights, each with a soft cone beneath it
    '  for (int i = 0; i < 7; i++) {',
    '    vec4 L = uLights[i];',
    '    if (L.z <= 0.001) continue;',
    '    vec2 dp = (uv - L.xy) * vec2(aspect, 1.0);',
    '    float r = length(dp) / max(L.w, 0.05);',
    '    col += LAMP * L.z * (0.00016/(r*r + 0.00022) + 0.022*exp(-r*7.5));',
    '    float dy = uv.y - L.y;',
    '    if (dy > 0.0) {',
    '      float w = 0.012 + dy*0.085;',
    '      float dx = (uv.x - L.x) * aspect;',
    '      col += LAMP * exp(-(dx*dx)/(2.0*w*w)) * exp(-dy*4.2) * L.z * 0.16;',
    '    }',
    '  }',
    '  return col;',
    '}',

    /* ---- the vessel ---- */
    'float sdBoat(vec2 p){',
    '  float hull  = max(length(vec2(p.x, p.y/0.42)) - 1.0, -p.y);',
    '  float cabin = max(abs(p.x + 0.17) - 0.29, max(p.y - 0.02, -0.27 - p.y));',
    '  float mast  = max(abs(p.x - 0.12) - 0.030, max(p.y - 0.02, -1.18 - p.y));',
    '  float boom  = max(abs(p.y + 1.03) - 0.028, abs(p.x - 0.02) - 0.20);',
    '  return min(min(hull, cabin), min(mast, boom));',
    '}',

    'void main(){',
    '  vec2 uv = vec2(gl_FragCoord.x/uRes.x, 1.0 - gl_FragCoord.y/uRes.y);',
    '  float aspect = uRes.x / uRes.y;',

    // curvature bends the horizon down at the edges as we gain altitude
    '  float horizon = uHorizon + uCurve * 0.085 * pow(abs(uv.x-0.5)*2.0, 2.0);',

    '  vec3 above = renderAbove(uv, aspect, horizon);',
    // In split mode the lower half must read as "just under the surface", not as
    // whatever depth that screen row happens to be — so remap depth to the cut.
    '  vec2 uvB = uv;',
    '  uvB.y = mix(uv.y, clamp((uv.y - horizon) / max(1.0 - horizon, 0.05), 0.0, 1.0), uSplit);',
    '  vec3 below = renderBelow(uvB, aspect);',

    // split mode cuts the frame at the meniscus instead of cross-fading
    '  float hardCut = smoothstep(horizon - 0.006, horizon + 0.006, uv.y);',
    '  float m = mix(uSub, hardCut, uSplit);',
    '  vec3 col = mix(above, below, m);',

    '  if (uSplit > 0.001) {',
    '    float meniscus = exp(-abs(uv.y - horizon) * 320.0);',
    '    col += OFFW * meniscus * 0.14 * uSplit;',
    '  }',

    // the boat, drawn last so it silhouettes against sky and water alike
    '  if (uBoat.w > 0.002 && uBoat.z > 0.0008) {',
    '    vec2 bp = vec2((uv.x - uBoat.x) * aspect, uv.y - uBoat.y) / uBoat.z;',
    '    float d = sdBoat(bp);',
    '    float aa = (1.6 / uRes.y) / uBoat.z;',
    '    float ink = (1.0 - smoothstep(-aa, aa, d)) * uBoat.w;',
    '    col = mix(col, BLACK * 0.55, ink);',
    // a thin rim of lamp light down the lit side of the hull and mast
    '    float rim = (1.0 - smoothstep(0.0, aa*2.6, abs(d))) * step(bp.x, 0.35) * uBoat.w;',
    '    col += LAMP * rim * 0.16;',
    '  }',

    // a restrained vignette keeps attention centred without crushing the edges
    '  vec2 vc = (uv - 0.5) * vec2(aspect, 1.0);',
    '  col *= 1.0 - dot(vc, vc) * 0.19;',

    // dithering: these gradients band badly in 8-bit without it
    '  float dith = (hash(gl_FragCoord.xy) - 0.5) / 255.0;',
    '  gl_FragColor = vec4(max(col + dith, 0.0), 1.0);',
    '}'
  ].join('\n');

  /* ------------------------------------------------------------------ setup */

  var canvas, gl, program, uni = {}, raf = 0, running = false;
  var lightBuf = new Float32Array(MAX_LIGHTS * 4);
  var started = 0;
  var current = sceneAt(0);

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[scene] shader:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function init() {
    canvas = document.createElement('canvas');
    canvas.className = 'scene__canvas';
    canvas.setAttribute('aria-hidden', 'true');

    var opts = { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' };
    // No separate probe context: we create the one context we are going to use, so a
    // machine without WebGL pays nothing beyond a failed getContext.
    gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts);
    if (!gl) return false;

    var vs = compile(gl.VERTEX_SHADER, VERT);
    var fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;

    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('[scene] link:', gl.getProgramInfoLog(program));
      return false;
    }
    gl.useProgram(program);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    ['uRes', 'uTime', 'uHorizon', 'uScale', 'uRough', 'uSub', 'uSplit', 'uDawn', 'uCurve', 'uLights', 'uBoat']
      .forEach(function (n) { uni[n] = gl.getUniformLocation(program, n); });

    host.appendChild(canvas);
    root.classList.add('scene-on');
    resize();
    return true;
  }

  function resize() {
    if (!gl) return;
    // 1.5 is the point past which this shader costs more than it returns visually.
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = Math.max(1, Math.round(host.clientWidth * dpr));
    var h = Math.max(1, Math.round(host.clientHeight * dpr));
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }

  function draw(timeMs) {
    var s = current;
    gl.uniform2f(uni.uRes, canvas.width, canvas.height);
    gl.uniform1f(uni.uTime, timeMs / 1000);
    gl.uniform1f(uni.uHorizon, s.horizon);
    gl.uniform1f(uni.uScale, s.scale);
    gl.uniform1f(uni.uRough, s.rough);
    gl.uniform1f(uni.uSub, s.sub);
    gl.uniform1f(uni.uSplit, s.split);
    gl.uniform1f(uni.uDawn, s.dawn);
    gl.uniform1f(uni.uCurve, s.curve);
    for (var i = 0; i < MAX_LIGHTS; i++) {
      var L = s.lights[i];
      lightBuf[i * 4] = L ? L.x : 0;
      lightBuf[i * 4 + 1] = L ? L.y : 0;
      lightBuf[i * 4 + 2] = L ? L.i : 0;
      lightBuf[i * 4 + 3] = L ? L.r : 1;
    }
    gl.uniform4fv(uni.uLights, lightBuf);
    gl.uniform4f(uni.uBoat, s.boat.x, s.boat.y, s.boat.scale, s.boat.alpha);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ------------------------------------------------- scroll -> t, by section */

  var stages = [];
  function measure() {
    stages = [];
    var els = document.querySelectorAll('[data-scene]');
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      stages.push({
        name: els[i].getAttribute('data-scene'),
        top: r.top + window.scrollY,
        height: Math.max(r.height, 1)
      });
    }
    resize();
  }

  /**
   * t comes from which section owns the viewport centre, not from raw document
   * progress, so each act stays locked to its own content at any viewport height.
   */
  function progress() {
    if (!stages.length) return 0;
    var focus = window.scrollY + window.innerHeight * 0.5;
    if (focus <= stages[0].top) return 0;
    for (var i = 0; i < stages.length; i++) {
      var s = stages[i];
      if (focus >= s.top && focus < s.top + s.height) {
        return tForAct(s.name, (focus - s.top) / s.height);
      }
    }
    return 1;
  }

  /* ---------------------------------------------------------------- lifecycle */

  var slow = 0, samples = 0, lastFrame = 0;

  function frame(now) {
    if (!running) return;
    current = sceneAt(progress());
    draw(now - started);

    // Watch the frame rate for a couple of seconds; if the machine cannot hold a
    // usable rate, hand back to the static plates rather than stuttering at the user.
    if (!FORCE && lastFrame && samples < 140) {
      var dt = now - lastFrame;
      samples++;
      if (dt > 42) slow++; else slow = Math.max(0, slow - 1);
      if (slow > 48) { teardown(); return; }
    }
    lastFrame = now;
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running || !gl) return;
    running = true;
    started = performance.now();
    lastFrame = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function teardown() {
    stop();
    root.classList.remove('scene-on');
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    var ext = gl && gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
    gl = null;
  }

  function still() {
    // Reduced motion: one frame of the hero, no scroll binding, no animation.
    current = sceneAt(0);
    draw(0);
  }

  function boot() {
    if (!init()) return; // no WebGL — the CSS plates stay exactly as they are
    measure();

    if (reduced.matches) { still(); return; }

    start();
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });
    window.addEventListener('resize', measure, { passive: true });
    window.addEventListener('load', measure);
    if (window.ResizeObserver) new ResizeObserver(measure).observe(document.body);
    if (reduced.addEventListener) {
      reduced.addEventListener('change', function (e) { if (e.matches) { stop(); still(); } else start(); });
    }
  }

  // Never compete with the hero headline for first paint.
  if (document.readyState === 'complete') setTimeout(boot, 0);
  else window.addEventListener('load', function () { setTimeout(boot, 0); });
})();
