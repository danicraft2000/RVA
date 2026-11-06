"""Glyph outline helpers (font units, y-up) used by the logo-geometry fit."""
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen


class FlattenPen(BasePen):
    def __init__(self, glyphSet, steps=10):
        super().__init__(glyphSet)
        self.contours, self.cur, self.steps = [], [], steps

    def _moveTo(self, p):
        self.cur = [p]

    def _lineTo(self, p):
        self.cur.append(p)

    def _qCurveToOne(self, p1, p2):
        p0 = self.cur[-1]
        for i in range(1, self.steps + 1):
            t = i / self.steps
            a, b, c = (1 - t) ** 2, 2 * (1 - t) * t, t * t
            self.cur.append((a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]))

    def _curveToOne(self, p1, p2, p3):
        p0 = self.cur[-1]
        for i in range(1, self.steps + 1):
            t = i / self.steps
            a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3
            self.cur.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
                             a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))

    def _closePath(self):
        if self.cur:
            self.contours.append(self.cur)
        self.cur = []

    _endPath = _closePath


class Font:
    KERN = {('V.alt02', 'A.alt01'): -275}

    def __init__(self, path):
        self.tt = TTFont(path)
        self.gs = self.tt.getGlyphSet()
        self.cmap = self.tt.getBestCmap()
        self.cache = {}

    def gname(self, ch):
        return self.cmap[ord(ch)]

    def contours(self, g):
        if g not in self.cache:
            p = FlattenPen(self.gs)
            self.gs[g].draw(p)
            self.cache[g] = p.contours
        return self.cache[g]

    def layout(self, text, tracking=0.0):
        """Return list of (glyphname, x_offset) in font units."""
        out, x, prev = [], 0.0, None
        for ch in text:
            g = self.gname(ch)
            if prev:
                x += self.KERN.get((prev, g), 0) + tracking
            out.append((g, x))
            x += self.gs[g].width
            prev = g
        return out, x
