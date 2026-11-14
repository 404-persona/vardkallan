import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { testserver, klient, sandlada, somPerson } from './hjalp.js';
import { harVardrelation, prova } from '../src/atkomst.js';

// Runda 15, r2, andra omgången (beslut 2026-11-14): makulering av en genomförd vårdkontakt som har registrerats på fel
// patient. Uppgifterna flyttas till rätt patient som vid en sammanslagning, eller makuleras med kontakten när ingen
// dokumentation hör till den. Ingenting om den andra patienten röjs i den felaktiga journalen.

let app;
beforeAll(() => { app = testserver(); });
afterAll(() => app.stopp());
const inloggad = async (id) => { const k = klient(app); await k.logga(id); return k; };
const RATT = { id: 'p05', pnr: '196503143254', namn: ['Lars', 'Wennberg'] };
// En genomförd öppenvårdskontakt på kardiologen med minst en anteckning, på någon annan än rätt patient.
const medDokumentation = (db) => db.query(`SELECT v.* FROM vardkontakter v WHERE v.enhet_id LIKE 'uso-kard%' AND v.kalla = 'vardkallan' AND v.vardtillfalle_id IS NULL
  AND v.typ <> 'slutenvard' AND coalesce(v.planerad, 0) = 0 AND v.patient_id <> 'p05' AND EXISTS (SELECT 1 FROM anteckningar a WHERE a.vardkontakt_id = v.id) ORDER BY v.id LIMIT 1`).get();
const T = 'Makulering av vårdkontakt på fel patient';

describe(T, () => {
  test('vårdadministratören flyttar kontakten med dess uppgifter till rätt patient, och fel patient har bara makuleringen kvar', async () => {
    const k = await inloggad('adm-kard');
    const db = sandlada(app, k).db;
    const v = medDokumentation(db);
    expect(v).toBeTruthy();
    const fran = v.patient_id;
    const anteckningar = db.query('SELECT id FROM anteckningar WHERE vardkontakt_id = ?').all(v.id).map(r => r.id);
    const f = (await k.get(`/api/vardkontakt/${v.id}/makulering`)).data;
    expect(f.foljer.find(x => x.tabell === 'anteckningar').antal).toBe(anteckningar.length);
    expect(f.kanMakuleras).toBe(false);
    const r = await k.post(`/api/vardkontakt/${v.id}/makulera`, { orsak: 'Besöket registrerades på fel patient i receptionen.', rattPatient: RATT.pnr });
    expect(r.status).toBe(200);
    expect(r.data.atgard).toBe('flyttad');
    expect(db.query('SELECT patient_id FROM vardkontakter WHERE id = ?').get(v.id).patient_id).toBe(RATT.id);
    for (const a of anteckningar) expect(db.query('SELECT patient_id FROM anteckningar WHERE id = ?').get(a).patient_id).toBe(RATT.id);
    // Den felaktiga journalen visar att kontakten är makulerad, med motiveringen, men ingenting om rätt patient.
    const ov = (await k.get(`/api/patient/${fran}/oversikt`)).data;
    expect(ov.vardkontakter.some(x => x.id === v.id)).toBe(false);
    expect(ov.makuleradeVardkontakter[0]).toMatchObject({ atgard: 'flyttad', orsak: 'Besöket registrerades på fel patient i receptionen.' });
    for (const text of [JSON.stringify(ov.makuleradeVardkontakter), JSON.stringify(r.data)]) for (const x of [RATT.id, RATT.pnr, ...RATT.namn]) expect(text).not.toContain(x);
    // Loggen har flytten på båda patienterna, med samma referens, och engagemangsindex räknas om för båda.
    const logg = db.query("SELECT patient_id, resurs FROM atkomstlogg WHERE resurs LIKE 'makulering:vardkontakt:%' ORDER BY id").all();
    expect(logg.map(l => l.patient_id).sort()).toEqual([fran, RATT.id].sort());
    expect(logg.every(l => !l.resurs.includes(RATT.id) && !l.resurs.includes(fran))).toBe(true);
    expect(db.query('SELECT count(DISTINCT patient_id) AS n FROM ei_markerade WHERE patient_id IN (?, ?)').get(fran, RATT.id).n).toBe(2);
    // Makuleringen ändras och raderas aldrig.
    expect(() => db.query('DELETE FROM vardkontakt_makuleringar').run()).toThrow();
  });

  test('motivering krävs, och ett okänt nummer eller samma patient ger samma svar', async () => {
    const k = await inloggad('adm-kard');
    const db = sandlada(app, k).db;
    const v = medDokumentation(db);
    expect((await k.post(`/api/vardkontakt/${v.id}/makulera`, { orsak: 'Fel' })).data.falt).toEqual(['orsak']);
    const okand = await k.post(`/api/vardkontakt/${v.id}/makulera`, { orsak: 'Besöket registrerades på fel patient.', rattPatient: '189001019802' });
    const samma = await k.post(`/api/vardkontakt/${v.id}/makulera`, { orsak: 'Besöket registrerades på fel patient.', rattPatient: db.query('SELECT personnummer FROM patienter WHERE id = ?').get(v.patient_id).personnummer });
    expect(okand.status).toBe(404);
    expect(JSON.stringify(samma.data)).toBe(JSON.stringify(okand.data));
    // Med dokumentation och utan rätt patient förklarar systemet att uppgifterna ska flyttas.
    const utan = await k.post(`/api/vardkontakt/${v.id}/makulera`, { orsak: 'Besöket registrerades på fel patient.' });
    expect(utan.status).toBe(409);
    expect(utan.data.falt).toEqual(['rattPatient']);
    expect(db.query('SELECT patient_id FROM vardkontakter WHERE id = ?').get(v.id).patient_id).toBe(v.patient_id);
  });

  test('utan dokumentation makuleras kontakten, och en makulerad kontakt ger ingen vårdrelation', async () => {
    const k = await inloggad('adm-kard');
    const db = sandlada(app, k).db;
    const ny = await k.post('/api/patient/p15/vardkontakter', { kontaktsatt: 'besok', orsak: 'Kontroll' });
    expect(ny.status).toBe(200);
    const id = ny.data.id ?? ny.data.vardkontakt?.id;
    expect(Number.isInteger(id)).toBe(true);
    // Den nya kontakten är det enda som ger kardiologen vårdrelation till patienten i sandlådan.
    db.query("UPDATE vardkontakter SET ger_vardrelation = 0 WHERE patient_id = 'p15' AND id <> ?").run(id);
    db.query("DELETE FROM listningar WHERE patient_id = 'p15'").run();
    db.query("UPDATE remisser SET status = 'svar_kvitterat', svar_kvitterat_tid = '2000-01-01T00:00:00.000Z' WHERE patient_id = 'p15'").run();
    expect(harVardrelation(db, 'p15', 'uso-kard')).toBe(true);
    const r = await k.post(`/api/vardkontakt/${id}/makulera`, { orsak: 'Kontakten registrerades av misstag två gånger.' });
    expect(r.status).toBe(200);
    expect(r.data.atgard).toBe('makulerad');
    expect(db.query('SELECT 1 FROM vardkontakter WHERE id = ?').get(id)).toBeNull();
    expect(harVardrelation(db, 'p15', 'uso-kard')).toBe(false);
    expect(db.query('SELECT atgard, orsak FROM vardkontakt_makuleringar WHERE vardkontakt_id = ?').get(id)).toEqual({ atgard: 'makulerad', orsak: 'Kontakten registrerades av misstag två gånger.' });
  });

  test('spärr: uppgifterna som flyttas till en patient som har spärrat vårdenheten syns inte för andra vårdenheter', async () => {
    const k = await inloggad('adm-kard');
    const db = sandlada(app, k).db;
    const v = medDokumentation(db);
    db.query("INSERT INTO sparrar (patient_id, enhet_id, aktiv, registrerad) VALUES ('p05', 'uso-kard', 1, ?)").run(new Date().toISOString());
    expect((await k.post(`/api/vardkontakt/${v.id}/makulera`, { orsak: 'Besöket registrerades på fel patient i receptionen.', rattPatient: RATT.pnr })).status).toBe(200);
    const vc = db.query("SELECT * FROM personal WHERE id = 'lak-vc'").get();
    // Också med nödåtkomst, som aldrig häver en spärr, är de flyttade uppgifterna dolda för en annan vårdenhet, medan
    // patientens ospärrade uppgifter syns.
    const val = { nodatkomst: true };
    expect(prova(db, { personal: vc, patient: 'p05', handling: 'las_journal', resurs: { enhet_id: 'vc-tybble' }, val }).tillaten).toBe(true);
    const svar = prova(db, { personal: vc, patient: 'p05', handling: 'las_journal', resurs: { enhet_id: v.enhet_id }, val });
    expect(svar.tillaten).toBe(false);
  });

  test('skyddade personuppgifter hos rätt patient röjs inte, och fel roll, fel vårdenhet och fel slags kontakt nekas', async () => {
    const k = await inloggad('adm-kard');
    const s = sandlada(app, k);
    const db = s.db;
    db.query("UPDATE patienter SET skyddad = 1 WHERE id = 'p05'").run();
    const v = medDokumentation(db);
    const r = await k.post(`/api/vardkontakt/${v.id}/makulera`, { orsak: 'Besöket registrerades på fel patient i receptionen.', rattPatient: RATT.pnr });
    expect(r.status).toBe(200);
    for (const x of [RATT.id, RATT.pnr, ...RATT.namn]) expect(JSON.stringify(r.data)).not.toContain(x);
    // En kontakt på en annan vårdenhet, och en roll som inte rättar vårdkontakter.
    const annan = db.query("SELECT * FROM vardkontakter WHERE enhet_id NOT LIKE 'uso-kard%' AND kalla = 'vardkallan' AND vardtillfalle_id IS NULL AND typ <> 'slutenvard' AND coalesce(planerad, 0) = 0 ORDER BY id LIMIT 1").get();
    expect((await k.post(`/api/vardkontakt/${annan.id}/makulera`, { orsak: 'Besöket registrerades på fel patient.' })).status).toBe(403);
    const slutenvard = db.query("SELECT * FROM vardkontakter WHERE enhet_id LIKE 'uso-kard%' AND (typ = 'slutenvard' OR vardtillfalle_id IS NOT NULL) ORDER BY id LIMIT 1").get();
    if (slutenvard) expect((await k.post(`/api/vardkontakt/${slutenvard.id}/makulera`, { orsak: 'Besöket registrerades på fel patient.' })).status).toBe(409);
    somPerson(s, 'usk-kard');
    const v2 = medDokumentation(db);
    expect((await k.post(`/api/vardkontakt/${v2.id}/makulera`, { orsak: 'Besöket registrerades på fel patient.' })).status).toBe(403);
  });
});
