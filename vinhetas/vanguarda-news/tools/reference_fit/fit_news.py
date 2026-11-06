"""Fit the outlined NEWS (big N + smaller EWS + lower EW echo) to the red mask."""
import json, math, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, sys.argv[1])
from glyphs import Font
D = sys.argv[1]; FONT = sys.argv[2]
W, H = 640, 480
font = Font(f'{D}/{FONT}')
ref = np.asarray(Image.open(f'{D}/red.png').convert('L').resize((W, H))) > 100

def text_outline(text, p, lw=3):
    s, th, tx, ty, trk = p
    c, si = math.cos(th), math.sin(th)
    im = Image.new('1', (W, H), 0); dr = ImageDraw.Draw(im)
    lay, _ = font.layout(text, trk)
    for g, gx in lay:
        for cont in font.contours(g):
            pts = []
            for (x, y) in cont:
                X, Y = (x + gx) * s, -y * s
                pts.append((X * c - Y * si + tx, X * si + Y * c + ty))
            dr.line(pts + [pts[0]], fill=1, width=lw)
    return np.asarray(im, bool)

PARTS = ['N', 'EWS', 'EW']
def render(P):
    acc = np.zeros((H, W), bool)
    for i, t in enumerate(PARTS):
        acc |= text_outline(t, P[i*5:(i+1)*5])
    return acc

def blur(m, r):
    return np.asarray(Image.fromarray((m*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), float)/255

def make_score(r):
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

th = -0.36
# N: crop coords at 1280 (400+x) -> /2.  N bottom-left approx (400+150, 395)/2
P = np.array([0.155, th, 268, 195, 0,
              0.075, th, 385, 175, 0,
              0.06, th, 410, 192, 0], float)
st = np.array([0.006, 0.03, 8, 8, 30, 0.004, 0.03, 8, 8, 30, 0.004, 0.03, 8, 8, 30])
rng = np.random.default_rng(3)
for r, it in ((6, 30), (3, 30), (1.5, 30)):
    P, b = opt(P, st.copy(), make_score(r), it, rng)
    print(FONT, 'blur', r, round(b, 4), np.round(P, 4).tolist(), flush=True)
json.dump({'news': P.tolist(), 'score': b}, open(f'{D}/fit_news_{FONT}.json', 'w'))
m = render(P)
vis = np.zeros((H, W, 3), np.uint8); vis[ref] = (110, 30, 30); vis[m] = (0, 160, 255); vis[m & ref] = (255, 255, 255)
Image.fromarray(vis).save(f'{D}/fit_news_{FONT}.png')
