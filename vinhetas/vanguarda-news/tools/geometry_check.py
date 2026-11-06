"""QA de proporções: compara a logo projetada no quadro final com o layout plano
(medido na referência). Ajusta uma similaridade (escala+rotação+translação) entre
coordenadas do plano da logo e da tela; o resíduo mede distorção de perspectiva.

Uso: python3 tools/geometry_check.py output/anchors_<t>.json
"""
import json
import math
import sys

import numpy as np

d = json.load(open(sys.argv[1]))
P, Q, tags = [], [], []
for it in d['items']:
    for u, v, x, y in it['pts']:
        P.append((x, y)); Q.append((u, -v)); tags.append(it['glyph'])   # tela em y-up
P, Q = np.array(P), np.array(Q)
# similaridade por mínimos quadrados (Umeyama)
mp, mq = P.mean(0), Q.mean(0)
Pc, Qc = P - mp, Q - mq
U, S_, Vt = np.linalg.svd(Qc.T @ Pc)
R = U @ Vt
if np.linalg.det(R) < 0:
    U[:, -1] *= -1; R = U @ Vt
s = S_.sum() / (Pc ** 2).sum()
pred = (s * (R @ Pc.T)).T + mq
res = np.linalg.norm(pred - Q, axis=1)
span = np.ptp(Q, axis=0)
diag = math.hypot(*span)
ang = math.degrees(math.atan2(R[1, 0], R[0, 0]))
print(f"t = {d['t']} s   quadro {d['width']}x{d['height']}")
print(f"rotação da composição na tela: {ang:.2f}° (referência histórica: 21.884°)")
print(f"escala: {s:.2f} px por unidade de mundo")
print(f"resíduo RMS: {np.sqrt((res ** 2).mean()):.2f} px = {100 * np.sqrt((res ** 2).mean()) / diag:.3f}% da diagonal da logo")
print(f"resíduo máx: {res.max():.2f} px = {100 * res.max() / diag:.3f}%")
bx = Q[:, 0].min(), Q[:, 0].max(); by = -Q[:, 1].max(), -Q[:, 1].min()
W, H = d['width'], d['height']
print(f"caixa da logo na tela: x {bx[0]:.0f}–{bx[1]:.0f} ({100*(bx[1]-bx[0])/W:.1f}% da largura), y {by[0]:.0f}–{by[1]:.0f} ({100*(by[1]-by[0])/H:.1f}% da altura)")
print(f"centro da logo: ({(bx[0]+bx[1])/2/W*100:.1f}%, {(by[0]+by[1])/2/H*100:.1f}%) do quadro")
print(f"margens: esq {bx[0]/W*100:.1f}%  dir {100-bx[1]/W*100:.1f}%  topo {by[0]/H*100:.1f}%  base {100-by[1]/H*100:.1f}%")
# escala relativa por elemento (deve ser 1.00 entre letras: sem distorção diferencial)
for name in sorted(set(t.split(':')[1] if t.startswith('neon') else 'chrome' for t in tags)):
    idx = [i for i, t in enumerate(tags) if (t.split(':')[1] if t.startswith('neon') else 'chrome') == name]
    print(f"  {name:7s} resíduo médio {res[idx].mean():.2f} px")
