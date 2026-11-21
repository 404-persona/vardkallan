# Skriver Vårdkällans Schematron-regler ur TKB (app/rivta-regler/<domän>/<Kontrakt>.sch). Varje assert har id för
# regeln i regelförteckningen. Namnen står som *:namn, så att reglerna gäller oberoende av prefix och namnrymd.
import json, os, sys
from xml.sax.saxutils import escape, quoteattr

APP = '/home/darkstar/Projekt/vk-ts2/app'
TS = '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]$'
DATUM = '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$'
UUID = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
OID = r'^[0-2](\.[0-9]+)+$'
PNR = '^(18|19|20)[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[0-9]{4}$'
SAMNR = '^(18|19|20)[0-9]{2}(0[1-9]|1[0-2])(6[1-9]|[78][0-9]|9[01])[0-9]{4}$'
HSA = '^[A-Za-z0-9][A-Za-z0-9-]*$'
PNR_OID = '1.2.752.129.2.1.3.1'
SAM_OID = '1.2.752.129.2.1.3.3'


class Sch:
    def __init__(self, titel, regler):
        self.titel = titel
        self.monster = []
        self.ids = set()
        self.kanda = {r['id'] for r in regler}

    def m(self, namn, regler):
        # regler: [(context, [(id, test, text)])]
        for _, asserts in regler:
            for i, _, _ in asserts:
                if i not in self.kanda:
                    raise SystemExit(f'{self.titel}: regeln {i} finns inte i förteckningen')
                self.ids.add(i)
        self.monster.append((namn, regler))

    def skriv(self, fil):
        ut = ['<?xml version="1.0" encoding="UTF-8"?>',
              f'<!-- Vårdkällans regler ur TKB för {escape(self.titel)}, skrivna som Schematron. Varje assert har id för regeln i',
              '     regelförteckningen bredvid (samma namn, .json). Reglerna körs av app/src/rivta/schematron.js i test/rivta-regler-*.test.js. -->',
              '<iso:schema xmlns:iso="http://purl.oclc.org/dsdl/schematron" queryBinding="xslt2">',
              f'  <iso:title>{escape(self.titel)}</iso:title>']
        for namn, regler in self.monster:
            ut.append(f'  <iso:pattern id={quoteattr(namn)}>')
            for ctx, asserts in regler:
                ut.append(f'    <iso:rule context={quoteattr(ctx)}>')
                for i, test, text in asserts:
                    ut.append(f'      <iso:assert id={quoteattr(i)} test={quoteattr(test)}>{escape(text)}</iso:assert>')
                ut.append('    </iso:rule>')
            ut.append('  </iso:pattern>')
        ut.append('</iso:schema>')
        open(fil, 'w', encoding='utf-8').write('\n'.join(ut) + '\n')


def cv(s, namn, falt, code=None, codeSystem=None, displayName=None, originalText=None, dnKrav=None, oid=None):
    """CVType: kod kräver kodsystem och klartext, och originalText står ensam."""
    a = []
    if code: a.append((f'*:{falt}', [(code, 'not(*:code) or (*:codeSystem and *:displayName)', f'Om code anges i {falt} ska också codeSystem och displayName anges.')]))
    if codeSystem: a.append((f'*:{falt}/*:codeSystem', [(codeSystem, f"(../*:code and ../*:displayName) and matches(., '{OID}')", f'Om codeSystem anges i {falt} ska också code och displayName anges, och codeSystem ska vara en OID.')]))
    if displayName: a.append((f'*:{falt}/*:displayName', [(displayName, '../*:code and ../*:codeSystem', f'Om displayName anges i {falt} ska också code och codeSystem anges.')]))
    if dnKrav: a.append((f'*:{falt}/*:code', [(dnKrav, 'normalize-space(../*:displayName)', f'När code anges i {falt} ska displayName anges (samma värde som code om klartext saknas).')]))
    if originalText: a.append((f'*:{falt}/*:originalText', [(originalText, 'not(../*:code) and not(../*:codeSystem) and not(../*:codeSystemName) and not(../*:codeSystemVersion) and not(../*:displayName)', f'Om originalText anges i {falt} ska inget annat värde anges.')]))
    if oid:
        i, varden, text = oid
        villkor = ' or '.join(f". = '{v}'" for v in varden)
        a.append((f'*:{falt}/*:codeSystem', [(i, villkor, text)]))
    # Varje regel i ett eget mönster, så att ingen regel skuggar en annan för samma nod.
    for n, (ctx, asserts) in enumerate(a):
        s.m(f'{namn}-{falt}-{n}', [(ctx, asserts)])


def tider(s, namn, element, id_ts, id_datum=None, datum=()):
    for e in element:
        s.m(f'{namn}-tid-{e}', [(f'*:{e}', [(id_ts, f"matches(., '{TS}')", f'{e} ska vara en tidpunkt ÅÅÅÅMMDDttmmss utan tidszon.')])])
    for e in datum:
        s.m(f'{namn}-datum-{e}', [(e, [(id_datum, f"matches(., '{DATUM}')", 'Ett datum ska vara ÅÅÅÅMMDD.')])])


def patient(s, namn, ctx, id_id, id_pnr, id_sam):
    a = []
    if id_id: a.append((id_id, "string-length(*:id) = 12 and not(matches(*:id, '[ -+]'))", 'Patientens id ska ha tolv tecken utan avskiljare.'))
    if id_pnr: a.append((id_pnr, f"not(matches(*:id, '{PNR}')) or *:type = '{PNR_OID}'", 'Ett personnummer ska ha Skatteverkets OID för personnummer.'))
    if id_sam: a.append((id_sam, f"not(matches(*:id, '{SAMNR}')) or *:type = '{SAM_OID}'", 'Ett samordningsnummer ska ha Skatteverkets OID för samordningsnummer.'))
    s.m(f'{namn}-patient', [(ctx, a)])


def finnsInte(s, namn, ctx, falt):
    # falt: [(element, id)]
    s.m(f'{namn}-ej-{ctx}', [(f'*:{ctx}', [(i, f'not(*:{e})', f'{e} ska inte anges (N/A, 0..0 i TKB).') for e, i in falt])])


def resultat(s, namn, svar, id_finns, id_error, id_logid, id_felkod=None):
    s.m(f'{namn}-resultat', [(f'*:{svar}', [(id_finns, '*:result/*:resultCode and *:result/*:logId', 'Svaret ska ha result med resultCode och logId.')])])
    s.m(f'{namn}-resultat-kod', [('*:result', [(id_error, "(*:resultCode = 'ERROR' and *:errorCode) or (*:resultCode != 'ERROR' and not(*:errorCode))", 'errorCode anges endast när resultCode är ERROR.'),
                                                 (id_logid, f"matches(*:logId, '{UUID}')", 'logId ska vara en UUID.')] + ([(id_felkod, "*:resultCode != 'ERROR' or *:errorCode = 'INVALID_REQUEST'", 'Ett logiskt fel har errorCode INVALID_REQUEST.')] if id_felkod else []))])


def vardpersonal(s, namn, id_namn, id_roll_oid, id_org, regel1, id_cu=None, id_cg=None):
    a = []
    if id_namn: a.append((id_namn, 'not(*:healthcareProfessionalHSAId) or normalize-space(*:healthcareProfessionalName)', 'Namnet ska anges när personen är känd.'))
    if id_org: a.append((id_org, 'normalize-space(*:healthcareProfessionalOrgUnit/*:orgUnitHSAId) and normalize-space(*:healthcareProfessionalOrgUnit/*:orgUnitName)', 'Organisationen ska anges med HSA-id (eller lokalt id) och namn.'))
    if regel1: a.append((regel1, 'normalize-space(*:healthcareProfessionalCareUnitHSAId) and normalize-space(*:healthcareProfessionalCareGiverHSAId)', 'Vårdenhetens och vårdgivarens HSA-id ska anges (Regel 1).'))
    if id_cu: a.append((id_cu, 'normalize-space(*:healthcareProfessionalCareUnitHSAId)', 'Vårdenhetens HSA-id ska anges.'))
    if id_cg: a.append((id_cg, 'normalize-space(*:healthcareProfessionalCareGiverHSAId)', 'Vårdgivarens HSA-id ska anges.'))
    s.m(f'{namn}-vardpersonal', [('*:accountableHealthcareProfessional', a)])
    if id_roll_oid:
        s.m(f'{namn}-befattning', [('*:healthcareProfessionalRoleCode/*:codeSystem', [(id_roll_oid, ". = '1.2.752.129.2.2.1.4'", 'Befattningen ska om möjligt ha KV Befattning (1.2.752.129.2.2.1.4).')])])


def las(doman, kontrakt):
    return json.load(open(os.path.join(APP, 'rivta-regler', doman, f'{kontrakt}.json'), encoding='utf-8'))['regler']


def skriv(doman, kontrakt, bygg):
    s = Sch(f'{kontrakt} ({doman})', las(doman, kontrakt))
    bygg(s)
    s.skriv(os.path.join(APP, 'rivta-regler', doman, f'{kontrakt}.sch'))
    print(kontrakt, len(s.ids), 'regler i Schematron')
    return s.ids
