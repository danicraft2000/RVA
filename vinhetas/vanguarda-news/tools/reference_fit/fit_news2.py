import json, sys, numpy as np
sys.argv = [sys.argv[0], sys.argv[1], sys.argv[2]]
exec(open(f'{sys.argv[1]}/fit_news.py').read().split("th = -0.36")[0])
nfit = json.load(open(f'{D}/fit_news_{FONT}.json'))['news'][:5]
P = np.array(nfit + [0.105, -0.38, 405, 192, 0, 0.065, -0.38, 425, 200, 0], float)
rng = np.random.default_rng(5)
# stage 1: EWS only (N fixed), echo excluded
PARTS[:] = ['N', 'EWS']
mask = np.ones(10, bool); mask[:5] = False
def sub_opt(P, idx, r, it, PL):
    PARTS[:] = PL
    sc0 = make_score(r)
    n = len(PL)*5
    def sc(sub):
        Q = P[:n].copy(); Q[idx] = sub; return sc0(Q)
    st = np.array([0.005, 0.03, 6, 6, 30, 0.004, 0.03, 6, 6, 30, 0.004, 0.03, 6, 6, 30])[idx]
    sub, b = opt(P[idx].copy(), st, sc, it, rng)
    P = P.copy(); P[idx] = sub
    return P, b
for r in (5, 3, 2):
    P, b = sub_opt(P, np.arange(5, 10), r, 25, ['N', 'EWS'])
    print('EWS', r, round(b, 4), np.round(P[5:10], 4).tolist(), flush=True)
for r in (4, 2.5):
    P, b = sub_opt(P, np.arange(10, 15), r, 25, ['N', 'EWS', 'EW'])
    print('EW', r, round(b, 4), np.round(P[10:15], 4).tolist(), flush=True)
PARTS[:] = ['N', 'EWS', 'EW']
json.dump({'news': P.tolist(), 'score': b}, open(f'{D}/fit_news2_{FONT}.json', 'w'))
m = render(P)
vis = np.zeros((H, W, 3), np.uint8); vis[ref] = (110, 30, 30); vis[m] = (0, 160, 255); vis[m & ref] = (255, 255, 255)
Image.fromarray(vis).crop((200, 0, 640, 260)).resize((880, 520)).save(f'{D}/fit_news2_{FONT}.png')
