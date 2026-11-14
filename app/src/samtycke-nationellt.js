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
export function sakra(db) {
  db.exec(SCHEMA);
  const kol = db.query('PRAGMA table_info(sammanhallen_samtycken)').all().map(k => k.name);
  // Varifrån återkallelsen kom: vardkallan (här) eller annat_system (samtyckestjänsten sa att patienten hade återkallat).
  if (kol.length && !kol.includes('aterkallat_kalla')) db.exec('ALTER TABLE sammanhallen_samtycken ADD COLUMN aterkallat_kalla TEXT');
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

// Det gällande samtycket i Vårdkällan för personens vårdenhet.
export function lokalt(db, personal, patientId) {
  const ve = vardenhetFor(db, personal.enhet_id);
  return db.query('SELECT * FROM sammanhallen_samtycken WHERE patient_id = ? AND aterkallat IS NULL ORDER BY id DESC').all(patientId).find(s => vardenhetFor(db, s.enhet_id) === ve) ?? null;
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
function koaAterkallelse(atk, nu) {
  const db = atk.db;
  const pid = nationellIdentitet(db, atk.patientId);
  if (!pid) return false;
  const ve = vardenhetFor(db, atk.personal.enhet_id);
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

export function efterTid(db, nu = new Date()) {
  try {
    sakra(db);
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
export function prova(atk, { nu = new Date() } = {}) {
  const db = atk.db;
  sakra(db);
  let lok = lokalt(db, atk.personal, atk.patientId);
  const pid = nationellIdentitet(db, atk.patientId);
  if (!pid) {
    return { galler: Boolean(lok), kalla: lok ? 'vardkallan' : null, lokalt: lok, nationellt: null, tjanst: 'ej_aktuell',
      text: lok && db.query('SELECT skyddad FROM patienter WHERE id = ?').get(atk.patientId)?.skyddad ? 'Samtycket gäller här. Det registreras inte i samtyckestjänsten, eftersom patienten har skyddade personuppgifter.' : null };
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
        : 'Samtyckestjänsten svarar inte just nu, så ett samtycke som patienten har gett i ett annat system kan inte kontrolleras. Fråga patienten om samtycke.' };
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
  const giltig = lista.filter(x => {
    const a = x.PDLAssertion;
    const reg = String(x.RegistrationInfo?.RegistrationDate ?? '');
    return a.AssertionType === 'Consent' && a.CareUnitId === minEnhet && (!a.EmployeeId || a.EmployeeId === jag) && !x.CancellationInfo && !x.DeletionInfo
      && String(a.StartDate ?? '') <= t && (!a.EndDate || String(a.EndDate) >= t) && (!aterkallat || reg > tjanstTid(new Date(aterkallat)));
  }).sort((a, b) => String(b.RegistrationInfo?.RegistrationDate).localeCompare(String(a.RegistrationInfo?.RegistrationDate)))[0] ?? null;
  const nationellt = giltig ? { registrerat: giltig.RegistrationInfo?.RegistrationDate ?? null, gallerTill: giltig.PDLAssertion.EndDate ?? null, personligt: Boolean(giltig.PDLAssertion.EmployeeId) } : null;
  const kalla = lok ? 'vardkallan' : giltig ? 'annat_system' : null;
  let text = null;
  if (lok && vantar) text = 'Patienten har samtyckt. Samtyckestjänsten har inte tagit emot registreringen än, och systemet skickar den när tjänsten svarar. Samtycket gäller här under tiden.';
  else if (lok) text = 'Patienten har samtyckt. Samtycket är registrerat här och i samtyckestjänsten.';
  else if (giltig) text = `Patienten har gett samtycke i ett annat system${nationellt.registrerat ? ` den ${datumText(nationellt.registrerat)}` : ''}${nationellt.gallerTill ? `, och det gäller till och med den ${datumText(nationellt.gallerTill)}` : ''}. Samtycket gäller här också.`;
  else if (aterkallatAnnat) text = 'Patienten har återkallat samtycket i ett annat system, och det är återkallat här också. Fråga patienten om samtycke igen för att hämta uppgifterna.';
  return { galler: Boolean(kalla), kalla, lokalt: lok, nationellt, tjanst: 'ok', vantar, text };
}

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
