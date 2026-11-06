"""Controle de qualidade de movimento: diferença média entre quadros consecutivos.

Detecta quadros congelados (diferença ~0), saltos/pops (picos isolados) e
quadros pretos. Uso: python3 tools/motion_check.py output/arquivo.mp4
"""
import subprocess
import sys

import numpy as np

path = sys.argv[1]
W, H = 320, 180
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', f'scale={W}:{H},format=gray', '-f', 'rawvideo', '-'],
                     capture_output=True, check=True).stdout
fr = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)
d = np.abs(np.diff(fr, axis=0)).mean(axis=(1, 2))
lum = fr.mean(axis=(1, 2))
print(f'quadros: {len(fr)}  duração: {len(fr) / 30:.2f} s')
print(f'luminância média: min {lum.min():.1f} (quadro {lum.argmin()})  max {lum.max():.1f}')
print(f'quadros quase pretos (<4): {int((lum < 4).sum())}')
frozen = np.where(d < 0.05)[0]
print(f'transições congeladas (diff<0.05): {len(frozen)} {frozen[:20].tolist()}')
med = np.convolve(d, np.ones(5) / 5, mode='same')
spikes = np.where(d > np.maximum(3 * med, 4))[0]
print(f'picos (possíveis pops): {[(int(i + 1), round(float(d[i]), 2)) for i in spikes]}')
print('diff por segundo:', ' '.join(f'{d[i:i + 30].mean():.1f}' for i in range(0, len(d), 30)))
print('últimos 15 diffs:', ' '.join(f'{x:.2f}' for x in d[-15:]))
