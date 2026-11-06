"""Consolidate the per-row fits into one logo layout in font units (y-up)."""
import json, math, sys
import numpy as np
sys.path.insert(0, sys.argv[1])
from glyphs import Font
D = sys.argv[1]
font = Font(f'{D}/AGBold.ttf')
rows = json.load(open(f'{D}/fit_rows.json'))['rows']
news = json.load(open(f'{D}/fit_news2_AGBold.ttf.json'))['news']
CAP = 740
items = [
    ('VA', '', rows[0:5], 'silver'),
    ('GUAR', 'GUR', rows[5:10], 'silver'),
    ('DA', 'D', rows[10:15], 'silver'),
    ('N', 'N', news[0:5], 'neon'),
    ('EWS', 'EWS', news[5:10], 'neon'),
    ('ECHO', 'EW', news[10:15], 'echo'),
]
# reference frame: mean angle of silver rows, mean silver scale
th0 = float(np.mean([rows[1], rows[6], rows[11]]))
s0 = float(np.mean([rows[0], rows[5], rows[10]]))
print('angle deg', math.degrees(th0), 's0', s0)

def img_center(p, text):
    s, th, tx, ty, trk = p
    lay, w = font.layout(text, trk)
    cx, cy = w / 2, CAP / 2
    X, Y = cx * s, -cy * s
    return np.array([X*math.cos(th) - Y*math.sin(th) + tx, X*math.sin(th) + Y*math.cos(th) + ty]), w

def to_logo(pt):
    d = pt - ref_origin
    c, si = math.cos(-th0), math.sin(-th0)
    x, y = d[0]*c - d[1]*si, d[0]*si + d[1]*c
    return np.array([x / s0, -y / s0])

ref_origin = np.array(rows[2:4])
out = []
for name, text, p, kind in items:
    rel = p[0] / s0
    trk = round(p[4] / 5) * 5
    c_img, _ = img_center(p, text)
    lay, w = font.layout(text, trk)
    c = to_logo(c_img)
    ox, oy = c[0] - w*rel/2, c[1] - CAP*rel/2
    glyphs = [{'g': g, 'x': round(ox + gx*rel, 1), 'y': round(oy, 1)} for g, gx in lay]
    out.append({'name': name, 'kind': kind, 'scale': round(rel, 4), 'tracking': trk,
                'center': [round(c[0], 1), round(c[1], 1)], 'glyphs': glyphs})
    print(name, kind, 'scale', round(rel, 3), 'center', np.round(c, 1), 'origin', round(ox, 1), round(oy, 1), 'trk', trk)
# unify the three silver rows to the same size (logo intent); keep centers
allpts = []
for it in out:
    for gl in it['glyphs']:
        allpts.append((gl['x'], gl['y']))
json.dump({'angle_deg': math.degrees(th0), 'cap': CAP, 'items': out}, open(f'{D}/layout_raw.json', 'w'), indent=1)
