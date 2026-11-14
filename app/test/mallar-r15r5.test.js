// Runda 15, r5: mallarnas innehåll. Yrkesmallar och undersköterskans anteckning (F3), omvårdnadsprocessen med
// föreslagna statusområden (F4), formulärens förifyllnad ur läkemedelslistan, NEWS2 och förra svaret (F7) och
// fackspråket (F8). Testnamnen står i src/sussa/runda15-r5.js.
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { byggSeed, idag } from '../src/db.js';
import { Atkomst } from '../src/atkomst.js';
import * as journal from '../src/journal.js';
import * as fm from '../src/formularmotor.js';
import * as R from '../public/js/formularmotor-regler.js';
import * as konfiguration from '../src/konfiguration.js';
import * as yrken from '../src/mallar-yrken.js';
import * as omv from '../src/omvardnadsprocess.js';
import * as vardplan from '../src/vardplan.js';
import * as fallrisk from '../src/fallrisklakemedel.js';
import { registreraNews2 } from '../src/vitalparametrar.js';
import * as nf from '../src/fackssprak.js';
import { foreslagnaSokord } from '../src/mallforslag.js';
import { personal, testserver, klient } from './hjalp.js';
import { stallKlockan, aterstallKlockan } from './falsk-klocka.js';

const NU = new Date('2026-11-08T10:00:00Z');
const atk = (db, pid, patient, handling = 'skriv_omvardnad', val = {}) => new Atkomst(db, personal(db, pid), patient, val, handling);
const fel = (fn) => { try { fn(); } catch (e) { return e; } return null; };
const rad = (db, id) => journal.hamtaAnteckningRad(db, id);
const sokordAv = (o) => Object.entries(o).map(([sokord, text]) => ({ sokord, text }));

let app;
beforeAll(() => { app = testserver(); });
afterAll(() => app.stopp());
beforeEach(() => stallKlockan(NU));
afterEach(() => aterstallKlockan());

describe('Yrkesmallar', () => {
  test('undersköterskan skriver observationsanteckningar och ingen annan mall, och sjuksköterskan ser anteckningen', () => {
    const db = byggSeed(NU);
    const usk = atk(db, 'usk-kard', 'p01');
    const a = journal.skapaAnteckning(usk, { typ: 'Observationsanteckning', sokord: sokordAv({ Observation: 'Blek och svettig efter frukost.', 'Utförd åtgärd': 'Mätte puls och sa till sjuksköterskan.' }) });
    expect(a).toMatchObject({ kategori: 'omvardnad', status: 'utkast' });
    expect(journal.signera(usk, rad(db, a.id)).status).toBe('signerad');
    // Andra mallar stoppas på servern, med en förklaring om vem som skriver med dem.
    const e = fel(() => journal.skapaAnteckning(usk, { typ: 'Omvårdnadsanteckning', sokord: sokordAv({ Sömn: 'Sov gott.' }) }));
    expect(e.status).toBe(403);
    expect(e.message).toContain('sjuksköterskor');
    expect(e.message).toContain('observationsanteckning');
    expect(fel(() => journal.skapaAnteckning(usk, { typ: 'Tobaksvanor', tobak: {} })).status).toBe(403);
    expect(fel(() => journal.skapaAnteckning(usk, { typ: 'Daganteckning', sokord: sokordAv({ Aktuellt: 'x' }) })).status).toBe(403);
    // Sjuksköterskan och läkaren läser den. Undersköterskan läser fortfarande inte läkarnas anteckningar.
    for (const pid of ['ssk-kard', 'lak-kard']) expect(journal.listaAnteckningar(atk(db, pid, 'p01', 'las_omvardnad')).anteckningar.some(x => x.id === a.id)).toBe(true);
    expect(journal.listaAnteckningar(atk(db, 'usk-kard', 'p01', 'las_omvardnad')).anteckningar.every(x => x.kategori === 'omvardnad')).toBe(true);
    // Andra yrkens mallar: fysioterapeuten skriver inte observationsanteckningar.
    expect(fel(() => journal.skapaAnteckning(atk(db, 'fys-kard', 'p04'), { typ: 'Observationsanteckning', sokord: sokordAv({ Observation: 'x' }) })).status).toBe(403);
  });

  test('mallarna i API:t är bara yrkets, och yrkets huvudmall står först', async () => {
    const mallar = async (pid) => { const k = klient(app); await k.logga(pid); return (await k.get('/api/mallar')).data; };
    const usk = await mallar('usk-kard');
    expect(usk.map(m => m.typ)).toEqual(['Observationsanteckning', 'Fallriskbedömning']);
    expect(usk[0]).toMatchObject({ huvudmall: true, sokord: ['Observation', 'Utförd åtgärd'] });
    const fys = await mallar('fys-kard');
    expect(fys[0]).toMatchObject({ typ: 'Fysioterapianteckning', huvudmall: true, sokord: ['Funktion', 'Aktivitet', 'Mål', 'Åtgärd', 'Resultat'] });
    expect(fys.map(m => m.typ)).not.toContain('Omvårdnadsanteckning');
    const ssk = await mallar('ssk-kard');
    expect(ssk[0]).toMatchObject({ typ: 'Omvårdnadsanteckning', huvudmall: true });
    expect(ssk.map(m => m.typ)).not.toContain('Observationsanteckning');
    expect(ssk.map(m => m.typ)).not.toContain('Daganteckning');
    const lak = await mallar('lak-kard');
    expect(lak.map(m => m.typ)).toEqual(expect.arrayContaining(['Daganteckning', 'Epikris', 'Omvårdnadsanteckning']));
    for (const typ of ['Observationsanteckning', 'Fysioterapianteckning', 'Kuratorsanteckning']) expect(lak.map(m => m.typ)).not.toContain(typ);
    // Mallarna för yrken som inte finns i demon finns, byggda kring funktion, aktivitet, mål, åtgärd och resultat.
    expect(journal.MALLAR.find(m => m.typ === 'Arbetsterapianteckning').sokord).toEqual(['Aktivitet', 'Funktion', 'Mål', 'Åtgärd', 'Resultat']);
    expect(journal.MALLAR.find(m => m.typ === 'Kuratorsanteckning').sokord).toContain('Sociala förhållanden');
    expect(journal.MALLAR.find(m => m.typ === 'Dietistanteckning').sokord).toContain('Nutrition');
  });

  test('vilka yrken som skriver med vilka mallar är en parameter med fyra ögon, och behörigheten går inte att vidga', () => {
    const db = byggSeed(NU);
    const nyckel = 'journal.yrkesmallar.underskoterska';
    expect(konfiguration.parametrar()[nyckel]).toMatchObject({ omrade: 'strukturerad', typ: 'lista', standard: ['Observationsanteckning', 'Fallriskbedömning'] });
    expect(konfiguration.varde(db, nyckel)).toEqual(['Observationsanteckning', 'Fallriskbedömning']);
    // En läkaranteckning kan inte ges till undersköterskan, och en mall som inte finns förklaras.
    expect(konfiguration.prova(nyckel, 'Observationsanteckning, Daganteckning').varfor).toContain('behörighet');
    expect(konfiguration.forhandsvisa(db, personal(db, 'sysf'), { nyckel, varde: 'Observationsanteckning, Påhittad' }).varfor).toContain('ingen av journalens mallar');
    expect(konfiguration.prova('journal.yrkesmallar.sjukskoterska', 'Omvårdnadsanteckning, Epikris').varfor).toContain('behörighet');
    expect(konfiguration.prova(nyckel, 'observationsanteckning, omvårdnadsanteckning')).toEqual({ ok: true, varde: ['Observationsanteckning', 'Omvårdnadsanteckning'] });
    // Ändringen föreslås av en systemförvaltare och gäller först när en annan har godkänt den.
    const f = konfiguration.foresla(db, personal(db, 'sysf'), { nyckel, varde: 'Observationsanteckning, Omvårdnadsanteckning', giltigFran: idag(), motivering: 'Undersköterskorna på avdelningen skriver omvårdnadsanteckningar.' });
    expect(yrken.mallarForYrke(db, 'underskoterska')).toEqual(['Observationsanteckning', 'Fallriskbedömning']);
    expect(fel(() => konfiguration.godkann(db, personal(db, 'sysf'), f.andring.id)).status).toBe(403);
    konfiguration.godkann(db, personal(db, 'sysf-2'), f.andring.id);
    expect(yrken.mallarForYrke(db, 'underskoterska')).toEqual(['Observationsanteckning', 'Omvårdnadsanteckning']);
    const a = journal.skapaAnteckning(atk(db, 'usk-kard', 'p01'), { typ: 'Omvårdnadsanteckning', sokord: sokordAv({ Sömn: 'Sov gott.' }) });
    expect(a.typ).toBe('Omvårdnadsanteckning');
    // Resultat mot vårdplanens mål kräver fortfarande vårdplanens behörighet, som undersköterskan inte har.
    const mal = db.query("SELECT m.id FROM vardplan_mal m JOIN vardplaner p ON p.id = m.plan_id WHERE p.patient_id = 'p04' AND p.status = 'aktiv'").get().id;
    expect(fel(() => journal.skapaAnteckning(atk(db, 'usk-kard', 'p04'), { typ: 'Omvårdnadsanteckning', sokord: sokordAv({ Resultat: 'x' }), process: { resultat: [{ malId: mal, status: 'uppnatt' }] } })).status).toBe(403);
  });

  test('undersköterskan fyller bara i de formulär som vårdgivaren har gett yrket', () => {
    const db = byggSeed(NU);
    const p = personal(db, 'usk-kard');
    expect(fm.mallarFor(db, p).map(m => m.typ)).toEqual(['Fallriskbedömning']);
    expect(fel(() => fm.forifyllnad(atk(db, 'usk-kard', 'p01'), 'sar')).status).toBe(403);
    expect(fel(() => journal.skapaAnteckning(atk(db, 'usk-kard', 'p01'), { typ: 'Sårdokumentation', formular: { lage: [{ vy: 'bak', x: 56, y: 95 }], sartyp: 'trycksar' } })).status).toBe(403);
    // Sjuksköterskan fyller i båda som förut.
    expect(fm.mallarFor(db, personal(db, 'ssk-kard')).map(m => m.typ).sort()).toEqual(['Fallriskbedömning', 'Sårdokumentation']);
  });
});

describe('Omvårdnadsprocessen', () => {
  test('omvårdnadsanteckningen har processens delar och statusområden med egna namn, utan VIPS-modellens namn', () => {
    const m = journal.MALLAR.find(x => x.typ === 'Omvårdnadsanteckning');
    expect(m.sokord.slice(0, 4)).toEqual(['Omvårdnadsproblem', 'Mål', 'Åtgärd', 'Resultat']);
    expect(m.utfallda).toEqual(omv.OMRADEN.map(o => o.namn));
    expect(m.sokord.slice(4)).toEqual(m.utfallda);
    // Inga av VIPS-modellens sammansatta sökord, och varje område har sin källa i ICF.
    for (const vips of ['Andning/cirkulation', 'Nutrition/Ätande', 'Hud/vävnad', 'Sömn/Vila', 'Smärta/Sinnesintryck', 'Psykosocialt', 'Andligt/Kulturellt', 'Välbefinnande', 'Planering']) expect(m.sokord).not.toContain(vips);
    for (const o of omv.OMRADEN) expect(o.icf).toMatch(/^[bde]\d/);
    // Varje sökord har en kod i Snomed CT eller en förklaring till varför det inte har det.
    for (const s of m.sokord) expect(Object.hasOwn(nf.SOKORD, s)).toBe(true);
  });

  test('systemet föreslår statusområden ur vårdplanen, förra anteckningen, NEWS2, smärtan och vikten, med förklaring', () => {
    const db = byggSeed(NU);
    const a = atk(db, 'ssk-kard', 'p04');
    const fore = foreslagnaSokord(a, 'p04', journal.MALLAR.find(m => m.typ === 'Omvårdnadsanteckning'), null);
    // Vårdplanen Förebyggande av fall och förra omvårdnadsanteckningen.
    expect(fore.find(f => f.sokord === 'Rörlighet').varfor).toContain('Vårdplanen Förebyggande av fall pågår.');
    for (const f of fore) { expect(f.varfor.length).toBeGreaterThan(10); expect(f.varfor).not.toMatch(/[–—…]/); }
    // Smärtan, vikten och NEWS2 som sjuksköterskan registrerar.
    const r = atk(db, 'ssk-kard', 'p04', 'registrera_matvarde');
    journal.registreraMatvarde(r, { typ: 'smarta', varde: 7 });
    journal.registreraMatvarde(r, { typ: 'vikt', varde: 70, tid: new Date(NU.getTime() - 2 * 86400_000).toISOString() });
    journal.registreraMatvarde(r, { typ: 'vikt', varde: 72.5 });
    registreraNews2(r, db.query("SELECT * FROM patienter WHERE id = 'p04'").get(), { andningsfrekvens: 26, saturation: 90, syrgas: 0, blodtryck: '95/60', puls: 118, medvetande: 'A', temp: 38.6 });
    const efter = foreslagnaSokord(atk(db, 'ssk-kard', 'p04'), 'p04', 'Omvårdnadsanteckning');
    expect(efter.find(f => f.sokord === 'Smärta').varfor).toContain('7 av 10');
    expect(efter.find(f => f.sokord === 'Nutrition').varfor).toContain('ökat 2,5 kg');
    expect(efter.find(f => f.sokord === 'Andning och cirkulation').varfor).toMatch(/NEWS2 är \d+/);
    // I mallens ordning.
    const ordning = omv.MALL.sokord;
    expect(efter.map(f => ordning.indexOf(f.sokord))).toEqual([...efter.map(f => ordning.indexOf(f.sokord))].sort((x, y) => x - y));
    // Andra mallar har inga förslag.
    expect(foreslagnaSokord(atk(db, 'lak-kard', 'p04', 'skriv_journal'), 'p04', 'Daganteckning')).toEqual([]);
  });

  test('förslagen räknas bara på den egna vårdenhetens uppgifter: en spärrad eller annan vårdenhet ändrar inte svaret', () => {
    const svar = (dolt, val = {}) => {
      const db = byggSeed(NU);
      if (dolt) {
        // Smärta och vikt på den spärrade psykiatrin och på akuten, och en omvårdnadsanteckning på psykiatrin.
        journal.registreraMatvarde(atk(db, 'lak-psyk', 'p04', 'registrera_matvarde'), { typ: 'smarta', varde: 9 });
        const ny = (enhet, typ, v) => db.query("INSERT INTO matvarden (patient_id, enhet_id, typ, varde, varde_num, matt_enhet, tid, registrerad_av) VALUES ('p04', ?, ?, ?, ?, '', ?, 'lak-akut')").run(enhet, typ, String(v), v, new Date(NU.getTime() - 60_000).toISOString());
        ny('uso-akut', 'smarta', 8);
        ny('uso-akut', 'vikt', 90);
      }
      const a = atk(db, 'ssk-kard', 'p04', 'skriv_omvardnad', val);
      return JSON.stringify({ omraden: foreslagnaSokord(a, 'p04', 'Omvårdnadsanteckning'), problem: omv.problemForslag(atk(db, 'ssk-kard', 'p04')) });
    };
    const utan = svar(false);
    expect(utan).not.toContain('Smärta');
    expect(svar(true)).toBe(utan);
    expect(svar(true, { samtycke_sparr: { syfte: 'Prov' }, andra_enheter: { syfte: 'Prov' }, nodatkomst: { syfte: 'Prov' } })).toBe(utan);
    // Psykiatrins egen omvårdnadsanteckning (i september) nämns aldrig.
    expect(utan).not.toContain('sep');
  });

  test('omvårdnadsproblem och resultat mot vårdplanens mål sparas, och resultatet förs in i vårdplanen vid signeringen', () => {
    const db = byggSeed(NU);
    const ssk = atk(db, 'ssk-kard', 'p04');
    const plan = db.query("SELECT * FROM vardplaner WHERE patient_id = 'p04' AND mall = 'fall'").get();
    const mal = db.query('SELECT * FROM vardplan_mal WHERE plan_id = ? ORDER BY id').get(plan.id);
    const a = journal.skapaAnteckning(ssk, { typ: 'Omvårdnadsanteckning', sokord: sokordAv({ Resultat: 'Har inte fallit, går säkrare med rollatorn.' }), process: { problem: ['fall', 'akut_smarta'], resultat: [{ malId: mal.id, status: 'uppnatt' }] } });
    expect(a.omvardnadsprocess.problem.map(p => p.text)).toEqual(['Ökad risk för fall', 'Akut smärta']);
    expect(a.omvardnadsprocess.resultat).toEqual([{ malId: mal.id, planId: plan.id, mal: mal.text, status: 'uppnatt', statusText: 'Uppnått' }]);
    // Före signeringen står vårdplanens senaste bedömning från seeden kvar.
    const status = () => vardplan.planUt(atk(db, 'ssk-kard', 'p04', 'las_vardplan'), db.query('SELECT * FROM vardplaner WHERE id = ?').get(plan.id)).mal.find(m => m.id === mal.id).status;
    expect(status()).toBe('delvis');
    journal.signera(ssk, rad(db, a.id));
    expect(status()).toBe('uppnatt');
    const h = db.query("SELECT * FROM vardplan_historik WHERE plan_id = ? AND typ = 'resultat' ORDER BY id DESC").get(plan.id);
    expect(h.text).toContain('Resultat i omvårdnadsanteckningen');
    expect(JSON.parse(h.detalj)).toEqual({ mal: { [mal.id]: 'uppnatt' }, anteckning: a.id });
    // Ett utkast ändras med processen, och en rättelse behåller den.
    const b = journal.skapaAnteckning(ssk, { typ: 'Omvårdnadsanteckning', sokord: sokordAv({ Sömn: 'Sov dåligt.' }) });
    expect(journal.andraUtkast(ssk, rad(db, b.id), { process: { problem: ['somn'] } }).omvardnadsprocess.problem[0].text).toBe('Sömnsvårigheter');
    journal.signera(ssk, rad(db, b.id));
    const ratt = journal.ratta(ssk, rad(db, b.id), { orsak: 'Fel tid', sokord: sokordAv({ Sömn: 'Sov dåligt hela natten.' }) });
    expect(ratt.omvardnadsprocess.problem[0].id).toBe('somn');
    // Okända problem och processen i en annan mall stoppas.
    expect(fel(() => journal.skapaAnteckning(ssk, { typ: 'Omvårdnadsanteckning', sokord: sokordAv({ Sömn: 'x' }), process: { problem: ['constructor'] } })).status).toBe(400);
    expect(fel(() => journal.skapaAnteckning(ssk, { typ: 'Tobaksvanor', process: { problem: ['fall'] } })).status).toBe(400);
  });

  test('resultat mot målet kräver ett mål i en pågående plan på den egna vårdenheten, och nödåtkomst ger bara läsning', () => {
    const db = byggSeed(NU);
    const plan = db.query("SELECT * FROM vardplaner WHERE patient_id = 'p04' AND mall = 'fall'").get();
    const mal = db.query('SELECT * FROM vardplan_mal WHERE plan_id = ? ORDER BY id').get(plan.id).id;
    const skriv = (pid, patient, malId, val = {}) => fel(() => journal.skapaAnteckning(atk(db, pid, patient, 'skriv_omvardnad', val), { typ: 'Omvårdnadsanteckning', sokord: sokordAv({ Resultat: 'x' }), process: { resultat: [{ malId, status: 'uppnatt' }] } }));
    // Ett mål som inte finns, och ett mål i en annan patients plan.
    expect(skriv('ssk-kard', 'p04', 999999).status).toBe(400);
    expect(skriv('ssk-kard', 'p01', mal).status).toBe(400);
    expect(skriv('ssk-kard', 'p04', mal)).toBeNull();
    // Fel status.
    expect(fel(() => journal.skapaAnteckning(atk(db, 'ssk-kard', 'p04'), { typ: 'Omvårdnadsanteckning', sokord: sokordAv({ Resultat: 'x' }), process: { resultat: [{ malId: mal, status: 'klart' }] } })).status).toBe(400);
    // En avslutad plan får inte resultatet vid signeringen.
    const a = journal.skapaAnteckning(atk(db, 'ssk-kard', 'p04'), { typ: 'Omvårdnadsanteckning', sokord: sokordAv({ Resultat: 'x' }), process: { resultat: [{ malId: mal, status: 'ej_uppnatt' }] } });
    vardplan.andra(atk(db, 'ssk-kard', 'p04', 'vardplan'), plan, 'avsluta', {});
    const fore = db.query("SELECT count(*) n FROM vardplan_historik WHERE typ = 'resultat'").get().n;
    journal.signera(atk(db, 'ssk-kard', 'p04'), rad(db, a.id));
    expect(db.query("SELECT count(*) n FROM vardplan_historik WHERE typ = 'resultat'").get().n).toBe(fore);
  });

  test('API: processen ger mål, problemförslag, observationer från undersköterskan och formulär att fylla i', async () => {
    const k = klient(app);
    await k.logga('ssk-kard');
    const r = await k.get('/api/patient/p04/omvardnadsprocess');
    expect(r.status).toBe(200);
    expect(r.data.mal.find(m => m.plan === 'Förebyggande av fall')).toMatchObject({ status: 'delvis', statusText: 'Delvis uppnått' });
    expect(r.data.problemForslag.map(p => p.id)).toContain('fall');
    expect(r.data.problem.length).toBe(Object.keys(omv.PROBLEM).length);
    expect(JSON.stringify(r.data.problem)).not.toMatch(/\d{6,}/);
    expect(r.data.observationer[0]).toMatchObject({ titel: 'Undersköterska' });
    expect(r.data.observationer[0].sokord.map(s => s.sokord)).toEqual(['Observation', 'Utförd åtgärd']);
    expect(r.data.formularforslag.find(f => f.typ === 'Fallriskbedömning').varfor).toContain('Förebyggande av fall');
    expect(r.data.foreslagna.length).toBeGreaterThan(0);
    expect(r.data.demoregler).toContain('demoregler');
    // Bara de som skriver omvårdnadsanteckningar med processen.
    for (const pid of ['usk-kard', 'fys-kard']) { const x = klient(app); await x.logga(pid); expect((await x.get('/api/patient/p04/omvardnadsprocess')).status).toBe(403); }
    const v = klient(app);
    await v.logga('adm-kard');
    expect((await v.get('/api/patient/p04/omvardnadsprocess')).status).toBe(403);
  });

  test('FHIR: omvårdnadsproblem som Condition och resultat som Goal i anteckningens Composition', async () => {
    const k = klient(app);
    await k.logga('lak-kard');
    const b = (await k.get('/fhir/Composition?patient=p04')).data;
    const c = b.entry.map(e => e.resource).find(x => x.contained?.length);
    expect(c.title).toBe('Omvårdnadsanteckning');
    const cond = c.contained.find(x => x.resourceType === 'Condition');
    expect(cond.code.coding[0]).toEqual({ system: 'http://snomed.info/sct', code: '129839007', display: 'At increased risk for falls' });
    expect(cond.subject.reference).toBe('Patient/p04');
    const goal = c.contained.find(x => x.resourceType === 'Goal');
    expect(goal.achievementStatus.coding[0].code).toBe('improving');
    const avsnitt = c.section.find(s => s.title === 'Omvårdnadsproblem');
    expect(avsnitt.code.coding[0].code).toBe('1269502008');
    expect(avsnitt.entry[0].reference).toBe(`#${cond.id}`);
    expect(c.section.find(s => s.title === 'Resultat').entry[0].reference).toBe(`#${goal.id}`);
  });
});

describe('Formulärens förifyllnad i runda 15', () => {
  test('läkemedel som ökar risken för fall räknas ur ATC-koderna enligt Socialstyrelsens lista', () => {
    const r = fallrisk.rakna([
      { namn: 'Zopiklon', atc: 'N05CF01' }, { namn: 'Furosemid', atc: 'C03CA01' }, { namn: 'Litium', atc: 'N05AN01' },
      { namn: 'Mirabegron', atc: 'G04BD12' }, { namn: 'Oxybutynin', atc: 'G04BD04' }, { namn: 'Paracetamol', atc: 'N02BE01' }, { namn: 'Utan kod', atc: null },
    ]);
    expect(r.antal).toBe(3);
    expect(r.lakemedel.map(l => l.namn)).toEqual(['Zopiklon', 'Furosemid', 'Oxybutynin']);
    expect(r.kalla).toContain('2017-6-7');
    for (const g of fallrisk.GRUPPER) expect(g.atc).toMatch(/^[A-Z]\d\d[A-Z]{0,2}(\d\d)?$/);
    // Svarsalternativet för antalet.
    const f = { alternativ: [{ varde: 'inga', antal: { fran: 0, till: 0 } }, { varde: 'ett', antal: { fran: 1, till: 1 } }, { varde: 'tva', antal: { fran: 2, till: null } }] };
    expect([0, 1, 2, 7].map(n => R.alternativForAntal(f, n))).toEqual(['inga', 'ett', 'tva', 'tva']);
  });

  test('fallriskbedömningen fylls i med antalet läkemedel och förra svaret, källan sparas, och en spärrad vårdenhets läkemedel räknas inte', () => {
    const db = byggSeed(NU);
    const f = fm.forifyllnad(atk(db, 'ssk-kard', 'p04'), 'fallrisk');
    // Metoprolol (C07) och melatonin (N05C). Sertralin på den spärrade psykiatrin räknas inte och nämns inte.
    expect(f.varden.lakemedel.varde).toBe('tva');
    expect(f.varden.lakemedel.kalla).toContain('Metoprolol');
    expect(f.varden.lakemedel.kalla).toContain('Melatonin');
    expect(JSON.stringify(f)).not.toContain('Sertralin');
    const medVal = fm.forifyllnad(atk(db, 'ssk-kard', 'p04', 'skriv_omvardnad', { samtycke_sparr: { syfte: 'Prov' } }), 'fallrisk');
    expect(JSON.stringify(medVal)).not.toContain('Sertralin');
    // p01 har en tidigare fallriskbedömning på avdelningen, och synen fylls i därifrån.
    const p01 = fm.forifyllnad(atk(db, 'ssk-kard', 'p01'), 'fallrisk');
    expect(p01.varden.syn).toMatchObject({ varde: 'ja' });
    expect(p01.varden.syn.kalla).toContain('förra bedömningen');
    // Sparas svaret som systemet fyllde i, står källan i texten.
    const ar = p01.varden.alder.varde;
    const a = journal.skapaAnteckning(atk(db, 'ssk-kard', 'p01'), { typ: 'Fallriskbedömning', formular: { alder: ar, fall: 'nej', lakemedel: p01.varden.lakemedel.varde, syn: 'ja', gang: 'hjalpmedel', forvirring: 'nej' } });
    const text = a.sokord.map(s => s.text).join('\n');
    expect(text).toContain('räknat ur läkemedelslistan');
    expect(text).toContain('samma som vid förra bedömningen');
    // Ett annat svar än systemets sparas utan källa.
    const b = journal.skapaAnteckning(atk(db, 'ssk-kard', 'p01'), { typ: 'Fallriskbedömning', formular: { alder: ar, fall: 'nej', lakemedel: 'inga', syn: 'nej', gang: 'hjalpmedel', forvirring: 'nej' } });
    expect(b.sokord.map(s => s.text).join('\n')).not.toContain('räknat ur läkemedelslistan');
  });

  test('NEWS2 från det senaste dygnet fyller i en fråga, och en definition med antal måste täcka alla antal', () => {
    const db = byggSeed(NU);
    const def = (falt) => ({ namn: 'Prov i runda 15', kategori: 'omvardnad', falt });
    const n = { id: 'news', typ: 'heltal', fraga: 'NEWS2', min: 0, max: 20, forifyll: 'news2', sokord: 'Status' };
    const r = atk(db, 'ssk-kard', 'p04', 'registrera_matvarde');
    registreraNews2(r, db.query("SELECT * FROM patienter WHERE id = 'p04'").get(), { andningsfrekvens: 22, saturation: 95, syrgas: 0, blodtryck: '120/80', puls: 95, medvetande: 'A', temp: 37.2 });
    const forslag = fm.forhandsvisa(db, personal(db, 'sysf'), { definition: def([n]) });
    expect(forslag.ok).toBe(true);
    // Luckor och överlapp i antalen förklaras.
    const val = (alt) => ({ id: 'lm', typ: 'val', fraga: 'Läkemedel', forifyll: 'fallrisklakemedel', sokord: 'Status', alternativ: alt });
    const lucka = fm.forhandsvisa(db, personal(db, 'sysf'), { definition: def([val([{ varde: 'inga', text: 'Inga', antal: { fran: 0, till: 0 } }, { varde: 'tva', text: 'Två eller fler', antal: { fran: 2 } }])]) });
    expect(lucka.ok).toBe(false);
    expect(lucka.varfor).toContain('utan luckor');
    const utanAntal = fm.forhandsvisa(db, personal(db, 'sysf'), { definition: def([val([{ varde: 'inga', text: 'Inga' }, { varde: 'fler', text: 'Fler' }])]) });
    expect(utanAntal.varfor).toContain('varje svarsalternativ ett antal');
    // Förifyllnaden räknar NEWS2 ur den egna vårdenhetens värden, i ett formulär som en annan systemförvaltare har godkänt.
    const v = fm.foresla(db, personal(db, 'sysf'), { definition: def([n]), motivering: 'Prov av förifyllnaden med NEWS2.' });
    fm.godkann(db, personal(db, 'sysf-2'), v.id);
    const n3 = fm.forifyllnad(atk(db, 'ssk-kard', 'p04'), v.kod);
    expect(n3.varden.news.varde).toBeGreaterThan(0);
    expect(n3.varden.news.kalla).toContain('NEWS2 klockan');
    // Ett dygn senare fylls inget i.
    stallKlockan(new Date(Date.now() + 2 * 86400_000));
    expect(fm.forifyllnad(atk(db, 'ssk-kard', 'p04'), v.kod).varden.news).toBeUndefined();
  });
});

describe('Fackspråket i runda 15', () => {
  test('inga två sökord har samma kod i Snomed CT', () => {
    expect(nf.dubblettkoder()).toEqual([]);
    expect(nf.dubblettkoder({ A: { code: '1' }, B: { code: '1' }, C: { ingen: 'x' } })).toEqual([{ code: '1', sokord: ['A', 'B'] }]);
    // Omvårdnadsproblemen har inte heller samma kod som ett sökord.
    const sokordskoder = new Set(Object.values(nf.SOKORD).map(k => k.code).filter(Boolean));
    for (const p of Object.values(omv.PROBLEM)) expect(sokordskoder.has(p.code)).toBe(false);
    expect(new Set(Object.values(omv.PROBLEM).map(p => p.code)).size).toBe(Object.keys(omv.PROBLEM).length);
  });

  test('Status har en avsnittskod, och Planering och Aktivitet skiljs från Åtgärd och Fysisk aktivitet', () => {
    expect(nf.sokordKod('Status')).toEqual({ system: 'http://snomed.info/sct', code: '425044008', display: 'Physical exam section' });
    expect(nf.sokordKod('Planering').code).toBe('423134005');
    expect(nf.sokordKod('Planering').code).not.toBe(nf.sokordKod('Åtgärd').code);
    expect(nf.sokordKod('Aktivitet')).toBeNull();
    expect(nf.SOKORD.Aktivitet.ingen).toContain('Fysisk aktivitet');
    expect(nf.sokordKod('Fysisk aktivitet').code).toBe('68130003');
  });

  test('omvårdnadsproblemen och de nya sökorden har giltiga begrepp i den internationella utgåvan', () => {
    for (const p of Object.values(omv.PROBLEM)) {
      expect(nf.provaBegrepp(p.code)).toMatchObject({ ok: true, utgava: 'internationell' });
      expect(p.display).toMatch(/^[A-Z][A-Za-z ,-]+$/);
    }
    for (const s of [...omv.MALL.sokord, ...yrken.MALLAR.flatMap(m => m.sokord)]) {
      const k = nf.SOKORD[s];
      expect(k).toBeDefined();
      if (k.code) expect(nf.provaBegrepp(k.code).ok).toBe(true);
      else expect(k.ingen.length).toBeGreaterThan(30);
    }
  });
});

describe('Seed i runda 15', () => {
  test('seeden har undersköterskans, sjuksköterskans och fysioterapeutens anteckningar med de nya mallarna, och en ny sandlåda fungerar', async () => {
    const db = byggSeed(NU);
    const typer = db.query("SELECT typ, forfattare_id FROM anteckningar WHERE patient_id = 'p04' AND typ IN ('Observationsanteckning', 'Fysioterapianteckning', 'Omvårdnadsanteckning') AND status = 'signerad'").all();
    expect(typer).toEqual(expect.arrayContaining([{ typ: 'Observationsanteckning', forfattare_id: 'usk-kard' }, { typ: 'Fysioterapianteckning', forfattare_id: 'fys-kard' }, { typ: 'Omvårdnadsanteckning', forfattare_id: 'ssk-kard' }]));
    expect(db.query('SELECT count(*) n FROM omvardnad_process').get().n).toBe(1);
    // En ny sandlåda och inloggning med undersköterskan, som ser sin anteckning.
    const k = klient(app);
    await k.logga('usk-kard');
    const r = await k.get('/api/patient/p04/anteckningar');
    expect(r.status).toBe(200);
    expect(r.data.anteckningar.map(a => a.typ)).toContain('Observationsanteckning');
  });
});
