#!/usr/bin/env python3
"""Pure-stdlib PNG decode/encode helpers (read, write, crop, resize, alpha
knock-out, bounding box). No third-party imaging libraries required."""
import zlib, struct, sys, os

def read_png(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', 'not a png'
    pos, idat, meta = 8, [], {}
    while pos < len(data):
        ln = struct.unpack('>I', data[pos:pos+4])[0]
        typ = data[pos+4:pos+8]
        chunk = data[pos+8:pos+8+ln]
        if typ == b'IHDR':
            w, h, bd, ct, comp, filt, il = struct.unpack('>IIBBBBB', chunk)
            meta = dict(w=w, h=h, bd=bd, ct=ct, il=il)
        elif typ == b'IDAT':
            idat.append(chunk)
        elif typ == b'IEND':
            break
        pos += 12 + ln
    assert meta['bd'] == 8 and meta['il'] == 0, meta
    ch = {0: 1, 2: 3, 4: 2, 6: 4}[meta['ct']]
    raw = zlib.decompress(b''.join(idat))
    w, h = meta['w'], meta['h']
    stride = w * ch
    out = bytearray(h * stride)
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        f = raw[p]; p += 1
        line = bytearray(raw[p:p+stride]); p += stride
        if f == 1:
            for i in range(ch, stride):
                line[i] = (line[i] + line[i-ch]) & 255
        elif f == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                a = line[i-ch] if i >= ch else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i-ch] if i >= ch else 0
                b = prev[i]
                c = prev[i-ch] if i >= ch else 0
                pa, pb, pc = abs(b-c), abs(a-c), abs(a+b-2*c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        out[y*stride:(y+1)*stride] = line
        prev = line
    # normalise to RGBA
    px = bytearray(w*h*4)
    for i in range(w*h):
        if ch == 3:
            px[i*4:i*4+3] = out[i*3:i*3+3]; px[i*4+3] = 255
        elif ch == 4:
            px[i*4:i*4+4] = out[i*4:i*4+4]
        elif ch == 1:
            v = out[i]; px[i*4:i*4+3] = bytes([v, v, v]); px[i*4+3] = 255
        else:
            v, a = out[i*2], out[i*2+1]
            px[i*4:i*4+3] = bytes([v, v, v]); px[i*4+3] = a
    return w, h, px

def write_png(path, w, h, px):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += px[y*w*4:(y+1)*w*4]
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    body = (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
            + chunk(b'IEND', b''))
    open(path, 'wb').write(body)

def crop(w, h, px, x0, y0, x1, y1):
    nw, nh = x1-x0, y1-y0
    out = bytearray(nw*nh*4)
    for y in range(nh):
        s = ((y+y0)*w + x0)*4
        out[y*nw*4:(y+1)*nw*4] = px[s:s+nw*4]
    return nw, nh, out

def resize(w, h, px, nw):
    """area-average downscale, preserving straight (unpremultiplied) colour"""
    nh = max(1, round(h * nw / w))
    out = bytearray(nw*nh*4)
    for y in range(nh):
        sy0, sy1 = int(y*h/nh), max(int(y*h/nh)+1, int((y+1)*h/nh))
        for x in range(nw):
            sx0, sx1 = int(x*w/nw), max(int(x*w/nw)+1, int((x+1)*w/nw))
            r = g = b = a = n = 0
            for yy in range(sy0, sy1):
                base = yy*w*4
                for xx in range(sx0, sx1):
                    i = base + xx*4
                    al = px[i+3]
                    r += px[i]*al; g += px[i+1]*al; b += px[i+2]*al; a += al
                    n += 1
            i = (y*nw+x)*4
            if a:
                out[i] = min(255, r//a); out[i+1] = min(255, g//a); out[i+2] = min(255, b//a)
            out[i+3] = a//n if n else 0
    return nw, nh, out

def knock_out(w, h, px, ink=None, gamma=1.0):
    """near-white paper -> alpha. ink=None keeps reconstructed source colour."""
    out = bytearray(w*h*4)
    for i in range(w*h):
        r, g, b = px[i*4], px[i*4+1], px[i*4+2]
        lum = (r*299 + g*587 + b*114)//1000
        a = 255 - lum
        # lift faint paper noise to fully transparent, keep real ink solid
        a = 0 if a < 10 else min(255, int((a-10) * 255 / 235 * gamma))
        j = i*4
        if a == 0:
            out[j+3] = 0
            continue
        if ink:
            out[j], out[j+1], out[j+2] = ink
        else:
            af = a/255
            # un-composite from white paper
            out[j] = max(0, min(255, int((r - 255*(1-af))/af)))
            out[j+1] = max(0, min(255, int((g - 255*(1-af))/af)))
            out[j+2] = max(0, min(255, int((b - 255*(1-af))/af)))
        out[j+3] = a
    return w, h, out

def bbox(w, h, px, thresh=245):
    x0, y0, x1, y1 = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            i = (y*w+x)*4
            lum = (px[i]*299 + px[i+1]*587 + px[i+2]*114)//1000
            if lum < thresh:
                if x < x0: x0 = x
                if x > x1: x1 = x
                if y < y0: y0 = y
                if y > y1: y1 = y
    return x0, y0, x1+1, y1+1

