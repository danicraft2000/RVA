"""Gera assets/logo-geometry.json a partir da fonte ITC Avant Garde Std Bold.

- Contornos (quadráticos) dos glifos usados na logo, incluindo os alternativos
  V = U+E04F (V.alt02) e A = U+E000 (A.alt01).
- Layout final da logo (proporções medidas na referência histórica, ver
  tools/reference-fit.json e tools/measure_reference.md).
- Caminhos de neon (contorno interno, cantos arredondados) para N / EWS / eco EW.

Uso:  python3 tools/extract_glyphs.py assets/fonts/ITCAvantGardeStd-Bold.ttf
"""
import json
import math
import sys
from pathlib import Path

from fontTools.pens.basePen import BasePen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont
from shapely.geometry import Polygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
FONT_PATH = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'assets/fonts/ITCAvantGardeStd-Bold.ttf'
FIT = json.loads((ROOT / 'tools/reference-fit.json').read_text())

V_ALT, A_ALT = '', ''   # caracteres especiais fornecidos
CAP = 740
KERN = {('V.alt02', 'A.alt01'): -275}   # GPOS da fonte (único par relevante)

# Elementos da composição. Linhas prateadas unificadas em escala 1.0 (intenção
# tipográfica); NEWS mantém as escalas relativas medidas.
ELEMENTS = [
    # nome, texto, tipo, escala, tracking
    ('VA', V_ALT + A_ALT, 'silver', 1.0, 10),
    ('GUAR', 'GU' + A_ALT + 'R', 'silver', 1.0, -35),
    ('DA', 'D' + A_ALT, 'silver', 1.0, -80),
    ('N', 'N', 'neon', None, 0),
    ('EWS', 'EWS', 'neon', None, -60),
    ('ECHO', 'EW', 'echo', None, 0),
]
NEON_RADIUS = {'neon': 13.0, 'echo': 7.0}     # raio do tubo (unidades de fonte)
NEON_INSET = {'neon': 17.0, 'echo': 10.0}     # recuo do eixo do tubo


class FlattenPen(BasePen):
    def __init__(self, gs, steps=12):
        super().__init__(gs)
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

    def _closePath(self):
        if len(self.cur) > 2:
            self.contours.append(self.cur)
        self.cur = []

    _endPath = _closePath


def glyph_commands(gs, name):
    """Comandos M/L/Q/Z (TrueType: contorno externo horário em y-up)."""
    rec = RecordingPen()
    gs[name].draw(rec)
    out = []
    for op, pts in rec.value:
        if op == 'moveTo':
            out.append(['M', *pts[0]])
        elif op == 'lineTo':
            out.append(['L', *pts[0]])
        elif op == 'qCurveTo':
            # decompõe sequências implícitas on-curve
            cps = list(pts)
            last = cps[-1]
            offs = cps[:-1]
            for i, c in enumerate(offs):
                if i < len(offs) - 1:
                    n = offs[i + 1]
                    mid = ((c[0] + n[0]) / 2, (c[1] + n[1]) / 2)
                    out.append(['Q', *c, *mid])
                else:
                    out.append(['Q', *c, *last])
        elif op == 'curveTo':
            raise ValueError('cubic not expected in TTF')
        elif op in ('closePath', 'endPath'):
            out.append(['Z'])
    return [[round(v, 2) if isinstance(v, float) else v for v in c] for c in out]


def glyph_polygon(gs, name, ox, oy, s):
    pen = FlattenPen(gs)
    gs[name].draw(pen)
    rings = [Polygon([(ox + x * s, oy + y * s) for x, y in c]).buffer(0) for c in pen.contours]
    shape = rings[0]
    for r in rings[1:]:          # regra par-ímpar: furos (contra-formas) se subtraem
        shape = shape.symmetric_difference(r)
    return shape


def resample(coords, step):
    pts = list(coords)
    if pts[0] == pts[-1]:
        pts = pts[:-1]
    pts.append(pts[0])
    seg = [math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
    total = sum(seg)
    n = max(8, int(total / step))
    out, acc, i = [], 0.0, 0
    for k in range(n):
        d = k * total / n
        while acc + seg[i] < d and i < len(seg) - 1:
            acc += seg[i]
            i += 1
        t = (d - acc) / seg[i] if seg[i] else 0
        a, b = pts[i], pts[i + 1]
        out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out, total


def start_bottom_left(ring):
    k = min(range(len(ring)), key=lambda i: ring[i][1] * 3 + ring[i][0])
    return ring[k:] + ring[:k]


def main():
    tt = TTFont(FONT_PATH)
    gs = tt.getGlyphSet()
    cmap = tt.getBestCmap()
    fit = {it['name']: it for it in FIT['items']}
    angle = FIT['angle_deg']

    used, elements = set(), []
    for name, text, kind, scale, trk in ELEMENTS:
        s = scale if scale is not None else round(fit[name]['scale'], 4)
        cx, cy = fit[name]['center']
        names = [cmap[ord(ch)] for ch in text]
        x, lay, prev = 0.0, [], None
        for g in names:
            if prev:
                x += KERN.get((prev, g), 0) + trk
            lay.append((g, x))
            x += gs[g].width
            prev = g
        width = x
        ox, oy = cx - width * s / 2, cy - CAP * s / 2
        glyphs = [{'g': g, 'x': round(ox + gx * s, 2), 'y': round(oy, 2)} for g, gx in lay]
        used.update(names)
        elements.append({'name': name, 'kind': kind, 'scale': s, 'tracking': trk, 'glyphs': glyphs})

    # centro da composição: bbox de todos os contornos no plano já rotacionado
    a = math.radians(angle)
    allx, ally = [], []
    polys = {}
    for el in elements:
        for gl in el['glyphs']:
            poly = glyph_polygon(gs, gl['g'], gl['x'], gl['y'], el['scale'])
            polys[(el['name'], gl['g'], gl['x'])] = poly
            for gx, gy in poly.exterior.coords if poly.geom_type == 'Polygon' else []:
                # rotação de tela (y-up): ângulo negativo em tela = horário? usamos y-up
                rx = gx * math.cos(-a) - gy * math.sin(-a)
                ry = gx * math.sin(-a) + gy * math.cos(-a)
                allx.append(rx)
                ally.append(ry)
    bbox_rot = [min(allx), min(ally), max(allx), max(ally)]
    ccx, ccy = (bbox_rot[0] + bbox_rot[2]) / 2, (bbox_rot[1] + bbox_rot[3]) / 2
    # volta o centro para o referencial do layout
    center = (ccx * math.cos(a) - ccy * math.sin(a), ccx * math.sin(a) + ccy * math.cos(a))

    # caminhos de neon
    for el in elements:
        if el['kind'] == 'silver':
            continue
        r, inset = NEON_RADIUS[el['kind']], NEON_INSET[el['kind']]
        el['tubeRadius'] = r
        for gl in el['glyphs']:
            poly = polys[(el['name'], gl['g'], gl['x'])]
            inner = poly.buffer(-inset, quad_segs=6, join_style='round').buffer(-6, quad_segs=6).buffer(6, quad_segs=6)
            rings = []
            geoms = getattr(inner, 'geoms', [inner])
            for gm in geoms:
                for ring in [gm.exterior, *gm.interiors]:
                    pts, length = resample(list(ring.coords), 6.0)
                    pts = start_bottom_left(pts)
                    rings.append({'length': round(length, 1),
                                  'points': [[round(p[0], 1), round(p[1], 1)] for p in pts]})
            gl['neon'] = rings

    out = {
        'source': 'ITC Avant Garde Std Bold (alternativos V=U+E04F, A=U+E000)',
        'unitsPerEm': tt['head'].unitsPerEm,
        'capHeight': CAP,
        'angleDeg': round(angle, 3),
        'center': [round(center[0], 2), round(center[1], 2)],
        'bboxRotated': [round(v, 1) for v in bbox_rot],
        'glyphs': {g: {'advance': gs[g].width, 'path': glyph_commands(gs, g)} for g in sorted(used)},
        'elements': elements,
    }
    dst = ROOT / 'assets/logo-geometry.json'
    dst.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
    print('wrote', dst, 'angle', out['angleDeg'], 'center', out['center'], 'bbox', out['bboxRotated'])
    for el in elements:
        print(el['name'], el['kind'], el['scale'], [(g['g'], g['x'], g['y'], len(g.get('neon', []))) for g in el['glyphs']])


if __name__ == '__main__':
    main()
