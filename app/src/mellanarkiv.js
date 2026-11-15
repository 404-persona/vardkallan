// Runda 14, r4 (Sussa 5.4.2.2): integrerad åtkomst till uppgifter om en patient som har förts över till mellanarkivet.
//
// Mellanarkivet är lokalt i demon. Det tar emot samma slags FGS-paket som exporten till e-arkivet (FGS Paketstruktur 2.0,
// arkiv.js), gör samma mottagningskontroll som e-arkivet (earkiv.js) och sparar paketet och de journalhandlingar som det
// läser ur paketet. Uppgifterna i mellanarkivet ändras aldrig: tabellerna skyddas av triggrar, och varje handling har
// SHA-256 av sitt innehåll som kontrolleras när den läses.
//
// Överföringen. Arkivarien registrerar ett beslut om överföring till mellanarkivet. Systemet tar själv fram underlaget:
// signerade anteckningar som aldrig har rättats och mätvärden som är äldre än fem år, och som inget annat i journalen
// pekar på (en kontrasignering, ett provsvar, ett formulär eller en bild). Systemet bygger ett paket per journal,
// mellanarkivet kontrollerar och tar emot det, och först då tas handlingarna bort ur den aktiva journalen, allt i en
// transaktion. Avvisar mellanarkivet ett paket förs ingenting över.
//
// Åtkomsten. Den som arbetar i journalen behöver inte veta att mellanarkivet finns: anteckningarna står i journalens lista
// och i översiktens tidslinje bland de andra, märkta Ur mellanarkivet, mätvärdena i tidslinjen, och texten är sökbar i
// journalens sökfält. Allt prövas av behörighetsmotorn som journalen i övrigt, på vårdenheten där handlingen skrevs:
// yrkesroll och kategori (inre sekretess för omvårdnad och journal), vårdrelation, aktivt val för andra vårdenheter,
// patientens spärrar som de gäller i dag, skyddad identitet och systemförvaltningens undantag från visning. Varje
// läsning loggas i åtkomstloggen.
import { createHash, randomUUID } from 'node:crypto';
import { Fel, iso, addDagar, idag } from './db.js';
import { kanRoll, vardenhetFor, visningsnamn, visningsPnr, Atkomst, aktivaSparrar } from './atkomst.js';
// Runda 15, r3: undantagen från FHIR och från publicering till nationella tjänster.
import * as undantag from './undantag.js';
// Beslut 2026-11-14: parametern för tillfälliga diagnoser och uppmärksamhetsinformationens kodverkslista.
import * as konfiguration from './konfiguration.js';
import { forDiagnoser as umiForDiagnoser } from './umi-kodverk.js';
import { loggaRad } from './logg.js';
import { packaUpp } from './zip.js';
import * as fhir from './fhir.js';
import * as earkiv from './earkiv.js';
import * as identitet from './identitet.js';
import { lasHandling } from './journal.js';
import { filtreraVisning, undantagnaUt } from './undantag.js';
import { BESLUTSTYPER, MELLANARKIV_AR, beslutUt, hamtaBeslut, byggFgsPaket, slappTriggrar, logiskTyp } from './arkiv.js';

export const MOTTAGARE = 'Mellanarkivet (lokalt i demon)';
export const ETIKETT = 'Ur mellanarkivet';
export const TAGG_KATEGORI = 'urn:vardkallan:anteckningskategori';
export const TAGG_MATTYP = 'urn:vardkallan:matvardestyp';
// Runda 15, r3: vårdenheten som ordinerade eller gav läkemedlet, och för en administrering vårdenheten som ordinerade det.
// MedicationRequest och MedicationAdministration har inget eget element för vårdenheten som ansvarar för uppgiften.
export const TAGG_ENHET = 'urn:vardkallan:vardenhet';
export const TAGG_ORDINATIONSENHET = 'urn:vardkallan:ordinationsenhet';
// Beslut 2026-11-14: vårdenheten som remissen gick till.
export const TAGG_MOTTAGARE = 'urn:vardkallan:mottagare';
// Högst så många handlingar per journal och överföring, så att ett paket inte blir orimligt stort i demon.
export const MAX_PER_JOURNAL = 500;

// Runda 15, r3: mellanarkivet tar också emot avslutade ordinationer och administreringar (slagen ordination och
// administrering). ordination_enhet_id är vårdenheten som ordinerade läkemedlet, för en administrering, så att en dos av
// en spärrad vårdenhets ordination inte syns, som i läkemedelslistan. sista är den sista tidpunkten i handlingen, för
// en ordination när den sattes ut eller slutade, så att gallringsregeln räknar från den (arkiv.js, sistaUppgift).
// Beslut 2026-11-14: också avslutade vårdkontakter, avslutade remisser och tillfälliga diagnoser (slagen vardkontakt,
// remiss och diagnos). mottagare_enhet_id är vårdenheten som remissen gick till. rad är raden som den var i den
// aktiva journalen, ur paketets statistikunderlag, så att statistik och rapporter räknar likadant före och efter en
// överföring (vy).
const HANDLINGAR_TABELL = `
CREATE TABLE IF NOT EXISTS mellanarkiv_handlingar (
  id INTEGER PRIMARY KEY AUTOINCREMENT, paket_id TEXT NOT NULL, patient_id TEXT NOT NULL, enhet_id TEXT NOT NULL, slag TEXT NOT NULL,
  kategori TEXT, typ TEXT NOT NULL, referens TEXT NOT NULL, datum TEXT NOT NULL, rubrik TEXT NOT NULL, forfattare TEXT, text TEXT NOT NULL,
  resurs TEXT NOT NULL, sha256 TEXT NOT NULL, ordination_enhet_id TEXT, sista TEXT, mottagare_enhet_id TEXT, rad TEXT,
  CHECK (slag IN ('anteckning', 'matvarde', 'ordination', 'administrering', 'vardkontakt', 'remiss', 'diagnos'))
);`;
const HANDLINGAR_SKYDD = `
CREATE INDEX IF NOT EXISTS ix_mellanarkiv_handlingar_patient ON mellanarkiv_handlingar (patient_id);
CREATE TRIGGER IF NOT EXISTS mellanarkiv_handlingar_andras_ej BEFORE UPDATE ON mellanarkiv_handlingar
  BEGIN SELECT RAISE(ABORT, 'En handling i mellanarkivet ändras inte.'); END;
CREATE TRIGGER IF NOT EXISTS mellanarkiv_handlingar_raderas_ej BEFORE DELETE ON mellanarkiv_handlingar
  BEGIN SELECT RAISE(ABORT, 'En handling i mellanarkivet raderas inte.'); END;`;
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS mellanarkiv_paket (
  id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, beslut_id INTEGER, kalla TEXT NOT NULL, mottaget TEXT NOT NULL, overfort_av TEXT,
  storlek INTEGER NOT NULL, sha256 TEXT NOT NULL, handlingar INTEGER NOT NULL, data BLOB NOT NULL, kontroll TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_mellanarkiv_paket_patient ON mellanarkiv_paket (patient_id);
${HANDLINGAR_TABELL}
${HANDLINGAR_SKYDD}
CREATE TRIGGER IF NOT EXISTS mellanarkiv_paket_andras_ej BEFORE UPDATE ON mellanarkiv_paket
  BEGIN SELECT RAISE(ABORT, 'Ett paket i mellanarkivet ändras inte.'); END;
CREATE TRIGGER IF NOT EXISTS mellanarkiv_paket_raderas_ej BEFORE DELETE ON mellanarkiv_paket
  BEGIN SELECT RAISE(ABORT, 'Ett paket i mellanarkivet raderas inte.'); END;
`;
// Runda 15, r3: en sandlåda från version 1.4 har tabellen med de två första slagen. Den byggs om med samma rader och id,
// och triggrarna läggs tillbaka. Inget innehåll ändras.
function uppgradera(db) {
  const sql = db.query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'mellanarkiv_handlingar'").get()?.sql;
  if (!sql || (sql.includes("'diagnos'") && / rad TEXT/.test(sql))) return;
  db.transaction(() => {
    db.exec('DROP TRIGGER IF EXISTS mellanarkiv_handlingar_andras_ej; DROP TRIGGER IF EXISTS mellanarkiv_handlingar_raderas_ej;');
    db.exec('ALTER TABLE mellanarkiv_handlingar RENAME TO mellanarkiv_handlingar_v14');
    db.exec(HANDLINGAR_TABELL);
    // Kolumnerna som båda tabellerna har, så att också en tabell med en tidigare version av rundans kolumner följer med.
    const nya = new Set(db.query('PRAGMA table_info(mellanarkiv_handlingar)').all().map(k => k.name));
    const kol = db.query('PRAGMA table_info(mellanarkiv_handlingar_v14)').all().map(k => k.name).filter(k => nya.has(k)).join(', ');
    db.exec(`INSERT INTO mellanarkiv_handlingar (${kol}) SELECT ${kol} FROM mellanarkiv_handlingar_v14`);
    db.exec('DROP TABLE mellanarkiv_handlingar_v14');
    db.exec(HANDLINGAR_SKYDD);
  })();
}
const har = new WeakSet();
export function sakra(db) { if (!har.has(db)) { uppgradera(db); db.exec(SCHEMA); har.add(db); sakraIdGolv(db); } }
export const finnsTabell = (db) => Boolean(db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'mellanarkiv_handlingar'").get());

const sha = (s) => createHash('sha256').update(s).digest('hex');
const enhetsnamn = (db, id) => db.query('SELECT namn FROM enheter WHERE id = ?').get(id)?.namn ?? id;
const enhetKort = (db, id) => ({ id, namn: enhetsnamn(db, id) });
const patientKort = (p) => ({ id: p.id, namn: visningsnamn(p), personnummer: visningsPnr(p), skyddad: Boolean(p.skyddad) });
const finnsT = (db, t) => Boolean(db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t));
const tabellerMedKolumn = (db, kolumn) => db.query("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(t => t.name)
  .filter(t => !t.startsWith('mellanarkiv_') && db.query(`PRAGMA table_info(${t})`).all().some(k => k.name === kolumn));

// ---- Underlaget ------------------------------------------------------------------------------------------------------

// Rader som något annat i journalen pekar på stannar i journalen, så att inget pekar på en handling som inte finns.
// Kolumnerna läses ur databasen, så att en tabell som läggs till senare också räknas.
function pekasPa(db, slag) {
  const kolumn = slag === 'anteckning' ? 'anteckning_id' : 'matvarde_id';
  const ids = new Set();
  for (const t of tabellerMedKolumn(db, kolumn)) for (const r of db.query(`SELECT DISTINCT ${kolumn} AS id FROM ${t} WHERE ${kolumn} IS NOT NULL`).all()) ids.add(Number(r.id));
  if (finnsT(db, 'kontrasigneringar')) for (const r of db.query('SELECT post_id AS id FROM kontrasigneringar WHERE typ = ?').all(slag)) ids.add(Number(r.id));
  // Ett undantag från visning för en enskild anteckning (undantag.js, nyckeln anteckning:<id>), också ett som väntar.
  if (slag === 'anteckning' && finnsT(db, 'konfig_andringar')) {
    for (const r of db.query("SELECT nyckel FROM konfig_andringar WHERE slag = 'undantag' AND nyckel LIKE 'anteckning:%'").all()) ids.add(Number(r.nyckel.split(':')[1]));
  }
  if (slag === 'anteckning' && finnsT(db, 'undantag_begaranden')) {
    for (const r of db.query('SELECT anteckning_id AS id FROM undantag_begaranden').all()) ids.add(Number(r.id));
  }
  return ids;
}

// Handlingarna som regeln tar med, per journal: signerade anteckningar som aldrig har rättats och mätvärden, äldre än
// gränsen, i journaler som inte är gallrade, förstörda eller sammanslagna.
export function kandidater(db, fore) {
  const ut = new Map();
  const lagg = (pid, slag, rad) => {
    if (!ut.has(pid)) ut.set(pid, { anteckningar: [], matvarden: [], ordinationer: [], administreringar: [], vardkontakter: [], remisser: [], diagnoser: [] });
    const l = ut.get(pid)[slag];
    if (l.length < MAX_PER_JOURNAL) l.push(rad);
  };
  const ant = pekasPa(db, 'anteckning');
  const mv = pekasPa(db, 'matvarde');
  const aktiv = "p.journal_forstord IS NULL AND p.sammanslagen_till IS NULL";
  for (const a of db.query(`SELECT a.* FROM anteckningar a JOIN patienter p ON p.id = a.patient_id WHERE ${aktiv} AND a.status = 'signerad' AND a.ersatter_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM anteckningar b WHERE b.ersatter_id = a.id) AND coalesce(a.signerad_tid, a.skapad) < ? ORDER BY a.patient_id, a.id`).all(fore)) {
    if (!ant.has(a.id)) lagg(a.patient_id, 'anteckningar', a);
  }
  // Runda 15, r3: det senaste mätvärdet av varje typ är patientens aktuella värde och stannar i den aktiva journalen, hur
  // gammalt det än är, så att det alltid finns i översikten och i läskopian vid avbrott.
  for (const m of db.query(`SELECT m.* FROM matvarden m JOIN patienter p ON p.id = m.patient_id WHERE ${aktiv} AND m.tid < ?
      AND EXISTS (SELECT 1 FROM matvarden n WHERE n.patient_id = m.patient_id AND n.typ = m.typ AND (n.tid > m.tid OR (n.tid = m.tid AND n.id > m.id)))
      ORDER BY m.patient_id, m.id`).all(fore)) {
    if (!mv.has(m.id)) lagg(m.patient_id, 'matvarden', m);
  }
  // Runda 15, r3: avslutade ordinationer med sina administreringar, och administreringar utan ordination.
  // En ordination räknas med sina administreringar mot taket, så att ett paket inte blir orimligt stort.
  for (const [pid, l] of lakemedelsKandidater(db, fore, aktiv)) {
    let n = 0;
    for (const o of l.ordinationer) { n += 1 + o.administreringar.length; if (n <= MAX_PER_JOURNAL * 4) lagg(pid, 'ordinationer', o); }
    for (const a of l.administreringar) lagg(pid, 'administreringar', a);
  }
  // Beslut 2026-11-14: avslutade vårdkontakter, avslutade remisser och tillfälliga diagnoser.
  strukturKandidater(db, fore, aktiv, ut, lagg);
  return ut;
}

// Säkerhetsgranskningen efter sammanslagningen av runda 15: med INTEGER PRIMARY KEY utan AUTOINCREMENT ger SQLite nästa
// rad det högsta id:t plus ett. Fördes raden med det högsta id:t över fick nästa nya rad samma id som handlingen i
// mellanarkivet, och vyerna alla_* (statistiken, rapporterna och datauttaget) fick två rader med samma id från olika
// patienter. Journalens tabeller har därför AUTOINCREMENT (db.js och lakemedelsprocess.js, och en sandlåda från en äldre
// version byggs om i sakraIdGolv), och räknaren för varje tabell hålls minst lika hög som det högsta id:t i
// mellanarkivet (hojIdGolv), också efter en återföring.
const autoinkrement = (db, tabell) => /AUTOINCREMENT/i.test(db.query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(tabell)?.sql ?? '');
// Säkerhetsgranskningen efter sammanslagningen: en sandlåda från en äldre version har journalens tabeller utan
// AUTOINCREMENT, och där kunde ett id återanvändas när raden med det högsta id:t gallrades eller fördes över. Tabellerna
// byggs om med AUTOINCREMENT, med samma rader, index och triggrar, och räknaren hålls över det högsta id:t i
// mellanarkivet. Det görs innan något förs över eller gallras (sakra och arkiv.js).
const ID_TABELLER = ['anteckningar', 'matvarden', 'ordinationer', 'administreringar', 'vardkontakter', 'remisser', 'diagnoser'];
function medAutoinkrement(db) {
  for (const tabell of ID_TABELLER) {
    const sql = db.query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(tabell)?.sql;
    if (!sql || /AUTOINCREMENT/i.test(sql)) continue;
    const nySql = sql.replace(/\bid\s+INTEGER\s+PRIMARY\s+KEY\b/i, 'id INTEGER PRIMARY KEY AUTOINCREMENT');
    if (nySql === sql) continue;
    const extra = db.query("SELECT sql FROM sqlite_master WHERE tbl_name = ? AND type IN ('index', 'trigger') AND sql IS NOT NULL").all(tabell).map(r => r.sql);
    const fk = db.query('PRAGMA foreign_keys').get()?.foreign_keys;
    db.exec('PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON;');
    try {
      db.transaction(() => {
        db.exec(`ALTER TABLE "${tabell}" RENAME TO "${tabell}_utan_autoinkrement"`);
        db.exec(nySql);
        db.exec(`INSERT INTO "${tabell}" SELECT * FROM "${tabell}_utan_autoinkrement"`);
        db.exec(`DROP TABLE "${tabell}_utan_autoinkrement"`);
        for (const s of extra) db.exec(s);
      })();
    } finally { db.exec(`PRAGMA legacy_alter_table = OFF; PRAGMA foreign_keys = ${fk ? 'ON' : 'OFF'};`); }
  }
}
export function sakraIdGolv(db) { medAutoinkrement(db); hojIdGolv(db); }
export function hojIdGolv(db) {
  if (!finnsT(db, 'sqlite_sequence') || !finnsTabell(db)) return;
  for (const [tabell, slag] of Object.entries(SLAG_TABELL)) {
    if (!finnsT(db, tabell) || !autoinkrement(db, tabell)) continue;
    const m = db.query("SELECT max(CAST(json_extract(rad, '$.id') AS INTEGER)) AS m FROM mellanarkiv_handlingar WHERE slag = ? AND rad IS NOT NULL").get(slag).m;
    if (m == null) continue;
    const s = db.query('SELECT seq FROM sqlite_sequence WHERE name = ?').get(tabell);
    if (!s) db.query('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(tabell, m);
    else if (s.seq < m) db.query('UPDATE sqlite_sequence SET seq = ? WHERE name = ?').run(m, tabell);
  }
}

// ---- Beslut 2026-11-14: vårdkontakter, remisser och diagnoser -----------------------------------------------------
//
// En vårdkontakt förs över när den avslutades före gränsen och inget i den aktiva journalen pekar på den längre: allt som
// dokumenterades under den (anteckningar, mätvärden, ordinationer, doser, diagnoser och remisser) förs över samtidigt,
// och den hör inte till ett vårdtillfälle eller ett hälsoärende och har ingen efterföljande kontakt. Bokningar,
// kallelser, åtgärder, intyg, avgifter, beställningar och allt annat som har en kolumn för vårdkontakten håller den kvar,
// eftersom systemet läser vilka tabeller som har kolumnen. En remiss förs över när svaret kvitterades eller den
// avvisades eller vidarebefordrades före gränsen och inget pekar på den: väntelistan, vårdgarantin, kallelser, bilagor,
// e-remisser och vårdkontakter som skapades ur remissen håller den kvar. En diagnos förs över bara när den är tillfällig
// till sin natur (symtom, skador, akuta infektioner och undersökningar), registrerades före gränsen och hör till en
// vårdkontakt som förs över eller ingen vårdkontakt alls. Kroniska tillstånd stannar alltid, eftersom
// beslutsstöden läser dem. Inget som uppmärksamhetsinformation eller något annat pekar på förs över.
//
// Vårdrelationen påverkas inte: den kommer av pågående kontakter och kontakter som avslutades de senaste 90 dagarna, av
// listningen, av pågående remisser och av remisser vars svar kvitterades de senaste 90 dagarna (atkomst.js,
// harVardrelation), och inget av det förs någonsin över.
// Beslut 2026-11-14: vilka diagnoser som räknas som tillfälliga är vårdgivarens parameter (konfiguration.js,
// arkiv.tillfalliga_diagnoser, med fyra ögon), med en försiktig grundinställning. MOJLIGA_TILLFALLIGA är ramen: bara
// koder i de kapitel som kan vara tillfälliga kan väljas. En diagnos som ett beslutsstöd läser stannar alltid:
// vaccinationsprogrammens riskgrupper (parametern som gäller), uppmärksamhetsinformationens kodverkslista,
// förbrukningsartiklarna, intensivvården och mödrahälsovården.
export const MOJLIGA_TILLFALLIGA = /^(R\d|S\d|T(?!86)\d|Z0\d|Z1[0-3]|Z2\d|Z3[0-9]|J0[0-6]|J09|J1[0-8]|J2[0-2]|A0\d|H6[56]|N30)/;
export const TILLFALLIGA_DIAGNOSER = MOJLIGA_TILLFALLIGA;
const BESLUTSSTOD_MONSTER = [/^E1[0-4]/, /^Z93/, /^(I50|N18\.[45]|I21|J96|K72)/, /^I2[0-5]/, /^(I6\d|G45)/, /^E1[01]/, /^I1[0-5]/];
export function lasesAvBeslutsstod(db, kod, nu = new Date()) {
  const k = String(kod ?? '');
  if (BESLUTSSTOD_MONSTER.some(m => m.test(k))) return true;
  let risk = [];
  try { risk = konfiguration.varde(db, 'vaccination.riskgrupper', nu); } catch { risk = []; }
  if (risk.some(p => k.startsWith(p))) return true;
  return umiForDiagnoser([k]).length > 0;
}
export function tillfalligDiagnos(db, kod, nu = new Date(), lista = null) {
  const k = String(kod ?? '');
  const valda = lista ?? konfiguration.varde(db, 'arkiv.tillfalliga_diagnoser', nu);
  return MOJLIGA_TILLFALLIGA.test(k) && valda.some(p => k.startsWith(p)) && !lasesAvBeslutsstod(db, k, nu);
}
// Förhandsvisningen av parametern: hur många diagnoser från före gränsen som listan räknar som tillfälliga, och hur många
// i listan som stannar för att ett beslutsstöd läser dem.
// Säkerhetsgranskningen efter sammanslagningen av runda 15: förhandsvisningen för systemförvaltaren, som inte läser
// journaler, räknar bara per kapitel i ICD-10-SE (kodens bokstav), så att två listor som skiljer sig med en kod i ett
// kapitel som redan är med ger samma svar och ingen differens kan pröva om en ovanlig diagnos finns.
export function kapitelFor(lista) { return [...new Set(lista.map(p => String(p).trim().charAt(0).toUpperCase()).filter(k => /^[A-Z]$/.test(k)))].sort(); }
export function diagnoserIKapitel(db, kapitel, fore) {
  if (!kapitel.length) return 0;
  return db.query('SELECT kod FROM diagnoser WHERE datum < ?').all(fore).map(r => String(r.kod)).filter(k => MOJLIGA_TILLFALLIGA.test(k) && kapitel.includes(k.charAt(0))).length;
}
export function paverkadeDiagnoser(db, lista, fore) {
  const rader = db.query('SELECT kod FROM diagnoser WHERE datum < ?').all(fore).map(r => String(r.kod));
  const iLista = rader.filter(k => MOJLIGA_TILLFALLIGA.test(k) && lista.some(p => k.startsWith(p)));
  const stod = iLista.filter(k => lasesAvBeslutsstod(db, k));
  return { tillfalliga: iLista.length - stod.length, beslutsstod: stod.length };
}
const radId = (r) => Number(r.id);
// Tabeller med en kolumn som pekar på raden, och rader i dem som inte förs över samtidigt.
function pekarPa(db, kolumn, id, flyttas) {
  for (const t of tabellerMedKolumn(db, kolumn)) {
    const s = flyttas.get(t);
    const rader = db.query(`SELECT * FROM ${t} WHERE ${kolumn} = ?`).all(id);
    if (rader.some(r => !s || !s.has(Number(r.id)))) return true;
  }
  return false;
}
// En uppgift som har raden som källa (uppmärksamhetsinformation och andra med kalla_typ och kalla_id).
function kallaFor(db, slag, id) {
  for (const t of tabellerMedKolumn(db, 'kalla_id')) {
    const kol = db.query(`PRAGMA table_info(${t})`).all().map(k => k.name);
    const typ = kol.includes('kalla_typ') ? 'kalla_typ' : kol.includes('kalla') ? 'kalla' : null;
    if (typ && db.query(`SELECT 1 FROM ${t} WHERE ${typ} = ? AND kalla_id = ? LIMIT 1`).get(slag, id)) return true;
  }
  return false;
}
function strukturKandidater(db, fore, aktiv, ut, lagg) {
  const idn = (slag) => new Set([...ut.values()].flatMap(v => v[slag].map(radId)));
  // Remisserna.
  for (const r of db.query(`SELECT r.* FROM remisser r JOIN patienter p ON p.id = r.patient_id WHERE ${aktiv} AND (
      (r.status = 'svar_kvitterat' AND r.svar_kvitterat_tid < ?) OR (r.status = 'bedomd' AND r.beslut IN ('avvisad', 'vidarebefordrad') AND r.bedomd_tid < ?)) ORDER BY r.patient_id, r.id`).all(fore, fore)) {
    if (pekarPa(db, 'remiss_id', r.id, new Map()) || kallaFor(db, 'remiss', r.id)) continue;
    lagg(r.patient_id, 'remisser', r);
  }
  // Diagnoserna som är tillfälliga och som inget pekar på. Om de förs över avgörs efter vårdkontakterna.
  const diagnoser = db.query(`SELECT d.* FROM diagnoser d JOIN patienter p ON p.id = d.patient_id WHERE ${aktiv} AND d.datum < ? ORDER BY d.patient_id, d.id`).all(fore)
    .filter(d => tillfalligDiagnos(db, d.kod) && !pekarPa(db, 'diagnos_id', d.id, new Map()) && !kallaFor(db, 'diagnos', d.id));
  const flyttas = new Map([['anteckningar', idn('anteckningar')], ['matvarden', idn('matvarden')], ['ordinationer', idn('ordinationer')], ['remisser', idn('remisser')],
    ['administreringar', new Set([...idn('administreringar'), ...[...ut.values()].flatMap(v => v.ordinationer.flatMap(o => o.administreringar.map(radId)))])],
    ['diagnoser', new Set(diagnoser.map(radId))]]);
  const kontakter = new Set();
  for (const v of db.query(`SELECT v.* FROM vardkontakter v JOIN patienter p ON p.id = v.patient_id WHERE ${aktiv} AND v.slut IS NOT NULL AND v.slut < ?
      AND coalesce(v.planerad, 0) = 0 AND v.vardtillfalle_id IS NULL AND v.halsoarende_id IS NULL ORDER BY v.patient_id, v.id`).all(fore)) {
    if (pekarPa(db, 'vardkontakt_id', v.id, flyttas) || pekarPa(db, 'foregaende_id', v.id, new Map()) || kallaFor(db, 'vardkontakt', v.id)) continue;
    const fore2 = ut.get(v.patient_id)?.vardkontakter.length ?? 0;
    lagg(v.patient_id, 'vardkontakter', v);
    if ((ut.get(v.patient_id)?.vardkontakter.length ?? 0) > fore2) kontakter.add(v.id);
  }
  for (const d of diagnoser) if (d.vardkontakt_id == null || kontakter.has(d.vardkontakt_id)) lagg(d.patient_id, 'diagnoser', d);
  // En diagnos som inte fick plats under taket håller sin vårdkontakt kvar.
  for (const [, v] of ut) {
    const kvar = new Set(v.diagnoser.map(radId));
    const saknas = diagnoser.filter(d => kontakter.has(d.vardkontakt_id) && !kvar.has(d.id)).map(d => d.vardkontakt_id);
    if (saknas.length) v.vardkontakter = v.vardkontakter.filter(k => !saknas.includes(k.id));
  }
}
function strukturresurser(db, v) {
  const res = [];
  for (const k of v.vardkontakter ?? []) res.push(medTagg(fhir.encounter(db, k), TAGG_ENHET, k.enhet_id));
  for (const r of v.remisser ?? []) {
    const s = fhir.serviceRequest(db, r, true);
    const slut = r.svar_kvitterat_tid ?? r.bedomd_tid;
    if (slut) s.note = [...(s.note ?? []), { time: slut, text: r.status === 'svar_kvitterat' ? 'Svaret kvitterades.' : `Remissen ${r.beslut === 'avvisad' ? 'avvisades' : 'vidarebefordrades'}.` }];
    res.push(medTagg(medTagg(s, TAGG_ENHET, r.fran_enhet_id), TAGG_MOTTAGARE, r.till_enhet_id));
  }
  for (const d of v.diagnoser ?? []) {
    const c = fhir.condition(db, d);
    c.clinicalStatus = { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'resolved' }] };
    c.note = [{ text: 'En tillfällig diagnos från en avslutad vårdkontakt, förd till mellanarkivet.' }];
    res.push(medTagg(c, TAGG_ENHET, d.enhet_id));
  }
  return res;
}
function taBortStruktur(db, pid, v) {
  const tabeller = ['vardkontakter', 'remisser', 'diagnoser'];
  slappTriggrar(db, tabeller, () => {
    for (const d of v.diagnoser ?? []) db.query('DELETE FROM diagnoser WHERE id = ? AND patient_id = ?').run(d.id, pid);
    for (const r of v.remisser ?? []) db.query('DELETE FROM remisser WHERE id = ? AND patient_id = ?').run(r.id, pid);
    for (const k of v.vardkontakter ?? []) db.query('DELETE FROM vardkontakter WHERE id = ? AND patient_id = ?').run(k.id, pid);
  });
}

// ---- Runda 15, r3 (Sussa 5.4.2.2): avslutade ordinationer och administreringar ---------------------------------------
//
// En ordination förs över när den är avslutad sedan före gränsen: utsatt före gränsen, eller en kur vars slutdatum var
// före gränsen. Den förs över hela, med sin historik, sina meddelanden till Nationella läkemedelslistan och alla sina
// administreringar, så att journalen aldrig har en administrering utan sin ordination eller tvärtom. En pågående eller
// aktuell ordination förs aldrig över, hur gammal den än är. Det som fortfarande gäller stannar också i den aktiva
// journalen: en ordination som uppmärksamhetsinformation pekar på, en som ingår i den senaste vidimeringen av
// läkemedelslistan, en som väntar på svar från Nationella läkemedelslistan, en med en plan för återinsättning eller
// något annat som pekar på den, och en med en dos som är iordningsställd men inte registrerad.

// Tabeller som hör till ordinationen eller administreringen och förs över med den. Uppgifterna i dem står i resursen.
export const MED_ORDINATIONEN = ['ordination_historik', 'nll_meddelanden', 'administreringar'];
export const MED_ADMINISTRERINGEN = ['administrering_identitet', 'administrering_skanning', 'kollegakontroller'];
const radFinns = (db, t, kol, id) => finnsT(db, t) && Boolean(db.query(`SELECT 1 FROM ${t} WHERE ${kol} = ? LIMIT 1`).get(id));

function lakemedelsKandidater(db, fore, aktiv) {
  const ut = new Map();
  const lista = (pid) => { if (!ut.has(pid)) ut.set(pid, { ordinationer: [], administreringar: [] }); return ut.get(pid); };
  const ordTabeller = tabellerMedKolumn(db, 'ordination_id').filter(t => !MED_ORDINATIONEN.includes(t));
  const admTabeller = tabellerMedKolumn(db, 'administrering_id').filter(t => !MED_ADMINISTRERINGEN.includes(t));
  // En administrering kan bara föras över om inget utanför den pekar på den, och en kollegakontroll är gjord.
  const admFri = (a) => a.status !== 'iordningstalld' && a.tid && a.tid < fore
    && !admTabeller.some(t => radFinns(db, t, 'administrering_id', a.id))
    && !(finnsT(db, 'kollegakontroller') && db.query('SELECT 1 FROM kollegakontroller WHERE administrering_id = ? AND kontrollerad_tid IS NULL').get(a.id));
  const uppm = finnsT(db, 'uppmarksamhet') ? new Set(db.query("SELECT kalla_id AS id FROM uppmarksamhet WHERE kalla_typ = 'ordination'").all().map(r => Number(r.id))) : new Set();
  const kontras = finnsT(db, 'kontrasigneringar') ? new Set(db.query("SELECT post_id AS id FROM kontrasigneringar WHERE typ = 'ordination'").all().map(r => Number(r.id))) : new Set();
  const vidimerade = new Set();
  if (finnsT(db, 'vidimeringar')) {
    for (const v of db.query('SELECT v.ordinationer FROM vidimeringar v WHERE NOT EXISTS (SELECT 1 FROM vidimeringar w WHERE w.patient_id = v.patient_id AND (w.tid > v.tid OR (w.tid = v.tid AND w.id > v.id)))').all()) {
      try { for (const x of JSON.parse(v.ordinationer)) vidimerade.add(Number(x.id)); } catch { /* en trasig rad räknas inte */ }
    }
  }
  const ordinationer = db.query(`SELECT o.* FROM ordinationer o JOIN patienter p ON p.id = o.patient_id WHERE ${aktiv}
      AND ((o.status = 'utsatt' AND o.utsatt_tid < ?) OR (o.status = 'aktiv' AND o.slut IS NOT NULL AND o.slut < ?))
      AND o.nll_status = 'kvitterad' ORDER BY o.patient_id, o.id`).all(fore, fore);
  for (const o of ordinationer) {
    if (uppm.has(o.id) || kontras.has(o.id) || vidimerade.has(o.id)) continue;
    if (ordTabeller.some(t => radFinns(db, t, 'ordination_id', o.id))) continue;
    if (db.query("SELECT 1 FROM nll_meddelanden WHERE ordination_id = ? AND status <> 'kvitterad'").get(o.id)) continue;
    const adm = db.query('SELECT * FROM administreringar WHERE ordination_id = ? ORDER BY id').all(o.id);
    if (!adm.every(admFri)) continue;
    lista(o.patient_id).ordinationer.push({ ...o, administreringar: adm });
  }
  for (const a of db.query(`SELECT a.* FROM administreringar a JOIN patienter p ON p.id = a.patient_id WHERE ${aktiv} AND a.ordination_id IS NULL AND a.tid < ? ORDER BY a.patient_id, a.id`).all(fore)) {
    if (admFri(a)) lista(a.patient_id).administreringar.push(a);
  }
  return ut;
}

// Uppgifterna ur tabellerna som följer med ordinationen och administreringen, som noter i resursen, så att inget går
// förlorat när raderna tas bort ur den aktiva journalen. Raderna om vårdhändelsens tid visas utan tid och person, som i
// läkemedelslistan för den som inte får se hela vårdhändelsen.
const namnFor = (db, id) => (id ? db.query('SELECT namn FROM personal WHERE id = ?').get(id)?.namn ?? null : null);
function ordinationsresurs(db, o) {
  const r = fhir.medicationRequest(db, o);
  const noter = db.query('SELECT * FROM ordination_historik WHERE ordination_id = ? ORDER BY tid, id').all(o.id).map(h => {
    const vh = h.handelse === 'vardhandelse_tid' || h.handelse.startsWith('Vårdhändelsen');
    return vh ? { text: 'Händelse: Tiden för läkemedlet ändrades.' }
      : { time: h.tid, ...(namnFor(db, h.personal_id) ? { authorString: namnFor(db, h.personal_id) } : {}), text: `Händelse: ${h.handelse}${h.detalj ? `. ${h.detalj}` : ''}.`.replace(/\.\.$/, '.') };
  });
  // När ordinationen sattes ut, också för en migrerad ordination som saknar händelsen i historiken.
  if (o.status === 'utsatt' && o.utsatt_tid && !db.query("SELECT 1 FROM ordination_historik WHERE ordination_id = ? AND handelse = 'Utsatt'").get(o.id)) {
    noter.push({ time: o.utsatt_tid, ...(namnFor(db, o.utsatt_av) ? { authorString: namnFor(db, o.utsatt_av) } : {}), text: `Händelse: Utsatt${o.utsatt_orsak ? `. ${o.utsatt_orsak}` : ''}.` });
  }
  for (const m of db.query('SELECT * FROM nll_meddelanden WHERE ordination_id = ? ORDER BY id').all(o.id)) {
    noter.push({ time: m.skickad, text: `Nationella läkemedelslistan (simulerad): ${m.typ === 'utsattning' ? 'utsättningen' : 'ordinationen'} skickades, status ${m.status}${m.kvittens ? `, kvittens ${m.kvittens}` : ''}.` });
  }
  if (noter.length) r.note = [...(r.note ?? []), ...noter];
  return medTagg(r, TAGG_ENHET, o.enhet_id);
}
function administreringsresurs(db, a, ordinationEnhet) {
  const r = fhir.medicationAdministration(db, a);
  const noter = [];
  const id = finnsT(db, 'administrering_identitet') ? db.query('SELECT * FROM administrering_identitet WHERE administrering_id = ?').get(a.id) : null;
  if (id) noter.push({ time: id.tid, ...(namnFor(db, id.av) ? { authorString: namnFor(db, id.av) } : {}), text: `Patientens identitet kontrollerades: ${id.satt}${id.text ? `, ${id.text}` : ''}.` });
  const sk = finnsT(db, 'administrering_skanning') ? db.query('SELECT * FROM administrering_skanning WHERE administrering_id = ?').get(a.id) : null;
  if (sk) noter.push({ time: sk.tid, ...(namnFor(db, sk.av) ? { authorString: namnFor(db, sk.av) } : {}), text: 'Läkemedlets etikett och patientens armband skannades.' });
  const kk = finnsT(db, 'kollegakontroller') ? db.query('SELECT * FROM kollegakontroller WHERE administrering_id = ?').get(a.id) : null;
  if (kk) noter.push({ time: kk.kontrollerad_tid, ...(namnFor(db, kk.kontrollerad_av) ? { authorString: namnFor(db, kk.kontrollerad_av) } : {}), text: `Kollegakontroll: ${kk.varfor}` });
  if (noter.length) r.note = [...(r.note ?? []), ...noter];
  const ut = medTagg(r, TAGG_ENHET, a.enhet_id);
  return ordinationEnhet ? medTagg(ut, TAGG_ORDINATIONSENHET, ordinationEnhet) : ut;
}
// En post i e-arkivets index för en administrering, som för de andra journalhandlingarna (earkiv.index). Spärren gäller
// när vårdenheten som gav dosen eller vårdenheten som ordinerade läkemedlet är spärrad, som i läkemedelslistan och FHIR.
export const sparradFor = (db, pid, ...enheter) => { const s = aktivaSparrar(db, pid); return enheter.filter(Boolean).some(e => s.includes(vardenhetFor(db, e))); };
function admIndexPost(db, mall, a, ordinationEnhet = null) {
  const ve = vardenhetFor(db, a.enhet_id);
  return { ...mall, Dokumenttyp: 'Läkemedelsadministrering', Dokumentdatum: String(a.tid).slice(0, 19), Vårdenhet: db.query('SELECT hsa_id FROM enheter WHERE id = ?').get(ve)?.hsa_id ?? ve,
    Spärr: sparradFor(db, a.patient_id, a.enhet_id, ordinationEnhet) ? 'ja' : 'nej',
    UpprättadAv: db.query('SELECT hsa_id FROM personal WHERE id = ?').get(a.utford_av)?.hsa_id ?? null, Version: '1', Referens: `urn:vardkallan:MedicationAdministration/${a.id}` };
}
// Tar bort ordinationerna och administreringarna ur den aktiva journalen, med raderna som hör till dem.
function taBortLakemedel(db, pid, valda) {
  const adm = [...valda.administreringar, ...valda.ordinationer.flatMap(o => o.administreringar)];
  const tabeller = [...MED_ORDINATIONEN, ...MED_ADMINISTRERINGEN, 'ordinationer', 'makuleringar'].filter(t => finnsT(db, t));
  slappTriggrar(db, tabeller, () => {
    for (const a of adm) {
      for (const t of MED_ADMINISTRERINGEN) if (finnsT(db, t)) db.query(`DELETE FROM ${t} WHERE administrering_id = ?`).run(a.id);
      if (finnsT(db, 'makuleringar')) db.query("DELETE FROM makuleringar WHERE typ = 'administrering' AND post_id = ?").run(a.id);
      db.query('DELETE FROM administreringar WHERE id = ? AND patient_id = ?').run(a.id, pid);
    }
    for (const o of valda.ordinationer) {
      db.query('DELETE FROM ordination_historik WHERE ordination_id = ?').run(o.id);
      db.query('DELETE FROM nll_meddelanden WHERE ordination_id = ?').run(o.id);
      db.query('DELETE FROM ordinationer WHERE id = ? AND patient_id = ?').run(o.id, pid);
    }
  });
}
export const antalHandlingar = (v) => v.anteckningar.length + v.matvarden.length + (v.ordinationer?.length ?? 0)
  + (v.administreringar?.length ?? 0) + (v.ordinationer ?? []).reduce((s, o) => s + o.administreringar.length, 0)
  + (v.vardkontakter?.length ?? 0) + (v.remisser?.length ?? 0) + (v.diagnoser?.length ?? 0);

const periodText = (rader) => {
  const d = rader.map(r => String(r).slice(0, 10)).sort();
  return d.length ? (d[0].slice(0, 4) === d.at(-1).slice(0, 4) ? d[0].slice(0, 4) : `${d[0].slice(0, 4)} till ${d.at(-1).slice(0, 4)}`) : null;
};

// Underlaget för ett beslut om överföring, för arkivarien: journalerna med antal handlingar och period, utan innehåll.
export function underlag(db, personal, b) {
  if (logiskTyp(b) !== 'mellanarkiv') throw new Fel(400, 'Beslutet gäller inte mellanarkivet.', 'ogiltig');
  const omf = JSON.parse(b.omfattning);
  const patienter = [];
  for (const [pid, k] of kandidater(db, omf.fore)) {
    const p = db.query('SELECT * FROM patienter WHERE id = ?').get(pid);
    const tider = [...k.anteckningar.map(a => a.signerad_tid ?? a.skapad), ...k.matvarden.map(m => m.tid),
      // Runda 15, r3: ordinationerna och administreringarna.
      ...k.ordinationer.map(o => o.skapad), ...k.administreringar.map(a => a.tid)];
    const adm = k.administreringar.length + k.ordinationer.reduce((s, o) => s + o.administreringar.length, 0);
    patienter.push({ ...patientKort(p), anteckningar: k.anteckningar.length, matvarden: k.matvarden.length, ordinationer: k.ordinationer.length, administreringar: adm,
      vardkontakter: k.vardkontakter.length, remisser: k.remisser.length, diagnoser: k.diagnoser.length, period: periodText(tider) });
  }
  loggaRad(db, { personal_id: personal.id, enhet_id: personal.enhet_id, patient_id: null, handling: 'registrera_arkivbeslut', resurs: `beslut:${b.id}:underlag`,
    grund: 'arkivbeslut', syfte: `Underlag för överföring till mellanarkivet, ${patienter.length} journaler`, resultat: 'tillaten' });
  return { beslut: beslutUt(db, b), patienter, delar: [], mottagare: MOTTAGARE,
    regel: `Signerade anteckningar som inte har rättats, mätvärden som inte är det senaste av sin typ, ordinationer som avslutades med sina administreringar, avslutade vårdkontakter, avslutade remisser och tillfälliga diagnoser, från före ${omf.fore}, som inget annat i journalen pekar på. Pågående och aktuella ordinationer, kroniska diagnoser och det som uppmärksamhetsinformationen, en bokning, en kallelse, väntelistan, en avgift eller ett intyg pekar på stannar i journalen.` };
}

// ---- Paketet ---------------------------------------------------------------------------------------------------------

const medTagg = (r, system, code) => ({ ...r, meta: { ...(r.meta ?? {}), tag: [...(r.meta?.tag ?? []), { system, code }] } });

// En Bundle av typen collection med patienten, handlingarna som förs över och de vårdenheter och den personal som de
// hänvisar till. Kategorin för en anteckning och typen för ett mätvärde följer med som taggar, så att mellanarkivet kan
// pröva inre sekretess och undantag på samma sätt som journalen.
function bundleFor(db, pid, { anteckningar, matvarden, ordinationer = [], administreringar = [], vardkontakter = [], remisser = [], diagnoser = [] }) {
  const p = db.query('SELECT * FROM patienter WHERE id = ?').get(pid);
  const res = [fhir.patient(db, p, true)];
  for (const a of anteckningar) res.push(medTagg(fhir.composition(db, a), TAGG_KATEGORI, a.kategori));
  // Beslut 2026-11-14: vårdenheten som tagg också, eftersom patientens egen mätning har patienten som utförare.
  for (const m of matvarden) res.push(medTagg(medTagg(fhir.observation(db, m), TAGG_MATTYP, m.typ), TAGG_ENHET, m.enhet_id));
  // Runda 15, r3: ordinationerna med sina administreringar, och administreringarna utan ordination.
  for (const o of ordinationer) {
    res.push(ordinationsresurs(db, o));
    for (const a of o.administreringar) res.push(administreringsresurs(db, a, o.enhet_id));
  }
  for (const a of administreringar) res.push(administreringsresurs(db, a, null));
  // Beslut 2026-11-14.
  res.push(...strukturresurser(db, { vardkontakter, remisser, diagnoser }));
  const json = JSON.stringify(res);
  for (const id of new Set([...json.matchAll(/"Organization\/([\w-]+)"/g)].map(x => x[1]))) { const e = db.query('SELECT * FROM enheter WHERE id = ?').get(id); if (e) res.push(fhir.organization(db, e)); }
  for (const id of new Set([...json.matchAll(/"Practitioner\/([\w-]+)"/g)].map(x => x[1]))) { const x = db.query('SELECT * FROM personal WHERE id = ?').get(id); if (x) res.push(fhir.practitioner(db, x)); }
  return { resourceType: 'Bundle', type: 'collection', timestamp: iso(), entry: res.map(r => ({ fullUrl: `urn:vardkallan:${r.resourceType}/${r.id}`, resource: r })) };
}

const beskrivning = (objid, kalla, antal) => `# Paket till mellanarkivet ur Vårdkällan

Paket: ${objid}
Källa: ${kalla}
Antal journalhandlingar: ${antal}

Paketet är skapat i en demo med påhittade patienter och testpersonnummer från Skatteverket. Det följer FGS Paketstruktur 2.0 som exportpaketet till e-arkivet. Journalhandlingarna ligger i representations/rep_1/data/journal/ som HL7 FHIR R4 (Bundle av typen collection), och metadata/descriptive/earkiv-index.xml har en post per handling med samma dataelement som för e-arkivet.

Taggen ${TAGG_KATEGORI} anger anteckningens kategori (journal eller omvårdnad) och taggen ${TAGG_MATTYP} mätvärdets typ, så att mottagaren kan tillämpa inre sekretess och undantag som i journalen. Taggen ${TAGG_ENHET} anger vårdenheten som ordinerade eller gav läkemedlet, och taggen ${TAGG_ORDINATIONSENHET} vårdenheten som ordinerade läkemedlet i en administrering, så att mottagaren kan tillämpa spärrar som i läkemedelslistan. En ordinations historik och dess meddelanden till Nationella läkemedelslistan står som noter i MedicationRequest, och kontrollen av patientens identitet, skanningen och kollegakontrollen vid en administrering som noter i MedicationAdministration.
`;

// Paketet för en journal och de handlingar som förs över, byggt som exporten till e-arkivet.
export function paketFor(db, pid, valda, { version = null, kalla = 'Överföring ur Vårdkällan', scheman = true, tid = undefined } = {}) {
  const refs = new Set([...valda.anteckningar.map(a => `urn:vardkallan:Composition/${a.id}`), ...valda.matvarden.map(m => `urn:vardkallan:Observation/${m.id}`),
    // Runda 15, r3.
    ...(valda.ordinationer ?? []).map(o => `urn:vardkallan:MedicationRequest/${o.id}`),
    // Beslut 2026-11-14.
    ...(valda.vardkontakter ?? []).map(v => `urn:vardkallan:Encounter/${v.id}`), ...(valda.remisser ?? []).map(r => `urn:vardkallan:ServiceRequest/${r.id}`),
    ...(valda.diagnoser ?? []).map(d => `urn:vardkallan:Condition/${d.id}`)]);
  const index = earkiv.index(db, pid).filter(x => refs.has(x.Referens));
  // Runda 15, r3: administreringarna har ingen egen post i e-arkivets index för hela journalen, så de får en här.
  const adm = [...(valda.administreringar ?? []).map(a => [a, null]), ...(valda.ordinationer ?? []).flatMap(o => o.administreringar.map(a => [a, o.enhet_id]))];
  if (adm.length) {
    const mall = earkiv.index(db, pid)[0] ?? null;
    if (mall) for (const [a, oe] of adm) { index.push(admIndexPost(db, mall, a, oe)); refs.add(`urn:vardkallan:MedicationAdministration/${a.id}`); }
  }
  const objid = `IP_${randomUUID()}`;
  // Beslut 2026-11-14: raderna som de var i den aktiva journalen, som statistikunderlag (vy).
  const rader = [...valda.anteckningar.map(r => ['Composition', r]), ...valda.matvarden.map(r => ['Observation', r]),
    ...(valda.ordinationer ?? []).map(({ administreringar: _, ...o }) => ['MedicationRequest', o]), ...adm.map(([a]) => ['MedicationAdministration', a]),
    ...(valda.vardkontakter ?? []).map(r => ['Encounter', r]), ...(valda.remisser ?? []).map(r => ['ServiceRequest', r]), ...(valda.diagnoser ?? []).map(r => ['Condition', r])]
    .map(([t, r]) => ({ referens: `urn:vardkallan:${t}/${r.id}`, rad: r }));
  return byggFgsPaket(db, { objid, version, scheman, ...(tid ? { tid } : {}), filer: [
    { relativ: 'representations/rep_1/data/tabeller/rader.json', data: JSON.stringify(rader), mime: 'application/json', grupp: 'Representations' },
    { relativ: `representations/rep_1/data/journal/${pid}.json`, data: JSON.stringify(bundleFor(db, pid, valda), null, 1), mime: 'application/fhir+json', grupp: 'Representations' },
    { relativ: 'metadata/descriptive/earkiv-index.xml', data: earkiv.indexXml(index), mime: 'text/xml', grupp: 'Descriptive' },
    { relativ: 'documentation/beskrivning.md', data: beskrivning(objid, kalla, refs.size), mime: 'text/markdown', grupp: 'Documentation' },
  ] });
}

// ---- Mottagningen ----------------------------------------------------------------------------------------------------

const avHtml = (div) => String(div ?? '').replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const idUr = (ref, typ) => { const m = String(ref ?? '').match(new RegExp(`^${typ}/([\\w-]+)$`)); return m ? m[1] : null; };
const tagg = (r, system) => (r.meta?.tag ?? []).find(t => t.system === system)?.code ?? null;
function vardeText(o) {
  if (o.component?.length) return `${o.component.map(c => c.valueQuantity?.value).join('/')} ${o.component[0]?.valueQuantity?.unit ?? ''}`.trim();
  if (o.valueQuantity) return `${String(o.valueQuantity.value).replace('.', ',')} ${o.valueQuantity.unit ?? ''}`.trim();
  return o.valueCodeableConcept?.text ?? o.valueString ?? '';
}

// En handling ur paketet, i den form som mellanarkivet sparar och visar. Ger null för resurser som inte är handlingar.
function handlingUr(r) {
  if (r.resourceType === 'Composition') {
    const delar = (r.section ?? []).map(s => ({ sokord: String(s.title ?? ''), text: avHtml(s.text?.div) }));
    return { slag: 'anteckning', kategori: tagg(r, TAGG_KATEGORI) ?? 'journal', typ: String(r.title ?? r.type?.text ?? 'Anteckning'), enhet: idUr(r.custodian?.reference, 'Organization'),
      patient: idUr(r.subject?.reference, 'Patient'), datum: r.date, rubrik: String(r.title ?? r.type?.text ?? 'Anteckning'), forfattare: r.author?.[0]?.display ?? null,
      text: delar.map(d => `${d.sokord}: ${d.text}`).join('\n') };
  }
  if (r.resourceType === 'Observation') {
    return { slag: 'matvarde', kategori: null, typ: tagg(r, TAGG_MATTYP) ?? String(r.code?.text ?? ''), enhet: tagg(r, TAGG_ENHET) ?? idUr(r.performer?.[0]?.reference, 'Organization'),
      patient: idUr(r.subject?.reference, 'Patient'), datum: r.effectiveDateTime, rubrik: String(r.code?.text ?? 'Mätvärde'), forfattare: null, text: vardeText(r) };
  }
  // Beslut 2026-11-14: en vårdkontakt, en remiss och en diagnos.
  if (r.resourceType === 'Encounter') {
    return { slag: 'vardkontakt', kategori: null, typ: String(r.class?.code ?? ''), enhet: tagg(r, TAGG_ENHET) ?? idUr(r.serviceProvider?.reference, 'Organization'),
      patient: idUr(r.subject?.reference, 'Patient'), datum: r.period?.start, sista: r.period?.end ?? null, rubrik: String(r.reasonCode?.[0]?.text ?? 'Vårdkontakt'),
      forfattare: null, text: [r.class?.display, r.location?.[0]?.location?.display].filter(Boolean).join('. ') };
  }
  if (r.resourceType === 'ServiceRequest') {
    const tider = [r.authoredOn, ...(r.note ?? []).map(n => n.time)].filter(t => t && !Number.isNaN(Date.parse(t))).map(String).sort();
    return { slag: 'remiss', kategori: null, typ: String(r.category?.[0]?.coding?.[0]?.code ?? 'remiss'), enhet: tagg(r, TAGG_ENHET), mottagare: tagg(r, TAGG_MOTTAGARE),
      patient: idUr(r.subject?.reference, 'Patient'), datum: r.authoredOn, sista: tider.at(-1) ?? null, rubrik: `Remiss till ${r.performer?.[0]?.display ?? 'en annan vårdenhet'}`,
      forfattare: r.requester?.display ?? null, text: r.reasonCode?.[0]?.text ?? '' };
  }
  if (r.resourceType === 'Condition') {
    const kod = r.code?.coding?.[0]?.code ?? '';
    return { slag: 'diagnos', kategori: null, typ: String(kod), enhet: tagg(r, TAGG_ENHET), patient: idUr(r.subject?.reference, 'Patient'), datum: r.recordedDate,
      rubrik: `${kod} ${r.code?.text ?? ''}`.trim(), forfattare: null, text: r.code?.text ?? '' };
  }
  // Runda 15, r3: en ordination och en administrering.
  if (r.resourceType === 'MedicationRequest') {
    const namn = String(r.medicationCodeableConcept?.text ?? 'Läkemedel');
    const dos = r.dosageInstruction?.map(d => d.text).filter(Boolean).join('. ') ?? '';
    const utsatt = (r.extension ?? []).find(e => e.url?.endsWith('/utsattningsorsak'))?.valueString;
    const tider = [r.authoredOn, r.dispenseRequest?.validityPeriod?.end, ...(r.note ?? []).map(n => n.time)].filter(t => t && !Number.isNaN(Date.parse(t))).map(String).sort();
    return { slag: 'ordination', kategori: null, typ: String(r.medicationCodeableConcept?.coding?.[0]?.code ?? ''), enhet: tagg(r, TAGG_ENHET), ordinationEnhet: null, sista: tider.at(-1) ?? null,
      patient: idUr(r.subject?.reference, 'Patient'), datum: r.authoredOn, rubrik: namn, forfattare: r.requester?.display ?? null,
      text: [dos, r.reasonCode?.[0]?.text ? `Orsak: ${r.reasonCode[0].text}` : '', utsatt ? `Utsatt: ${utsatt}` : ''].filter(Boolean).map(x => x.replace(/\.$/, '')).join('. ') + '.' };
  }
  if (r.resourceType === 'MedicationAdministration') {
    const namn = String(r.medicationCodeableConcept?.text ?? 'Läkemedel');
    const dos = r.dosage?.dose ? `${String(r.dosage.dose.value).replace('.', ',')} ${r.dosage.dose.unit ?? ''}`.trim() : '';
    const status = r.status === 'not-done' ? `Inte given: ${r.statusReason?.[0]?.text ?? ''}` : r.status === 'entered-in-error' ? 'Makulerad registrering' : `Given${dos ? ` ${dos}` : ''}`;
    return { slag: 'administrering', kategori: null, typ: String(r.medicationCodeableConcept?.coding?.[0]?.code ?? ''), enhet: tagg(r, TAGG_ENHET), ordinationEnhet: tagg(r, TAGG_ORDINATIONSENHET),
      patient: idUr(r.subject?.reference, 'Patient'), datum: r.effectiveDateTime, rubrik: namn, forfattare: r.performer?.[0]?.actor?.display ?? null, text: `${status.replace(/\.$/, '')}.`,
      ordination: r.request?.reference ? `urn:vardkallan:${r.request.reference}` : null };
  }
  return null;
}

// Mellanarkivet tar emot ett paket: samma mottagningskontroll som e-arkivet, och därefter läses handlingarna ur paketet.
// Ett paket med fel tas inte emot, och inget sparas. Ger paketets id och antalet handlingar.
export function taEmot(db, paket, { kalla, beslutId = null, av = null, tid = iso(), forvantadPatient = null } = {}) {
  sakra(db);
  const kontroll = earkiv.mottagningskontroll(paket);
  const fel = [...kontroll.fel];
  const filer = fel.length ? new Map() : packaUpp(paket);
  const rot = [...filer.keys()].find(n => /^IP_[^/]+\/$/.test(n)) ?? '';
  const handlingar = [];
  let patient = null;
  // Beslut 2026-11-14: statistikunderlaget, raderna som de var i den aktiva journalen, per referens.
  const raderna = new Map();
  const underlag = filer.get(`${rot}representations/rep_1/data/tabeller/rader.json`);
  if (underlag) { try { for (const x of JSON.parse(underlag.data.toString('utf8'))) if (x?.referens && x.rad) raderna.set(x.referens, JSON.stringify(x.rad)); } catch { fel.push('Statistikunderlaget i paketet går inte att läsa.'); } }
  for (const [namn, f] of filer) {
    if (!namn.startsWith(`${rot}representations/rep_1/data/journal/`) || !namn.endsWith('.json')) continue;
    let b;
    try { b = JSON.parse(f.data.toString('utf8')); } catch { fel.push('En fil med journalhandlingar går inte att läsa.'); continue; }
    if (b?.resourceType !== 'Bundle') continue;
    for (const e of b.entry ?? []) {
      const r = e.resource;
      if (r?.resourceType === 'Patient') { patient = patient ?? r.id; if (patient !== r.id) fel.push('Paketet har handlingar för flera patienter.'); continue; }
      const h = r && handlingUr(r);
      if (h) handlingar.push({ ...h, referens: e.fullUrl, resurs: JSON.stringify(r) });
    }
  }
  const pid = patient ? identitet.gallandeId(db, patient) : null;
  if (!fel.length) {
    if (!pid || !db.query('SELECT 1 FROM patienter WHERE id = ?').get(pid)) fel.push('Patienten i paketet finns inte i journalen.');
    else if (forvantadPatient && pid !== forvantadPatient) fel.push('Paketet gäller en annan patient.');
    if (!handlingar.length) fel.push('Paketet har inga journalhandlingar.');
    for (const h of handlingar) {
      if (h.patient !== patient) { fel.push('En handling i paketet gäller en annan patient.'); break; }
      if (!h.enhet || !db.query('SELECT 1 FROM enheter WHERE id = ?').get(h.enhet)) { fel.push('En handling i paketet saknar en känd vårdenhet.'); break; }
      if (h.slag === 'remiss' && !h.mottagare) { fel.push('En remiss i paketet saknar vårdenheten den gick till.'); break; }
      if (!h.datum || Number.isNaN(Date.parse(h.datum))) { fel.push('En handling i paketet saknar datum.'); break; }
      // Runda 15, r3: en administrering av en ordination har ordinationen i samma paket.
      if (h.slag === 'administrering' && h.ordination && !handlingar.some(x => x.referens === h.ordination)) { fel.push('En administrering i paketet saknar sin ordination.'); break; }
      if (h.slag === 'administrering' && h.ordination && !h.ordinationEnhet) { fel.push('En administrering i paketet saknar ordinationens vårdenhet.'); break; }
    }
  }
  if (fel.length) throw new Fel(422, `${MOTTAGARE} tog inte emot paketet: ${fel.slice(0, 5).join(' ')}`, 'ogiltig', { fel });
  const objid = rot.slice(0, -1);
  const kv = { fel: [], filer: kontroll.filer, handlingar: handlingar.length };
  db.query('INSERT INTO mellanarkiv_paket (id, patient_id, beslut_id, kalla, mottaget, overfort_av, storlek, sha256, handlingar, data, kontroll) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(objid, pid, beslutId, kalla, tid, av, paket.length, sha(paket).toUpperCase(), handlingar.length, paket, JSON.stringify(kv));
  // Runda 15, r3: ordination_enhet_id för en administrering.
  const ins = db.query('INSERT INTO mellanarkiv_handlingar (paket_id, patient_id, enhet_id, slag, kategori, typ, referens, datum, rubrik, forfattare, text, resurs, sha256, ordination_enhet_id, sista, mottagare_enhet_id, rad) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const h of handlingar) ins.run(objid, pid, h.enhet, h.slag, h.kategori, h.typ, h.referens, h.datum, h.rubrik, h.forfattare, h.text, h.resurs, sha(h.resurs), h.ordinationEnhet ?? null, h.sista ?? h.datum, h.mottagare ?? null, raderna.get(h.referens) ?? null);
  return { paket: objid, patient: pid, handlingar: handlingar.length, kontroll: kv };
}

// ---- Överföringen ----------------------------------------------------------------------------------------------------

// Verkställer ett beslut om överföring: ett paket per journal till mellanarkivet, och när mellanarkivet har tagit emot
// det tas handlingarna bort ur den aktiva journalen. Allt i en transaktion. Beslutet verkställs en gång.
export function overfor(db, personal, b, { version = null } = {}) {
  sakra(db);
  if (logiskTyp(b) !== 'mellanarkiv') throw new Fel(400, 'Beslutet gäller inte mellanarkivet.', 'ogiltig');
  if (b.verkstallt) throw new Fel(409, 'Beslutet är redan verkställt.', 'ogiltig');
  const omf = JSON.parse(b.omfattning);
  const tid = iso();
  const resultat = { patienter: 0, anteckningar: 0, matvarden: 0, ordinationer: 0, administreringar: 0, vardkontakter: 0, remisser: 0, diagnoser: 0, paket: [] };
  db.transaction(() => {
    for (const [pid, valda] of kandidater(db, omf.fore)) {
      const { paket } = paketFor(db, pid, valda, { version, kalla: `Beslut ${b.diarienummer}` });
      const mot = taEmot(db, paket, { kalla: `Beslut ${b.diarienummer}`, beslutId: b.id, av: personal.id, tid, forvantadPatient: pid });
      slappTriggrar(db, ['anteckningar', 'matvarden'], () => {
        for (const a of valda.anteckningar) db.query('DELETE FROM anteckningar WHERE id = ? AND patient_id = ?').run(a.id, pid);
        for (const m of valda.matvarden) db.query('DELETE FROM matvarden WHERE id = ? AND patient_id = ?').run(m.id, pid);
      });
      // Runda 15, r3: ordinationerna och administreringarna, med raderna som hör till dem.
      taBortLakemedel(db, pid, valda);
      // Beslut 2026-11-14: diagnoserna, remisserna och sist vårdkontakterna.
      taBortStruktur(db, pid, valda);
      const adm = valda.administreringar.length + valda.ordinationer.reduce((s, o) => s + o.administreringar.length, 0);
      resultat.patienter++;
      resultat.anteckningar += valda.anteckningar.length;
      resultat.matvarden += valda.matvarden.length;
      resultat.ordinationer += valda.ordinationer.length;
      resultat.administreringar += adm;
      resultat.vardkontakter += valda.vardkontakter.length;
      resultat.remisser += valda.remisser.length;
      resultat.diagnoser += valda.diagnoser.length;
      resultat.paket.push(mot.paket);
      const lm = [valda.ordinationer.length || adm ? `${valda.ordinationer.length} ordinationer och ${adm} administreringar` : '',
        valda.vardkontakter.length ? `${valda.vardkontakter.length} vårdkontakter` : '', valda.remisser.length ? `${valda.remisser.length} remisser` : '',
        valda.diagnoser.length ? `${valda.diagnoser.length} diagnoser` : ''].filter(Boolean).map(x => `, ${x}`).join('');
      loggaRad(db, { personal_id: personal.id, enhet_id: personal.enhet_id, patient_id: pid, handling: 'arkivera', resurs: `beslut:${b.id}:mellanarkiv:${mot.paket}`, grund: 'arkivbeslut',
        syfte: `Överföring till mellanarkivet enligt ${b.diarienummer}: ${valda.anteckningar.length} anteckningar och ${valda.matvarden.length} mätvärden${lm}. Uppgifterna finns kvar i journalen.`, resultat: 'tillaten' });
    }
    db.query('UPDATE arkivbeslut SET verkstallt = ?, verkstallt_av = ?, resultat = ? WHERE id = ?').run(tid, personal.id, JSON.stringify(resultat), b.id);
    hojIdGolv(db);
  })();
  return beslutUt(db, hamtaBeslut(db, b.id));
}

// ---- Åtkomsten -------------------------------------------------------------------------------------------------------

// Runda 15, r3: en ordination och en administrering läses med läkemedelslistans handling.
const LAKEMEDEL = new Set(['ordination', 'administrering']);
// Beslut 2026-11-14: en vårdkontakt läses med vårdkontakternas handling, en diagnos med diagnosernas och en remiss med
// remissernas, där den som bara får läsa remissens status ser statusen och inget av innehållet (remiss.js, forPatient).
const HANDLING = { matvarde: 'las_matvarden', ordination: 'las_lakemedel', administrering: 'las_lakemedel', vardkontakt: 'las_admin', diagnos: 'las_diagnoser' };
const remissHandling = (personal) => (personal && kanRoll(personal, 'las_remiss') ? 'las_remiss' : 'las_remiss_status');
export const handlingFor = (r, personal = null) => (r.slag === 'anteckning' ? lasHandling(r) : r.slag === 'remiss' ? remissHandling(personal) : HANDLING[r.slag]);
const LASHANDLINGAR = ['las_journal', 'las_omvardnad', 'las_matvarden', 'las_lakemedel', 'las_diagnoser', 'las_admin', 'las_remiss', 'las_remiss_status'];
export const kanLasaNagot = (personal) => LASHANDLINGAR.some(h => kanRoll(personal, h));
export const listHandling = (personal) => LASHANDLINGAR.find(h => kanRoll(personal, h)) ?? 'las_journal';
const klinisk = (atk) => kanRoll(atk.personal, 'las_remiss');
const egenRemiss = (atk, r) => { const min = vardenhetFor(atk.db, atk.personal.enhet_id); return r.enhet_id === min || r.mottagare_enhet_id === min; };

// Handlingarna som anroparen får se, med samma prövning som journalens egna anteckningar och mätvärden.
// Runda 15, r3: ordinationer och administreringar prövas som i läkemedelslistan, som är gemensam för vårdgivaren och
// bara döljer det som ligger på en spärrad vårdenhet. En administrering prövas också mot vårdenheten som ordinerade
// läkemedlet, så att en dos av en spärrad vårdenhets ordination inte syns. Undantag från visning gäller anteckningar och
// mätvärden, som i journalen. slag begränsar till vissa slag.
export function synliga(atk, { slag = null, visning = true } = {}) {
  if (!finnsTabell(atk.db) || !kanLasaNagot(atk.personal)) return [];
  sakra(atk.db);
  const rader = atk.db.query('SELECT * FROM mellanarkiv_handlingar WHERE patient_id = ? ORDER BY datum DESC, id DESC').all(atk.patientId)
    .filter(r => !slag || slag.includes(r.slag));
  const tillatna = atk.filtrera(rader.filter(r => !LAKEMEDEL.has(r.slag) && r.slag !== 'remiss'), handlingFor);
  // Beslut 2026-11-14: en remiss från eller till den egna vårdenheten syns, andra prövas på vårdenheten som skickade
  // den, som i remisslistan.
  const rem = rader.filter(r => r.slag === 'remiss');
  const remisser = kanRoll(atk.personal, 'las_remiss') || kanRoll(atk.personal, 'las_remiss_status')
    ? [...rem.filter(r => egenRemiss(atk, r)), ...atk.filtrera(rem.filter(r => !egenRemiss(atk, r)), remissHandling(atk.personal))] : [];
  const lm = atk.filtrera(rader.filter(r => LAKEMEDEL.has(r.slag)), 'las_lakemedel', { gemensam: true });
  const viaOrdination = new Set(atk.filtrera(lm.filter(r => r.ordination_enhet_id).map(r => ({ ...r, enhet_id: r.ordination_enhet_id, ursprung: r })), 'las_lakemedel', { gemensam: true }).map(x => x.ursprung));
  // visning: false för FHIR-API:t, som prövar undantagen från FHIR i stället, som för den aktiva journalen.
  const v = (rader, sort) => (visning ? visas(atk, rader, sort) : rader);
  return [...v(tillatna.filter(r => r.slag === 'anteckning'), 'anteckning'), ...v(tillatna.filter(r => r.slag === 'matvarde'), 'matvarde'),
    ...lm.filter(r => !r.ordination_enhet_id || viaOrdination.has(r)), ...tillatna.filter(r => ['vardkontakt', 'diagnos'].includes(r.slag)), ...remisser]
    .sort((a, b) => String(b.datum).localeCompare(String(a.datum)) || b.id - a.id);
}
// Undantagen från visning prövas på vårdenhet och typ. Ett undantag för en enskild anteckning gäller en anteckning i den
// aktiva journalen, och en sådan förs aldrig över (pekasPa), så handlingens eget id får inte jämföras med anteckningarnas.
function visas(atk, rader, sort) {
  if (!['anteckning', 'matvarde'].includes(sort)) return rader;
  const kvar = new Set(filtreraVisning(atk, rader.map(r => ({ ...r, id: null, ursprung: r })), sort).map(x => x.ursprung));
  return rader.filter(r => kvar.has(r));
}

// Beslut 2026-11-14: den som bara får läsa en remiss status ser inget av dess innehåll.
const remissStatus = (r) => { const res = JSON.parse(r.resurs); return res.status === 'completed' ? 'Svaret är kvitterat.' : res.status === 'revoked' ? 'Avvisad.' : 'Avslutad.'; };
export const textFor = (atk, r) => (r.slag === 'remiss' && !(atk && klinisk(atk)) ? remissStatus(r) : r.text);
const kort = (db, r, atk = null) => ({
  id: r.id, slag: r.slag, typ: r.rubrik, datum: r.datum, enhet: enhetKort(db, r.enhet_id), kategori: r.kategori, forfattare: r.forfattare && r.slag !== 'remiss' ? { namn: r.forfattare } : (r.forfattare && atk && klinisk(atk) ? { namn: r.forfattare } : null),
  sammanfattning: r.slag === 'matvarde' ? r.text : textFor(atk, r).replace(/\s+/g, ' ').slice(0, 200), kalla: 'mellanarkiv', kallaEtikett: ETIKETT,
  ...(r.slag === 'remiss' ? { till: enhetKort(db, r.mottagare_enhet_id) } : {}),
});

// GET /api/patient/:id/mellanarkiv: handlingarna som anroparen får se, och perioden de gäller.
export function lista(atk) {
  sakra(atk.db);
  if (!kanLasaNagot(atk.personal)) atk.krav('las_journal');
  atk.krav(listHandling(atk.personal));
  const rader = synliga(atk);
  if (rader.length) atk.logga(listHandling(atk.personal), atk.grund(), 'mellanarkiv');
  return { handlingar: rader.map(r => kort(atk.db, r, atk)), period: periodText(rader.map(r => r.datum)), etikett: ETIKETT,
    dolda: { kraverVal: atk.doldaVal, sparrade: atk.doldaSparr, undantagna: undantagnaUt(atk) } };
}

export function handlingRad(db, id) {
  sakra(db);
  const r = /^\d{1,9}$/.test(String(id)) ? db.query('SELECT * FROM mellanarkiv_handlingar WHERE id = ?').get(Number(id)) : null;
  if (!r) throw new Fel(404, 'Uppgiften finns inte.', 'saknas');
  return r;
}

// Prövningen av en enskild handling, samma som för raden i listan (synliga). Kastar Fel och loggar ett nekat försök.
// Runda 15, r3: en ordination och en administrering prövas som i läkemedelslistan. Beslut 2026-11-14: en remiss som
// i remisslistan.
function provaRad(atk, r, beskrivning) {
  const h = handlingFor(r, atk.personal);
  if (LAKEMEDEL.has(r.slag)) {
    atk.krav(h, { resurs: { enhet_id: r.enhet_id, gemensam: true }, beskrivning });
    if (r.ordination_enhet_id) atk.krav(h, { resurs: { enhet_id: r.ordination_enhet_id, gemensam: true }, beskrivning });
  } else if (r.slag === 'remiss') {
    atk.krav(h, { beskrivning });
    if (!egenRemiss(atk, r)) atk.krav(h, { resurs: { enhet_id: r.enhet_id }, beskrivning });
  } else atk.krav(h, { resurs: { enhet_id: r.enhet_id }, beskrivning });
}

// GET /api/mellanarkiv/:id: en handling, med samma prövning som raden i listan. Loggas. Kontrollsumman visar att
// handlingen är oförändrad sedan mellanarkivet tog emot den.
export function las(atk, r) {
  if (r.patient_id !== atk.patientId) throw new Fel(404, 'Uppgiften finns inte.', 'saknas');
  provaRad(atk, r, `mellanarkiv:${r.id}`);
  if (!visas(atk, [r], r.slag).length) throw new Fel(404, 'Uppgiften finns inte.', 'saknas');
  atk.logga(handlingFor(r, atk.personal), atk.grund(), `mellanarkiv:${r.id}`);
  const p = atk.db.query('SELECT id, mottaget, kalla, sha256 FROM mellanarkiv_paket WHERE id = ?').get(r.paket_id);
  const resurs = JSON.parse(r.resurs);
  return {
    ...kort(atk.db, r, atk),
    sokord: r.slag === 'anteckning' ? (resurs.section ?? []).map(s => ({ sokord: String(s.title ?? ''), text: avHtml(s.text?.div) }))
      // Runda 15, r3: ordinationen och administreringen visas med samma rubriker som i läkemedelslistan.
      : r.slag === 'ordination' ? ordinationSokord(atk, r, resurs) : r.slag === 'administrering' ? administreringSokord(resurs)
        // Beslut 2026-11-14.
        : r.slag === 'vardkontakt' ? vardkontaktSokord(resurs) : r.slag === 'remiss' ? remissSokord(atk, r, resurs) : r.slag === 'diagnos' ? diagnosSokord(resurs) : [],
    varde: r.slag === 'matvarde' ? r.text : null,
    mellanarkiv: { mottagare: MOTTAGARE, paket: p?.id ?? null, mottaget: p?.mottaget ?? null, kalla: p?.kalla ?? null, oforandrad: sha(r.resurs) === r.sha256 },
  };
}

// Händelserna i översiktens tidslinje, ur det som anroparen får se.
// Runda 15, r3: en ordination står i tidslinjen som i den aktiva journalen. Administreringarna står inte där, som i den
// aktiva journalen, men de finns i ordinationen när den öppnas.
// Beslut 2026-11-14: vårdkontakter och remisser står i tidslinjen som i den aktiva journalen, diagnoserna inte.
const RUBRIK = { anteckning: (r) => r.rubrik, matvarde: (r) => `Mätvärde: ${r.rubrik}`, ordination: (r) => `Ordinerat: ${r.rubrik}`, vardkontakt: (r) => r.rubrik, remiss: (r) => r.rubrik };
export function tidslinje(atk) {
  return synliga(atk, { slag: Object.keys(RUBRIK) }).map(r => ({
    tid: r.datum, typ: 'mellanarkiv', rubrik: RUBRIK[r.slag](r), text: r.slag === 'matvarde' ? r.text : textFor(atk, r).replace(/\s+/g, ' ').slice(0, 160),
    enhet: enhetKort(atk.db, r.enhet_id), kalla: 'mellanarkiv', kallaEtikett: ETIKETT, ref: { typ: 'mellanarkiv', id: r.id },
  }));
}

// Beslut 2026-11-14: diagnoserna i översikten och remisserna i remisslistan, med samma prövning som i synliga.
export function diagnoser(atk) {
  return synliga(atk, { slag: ['diagnos'] }).map(r => {
    const res = JSON.parse(r.resurs);
    return { id: `ma-${r.id}`, kod: r.typ, text: res.code?.text ?? '', typ: /^Huvud/.test(res.category?.[0]?.text ?? '') ? 'huvud' : 'bi', datum: r.datum,
      vardenhet: enhetKort(atk.db, r.enhet_id), kalla: 'mellanarkiv', kallaEtikett: ETIKETT, mellanarkiv: true, ref: { typ: 'mellanarkiv', id: r.id } };
  });
}
export function remisser(atk) {
  const ur = synliga(atk, { slag: ['remiss'] });
  if (ur.length) atk.logga(remissHandling(atk.personal), atk.grund(), 'mellanarkiv');
  return ur.map(r => ({ id: r.id, rubrik: r.rubrik, datum: r.datum, fran: enhetKort(atk.db, r.enhet_id), till: enhetKort(atk.db, r.mottagare_enhet_id),
    sammanfattning: textFor(atk, r).replace(/\s+/g, ' ').slice(0, 200), status: remissStatus(r), kalla: 'mellanarkiv', kallaEtikett: ETIKETT }));
}

// Runda 15, r3: läkemedelslistans del ur mellanarkivet (lakemedel.lista), som utsatta och avslutade ordinationer.
export function lakemedel(atk) {
  return synliga(atk, { slag: ['ordination'] }).map(r => {
    const res = JSON.parse(r.resurs);
    const utsatt = (res.extension ?? []).find(e => e.url?.endsWith('/utsattningsorsak'))?.valueString ?? null;
    const period = res.dispenseRequest?.validityPeriod ?? {};
    return { id: r.id, mellanarkiv: true, lakemedel: { namn: r.rubrik, atc: r.typ }, dosering: res.dosageInstruction?.map(d => d.text).filter(Boolean).join('. ') ?? '',
      ordinationsorsak: res.reasonCode?.[0]?.text ?? null, start: period.start ?? null, slut: period.end ?? null, status: res.status === 'stopped' ? 'utsatt' : 'avslutad',
      utsatt: utsatt ? { orsak: utsatt } : null, ordineradAv: r.forfattare ? { namn: r.forfattare } : null, vardenhet: enhetKort(atk.db, r.enhet_id), skapad: r.datum,
      kalla: 'mellanarkiv', kallaEtikett: ETIKETT };
  });
}

function ordinationSokord(atk, r, res) {
  const period = res.dispenseRequest?.validityPeriod ?? {};
  const utsatt = (res.extension ?? []).find(e => e.url?.endsWith('/utsattningsorsak'))?.valueString;
  const historik = (res.note ?? []).filter(n => /^Händelse: |^Nationella läkemedelslistan/.test(n.text ?? '')).map(n => `${n.time ? `${String(n.time).slice(0, 16).replace('T', ' ')} ` : ''}${n.text}${n.authorString ? ` (${n.authorString})` : ''}`);
  // Administreringarna av ordinationen som anroparen får se, de senaste först.
  // En ordination förs alltid över i samma paket som sina administreringar.
  const ref = r.referens.replace('urn:vardkallan:', '');
  const adm = synliga(atk, { slag: ['administrering'] }).filter(a => a.paket_id === r.paket_id && JSON.parse(a.resurs).request?.reference === ref);
  const doser = adm.slice(0, 50).map(a => `${String(a.datum).slice(0, 16).replace('T', ' ')} ${a.text}${a.forfattare ? ` (${a.forfattare})` : ''}`);
  return [
    { sokord: 'Läkemedel', text: r.rubrik },
    { sokord: 'Dosering', text: res.dosageInstruction?.map(d => d.text).filter(Boolean).join('. ') ?? '' },
    { sokord: 'Ordinationsorsak', text: res.reasonCode?.[0]?.text ?? '' },
    { sokord: 'Period', text: `${period.start ?? ''}${period.end ? ` till ${period.end}` : ''}` },
    ...(utsatt ? [{ sokord: 'Utsatt', text: utsatt }] : []),
    ...(historik.length ? [{ sokord: 'Historik', text: historik.join('\n') }] : []),
    { sokord: 'Administreringar', text: adm.length ? `${doser.join('\n')}${adm.length > 50 ? `\noch ${adm.length - 50} till` : ''}` : 'Inga registrerade doser.' },
  ].filter(x => x.text);
}
function vardkontaktSokord(res) {
  return [
    { sokord: 'Kontaktorsak', text: res.reasonCode?.[0]?.text ?? '' },
    { sokord: 'Slag', text: [res.class?.display, res.type?.[0]?.text].filter(Boolean).join(', ') },
    { sokord: 'Period', text: `${String(res.period?.start ?? '').slice(0, 16).replace('T', ' ')}${res.period?.end ? ` till ${String(res.period.end).slice(0, 16).replace('T', ' ')}` : ''}` },
    { sokord: 'Plats', text: res.location?.[0]?.location?.display ?? '' },
  ].filter(x => x.text);
}
function remissSokord(atk, r, res) {
  const status = { sokord: 'Status', text: remissStatus(r) };
  if (!klinisk(atk)) return [{ sokord: 'Till', text: enhetsnamn(atk.db, r.mottagare_enhet_id) }, status];
  return [
    { sokord: 'Till', text: enhetsnamn(atk.db, r.mottagare_enhet_id) },
    { sokord: 'Frågeställning', text: res.reasonCode?.[0]?.text ?? '' },
    ...(res.note ?? []).map(n => ({ sokord: /^Svar: /.test(n.text) ? 'Svar' : /^Motivering: /.test(n.text) ? 'Motivering' : n.time ? 'Avslutad' : 'Anamnes', text: String(n.text ?? '').replace(/^(Svar|Motivering): /, '') })),
    status,
  ].filter(x => x.text);
}
function diagnosSokord(res) {
  return [
    { sokord: 'Diagnos', text: `${res.code?.coding?.[0]?.code ?? ''} ${res.code?.text ?? ''}`.trim() },
    { sokord: 'Slag', text: res.category?.[0]?.text ?? '' },
  ].filter(x => x.text);
}
function administreringSokord(res) {
  return [
    { sokord: 'Läkemedel', text: String(res.medicationCodeableConcept?.text ?? '') },
    { sokord: 'Dos', text: res.status === 'not-done' ? `Inte given: ${res.statusReason?.[0]?.text ?? ''}` : res.dosage?.dose ? `${String(res.dosage.dose.value).replace('.', ',')} ${res.dosage.dose.unit ?? ''}`.trim() : '' },
    { sokord: 'Anteckningar', text: (res.note ?? []).map(n => n.text).join('\n') },
  ].filter(x => x.text);
}

// Träffarna i journalens sökfält (journalsok.js), med samma prövning som listan.
// Runda 15, r3: ordinationerna är sökbara som i den aktiva journalen, administreringarna inte.
export function sokTraffar(atk, ord, markera) {
  const ut = [];
  // Beslut 2026-11-14: också vårdkontakterna, diagnoserna och remisserna, en remiss bara med det som anroparen får läsa.
  for (const r of synliga(atk, { slag: ['anteckning', 'matvarde', 'ordination', 'vardkontakt', 'diagnos', 'remiss'] })) {
    const text = `${r.rubrik} ${textFor(atk, r)}`.replace(/\s+/g, ' ');
    const lag = text.toLocaleLowerCase('sv-SE');
    const i = ord.map(o => lag.indexOf(o)).filter(x => x >= 0).sort((a, b) => a - b)[0];
    if (i == null) continue;
    const utdrag = text.slice(Math.max(0, i - 60), i + 120);
    ut.push({ typ: 'mellanarkiv', tid: r.datum, rubrik: r.rubrik, delar: markera(utdrag, ord) ?? [{ text: utdrag, markerad: false }], vardenhet: enhetKort(atk.db, r.enhet_id),
      kalla: 'mellanarkiv', kallaEtikett: ETIKETT, ref: { flik: 'journal', sub: `ma-${r.id}` } });
  }
  return ut;
}

// ---- Runda 15, r3 (Sussa 5.4.2.2): FHIR-API:t -----------------------------------------------------------------------
//
// Handlingarna i mellanarkivet lämnas ut genom FHIR-API:t som resursen de fördes över som, med samma behörighet,
// filtrering och loggning som resurserna i den aktiva journalen (fhir.js): sökningen på patient tar med dem, och de läses
// på id:t ma-<nummer>, som aldrig krockar med ett id i den aktiva journalen. meta.tag har koden mellanarkiv i
// Vårdkällans kodsystem lagring och meta.source pekar på paketet, så att mottagaren ser att uppgiften kommer ur
// mellanarkivet. FHIR R4 har inget eget element för var en uppgift lagras, och HL7 Swedens basprofiler säger inget om
// det, så taggen följer samma mönster som källan (kalla). Taggarna som bara behövs i paketet tas bort, och referenserna
// till patienten och till ordinationen pekar på den gällande journalen och på ordinationen i mellanarkivet.
export const FHIR_SLAG = { Composition: 'anteckning', Observation: 'matvarde', MedicationRequest: 'ordination', MedicationAdministration: 'administrering',
  // Beslut 2026-11-14.
  Encounter: 'vardkontakt', ServiceRequest: 'remiss', Condition: 'diagnos' };
const PAKETTAGGAR = new Set([TAGG_KATEGORI, TAGG_MATTYP, TAGG_ENHET, TAGG_ORDINATIONSENHET, TAGG_MOTTAGARE]);
// En referens till en vårdkontakt, ordination, remiss eller diagnos som har förts över pekar på den i mellanarkivet:
// samma paket först, annars den i den aktiva journalen om den finns där, annars den senaste i mellanarkivet.
const REFERERBARA = /^(Encounter|MedicationRequest|ServiceRequest|Condition)\/(\d{1,9})$/;
const AKTIV_TABELL = { Encounter: 'vardkontakter', MedicationRequest: 'ordinationer', ServiceRequest: 'remisser', Condition: 'diagnoser' };
function skrivOmReferenser(db, r, v) {
  if (Array.isArray(v)) { for (const x of v) skrivOmReferenser(db, r, x); return; }
  if (!v || typeof v !== 'object') return;
  const m = typeof v.reference === 'string' ? REFERERBARA.exec(v.reference) : null;
  if (m) {
    const ref = `urn:vardkallan:${m[1]}/${m[2]}`;
    const samma = db.query('SELECT id FROM mellanarkiv_handlingar WHERE paket_id = ? AND referens = ?').get(r.paket_id, ref);
    const aktiv = !samma && db.query(`SELECT 1 FROM ${AKTIV_TABELL[m[1]]} WHERE id = ? AND patient_id = ?`).get(Number(m[2]), r.patient_id);
    const annan = !samma && !aktiv && db.query('SELECT id FROM mellanarkiv_handlingar WHERE patient_id = ? AND referens = ? ORDER BY id DESC').get(r.patient_id, ref);
    const ny = samma ?? annan;
    if (ny) v.reference = `${m[1]}/ma-${ny.id}`;
  }
  for (const [k, x] of Object.entries(v)) if (k !== 'meta' && x && typeof x === 'object') skrivOmReferenser(db, r, x);
}
const undantagenFhir = (db, typ, nationell) => { const p = undantag.fhirProvare(db, typ, { nationell }); return (r) => Boolean(p({ enhet_id: r.enhet_id, typ: r.typ, id: null })); };

// paketTaggar: true i exporten till e-arkivet, så att mottagaren har vårdenheterna och kategorin som spärrar, inre
// sekretess och undantag prövas på, som i mellanarkivets eget paket.
export function fhirResurs(db, r, { paketTaggar = false, klinisk: kl = true } = {}) {
  const res = JSON.parse(r.resurs);
  res.id = `ma-${r.id}`;
  // Beslut 2026-11-14: en remiss för den som bara får läsa statusen, utan frågeställning och noter, som fhir.serviceRequest.
  if (res.resourceType === 'ServiceRequest' && !kl) { delete res.reasonCode; delete res.note; }
  skrivOmReferenser(db, r, res);
  res.meta = { ...(res.meta ?? {}), source: `urn:vardkallan:mellanarkiv:${r.paket_id}`,
    tag: [...(res.meta?.tag ?? []).filter(t => paketTaggar || !PAKETTAGGAR.has(t.system)), { system: fhir.SYSTEM.lagring, code: 'mellanarkiv', display: ETIKETT }] };
  if (res.subject?.reference?.startsWith('Patient/')) res.subject = { ...res.subject, reference: `Patient/${r.patient_id}` };
  if (res.resourceType === 'MedicationAdministration' && res.request?.reference && !/^MedicationRequest\/ma-/.test(res.request.reference)) delete res.request;
  return res;
}

// Runda 15, r3: exporten till e-arkivet och återföringen av all data tar med hela journalen, också det som finns i
// mellanarkivet (arkiv.fhirJournal och earkiv.index). Arkivarien läser inte innehållet, och exporten prövas därför inte
// mot behörighetsmotorn, som exporten av den aktiva journalen.
export const RESURSTYP = Object.fromEntries(Object.entries(FHIR_SLAG).map(([t, s]) => [s, t]));
export function exportResurser(db, pid) {
  if (!finnsTabell(db)) return [];
  return db.query('SELECT * FROM mellanarkiv_handlingar WHERE patient_id = ? ORDER BY id').all(pid).map(r => fhirResurs(db, r, { paketTaggar: true }));
}
export const exportRader = (db, pid) => (finnsTabell(db) ? db.query('SELECT * FROM mellanarkiv_handlingar WHERE patient_id = ? ORDER BY id').all(pid) : []);

// Sökningen på patient: handlingarna av resurstypen som anroparen får se, utan dem som är undantagna från FHIR.
export function fhirResurser(atk, typ, { nationell = false } = {}) {
  const slag = FHIR_SLAG[typ];
  if (!slag || !finnsTabell(atk.db)) return [];
  const ute = undantagenFhir(atk.db, typ, nationell);
  return synliga(atk, { slag: [slag], visning: false }).filter(r => !ute(r)).map(r => fhirResurs(atk.db, r, { klinisk: klinisk(atk) }));
}

// GET /fhir/<typ>/ma-<nummer>: samma prövning som läsningen i journalen, och en handling som anroparen inte får se, som
// är undantagen eller som är av en annan typ svarar som en som inte finns.
export function fhirLas(ctx, typ, id) {
  const { db, personal } = ctx;
  sakra(db);
  const r = db.query('SELECT * FROM mellanarkiv_handlingar WHERE id = ?').get(Number(String(id).slice(3)));
  if (!r || FHIR_SLAG[typ] !== r.slag) throw new Fel(404, 'Resursen finns inte.', 'saknas');
  const handling = handlingFor(r, personal);
  const atk = new Atkomst(db, personal, r.patient_id, ctx.valFor(r.patient_id), handling);
  const beskrivning = `fhir/${typ}/${id}`;
  provaRad(atk, r, beskrivning);
  if (undantagenFhir(db, typ, ctx.url?.searchParams?.has('_kontrakt') ?? false)(r)) throw new Fel(404, 'Resursen finns inte.', 'saknas');
  atk.logga(handling, atk.grund(), beskrivning);
  return fhirResurs(db, r, { klinisk: klinisk(atk) });
}

// ---- Seeden ----------------------------------------------------------------------------------------------------------

// Demon: vid migreringen från VAS fördes Gunnar Åkessons (p01) äldre uppgifter direkt till mellanarkivet. Handlingarna är
// påhittade. En anteckning är skriven på Kardiologiska kliniken, där kardiologen har vårdrelation, och de andra på
// vårdcentralen och medicinkliniken, som kräver ett aktivt val. Paketet byggs och tas emot på samma sätt som en
// överföring.
const SEED = [
  { slag: 'anteckning', kategori: 'journal', typ: 'Mottagningsanteckning', enhet: 'uso-kard', datum: '2010-06-08T09:40:00.000Z', av: 'Läkare, VAS (migrerad)', sokord: {
    Kontaktorsak: 'Hjärtklappning vid ansträngning sedan några månader.', Status: 'Regelbunden rytm, inga blåsljud. Blodtryck 148/90.',
    Bedömning: 'Troligen extraslag. Långtids-EKG utan förmaksflimmer.', Planering: 'Ingen behandling. Ny kontakt vid försämring.' } },
  { slag: 'anteckning', kategori: 'journal', typ: 'Mottagningsanteckning', enhet: 'vc-tybble', datum: '2011-09-14T08:30:00.000Z', av: 'Distriktsläkare, VAS (migrerad)', sokord: {
    Kontaktorsak: 'Kontroll av blodtryck efter tre förhöjda hemmätningar.', Bedömning: 'Essentiell hypertoni.', Planering: 'Livsstilsråd. Ny kontroll om tre månader.' } },
  { slag: 'anteckning', kategori: 'omvardnad', typ: 'Omvårdnadsanteckning', enhet: 'uso-med', datum: '2012-02-21T14:15:00.000Z', av: 'Sjuksköterska, VAS (migrerad)', sokord: {
    Omvårdnad: 'Lågt vätskeintag under dagen. Uppmanad att dricka. Mobiliseras med stöd.' } },
  { slag: 'matvarde', typ: 'blodtryck', namn: 'Blodtryck', enhet: 'vc-tybble', datum: '2011-09-14T08:20:00.000Z', varde: [162, 96], matt: 'mm[Hg]' },
];
export function seeda(db) {
  sakra(db);
  seedaJournal(db);
  // Runda 15, r3.
  seedaLakemedel(db);
}

// Runda 15, r3: läkemedlen ur VAS fördes över i ett eget paket. En kur med Alvedon på Kardiologiska kliniken 2012 och dess
// doser, varav en som inte gavs. Raderna läggs först in i journalen och förs sedan över med samma kod som en överföring
// efter ett beslut, så att paketet är detsamma. Id:na ligger långt över seedens, så att inget id återanvänds.
const SEED_LM_TID = '2026-01-15T10:05:00.000Z';
const SEED_LM = {
  ordination: { id: 90001, enhet: 'uso-kard', lakemedel: 'VK-NPL-0026', dosering: '2 tabletter 3 gånger dagligen i 3 dagar', dos: 500, dosEnhet: 'mg', tider: ['08', '14', '20'],
    typ: 'tillfallig', orsak: 'Feber och muskelvärk vid influensa', start: '2012-03-05', slut: '2012-03-07', av: 'lak-vas', skapad: '2012-03-05T09:15:00.000Z' },
  doser: [
    { id: 90001, planerad: '2012-03-05T13:00:00.000Z', tid: '2012-03-05T13:05:00.000Z', status: 'given', antal: 2 },
    { id: 90002, planerad: '2012-03-05T19:00:00.000Z', tid: '2012-03-05T19:10:00.000Z', status: 'given', antal: 2 },
    { id: 90003, planerad: '2012-03-06T07:00:00.000Z', tid: '2012-03-06T07:05:00.000Z', status: 'given', antal: 2 },
    { id: 90004, planerad: '2012-03-06T13:00:00.000Z', tid: '2012-03-06T13:00:00.000Z', status: 'ej_given', orsak: 'Patienten avböjde, feberfri och utan värk' },
  ],
};
function seedaLakemedel(db) {
  if (db.query("SELECT 1 FROM mellanarkiv_handlingar WHERE slag = 'ordination' LIMIT 1").get()) return;
  const o = SEED_LM.ordination;
  if (!db.query("SELECT 1 FROM patienter WHERE id = 'p01'").get() || !db.query('SELECT 1 FROM katalog WHERE id = ?').get(o.lakemedel)
    || !db.query("SELECT 1 FROM personal WHERE id = 'ssk-kard'").get() || db.query('SELECT 1 FROM ordinationer WHERE id = ?').get(o.id)) return;
  db.transaction(() => {
    db.query(`INSERT INTO ordinationer (id, patient_id, enhet_id, lakemedel_id, dosering, dos, dos_enhet, tider, vid_behov, typ, orsak, uppfoljning, start, slut, status, ordinerad_av, skapad, nll_status, kalla)
      VALUES (?, 'p01', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'aktiv', ?, ?, 'kvitterad', 'migrerad:VAS')`)
      .run(o.id, o.enhet, o.lakemedel, o.dosering, o.dos, o.dosEnhet, JSON.stringify(o.tider), o.typ, o.orsak, o.slut, o.start, o.slut, o.av, o.skapad);
    db.query("INSERT INTO ordination_historik (ordination_id, tid, personal_id, handelse, detalj) VALUES (?, ?, ?, 'Migrerad från VAS', ?)").run(o.id, o.skapad, o.av, o.dosering);
    for (const d of SEED_LM.doser) {
      db.query(`INSERT INTO administreringar (id, patient_id, enhet_id, ordination_id, lakemedel_id, planerad, status, dos, dos_enhet, antal, tid, utford_av, registrerad, registrerad_av, orsak, kalla)
        VALUES (?, 'p01', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ssk-kard', ?, 'ssk-kard', ?, 'migrerad:VAS')`)
        .run(d.id, o.enhet, o.id, o.lakemedel, d.planerad, d.status, d.status === 'given' ? o.dos : null, d.status === 'given' ? o.dosEnhet : null, d.antal ?? null, d.tid, d.tid, d.orsak ?? null);
    }
    const ord = db.query('SELECT * FROM ordinationer WHERE id = ?').get(o.id);
    const valda = { anteckningar: [], matvarden: [], administreringar: [], ordinationer: [{ ...ord, administreringar: db.query('SELECT * FROM administreringar WHERE ordination_id = ? ORDER BY id').all(o.id) }] };
    const kalla = 'Migreringen från VAS (demo), läkemedel';
    // Utan XML-schemana, som seedens första paket, så att sandlådan inte blir större än nödvändigt.
    const { paket } = paketFor(db, 'p01', valda, { kalla, scheman: false, tid: SEED_LM_TID });
    taEmot(db, paket, { kalla, tid: SEED_LM_TID, forvantadPatient: 'p01' });
    taBortLakemedel(db, 'p01', valda);
  })();
}

function seedaJournal(db) {
  if (db.query('SELECT 1 FROM mellanarkiv_paket LIMIT 1').get() || !db.query("SELECT 1 FROM patienter WHERE id = 'p01'").get()) return;
  const p = db.query("SELECT * FROM patienter WHERE id = 'p01'").get();
  const res = [fhir.patient(db, p, true)];
  SEED.forEach((s, i) => {
    const id = `vas-ma-${i + 1}`;
    if (s.slag === 'anteckning') {
      res.push(medTagg(medTagg({ resourceType: 'Composition', id, status: 'final', type: { text: s.typ }, subject: { reference: 'Patient/p01' }, date: s.datum,
        author: [{ display: s.av }], title: s.typ, custodian: { reference: `Organization/${s.enhet}`, display: enhetsnamn(db, s.enhet) },
        section: Object.entries(s.sokord).map(([t, x]) => ({ title: t, text: { status: 'generated', div: `<div xmlns="http://www.w3.org/1999/xhtml">${x}</div>` } })) },
      fhir.SYSTEM.kalla, 'migrerad:VAS'), TAGG_KATEGORI, s.kategori));
    } else {
      // Runda 15, r3: mätvärdet byggs som journalens egna mätvärden (fhir.observation), med kategori, LOINC och UCUM,
      // eftersom det nu också lämnas ut genom FHIR-API:t.
      res.push(medTagg(fhir.observation(db, { id, patient_id: 'p01', enhet_id: s.enhet, typ: s.typ, varde: s.varde.join('/'), varde_num: null, matt_enhet: s.matt, tid: s.datum,
        kalla: 'migrerad:VAS', vardkontakt_id: null }), TAGG_MATTYP, s.typ));
    }
  });
  for (const id of new Set(SEED.map(s => s.enhet))) res.push(fhir.organization(db, db.query('SELECT * FROM enheter WHERE id = ?').get(id)));
  const bundle = { resourceType: 'Bundle', type: 'collection', timestamp: '2026-01-15T10:00:00.000Z', entry: res.map(r => ({ fullUrl: `urn:vardkallan:${r.resourceType}/${r.id}`, resource: r })) };
  const index = res.filter(r => ['Composition', 'Observation'].includes(r.resourceType)).map(r => {
    const h = handlingUr(r);
    return { Arkivbildare: `${db.query("SELECT namn FROM enheter WHERE typ = 'vardgivare' ORDER BY rowid LIMIT 1").get()?.namn ?? 'Vårdgivaren'} (demo)`, Informationstyp: earkiv.INFORMATIONSTYP, Patientidentitet: p.personnummer, Patientnamn: `${p.fornamn} ${p.efternamn}`,
      SkyddadePersonuppgifter: p.skyddad ? 'ja' : 'nej', Dokumenttyp: h.slag === 'anteckning' ? h.typ : 'Mätvärde', Dokumentdatum: h.datum.slice(0, 19),
      Vårdenhet: db.query('SELECT hsa_id FROM enheter WHERE id = ?').get(h.enhet)?.hsa_id ?? h.enhet, UpprättadAv: null, Version: '1', Spärr: 'nej',
      Sekretess: 'Offentlighets- och sekretesslagen (2009:400) 25 kap. 1 §', Fil: 'representations/rep_1/data/journal/p01.json', Referens: `urn:vardkallan:${r.resourceType}/${r.id}` };
  });
  const objid = `IP_${randomUUID()}`;
  const { paket } = byggFgsPaket(db, { objid, scheman: false, tid: '2026-01-15T10:00:00.000Z', filer: [
    { relativ: 'representations/rep_1/data/journal/p01.json', data: JSON.stringify(bundle, null, 1), mime: 'application/fhir+json', grupp: 'Representations' },
    { relativ: 'metadata/descriptive/earkiv-index.xml', data: earkiv.indexXml(index), mime: 'text/xml', grupp: 'Descriptive' },
    { relativ: 'documentation/beskrivning.md', data: beskrivning(objid, 'Migreringen från VAS (demo)', index.length), mime: 'text/markdown', grupp: 'Documentation' },
  ] });
  taEmot(db, paket, { kalla: 'Migreringen från VAS (demo)', tid: '2026-01-15T10:00:00.000Z', forvantadPatient: 'p01' });
}

// ---- Beslut 2026-11-14: statistiken räknar likadant före och efter en överföring -------------------------------------
//
// vy(db, tabell) ger namnet på en tillfällig vy med tabellens rader i den aktiva journalen och raderna i mellanarkivet som
// de var när de fördes över (kolumnen rad), med samma kolumner och id. Statistiken, analysen, datauttaget,
// läkemedelsstatistiken, kvalitetsregistren och infektionsrapporteringen läser vyn, så att ett resultat är detsamma
// oavsett var uppgiften ligger. Patientens id är det gällande, också efter en sammanslagning. Vyn är tillfällig
// (TEMP) och följer databasens anslutning, så att den aldrig sparas i en kopia, och den byggs om när tabellens
// kolumner har ändrats.
const SLAG_TABELL = { anteckningar: 'anteckning', matvarden: 'matvarde', ordinationer: 'ordination', administreringar: 'administrering',
  vardkontakter: 'vardkontakt', remisser: 'remiss', diagnoser: 'diagnos' };
const vyer = new WeakMap();
export function vy(db, tabell) {
  const slag = SLAG_TABELL[tabell];
  if (!slag || !finnsTabell(db)) return tabell;
  sakra(db);
  const kol = db.query(`PRAGMA table_info("${tabell}")`).all().map(k => k.name);
  let m = vyer.get(db);
  if (!m) { m = new Map(); vyer.set(db, m); }
  const namn = `alla_${tabell}`;
  if (m.get(tabell) !== kol.join(',')) {
    // Kolumnernas namn kommer från den första delen av UNION ALL.
    const ut = kol.map(k => (k === 'patient_id' ? 'h.patient_id' : `json_extract(h.rad, '$.${k}')`));
    db.exec(`DROP VIEW IF EXISTS temp.${namn}`);
    db.exec(`CREATE TEMP VIEW ${namn} AS SELECT ${kol.map(k => `"${k}"`).join(', ')} FROM main."${tabell}"
      UNION ALL SELECT ${ut.join(', ')} FROM main.mellanarkiv_handlingar h WHERE h.slag = '${slag}' AND h.rad IS NOT NULL`);
    m.set(tabell, kol.join(','));
  }
  return namn;
}

// Gränsen för ett nytt beslut: handlingar äldre än MELLANARKIV_AR år.
export const regelFore = () => addDagar(idag(), -Math.round(MELLANARKIV_AR * 365.25));
export { BESLUTSTYPER };
