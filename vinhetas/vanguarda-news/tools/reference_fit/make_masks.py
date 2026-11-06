"""Gera as máscaras de silhueta (prata e vermelho) a partir do ÚLTIMO quadro da
vinheta histórica, usadas somente para medir as proporções da logo final.

O vídeo de referência NÃO é distribuído neste repositório.

Uso:
  ffmpeg -sseof -0.1 -i referencia.mp4 -frames:v 1 last.png
  python3 make_masks.py last.png <pasta_de_trabalho>
  # copie AGBold.ttf / AGDemi.ttf (ITC Avant Garde Std) para a pasta de trabalho
  python3 fit_rows.py <pasta>; python3 fit_news.py <pasta> AGBold.ttf
  python3 fit_news2.py <pasta> AGBold.ttf; python3 build_layout.py <pasta>
  → <pasta>/layout_raw.json  (equivale a tools/reference-fit.json)
"""
import sys

import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(src).convert('RGB').resize((1280, 960))).astype(float)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
mx, mn = im.max(-1), im.min(-1)
silver = (mx > 95) & ((mx - mn) < 60)                    # faces cromadas (baixa saturação)
red = (r > 110) & (r > g * 1.8) & (r > b * 1.8)          # neon vermelho
Image.fromarray((silver * 255).astype('uint8')).save(f'{out}/silver.png')
Image.fromarray((red * 255).astype('uint8')).save(f'{out}/red.png')
print('máscaras salvas em', out)
