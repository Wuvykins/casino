#!/usr/bin/env python3
"""Re-drill Nic's cribbage board art so it has exactly 60 holes per row (12 groups of 5) and matching 0/15/30/45/60
markers, then squeeze it a little vertically so it sits in the scene's rail. Input: the 2206x713 PNG he sent
(walnut lane on top, emerald below, START holes at the left, name plates left, score windows right).

    python3 tools/drill_board.py <his png> assets/img/table/cribbage-board.png

Prints the BOARD_ART numbers (percentages of the output picture) to paste into js/ui/cribbageTable.js.
"""
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SRC, OUT = sys.argv[1], sys.argv[2]
im = Image.open(SRC).convert('RGBA')
W, H = im.size
assert (W, H) == (2206, 713), (W, H)

# --- measured off his picture (native pixels) ---
TRACK_X0, TRACK_X1 = 386, 1978            # the playable strip between the divider bar and the score window
LANES = [  # rows = hole-row centres; fill = the band to repaint; tex = a hole-free band to sample texture from
    dict(rows=(246, 288), fill=(188, 304), tex=(300, 324), labels='top', tick=(214, 227), num_y=201),
    dict(rows=(386, 428), fill=(350, 496), tex=(350, 372), labels='bottom', tick=(455, 468), num_y=482),
]
START = [((305, 273), (342, 273)), ((305, 413), (342, 413))]
HOLE_SPRITE = (440, 246)                  # a clean hole to copy (walnut) — the emerald one is at the same x, row 386
CROP = (36, 161, 2170, 516)
SQUEEZE = 0.85                            # vertical, so the board fits the rail in the scene
FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', 23)

# hole x positions: 12 groups of 5, gap between groups 1.45x the pitch
n_groups, per, x0, x1 = 12, 5, 404, 1958
p = (x1 - x0) / (n_groups * (per - 1) + (n_groups - 1) * 1.45)
g = 1.45 * p
X = []
for gi in range(n_groups):
    base = x0 + gi * ((per - 1) * p + g)
    X += [base + k * p for k in range(per)]
assert len(X) == 60

def tile_fill(img, box, tex_band):
    """cover box with the lane's own hole-free texture band, tiled vertically (grain runs sideways, so it reads fine)"""
    x0, y0, x1, y1 = box
    t0, t1 = tex_band
    strip = img.crop((x0, t0, x1, t1))
    h = t1 - t0
    y = y0
    flip = False
    while y < y1:
        piece = strip.transpose(Image.FLIP_TOP_BOTTOM) if flip else strip   # mirror alternate tiles: no hard seam
        hh = min(h, y1 - y)
        img.paste(piece.crop((0, 0, x1 - x0, hh)), (x0, y))
        y += hh; flip = not flip

def hole_sprite(img, cx, cy, r=15):
    spr = img.crop((cx - r, cy - r, cx + r, cy + r))
    mask = Image.new('L', spr.size, 0)
    ImageDraw.Draw(mask).ellipse((1, 1, 2 * r - 2, 2 * r - 2), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1.2))
    spr.putalpha(mask)
    return spr

sprites = [hole_sprite(im, HOLE_SPRITE[0], HOLE_SPRITE[1]), hole_sprite(im, HOLE_SPRITE[0], 386)]
SCALE = 0.72
sprites = [s.resize((round(s.width * SCALE), round(s.height * SCALE)), Image.LANCZOS) for s in sprites]

draw = ImageDraw.Draw(im)
def label(text, cx, cy, tick):
    tw = draw.textlength(text, font=FONT)
    for dx, dy, col in ((1, 2, (40, 26, 8, 200)), (0, 0, (247, 236, 190, 255))):
        draw.text((cx - tw / 2 + dx, cy - 13 + dy), text, font=FONT, fill=col)
    draw.rectangle((cx - 2, tick[0], cx + 2, tick[1]), fill=(222, 196, 120, 255))
    draw.rectangle((cx - 2, tick[0], cx - 1, tick[1]), fill=(255, 240, 200, 255))

for li, L in enumerate(LANES):
    tile_fill(im, (TRACK_X0, L['fill'][0], TRACK_X1, L['fill'][1]), L['tex'])
    spr = sprites[li]
    for row, y in enumerate(L['rows']):
        for x in X:
            im.alpha_composite(spr, (round(x - spr.width / 2), round(y - spr.height / 2)))
    if L['labels'] == 'top':
        for txt, i in (('0', None), ('15', 14), ('30', 29), ('45', 44), ('60', 59)):
            cx = X[0] - p * 0.9 if i is None else X[i]
            label(txt, round(cx), L['num_y'], L['tick'])
    else:
        for txt, i in (('120', 0), ('105', 15), ('90', 30), ('75', 45), ('60', 59)):
            label(txt, round(X[i]), L['num_y'], L['tick'])

out = im.crop(CROP)
cw, ch = out.size
out = out.resize((cw, round(ch * SQUEEZE)), Image.LANCZOS)
out.save(OUT, optimize=True)
ow, oh = out.size
print('written', OUT, ow, 'x', oh)

# --- BOARD_ART, as % of the output picture ---
px = lambda x: round((x - CROP[0]) / cw * 100, 3)
py = lambda y: round((y - CROP[1]) / ch * 100, 2)     # the squeeze keeps percentages the same
print('holeX:', [px(x) for x in X])
print('rowY:', [py(y) for L in LANES for y in L['rows']])
print('start:', [[{'x': px(x), 'y': py(y)} for x, y in lane] for lane in START])
plate = (62, 258); win = (1992, 2128); tops = (184, 354); height = 128
print('plate:', {'left': px(plate[0]), 'width': round((plate[1] - plate[0]) / cw * 100, 2), 'tops': [py(t) for t in tops], 'height': round(height / ch * 100, 2)})
print('window:', {'left': px(win[0]), 'width': round((win[1] - win[0]) / cw * 100, 2), 'tops': [py(t) for t in tops], 'height': round(height / ch * 100, 2)})
print('aspect:', ow, '/', oh)
