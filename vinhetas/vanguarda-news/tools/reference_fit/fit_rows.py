"""Per-row similarity fit (scale, angle, translation, tracking) of the silver rows
VA / GUAR / DA and the red N of NEWS against the reference end frame."""
import json, math, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, sys.argv[1])
from glyphs import Font
D = sys.argv[1]
W, H = 640, 480
font = Font(f'{D}/AGBold.ttf')
ROWS = ['', 'GUR', 'D']
refm = Image.open(f'{D}/silver.png').convert('L').resize((W, H))
ref = np.asarray(refm) > 127

def row_mask(text, p):
    s, th, tx, ty, trk = p
    c, si = math.cos(th), math.sin(th)
    acc = np.zeros((H, W), bool)
    lay, _ = font.layout(text, trk)
    for g, gx in lay:
        m = np.zeros((H, W), bool)
        for cont in font.contours(g):
            pts = []
            for (x, y) in cont:
                X, Y = (x + gx) * s, -y * s
                pts.append((X * c - Y * si + tx, X * si + Y * c + ty))
            im = Image.new('1', (W, H), 0)
            ImageDraw.Draw(im).polygon(pts, fill=1)
            m ^= np.asarray(im, bool)
        acc |= m
    return acc

def render(P):
    acc = np.zeros((H, W), bool)
    for i, t in enumerate(ROWS):
        acc |= row_mask(t, P[i*5:(i+1)*5])
    return acc

def blur(m, r):
    return np.asarray(Image.fromarray((m*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), float)/255

def make_score(r):
    if r == 0:
        def sc(P):
            m = render(P); return (m & ref).sum() / ((m | ref).sum() + 1e-9)
    else:
        rb = blur(ref, r)
        def sc(P):
            m = blur(render(P), r)
            return (m*rb).sum() / (np.sqrt((m*m).sum()*(rb*rb).sum()) + 1e-9)
    return sc

def opt(P, steps, sc, iters, rng):
    best = sc(P)
    for it in range(iters):
        imp = False
        for i in range(len(P)):
            for sg in (1, -1):
                q = P.copy(); q[i] += sg*steps[i]; v = sc(q)
                if v > best: best, P, imp = v, q, True
        for _ in range(8):
            q = P + rng.normal(0, .4, len(P))*steps; v = sc(q)
            if v > best: best, P, imp = v, q, True
        if not imp: steps = steps*0.6
    return P, best

th0 = -0.3164
P = np.array([0.1533, th0, 89.6, 263.7, 0,
              0.1533, th0, 60, 340, 0,
              0.1533, th0, 330, 420, 0], float)
st1 = np.array([0.008, 0.03, 10, 10, 30]*3)
rng = np.random.default_rng(2)
for r, it in ((8, 25), (3, 25), (0, 40)):
    P, b = opt(P, st1.copy(), make_score(r), it, rng)
    print('blur', r, round(b, 4), np.round(P, 4).tolist(), flush=True)
json.dump({'rows': P.tolist()}, open(f'{D}/fit_rows.json', 'w'))
m = render(P)
vis = np.zeros((H, W, 3), np.uint8); vis[ref] = (90, 90, 90); vis[m] = (0, 160, 255); vis[m & ref] = (255, 255, 255)
Image.fromarray(vis).save(f'{D}/fit_rows.png')
