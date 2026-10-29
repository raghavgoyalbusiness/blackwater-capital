'use strict';
/** Minimal PNG decoder (8-bit, non-interlaced) using only zlib. */
const zlib = require('zlib');

function decode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let pos = 8, idat = [], meta = null;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      meta = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), bd: data[8], ct: data[9], il: data[12] };
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!meta || meta.bd !== 8 || meta.il !== 0) throw new Error('unsupported png: ' + JSON.stringify(meta));
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[meta.ct];
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const { w, h } = meta;
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride), p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++];
    const line = Buffer.from(raw.subarray(p, p + stride)); p += stride;
    if (f === 1) for (let i = ch; i < stride; i++) line[i] = (line[i] + line[i - ch]) & 255;
    else if (f === 2) for (let i = 0; i < stride; i++) line[i] = (line[i] + prev[i]) & 255;
    else if (f === 3) for (let i = 0; i < stride; i++) line[i] = (line[i] + (((i >= ch ? line[i - ch] : 0) + prev[i]) >> 1)) & 255;
    else if (f === 4) for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
    }
    line.copy(out, y * stride);
    prev = line;
  }
  return { width: w, height: h, channels: ch, data: out };
}

// 256-entry lookup: linearising per channel per pixel with Math.pow is far too
// slow to sweep a whole page frame by frame.
const LUT = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LUT[i] = c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const lum = (r, g, b) => 0.2126 * LUT[r] + 0.7152 * LUT[g] + 0.0722 * LUT[b];
const ratio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

/** Luminance for every pixel, computed once so box scans are a plain min/max. */
function luminanceImage(png) {
  const { width, height, channels, data } = png;
  const out = new Float32Array(width * height);
  for (let i = 0, o = 0; i < out.length; i++, o += channels) {
    out[i] = 0.2126 * LUT[data[o]] + 0.7152 * LUT[data[o + 1]] + 0.0722 * LUT[data[o + 2]];
  }
  return out;
}

module.exports = { decode, lum, ratio, luminanceImage };
