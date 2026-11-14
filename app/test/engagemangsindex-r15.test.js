import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { stallKlockan, aterstallKlockan } from './falsk-klocka.js';
import { testserver, klient, sandlada } from './hjalp.js';
import { lokalTid } from '../src/db.js';
import * as ei from '../src/engagemangsindex.js';
import * as rivta from '../src/rivta/index.js';

// Runda 15, r2: engagemangsindex som uppdateras av sig självt (Sussa 2.2.1.10 och 2.5.1.2), med Ineras regler för Update
// (TKB itintegration:engagementindex 1.0.9) mot det simulerade indexet. Ingen person gör något: varje ändring i journalen
// märker patienten, och systemet skickar skillnaden i omgångar.

let app;
beforeAll(() => { app = testserver(); });
afterAll(() => app.stopp());
afterEach(() => { rivta.nationella.satt(null); aterstallKlockan(); });
const inloggad = async (id) => { const k = klient(app); await k.logga(id); return k; };
const VG = 'SE2321000164-VK0000';
const indexet = (db, pnr) => db.query('SELECT kategori, vardenhet_hsa, kallsystem, senast, agare, nyckel FROM rivta_sim_engagemang WHERE personid = ? ORDER BY kategori').all(pnr);
const kategorier = (db, pnr) => indexet(db, pnr).map(r => r.kategori);
// Grundladdningen: alla patienter skickas, som första gången systemet ansluts.
const grundladda = (db) => { ei.markeraPatienter(db); ei.skicka(db, { tvinga: true }); };
const T = 'Engagemangsindex av sig självt';

describe(T, () => {
  test('grundladdningen ger en post per informationsmängd med Ineras fält, och indexet sätter själv owner och tiderna', async () => {
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    grundladda(db);
    const rader = indexet(db, '194502024732');
    expect(rader.map(r => r.kategori)).toEqual(['dia', 'upp', 'vko', 'voo']);
    for (const r of rader) {
      // Systemadressering: källsystemet är den logiska adressen. businessObjectInstanceIdentifier och
      // clinicalProcessInterestId är NA, och personuppgiftsansvarig är vårdgivaren.
      expect(r.vardenhet_hsa).toBe(VG);
      expect(r.kallsystem).toBe(VG);
      expect(r.nyckel.split('|')).toEqual(['194502024732', expect.any(String), r.kategori, VG, 'NA', 'NA', VG, VG]);
      expect(r.agare).toBe(rivta.nationella.NATIONELL);
      expect(r.senast).toMatch(/^\d{14}$/);
    }
    // Det som är anmält sparas i Vårdkällan, så att bara skillnader skickas nästa gång.
    expect(db.query("SELECT count(*) AS n FROM ei_poster WHERE patient_id = 'p01'").get().n).toBe(4);
    const fore = rivta.anropslogg(db, { max: 500 }).filter(a => a.kontrakt === 'Update').length;
    ei.markeraPatienter(db, ['p01']);
    expect(ei.skicka(db, { tvinga: true }).poster).toBe(0);
    expect(rivta.anropslogg(db, { max: 500 }).filter(a => a.kontrakt === 'Update').length).toBe(fore);
  });

  test('en ny journalanteckning märker patienten, och posten skickas i nästa omgång utan att någon gör något', async () => {
    const k = await inloggad('lak-akut');
    const db = sandlada(app, k).db;
    grundladda(db);
    // En ny patient på akuten med ett testpersonnummer från Skatteverket, som inte har några anteckningar.
    const ny = await k.post('/api/patienter', { identitet: '18900102-9819', fornamn: 'Test', efternamn: 'Testsson' });
    expect(ny.status).toBe(201);
    const id = ny.data.patient.id;
    ei.skicka(db, { tvinga: true });
    expect(kategorier(db, '189001029819')).toEqual(['vko']);
    const r = await k.post(`/api/patient/${id}/anteckningar`, { typ: 'Daganteckning', sokord: [{ sokord: 'Aktuellt', text: 'Kontroll av blodtrycket.' }] });
    expect(r.status).toBe(201);
    expect((await k.post(`/api/anteckning/${r.data.id}/signera`)).status).toBe(200);
    expect(db.query('SELECT count(*) AS n FROM ei_markerade WHERE patient_id = ?').get(id).n).toBeGreaterThan(0);
    // Före fördröjningen skickas inget. Efter den skickar timern omgången av sig själv, utan att någon gör något.
    const { efterTid } = await import('../src/r15r2-rutter.js');
    stallKlockan(new Date());
    efterTid(db, new Date(), { anrop: false });
    expect(kategorier(db, '189001029819')).toEqual(['vko']);
    stallKlockan(new Date(Date.now() + 2 * 60_000));
    // Ett anrop från en användare räknar aldrig om engagemangsindex.
    await k.get('/api/session');
    expect(kategorier(db, '189001029819')).toEqual(['vko']);
    efterTid(db, new Date(), { anrop: false });
    expect(kategorier(db, '189001029819')).toEqual(['vko', 'voo']);
    expect(db.query('SELECT count(*) AS n FROM ei_markerade WHERE patient_id = ?').get(id).n).toBe(0);
  });

  test('beräkningen av posterna lämnar inga spår i åtkomstloggen, och varje omgång står i anropsloggen utan patientuppgifter', async () => {
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    const fore = db.query("SELECT count(*) AS n FROM atkomstlogg WHERE patient_id = 'p01'").get().n;
    grundladda(db);
    expect(db.query("SELECT count(*) AS n FROM atkomstlogg WHERE patient_id = 'p01'").get().n).toBe(fore);
    expect(JSON.stringify(rivta.anropslogg(db, { max: 500 }))).not.toContain('194502024732');
  });

  test('spärrade uppgifter anmäls inte, och mostRecentContent minskar aldrig när en spärr läggs', async () => {
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    grundladda(db);
    const fore = Object.fromEntries(indexet(db, '194502024732').map(r => [r.kategori, r.senast]));
    // Alla vårdenheter med uppgifter om patienten spärras utom en: posterna för det som inte syns tas bort, och tiden
    // för det som finns kvar flyttas aldrig bakåt.
    const enheter = db.query("SELECT DISTINCT enhet_id FROM anteckningar WHERE patient_id = 'p01' UNION SELECT DISTINCT enhet_id FROM diagnoser WHERE patient_id = 'p01' UNION SELECT DISTINCT enhet_id FROM vardkontakter WHERE patient_id = 'p01' UNION SELECT DISTINCT enhet_id FROM uppmarksamhet WHERE patient_id = 'p01' UNION SELECT DISTINCT enhet_id FROM overkanslighet WHERE patient_id = 'p01'").all().map(r => r.enhet_id);
    for (const e of enheter) db.query('INSERT INTO sparrar (patient_id, enhet_id, aktiv, registrerad) VALUES (?, ?, 1, ?)').run('p01', e, new Date().toISOString());
    ei.skicka(db, { tvinga: true });
    const efter = indexet(db, '194502024732');
    // Allt patientens eget på vårdenheterna är spärrat. Det som finns kvar är gemensamt för vårdgivaren (läkemedel och
    // överkänslighet visas för alla enheter), och dess tid är aldrig tidigare än förut.
    for (const r of efter) expect(r.senast >= (fore[r.kategori] ?? '')).toBe(true);
    expect(efter.map(r => r.kategori)).not.toContain('voo');
    expect(efter.map(r => r.kategori)).not.toContain('vko');
    // Hävs spärrarna kommer posterna tillbaka.
    db.query("UPDATE sparrar SET aktiv = 0 WHERE patient_id = 'p01'").run();
    ei.skicka(db, { tvinga: true });
    expect(kategorier(db, '194502024732')).toEqual(['dia', 'upp', 'vko', 'voo']);
  });

  test('skyddade personuppgifter anmäls aldrig, och posterna tas bort när identiteten skyddas', async () => {
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    grundladda(db);
    // Malin Engberg har skyddade personuppgifter i seeden.
    expect(indexet(db, '198404162383')).toEqual([]);
    expect(kategorier(db, '196603193373').length).toBeGreaterThan(0);
    db.query("UPDATE patienter SET skyddad = 1 WHERE id = 'p02'").run();
    ei.skicka(db, { tvinga: true });
    expect(indexet(db, '196603193373')).toEqual([]);
    expect(db.query("SELECT count(*) AS n FROM ei_poster WHERE patient_id = 'p02'").get().n).toBe(0);
  });

  test('ett reservnummer anmäls inte, och när journalen får ett personnummer skapas posterna för det', async () => {
    const k = await inloggad('lak-akut');
    const db = sandlada(app, k).db;
    grundladda(db);
    const r = await k.post('/api/patienter', { kon: 'man', alder: 40 });
    expect(r.status).toBe(201);
    const id = r.data.patient.id;
    ei.skicka(db, { tvinga: true });
    expect(db.query('SELECT count(*) AS n FROM ei_poster WHERE patient_id = ?').get(id).n).toBe(0);
    expect(db.query('SELECT count(*) AS n FROM rivta_sim_engagemang WHERE patient_id = ?').get(id).n).toBe(0);
    // Ett testpersonnummer från Skatteverket som inte finns i seeden.
    db.query("UPDATE patienter SET personnummer = '189001019802', id_typ = 'personnummer' WHERE id = ?").run(id);
    ei.skicka(db, { tvinga: true });
    expect(kategorier(db, '189001019802')).toEqual(['vko']);
  });

  test('indexet svarar inte: ändringarna väntar, försöks igen och skickas när indexet svarar, och systemförvaltaren får en rad', async () => {
    const k = await inloggad('sysf');
    const db = sandlada(app, k).db;
    grundladda(db);
    rivta.nationella.satt(() => { throw new Error('nere'); });
    db.query("UPDATE patienter SET skyddad = 1 WHERE id = 'p02'").run();
    const nu = new Date();
    // Ändringen märks nu och skickas när fördröjningen har gått.
    expect(ei.skicka(db, { nu }).poster).toBe(0);
    const r1 = ei.skicka(db, { nu: new Date(nu.getTime() + 2 * 60_000) });
    expect(r1.fel).toBe('Engagemangsindex svarade inte.');
    expect(kategorier(db, '196603193373').length).toBeGreaterThan(0);
    // Nästa försök väntar, och det blir längre mellan försöken.
    expect(ei.skicka(db, { nu: new Date(nu.getTime() + 2.5 * 60_000) }).vantar).toBe(true);
    ei.skicka(db, { nu: new Date(nu.getTime() + 3.5 * 60_000) });
    ei.skicka(db, { nu: new Date(nu.getTime() + 6 * 60_000) });
    const lage = ei.lage(db, new Date(nu.getTime() + 20 * 60_000));
    expect(lage).toMatchObject({ vantar: 1, forsok: 3, ejFramme: true });
    expect(lage.text).toContain('försöker igen av sig självt');
    const ik = (await k.get('/api/inkorg')).data;
    expect(ik.nationellaTjanster.map(x => x.tjanst)).toContain('engagemangsindex');
    // Indexet svarar igen: allt som väntade skickas.
    rivta.nationella.satt(null);
    ei.skicka(db, { nu: new Date(nu.getTime() + 60 * 60_000) });
    expect(indexet(db, '196603193373')).toEqual([]);
    expect(ei.lage(db)).toMatchObject({ vantar: 0, ejFramme: false, felSedan: null });
  });

  test('högst så många poster per anrop som är inställt, och indexets regler för Update följs', async () => {
    const k = await inloggad('sysf');
    const db = sandlada(app, k).db;
    db.query("INSERT INTO installningar VALUES ('engagemangsindex.poster_per_anrop', '5') ON CONFLICT (nyckel) DO UPDATE SET varde = excluded.varde").run();
    const fore = rivta.anropslogg(db, { max: 2000 }).filter(a => a.kontrakt === 'Update').length;
    grundladda(db);
    const poster = db.query('SELECT count(*) AS n FROM ei_poster').get().n;
    const anrop = rivta.anropslogg(db, { max: 2000 }).filter(a => a.kontrakt === 'Update' && a.resultat === 'ok').length - fore;
    expect(poster).toBeGreaterThan(5);
    expect(anrop).toBeGreaterThanOrEqual(Math.ceil(poster / 5));
    expect(ei.installningar(db).posterPerAnrop).toBe(5);
    // Mer än 1000 går aldrig att ställa in, och det simulerade indexet avvisar fält som indexet själv sätter.
    db.query("UPDATE installningar SET varde = '5000' WHERE nyckel = 'engagemangsindex.poster_per_anrop'").run();
    expect(ei.installningar(db).posterPerAnrop).toBe(1000);
    const e = { registeredResidentIdentification: '194502024732', serviceDomain: 'riv:clinicalprocess:logistics:logistics', categorization: 'vko', logicalAddress: VG,
      businessObjectInstanceIdentifier: 'NA', clinicalProcessInterestId: 'NA', sourceSystem: VG, dataController: VG };
    const upd = (lista) => rivta.anropaSynk(rivta.register.EI, { logiskAdress: rivta.nationella.NATIONELL, begaran: { engagementTransaction: lista }, transport: rivta.nationella.transport(db) });
    expect(upd([{ deleteFlag: false, engagement: { ...e, owner: VG } }])).toMatchObject({ ResultCode: 'ERROR' });
    expect(upd([{ deleteFlag: false, engagement: e }, { deleteFlag: false, engagement: e }]).comment).toContain('Dubbletter är inte tillåtna');
    expect(upd([{ deleteFlag: true, engagement: { ...e, mostRecentContent: '20260101000000' } }])).toMatchObject({ ResultCode: 'ERROR' });
  });

  test('läget för systemförvaltaren har inga patientuppgifter, och bara systemförvaltaren ser och styr köerna', async () => {
    const k = await inloggad('sysf');
    const db = sandlada(app, k).db;
    grundladda(db);
    db.query("UPDATE patienter SET skyddad = 1 WHERE id = 'p02'").run();
    const svar = (await k.get('/api/nationella-tjanster')).data;
    expect(svar.engagemangsindex.vantar).toBe(1);
    expect(svar.engagemangsindex.nastaSandning).toBeTruthy();
    const text = JSON.stringify(svar);
    for (const x of ['p02', '196603193373', 'Thomas', 'Lindberg', 'p01', '194502024732']) expect(text).not.toContain(x);
    expect((await k.post('/api/nationella-tjanster/skicka', {})).status).toBe(200);
    expect(indexet(db, '196603193373')).toEqual([]);
    expect((await k.post('/api/nationella-tjanster/avstam', {})).data.engagemangsindex.vantar).toBeGreaterThan(10);
    for (const roll of ['lak-kard', 'adm-kard']) {
      const a = await inloggad(roll);
      expect((await a.get('/api/nationella-tjanster')).status).toBe(403);
      expect((await a.post('/api/nationella-tjanster/skicka', {})).status).toBe(403);
      expect((await a.post('/api/nationella-tjanster/avbrott', { simulera: true })).status).toBe(403);
    }
    // Det simulerade avbrottet i demon gäller alla nationella tjänster tills det slås av.
    expect((await k.post('/api/nationella-tjanster/avbrott', { simulera: 'ja' })).status).toBe(400);
    expect((await k.post('/api/nationella-tjanster/avbrott', { simulera: true })).data.simuleratAvbrott).toBe(true);
    db.query("UPDATE patienter SET skyddad = 1 WHERE id = 'p05'").run();
    expect(ei.skicka(db, { tvinga: true }).fel).toBe('Engagemangsindex svarade inte.');
    await k.post('/api/nationella-tjanster/avbrott', { simulera: false });
    expect(ei.skicka(db, { tvinga: true }).fel).toBeNull();
  });
});

describe(`${T}, vårdkontakter som tas bort`, () => {
  // Väntelistans förslag räknas från en torsdag klockan 11, som i tidbok.test.js.
  beforeEach(() => stallKlockan(new Date(lokalTid('2026-11-12', '11:00'))));

  test('en planerad vårdkontakt ger en post, och när besöket avbokas och kontakten tas bort tas posten bort', async () => {
    const k = await inloggad('adm-kard');
    const db = sandlada(app, k).db;
    grundladda(db);
    // Mikael Svensson har inga vårdtillfällen. Besöket bokas från väntelistan, och hans tidigare vårdkontakter tas bort i
    // sandlådan, så att den planerade blir den enda.
    const post = db.query("SELECT * FROM vantelista WHERE patient_id = 'p14' AND status = 'vantar'").get();
    const f = (await k.get(`/api/vantelista/${post.id}/forslag`)).data.forslag[0];
    expect((await k.post(`/api/vantelista/${post.id}/boka`, { tidId: f.tidId })).status).toBe(201);
    const bokad = db.query("SELECT vardkontakt_id FROM bokningar WHERE vantelista_id = ? AND status = 'bokad'").get(post.id).vardkontakt_id;
    db.query("DELETE FROM vardkontakter WHERE patient_id = 'p14' AND id <> ?").run(bokad);
    ei.skicka(db, { tvinga: true });
    expect(kategorier(db, '197701172392')).toContain('vko');
    const b = db.query("SELECT * FROM bokningar WHERE vantelista_id = ? AND status = 'bokad'").get(post.id);
    expect((await k.post(`/api/bokning/${b.id}/avboka`, { orsak: 'Patienten ringde, är bortrest' })).status).toBe(200);
    expect(db.query('SELECT 1 FROM vardkontakter WHERE id = ?').get(b.vardkontakt_id)).toBeNull();
    ei.skicka(db, { tvinga: true });
    expect(kategorier(db, '197701172392')).not.toContain('vko');
  });
});
