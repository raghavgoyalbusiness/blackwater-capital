'use strict';
/**
 * Minimal Chrome DevTools Protocol client over Node's built-in WebSocket.
 * No dependencies, no Puppeteer. Shared by the verification scripts.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = [
  '/Applications/Google Chrome 2.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium'
].find((p) => fs.existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Grab a port the OS says is free. A fixed port is unsafe here: other sessions on
 * this machine run their own debug Chrome, and attaching to one of those silently
 * screenshots somebody else's tab.
 */
function freePort() {
  const net = require('net');
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function launch({ port, width = 1440, height = 900, headless = true, extraArgs = [] } = {}) {
  if (!CHROME) throw new Error('No Chrome found in /Applications');
  if (!port) port = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bwc-cdp-'));
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--mute-audio', // test browsers must never make noise
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    // real GPU where we can get it; the scene is a fragment shader
    '--use-angle=metal',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    ...extraArgs,
    'about:blank'
  ];
  if (headless) args.unshift('--headless=new');

  // detached so we can kill the whole process group: Chrome spawns helper
  // processes that survive a kill on the parent and pile up across runs.
  const proc = spawn(CHROME, args, { stdio: 'ignore', detached: true });
  const kill = () => {
    try { process.kill(-proc.pid, 'SIGKILL'); } catch { try { proc.kill('SIGKILL'); } catch {} }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  };
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return { proc, port, profile, kill };
    } catch {}
    await sleep(100);
  }
  kill();
  throw new Error('Chrome did not expose a debugging port');
}

class Page {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.consoleErrors = [];
    this.pageErrors = [];
    ws.addEventListener('error', () => {}); // a socket closing at teardown is not a failure
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
        return;
      }
      // console.error is invisible via Log.entryAdded — listen to the runtime API
      if (msg.method === 'Runtime.consoleAPICalled' && /error|warning/.test(msg.params.type)) {
        this.consoleErrors.push(
          msg.params.type + ': ' + msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ')
        );
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        this.pageErrors.push(d.exception?.description || d.text);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(method + ' timed out')); }
      }, 60000);
    });
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
    return r.result.value;
  }

  async goto(url) {
    await this.send('Page.navigate', { url });
    for (let i = 0; i < 200; i++) {
      const state = await this.eval('document.readyState');
      if (state === 'complete') break;
      await sleep(50);
    }
    const here = await this.eval('location.href');
    if (!here.startsWith(url.split('?')[0])) {
      throw new Error(`attached to the wrong page: expected ${url}, got ${here}`);
    }
  }

  async setViewport(width, height, dpr = 1) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: dpr, mobile: false
    });
  }

  async screenshot(file) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  }

  async shotBuffer() {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    return Buffer.from(data, 'base64');
  }
}

async function open(port, url) {
  const r = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const target = await r.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  const page = new Page(ws);
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  // Foreground the target: a background tab can capture the wrong surface.
  try { await page.send('Page.bringToFront'); } catch {}
  return page;
}

module.exports = { launch, open, sleep, CHROME };
