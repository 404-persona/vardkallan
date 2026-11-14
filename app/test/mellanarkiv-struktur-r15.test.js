// Beslut 2026-11-14 (runda 15, r3, Sussa 5.4.2.2): avslutade vårdkontakter, avslutade remisser och tillfälliga diagnoser
// i mellanarkivet. Testnamnen står i src/sussa/runda15-r3.js.
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { testserver, klient, sandlada, nyDb, atk, personal } from './hjalp.js';
import * as mellanarkiv from '../src/mellanarkiv.js';
import * as konfiguration from '../src/konfiguration.js';
import { Atkomst, harVardrelation } from '../src/atkomst.js';

let app;
beforeAll(() => { app = testserver(); });
afterAll(() => app.stopp());

const inloggad = async (roll) => { const k = klient(app); await k.logga(roll); return k; };
const db = (k) => sandlada(app, k).db;
const FORE = '2016-01-01';
const ark = (d) => personal(d, 'ark');

// En avslutad öppenvårdskontakt 2012 med en anteckning, en tillfällig diagnos och en remiss som besvarades och kvitterades.
function gammalKontakt(d, { pid = 'p01', enhet = 'vc-tybble', till = 'uso-kard', kod = 'J06.9', text = 'Akut övre luftvägsinfektion', remiss = true } = {}) {
  const vk = Number(d.query("INSERT INTO vardkontakter (patient_id, enhet_id, typ, start, slut, plats, orsak) VALUES (?, ?, 'oppenvard', '2012-02-01T09:00:00.000Z', '2012-02-01T09:30:00.000Z', 'Mottagningen', 'Halsont och feber') RETURNING id").get(pid, enhet).id);
  const dia = Number(d.query("INSERT INTO diagnoser (patient_id, enhet_id, vardkontakt_id, kod, text, typ, datum) VALUES (?, ?, ?, ?, ?, 'huvud', '2012-02-01') RETURNING id").get(pid, enhet, vk, kod, text).id);
  let rem = null;
  if (remiss) {
    rem = Number(d.query(`INSERT INTO remisser (patient_id, fran_enhet_id, till_enhet_id, avsandare_id, fragestallning, anamnes, prioritet, svar_senast, status, skickad_tid, mottagen_tid, bedomd_tid, beslut, besvarad_tid, svar, svar_kvitterat_tid, vardkontakt_id)
      VALUES (?, ?, ?, 'lak-vc', 'Bedömning av återkommande halsfluss', 'Tre episoder i år.', 'normal', '2012-03-01', 'svar_kvitterat', '2012-02-01T10:00:00.000Z', '2012-02-02T10:00:00.000Z', '2012-02-03T10:00:00.000Z', 'accepterad',
      '2012-02-20T10:00:00.000Z', 'Ingen åtgärd behövs.', '2012-02-21T10:00:00.000Z', ?) RETURNING id`).get(pid, enhet, till, vk).id);
  }
  return { vk, dia, rem };
}
const arkiverade = (d, ref) => d.query('SELECT * FROM mellanarkiv_handlingar WHERE referens = ?').get(ref);
const overfor = (d) => {
  const b = d.query(`INSERT INTO arkivbeslut (typ, beslutsfattare, diarienummer, beslutsdatum, lagrum, omfattning, registrerad, registrerad_av)
    VALUES ('leverans', 'Vårdgivarens arkivansvarige', 'RS 2026-700', '2026-11-14', 'Arkivlagen', ?, '2026-11-14', 'ark') RETURNING id`).get(JSON.stringify({ urval: 'mellanarkiv', ar: 5, fore: FORE })).id;
  return mellanarkiv.overfor(d, ark(d), d.query('SELECT * FROM arkivbeslut WHERE id = ?').get(b));
};

describe('Mellanarkiv för vårdkontakter, remisser och diagnoser', () => {
  test('en avslutad vårdkontakt förs över med det som dokumenterades under den, en tillfällig diagnos och en avslutad remiss', () => {
    const d = nyDb();
    const { vk, dia, rem } = gammalKontakt(d);
    const k = mellanarkiv.kandidater(d, FORE).get('p01');
    expect(k.vardkontakter.map(x => x.id)).toContain(vk);
    expect(k.diagnoser.map(x => x.id)).toContain(dia);
    expect(k.remisser.map(x => x.id)).toContain(rem);
    const r = overfor(d);
    expect(r.resultat).toMatchObject({ vardkontakter: expect.any(Number), remisser: expect.any(Number), diagnoser: expect.any(Number) });
    for (const [t, id] of [['vardkontakter', vk], ['diagnoser', dia], ['remisser', rem]]) expect(d.query(`SELECT 1 FROM ${t} WHERE id = ?`).get(id)).toBeNull();
    const e = arkiverade(d, `urn:vardkallan:Encounter/${vk}`);
    const c = arkiverade(d, `urn:vardkallan:Condition/${dia}`);
    const s = arkiverade(d, `urn:vardkallan:ServiceRequest/${rem}`);
    expect([e.slag, c.slag, s.slag]).toEqual(['vardkontakt', 'diagnos', 'remiss']);
    expect(new Set([e.paket_id, c.paket_id, s.paket_id]).size).toBe(1);
    expect(JSON.parse(c.resurs).clinicalStatus.coding[0].code).toBe('resolved');
    expect(s).toMatchObject({ enhet_id: 'vc-tybble', mottagare_enhet_id: 'uso-kard', sista: '2012-02-21T10:00:00.000Z' });
    expect(e.sista).toBe('2012-02-01T09:30:00.000Z');
  });

  test('det som gäller eller som något pekar på stannar: kroniska diagnoser, bokningar, väntelistan, hjälpmedel, uppmärksamhetsinformation och vårdtillfällen', () => {
    const d = nyDb();
    // En kronisk diagnos håller kvar både sig själv och sin vårdkontakt.
    const kronisk = gammalKontakt(d, { kod: 'I10.9', text: 'Essentiell hypertoni', remiss: false });
    // En bokning pekar på kontakten.
    const bokad = gammalKontakt(d, { remiss: false });
    d.query("INSERT INTO bokningar (patient_id, tid_id, vardkontakt_id, status, bokad) VALUES ('p01', 1, ?, 'bokad', '2012-01-20')").run(bokad.vk);
    // Ett hjälpmedel som lämnades ut vid kontakten.
    const hm = gammalKontakt(d, { remiss: false });
    d.query("INSERT INTO hjalpmedel_utlamnade (patient_id, enhet_id, vardkontakt_id, artikel, antal, tid, av) VALUES ('p01', 'vc-tybble', ?, 'HM-KRYCK', 1, '2012-02-01T09:20:00.000Z', 'lak-vc')").run(hm.vk);
    // Väntelistan pekar på remissen.
    const vant = gammalKontakt(d);
    d.query("INSERT INTO vantelista (patient_id, enhet_id, remiss_id, tidstyp, yrkesroll, prioritet, orsak, fran, skapad) VALUES ('p01', 'uso-kard', ?, 'nybesok', 'lakare', 'normal', 'Test', '2012-02-21', '2012-02-21')").run(vant.rem);
    // Uppmärksamhetsinformation pekar på diagnosen.
    const umi = gammalKontakt(d, { remiss: false });
    d.query(`INSERT INTO uppmarksamhet (patient_id, enhet_id, kategori, undergrupp, term, kalla_typ, kalla_id, status, registrerad, registrerad_av)
      SELECT 'p01', 'vc-tybble', kategori, undergrupp, 'Test', 'diagnos', ?, 'aktiv', '2012-02-01', 'lak-vc' FROM uppmarksamhet LIMIT 1`).run(umi.dia);
    // En pågående kontakt, hur gammal den än är.
    const pagar = Number(d.query("INSERT INTO vardkontakter (patient_id, enhet_id, typ, start, orsak) VALUES ('p01', 'vc-tybble', 'oppenvard', '2010-01-01T09:00:00.000Z', 'Pågår') RETURNING id").get().id);
    const fri = gammalKontakt(d, { remiss: false });
    const k = mellanarkiv.kandidater(d, FORE).get('p01');
    const vk = k.vardkontakter.map(x => x.id);
    const dia = k.diagnoser.map(x => x.id);
    for (const x of [kronisk.vk, bokad.vk, hm.vk, umi.vk, pagar]) expect(vk).not.toContain(x);
    expect(dia).not.toContain(kronisk.dia);
    expect(dia).not.toContain(umi.dia);
    expect(k.remisser.map(x => x.id)).not.toContain(vant.rem);
    expect(vk).toContain(fri.vk);
    expect(dia).toContain(fri.dia);
    // Seedens vårdtillfällen och kroniska diagnoser stannar.
    expect(vk).not.toContain(1);
    expect([...mellanarkiv.kandidater(d, '2021-11-14').values()].flatMap(v => v.diagnoser.map(x => x.kod)).filter(x => /^(I10|E11|E03|I48)/.test(x))).toEqual([]);
    expect(mellanarkiv.TILLFALLIGA_DIAGNOSER.test('E11.9')).toBe(false);
    expect(mellanarkiv.TILLFALLIGA_DIAGNOSER.test('T86.1')).toBe(false);
    expect(mellanarkiv.TILLFALLIGA_DIAGNOSER.test('S52.5')).toBe(true);
  });

  test('vårdrelationen, spärren och det aktiva valet är exakt som före överföringen för all personal och alla patienter', () => {
    const d = nyDb();
    gammalKontakt(d);
    gammalKontakt(d, { pid: 'p20', enhet: 'uso-med', till: 'vc-tybble' });
    d.query("INSERT INTO sparrar (patient_id, enhet_id, registrerad, aktiv) VALUES ('p01', 'vc-tybble', '2026-01-01', 1)").run();
    const pers = d.query("SELECT * FROM personal WHERE coalesce(aktiv, 1) = 1").all();
    const patienter = d.query('SELECT id FROM patienter').all().map(p => p.id);
    const vardenheter = d.query("SELECT id FROM enheter WHERE typ = 'vardenhet'").all().map(e => e.id);
    const H = ['las_oversikt', 'las_admin', 'las_journal', 'las_diagnoser', 'las_remiss', 'las_remiss_status'];
    const nu = new Date('2026-11-14T10:00:00.000Z');
    const lage = () => JSON.stringify([
      ...patienter.flatMap(pid => vardenheter.map(ve => [pid, ve, harVardrelation(d, pid, ve, nu)])),
      ...pers.flatMap(p => patienter.flatMap(pid => H.map(h => { const r = new Atkomst(d, p, pid, {}, h).prova(h); return [p.id, pid, h, r.tillaten, r.grund ?? null, r.krav ?? null]; }))),
    ]);
    const fore = lage();
    overfor(d);
    expect(d.query("SELECT count(*) AS n FROM mellanarkiv_handlingar WHERE slag IN ('vardkontakt', 'diagnos', 'remiss')").get().n).toBeGreaterThanOrEqual(6);
    expect(lage()).toBe(fore);
  }, 60_000);

  test('en spärrad vårdenhets kontakter, diagnoser och remisser syns inte, svaret är detsamma utan dem, och med samtycke syns de', async () => {
    const k = await inloggad('lak-kard');
    const d = db(k);
    gammalKontakt(d, { till: 'uso-med' });
    overfor(d);
    await k.post('/api/patient/p01/val', { typ: 'andra_enheter', syfte: 'Vården av patienten' });
    const fore = (await k.get('/api/patient/p01/mellanarkiv')).data.handlingar.map(h => h.slag);
    expect(fore).toEqual(expect.arrayContaining(['vardkontakt', 'diagnos', 'remiss']));
    d.query("INSERT INTO sparrar (patient_id, enhet_id, registrerad, aktiv) VALUES ('p01', 'vc-tybble', ?, 1)").run(new Date().toISOString());
    const med = (await k.get('/api/patient/p01/mellanarkiv')).data;
    expect(JSON.stringify(med)).not.toContain('vc-tybble');
    expect(med.handlingar.some(h => ['vardkontakt', 'diagnos', 'remiss'].includes(h.slag))).toBe(false);
    const ov = JSON.stringify((await k.get('/api/patient/p01/oversikt')).data.tidslinje.filter(t => t.typ === 'mellanarkiv'));
    expect(ov).not.toContain('Halsont och feber');
    expect((await k.get('/api/patient/p01/sok?q=halsfluss')).data.traffar.filter(t => t.typ === 'mellanarkiv')).toEqual([]);
    // Med patientens samtycke nu syns de, i en annan session med samma sandlåda.
    const k2 = await inloggad('lak-kard');
    sandlada(app, k2).db = d;
    await k2.post('/api/patient/p01/val', { typ: 'andra_enheter', syfte: 'Vården av patienten' });
    await k2.post('/api/patient/p01/val', { typ: 'samtycke_sparr', syfte: 'Patienten samtycker' });
    expect((await k2.get('/api/patient/p01/mellanarkiv')).data.handlingar.map(h => h.slag)).toEqual(expect.arrayContaining(['vardkontakt', 'diagnos', 'remiss']));
    // Skyddad identitet: resurserna ur mellanarkivet bär inga personuppgifter.
    const p = d.query("SELECT * FROM patienter WHERE id = 'p01'").get();
    d.query("UPDATE patienter SET skyddad = 1 WHERE id = 'p01'").run();
    for (const t of ['Encounter', 'Condition', 'ServiceRequest']) {
      const text = JSON.stringify((await k2.get(`/fhir/${t}?patient=p01`)).data.entry.map(e => e.resource).filter(r => String(r.id).startsWith('ma-')));
      expect(text.length).toBeGreaterThan(2);
      for (const x of [p.personnummer, p.fornamn, p.efternamn]) expect(text).not.toContain(x);
    }
    d.query("UPDATE patienter SET skyddad = 0 WHERE id = 'p01'").run();
    // Samma svar som om de inte fanns.
    d.exec('DROP TRIGGER mellanarkiv_handlingar_raderas_ej');
    const utan = JSON.stringify((await k.get('/api/patient/p01/mellanarkiv')).data);
    d.query("DELETE FROM mellanarkiv_handlingar WHERE enhet_id = 'vc-tybble' AND slag IN ('vardkontakt', 'diagnos', 'remiss')").run();
    expect(JSON.stringify((await k.get('/api/patient/p01/mellanarkiv')).data)).toBe(utan);
  }, 30_000);

  test('en remiss från eller till den egna vårdenheten syns utan aktivt val, och den som bara får läsa statusen ser inget av innehållet', async () => {
    const k = await inloggad('lak-kard');
    const d = db(k);
    const { rem } = gammalKontakt(d, { till: 'uso-kard' });
    overfor(d);
    const id = arkiverade(d, `urn:vardkallan:ServiceRequest/${rem}`).id;
    const r = await k.get(`/api/mellanarkiv/${id}`);
    expect(r.status).toBe(200);
    expect(r.data.sokord.map(s => s.sokord)).toContain('Frågeställning');
    expect(JSON.stringify(r.data)).toContain('återkommande halsfluss');
    // Vårdadministratören på mottagarens vårdenhet ser remissens status, aldrig frågeställningen eller svaret.
    const adm = await inloggad('adm-kard');
    sandlada(app, adm).db = d;
    const a = await adm.get(`/api/mellanarkiv/${id}`);
    expect(a.status).toBe(200);
    expect(a.data.sokord.map(s => s.sokord)).toEqual(['Till', 'Status']);
    for (const x of ['återkommande halsfluss', 'Tre episoder', 'Ingen åtgärd behövs']) expect(JSON.stringify(a.data)).not.toContain(x);
    const sr = (await adm.get('/fhir/ServiceRequest?patient=p01')).data.entry.map(e => e.resource).find(x => x.id === `ma-${id}`);
    expect(sr).toBeTruthy();
    expect(sr.reasonCode).toBeUndefined();
    expect(sr.note).toBeUndefined();
    // Vårdadministratören läser inte diagnoser.
    expect(mellanarkiv.synliga(atk(d, 'adm-kard', 'p01', { andra_enheter: true })).some(x => x.slag === 'diagnos')).toBe(false);
  }, 30_000);

  test('FHIR lämnar ut vårdkontakter, remisser och diagnoser ur mellanarkivet, och referenserna pekar på dem i mellanarkivet', async () => {
    const k = await inloggad('lak-kard');
    const d = db(k);
    const { vk, dia } = gammalKontakt(d, { till: 'uso-kard' });
    d.query("INSERT INTO anteckningar (patient_id, enhet_id, vardkontakt_id, typ, kategori, sokord, forfattare_id, skapad, status, signerad_tid, signerad_av) VALUES ('p01', 'vc-tybble', ?, 'Mottagningsanteckning', 'journal', ?, 'lak-vc', '2012-02-01T09:25:00.000Z', 'signerad', '2012-02-01T09:28:00.000Z', 'lak-vc')")
      .run(vk, JSON.stringify({ Aktuellt: 'Halsont sedan tre dagar.' }));
    overfor(d);
    await k.post('/api/patient/p01/val', { typ: 'andra_enheter', syfte: 'Vården av patienten' });
    const enc = (await k.get('/fhir/Encounter?patient=p01')).data.entry.map(e => e.resource).filter(r => String(r.id).startsWith('ma-'));
    const e = enc.find(r => r.id === `ma-${arkiverade(d, `urn:vardkallan:Encounter/${vk}`).id}`);
    expect(e).toMatchObject({ status: 'finished', meta: { source: expect.stringMatching(/^urn:vardkallan:mellanarkiv:/) } });
    const c = (await k.get('/fhir/Condition?patient=p01')).data.entry.map(x => x.resource).find(r => r.id === `ma-${arkiverade(d, `urn:vardkallan:Condition/${dia}`).id}`);
    expect(c.encounter.reference).toBe(`Encounter/${e.id}`);
    const comp = (await k.get('/fhir/Composition?patient=p01')).data.entry.map(x => x.resource).find(r => String(r.id).startsWith('ma-') && r.encounter?.reference === `Encounter/${e.id}`);
    expect(comp).toBeTruthy();
    expect((await k.get(`/fhir/Encounter/${e.id}`)).status).toBe(200);
    expect(d.query('SELECT 1 FROM atkomstlogg WHERE resurs = ?').get(`fhir/Encounter/${e.id}`)).toBeTruthy();
  }, 30_000);

  test('vilka diagnoser som är tillfälliga är vårdgivarens parameter med fyra ögon och förhandsvisning, och kroniska diagnoser och det som ett beslutsstöd läser stannar alltid', () => {
    const d = nyDb();
    // Grundinställningen är försiktig: en akut övre luftvägsinfektion är tillfällig, en fraktur är det inte.
    const ovre = gammalKontakt(d, { remiss: false });
    const fraktur = gammalKontakt(d, { kod: 'S52.5', text: 'Fraktur på nedre delen av radius', remiss: false });
    const umi = gammalKontakt(d, { kod: 'T78.3', text: 'Angioneurotiskt ödem', remiss: false });
    const dia = () => mellanarkiv.kandidater(d, FORE).get('p01').diagnoser.map(x => x.id);
    expect(dia()).toContain(ovre.dia);
    expect(dia()).not.toContain(fraktur.dia);
    expect(konfiguration.varde(d, 'arkiv.tillfalliga_diagnoser')).toEqual(['R', 'J00', 'J01', 'J02', 'J03', 'J04', 'J06']);
    expect(konfiguration.parametrar()['arkiv.tillfalliga_diagnoser'].beskrivning).toContain('demoregel som en läkare ska granska');
    // En kronisk diagnos kan inte läggas till.
    expect(konfiguration.prova('arkiv.tillfalliga_diagnoser', ['R', 'E11']).ok).toBe(false);
    expect(konfiguration.prova('arkiv.tillfalliga_diagnoser', ['R', 'I10']).varfor).toContain('kroniska tillstånd');
    // Förhandsvisningen säger hur många diagnoser som påverkas, och en annan systemförvaltare godkänner.
    const nytt = ['R', 'J06', 'S52', 'T78'];
    const f = konfiguration.forhandsvisa(d, personal(d, 'sysf'), { nyckel: 'arkiv.tillfalliga_diagnoser', varde: nytt });
    // Säkerhetsgranskningen efter runda 15: per kapitel, utan små tal och avrundat till tiotal.
    expect(JSON.stringify(f)).toMatch(/Listan omfattar kapitel J, R, S, T i ICD-10-SE\. Där finns (färre än 10|omkring \d+0) diagnoser från före/);
    expect(JSON.stringify(f)).toMatch(/ett beslutsstöd läser stannar alltid/);
    const { andring: a } = konfiguration.foresla(d, personal(d, 'sysf'), { nyckel: 'arkiv.tillfalliga_diagnoser', varde: nytt, giltigFran: '2026-01-01', motivering: 'Frakturer räknas också som tillfälliga.' }, new Date('2025-12-30T10:00:00.000Z'));
    expect(() => konfiguration.godkann(d, personal(d, 'sysf'), a.id, {}, new Date('2025-12-31T10:00:00.000Z'))).toThrow();
    konfiguration.godkann(d, personal(d, 'sysf-2'), a.id, {}, new Date('2025-12-31T10:00:00.000Z'));
    expect(dia()).toContain(fraktur.dia);
    // Angioneurotiskt ödem står i uppmärksamhetsinformationens kodverkslista och stannar, och en riskgrupp i
    // vaccinationsprogrammen stannar också.
    expect(dia()).not.toContain(umi.dia);
    expect(mellanarkiv.lasesAvBeslutsstod(d, 'T78.3')).toBe(true);
    expect(mellanarkiv.lasesAvBeslutsstod(d, 'J45.9')).toBe(true);
    expect(mellanarkiv.tillfalligDiagnos(d, 'J45.9', new Date(), ['J'])).toBe(false);
  });
});
