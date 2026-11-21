# Länkar reglerna i app/rivta-regler/<domän>/<Kontrakt>.json till testerna: id i <Kontrakt>.sch prövas av testet för
# fältreglerna (svaren) eller av konsumenttestet (begäran), och id i provar('<Kontrakt>', [...]) prövas av testet där
# anropet står. Övriga regler får prövas false med skäl. Avvikelser som Vårdkällan inte rättar står i AVVIKELSER nedan.
import json, glob, os, re, sys
APP = '/home/darkstar/Projekt/vk-ts2/app'
sys.path.insert(0, os.path.dirname(__file__))
from avvikelser import AVVIKELSER, SCH_TEST, SCH_BEGARAN

def tester():
    """Ger {kontrakt: {id: testnamn}} ur testfilerna."""
    ut = {}
    for f in sorted(glob.glob(os.path.join(APP, 'test', 'rivta-regler-*.test.js'))):
        s = open(f, encoding='utf-8').read()
        # describe-namnen: konstanten T och eventuella tillägg.
        T = re.search(r"^const T = '([^']+)';", s, re.M).group(1)
        describe = None
        aktuell = None
        for rad in s.split('\n'):
            m = re.match(r"\s*describe\((?:T|`\$\{T\}([^`]*)`)", rad)
            if m: describe = T + (m.group(1) or '')
            m = re.match(r"\s*test\('([^']+)'", rad)
            if m: aktuell = f'{describe} > {m.group(1)}'
            for k, ids in re.findall(r"provar\('(\w+)', \[([^\]]*)\]\)", rad):
                for i in re.findall(r"'([^']+)'", ids):
                    ut.setdefault(k, {}).setdefault(i, aktuell)
            m = re.search(r"for \(const k of (\[[^\]]*\]|\[\.\.\.(\w+), \.\.\.(\w+)\]|(\w+))\) provar\(k, \[([^\]]*)\]\)", rad)
            if m:
                L = {'SPARR': ['CheckBlocks', 'GetAllBlocksForPatient', 'GetBlocksForPatient', 'RegisterTemporaryExtendedRevoke', 'CancelTemporaryExtendedRevoke'], 'SAMTYCKE': ['CheckConsent', 'RegisterExtendedConsent', 'CancelExtendedConsent', 'GetExtendedConsentsForPatient']}
                kontrakt = L[m.group(4)] if m.group(4) else (L[m.group(2)] + L[m.group(3)]) if m.group(2) else re.findall(r"'(\w+)'", m.group(1))
                for k in kontrakt:
                    for i in re.findall(r"'([^']+)'", m.group(5)):
                        ut.setdefault(k, {}).setdefault(i, aktuell)
    return ut

def schIds(doman, kontrakt):
    f = os.path.join(APP, 'rivta-regler', doman, f'{kontrakt}.sch')
    return set(re.findall(r'<iso:assert id="([^"]+)"', open(f, encoding='utf-8').read())) if os.path.exists(f) else set()

T = tester()
summa = {}
for f in sorted(glob.glob(os.path.join(APP, 'rivta-regler', '*', '*.json'))):
    if f.endswith('.data.json') or f.endswith('.exempelfel.json'): continue
    d = json.load(open(f, encoding='utf-8'))
    k, doman = d['kontrakt'], d['domän']
    sch = schIds(doman, k)
    for r in d['regler']:
        r['prövbar'] = r.pop('prövbar', r.get('prövas'))
        for x in ('test', 'skäl', 'status'): r.pop(x, None) if x != 'skäl' else None
        i = r['id']
        test = T.get(k, {}).get(i)
        if not test and i in sch:
            test = SCH_BEGARAN.get(k) if i in SCH_BEGARAN.get(f'{k}:id', set()) else SCH_TEST.get(k)
        if (k, i) in AVVIKELSER:
            r['prövas'] = False; r['status'] = 'avvikelse'; r['skäl'] = AVVIKELSER[(k, i)]
        elif test and (k, i) not in AVVIKELSER:
            r['prövas'] = True; r['status'] = 'prövas'; r['test'] = test; r.pop('skäl', None)
        elif r['gäller'] == 'konsument' and 'konsument' not in d.get('vårdkällansRoll', []):
            r['prövas'] = False; r['status'] = 'inte tillämplig'
            r['skäl'] = f'Vårdkällan är inte konsument av {k}, så kravet på konsumenten gäller inte Vårdkällan.'
        elif not r['prövbar']:
            r['prövas'] = False; r['status'] = 'inte automatiskt'
            r['skäl'] = r.get('skäl') or r.get('hur')
        else:
            r['prövas'] = False; r['status'] = 'inte prövad än'
            r['skäl'] = 'Regeln går att pröva automatiskt men har inget test än. Förslag till test: ' + (r.get('hur') or '')
        # Fältens ordning.
        ordning = ['id', 'avsnitt', 'rubrik', 'text', 'källa', 'tkb', 'tkbVersion', 'gäller', 'gemensam', 'prövbar', 'prövas', 'status', 'test', 'skäl', 'hur']
        ny = {x: r[x] for x in ordning if x in r}
        r.clear(); r.update(ny)
    open(f, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
    s = {}
    for r in d['regler']: s[r['status']] = s.get(r['status'], 0) + 1
    summa[k] = (len(d['regler']), s)
for k, (n, s) in summa.items(): print(f'{k}: {n} regler, {s}')
