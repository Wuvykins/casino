#!/usr/bin/env python3
"""Generate poker chip PNGs in the style of the family deck (navy / gold / red, dotted gold rings, diamonds).
Run:  python3 tools/make_chips.py   -> assets/img/chips/<denom>.png (256x256, transparent)."""
import math, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'img', 'chips')
os.makedirs(OUT, exist_ok=True)
S = 1024            # supersampled size
GOLD = (226, 178, 60); GOLD_DK = (150, 108, 22); GOLD_LT = (250, 224, 140)
NAVY = (31, 61, 143); NAVY_DK = (18, 36, 92)
RED = (201, 32, 42); BLACK = (18, 18, 18); WHITE = (246, 243, 234)
CHIPS = {
    1:    dict(base=WHITE, text=NAVY, spots=NAVY, label='1'),
    5:    dict(base=RED, text=GOLD_LT, spots=WHITE, label='5'),
    25:   dict(base=(28, 122, 62), text=GOLD_LT, spots=WHITE, label='25'),
    100:  dict(base=BLACK, text=GOLD, spots=WHITE, label='100'),
    500:  dict(base=(92, 44, 140), text=GOLD_LT, spots=WHITE, label='500'),
    1000: dict(base=GOLD, text=NAVY, spots=NAVY, label='1K'),
    5000: dict(base=NAVY, text=GOLD_LT, spots=WHITE, label='5K'),
}
FONT_PATHS = ['/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']

def font(size):
    for p in FONT_PATHS:
        if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def ring(d, r_out, r_in, fill):
    c = S / 2
    d.ellipse([c - r_out, c - r_out, c + r_out, c + r_out], fill=fill)
    if r_in > 0: d.ellipse([c - r_in, c - r_in, c + r_in, c + r_in], fill=(0, 0, 0, 0))

def polar(r, a):
    c = S / 2; return (c + r * math.cos(a), c + r * math.sin(a))

def make(denom, spec):
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    c = S / 2
    R = S * 0.47
    layers = []
    # drop shadow
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0)); ImageDraw.Draw(sh).ellipse([c - R, c - R + 14, c + R, c + R + 14], fill=(0, 0, 0, 120))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(14)))
    d = ImageDraw.Draw(im)
    # body
    d.ellipse([c - R, c - R, c + R, c + R], fill=spec['base'])
    # edge spots (8 wedges) like the gold-bordered card edge
    for i in range(8):
        a0 = i * math.pi / 4 - 0.16; a1 = i * math.pi / 4 + 0.16
        d.pieslice([c - R, c - R, c + R, c + R], math.degrees(a0), math.degrees(a1), fill=spec['spots'])
    # thin gold outer rim
    d.ellipse([c - R, c - R, c + R, c + R], outline=GOLD_DK, width=int(S * 0.008))
    d.ellipse([c - R * 0.985, c - R * 0.985, c + R * 0.985, c + R * 0.985], outline=GOLD, width=int(S * 0.006))
    # gold ring with black dots (the card border motif)
    r1, r2 = R * 0.78, R * 0.70
    d.ellipse([c - r1, c - r1, c + r1, c + r1], fill=GOLD)
    d.ellipse([c - r1, c - r1, c + r1, c + r1], outline=GOLD_DK, width=int(S * 0.005))
    for i in range(36):
        x, y = polar((r1 + r2) / 2, i * math.pi / 18); rr = S * 0.009
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=BLACK)
    # navy band with gold diamonds
    r3 = R * 0.58
    d.ellipse([c - r2, c - r2, c + r2, c + r2], fill=NAVY)
    d.ellipse([c - r2, c - r2, c + r2, c + r2], outline=GOLD_DK, width=int(S * 0.004))
    for i in range(12):
        x, y = polar((r2 + r3) / 2, i * math.pi / 6 + math.pi / 12); s = S * 0.022
        d.polygon([(x, y - s), (x + s * 0.6, y), (x, y + s), (x - s * 0.6, y)], fill=GOLD if i % 3 else RED)
    # inner gold ring + centre disc in the base colour
    d.ellipse([c - r3, c - r3, c + r3, c + r3], fill=GOLD)
    r4 = R * 0.54
    d.ellipse([c - r4, c - r4, c + r4, c + r4], fill=spec['base'])
    d.ellipse([c - r4, c - r4, c + r4, c + r4], outline=GOLD_DK, width=int(S * 0.004))
    # sunburst lines in the centre disc, faint
    for i in range(48):
        a = i * math.pi / 24
        x0, y0 = polar(r4 * 0.62, a); x1, y1 = polar(r4 * 0.97, a)
        d.line([x0, y0, x1, y1], fill=tuple(min(255, v + 28) if sum(spec['base']) < 500 else max(0, v - 28) for v in spec['base']), width=int(S * 0.004))
    # denomination
    f = font(int(S * (0.30 if len(spec['label']) <= 2 else 0.24)))
    txt = spec['label']
    bb = d.textbbox((0, 0), txt, font=f)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    # shadow + text
    d.text((c - tw / 2 - bb[0] + 5, c - th / 2 - bb[1] + 6), txt, font=f, fill=(0, 0, 0, 110))
    d.text((c - tw / 2 - bb[0], c - th / 2 - bb[1]), txt, font=f, fill=spec['text'])
    # small "$" above and diamonds below
    f2 = font(int(S * 0.08))
    d.text((c - S * 0.025, c - r4 * 0.72), '$', font=f2, fill=spec['text'])
    for k in (-1, 0, 1):
        x, y = c + k * S * 0.05, c + r4 * 0.66; s = S * 0.016
        d.polygon([(x, y - s), (x + s * 0.6, y), (x, y + s), (x - s * 0.6, y)], fill=RED if k == 0 else GOLD if spec['base'] != GOLD else NAVY)
    # highlight (soft light from top-left)
    hl = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(hl).ellipse([c - R * 0.9, c - R * 0.95, c + R * 0.6, c + R * 0.2], fill=(255, 255, 255, 38))
    im.alpha_composite(hl.filter(ImageFilter.GaussianBlur(60)))
    out = im.resize((256, 256), Image.LANCZOS)
    out.save(os.path.join(OUT, f'{denom}.png'))

for denom, spec in CHIPS.items():
    make(denom, spec)
print('chips written to', os.path.abspath(OUT))
