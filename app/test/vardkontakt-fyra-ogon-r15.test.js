import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { testserver, klient, sandlada, somPerson } from './hjalp.js';
import { harVardrelation, prova } from '../src/atkomst.js';
import * as makulering from '../src/vardkontakt-makulering.js';

// Runda 15, r2, tredje omgången (beslut 2026-11-14): en vårdkontakt eller ett vårdtillfälle som har registrerats på fel
// patient flyttas till en patient utan vårdrelation till vårdenheten bara med fyra ögon. Förslaget ger ingen åtkomst och
// röjer inget om numret. Först när en andra behörig person godkänner i sin egen inloggning flyttas uppgifterna, och rätt
// patient får den vårdrelation som kontakten hade gett, aldrig mer.

let app;
beforeAll(() => { app = testserver(); });
afterAll(() => app.stopp());
const inloggad = async (id) => { const k = klient(app); await k.logga(id); return k; };
// En andra person i samma sandlåda, i sin egen inloggning.
async function egenInloggning(k, id) {
  const db = sandlada(app, k).db;
  const v = klient(app);
  await v.logga('vch-kard');
  const s = sandlada(app, v);
  s.db = db;
  somPerson(s, id);
  return v;
}
const ORSAK = 'Besöket registrerades på fel patient i receptionen.';
const UTAN = { id: 'p12' };
const nummer = (db, id) => db.query('SELECT personnummer FROM patienter WHERE id = ?').get(id).personnummer;
const vardenheter = (db, pid) => db.query("SELECT id FROM enheter WHERE typ = 'vardenhet'").all().map(e => e.id).filter(e => harVardrelation(db, pid, e));
// En genomförd öppenvårdskontakt på kardiologen med minst en anteckning, som slutade nyss, så att den ger vårdrelation.
function kontakt(db) {
  const v = db.query(`SELECT v.* FROM vardkontakter v WHERE v.enhet_id LIKE 'uso-kard%' AND v.kalla = 'vardkallan' AND v.vardtillfalle_id IS NULL
    AND v.typ <> 'slutenvard' AND coalesce(v.planerad, 0) = 0 AND v.patient_id NOT IN ('p05', 'p12') AND EXISTS (SELECT 1 FROM anteckningar a WHERE a.vardkontakt_id = v.id) ORDER BY v.id LIMIT 1`).get();
  db.query('UPDATE vardkontakter SET slut = ? WHERE id = ?').run(new Date(Date.now() - 3600_000).toISOString(), v.id);
  return db.query('SELECT * FROM vardkontakter WHERE id = ?').get(v.id);
}
const mina = async (k) => (await k.get('/api/flyttar')).data.mina;
const aterkalla = async (k) => { for (const f of await mina(k)) expect((await k.post(`/api/flyttar/${f.id}/avsluta`, {})).status).toBe(200); };
const T = 'Flytt till rätt patient med fyra ögon';

describe(T, () => {
  test('rätt patient utan vårdrelation ger ett förslag utan åtkomst, och svaret är detsamma för alla nummer som inte kan flyttas direkt', async () => {
    const k = await inloggad('adm-kard');
    const db = sandlada(app, k).db;
    const v = kontakt(db);
    expect(harVardrelation(db, UTAN.id, 'uso-kard')).toBe(false);
    const fore = (await k.get(`/api/patient/${UTAN.id}/oversikt`)).status;
    const loggFore = db.query('SELECT count(*) AS n FROM atkomstlogg WHERE patient_id = ?').get(UTAN.id).n;
    // p14 slås samman med p12, p05 har skyddad identitet med vårdrelation men utan aktivt val, och 189001019802 är okänt.
    db.query("UPDATE patienter SET sammanslagen_till = 'p12' WHERE id = 'p14'").run();
    db.query("UPDATE patienter SET skyddad = 1 WHERE id = 'p05'").run();
    const svar = [];
    for (const n of [nummer(db, UTAN.id), '189001019802', nummer(db, 'p14'), nummer(db, 'p05'), nummer(db, v.patient_id)]) {
      const r = await k.post(`/api/vardkontakt/${v.id}/makulera`, { orsak: ORSAK, rattPatient: n });
      svar.push(JSON.stringify([r.status, r.data]));
      // Bara ett förslag i taget för samma kontakt.
      expect((await k.post(`/api/vardkontakt/${v.id}/makulera`, { orsak: ORSAK, rattPatient: n })).status).toBe(409);
      await aterkalla(k);
    }
    expect([...new Set(svar)]).toEqual([svar[0]]);
    expect(JSON.parse(svar[0])).toEqual([202, { atgard: 'foreslagen', text: expect.stringContaining('godkänner den i sin egen inloggning') }]);
    // Ingenting har flyttats, ingenting är loggat på rätt patient och åtkomsten är densamma som före.
    expect(db.query('SELECT patient_id FROM vardkontakter WHERE id = ?').get(v.id).patient_id).toBe(v.patient_id);
    expect(db.query('SELECT count(*) AS n FROM atkomstlogg WHERE patient_id = ?').get(UTAN.id).n).toBe(loggFore);
    expect((await k.get(`/api/patient/${UTAN.id}/oversikt`)).status).toBe(fore);
    expect(harVardrelation(db, UTAN.id, 'uso-kard')).toBe(false);
    // Ett nummer i fel form är inget förslag.
    expect((await k.post(`/api/vardkontakt/${v.id}/makulera`, { orsak: ORSAK, rattPatient: '12345' })).data.falt).toEqual(['rattPatient']);
  });

  test('verksamhetschefen godkänner i sin egen inloggning, och först då flyttas uppgifterna med den vårdrelation som kontakten ger, aldrig mer', async () => {
    const k = await inloggad('adm-kard');
    const db = sandlada(app, k).db;
    const v = kontakt(db);
    const anteckningar = db.query('SELECT id FROM anteckningar WHERE vardkontakt_id = ?').all(v.id).map(r => r.id);
    const relationFore = vardenheter(db, UTAN.id);
    expect(relationFore).not.toContain('uso-kard');
    expect((await k.post(`/api/vardkontakt/${v.id}/makulera`, { orsak: ORSAK, rattPatient: nummer(db, UTAN.id) })).status).toBe(202);
    const [f] = await mina(k);
    // Den som föreslog kan inte godkänna, och inte heller den som saknar behörighet eller är chef för en annan vårdenhet.
    expect((await k.post(`/api/flyttar/${f.id}/godkann`, {})).status).toBe(403);
    for (const id of ['lak-kard', 'vch-onk']) expect((await (await egenInloggning(k, id)).post(`/api/flyttar/${f.id}/godkann`, {})).status).toBe(403);
    const vch = await egenInloggning(k, 'vch-kard');
    const lista = (await vch.get('/api/flyttar')).data.attGodkanna;
    expect(lista.map(x => x.id)).toEqual([f.id]);
    // Säkerhetsgranskningen efter sammanslagningen: listan har bara vårdenhet, tid och status, och patienten, kontakten,
    // numret och motiveringen syns först när förslaget öppnas, prövat och loggat på patienten.
    expect(lista[0]).toMatchObject({ foreslagenAv: { id: 'adm-kard' }, kanGodkanna: true, vardenhet: { id: expect.any(String) } });
    const fel = db.query('SELECT * FROM patienter WHERE id = ?').get(v.patient_id);
    for (const x of [v.patient_id, fel.fornamn, fel.efternamn, fel.personnummer, ORSAK]) expect(JSON.stringify(lista)).not.toContain(x);
    const oppnad = (await vch.get(`/api/flyttar/${f.id}`)).data;
    expect(oppnad).toMatchObject({ rattNummer: expect.any(String), orsak: ORSAK, felPatient: { id: v.patient_id } });
    expect(db.query("SELECT count(*) AS n FROM atkomstlogg WHERE personal_id = 'vch-kard' AND patient_id = ? AND resurs = ?").get(v.patient_id, `makulering:forslag:${f.id}`).n).toBeGreaterThan(0);
    // Förslaget visar numret som det skrevs men ingenting om patienten som numret leder till.
    const p12 = db.query('SELECT * FROM patienter WHERE id = ?').get(UTAN.id);
    for (const x of [UTAN.id, p12.fornamn, p12.efternamn]) expect(JSON.stringify([lista, oppnad])).not.toContain(x);
    const r = await vch.post(`/api/flyttar/${f.id}/godkann`, {});
    expect(r.status).toBe(200);
    expect(r.data.atgard).toBe('flyttad');
    expect(db.query('SELECT patient_id, ger_vardrelation FROM vardkontakter WHERE id = ?').get(v.id)).toEqual({ patient_id: UTAN.id, ger_vardrelation: v.ger_vardrelation });
    for (const a of anteckningar) expect(db.query('SELECT patient_id FROM anteckningar WHERE id = ?').get(a).patient_id).toBe(UTAN.id);
    // Rätt patient har nu vårdrelation till kardiologen och till ingen annan vårdenhet än förut.
    expect(vardenheter(db, UTAN.id).sort()).toEqual([...relationFore, 'uso-kard'].sort());
    expect(db.query('SELECT av, godkand_av, forslag_id FROM vardkontakt_makuleringar WHERE vardkontakt_id = ?').get(v.id)).toEqual({ av: 'adm-kard', godkand_av: 'vch-kard', forslag_id: f.id });
    expect(db.query("SELECT personal_id FROM atkomstlogg WHERE patient_id = ? AND resurs LIKE 'makulering:vardkontakt:%:flyttad-hit'").get(UTAN.id).personal_id).toBe('vch-kard');
    expect((await vch.post(`/api/flyttar/${f.id}/godkann`, {})).status).toBe(409);
    // Fel patient har makuleringen kvar, och ingenting om rätt patient.
    const ov = (await k.get(`/api/patient/${v.patient_id}/oversikt`)).data;
    expect(ov.makuleradeVardkontakter[0]).toMatchObject({ atgard: 'flyttad', godkandAv: { id: 'vch-kard' } });
    expect(JSON.stringify(ov.makuleradeVardkontakter)).not.toContain(UTAN.id);
  });

  // Säkerhetsgranskningen efter sammanslagningen: godkännandet gäller förslagets vårdenhet.
  test('har kontakten bytt vårdenhet sedan förslaget genomförs flytten inte, och förslaget avslutas som ej genomfört', async () => {
    const k = await inloggad('adm-kard');
    const db = sandlada(app, k).db;
    const v = kontakt(db);
    expect((await k.post(`/api/vardkontakt/${v.id}/makulera`, { orsak: ORSAK, rattPatient: nummer(db, UTAN.id) })).status).toBe(202);
    const [f] = await mina(k);
    // En omorganisation flyttar kontakten till en annan vårdenhet.
    db.query("UPDATE vardkontakter SET enhet_id = 'uso-med' WHERE id = ?").run(v.id);
    const vch = await egenInloggning(k, 'vch-kard');
    expect((await vch.get('/api/flyttar')).data.attGodkanna.find(x => x.id === f.id)).toMatchObject({ bytt: true, kanGodkanna: false });
    const r = await vch.post(`/api/flyttar/${f.id}/godkann`, {});
    expect(r.status).toBe(409);
    expect(r.data.fel).toContain('bytt vårdenhet');
    expect(db.query('SELECT status FROM makulering_forslag WHERE id = ?').get(f.id).status).toBe('ej_genomford');
    expect(db.query('SELECT patient_id FROM vardkontakter WHERE id = ?').get(v.id).patient_id).toBe(v.patient_id);
    expect(harVardrelation(db, UTAN.id, 'uso-med')).toBe(false);
    // Samma kontroll när ett förslag avslås.
    db.query("UPDATE vardkontakter SET enhet_id = ? WHERE id = ?").run(v.enhet_id, v.id);
    expect((await k.post(`/api/vardkontakt/${v.id}/makulera`, { orsak: ORSAK, rattPatient: nummer(db, UTAN.id) })).status).toBe(202);
    const [g] = await mina(k);
    db.query("UPDATE vardkontakter SET enhet_id = 'uso-med' WHERE id = ?").run(v.id);
    const a = await vch.post(`/api/flyttar/${g.id}/avsluta`, { kommentar: 'Kontrollera numret.' });
    expect(a.status).toBe(200);
    expect(a.data.forslag.status).toBe('ej_genomford');
  });

  test('en felaktig flytt rättas med en ny flytt tillbaka med samma fyra ögon, och ingen vårdrelation blir kvar hos fel patient', async () => {
    const k = await inloggad('adm-kard');
    const db = sandlada(app, k).db;
    const v = kontakt(db);
    const forst = v.patient_id;
    const relationFore = vardenheter(db, UTAN.id);
    expect((await k.post(`/api/vardkontakt/${v.id}/makulera`, { orsak: ORSAK, rattPatient: nummer(db, UTAN.id) })).status).toBe(202);
    const vch = await egenInloggning(k, 'vch-kard');
    let [f] = await mina(k);
    expect((await vch.post(`/api/flyttar/${f.id}/godkann`, {})).status).toBe(200);
    expect(db.query('SELECT patient_id FROM vardkontakter WHERE id = ?').get(v.id).patient_id).toBe(UTAN.id);
    expect(harVardrelation(db, UTAN.id, 'uso-kard')).toBe(true);
    // Flytten var fel. Den rättas med en ny flytt tillbaka, som också kräver fyra ögon när den ursprungliga patienten
    // inte längre har vårdrelation till vårdenheten genom kontakten.
    const tillbaka = await k.post(`/api/vardkontakt/${v.id}/makulera`, { orsak: 'Flytten gjordes till fel patient.', rattPatient: nummer(db, forst) });
    expect([200, 202]).toContain(tillbaka.status);
    if (tillbaka.status === 202) {
      [f] = await mina(k);
      expect((await k.post(`/api/flyttar/${f.id}/godkann`, {})).status).toBe(403);
      expect((await vch.post(`/api/flyttar/${f.id}/godkann`, {})).status).toBe(200);
    }
    expect(db.query('SELECT patient_id FROM vardkontakter WHERE id = ?').get(v.id).patient_id).toBe(forst);
    expect(db.query('SELECT count(*) AS n FROM anteckningar WHERE vardkontakt_id = ? AND patient_id <> ?').get(v.id, forst).n).toBe(0);
    // Ingen vårdrelation blir kvar hos patienten som flytten först gick till.
    expect(vardenheter(db, UTAN.id)).toEqual(relationFore);
    expect(harVardrelation(db, UTAN.id, 'uso-kard')).toBe(false);
  });

  test('förslaget kan avslås med en kommentar, och då flyttas inget', async () => {
    const k = await inloggad('adm-kard');
    const db = sandlada(app, k).db;
    const v = kontakt(db);
    expect((await k.post(`/api/vardkontakt/${v.id}/makulera`, { orsak: ORSAK, rattPatient: nummer(db, UTAN.id) })).status).toBe(202);
    const [f] = await mina(k);
    const vch = await egenInloggning(k, 'vch-kard');
    expect((await vch.post(`/api/flyttar/${f.id}/avsluta`, {})).data.falt).toEqual(['kommentar']);
    const r = await vch.post(`/api/flyttar/${f.id}/avsluta`, { kommentar: 'Kontrollera numret mot remissen.' });
    expect(r.status).toBe(200);
    expect(r.data.forslag).toMatchObject({ status: 'avslagen', kommentar: 'Kontrollera numret mot remissen.' });
    // Säkerhetsgranskningen efter sammanslagningen: en annan godkännare på vårdenheten ser inte kommentaren, varken i listan
    // eller när förslaget öppnas, och det öppnade förslaget har inget fält som skriver över listans.
    const adm = db.query('SELECT * FROM personal WHERE id = ?').get('adm-kard');
    const annan = { ...adm, id: 'adm-kard-annan' };
    const oppnad = makulering.forslagDetalj(db, annan, f.id);
    expect(oppnad.kommentar).toBeUndefined();
    const lista = makulering.forslagUt(db, db.query('SELECT * FROM makulering_forslag WHERE id = ?').get(f.id), annan);
    for (const [nyckel, varde] of Object.entries(lista)) expect([nyckel, oppnad[nyckel]]).toEqual([nyckel, varde]);
    expect(makulering.forslagDetalj(db, db.query("SELECT * FROM personal WHERE id = 'vch-kard'").get(), f.id).kommentar).toBe('Kontrollera numret mot remissen.');
    expect(db.query('SELECT patient_id FROM vardkontakter WHERE id = ?').get(v.id).patient_id).toBe(v.patient_id);
    expect(harVardrelation(db, UTAN.id, 'uso-kard')).toBe(false);
    expect((await vch.post(`/api/flyttar/${f.id}/godkann`, {})).status).toBe(409);
    expect(() => db.query('DELETE FROM makulering_forslag').run()).toThrow();
    // Ett nytt förslag kan läggas efter avslaget.
    expect((await k.post(`/api/vardkontakt/${v.id}/makulera`, { orsak: ORSAK, rattPatient: nummer(db, UTAN.id) })).status).toBe(202);
  });

  test('skyddad identitet flyttas aldrig genom ett förslag, och godkännandet röjer inte varför', async () => {
    const k = await inloggad('adm-kard');
    const db = sandlada(app, k).db;
    db.query('UPDATE patienter SET skyddad = 1 WHERE id = ?').run(UTAN.id);
    const v = kontakt(db);
    const v2 = db.query("SELECT * FROM vardkontakter WHERE enhet_id LIKE 'uso-kard%' AND kalla = 'vardkallan' AND vardtillfalle_id IS NULL AND typ <> 'slutenvard' AND coalesce(planerad, 0) = 0 AND id <> ? AND patient_id NOT IN ('p05', 'p12') ORDER BY id LIMIT 1").get(v.id);
    expect((await k.post(`/api/vardkontakt/${v.id}/makulera`, { orsak: ORSAK, rattPatient: nummer(db, UTAN.id) })).status).toBe(202);
    expect((await k.post(`/api/vardkontakt/${v2.id}/makulera`, { orsak: ORSAK, rattPatient: '189001019802' })).status).toBe(202);
    const vch = await egenInloggning(k, 'vch-kard');
    const lista = (await vch.get('/api/flyttar')).data.attGodkanna;
    const svar = [];
    for (const f of lista) { const r = await vch.post(`/api/flyttar/${f.id}/godkann`, {}); svar.push(JSON.stringify([r.status, r.data])); }
    expect(svar.length).toBe(2);
    expect(svar[0]).toBe(svar[1]);
    expect(JSON.parse(svar[0])[0]).toBe(404);
    expect(db.query('SELECT patient_id FROM vardkontakter WHERE id = ?').get(v.id).patient_id).toBe(v.patient_id);
    expect(harVardrelation(db, UTAN.id, 'uso-kard')).toBe(false);
    expect(db.query("SELECT DISTINCT status FROM makulering_forslag").all().map(r => r.status)).toEqual(['ej_genomford']);
  });

  test('spärr: uppgifterna som flyttas efter godkännandet syns inte för en annan vårdenhet, inte ens med nödåtkomst', async () => {
    const k = await inloggad('adm-kard');
    const db = sandlada(app, k).db;
    const v = kontakt(db);
    db.query("INSERT INTO sparrar (patient_id, enhet_id, aktiv, registrerad) VALUES (?, 'uso-kard', 1, ?)").run(UTAN.id, new Date().toISOString());
    const r = await k.post(`/api/vardkontakt/${v.id}/makulera`, { orsak: ORSAK, rattPatient: nummer(db, UTAN.id) });
    expect(r.status).toBe(202);
    const [f] = await mina(k);
    expect((await (await egenInloggning(k, 'vch-kard')).post(`/api/flyttar/${f.id}/godkann`, {})).status).toBe(200);
    const vc = db.query("SELECT * FROM personal WHERE id = 'lak-vc'").get();
    const val = { nodatkomst: true };
    expect(prova(db, { personal: vc, patient: UTAN.id, handling: 'las_journal', resurs: { enhet_id: 'vc-tybble' }, val }).tillaten).toBe(true);
    expect(prova(db, { personal: vc, patient: UTAN.id, handling: 'las_journal', resurs: { enhet_id: v.enhet_id }, val }).tillaten).toBe(false);
  });

  test('ett vårdtillfälle flyttas med sina vårdkontakter och allt som hör till dem, direkt eller med fyra ögon, och makuleras aldrig utan rätt patient', async () => {
    const k = await inloggad('adm-kard');
    const db = sandlada(app, k).db;
    const vtListan = db.query(`SELECT t.* FROM vardtillfallen t WHERE t.enhet_id = 'uso-kard' AND t.kalla = 'vardkallan' AND t.patient_id NOT IN ('p05', 'p12')
      AND EXISTS (SELECT 1 FROM vardkontakter v WHERE v.vardtillfalle_id = t.id) ORDER BY t.id`).all();
    expect(vtListan.length).toBeGreaterThan(1);
    const [vt, vt2] = vtListan;
    const kontakter = db.query('SELECT id FROM vardkontakter WHERE vardtillfalle_id = ?').all(vt.id).map(r => r.id);
    const f = (await k.get(`/api/vardtillfalle/${vt.id}/makulering`)).data;
    expect(f).toMatchObject({ slag: 'vardtillfalle', kanMakuleras: false });
    const utan = await k.post(`/api/vardtillfalle/${vt.id}/makulera`, { orsak: ORSAK });
    expect(utan.status).toBe(409);
    expect(utan.data.falt).toEqual(['rattPatient']);
    // En kontakt i vårdtillfället rättas genom vårdtillfället.
    expect((await k.post(`/api/vardkontakt/${kontakter[0]}/makulera`, { orsak: ORSAK, rattPatient: '196503143254' })).status).toBe(409);
    // Direkt till en patient med vårdrelation: vårdtillfället, kontakterna och raderna med vårdtillfället följer med.
    const rader = db.query('SELECT id FROM anteckningar WHERE vardkontakt_id IN (' + kontakter.map(() => '?').join(', ') + ')').all(...kontakter).map(r => r.id);
    const r = await k.post(`/api/vardtillfalle/${vt.id}/makulera`, { orsak: ORSAK, rattPatient: '196503143254' });
    expect(r.status).toBe(200);
    expect(r.data.atgard).toBe('flyttad');
    expect(db.query('SELECT patient_id FROM vardtillfallen WHERE id = ?').get(vt.id).patient_id).toBe('p05');
    for (const id of kontakter) expect(db.query('SELECT patient_id, ger_vardrelation FROM vardkontakter WHERE id = ?').get(id)).toEqual({ patient_id: 'p05', ger_vardrelation: 0 });
    for (const id of rader) expect(db.query('SELECT patient_id FROM anteckningar WHERE id = ?').get(id).patient_id).toBe('p05');
    expect(db.query("SELECT slag, vardtillfalle_id FROM vardkontakt_makuleringar WHERE vardtillfalle_id = ?").get(vt.id)).toEqual({ slag: 'vardtillfalle', vardtillfalle_id: vt.id });
    // Med fyra ögon till en patient utan vårdrelation, med samma svar som för en vårdkontakt.
    const forslag = await k.post(`/api/vardtillfalle/${vt2.id}/makulera`, { orsak: ORSAK, rattPatient: nummer(db, UTAN.id) });
    const v = kontakt(db);
    const forslagVk = await k.post(`/api/vardkontakt/${v.id}/makulera`, { orsak: ORSAK, rattPatient: nummer(db, UTAN.id) });
    expect(JSON.stringify([forslag.status, forslag.data])).toBe(JSON.stringify([forslagVk.status, forslagVk.data]));
    expect(db.query('SELECT patient_id FROM vardtillfallen WHERE id = ?').get(vt2.id).patient_id).toBe(vt2.patient_id);
    const fid = (await mina(k)).find(x => x.slag === 'vardtillfalle').id;
    const g = await (await egenInloggning(k, 'vch-kard')).post(`/api/flyttar/${fid}/godkann`, {});
    expect(g.status).toBe(200);
    expect(db.query('SELECT patient_id FROM vardtillfallen WHERE id = ?').get(vt2.id).patient_id).toBe(UTAN.id);
    expect(harVardrelation(db, UTAN.id, 'uso-kard')).toBe(true);
  });

  test('förslagen räknas mot samma tak för vårdkontakter och vårdtillfällen', async () => {
    const k = await inloggad('adm-kard');
    const db = sandlada(app, k).db;
    const v = kontakt(db);
    const vt = db.query("SELECT * FROM vardtillfallen WHERE enhet_id = 'uso-kard' AND kalla = 'vardkallan' AND patient_id NOT IN ('p05', 'p12') ORDER BY id LIMIT 1").get();
    for (let i = 0; i < 10; i++) {
      const [slag, id] = i % 2 ? ['vardtillfalle', vt.id] : ['vardkontakt', v.id];
      expect((await k.post(`/api/${slag}/${id}/makulera`, { orsak: ORSAK, rattPatient: '189001019802' })).status).toBe(202);
      await aterkalla(k);
    }
    for (const [slag, id] of [['vardkontakt', v.id], ['vardtillfalle', vt.id]]) expect((await k.post(`/api/${slag}/${id}/makulera`, { orsak: ORSAK, rattPatient: '196503143254' })).status).toBe(429);
  });

  test('vårdadministratören ser förslagen att godkänna i inkorgen', async () => {
    const k = await inloggad('adm-kard');
    const db = sandlada(app, k).db;
    const v = kontakt(db);
    db.query("INSERT INTO personal (id, namn, yrke, titel, enhet_id, hsa_id, demo) VALUES ('adm2-kard', 'Test Vårdadministratör', 'vardadministrator', 'Vårdadministratör', 'uso-kard', 'adm2-kard', 0)").run();
    expect((await k.post(`/api/vardkontakt/${v.id}/makulera`, { orsak: ORSAK, rattPatient: nummer(db, UTAN.id) })).status).toBe(202);
    expect((await k.get('/api/inkorg')).data.flyttarAttGodkanna).toEqual([]);
    const adm2 = await egenInloggning(k, 'adm2-kard');
    const ik = (await adm2.get('/api/inkorg')).data.flyttarAttGodkanna;
    expect(ik.length).toBe(1);
    expect((await adm2.post(`/api/flyttar/${ik[0].id}/godkann`, {})).status).toBe(200);
    expect(db.query('SELECT patient_id FROM vardkontakter WHERE id = ?').get(v.id).patient_id).toBe(UTAN.id);
  });
});
