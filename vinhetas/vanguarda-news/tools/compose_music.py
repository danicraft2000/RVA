"""Trilha original da vinheta VANGUARDA NEWS — síntese 100% programada (numpy).

Nenhum áudio da vinheta original é usado. Gera:
  assets/audio/vanguarda-news-theme.wav   (48 kHz, estéreo, 24-bit PCM)
  assets/cues.json                        (tempos de sincronização usados pela animação)

Estrutura (120 BPM, 1 tempo = 0,5 s, Ré menor → Ré maior no final):
  Comp. 1  0,0–2,0  "Sinal"     pad Dm em crescendo + pulso de dados em semicolcheias
  Comp. 2  2,0–4,0  "Redação"   entra bumbo/baixo; Dm → Bb
  Comp. 3  4,0–6,0  "Forja"     8 impactos metálicos (um por letra) em colcheias; Gm → Eb
  Comp. 4  6,0–7,75 "Ignição"   zumbido de neon, rufo e riser; Asus4 → A; pausa 7,75–8,0
  Comp. 5  8,0–10,5 "Assinatura" acorde final Ré maior (metais + cordas + tímpano + prato)
"""
import json
import subprocess
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SR = 48000
BPM = 120
BEAT = 60 / BPM
DUR = 10.5
N = int(SR * DUR)
rng = np.random.default_rng(20031)  # semente fixa → render reprodutível


def midi(name):
    names = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
    n = names[name[0]]
    rest = name[1:]
    if rest.startswith('#'):
        n += 1
        rest = rest[1:]
    elif rest.startswith('b'):
        n -= 1
        rest = rest[1:]
    return 12 * (int(rest) + 1) + n


def hz(name):
    return 440.0 * 2 ** ((midi(name) - 69) / 12)


def stereo():
    return np.zeros((2, N))


def place(bus, sig, t0, pan=0.0, gain=1.0):
    """Mixa sinal mono/estéreo em `bus` a partir de t0 (s) com pan de potência constante."""
    i0 = int(round(t0 * SR))
    if i0 >= N:
        return
    if sig.ndim == 1:
        a = (pan + 1) * np.pi / 4
        sig = np.vstack([sig * np.cos(a), sig * np.sin(a)])
    n = min(sig.shape[1], N - i0)
    bus[:, i0:i0 + n] += gain * sig[:, :n]


def tvec(dur):
    return np.arange(int(dur * SR)) / SR


def env_adsr(dur, a, d, s, r):
    t = tvec(dur)
    e = np.ones_like(t) * s
    e[t < a] = t[t < a] / a
    m = (t >= a) & (t < a + d)
    e[m] = 1 - (1 - s) * (t[m] - a) / d
    rel = t > dur - r
    e[rel] *= np.clip((dur - t[rel]) / r, 0, 1)
    return e


def bl_saw(freq, dur, detune_cents=0.0, phase=0.0, max_h=10000):
    """Dente-de-serra limitada em banda (aditiva)."""
    t = tvec(dur)
    f = freq * 2 ** (detune_cents / 1200)
    out = np.zeros_like(t)
    k = 1
    while k * f < min(max_h, SR / 2 - 500):
        out += np.sin(2 * np.pi * k * f * t + phase * k) / k
        k += 1
    return out * (2 / np.pi)


def onepole_lp(x, cutoff):
    """Passa-baixas de 1 polo; cutoff escalar ou vetor (Hz)."""
    cutoff = np.broadcast_to(np.asarray(cutoff, float), x.shape)
    a = 1 - np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    z = 0.0
    for i in range(len(x)):
        z += a[i] * (x[i] - z)
        y[i] = z
    return y


def svf(x, cutoff, q=0.7, mode='lp'):
    """Filtro de estado variável (Chamberlin), cutoff pode variar no tempo."""
    cutoff = np.broadcast_to(np.asarray(cutoff, float), x.shape)
    f = 2 * np.sin(np.pi * np.clip(cutoff, 20, SR / 6) / SR)
    damp = 1 / q
    lp = bp = 0.0
    y = np.empty_like(x)
    for i in range(len(x)):
        hp = x[i] - lp - damp * bp
        bp += f[i] * hp
        lp += f[i] * bp
        y[i] = lp if mode == 'lp' else (bp if mode == 'bp' else hp)
    return y


def fft_filter(x, lo=None, hi=None):
    X = np.fft.rfft(x)
    fr = np.fft.rfftfreq(len(x), 1 / SR)
    g = np.ones_like(fr)
    if lo:
        g *= 1 / np.sqrt(1 + (lo / np.maximum(fr, 1)) ** 4)
    if hi:
        g *= 1 / np.sqrt(1 + (fr / hi) ** 4)
    return np.fft.irfft(X * g, len(x))


# ----------------------------------------------------------------- instrumentos
def kick(gain=1.0):
    t = tvec(0.6)
    f = 46 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7.5)
    click = fft_filter(rng.standard_normal(len(t)), lo=1500) * np.exp(-t * 180) * 0.25
    return np.tanh((body + click) * 1.6) * gain


def snare(gain=1.0, decay=14):
    t = tvec(0.35)
    noise = fft_filter(rng.standard_normal(len(t)), lo=900, hi=9000) * np.exp(-t * decay)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.6
    return (noise * 0.7 + tone) * gain


def hat(gain=1.0, decay=60):
    t = tvec(0.12)
    return fft_filter(rng.standard_normal(len(t)), lo=7000) * np.exp(-t * decay) * gain


def metal_hit(freq, gain=1.0):
    """Impacto metálico FM (letra cromada travando no lugar)."""
    t = tvec(1.4)
    idx = 6 * np.exp(-t * 9) + 0.4
    mod = np.sin(2 * np.pi * freq * 1.414 * t) * idx
    ring = np.sin(2 * np.pi * freq * t + mod) * np.exp(-t * 4.2)
    ring2 = np.sin(2 * np.pi * freq * 2.76 * t) * np.exp(-t * 9) * 0.35
    thump_f = 90 * np.exp(-t * 18) + 55
    thump = np.sin(2 * np.pi * np.cumsum(thump_f) / SR) * np.exp(-t * 16)
    trans = fft_filter(rng.standard_normal(len(t)), lo=2500) * np.exp(-t * 90) * 0.5
    return (ring * 0.55 + ring2 + thump * 0.8 + trans) * gain


def pluck(freq, gain=1.0, dur=0.22):
    t = tvec(dur)
    s = bl_saw(freq, dur, max_h=7000) * 0.5 + np.sin(2 * np.pi * freq * t) * 0.6
    s = onepole_lp(s, 900 + 5000 * np.exp(-t * 30))
    return s * np.exp(-t * 16) * np.clip(t / 0.002, 0, 1) * gain


def pad(notes, dur, attack=0.8, release=0.8, cutoff=1800, gain=1.0):
    acc = np.zeros(int(dur * SR))
    for n in notes:
        for dc in (-9, 0, 8):
            acc += bl_saw(hz(n), dur, dc, phase=rng.uniform(0, 6.28), max_h=6000)
    acc /= len(notes) * 3
    acc = onepole_lp(acc, cutoff)
    return acc * env_adsr(dur, attack, 0.3, 0.9, release) * gain


def brass(notes, dur, gain=1.0, bright=4200, attack=0.03, decay=0.0):
    t = tvec(dur)
    acc = np.zeros(len(t))
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.2 * t) * np.clip(t - 0.25, 0, 1)
    for n in notes:
        f = hz(n)
        for dc in (-6, 5):
            ph = 2 * np.pi * np.cumsum(f * 2 ** (dc / 1200) * vib) / SR
            k, s = 1, np.zeros(len(t))
            while k * f < 9000:
                s += np.sin(k * ph) / k
                k += 1
            acc += s
    acc /= len(notes) * 2
    cutoff = 500 + bright * np.exp(-t * 2.2) * np.clip(t / attack, 0, 1) + 700
    acc = svf(acc, cutoff, q=0.9)
    return acc * env_adsr(dur, attack, 0.25, 0.75, 0.6) * np.exp(-t * decay) * gain


def bass(note, dur, gain=1.0):
    t = tvec(dur)
    f = hz(note)
    s = bl_saw(f, dur, max_h=3000) * 0.6 + np.sin(2 * np.pi * f * t) * 0.8
    s = onepole_lp(s, 380 + 1600 * np.exp(-t * 14))
    return s * env_adsr(dur, 0.005, 0.1, 0.8, 0.05) * gain


def timpani(note, gain=1.0):
    t = tvec(2.2)
    f = hz(note) * (1 + 0.04 * np.exp(-t * 10))
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) + 0.4 * np.sin(1.5 * ph) * np.exp(-t * 3)
    head = fft_filter(rng.standard_normal(len(t)), lo=80, hi=900) * np.exp(-t * 25) * 0.5
    return (s * np.exp(-t * 2.4) + head) * gain


def crash(gain=1.0, dur=2.6):
    t = tvec(dur)
    n = fft_filter(rng.standard_normal(len(t)), lo=3500, hi=15000)
    shimmer = fft_filter(rng.standard_normal(len(t)), lo=6000) * 0.5
    e = np.exp(-t * 1.6) * (1 - np.exp(-t * 400))
    return (n + shimmer) * e * gain


def sub_boom(gain=1.0):
    t = tvec(2.4)
    f = 38 + 30 * np.exp(-t * 6)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.7) * gain


def bell(note, gain=1.0):
    t = tvec(2.0)
    f = hz(note)
    s = (np.sin(2 * np.pi * f * t) + 0.45 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t * 3)
         + 0.25 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t * 5)
         + 0.15 * np.sin(2 * np.pi * f * 4.2 * t + 2 * np.sin(2 * np.pi * f * t)) * np.exp(-t * 8))
    return s * np.exp(-t * 2.2) * (1 - np.exp(-t * 600)) * gain


def neon_buzz(dur, gain=1.0, seed=0):
    """Zumbido elétrico do neon acendendo (120 Hz + crepitação)."""
    r = np.random.default_rng(seed)
    t = tvec(dur)
    buzz = bl_saw(120, dur, max_h=4000) * 0.5 + bl_saw(240, dur, 4, max_h=4000) * 0.25
    flick = np.repeat(r.uniform(0.25, 1.0, int(dur * 60) + 1), SR // 60 + 1)[:len(t)]
    flick = onepole_lp(flick, 40)
    crackle = fft_filter(r.standard_normal(len(t)), lo=2000) * (r.random(len(t)) < 0.0025) * 6
    crackle = onepole_lp(crackle, 6000)
    s = svf(buzz, 1400, q=1.5) * flick + crackle * 0.4
    return s * gain


def riser(dur, gain=1.0):
    t = tvec(dur)
    x = t / dur
    noise = rng.standard_normal(len(t))
    s = svf(noise, 300 + 7000 * x ** 2.2, q=3.0, mode='bp')
    tone = np.sin(2 * np.pi * np.cumsum(220 + 660 * x ** 2) / SR) * 0.25
    return (s * 0.6 + tone) * (x ** 1.6) * gain


def whoosh(dur, gain=1.0, up=True):
    t = tvec(dur)
    x = t / dur
    sweep = (400 + 5000 * x ** 2) if up else (5400 - 5000 * x ** 0.5)
    s = svf(rng.standard_normal(len(t)), sweep, q=1.2, mode='bp')
    e = np.sin(np.pi * x) ** 1.5
    return s * e * gain


def reverb_ir(seconds=2.4, damp=5000):
    t = tvec(seconds)
    ir = np.zeros((2, len(t)))
    for c in range(2):
        n = rng.standard_normal(len(t)) * np.exp(-t * 3.0)
        ir[c] = fft_filter(n, lo=150, hi=damp)
        ir[c, :int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
    return ir / np.abs(ir).sum(axis=1, keepdims=True) * 18


def convolve(bus, ir):
    out = np.zeros_like(bus)
    L = bus.shape[1] + ir.shape[1]
    nfft = 1 << (L - 1).bit_length()
    for c in range(2):
        y = np.fft.irfft(np.fft.rfft(bus[c], nfft) * np.fft.rfft(ir[c], nfft), nfft)
        out[c] = y[:bus.shape[1]]
    return out


def loudnorm(path, target=-14.0, tp=-1.0):
    """Normalização EBU R128 em 2 passagens com FFmpeg (linear, sem compressão)."""
    base = ['ffmpeg', '-hide_banner', '-nostats', '-i', str(path)]
    af = f'loudnorm=I={target}:TP={tp}:LRA=11:print_format=json'
    r = subprocess.run(base + ['-af', af, '-f', 'null', '-'], capture_output=True, text=True, check=True)
    m = json.loads(r.stderr[r.stderr.rindex('{'):r.stderr.rindex('}') + 1])
    af2 = (f'loudnorm=I={target}:TP={tp}:LRA=11:linear=true:measured_I={m["input_i"]}:'
           f'measured_TP={m["input_tp"]}:measured_LRA={m["input_lra"]}:measured_thresh={m["input_thresh"]}:'
           f'offset={m["target_offset"]}')
    tmp = path.with_suffix('.tmp.wav')
    subprocess.run(base + ['-af', af2, '-ar', str(SR), '-c:a', 'pcm_s24le', '-y', str(tmp)],
                   capture_output=True, check=True)
    tmp.replace(path)
    print('loudnorm: entrada', m['input_i'], 'LUFS →', target, 'LUFS')


# ------------------------------------------------------------------- arranjo
def main():
    dry, wet = stereo(), stereo()

    def both(sig, t0, pan=0.0, g=1.0, send=0.3):
        place(dry, sig, t0, pan, g)
        place(wet, sig, t0, pan, g * send)

    cues = {'bpm': BPM, 'beat': BEAT, 'duration': DUR}

    # Comp. 1 — Sinal
    both(pad(['D3', 'A3', 'D4', 'F4'], 4.2, attack=1.8, release=0.6, cutoff=1300, gain=0.55), 0.0, 0, send=0.5)
    both(whoosh(1.0, 0.35, up=True), 1.05, -0.4, send=0.6)
    arp = ['D5', 'A4', 'F5', 'A4', 'D5', 'A4', 'G5', 'A4']
    for i in range(32):                 # 0,0 → 4,0 em semicolcheias
        t0 = i * BEAT / 2 / 2
        lvl = 0.10 + 0.22 * min(1, i / 16)
        both(pluck(hz(arp[i % 8]), lvl), t0, pan=0.5 * np.sin(i * 1.7), send=0.35)
    # blips de dados (sinais chegando) — cada blip liga um grupo de telas na animação
    cues['blips'] = []
    for k in range(10):
        t0 = 0.15 + k * 0.17 + rng.uniform(0, 0.05)
        cues['blips'].append(round(float(t0), 4))
        both(pluck(hz(rng.choice(['A5', 'D6', 'F6', 'E6'])), 0.07, dur=0.1), t0, pan=rng.uniform(-0.9, 0.9), send=0.6)

    # Comp. 2 — Redação
    kicks = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5]
    for t0 in kicks:
        both(kick(0.75), t0, 0, send=0.05)
    for i in range(16):                 # hats nas semicolcheias fracas 2,0 → 6,0
        t0 = 2.0 + i * BEAT / 2 + BEAT / 4
        both(hat(0.12 + 0.05 * (i % 2)), t0, pan=0.3, send=0.1)
    for i, (n, t0) in enumerate([('D2', 2.0), ('D2', 2.25), ('D2', 2.5), ('D3', 2.75),
                                 ('Bb1', 3.0), ('Bb1', 3.25), ('Bb1', 3.5), ('Bb2', 3.75),
                                 ('G1', 4.0), ('G1', 4.25), ('G1', 4.5), ('G2', 4.75),
                                 ('Eb2', 5.0), ('Eb2', 5.25), ('Eb2', 5.5), ('Eb2', 5.75)]):
        both(bass(n, 0.24, 0.42), t0, 0, send=0.02)
    both(pad(['Bb2', 'F3', 'Bb3', 'D4'], 1.2, attack=0.15, cutoff=1500, gain=0.45), 3.0, 0, send=0.5)

    # Comp. 3 — Forja: 8 letras = 8 impactos (V A G U A R D A)
    letter_times = [4.0 + i * BEAT / 2 for i in range(8)]
    letter_notes = ['D4', 'F4', 'G3', 'Bb3', 'D4', 'F4', 'A3', 'D4']
    letter_pans = [-0.6, -0.35, -0.55, -0.25, 0.05, 0.3, 0.35, 0.6]
    for t0, n, p in zip(letter_times, letter_notes, letter_pans):
        both(metal_hit(hz(n), 0.62), t0, pan=p, send=0.35)
    both(brass(['G3', 'Bb3', 'D4', 'G4'], 0.45, 0.6), 4.0, -0.1, send=0.35)
    both(brass(['Eb3', 'G3', 'Bb3', 'Eb4'], 0.45, 0.6), 5.0, 0.1, send=0.35)
    both(pad(['G2', 'D3', 'G3', 'Bb3'], 1.1, attack=0.05, cutoff=1700, gain=0.4), 4.0, 0, send=0.4)
    both(pad(['Eb3', 'G3', 'Bb3', 'Eb4'], 1.1, attack=0.05, cutoff=1700, gain=0.4), 5.0, 0, send=0.4)
    for t0 in (4.5, 5.5):
        both(snare(0.55), t0, 0.05, send=0.25)
    cues['letters'] = letter_times

    # Comp. 4 — Ignição do neon
    both(neon_buzz(1.0, 0.16, seed=1), 6.0, 0.15, send=0.2)     # N
    both(neon_buzz(0.75, 0.13, seed=2), 7.0, 0.45, send=0.2)    # EWS
    both(neon_buzz(2.4, 0.05, seed=3), 8.0, 0.3, send=0.15)     # hum residual
    for t0 in (6.0, 6.08, 6.31, 7.0, 7.12):                       # estalos de ignição
        both(hat(0.35, decay=120), t0, 0.4, send=0.4)
    both(pad(['A2', 'D3', 'E3', 'A3'], 1.05, attack=0.1, cutoff=1900, gain=0.45), 6.0, 0, send=0.4)
    both(pad(['A2', 'C#3', 'E3', 'A3'], 0.8, attack=0.05, cutoff=2300, gain=0.5), 7.0, 0, send=0.4)
    both(bass('A1', 1.7, 0.4), 6.0, 0, send=0.02)
    roll_t, k = 6.0, 0
    while roll_t < 7.75 - 1e-6:          # rufo acelerando
        x = (roll_t - 6.0) / 1.75
        both(snare(0.12 + 0.45 * x ** 1.5, decay=22), roll_t, -0.1, send=0.25)
        roll_t += BEAT / 4 if x < 0.5 else BEAT / 8
        k += 1
    both(riser(1.75, 0.5), 6.0, 0, send=0.5)
    cues['neonN'] = [6.0, 7.0]
    cues['neonEWS'] = [7.0, 7.75]
    cues['gap'] = [7.75, 8.0]

    # Comp. 5 — Assinatura
    HIT = 8.0
    both(sub_boom(0.9), HIT, 0, send=0.0)
    both(kick(1.0), HIT, 0, send=0.1)
    both(timpani('D2', 0.9), HIT, 0, send=0.3)
    both(crash(0.5), HIT, 0.0, send=0.5)
    both(brass(['D3', 'F#3', 'A3', 'D4', 'F#4', 'A4'], 2.45, 0.85, bright=5200, attack=0.02, decay=1.1), HIT, 0, send=0.5)
    both(pad(['D3', 'A3', 'D4', 'F#4', 'A4'], 2.5, attack=0.05, release=1.9, cutoff=2400, gain=0.32), HIT, 0, send=0.6)
    both(bass('D2', 1.1, 0.45), HIT, 0, send=0.02)
    both(bell('A5', 0.22), 8.5, 0.35, send=0.6)
    both(bell('D6', 0.2), 8.75, 0.5, send=0.6)
    cues['hit'] = HIT
    cues['echo'] = 8.5
    cues['sweep'] = [8.75, 10.0]

    mix = dry + convolve(wet, reverb_ir())
    # fade final suave só no áudio (vídeo continua em movimento até o fim)
    tail = int(0.35 * SR)
    mix[:, -tail:] *= np.linspace(1, 0, tail) ** 2
    mix[:, :int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
    # master: normalização de pico (o loudnorm de 2 passagens vem depois)
    mix *= 10 ** (-3 / 20) / np.abs(mix).max()

    out = ROOT / 'assets/audio/vanguarda-news-theme.wav'
    out.parent.mkdir(parents=True, exist_ok=True)
    pcm = (np.clip(mix.T, -1, 1) * (2 ** 23 - 1)).astype('<i4')
    b24 = np.frombuffer(pcm.tobytes(), dtype=np.uint8).reshape(-1, 4)[:, :3].tobytes()
    with wave.open(str(out), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(3)
        w.setframerate(SR)
        w.writeframes(b24)
    loudnorm(out)
    (ROOT / 'assets/cues.json').write_text(json.dumps(cues, indent=1))
    rms = np.sqrt((mix ** 2).mean())
    print('wrote', out, 'peak dBFS', round(20 * np.log10(np.abs(mix).max()), 2), 'rms dBFS', round(20 * np.log10(rms), 2))


if __name__ == '__main__':
    main()
