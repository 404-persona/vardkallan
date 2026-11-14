import { describe, test, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import { aterstallKlockan } from './falsk-klocka.js';
import { testserver, klient, sandlada, somPerson } from './hjalp.js';
import * as nationella from '../src/rivta/nationella.js';
import * as samtycke from '../src/samtycke-nationellt.js';
import { anropslogg } from '../src/rivta/index.js';

// Runda 15, r2: samtycket till sammanhållen journalföring registreras och prövas både i Vårdkällan och i
// samtyckestjänsten (Sussa 2.2.1.4 och 5.2.1.7). Personalen gör ett val en gång, och systemet sköter resten.

let app;
beforeAll(() => { app = testserver(); });
afterAll(() => app.stopp());
afterEach(() => { nationella.satt(null); aterstallKlockan(); });
const inloggad = async (id) => { const k = klient(app); await k.logga(id); return k; };
const VG = 'SE2321000164-VK0000';
const KARD = 'SE2321000164-VK0120';
const PNR = '194502024732';
const hamta = (k, body = {}) => k.post('/api/patient/p01/sammanhallen', { syfte: 'Bedömning av patientens hjärtsvikt', ...body });
const lage = async (k) => (await k.get('/api/patient/p01/sammanhallen')).data;
const hsa = (db, id) => db.query('SELECT hsa_id FROM personal WHERE id = ?').get(id).hsa_id;
// Ett samtycke som patienten har gett i ett annat system hos vårdgivaren, direkt i samtyckestjänsten.
function iAnnatSystem(db, { enhet = KARD, slut = null, typ = 'Consent', id = `annat-${Math.random().toString(36).slice(2, 12)}` } = {}) {
  const t = new Date().toISOString().replace(/\.\d+Z$/, '');
  const r = nationella.anropa(db, 'RegisterExtendedConsent', { AssertionId: id, AssertionType: typ, Scope: 'NationalLevel', PatientId: PNR, CareProviderId: VG, CareUnitId: enhet,
    ...(slut ? { EndDate: slut } : {}), RegistrationAction: { RequestDate: t, RequestedBy: { EmployeeId: 'SE0000000000-ANNAT1' }, RegistrationDate: t, RegisteredBy: { EmployeeId: 'SE0000000000-ANNAT1' } } });
  expect(r.ResultType.ResultCode).toBe('OK');
  return id;
}
const harITjansten = (db, personal = 'lak-kard') => nationella.anropa(db, 'CheckConsent', { AccessingActor: { EmployeeId: hsa(db, personal), CareProviderId: VG, CareUnitId: KARD }, PatientId: PNR }).CheckResultType.HasConsent;
const nere = () => nationella.satt(() => { throw new Error('nere'); });
const T = 'Samtycke här och i samtyckestjänsten';

describe(T, () => {
  test('samtycke givet här registreras i samtyckestjänsten och gäller', async () => {
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    expect(harITjansten(db)).toBe(false);
    const d = (await hamta(k, { samtycke: true })).data;
    expect(d).toMatchObject({ hamtad: true, samtyckeGaller: true, samtyckeKalla: 'vardkallan', samtyckestjanst: 'ok' });
    expect(d.samtyckeText).toBe('Patienten har samtyckt. Samtycket är registrerat här och i samtyckestjänsten.');
    expect(harITjansten(db)).toBe(true);
    expect(db.query("SELECT status FROM samtycke_utkorg WHERE patient_id = 'p01' AND handling = 'registrera'").all().map(r => r.status)).toEqual(['skickad']);
  });

  test('samtycke givet i ett annat system gäller här, utan att personalen registrerar något', async () => {
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    expect((await hamta(k)).status).toBe(400);
    iAnnatSystem(db);
    const d = await lage(k);
    expect(d).toMatchObject({ samtyckeGaller: true, samtyckeKalla: 'annat_system', samtycke: null });
    expect(d.samtyckeText).toMatch(/^Patienten har gett samtycke i ett annat system den \d{1,2} \p{L}+ \d{4}\. Samtycket gäller här också\.$/u);
    expect(d.text).toBe('Patienten har samtyckt. Gör ett aktivt val för att hämta uppgifterna från den andra vårdgivaren.');
    // Det aktiva valet räcker. Inget nytt samtycke registreras här.
    const r = await hamta(k);
    expect(r.status).toBe(200);
    expect(r.data.hamtad).toBe(true);
    // Spärren hos den andra vårdgivaren gäller som vanligt.
    expect(r.data.poster.length).toBeGreaterThan(0);
    expect(r.data.poster.map(p => p.id)).not.toContain('hh-7');
    expect(db.query("SELECT count(*) AS n FROM sammanhallen_samtycken WHERE patient_id = 'p01' AND aterkallat IS NULL").get().n).toBe(0);
  });

  test('samtyckestjänsten nere: samtycket här gäller, registreringen köas och skickas när tjänsten svarar, och systemförvaltaren får en rad', async () => {
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    nere();
    const d = (await hamta(k, { samtycke: true })).data;
    // Det aktiva valet gäller, men inget från andra vårdgivare visas förrän spärrarna kan kontrolleras.
    expect(d).toMatchObject({ hamtad: true, poster: [], samtyckeGaller: true, samtyckeKalla: 'vardkallan', samtyckestjanst: 'svarar_inte' });
    expect(d.fel).toBeTruthy();
    expect(d.samtyckeText).toContain('Samtycket som registrerades här gäller');
    const rad = db.query("SELECT * FROM samtycke_utkorg WHERE patient_id = 'p01'").get();
    expect(rad).toMatchObject({ handling: 'registrera', status: 'vantar' });
    expect(rad.forsok).toBeGreaterThan(0);
    // Efter flera misslyckade försök får systemförvaltaren en rad, utan patientuppgifter.
    const sen = new Date(Date.now() + 60 * 60_000);
    for (let i = 0; i < 3; i++) samtycke.skickaKo(db, { tvinga: true, nu: sen });
    const forv = samtycke.lageForvaltning(db, sen);
    expect(forv.ejFramme).toBe(1);
    expect(forv.rader[0]).toMatchObject({ handling: 'Registrering av samtycke' });
    const text = JSON.stringify(forv);
    for (const x of ['p01', PNR, 'Gunnar', 'Åkesson', KARD]) expect(text).not.toContain(x);
    // Tjänsten svarar igen: nästa omgång skickar registreringen.
    nationella.satt(null);
    samtycke.skickaKo(db, { nu: new Date(sen.getTime() + 60 * 60_000) });
    expect(db.query("SELECT status FROM samtycke_utkorg WHERE id = ?").get(rad.id).status).toBe('skickad');
    expect(harITjansten(db)).toBe(true);
    expect((await lage(k)).samtyckeText).toBe('Patienten har samtyckt. Samtycket är registrerat här och i samtyckestjänsten.');
  });

  test('samtyckestjänsten nere: ett samtycke från ett annat system kan inte kontrolleras, och systemet säger det', async () => {
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    iAnnatSystem(db);
    nere();
    const d = await lage(k);
    expect(d).toMatchObject({ samtyckeGaller: false, samtyckestjanst: 'svarar_inte' });
    expect(d.samtyckeText).toBe('Samtyckestjänsten svarar inte just nu, så ett samtycke som patienten har gett i ett annat system kan inte kontrolleras. Fråga patienten om samtycke.');
    expect((await hamta(k)).status).toBe(400);
  });

  test('ett återkallat samtycke återkallas här och i samtyckestjänsten, också det som gavs i ett annat system', async () => {
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    await hamta(k, { samtycke: true });
    iAnnatSystem(db);
    expect(harITjansten(db)).toBe(true);
    const r = await k.post('/api/patient/p01/sammanhallen/aterkalla', {});
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ samtyckeGaller: false, hamtad: false });
    expect(harITjansten(db)).toBe(false);
    expect(db.query("SELECT aterkallat_kalla FROM sammanhallen_samtycken WHERE patient_id = 'p01'").get().aterkallat_kalla).toBe('vardkallan');
    expect(db.query("SELECT count(*) AS n FROM rivta_sim_samtycken WHERE patient_id = 'p01' AND aterkallat IS NULL").get().n).toBe(0);
  });

  test('återkallat när tjänsten är nere: inget samtycke gäller, och återkallelsen skickas när tjänsten svarar', async () => {
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    iAnnatSystem(db);
    nere();
    expect((await k.post('/api/patient/p01/sammanhallen/aterkalla', {})).status).toBe(200);
    nationella.satt(null);
    // Samtycket i det andra systemet räknas inte, fast tjänsten inte har fått återkallelsen än.
    db.query("UPDATE samtycke_utkorg SET nasta = '2999-01-01T00:00:00.000Z' WHERE handling = 'aterkalla'").run();
    expect(harITjansten(db)).toBe(true);
    const d = await lage(k);
    expect(d.samtyckeGaller).toBe(false);
    samtycke.skickaKo(db, { tvinga: true });
    expect(harITjansten(db)).toBe(false);
    // Ett nytt samtycke i det andra systemet efter återkallelsen gäller.
    await new Promise(r => setTimeout(r, 1100));
    iAnnatSystem(db);
    expect((await lage(k)).samtyckeGaller).toBe(true);
  });

  test('ett samtycke som patienten återkallar i ett annat system återkallas här', async () => {
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    await hamta(k, { samtycke: true });
    const intyg = db.query("SELECT intyg_id FROM samtycke_utkorg WHERE patient_id = 'p01' AND status = 'skickad'").get().intyg_id;
    const t = new Date().toISOString().replace(/\.\d+Z$/, '');
    nationella.anropa(db, 'CancelExtendedConsent', { AssertionId: intyg, CancellationAction: { RequestDate: t, RequestedBy: { EmployeeId: 'SE0000000000-ANNAT1' }, RegistrationDate: t, RegisteredBy: { EmployeeId: 'SE0000000000-ANNAT1' } } });
    const d = await lage(k);
    expect(d).toMatchObject({ samtyckeGaller: false, hamtad: false, samtycke: null });
    expect(d.samtyckeText).toContain('återkallat samtycket i ett annat system');
    expect(db.query("SELECT aterkallat_kalla FROM sammanhallen_samtycken WHERE patient_id = 'p01'").get().aterkallat_kalla).toBe('annat_system');
    // Det tappade samtycket registreras inte igen.
    expect(db.query("SELECT count(*) AS n FROM samtycke_utkorg WHERE patient_id = 'p01' AND handling = 'registrera'").get().n).toBe(1);
  });

  test('ett utgånget samtycke i samtyckestjänsten gäller inte, men ett som gäller till ett senare datum gör det', async () => {
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    iAnnatSystem(db, { slut: '2020-01-01T00:00:00' });
    expect((await lage(k)).samtyckeGaller).toBe(false);
    iAnnatSystem(db, { slut: '2099-12-31T23:59:59' });
    const d = await lage(k);
    expect(d.samtyckeGaller).toBe(true);
    expect(d.samtyckeText).toContain('det gäller till och med den 31 december 2099');
  });

  test('ett samtycke på en annan vårdenhet syns inte och ändrar inte svaret', async () => {
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    const utan = JSON.stringify(await lage(k));
    iAnnatSystem(db, { enhet: 'SE2321000164-VK0160' });
    expect(JSON.stringify(await lage(k))).toBe(utan);
    expect(utan).not.toContain('VK0160');
  });

  test('ett intyg om nödsituation från ett annat system ger inget samtycke här, och nödåtkomst här registrerar ett eget', async () => {
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    iAnnatSystem(db, { typ: 'Emergency' });
    expect((await lage(k)).samtyckeGaller).toBe(false);
    expect(samtycke.registreraNodsituation({ db, personal: db.query("SELECT * FROM personal WHERE id = 'lak-kard'").get(), patientId: 'p01' })).toBe(true);
    const rad = db.query("SELECT * FROM samtycke_utkorg WHERE patient_id = 'p01' AND typ = 'Emergency'").get();
    expect(rad).toMatchObject({ status: 'skickad', handling: 'registrera' });
    expect(JSON.parse(rad.begaran)).toMatchObject({ AssertionType: 'Emergency', EmployeeId: hsa(db, 'lak-kard') });
    // Ett per dag och person.
    expect(samtycke.registreraNodsituation({ db, personal: db.query("SELECT * FROM personal WHERE id = 'lak-kard'").get(), patientId: 'p01' })).toBe(false);
  });

  test('skyddade personuppgifter: inget samtycke registreras, och inget skickas till eller hämtas från samtyckestjänsten', async () => {
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    db.query("UPDATE patienter SET skyddad = 1 WHERE id = 'p01'").run();
    iAnnatSystem(db);
    const fore = anropslogg(db, { max: 500 }).filter(a => /Consent/.test(a.kontrakt ?? '')).length;
    const r = await hamta(k, { samtycke: true });
    expect(r.status).toBe(409);
    expect((await k.get('/api/patient/p01/sammanhallen')).data).toMatchObject({ samtyckeGaller: false, samtyckestjanst: 'ej_aktuell', hamtningMojlig: false });
    expect(anropslogg(db, { max: 500 }).filter(a => /Consent/.test(a.kontrakt ?? '')).length).toBe(fore);
    expect(db.query("SELECT count(*) AS n FROM samtycke_utkorg WHERE patient_id = 'p01'").get().n).toBe(0);
    expect(db.query("SELECT count(*) AS n FROM sammanhallen_samtycken WHERE patient_id = 'p01'").get().n).toBe(0);
  });

  test('fel roll och fel vårdenhet: samtycket prövas bara för den som får läsa journalen, och gäller bara på sin vårdenhet', async () => {
    const k = await inloggad('lak-kard');
    await hamta(k, { samtycke: true });
    const s = sandlada(app, k);
    somPerson(s, 'adm-kard');
    expect((await k.get('/api/patient/p01/sammanhallen')).status).toBe(403);
    // En läkare på en annan vårdenhet ser inte kardiologens samtycke, och svaret är detsamma som utan det.
    somPerson(s, 'lak-vc');
    const r = await k.get('/api/patient/p01/sammanhallen');
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ samtyckeGaller: false, samtycke: null });
    expect(JSON.stringify(r.data)).not.toContain(KARD);
  });
  test('samtycket finns i FHIR som Consent med journalens behörighet och loggning, och ett återkallat är inactive', async () => {
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    await hamta(k, { samtycke: true });
    const b = (await k.get('/fhir/Consent?patient=p01')).data;
    expect(b.total).toBe(1);
    const c = b.entry[0].resource;
    expect(c).toMatchObject({ resourceType: 'Consent', status: 'active', patient: { reference: 'Patient/p01' }, provision: { type: 'permit' } });
    expect(c.scope.coding[0].code).toBe('patient-privacy');
    expect(db.query("SELECT count(*) AS n FROM atkomstlogg WHERE patient_id = 'p01' AND resurs LIKE 'fhir/Consent%' AND handling = 'las_journal'").get().n).toBeGreaterThan(0);
    await k.post('/api/patient/p01/sammanhallen/aterkalla', {});
    const efter = (await k.get(`/fhir/Consent/${c.id}`)).data;
    expect(efter.status).toBe('inactive');
    expect(efter.provision.period.end).toBeTruthy();
    // Utan läsrätt till journalen nekas sökningen, som för journalen.
    somPerson(sandlada(app, k), 'adm-kard');
    expect((await k.get('/fhir/Consent?patient=p01')).status).toBe(403);
    expect((await k.get('/fhir/metadata')).data.rest[0].resource.some(r => r.type === 'Consent')).toBe(true);
  });
});
