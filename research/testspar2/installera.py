# Flyttar regelutkasten till app/rivta-regler och lagar citat som påverkades av att TKB-texten fick mellanslag och ¶
# mellan stycken i tabellceller. Citatet ska vara en exakt delsträng av den normaliserade texten.
import json, glob, os, re, sys
APP = '/home/darkstar/Projekt/vk-ts2/app'
UT = os.path.join(APP, 'rivta-regler')
norm = lambda s: re.sub(r'\s+', ' ', s)
texter = {}
def text(doman, tkbfil):
    k = (doman, tkbfil)
    if k not in texter: texter[k] = norm(open(os.path.join(APP, 'rivta', doman, tkbfil), encoding='utf-8').read())
    return texter[k]
def laga(citat, t):
    c = norm(citat).strip()
    if c in t: return c
    # Jämför utan blanktecken och ¶, och ta motsvarande del av texten.
    idx = [i for i, ch in enumerate(t) if not ch.isspace() and ch != '¶']
    platt = ''.join(t[i] for i in idx)
    q = ''.join(ch for ch in c if not ch.isspace() and ch != '¶')
    p = platt.find(q)
    if p < 0: return None
    return t[idx[p]:idx[p + len(q) - 1] + 1]
fel = 0; lagade = 0
for f in sorted(glob.glob('/home/darkstar/tmp/ts2/utkast/*/*.json')):
    d = json.load(open(f, encoding='utf-8'))
    doman = d['domän']
    for r in d['regler']:
        kalla = r.get('källa')
        if kalla:
            dd, rest = kalla.split('/', 1)
        else:
            dd, rest = doman, d['tkb']
        t = text(dd, rest)
        ny = laga(r['text'], t)
        if ny is None:
            fel += 1; print('HITTAS INTE', f.split('/')[-1], r['id'], r['text'][:80]); continue
        if ny != norm(r['text']).strip(): lagade += 1
        r['text'] = ny
        if kalla: r['källa'] = f'{dd}/{rest}'
    os.makedirs(os.path.join(UT, doman), exist_ok=True)
    open(os.path.join(UT, doman, os.path.basename(f)), 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
print('lagade', lagade, 'fel', fel)
