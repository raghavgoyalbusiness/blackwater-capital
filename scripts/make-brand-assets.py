#!/usr/bin/env python3
"""Derive the Blackwater Capital brand assets from the supplied logo raster.

Trims the artwork, splits the monogram from the wordmark, knocks the near-white
paper out to alpha (reconstructing the original ink colour), and emits an
off-white knockout variant for dark backgrounds. Standard library only.

    python3 scripts/make-brand-assets.py path/to/logo.png public/assets/img
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pnglib import read_png, write_png, crop, resize, knock_out, bbox

SRC = sys.argv[1]
DST = sys.argv[2]
w, h, px = read_png(SRC)
print('source', w, h)
x0, y0, x1, y1 = bbox(w, h, px)
print('bbox', x0, y0, x1, y1)
w2, h2, p2 = crop(w, h, px, x0, y0, x1, y1)

# horizontal projection to find the gap between mark and wordmark
rows = []
for y in range(h2):
    c = 0
    for x in range(w2):
        i = (y*w2+x)*4
        if (p2[i]*299 + p2[i+1]*587 + p2[i+2]*114)//1000 < 235:
            c += 1
    rows.append(c)
gap = None
run = 0
for y in range(h2):
    if rows[y] == 0:
        run += 1
        if run > 12 and y > h2*0.3:
            gap = (y-run+1, y)
    else:
        if gap and run > 12:
            break
        run = 0
print('gap', gap)
split = (gap[0]+gap[1])//2 if gap else int(h2*0.58)

def emit(name, ww, hh, pp, width, ink=None):
    _w, _h, k = knock_out(ww, hh, pp, ink=ink)
    _w, _h, k = resize(_w, _h, k, width)
    write_png(os.path.join(DST, name), _w, _h, k)
    print('wrote', name, _w, _h)

mw, mh, mp = crop(w2, h2, p2, 0, 0, w2, split)
# retrim the mark horizontally
a, b, c, d = bbox(mw, mh, mp)
mw, mh, mp = crop(mw, mh, mp, a, b, c, d)
ww_, wh_, wp = crop(w2, h2, p2, 0, split, w2, h2)
a, b, c, d = bbox(ww_, wh_, wp)
ww_, wh_, wp = crop(ww_, wh_, wp, a, b, c, d)

OFFWHITE = (245, 244, 240)
emit('logo-lockup.png', w2, h2, p2, 640)
emit('logo-lockup-light.png', w2, h2, p2, 640, ink=OFFWHITE)
emit('logo-mark.png', mw, mh, mp, 256)
emit('logo-mark-light.png', mw, mh, mp, 256, ink=OFFWHITE)
emit('logo-wordmark.png', ww_, wh_, wp, 720)
emit('logo-wordmark-light.png', ww_, wh_, wp, 720, ink=OFFWHITE)
emit('favicon-64.png', mw, mh, mp, 64)
emit('icon-192.png', mw, mh, mp, 192)
emit('icon-512.png', mw, mh, mp, 512)
print('done')
