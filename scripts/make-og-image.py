#!/usr/bin/env python3
"""Compose the 1200x630 Open Graph share image: near-black field, a soft navy
swell, hairline rules and the knockout lockup centred."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pnglib import read_png, write_png, resize

W, H = 1200, 630
BLACK = (9, 11, 13)
NAVY = (7, 23, 46)

canvas = bytearray(W * H * 4)
for y in range(H):
    for x in range(W):
        # vertical gradient black -> navy toward the lower third
        t = max(0.0, (y - H * 0.35) / (H * 0.65))
        # soft radial swell, lower right
        dx, dy = (x - W * 0.72) / (W * 0.62), (y - H * 0.92) / (H * 0.7)
        r = max(0.0, 1.0 - (dx * dx + dy * dy))
        k = min(1.0, t * 0.55 + r * 0.5)
        i = (y * W + x) * 4
        canvas[i] = int(BLACK[0] + (NAVY[0] - BLACK[0]) * k + 6 * k)
        canvas[i + 1] = int(BLACK[1] + (NAVY[1] - BLACK[1]) * k + 8 * k)
        canvas[i + 2] = int(BLACK[2] + (NAVY[2] - BLACK[2]) * k + 14 * k)
        canvas[i + 3] = 255

# hairline rules top and bottom
for y in (72, H - 72):
    for x in range(72, W - 72):
        i = (y * W + x) * 4
        canvas[i] = canvas[i + 1] = 60
        canvas[i + 2] = 68

lw, lh, lp = read_png(os.path.join(sys.argv[1], 'logo-lockup-light.png'))
lw, lh, lp = resize(lw, lh, lp, 560)
ox, oy = (W - lw) // 2, (H - lh) // 2 - 8
for y in range(lh):
    for x in range(lw):
        s = (y * lw + x) * 4
        a = lp[s + 3]
        if not a:
            continue
        d = ((y + oy) * W + (x + ox)) * 4
        for c in range(3):
            canvas[d + c] = (lp[s + c] * a + canvas[d + c] * (255 - a)) // 255

write_png(os.path.join(sys.argv[1], 'og-default.png'), W, H, canvas)
print('wrote og-default.png', W, H)
