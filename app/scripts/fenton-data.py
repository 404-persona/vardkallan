# Gör om Fentons kalkylblad för 2025 till datafilen som servern läser från FENTON_DATA.
#
# Kalkylbladet och datafilen är licensierade av Tanis Fenton (CC BY-NC-ND 4.0, med villkoren att användarna inte får se
# värdena och att de inte delas vidare). De får aldrig läggas i repot, i avbilden eller i en fixtur. Skriptet läser bara
# cellvärdena ur xlsx-filens XML med standardbiblioteket. Inga formler eller makron körs.
#
# Körs med python -I scripts/fenton-data.py <kalkylblad.xlsx> <utfil.json>. Utfilen får mode 600.
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
BLAD = 'daily LMS & key percentiles'
# Kolumnerna i bladet med dagliga värden: tid i veckor med decimaler, och L, M och S per kön och mått.
KOLUMNER = {
    'vikt': {'tid': 'C', 'K': ('D', 'E', 'F'), 'M': ('M', 'N', 'O')},
    'huvudomfang': {'tid': 'C', 'K': ('V', 'W', 'X'), 'M': ('AE', 'AF', 'AG')},
    'langd': {'tid': 'AP', 'K': ('AQ', 'AR', 'AS'), 'M': ('AZ', 'BA', 'BB')},
}
# Rubrikerna som ska stå i rad 2 och 4, så att skriptet stannar om bladet har ändrats.
RUBRIKER = {('D', 2): 'Girls', ('M', 2): 'Boys', ('F', 2): 'Weight', ('X', 2): 'Head circumference', ('AS', 2): 'Length',
            ('C', 4): 'Time, decimal', ('AP', 4): 'Time, decimal', ('D', 4): 'L', ('E', 4): 'M', ('F', 4): 'S'}


def las(xlsx):
    with zipfile.ZipFile(xlsx) as z:
        ss = []
        if 'xl/sharedStrings.xml' in z.namelist():
            for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall(f'{NS}si'):
                ss.append(''.join(t.text or '' for t in si.iter(f'{NS}t')))
        wb = ET.fromstring(z.read('xl/workbook.xml'))
        rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        mal = {r.get('Id'): r.get('Target') for r in rels}
        rid = next(s.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
                   for s in wb.iter(f'{NS}sheet') if s.get('name') == BLAD)
        blad = ET.fromstring(z.read('xl/' + mal[rid].lstrip('/').removeprefix('xl/')))
    celler = {}
    for row in blad.iter(f'{NS}row'):
        r = int(row.get('r'))
        for c in row.findall(f'{NS}c'):
            v = c.find(f'{NS}v')
            if v is None:
                continue
            col = re.match(r'[A-Z]+', c.get('r')).group(0)
            celler[(col, r)] = ss[int(v.text)] if c.get('t') == 's' else v.text
    return celler


def main(xlsx, ut):
    celler = las(xlsx)
    for (col, r), text in RUBRIKER.items():
        if (celler.get((col, r)) or '').strip() != text:
            sys.exit(f'Bladet ser inte ut som väntat i {col}{r}. Kontrollera kolumnerna i skriptet.')
    data = {}
    for matt, k in KOLUMNER.items():
        data[matt] = {}
        for kon in ('K', 'M'):
            rader = {}
            for (col, r), v in celler.items():
                if col != k['tid'] or r < 5:
                    continue
                dag = (float(v) - 22) * 7
                # Bara hela dagar. Första raden ligger på en halv dag och används inte av Fentons kalkylator.
                if abs(dag - round(dag)) > 1e-6:
                    continue
                lms = [celler.get((c, r)) for c in k[kon]]
                if None in lms:
                    continue
                rader[round(dag)] = [float(x) for x in lms]
            dagar = sorted(rader)
            if dagar != list(range(dagar[0], dagar[-1] + 1)):
                sys.exit(f'Dagarna för {matt} {kon} är inte sammanhängande.')
            data[matt][kon] = {'fran': dagar[0], 'lms': [rader[d] for d in dagar]}
    ut_data = {
        'format': 'vardkallan-fenton-1',
        'referens': 'Fenton 2025 Preterm Growth Chart',
        'enheter': {'vikt': 'g', 'langd': 'cm', 'huvudomfang': 'cm'},
        'dag': 'dagar efter 22 veckor och 0 dagar',
        'matt': data,
    }
    fd = os.open(ut, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(ut_data, f, separators=(',', ':'))
    os.chmod(ut, 0o600)
    print('Skrev', ut, {m: {kon: (v['fran'], v['fran'] + len(v['lms']) - 1) for kon, v in d.items()} for m, d in data.items()})


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit('Användning: python -I fenton-data.py <kalkylblad.xlsx> <utfil.json>')
    main(sys.argv[1], sys.argv[2])
