// Runda 15, r2: samtycket till sammanhållen journalföring i Vårdkällan och i samtyckestjänsten (Sussa 2.2.1.4 och 5.2.1.7,
// lag 2022:913 3 kap. och Ineras tjänstekontraktsbeskrivning ehr:patientconsent 1.0).
//
// Personalen gör ett val en gång: patienten samtycker, eller patienten återkallar. Systemet sköter resten:
//   - Samtycket registreras i Vårdkällan och i samtyckestjänsten (RegisterExtendedConsent). Svarar tjänsten inte läggs
//     registreringen i en kö och skickas när tjänsten svarar igen. Går den inte fram får systemförvaltaren en rad.
//   - Samtycket prövas mot båda. Ett samtycke som patienten har gett i ett annat system hos vårdgivaren (det finns i
//     samtyckestjänsten för vårdenheten) gäller också här. Svarar tjänsten inte gäller det samtycke som registrerades här.
//   - Ett återkallat samtycke återkallas på båda ställen (CancelExtendedConsent), också samtycken som har getts i andra
//     system för vårdenheten. Har patienten återkallat i ett annat system återkallas samtycket här också.
//   - Ett utgånget, återkallat eller makulerat samtycke i tjänsten gäller inte, och inte heller ett intyg om nödsituation
//     från ett annat system: nödåtkomst prövas alltid här, i den egna inloggningen.
//   - För en patient med skyddade personuppgifter, eller utan person- eller samordningsnummer, gäller bara samtycket i
//     Vårdkällan. Inget skickas till eller hämtas från tjänsten med patientens identitet.
//
// Samtyckestjänsten är simulerad i demon (rivta/nationella.js). Klockorna antas gå lika i Vårdkällan och tjänsten.
import { randomUUID } from 'node:crypto';
import { iso } from './db.js';
import { vardenhetFor } from './atkomst.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS samtycke_utkorg (
  id INTEGER PRIMARY KEY, patient_id TEXT NOT NULL, samtycke_id INTEGER, handling TEXT NOT NULL CHECK (handling IN ('registrera', 'aterkalla')),
  typ TEXT NOT NULL DEFAULT 'Consent' CHECK (typ IN ('Consent', 'Emergency')), intyg_id TEXT, personal_hsa TEXT, begaran TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('vantar', 'skickad', 'avbruten')), skapad TEXT NOT NULL, forsok INTEGER NOT NULL DEFAULT 0,
  nasta TEXT, senaste_forsok TEXT, fel TEXT, skickad TEXT);
CREATE INDEX IF NOT EXISTS ix_samtycke_utkorg_patient ON samtycke_utkorg (patient_id, status);
CREATE TABLE IF NOT EXISTS samtycke_aterkallanden (id INTEGER PRIMARY KEY, patient_id TEXT NOT NULL, enhet_id TEXT NOT NULL, tid TEXT NOT NULL, av TEXT);
`;
const sakrad = new WeakSet();
export function sakra(db) {
  if (sakrad.has(db)) return;
  db.exec(SCHEMA);
  const kol = db.query('PRAGMA table_info(sammanhallen_samtycken)').all().map(k => k.name);
  // Varifrån återkallelsen kom: vardkallan (här) eller annat_system (samtyckestjänsten sa att patienten hade återkallat).
  if (kol.length && !kol.includes('aterkallat_kalla')) db.exec('ALTER TABLE sammanhallen_samtycken ADD COLUMN aterkallat_kalla TEXT');
  // Runda 15, r2, andra omgången: giltigheten som patienten har valt (vardrelation, tid eller tillsvidare) och det sista
  // datumet för en viss tid. Ett samtycke från före giltigheten gäller tills vidare. Giltigheten ändras aldrig i efterhand.
  if (kol.length && !kol.includes('giltighet')) db.exec('ALTER TABLE sammanhallen_samtycken ADD COLUMN giltighet TEXT');
  if (kol.length && !kol.includes('giltig_till')) db.exec('ALTER TABLE sammanhallen_samtycken ADD COLUMN giltig_till TEXT');
  if (kol.length) db.exec("CREATE TRIGGER IF NOT EXISTS sj_samtycke_giltighet_andras_ej BEFORE UPDATE OF giltighet, giltig_till ON sammanhallen_samtycken BEGIN SELECT RAISE(ABORT, 'Ett samtyckes giltighet ändras inte'); END");
  if (kol.length) sakrad.add(db);
}

// ---------------------------------------------------------------------------------------------------------------
// Runda 15, r2, andra omgången: samtyckets giltighet. Lagen (2022:913) säger inget om hur länge ett samtycke gäller, men
// 3 kap. 1 § kräver en aktuell patientrelation för åtkomsten. Förvalet är därför att samtycket gäller så länge
// vårdrelationen pågår, enligt systemets regel för vårdrelation. Patienten kan i stället välja en viss tid eller tills
// vidare. Samtyckestjänstens kontrakt har bara ett slutdatum (EndDate): en viss tid skickas som slutdatum, och de andra
// två utan slutdatum. När vårdrelationen upphör återkallar systemet samtycket i tjänsten.
export const GILTIGHETER = [
  { id: 'vardrelation', text: 'Så länge vårdrelationen pågår', forklaring: 'Samtycket upphör av sig självt när patienten inte längre har en vårdrelation till vårdenheten. Det är förvalet.' },
  { id: 'tid', text: 'Till och med ett visst datum', forklaring: 'Samtycket gäller till och med den dag patienten väljer, men aldrig utan en vårdrelation.' },
  { id: 'tillsvidare', text: 'Tills vidare', forklaring: 'Samtycket gäller tills patienten återkallar det, men aldrig utan en vårdrelation.' },
];
const MAX_DAGAR = 3660;
const datumSv = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('sv-SE', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
export const giltighetText = (s) => (s?.giltighet === 'vardrelation' ? 'Samtycket gäller så länge patienten har en vårdrelation till vårdenheten.'
  : s?.giltighet === 'tid' && s.giltig_till ? `Samtycket gäller till och med den ${datumSv(s.giltig_till)}.` : 'Samtycket gäller tills patienten återkallar det.');
// Patientens svar ur begäran. Ger { giltighet, giltigTill } eller kastar ett fel med fältet.
export function giltighetAv(body = {}, nu = new Date()) {
  const { Fel } = require('./db.js');
  const g = body.giltighet ?? 'vardrelation';
  if (typeof g !== 'string' || !GILTIGHETER.some(x => x.id === g)) throw new Fel(400, 'Välj hur länge samtycket gäller enligt patientens svar: så länge vårdrelationen pågår, till ett visst datum eller tills vidare.', 'ogiltig', { falt: ['giltighet'] });
  if (g !== 'tid') return { giltighet: g, giltigTill: null };
  const d = body.giltigTill;
  const idag = nu.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
  const sista = new Date(nu.getTime() + MAX_DAGAR * 86400_000).toISOString().slice(0, 10);
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)) || d < idag || d > sista) {
    throw new Fel(400, 'Ange det sista datumet som patienten vill att samtycket ska gälla, i dag eller senare och högst tio år fram.', 'ogiltig', { falt: ['giltigTill'] });
  }
  return { giltighet: 'tid', giltigTill: d };
}
// Registrerar patientens samtycke på vårdenheten, med giltigheten, och skickar det till tjänsten genom kön.
export function registrera(atk, body = {}, { nu = new Date() } = {}) {
  const db = atk.db;
  sakra(db);
  const { giltighet, giltigTill } = giltighetAv(body, nu);
  const id = Number(db.query('INSERT INTO sammanhallen_samtycken (patient_id, enhet_id, registrerat, registrerat_av, giltighet, giltig_till) VALUES (?, ?, ?, ?, ?, ?)')
    .run(atk.patientId, atk.personal.enhet_id, iso(nu), atk.personal.id, giltighet, giltigTill).lastInsertRowid);
  koaRegistrering(atk, { samtyckeId: id, nu, slut: giltigTill ? `${giltigTill}T23:59:59` : null });
  return id;
}
// Upphör ett samtycke som inte gäller längre: en viss tid som har passerat, eller en vårdrelation som har upphört.
// Ger orsaken ('utgangen' eller 'vardrelation') eller null när samtycket gäller.
export function upphortNu(db, s, nu = new Date()) { return upphort(db, s, nu); }
function upphort(db, s, nu) {
  if (s.giltighet === 'tid' && s.giltig_till && s.giltig_till < nu.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })) return 'utgangen';
  if (s.giltighet === 'vardrelation' && !require('./atkomst.js').harVardrelation(db, s.patient_id, vardenhetFor(db, s.enhet_id), nu)) return 'vardrelation';
  return null;
}
function lattUpphora(db, s, orsak, nu) {
  db.query('UPDATE sammanhallen_samtycken SET aterkallat = ?, aterkallat_kalla = ? WHERE id = ? AND aterkallat IS NULL').run(iso(nu), orsak, s.id);
  // En viss tid har redan sitt slutdatum i tjänsten. När vårdrelationen upphör återkallas samtycket där.
  if (orsak !== 'vardrelation') return;
  // Säkerhetsgranskningen efter sammanslagningen: också registreringar som har försökts, eftersom de kan ha kommit fram.
  const ids = db.query(`SELECT intyg_id FROM samtycke_utkorg WHERE samtycke_id = ? AND handling = 'registrera' AND ${KAN_FINNAS} AND intyg_id IS NOT NULL`).all(s.id).map(r => r.intyg_id);
  db.query("UPDATE samtycke_utkorg SET status = 'avbruten' WHERE samtycke_id = ? AND handling = 'registrera' AND status = 'vantar'").run(s.id);
  const pid = nationellIdentitet(db, s.patient_id);
  if (!ids.length) return;
  // Säkerhetsgranskningen efter sammanslagningen: återkallelsen med de egna intygen kräver inget personnummer, så den
  // skickas också när patienten har fått skyddad identitet, utan identiteten.
  koa(db, { patientId: s.patient_id, samtyckeId: s.id, handling: 'aterkalla', personalHsa: null, begaran: { CareProviderId: vardgivare(db), ...(pid ? { PatientId: pid.id } : {}), AssertionIds: ids, av: 'vardkallan-system' } }, nu);
}
// Går igenom alla gällande samtycken med en giltighet som kan upphöra. Körs av timern och i prövningen.
export function stamAvGiltighet(db, nu = new Date()) {
  sakra(db);
  let n = 0;
  for (const s of db.query("SELECT * FROM sammanhallen_samtycken WHERE aterkallat IS NULL AND giltighet IN ('vardrelation', 'tid')").all()) {
    const orsak = upphort(db, s, nu);
    if (orsak) { lattUpphora(db, s, orsak, nu); n++; }
  }
  if (n) skickaKo(db, { nu });
  return n;
}

const OID_PNR = '1.2.752.129.2.1.3.1';
const OID_SAMORDNING = '1.2.752.129.2.1.3.3';
const tjanstTid = (d) => d.toISOString().replace(/\.\d+Z$/, '').replace(/Z$/, '');
const nat = () => require('./rivta/nationella.js');
const vardgivare = (db) => require('./rivta/konsumenter.js').vardgivare(db);
const enhetHsa = (db, ve) => db.query('SELECT hsa_id FROM enheter WHERE id = ?').get(ve)?.hsa_id ?? ve;

// Patientens identitet för tjänsten, eller null när inget får skickas dit.
export function nationellIdentitet(db, patientId) {
  const p = db.query('SELECT personnummer, id_typ, skyddad FROM patienter WHERE id = ?').get(patientId);
  if (!p || p.skyddad || !['personnummer', 'samordningsnummer'].includes(p.id_typ) || !/^\d{12}$/.test(String(p.personnummer ?? ''))) return null;
  return { id: String(p.personnummer), type: p.id_typ === 'samordningsnummer' ? OID_SAMORDNING : OID_PNR };
}
const anstallningsId = (personal) => personal.hsa_id ?? personal.id;
function aktion(personal, nu) {
  const t = tjanstTid(nu);
  const aktor = { EmployeeId: anstallningsId(personal) };
  return { RequestDate: t, RequestedBy: aktor, RegistrationDate: t, RegisteredBy: aktor };
}

// Det gällande samtycket i Vårdkällan för personens vårdenhet. Runda 15, r2: ett samtycke som har upphört enligt sin
// giltighet upphör här, innan något annat prövas.
export function lokalt(db, personal, patientId, nu = new Date()) {
  sakra(db);
  const ve = vardenhetFor(db, personal.enhet_id);
  for (const s of db.query('SELECT * FROM sammanhallen_samtycken WHERE patient_id = ? AND aterkallat IS NULL ORDER BY id DESC').all(patientId)) {
    if (vardenhetFor(db, s.enhet_id) !== ve) continue;
    const orsak = upphort(db, s, nu);
    if (!orsak) return s;
    lattUpphora(db, s, orsak, nu);
  }
  return null;
}
// Hur det senaste samtycket på vårdenheten upphörde av sig självt, om det gjorde det: 'utgangen' eller 'vardrelation'.
function senastUpphort(db, personal, patientId) {
  const ve = vardenhetFor(db, personal.enhet_id);
  const s = db.query('SELECT * FROM sammanhallen_samtycken WHERE patient_id = ? ORDER BY id DESC').all(patientId).find(x => vardenhetFor(db, x.enhet_id) === ve);
  return s && ['utgangen', 'vardrelation'].includes(s.aterkallat_kalla) ? s.aterkallat_kalla : null;
}
const senasteAterkallande = (db, patientId, ve) => db.query('SELECT max(tid) AS t FROM samtycke_aterkallanden WHERE patient_id = ? AND enhet_id = ?').get(patientId, ve)?.t ?? null;

// ---------------------------------------------------------------------------------------------------------------
// Kön till samtyckestjänsten.
export const vantetidMs = (forsok) => Math.min(30, 2 ** Math.max(0, forsok - 1)) * 60_000;
function koa(db, rad, nu) {
  db.query('INSERT INTO samtycke_utkorg (patient_id, samtycke_id, handling, typ, intyg_id, personal_hsa, begaran, status, skapad) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(rad.patientId, rad.samtyckeId ?? null, rad.handling, rad.typ ?? 'Consent', rad.intygId ?? null, rad.personalHsa ?? null, JSON.stringify(rad.begaran), 'vantar', iso(nu));
}

// Registrerar ett samtycke (eller ett intyg om nödsituation) i kön och försöker skicka det direkt.
export function koaRegistrering(atk, { samtyckeId = null, typ = 'Consent', nu = new Date(), slut = null, personligt = false } = {}) {
  const db = atk.db;
  sakra(db);
  const pid = nationellIdentitet(db, atk.patientId);
  if (!pid) return false;
  const ve = vardenhetFor(db, atk.personal.enhet_id);
  const intygId = `vk-${samtyckeId ?? 'nod'}-${randomUUID().slice(0, 18)}`;
  const begaran = { AssertionId: intygId, AssertionType: typ, Scope: 'NationalLevel', PatientId: pid.id, CareProviderId: vardgivare(db), CareUnitId: enhetHsa(db, ve),
    ...(personligt ? { EmployeeId: anstallningsId(atk.personal) } : {}), ...(slut ? { EndDate: slut } : {}), RegistrationAction: aktion(atk.personal, nu) };
  koa(db, { patientId: atk.patientId, samtyckeId, handling: 'registrera', typ, intygId, personalHsa: anstallningsId(atk.personal), begaran }, nu);
  skickaKo(db, { nu, patientId: atk.patientId });
  return true;
}

// Återkallar på vårdenheten: alla giltiga samtycken i tjänsten för vårdenheten som registrerades före återkallelsen.
// Säkerhetsgranskningen efter sammanslagningen: vårdenhetens samtycken (inte intyg om nödsituation) för patienten som kan
// finnas i tjänsten och registrerades före återkallelsen: de som har skickats, och de som har försökts men inte fått svar,
// eftersom de kan ha kommit fram. Ett intyg som aldrig kom fram ger bara NOTFOUND vid återkallelsen.
const KAN_FINNAS = "(status = 'skickad' OR forsok > 0)";
function egnaIntyg(db, patientId, careUnitId, foreIso) {
  return db.query(`SELECT intyg_id, begaran, skapad FROM samtycke_utkorg WHERE patient_id = ? AND handling = 'registrera' AND typ = 'Consent' AND ${KAN_FINNAS} AND intyg_id IS NOT NULL AND skapad <= ?`).all(patientId, foreIso)
    .filter(r => { try { const b = JSON.parse(r.begaran); return b.CareUnitId === careUnitId && (b.AssertionType ?? 'Consent') === 'Consent'; } catch { return false; } }).map(r => r.intyg_id);
}
// Säkerhetsgranskningen efter sammanslagningen: två fall med var sin funktion.
//   (a) Patienten återkallar sitt samtycke, eller samtycket upphör: bara samtycken (egnaIntyg och lattUpphora).
//   (b) Patientens uppgifter tas bort ur tjänsten: alla intyg som Vårdkällan har registrerat för patienten, också intyg
//       om nödsituation, inklusive väntande och försökta registreringar (allaIntyg och taBortUrTjansten). Anropas när
//       en hel journal förstörs (arkiv.js radera, vid gallring och radering), när patienten har fått skyddad identitet
//       (efterTid) och när journalen slås samman med en annan (identitet.js slaSamman).
export function allaIntyg(db, patientId) {
  // Utan kö finns inga intyg. Funktionen ändrar ingenting i databasen, så att den kan anropas mitt i en sammanslagning.
  if (!db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'samtycke_utkorg'").get()) return [];
  const borttagna = new Set(db.query("SELECT begaran FROM samtycke_utkorg WHERE patient_id = ? AND handling = 'aterkalla' AND status IN ('vantar', 'skickad')").all(patientId)
    .flatMap(r => { try { return JSON.parse(r.begaran).AssertionIds ?? []; } catch { return []; } }));
  return db.query("SELECT intyg_id FROM samtycke_utkorg WHERE patient_id = ? AND handling = 'registrera' AND intyg_id IS NOT NULL AND (status = 'skickad' OR status = 'vantar' OR forsok > 0)").all(patientId)
    .map(r => r.intyg_id).filter(id => !borttagna.has(id));
}
// Köar borttagningen. ids hämtas före en radering (allaIntyg), eftersom raderingen tar bort köns rader.
export function taBortUrTjansten(db, patientId, ids = allaIntyg(db, patientId), nu = new Date()) {
  sakra(db);
  if (!ids.length) return false;
  const ph = ids.map(() => '?').join(', ');
  db.query(`UPDATE samtycke_utkorg SET status = 'avbruten' WHERE patient_id = ? AND handling = 'registrera' AND status = 'vantar' AND intyg_id IN (${ph})`).run(patientId, ...ids);
  koa(db, { patientId, handling: 'aterkalla', personalHsa: null, begaran: { CareProviderId: vardgivare(db), AssertionIds: ids, av: 'vardkallan-system', borttagning: true } }, nu);
  return true;
}
// Beslut från Jonas 2026-11-14: när journaler slås samman registreras de lokala samtycken som följde med om i tjänsten på
// den journal som finns kvar, med kön som vanligt, så att lokalt och nationellt stämmer. Intygen för den gamla journalen
// tas bort med taBortUrTjansten.
export function samtyckenAttFlytta(db, patientId) {
  if (!db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sammanhallen_samtycken'").get()) return [];
  return db.query('SELECT id FROM sammanhallen_samtycken WHERE patient_id = ? AND aterkallat IS NULL').all(patientId).map(r => r.id);
}
export function registreraOm(db, patientId, samtyckeIds, nu = new Date()) {
  if (!samtyckeIds.length) return 0;
  sakra(db);
  const pid = nationellIdentitet(db, patientId);
  if (!pid) return 0;
  let n = 0;
  for (const id of samtyckeIds) {
    const s = db.query('SELECT * FROM sammanhallen_samtycken WHERE id = ? AND patient_id = ? AND aterkallat IS NULL').get(id, patientId);
    if (!s || upphort(db, s, nu)) continue;
    const personal = db.query('SELECT * FROM personal WHERE id = ?').get(s.registrerat_av) ?? { id: 'vardkallan-system', hsa_id: 'vardkallan-system' };
    const intygId = `vk-${s.id}-${randomUUID().slice(0, 18)}`;
    const slut = s.giltighet === 'tid' && s.giltig_till ? `${s.giltig_till}T23:59:59` : null;
    const begaran = { AssertionId: intygId, AssertionType: 'Consent', Scope: 'NationalLevel', PatientId: pid.id, CareProviderId: vardgivare(db), CareUnitId: enhetHsa(db, vardenhetFor(db, s.enhet_id)),
      ...(slut ? { EndDate: slut } : {}), RegistrationAction: aktion(personal, nu) };
    koa(db, { patientId, samtyckeId: s.id, handling: 'registrera', typ: 'Consent', intygId, personalHsa: anstallningsId(personal), begaran }, nu);
    n++;
  }
  return n;
}
// Patienter med skyddad identitet som har intyg kvar i tjänsten. Körs av timern.
function skyddadeUrTjansten(db, nu) {
  const pids = db.query("SELECT DISTINCT u.patient_id AS id FROM samtycke_utkorg u JOIN patienter p ON p.id = u.patient_id WHERE p.skyddad = 1 AND u.handling = 'registrera' AND (u.status = 'skickad' OR u.status = 'vantar' OR u.forsok > 0)").all().map(r => r.id);
  let n = 0;
  for (const pid of pids) if (taBortUrTjansten(db, pid, allaIntyg(db, pid), nu)) n++;
  return n;
}
const UTAN_INTYG = 'Samtycket kan inte återkallas i samtyckestjänsten utan patientens identitet, och Vårdkällan har inga egna intyg att återkalla. Systemförvaltaren behöver återkalla det i tjänsten.';
function koaAterkallelse(atk, nu) {
  const db = atk.db;
  const pid = nationellIdentitet(db, atk.patientId);
  const ve = vardenhetFor(db, atk.personal.enhet_id);
  // Säkerhetsgranskningen efter sammanslagningen: med skyddad identitet återkallas vårdenhetens egna intyg, utan
  // personnummer, så att ett samtycke som registrerades före skyddet inte blir kvar som gällande i tjänsten.
  if (!pid) {
    const ids = egnaIntyg(db, atk.patientId, enhetHsa(db, ve), iso(nu));
    db.query("UPDATE samtycke_utkorg SET status = 'avbruten' WHERE patient_id = ? AND handling = 'registrera' AND typ = 'Consent' AND status = 'vantar'").run(atk.patientId);
    // En tom lista skickas aldrig som klar: raden står kvar för systemförvaltaren (skickaKo).
    koa(db, { patientId: atk.patientId, handling: 'aterkalla', personalHsa: anstallningsId(atk.personal), begaran: { CareProviderId: vardgivare(db), AssertionIds: ids, av: anstallningsId(atk.personal) } }, nu);
    skickaKo(db, { nu, patientId: atk.patientId });
    return true;
  }
  koa(db, { patientId: atk.patientId, handling: 'aterkalla', personalHsa: anstallningsId(atk.personal),
    begaran: { CareProviderId: vardgivare(db), PatientId: pid.id, CareUnitId: enhetHsa(db, ve), fore: tjanstTid(nu), av: anstallningsId(atk.personal) } }, nu);
  skickaKo(db, { nu, patientId: atk.patientId });
  return true;
}

class ResultatFel extends Error { constructor(text) { super(text); this.kod = 'resultat'; } }
function utfor(db, r, nu) {
  const n = nat();
  const b = JSON.parse(r.begaran);
  if (r.handling === 'registrera') {
    const svar = n.anropa(db, 'RegisterExtendedConsent', b);
    if (!['OK', 'ALREADYEXISTS'].includes(svar.ResultType.ResultCode)) throw new ResultatFel(`Samtyckestjänsten registrerade inte samtycket (${svar.ResultType.ResultCode}).`);
    return;
  }
  // Runda 15, r2: ett samtycke vars vårdrelation har upphört återkallas med sina egna intyg.
  if (Array.isArray(b.AssertionIds)) {
    for (const id of b.AssertionIds) {
      const svar = n.anropa(db, 'CancelExtendedConsent', { AssertionId: id, CancellationAction: aktion({ hsa_id: b.av }, nu) });
      if (!['OK', 'NOTFOUND'].includes(svar.ResultType.ResultCode)) throw new ResultatFel(`Samtyckestjänsten återkallade inte samtycket (${svar.ResultType.ResultCode}).`);
    }
    return;
  }
  const lista = hamtaLista(db, b.CareProviderId, b.PatientId, false);
  for (const x of lista) {
    const a = x.PDLAssertion;
    if (a.AssertionType !== 'Consent' || a.CareUnitId !== b.CareUnitId || x.CancellationInfo || x.DeletionInfo || String(x.RegistrationInfo?.RegistrationDate ?? '') > b.fore) continue;
    const svar = n.anropa(db, 'CancelExtendedConsent', { AssertionId: a.AssertionId, CancellationAction: aktion({ hsa_id: b.av }, nu) });
    if (!['OK', 'NOTFOUND'].includes(svar.ResultType.ResultCode)) throw new ResultatFel(`Samtyckestjänsten återkallade inte samtycket (${svar.ResultType.ResultCode}).`);
  }
}
function hamtaLista(db, vg, personId, aterkallade) {
  const svar = nat().anropa(db, 'GetExtendedConsentsForPatient', { CareProviderId: vg, PatientId: personId, GetCancelledFlag: aterkallade });
  const res = svar.GetExtendedConsentsResultType;
  if (res.Result.ResultCode !== 'OK') throw new ResultatFel('Samtyckestjänsten kunde inte lämna patientens samtycken.');
  return res.PdlAssertions ?? [];
}

// Skickar det som väntar i kön, i ordning per patient. En rad som inte går fram stoppar de senare raderna för samma
// patient, så att en återkallelse aldrig går före registreringen. Svarar tjänsten inte alls avbryts omgången.
export function skickaKo(db, { nu = new Date(), patientId = null, tvinga = false } = {}) {
  sakra(db);
  const t = iso(nu);
  const villkor = ["status = 'vantar'"];
  const arg = [];
  if (patientId) { villkor.push('patient_id = ?'); arg.push(patientId); }
  if (!tvinga) { villkor.push('(nasta IS NULL OR nasta <= ?)'); arg.push(t); }
  const rader = db.query(`SELECT * FROM samtycke_utkorg WHERE ${villkor.join(' AND ')} ORDER BY id`).all(...arg);
  const stoppade = new Set();
  let skickade = 0;
  let fel = null;
  for (const r of rader) {
    if (stoppade.has(r.patient_id)) continue;
    // Säkerhetsgranskningen efter sammanslagningen: har patienten fått skyddad identitet sedan raden köades skickas inget
    // som bär patientens identitet. En registrering avbryts, och en återkallelse görs med vårdenhetens egna intyg.
    if (!nationellIdentitet(db, r.patient_id)) {
      let b = null;
      try { b = JSON.parse(r.begaran); } catch { b = null; }
      if (r.handling === 'registrera' || !b) { db.query("UPDATE samtycke_utkorg SET status = 'avbruten', fel = ? WHERE id = ?").run('Patienten har skyddad identitet, så inget skickas till samtyckestjänsten.', r.id); continue; }
      if (!Array.isArray(b.AssertionIds)) {
        const ids = egnaIntyg(db, r.patient_id, b.CareUnitId, r.skapad);
        db.query('UPDATE samtycke_utkorg SET begaran = ? WHERE id = ?').run(JSON.stringify({ CareProviderId: b.CareProviderId, AssertionIds: ids, av: b.av }), r.id);
        r.begaran = JSON.stringify({ CareProviderId: b.CareProviderId, AssertionIds: ids, av: b.av });
      } else if (b.PatientId) {
        const utan = { ...b }; delete utan.PatientId;
        db.query('UPDATE samtycke_utkorg SET begaran = ? WHERE id = ?').run(JSON.stringify(utan), r.id);
        r.begaran = JSON.stringify(utan);
      }
    }
    // En återkallelse med en tom lista med intyg markeras aldrig som skickad. Den står kvar för systemförvaltaren.
    if (r.handling === 'aterkalla') {
      let b = null;
      try { b = JSON.parse(r.begaran); } catch { b = null; }
      if (Array.isArray(b?.AssertionIds) && !b.AssertionIds.length) {
        db.query("UPDATE samtycke_utkorg SET forsok = max(forsok, 3), nasta = '9999-12-31T00:00:00.000Z', senaste_forsok = ?, fel = ? WHERE id = ?").run(t, UTAN_INTYG, r.id);
        fel = UTAN_INTYG;
        continue;
      }
    }
    try {
      utfor(db, r, nu);
      db.query("UPDATE samtycke_utkorg SET status = 'skickad', skickad = ?, senaste_forsok = ?, fel = NULL WHERE id = ?").run(t, t, r.id);
      skickade++;
    } catch (e) {
      if (!e?.kod) throw e;
      const forsok = r.forsok + 1;
      fel = e.kod === 'resultat' ? e.message : 'Samtyckestjänsten svarade inte.';
      db.query('UPDATE samtycke_utkorg SET forsok = ?, nasta = ?, senaste_forsok = ?, fel = ? WHERE id = ?').run(forsok, new Date(nu.getTime() + vantetidMs(forsok)).toISOString(), t, fel, r.id);
      stoppade.add(r.patient_id);
      if (e.kod !== 'resultat') break;
    }
  }
  return { skickade, fel };
}

const stamdes = new WeakMap();
export function efterTid(db, nu = new Date()) {
  try {
    sakra(db);
    // Runda 15, r2: giltigheten stäms av var tionde minut.
    if (!stamdes.has(db) || nu.getTime() - stamdes.get(db) > 10 * 60_000) { stamdes.set(db, nu.getTime()); stamAvGiltighet(db, nu); skyddadeUrTjansten(db, nu); }
    if (!db.query("SELECT 1 FROM samtycke_utkorg WHERE status = 'vantar' AND (nasta IS NULL OR nasta <= ?) LIMIT 1").get(iso(nu))) return null;
    return skickaKo(db, { nu });
  } catch (e) {
    console.error('Samtyckestjänsten:', e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Prövningen. Ger { galler, kalla, lokalt, nationellt, tjanst, text }.
//   kalla: 'vardkallan' (registrerat här), 'annat_system' (bara i samtyckestjänsten) eller null.
//   tjanst: 'ok', 'svarar_inte' eller 'ej_aktuell' (skyddade personuppgifter eller inget nationellt nummer).
const datumText = (t) => (t ? new Date(/Z$/.test(t) ? t : `${t}Z`).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'long', year: 'numeric' }) : '');
// Ett slutdatum visas som det står i intyget, utan att räknas om, eftersom det oftast är slutet på en dag.
const slutText = (t) => (t ? new Date(`${String(t).slice(0, 10)}T12:00:00Z`).toLocaleDateString('sv-SE', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }) : '');
export function prova(atk, { nu = new Date() } = {}) {
  const db = atk.db;
  sakra(db);
  let lok = lokalt(db, atk.personal, atk.patientId, nu);
  const pid = nationellIdentitet(db, atk.patientId);
  if (!pid) {
    return { galler: Boolean(lok), kalla: lok ? 'vardkallan' : null, lokalt: lok, nationellt: null, tjanst: 'ej_aktuell',
      text: lok && db.query('SELECT skyddad FROM patienter WHERE id = ?').get(atk.patientId)?.skyddad ? 'Samtycket gäller här. Det registreras inte i samtyckestjänsten, eftersom patienten har skyddade personuppgifter.' : lok ? null : upphorText(db, atk) };
  }
  // Det som väntar i kön för patienten skickas först, så att tjänsten har det som har registrerats här.
  skickaKo(db, { nu, patientId: atk.patientId });
  const vg = vardgivare(db);
  let lista;
  try { lista = hamtaLista(db, vg, pid.id, true); } catch (e) {
    if (!e?.kod) throw e;
    lista = null;
  }
  if (!lista) {
    return { galler: Boolean(lok), kalla: lok ? 'vardkallan' : null, lokalt: lok, nationellt: null, tjanst: 'svarar_inte',
      text: lok ? 'Samtyckestjänsten svarar inte just nu. Samtycket som registrerades här gäller, och systemet skickar det som väntar när tjänsten svarar igen.'
        : `Samtyckestjänsten svarar inte just nu, så ett samtycke som patienten har gett i ett annat system kan inte kontrolleras. ${upphorText(db, atk) ?? 'Fråga patienten om samtycke.'}` };
  }
  const ve = vardenhetFor(db, atk.personal.enhet_id);
  const minEnhet = enhetHsa(db, ve);
  const jag = anstallningsId(atk.personal);
  const t = tjanstTid(nu);
  let aterkallatAnnat = false;
  let vantar = false;
  // Samtycket här jämförs med tjänsten: återkallat där återkallas här, och saknas det där registreras det igen.
  if (lok) {
    const egna = new Set(db.query("SELECT intyg_id FROM samtycke_utkorg WHERE samtycke_id = ? AND handling = 'registrera' AND status = 'skickad'").all(lok.id).map(r => r.intyg_id));
    if (db.query("SELECT 1 FROM sqlite_master WHERE name = 'rivta_samtycke_intyg'").get()) for (const r of db.query('SELECT intyg_id FROM rivta_samtycke_intyg WHERE samtycke_id = ?').all(lok.id)) egna.add(r.intyg_id);
    vantar = Boolean(db.query("SELECT 1 FROM samtycke_utkorg WHERE samtycke_id = ? AND handling = 'registrera' AND status = 'vantar'").get(lok.id));
    const iTjansten = lista.filter(x => egna.has(x.PDLAssertion.AssertionId));
    if (iTjansten.length && iTjansten.every(x => x.CancellationInfo || x.DeletionInfo)) {
      db.query("UPDATE sammanhallen_samtycken SET aterkallat = ?, aterkallat_kalla = 'annat_system' WHERE id = ? AND aterkallat IS NULL").run(iso(nu), lok.id);
      lok = null;
      aterkallatAnnat = true;
    } else if (!iTjansten.length && !vantar) {
      koaRegistrering(atk, { samtyckeId: lok.id, nu });
      vantar = Boolean(db.query("SELECT 1 FROM samtycke_utkorg WHERE samtycke_id = ? AND handling = 'registrera' AND status = 'vantar'").get(lok.id));
    }
  }
  const aterkallat = senasteAterkallande(db, atk.patientId, ve);
  const giltig = lista.filter(x => giltigtSamtycke(x, { minEnhet, jag, t, aterkallat: aterkallat ? tjanstTid(new Date(aterkallat)) : null })).sort((a, b) => String(b.RegistrationInfo?.RegistrationDate).localeCompare(String(a.RegistrationInfo?.RegistrationDate)))[0] ?? null;
  const nationellt = giltig ? { registrerat: giltig.RegistrationInfo?.RegistrationDate ?? null, gallerTill: giltig.PDLAssertion.EndDate ?? null, personligt: Boolean(giltig.PDLAssertion.EmployeeId) } : null;
  const kalla = lok ? 'vardkallan' : giltig ? 'annat_system' : null;
  let text = null;
  if (lok && vantar) text = 'Patienten har samtyckt. Samtyckestjänsten har inte tagit emot registreringen än, och systemet skickar den när tjänsten svarar. Samtycket gäller här under tiden.';
  else if (lok) text = 'Patienten har samtyckt. Samtycket är registrerat här och i samtyckestjänsten.';
  else if (giltig) text = `Patienten har gett samtycke i ett annat system${nationellt.registrerat ? ` den ${datumText(nationellt.registrerat)}` : ''}${nationellt.gallerTill ? `, och det gäller till och med den ${slutText(nationellt.gallerTill)}` : ''}. Samtycket gäller här också.`;
  else if (aterkallatAnnat) text = 'Patienten har återkallat samtycket i ett annat system, och det är återkallat här också. Fråga patienten om samtycke igen för att hämta uppgifterna.';
  else text = upphorText(db, atk);
  return { galler: Boolean(kalla), kalla, lokalt: lok, nationellt, tjanst: 'ok', vantar, text };
}

// Ett intyg ur tjänsten som räknas som samtycke till sammanhållen journalföring på vårdenheten. Säkerhetsgranskningen
// efter sammanslagningen: omfattningen (Scope) prövas. Bara NationalLevel avser sammanhållen journalföring; CareProviderLevel
// gäller inre sekretess hos vårdgivaren och ett intyg utan omfattning räknas inte.
export function giltigtSamtycke(x, { minEnhet, jag, t, aterkallat = null }) {
  const a = x?.PDLAssertion ?? {};
  const reg = String(x?.RegistrationInfo?.RegistrationDate ?? '');
  return a.AssertionType === 'Consent' && a.Scope === 'NationalLevel' && a.CareUnitId === minEnhet && (!a.EmployeeId || a.EmployeeId === jag) && !x.CancellationInfo && !x.DeletionInfo
    && String(a.StartDate ?? '') <= t && (!a.EndDate || String(a.EndDate) >= t) && (!aterkallat || reg > aterkallat);
}

const UPPHORT_TEXT = {
  vardrelation: 'Patientens samtycke upphörde när vårdrelationen upphörde. Fråga patienten om samtycke igen.',
  utgangen: 'Patientens samtycke gällde till och med en dag som har passerat. Fråga patienten om samtycke igen.',
};
const upphorText = (db, atk) => UPPHORT_TEXT[senastUpphort(db, atk.personal, atk.patientId)] ?? null;

// Personalens val att återkalla: samtycket här och i tjänsten för vårdenheten.
export function aterkalla(atk, { nu = new Date() } = {}) {
  const db = atk.db;
  sakra(db);
  const ve = vardenhetFor(db, atk.personal.enhet_id);
  const lok = lokalt(db, atk.personal, atk.patientId);
  db.transaction(() => {
    if (lok) {
      db.query("UPDATE sammanhallen_samtycken SET aterkallat = ?, aterkallat_av = ?, aterkallat_kalla = 'vardkallan' WHERE id = ?").run(iso(nu), atk.personal.id, lok.id);
      db.query("UPDATE samtycke_utkorg SET status = 'avbruten' WHERE samtycke_id = ? AND handling = 'registrera' AND status = 'vantar'").run(lok.id);
    }
    db.query('INSERT INTO samtycke_aterkallanden (patient_id, enhet_id, tid, av) VALUES (?, ?, ?, ?)').run(atk.patientId, ve, iso(nu), atk.personal.id);
  })();
  koaAterkallelse(atk, nu);
  return Boolean(lok);
}

// Ett intyg om nödsituation i samtyckestjänsten när personalen har gjort nödåtkomst här, personligt och till dagens
// slut, så att samma person kan använda andra system för sammanhållen journalföring under nödsituationen. Ett per dag.
export function registreraNodsituation(atk, { nu = new Date() } = {}) {
  const db = atk.db;
  sakra(db);
  if (!nationellIdentitet(db, atk.patientId)) return false;
  const dag = iso(nu).slice(0, 10);
  if (db.query("SELECT 1 FROM samtycke_utkorg WHERE patient_id = ? AND typ = 'Emergency' AND personal_hsa = ? AND substr(skapad, 1, 10) = ?").get(atk.patientId, anstallningsId(atk.personal), dag)) return false;
  return koaRegistrering(atk, { typ: 'Emergency', nu, personligt: true, slut: nat().slutPaDagen(nu) });
}

// ---------------------------------------------------------------------------------------------------------------
// Läget för systemförvaltaren, utan patientuppgifter: antal och raderna som inte har gått fram, med typ, tider och fel.
const HANDLING_TEXT = { registrera: 'Registrering av samtycke', aterkalla: 'Återkallelse av samtycke', nod: 'Intyg om nödsituation' };
export const EJ_FRAMME_MINUTER = 15;
export function lageForvaltning(db, nu = new Date()) {
  sakra(db);
  const grans = new Date(nu.getTime() - EJ_FRAMME_MINUTER * 60_000).toISOString();
  const vantar = db.query("SELECT * FROM samtycke_utkorg WHERE status = 'vantar' ORDER BY id").all();
  const ejFramme = vantar.filter(r => r.forsok >= 3 || r.skapad <= grans);
  const dygn = new Date(nu.getTime() - 86_400_000).toISOString();
  return {
    vantar: vantar.length, ejFramme: ejFramme.length,
    skickadeSenasteDygnet: db.query("SELECT count(*) AS n FROM samtycke_utkorg WHERE status = 'skickad' AND skickad >= ?").get(dygn).n,
    rader: ejFramme.map(r => ({ id: r.id, handling: HANDLING_TEXT[r.typ === 'Emergency' ? 'nod' : r.handling], koad: r.skapad, forsok: r.forsok, nastaForsok: r.nasta, fel: r.fel })),
    text: ejFramme.length ? `${ejFramme.length === 1 ? 'En ändring' : `${ejFramme.length} ändringar`} har inte kommit fram till samtyckestjänsten. Samtyckena gäller i Vårdkällan, och systemet försöker igen av sig självt.`
      : vantar.length ? 'Ändringar väntar och skickas när samtyckestjänsten svarar.' : 'Samtyckestjänsten har alla registreringar och återkallelser.',
  };
}
