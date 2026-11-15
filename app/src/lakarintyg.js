// Runda 14, r3: intyg genom en integrerad intygsapplikation (Webcert integrerat läge) och Intygstjänsten, Sussa 2.2.1.9.
// Runda 16, r1: alla intyg som finns i Webcert i dag, med intygstyperna, frågorna och giltigheten i intygstyper.js.
//
// Tjänstekontrakten i riv.clinicalprocess.healthcond.certificate 4.0.5 (bilaga K10):
//   CreateDraftCertificate 3.3      Vårdkällan är konsument. Journalen skapar ett utkast i intygsapplikationen för
//                                   patienten, med läkaren, vårdenheten och förifyllda uppgifter ur journalen.
//   CertificateStatusUpdateForCare  Vårdkällan är producent. Intygsapplikationen meddelar varje händelse (skapat,
//   3.2                             ändrat, klart för signering, signerat, skickat, makulerat, raderat och frågor från
//                                   mottagaren), adresserad till den vårdenhet som äger intyget.
//   ListCertificatesForCareWithQA   Vårdkällan är konsument. Journalen stämmer själv av sin lista mot intygsapplikationen,
//   3.3                             så att en händelse som aldrig kom fram ändå syns.
//
// Systemet är experten: den inloggade väljer bara vilket intyg som ska skrivas. Systemet visar bara de intyg som får
// skrivas för patienten, av den som är inloggad och just nu (giltigheten i intygstyper.js), förklarar varför de andra inte
// går, föreslår det som passar patienten och fyller i allt journalen vet: patient, läkare, vårdenhet, diagnoser med kod,
// underlaget, och där frågan gäller dem graviditeten, läkemedlen, diabetesuppgifterna och funktionsnedsättningen ur
// anteckningen, med källa. Förifyllnaden räknas bara på det den inloggade får se, efter samma prövning som journalen.
//
// Meddelandena byggs, valideras och skickas med den gemensamma grunden i src/rivta/ (rivta-r3.js).
//
// Intygsapplikationen är simulerad i demon (intygsapplikation-simulerad.js) och märkt som simulerad. Den är inte Webcert och inte
// Ineras tjänst, och ingenting skickas till Försäkringskassan, Transportstyrelsen eller någon annan mottagare.
import { randomUUID } from 'node:crypto';
import { Fel, iso, idag, datumAv } from './db.js';
import { vardenhetFor, kanRoll, alder, visningsnamn, Atkomst } from './atkomst.js';
import { avlidenFor } from './avliden.js';
import { el } from './rivta/xml.js';
import * as r3 from './rivta-r3.js';
import * as IT from './intygstyper.js';

export const DOMAN = 'riv.clinicalprocess.healthcond.certificate';
export const DOMANVERSION = '4.0.5';
export const NS = {
  core: 'urn:riv:clinicalprocess:healthcond:certificate:3',
  types: 'urn:riv:clinicalprocess:healthcond:certificate:types:3',
  m3: 'urn:riv:clinicalprocess:healthcond:certificate:3.3',
  skapa: 'urn:riv:clinicalprocess:healthcond:certificate:CreateDraftCertificateResponder:3',
  status: 'urn:riv:clinicalprocess:healthcond:certificate:CertificateStatusUpdateForCareResponder:3',
  lista: 'urn:riv:clinicalprocess:healthcond:certificate:ListCertificatesForCareWithQAResponder:3',
  // Runda 16, r1: förifyllda svar som inte är diagnoser skickas som ett element i en egen namnrymd inuti delsvaret
  // (schemat tillåter element ur andra namnrymder där). Det är en förenkling i demon; Webcert har egna regler per intyg.
  demo: 'urn:vardkallan:demo:intyg:forifyllnad:1',
};
export const DEF = {
  skapa: () => r3.def(DOMAN, 'CreateDraftCertificate', '3.3'),
  status: () => r3.def(DOMAN, 'CertificateStatusUpdateForCare', '3.2'),
  lista: () => r3.def(DOMAN, 'ListCertificatesForCareWithQA', '3.3'),
};
export const KONTRAKT = {
  skapa: { namn: 'CreateDraftCertificate', version: '3.3', roll: 'konsument' },
  status: { namn: 'CertificateStatusUpdateForCare', version: '3.2', roll: 'producent' },
  lista: { namn: 'ListCertificatesForCareWithQA', version: '3.3', roll: 'konsument' },
};

// Kodverk ur Ineras kodverk för intyg. OID:erna är kodverkens identiteter i tjänstekontrakten.
export const KV = {
  intygstyp: IT.KV_INTYGSTYP, handelse: 'dfd7bbad-dbe5-4a2f-ba25-f7b9b2cc6b14',
  status: '9871cd17-8755-4ed9-b894-ff3729e775a4', part: '769bb12b-bd9f-4203-a5cd-fd14f2eb3b80', relation: IT.KV_RELATION,
  personnummer: '1.2.752.129.2.1.3.1', samordningsnummer: '1.2.752.129.2.1.3.3', hsa: '1.2.752.129.2.1.4.1', icd10: '1.2.752.116.1.1.1',
};
// Den simulerade intygsapplikationens logiska adress. Påhittad och märkt som demo.
export const LOGISK_ADRESS_INTYGSAPPLIKATION = 'SE0000000000-SIMINTYG';
export const MOTPART = 'Intygsapplikation (simulerad, inte Webcert)';

// Runda 16, r1: intygstyperna finns i intygstyper.js, med version och giltighet i tid.
export const INTYGSTYPER = IT.INTYGSTYPER;

// Händelserna i KV Händelse, med det journalen visar.
export const HANDELSER = {
  SKAPAT: { text: 'Utkastet skapades', status: 'utkast' }, ANDRAT: { text: 'Utkastet ändrades', status: 'utkast' },
  KFSIGN: { text: 'Klart för signering', status: 'klart_for_signering' }, SIGNAT: { text: 'Signerat', status: 'signerat' },
  SKICKA: { text: 'Skickat till mottagaren', status: 'skickat' }, MAKULE: { text: 'Makulerat', status: 'makulerat' },
  RADERA: { text: 'Utkastet raderades', status: 'raderat' },
  NYFRFM: { text: 'Ny fråga från mottagaren' }, NYSVFM: { text: 'Nytt svar från mottagaren' }, NYFRFV: { text: 'Ny fråga från vården' },
  HANFRFM: { text: 'Fråga från mottagaren hanterad' }, HANFRFV: { text: 'Fråga från vården hanterad' },
};
export const STATUSTEXT = {
  utkast: 'Utkast i intygsapplikationen', klart_for_signering: 'Klart för signering', signerat: 'Signerat', skickat: 'Signerat och skickat',
  makulerat: 'Makulerat', raderat: 'Utkastet raderades', fel: 'Utkastet kunde inte skapas',
};
// I vilken ordning statusarna kommer, så att en sen eller dubblerad händelse aldrig flyttar tillbaka statusen.
const ORDNING = ['utkast', 'klart_for_signering', 'signerat', 'skickat', 'makulerat', 'raderat'];

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS lakarintyg (
  id INTEGER PRIMARY KEY, patient_id TEXT NOT NULL, enhet_id TEXT NOT NULL, typ TEXT NOT NULL, intygs_id TEXT UNIQUE,
  ref TEXT NOT NULL UNIQUE, skapad_av TEXT NOT NULL, skapad_tid TEXT NOT NULL, status TEXT NOT NULL,
  signerad_tid TEXT, skickad_tid TEXT, fragor_ej_besvarade INTEGER NOT NULL DEFAULT 0, andrad_tid TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lakarintyg_handelser (
  id INTEGER PRIMARY KEY, intyg_id INTEGER NOT NULL, patient_id TEXT NOT NULL, enhet_id TEXT NOT NULL, kod TEXT NOT NULL,
  tid TEXT NOT NULL, mottagen_tid TEXT NOT NULL, kalla TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS lakarintyg_handelse_en ON lakarintyg_handelser (intyg_id, kod, tid);
CREATE TRIGGER IF NOT EXISTS lakarintyg_handelse_andras_ej BEFORE UPDATE ON lakarintyg_handelser BEGIN SELECT RAISE(ABORT, 'En händelse för ett intyg ändras inte'); END;
CREATE TRIGGER IF NOT EXISTS lakarintyg_handelse_raderas_ej BEFORE DELETE ON lakarintyg_handelser BEGIN SELECT RAISE(ABORT, 'En händelse för ett intyg raderas inte'); END;
CREATE TRIGGER IF NOT EXISTS lakarintyg_raderas_ej BEFORE DELETE ON lakarintyg BEGIN SELECT RAISE(ABORT, 'Ett intyg raderas inte'); END;
`;
// Runda 16, r1: intygets version och relationen till ett tidigare intyg (förnyelse, förlängning och byte från ett
// ersatt intyg). Läggs till i sandlådor som skapades före runda 16.
export function sakra(db) {
  db.exec(SCHEMA);
  const k = new Set(db.query("SELECT name FROM pragma_table_info('lakarintyg')").all().map(x => x.name));
  for (const [namn, typ] of [['version', "TEXT NOT NULL DEFAULT '1.0'"], ['relation_typ', 'TEXT'], ['relation_id', 'INTEGER']]) if (!k.has(namn)) db.exec(`ALTER TABLE lakarintyg ADD COLUMN ${namn} ${typ}`);
}

const ve = (db, enhetId) => db.query('SELECT id, hsa_id, namn FROM enheter WHERE id = ?').get(vardenhetFor(db, enhetId));

// Patientens identitet i kontraktet: bara personnummer och samordningsnummer går att skicka.
export function personId(p) {
  const nr = String(p.personnummer ?? '').replace(/\D/g, '');
  if (!/^\d{12}$/.test(nr) || /^vk/i.test(String(p.personnummer))) return null;
  const dag = Number(nr.slice(6, 8));
  return { root: dag > 60 ? KV.samordningsnummer : KV.personnummer, extension: nr };
}

// ---------------------------------------------------------------------------------------------------------------
// Runda 16, r1: vem som får göra vad med en intygstyp. utfardare är handlingarna som får signera, utkast de som får
// skapa och fylla i men aldrig signera (vårdadministratören, som i Webcert).
// ---------------------------------------------------------------------------------------------------------------
export const behorighet = (personal, t) => ({
  signera: t.utfardare.find(h => kanRoll(personal, h)) ?? null,
  utkast: t.utkast.find(h => kanRoll(personal, h)) ?? null,
});
const harRatt = (personal, t) => { const b = behorighet(personal, t); return Boolean(b.signera || b.utkast); };
export const kanNagotIntyg = (personal) => IT.INTYGSTYPER.some(t => harRatt(personal, t));

// ---------------------------------------------------------------------------------------------------------------
// Det journalen vet, räknat på det den inloggade får se. Inga tak före urvalet, så att rader på en annan eller spärrad
// vårdenhet aldrig kan tränga undan de synliga och därmed röja att de finns (säkerhetsgranskningen i runda 14).
// ---------------------------------------------------------------------------------------------------------------
const egenEnhet = (atk) => vardenhetFor(atk.db, atk.personal.enhet_id);
const harTabell = (db, namn) => Boolean(db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(namn));
const enhetsnamn = (db, id) => db.query('SELECT namn FROM enheter WHERE id = ?').get(id)?.namn ?? '';
const datumText = (d) => new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Stockholm' }).format(new Date(d.length === 10 ? `${d}T12:00:00Z` : d));

// Diagnoserna på den egna vårdenheten, de senaste först, en per kod. Intygets diagnos är skälet hos den som utfärdar.
function egnaDiagnoser(atk) {
  if (!kanRoll(atk.personal, 'las_diagnoser')) return [];
  const min = egenEnhet(atk);
  const rader = atk.db.query('SELECT id, enhet_id, kod, text, typ, datum FROM diagnoser WHERE patient_id = ? ORDER BY datum DESC, id DESC').all(atk.patientId)
    .filter(d => vardenhetFor(atk.db, d.enhet_id) === min);
  const sedda = new Set();
  return atk.filtrera(rader, 'las_diagnoser').filter(d => !sedda.has(d.kod) && sedda.add(d.kod));
}
// Alla diagnoser som den inloggade får se, på den egna vårdenheten och efter aktivt val eller samtycke på andra.
function synligaDiagnoser(atk) {
  if (!kanRoll(atk.personal, 'las_diagnoser')) return [];
  const rader = atk.db.query('SELECT id, enhet_id, kod, text, typ, datum FROM diagnoser WHERE patient_id = ? ORDER BY datum DESC, id DESC').all(atk.patientId);
  return atk.filtrera(rader, 'las_diagnoser');
}
function synligGraviditet(atk) {
  if (!kanRoll(atk.personal, 'las_graviditet') || !harTabell(atk.db, 'graviditeter')) return null;
  const rader = atk.db.query("SELECT * FROM graviditeter WHERE patient_id = ? AND status = 'pagaende' ORDER BY skapad DESC, id DESC").all(atk.patientId);
  return atk.filtrera(rader, 'las_graviditet')[0] ?? null;
}
// Vårdkontakterna på den egna vårdenheten som har börjat senast i dag, den senaste först.
function egnaVardkontakter(atk, nu) {
  const min = egenEnhet(atk);
  const dag = datumAv(nu);
  const rader = atk.db.query('SELECT * FROM vardkontakter WHERE patient_id = ? ORDER BY start DESC, id DESC').all(atk.patientId)
    .filter(v => datumAv(new Date(v.start)) <= dag && vardenhetFor(atk.db, v.enhet_id) === min);
  return atk.filtrera(rader, 'las_admin');
}
function aktivaLakemedel(atk) {
  if (!kanRoll(atk.personal, 'las_lakemedel')) return [];
  const rader = atk.db.query("SELECT o.*, k.namn AS lm_namn, k.atc AS atc FROM ordinationer o LEFT JOIN katalog k ON k.id = o.lakemedel_id WHERE o.patient_id = ? AND o.status = 'aktiv' ORDER BY o.start DESC, o.id DESC").all(atk.patientId);
  return atk.filtrera(rader, 'las_lakemedel', { gemensam: true });
}
function senasteMatvarde(atk, typ) {
  if (!kanRoll(atk.personal, 'las_matvarden')) return null;
  const rader = atk.db.query('SELECT * FROM matvarden WHERE patient_id = ? AND typ = ? ORDER BY tid DESC, id DESC').all(atk.patientId, typ);
  return atk.filtrera(rader, 'las_matvarden')[0] ?? null;
}
// Status ur den senaste signerade läkaranteckningen på den egna vårdenheten.
function senasteStatus(atk) {
  if (!kanRoll(atk.personal, 'las_journal')) return null;
  const min = egenEnhet(atk);
  const rader = atk.db.query("SELECT * FROM anteckningar WHERE patient_id = ? AND kategori = 'lakare' AND status = 'signerad' ORDER BY skapad DESC, id DESC").all(atk.patientId)
    .filter(a => vardenhetFor(atk.db, a.enhet_id) === min);
  for (const a of atk.filtrera(rader, 'las_journal')) {
    let s = null;
    try { s = JSON.parse(a.sokord); } catch { s = null; }
    const text = s && typeof s.Status === 'string' ? s.Status.trim() : '';
    if (text) return { text, rad: a, kalla: `Status i ${a.typ.toLowerCase()} ${datumText(a.skapad)}, ${enhetsnamn(atk.db, a.enhet_id)}` };
  }
  return null;
}
const pagaendeSlutenvard = (atk, nu) => egnaVardkontakter(atk, nu).find(v => v.typ === 'slutenvard' && !v.slut) ?? null;

// Koder som TS8071 frågar om. Systemet föreslår ja och beskrivningen när en synlig diagnos finns, aldrig nej.
const TS_KODER = {
  'ts.ogon': /^H(0\d|[1-4]\d|5[0-4])/, 'ts.balans': /^(H81|R42)/, 'ts.hjarta': /^I(2[0-5]|4[4-9]|50|6\d)/, 'ts.neuro': /^G(1[0-3]|2[0-6]|3[5-7]|7[0-3])/,
  'ts.epilepsi': /^(G4[01]|R56)/, 'ts.njure': /^(N18[45]|Z940|Z992)/, 'ts.kognitiv': /^(F0[0-3]|G30)/, 'ts.somn': /^G47/,
  'ts.substans': /^F1\d/, 'ts.psyk': /^F(2\d|3[01])/, 'ts.npf': /^(F90|F84|F952)/, 'ts.intellektuell': /^F7\d/,
};
const ren = (k) => k.replace('.', '');
const diagnosRad = (atk, d) => `${d.kod} ${d.text} (${datumText(d.datum)}, ${enhetsnamn(atk.db, d.enhet_id)})`;
const DIABETES = /^E1[0-4]/;
const arInsulin = (o) => /^A10A/.test(o.atc ?? '');
const arAntidiabetika = (o) => /^A10/.test(o.atc ?? '');

// Förifyllnaden för en intygstyp: svaren, källan och källans vårdenheter och läsrätt (meta) för varje svar. Bara frågor
// med forifyll, och bara det som den inloggade får se.
//
// Säkerhetsgranskningen av runda 16: det som sparas i ett utkast (endastEgen, förvalet) kommer bara från den inloggades
// egen vårdenhet: diagnoser, läkemedel, mätvärden, graviditetsjournalen, vårdkontakter och anteckningar. Uppgifter från
// andra vårdenheter, som den inloggade ser genom aktivt val eller genom att patienten häver en spärr, skrivs aldrig in i
// en gemensam post. Med endastEgen: false räknas förslag på allt den inloggade ser just nu; förslagen visas för den som
// signerar, med källa, och sparas bara när personen själv sparar dem, med källornas vårdenheter (meta), så att varje
// läsare sedan prövas mot dem.
const KRAV = { diagnos: 'las_diagnoser', lakemedel: 'las_lakemedel', matvarde: 'las_matvarden', graviditet: 'las_graviditet', journal: 'las_journal', kontakt: 'las_admin' };
export function forifyllnad(atk, t, p, nu = new Date(), { endastEgen = true } = {}) {
  const svar = {};
  const kallor = {};
  const meta = {};
  const underlag = [];
  const min = egenEnhet(atk);
  const egen = (rader) => (endastEgen ? rader.filter(x => vardenhetFor(atk.db, x.enhet_id) === min) : rader);
  const satt = (id, v, kalla, kallrader = [], slag = null) => {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) return;
    svar[id] = v;
    kallor[id] = kalla;
    meta[id] = { enheter: [...new Set(kallrader.map(x => x.enhet_id))], krav: [...new Set((Array.isArray(slag) ? slag : slag ? [slag] : []).map(x => KRAV[x]))] };
  };
  let cache = {};
  const en = (namn, fn) => (Object.hasOwn(cache, namn) ? cache[namn] : (cache[namn] = fn()));
  const diagn = () => en('d', () => (endastEgen ? egnaDiagnoser(atk) : (() => { const sedda = new Set(); return synligaDiagnoser(atk).filter(d => !sedda.has(d.kod) && sedda.add(d.kod)); })()));
  const alla = () => en('a', () => egen(synligaDiagnoser(atk)));
  const vk = () => en('v', () => egnaVardkontakter(atk, nu));
  const lm = () => en('l', () => egen(aktivaLakemedel(atk)));
  const grav = () => en('g', () => { const g = synligGraviditet(atk); return g && egen([g]).length ? g : null; });
  for (const q of IT.fragorFor(t)) {
    if (!q.forifyll) continue;
    const k = q.forifyll;
    if (k === 'diagnoser') {
      const d = diagn().slice(0, 3);
      satt(q.id, d.map(x => ({ kod: ren(x.kod), text: x.text })), d.length ? `Diagnoser: ${d.map(x => diagnosRad(atk, x)).join('; ')}` : null, d, 'diagnos');
    } else if (k === 'diagnoserText') {
      const d = diagn().slice(0, 3);
      satt(q.id, d.map(x => `${x.kod} ${x.text}`).join('. '), `Diagnoser: ${d.map(x => diagnosRad(atk, x)).join('; ')}`, d, 'diagnos');
    } else if (k === 'vardkontakt') {
      const v = vk()[0];
      if (!v) continue;
      const kod = /telefon/i.test(v.plats ?? '') ? 'TELEFONKONTAKT' : /video|digital/i.test(v.plats ?? '') ? 'DIGITALUNDERSOKNING' : Object.hasOwn(q.alt, 'FYSISKUNDERSOKNING') ? 'FYSISKUNDERSOKNING' : 'UNDERSOKNING';
      if (Object.hasOwn(q.alt, kod)) satt(q.id, { [kod]: datumAv(new Date(v.start)) }, `Vårdkontakten ${datumText(v.start)} på ${enhetsnamn(atk.db, v.enhet_id)}`, [v], 'kontakt');
    } else if (k === 'vardkontaktDatum') {
      const v = vk()[0];
      if (v) satt(q.id, datumAv(new Date(v.start)), `Vårdkontakten ${datumText(v.start)} på ${enhetsnamn(atk.db, v.enhet_id)}`, [v], 'kontakt');
    } else if (k === 'tsKalla') {
      const v = vk()[0];
      if (v) satt(q.id, datumAv(new Date(v.start)) === datumAv(nu) ? 'undersokn' : 'journal', `Vårdkontakten ${datumText(v.start)}`, [v], 'kontakt');
    } else if (k === 'status') {
      const st = senasteStatus(atk);
      if (st) satt(q.id, st.text, st.kalla, [st.rad], 'journal');
    } else if (k === 'graviditet') {
      const g = grav();
      if (g) satt(q.id, g.bpd, `Graviditetsjournalen på ${enhetsnamn(atk.db, g.enhet_id)}, beräknad förlossning ${datumText(g.bpd)}`, [g], 'graviditet');
    } else if (k === 'inneliggande') {
      const sv = pagaendeSlutenvard(atk, nu);
      if (sv) satt(q.id, true, `Inskriven i slutenvård sedan ${datumText(sv.start)}`, [sv], 'kontakt');
    } else if (k === 'dodsdatum') {
      const d = avlidenFor(atk.db, atk.patientId);
      if (d?.datum) satt(q.id, d.datum, `Registrerat dödsdatum ${datumText(d.datum)}`);
    } else if (k === 'lakemedelText') {
      const l = lm();
      satt(q.id, l.map(o => o.lm_namn ?? o.lakemedel_id).join(', '), l.length ? 'Aktuella läkemedel i läkemedelslistan' : null, l, 'lakemedel');
    } else if (k === 'ts.medicinering') {
      if (lm().length) satt(q.id, true, 'Aktuella läkemedel i läkemedelslistan', lm(), 'lakemedel');
    } else if (k === 'ts.diabetes') {
      const d = alla().find(x => DIABETES.test(ren(x.kod)));
      const l = lm().filter(arAntidiabetika);
      if (d && l.length) satt(q.id, true, `${diagnosRad(atk, d)} och läkemedel mot diabetes i läkemedelslistan`, [d, ...l], ['diagnos', 'lakemedel']);
    } else if (Object.hasOwn(TS_KODER, k)) {
      const d = alla().filter(x => TS_KODER[k].test(ren(x.kod))).slice(0, 3);
      if (d.length) {
        satt(q.id, true, `Diagnos: ${d.map(x => diagnosRad(atk, x)).join('; ')}`, d, 'diagnos');
        satt(`${q.id}.2`, d.map(x => `${x.kod} ${x.text}, diagnos ${datumText(x.datum)}`).join('. '), 'Ur diagnoserna i journalen', d, 'diagnos');
      }
    } else if (k.startsWith('diabetes') || k === 'hypoglykemiRisk') {
      const d = alla().filter(x => DIABETES.test(ren(x.kod)));
      const l = lm().filter(arAntidiabetika);
      if (k === 'diabetesAr' && d.length) { const f = d.at(-1); satt(q.id, Number(f.datum.slice(0, 4)), `Första diabetesdiagnosen i journalen: ${diagnosRad(atk, f)}`, [f], 'diagnos'); }
      if (k === 'diabetesTyp' && d.length) { const typ = /^E10/.test(ren(d[0].kod)) ? 'DIABETES_TYP_1' : /^E11/.test(ren(d[0].kod)) ? 'DIABETES_TYP_2' : 'ANNAN'; satt(q.id, typ, diagnosRad(atk, d[0]), [d[0]], 'diagnos'); }
      if (k === 'diabetesMedicinering' && d.length) satt(q.id, l.length > 0, l.length ? `Läkemedel mot diabetes: ${l.map(o => o.lm_namn).join(', ')}` : 'Inga läkemedel mot diabetes i läkemedelslistan', [...d, ...l], ['diagnos', 'lakemedel']);
      if (k === 'diabetesBehandling' && l.length) satt(q.id, [...new Set(l.map(o => (arInsulin(o) ? 'INSULIN' : /^A10B[ABFGHKX]/.test(o.atc) ? 'TABLETTER' : 'ANNAN')))], `Läkemedel mot diabetes: ${l.map(o => `${o.lm_namn} (${o.atc})`).join(', ')}`, l, 'lakemedel');
      if (k === 'hypoglykemiRisk' && l.length) { const risk = l.filter(o => arInsulin(o) || /^A10BB/.test(o.atc)); if (risk.length) satt(q.id, true, 'Insulin eller sulfonureider ger risk för hypoglykemi', risk, 'lakemedel'); }
    }
  }
  // Underlag bredvid frågorna, som inte är svar: senaste HbA1c för intygen om körkort, och graviditetsveckan.
  if (['TSTRK1031', 'TS8071'].includes(t.kod)) {
    const h = senasteMatvarde(atk, 'hba1c');
    if (h && egen([h]).length) underlag.push({ text: `Senaste HbA1c ${String(h.varde).replace('.', ',')} mmol/mol (${datumText(h.tid)}, ${enhetsnamn(atk.db, h.enhet_id)})`, enheter: [h.enhet_id], krav: [KRAV.matvarde] });
  }
  if (t.kod === 'IGRAV') {
    const g = grav();
    if (g) { const dagar = 280 - Math.round((Date.parse(`${g.bpd}T12:00:00Z`) - Date.parse(`${datumAv(nu)}T12:00:00Z`)) / 86400_000); underlag.push({ text: `Graviditetsvecka ${Math.floor(dagar / 7)}+${dagar % 7} i dag`, enheter: [g.enhet_id], krav: [KRAV.graviditet] }); }
  }
  cache = null;
  return { svar, kallor, meta, underlag };
}

// Om läsaren får se ett förifyllt svar eller underlag: läsrätten för varje slag av källa, och varje källas vårdenhet
// prövad med läsarens egen Atkomst (spärr, aktivt val och samtycke som i journalen). Ett svar utan källa är fritt.
export function synligForLasare(atk, m) {
  if (!m) return true;
  for (const h of m.krav ?? []) {
    if (!kanRoll(atk.personal, h)) return false;
    if ((m.enheter ?? []).length && atk.filtrera(m.enheter.map(enhet_id => ({ enhet_id })), h, { gemensam: h === 'las_lakemedel' }).length !== m.enheter.length) return false;
  }
  return true;
}

// Förslagen för den som signerar ett utkast, räknade på det personen ser just nu, för de frågor som är tomma. De sparas
// inte förrän personen sparar utkastet (intygsapplikation-simulerad.js). Ger null för den som inte får signera.
export function forslagForUtkast(db, personal, intygsId, val = {}, tomma = null) {
  const rad = db.query('SELECT * FROM lakarintyg WHERE intygs_id = ?').get(intygsId);
  if (!rad || !['utkast', 'klart_for_signering'].includes(rad.status) || vardenhetFor(db, personal.enhet_id) !== rad.enhet_id) return null;
  const t = IT.typFor(rad.typ, rad.version);
  if (!t || !behorighet(personal, t).signera) return null;
  const p = db.query('SELECT * FROM patienter WHERE id = ?').get(rad.patient_id);
  const atk = new Atkomst(db, personal, p.id, val, behorighet(personal, t).signera);
  if (!atk.prova(behorighet(personal, t).signera, { enhet_id: rad.enhet_id }).tillaten) return null;
  const f = forifyllnad(atk, t, p, new Date(), { endastEgen: false });
  const ut = { svar: {}, kallor: {}, meta: {} };
  for (const id of Object.keys(f.svar)) {
    if (tomma && !tomma.includes(id)) continue;
    ut.svar[id] = f.svar[id]; ut.kallor[id] = f.kallor[id]; ut.meta[id] = f.meta[id];
  }
  return ut;
}

// ---------------------------------------------------------------------------------------------------------------
// Vilka intygstyper som får skrivas för patienten, av den inloggade och just nu, och varför de andra inte får det. Ett
// val som inte går ska aldrig visas som ett val. Intygstyper som den inloggade inte får skriva visas inte alls, och
// intyg som ännu inte gäller visas inte. Ett ersatt intyg visas med vad som ersatte det.
// ---------------------------------------------------------------------------------------------------------------
// Säkerhetsgranskningen av runda 16: reglerna för om en intygstyp får skrivas för patienten av personen, i en funktion
// som alla vägar anropar: listan och förslaget i journalen (typerFor), utkastet i intygsapplikationen (CreateDraftCertificate)
// och nya utkast ur ett intyg (förnyelse, byte och intyget till arbetsgivaren). Ger skälet på vanlig svenska, eller null.
// Utan personal prövas reglerna som för läkaren. Graviditeten prövas med det personen får se i graviditetsjournalen.
export function provaRegler(db, p, t, personal, { nu = new Date(), dagen = null, atk = null, avliden = null, ar = null } = {}) {
  const b = personal ? behorighet(personal, t) : { signera: 'skriv_intyg', utkast: null };
  if (!b.signera && !b.utkast) return 'Du får inte skriva intyget.';
  const dod = avliden ?? Boolean(avlidenFor(db, p.id));
  const alderNu = ar ?? alder(p.fodd, dagen ?? datumAv(IT.tidpunkt(nu)));
  const { alder: [min, max], skal: alderSkal } = IT.alderFor(t, nu);
  if (t.avliden && !dod) return 'Skrivs först när patienten är registrerad som avliden.';
  if (!t.avliden && dod) return 'Patienten är registrerad som avliden. Bara dödsbevis och dödsorsaksintyg kan skrivas.';
  if (p.skyddad && !t.sekretess) return 'Kan inte skrivas för en patient med skyddade personuppgifter.';
  if (p.skyddad && !b.signera) return 'För en patient med skyddade personuppgifter skapas intyget av den som signerar det.';
  if (alderNu < min || alderNu > max) return alderSkal ?? (max >= 130 ? `Gäller patienter från ${min} år.` : `Gäller patienter mellan ${min} och ${max} år.`);
  if (t.kraver === 'graviditet') {
    if (personal && !kanRoll(personal, 'las_graviditet')) return 'Skrivs av läkaren, barnmorskan eller sjuksköterskan, som ser graviditetsjournalen.';
    const a = atk ?? (personal ? new Atkomst(db, personal, p.id, {}, 'las_graviditet') : null);
    if (!(a && synligGraviditet(a))) return 'Skrivs när det finns en pågående graviditet i graviditetsjournalen. Registrera graviditeten först.';
  }
  return null;
}

export function typerFor(db, p, dag = idag(), { personal = null, atk = null } = {}) {
  const nu = IT.tidpunkt(dag);
  const dagen = typeof dag === 'string' && /^\d{4}-\d\d-\d\d$/.test(dag) ? dag : datumAv(nu);
  const avliden = Boolean(avlidenFor(db, p.id));
  const ar = alder(p.fodd, dagen);
  const ut = [];
  for (const kod of IT.KODER) {
    let t = IT.aktuell(kod, nu);
    let skal = null;
    if (!t) {
      const s = IT.senast(kod);
      if (s.giltig.fran && Date.parse(s.giltig.fran) > nu.getTime()) continue;
      t = s;
      skal = IT.giltighetText(s) ?? `${s.text} kan inte skrivas just nu.`;
    }
    const b = personal ? behorighet(personal, t) : { signera: 'skriv_intyg', utkast: null };
    if (!b.signera && !b.utkast) continue;
    if (!skal) skal = provaRegler(db, p, t, personal, { nu, dagen, atk, avliden, ar });
    ut.push({ kod: t.kod, version: t.version, blankett: t.blankett, text: t.text, mottagare: t.mottagare, sandning: t.sandning, mojlig: !skal, skal, kanSignera: Boolean(b.signera) });
  }
  return ut;
}

// Förslaget: det systemet tror att den inloggade ska skriva, med skälet.
const ALLVARLIG = /^(C\d\d|D4[5-7]|D6[01]|G93[0-9]|I42|Q2[0-4]|J96|N17|K72)/;
export function forslag(atk, p, dag = idag()) {
  const nu = IT.tidpunkt(dag);
  const dagen = typeof dag === 'string' && /^\d{4}-\d\d-\d\d$/.test(dag) ? dag : datumAv(nu);
  const typer = typerFor(atk.db, p, dag, { personal: atk.personal, atk });
  const mojlig = (k) => typer.some(t => t.kod === k && t.mojlig);
  const avliden = avlidenFor(atk.db, p.id);
  if (avliden) {
    const dbSignerat = atk.db.query("SELECT 1 FROM lakarintyg WHERE patient_id = ? AND typ = 'DB' AND status IN ('signerat', 'skickat')").get(p.id);
    if (!dbSignerat && mojlig('DB')) return { kod: 'DB', varfor: 'Patienten är registrerad som avliden. Dödsbeviset ska skrivas först, sedan dödsorsaksintyget.' };
    if (mojlig('DOI')) return { kod: 'DOI', varfor: 'Dödsbeviset är signerat. Dödsorsaksintyget skrivs nu.' };
    return null;
  }
  const g = mojlig('IGRAV') ? synligGraviditet(atk) : null;
  if (g) return { kod: 'IGRAV', varfor: `Graviditeten i graviditetsjournalen, beräknad förlossning ${datumText(g.bpd)}. Intyget om graviditet behövs för graviditetspenning och föräldrapenning före förlossningen.` };
  const ar = alder(p.fodd, dagen);
  const diagn = kanRoll(atk.personal, 'las_diagnoser') ? egnaDiagnoser(atk) : [];
  const d = diagn[0] ?? null;
  // Besöket gäller körkortet: kontaktorsaken för en vårdkontakt i dag på den egna vårdenheten nämner körkort eller taxi.
  const korkort = egnaVardkontakter(atk, nu).some(v => datumAv(new Date(v.start)) === dagen && /körkort|taxi/i.test(`${v.orsak ?? ''} ${v.plats ?? ''}`));
  if (korkort) {
    const diabetes = synligaDiagnoser(atk).some(x => DIABETES.test(ren(x.kod))) && aktivaLakemedel(atk).some(arAntidiabetika);
    if (diabetes && mojlig('TSTRK1031')) return { kod: 'TSTRK1031', varfor: 'Besöket gäller körkortet och patienten har läkemedelsbehandlad diabetes.' };
    if (mojlig('TS8071')) return { kod: 'TS8071', varfor: 'Besöket gäller körkortet. TS8071 är Transportstyrelsens läkarintyg för högre behörigheter och taxi.' };
  }
  if (ar < 18 && d) {
    const allvarlig = diagn.some(x => ALLVARLIG.test(ren(x.kod))) || pagaendeSlutenvard(atk, nu);
    if (allvarlig && mojlig('LU_TFP_ASB18')) return { kod: 'LU_TFP_ASB18', varfor: `Barnet är under 18 år och allvarligt sjukt (${d.kod} ${d.text}). Utlåtandet ger föräldern rätt till tillfällig föräldrapenning.` };
    if (mojlig('LU_TFP_B12_16')) return { kod: 'LU_TFP_B12_16', varfor: `Barnet är mellan 12 och 16 år och har ${d.kod} ${d.text}. Utlåtandet behövs för förälderns tillfälliga föräldrapenning.` };
    if (mojlig('ITFP')) return { kod: 'ITFP', varfor: `Barnet är under 12 år och har ${d.kod} ${d.text}. Intyget behövs för förälderns tillfälliga föräldrapenning från dag åtta.` };
  }
  if (d && mojlig('LISJP')) return { kod: 'LISJP', varfor: `Diagnosen ${d.kod} ${d.text} från din vårdenhet förifylls.` };
  const forsta = typer.find(t => t.mojlig);
  return forsta ? { kod: forsta.kod, varfor: null } : null;
}

// Förifyllnaden i kontraktets form. Svarets id är frågans nummer före punkten och delsvarets id frågans eget id, som i
// blanketterna (fråga 52.2 är delsvar 52.2 i svar 52). Diagnoser är delsvar med cv i ICD-10-SE (id.2, id.4 och id.6 som
// i Webcert), övriga svar ett element i demons namnrymd. En fråga utan punkt har sitt värde i delsvar id.1, eller id.0
// när blanketten redan har en fråga id.1. Frågor vars id inte är ett nummer förifylls inte.
export const delsvarId = (t, id) => (id.includes('.') ? id : IT.fragorFor(t).some(q => q.id === `${id}.1`) ? `${id}.0` : `${id}.1`);
export function forifyllnadSvar(t, forifyllt) {
  const perSvar = new Map();
  for (const q of IT.fragorFor(t)) {
    if (!Object.hasOwn(forifyllt.svar ?? {}, q.id) || !/^\d+(\.\d+)?$/.test(q.id)) continue;
    const v = forifyllt.svar[q.id];
    const kalla = forifyllt.kallor?.[q.id] ?? null;
    const svarId = q.id.split('.')[0];
    const lista = perSvar.get(svarId) ?? [];
    if (q.typ === 'diagnoser') lista.push(...v.slice(0, 3).map((x, i) => ({ '@id': `${q.id}.${2 + i * 2}`, $any: [el(NS.types, 'cv', [el(NS.types, 'code', x.kod), el(NS.types, 'codeSystem', KV.icd10), el(NS.types, 'displayName', x.text)]), ...(i === 0 && kalla ? [el(NS.demo, 'kalla', JSON.stringify({ kalla, meta: forifyllt.meta?.[q.id] ?? null }))] : [])] })));
    else lista.push({ '@id': delsvarId(t, q.id), $any: [el(NS.demo, 'varde', JSON.stringify({ v, kalla, meta: forifyllt.meta?.[q.id] ?? null }))] });
    perSvar.set(svarId, lista);
  }
  const svar = [...perSvar].filter(([, d]) => d.length).map(([id, delsvar]) => ({ '@id': id, delsvar }));
  return svar.length ? { svar } : null;
}

// Underlaget bredvid frågorna (till exempel senaste HbA1c) skickas som ett element i demons namnrymd efter svaren, där
// schemat tillåter element ur andra namnrymder.
function forifyllnadMedUnderlag(t, f) {
  const s = forifyllnadSvar(t, f);
  const u = (f.underlag ?? []).slice(0, 5).map(x => ({ text: String(x.text).slice(0, 300), enheter: x.enheter ?? [], krav: x.krav ?? [] }));
  if (!s && !u.length) return null;
  return { ...(s ?? {}), ...(u.length ? { $any: [el(NS.demo, 'underlag', JSON.stringify(u))] } : {}) };
}

// Begäran CreateDraftCertificate 3.3 i schemats form (grunden bygger den i schemats ordning och validerar den).
const hsa = (x) => ({ root: KV.hsa, extension: x });
export function skapaUtkastBegaran({ typ, patient, pid, personal, enhet, ref, diagnos = null, forifyllt = null, nu = new Date() }) {
  const t = IT.aktuell(typ, nu) ?? IT.senast(typ);
  // Runda 14: en ensam diagnos kan fortfarande skickas som förut (diagnos), nu som förifyllnad av diagnosfrågan.
  const f = forifyllt ?? (diagnos ? { svar: { [IT.fragorFor(t).find(q => q.typ === 'diagnoser')?.id ?? '6']: [{ kod: diagnos.kod.replace('.', ''), text: diagnos.text }] } } : null);
  return {
    intyg: {
      typAvIntyg: { code: t.kod, codeSystem: KV.intygstyp, displayName: t.text },
      patient: {
        'person-id': pid, fornamn: (patient.fornamn ?? '').trim(), efternamn: patient.efternamn,
        // Adressen skickas inte för en patient med skyddade personuppgifter. Intygsapplikationen hämtar den själv.
        postadress: patient.skyddad ? '' : (patient.adress ?? ''), postnummer: patient.skyddad ? '' : (patient.postnr ?? ''), postort: patient.skyddad ? '' : (patient.ort ?? ''),
      },
      skapadAv: { 'personal-id': hsa(personal.hsa_id), fullstandigtNamn: personal.namn, enhet: { 'enhets-id': hsa(enhet.hsa_id), enhetsnamn: enhet.namn } },
      ref,
      forifyllnad: f ? forifyllnadMedUnderlag(t, f) : null,
    },
  };
}

const radUt = (db, r, personal = null) => {
  const t = IT.typFor(r.typ, r.version);
  const nu = new Date();
  const ersatt = t && !IT.galler(t, nu) && t.giltig.till && Date.parse(t.giltig.till) <= nu.getTime();
  const b = t && personal ? behorighet(personal, t) : { signera: null, utkast: null };
  const ny = ersatt && t.ersattsAv ? IT.aktuell(t.ersattsAv.kod, nu) : null;
  const pat = db.query('SELECT skyddad FROM patienter WHERE id = ?').get(r.patient_id);
  // Säkerhetsgranskningen av runda 16: den med begränsad vy (vårdadministratören) öppnar bara egna utkast och intyg.
  const begransadVy = t && personal && !b.signera && !(kanRoll(personal, 'las_diagnoser') && kanRoll(personal, 'las_journal'));
  const far = b.signera || (b.utkast && !pat?.skyddad && !(begransadVy && r.skapad_av !== personal.id));
  return {
    id: r.id, typ: r.typ, version: r.version ?? '1.0', blankett: t?.blankett ?? null, text: t?.text ?? r.typ, mottagare: t?.mottagare ?? null,
    status: r.status, statusText: STATUSTEXT[r.status] ?? r.status,
    skapad: r.skapad_tid, signerad: r.signerad_tid, skickad: r.skickad_tid, fragorEjBesvarade: r.fragor_ej_besvarade,
    vardenhet: ve(db, r.enhet_id) ? { namn: ve(db, r.enhet_id).namn } : null,
    skapadAv: db.query('SELECT namn FROM personal WHERE id = ?').get(r.skapad_av)?.namn ?? null,
    kanOppnas: ['utkast', 'klart_for_signering', 'signerat', 'skickat'].includes(r.status) && Boolean(r.intygs_id) && Boolean(personal ? (far || (!pat?.skyddad && !begransadVy && kanRoll(personal, 'las_intyg'))) : true),
    // Runda 16, r1: ett ersatt intyg säger vad som ersatte det, och ett signerat intyg kan förnyas med den version som
    // gäller nu, eller bytas mot det intyg som ersatte det.
    ersatt: ersatt ? (IT.giltighetText(t) ?? 'Intygstypen gäller inte längre.') : null,
    sandning: t?.sandning ?? null,
    relation: r.relation_typ ? { typ: r.relation_typ, text: IT.RELATIONER[r.relation_typ] ?? r.relation_typ } : null,
    kanFornyas: Boolean(far && ['signerat', 'skickat'].includes(r.status) && r.intygs_id && (ny ? true : t?.fornyas && IT.aktuell(r.typ, nu))),
    fornyasMed: ['signerat', 'skickat'].includes(r.status) ? (ny ? { kod: ny.kod, version: ny.version, text: ny.kod === r.typ ? `Förnya med version ${ny.version}` : `Skriv ${ny.blankett} i stället` } : t?.fornyas ? { kod: r.typ, version: IT.aktuell(r.typ, nu)?.version ?? null, text: 'Förnya' } : null) : null,
    handelser: db.query('SELECT kod, tid FROM lakarintyg_handelser WHERE intyg_id = ? ORDER BY tid, id').all(r.id).map(h => ({ kod: h.kod, text: HANDELSER[h.kod]?.text ?? h.kod, tid: h.tid })),
  };
};

// Patientens intyg som den inloggade får se. Ett intyg från en annan vårdenhet visas efter samma regler som journalen.
export function forPatient(atk, p, dag = idag()) {
  atk.krav('las_intyg');
  const rader = atk.filtrera(atk.db.query('SELECT * FROM lakarintyg WHERE patient_id = ? ORDER BY skapad_tid DESC, id DESC').all(p.id), 'las_intyg');
  // Runda 16, r1: räknas innan förslaget och förifyllnaden prövar andra rader, så att rutan om dolda intyg bara gäller intygen.
  const doldaIntyg = atk.doldaVal;
  const typer = kanNagotIntyg(atk.personal) ? typerFor(atk.db, p, dag, { personal: atk.personal, atk }) : [];
  // Den som bara får skriva några få intyg (sjuksköterskan) ser rutan bara när något av dem kan skrivas för patienten.
  const kanSkriva = kanRoll(atk.personal, 'skriv_intyg') || kanRoll(atk.personal, 'utkast_intyg') || typer.some(t => t.mojlig);
  return {
    intyg: rader.map(r => radUt(atk.db, r, atk.personal)),
    kanSkriva,
    typer: kanSkriva ? typer : [],
    forslag: kanSkriva ? forslag(atk, p, dag) : null,
    motpart: MOTPART,
    kontrakt: `${DOMAN} ${DOMANVERSION}: ${KONTRAKT.skapa.namn} ${KONTRAKT.skapa.version}, ${KONTRAKT.status.namn} ${KONTRAKT.status.version} och ${KONTRAKT.lista.namn} ${KONTRAKT.lista.version}`,
    simulerat: 'Intygsapplikationen är simulerad i demon. Inget intyg skickas till någon mottagare.',
    dolda: doldaIntyg > 0 ? { kraverVal: true, text: 'Det finns intyg från andra vårdenheter. Gör ett aktivt val för att visa dem.' } : null,
  };
}

// Texten för det som förifylldes, i frågornas ordning med diagnoserna först.
function forifylltText(t, f) {
  const ut = [];
  for (const q of IT.fragorFor(t)) {
    if (!Object.hasOwn(f.svar, q.id)) continue;
    const v = f.svar[q.id];
    if (q.typ === 'diagnoser') ut.unshift(`Diagnos ${v.map(x => `${x.kod.length > 3 ? `${x.kod.slice(0, 3)}.${x.kod.slice(3)}` : x.kod} ${x.text}`).join(', ')}`);
    else ut.push(q.text.replace(/\?$/, ''));
  }
  return ut;
}

// Skapar ett utkast i intygsapplikationen. Ger raden och adressen som öppnar utkastet.
export async function skapa(atk, p, body = {}, dag = idag()) {
  const nu = IT.tidpunkt(dag);
  const typ = typeof body.typ === 'string' ? body.typ : '';
  if (!IT.KODER.includes(typ)) throw new Fel(400, 'Välj ett av intygen i listan.', 'ogiltig', { falt: ['typ'] });
  const val = typerFor(atk.db, p, dag, { personal: atk.personal, atk }).find(t => t.kod === typ);
  // Den som inte får skriva intygstypen nekas av behörighetsmotorn, med samma svar som förut.
  if (!val) atk.krav('skriv_intyg');
  if (!val.mojlig) throw new Fel(400, `${val.text} kan inte skrivas: ${val.skal}`, 'ogiltig', { falt: ['typ'] });
  const t = IT.aktuell(typ, nu);
  const b = behorighet(atk.personal, t);
  atk.krav(b.signera ?? b.utkast);
  const pid = personId(p);
  if (!pid) throw new Fel(400, 'Patienten har inget personnummer eller samordningsnummer. Intyg via intygsapplikationen kräver ett av dem. Registrera patientens identitet först.', 'ogiltig');
  const db = atk.db;
  const personal = db.query('SELECT * FROM personal WHERE id = ?').get(atk.personal.id);
  const enhet = ve(db, atk.personal.enhet_id);
  const forifyllt = forifyllnad(atk, t, p, nu);
  const ref = `VK-INTYG-${randomUUID()}`;
  const tid = iso();
  const id = Number(db.query("INSERT INTO lakarintyg (patient_id, enhet_id, typ, version, ref, skapad_av, skapad_tid, status, andrad_tid) VALUES (?, ?, ?, ?, ?, ?, ?, 'utkast', ?)")
    .run(p.id, enhet.id, typ, t.version, ref, personal.id, tid, tid).lastInsertRowid);
  let svar = null;
  let orsak = null;
  try {
    svar = await r3.anropa(db, DEF.skapa(), { logiskAdress: LOGISK_ADRESS_INTYGSAPPLIKATION, begaran: skapaUtkastBegaran({ typ, patient: p, pid, personal, enhet, ref, forifyllt, nu }), transport: transportTill(db) });
  } catch (x) { if (!(x instanceof r3.RivtaFel)) throw x; orsak = x.message; }
  const intygsId = svar?.['intygs-id']?.extension ?? null;
  if (!svar || svar.result?.resultCode !== 'OK' || !intygsId) {
    db.query("UPDATE lakarintyg SET status = 'fel', andrad_tid = ? WHERE id = ?").run(iso(), id);
    atk.logga(b.signera ?? b.utkast, atk.grund(), `intyg:${id}`);
    throw new Fel(502, `Intygsapplikationen tog inte emot utkastet. ${orsak ?? svar?.result?.resultText ?? 'Okänt fel.'}`, 'motpart');
  }
  db.query('UPDATE lakarintyg SET intygs_id = ? WHERE id = ?').run(intygsId, id);
  // Intygsapplikationens statusuppdatering om det nya utkastet kommer efter svaret.
  await r3.leverera(db);
  atk.logga(b.signera ?? b.utkast, atk.grund(), `intyg:${id}`);
  const rad = db.query('SELECT * FROM lakarintyg WHERE id = ?').get(id);
  return { intyg: radUt(db, rad, atk.personal), oppna: oppnaAdress(rad), forifyllt: forifylltText(t, forifyllt), text: `Utkastet till ${IT.iMening(t.text)} är skapat i intygsapplikationen.` };
}

// Adressen som öppnar intyget i intygsapplikationen, som i integrerat läge: intygets id och vårdenheten. Inga
// patientuppgifter finns i adressen.
export const oppnaAdress = (rad) => `#/intygsapplikation/${encodeURIComponent(rad.intygs_id)}`;

function synligRad(atk, id) {
  const rad = /^\d{1,9}$/.test(String(id)) ? atk.db.query('SELECT * FROM lakarintyg WHERE id = ? AND patient_id = ?').get(Number(id), atk.patientId) : null;
  const synlig = rad ? atk.filtrera([rad], 'las_intyg')[0] : null;
  if (!synlig || !synlig.intygs_id) throw new Fel(404, 'Intyget finns inte.', 'saknas');
  return synlig;
}

export async function oppna(atk, id) {
  const synlig = synligRad(atk, id);
  const t = IT.typFor(synlig.typ, synlig.version);
  const b = t ? behorighet(atk.personal, t) : { signera: null, utkast: null };
  atk.krav(b.signera ?? b.utkast ?? 'las_intyg', { resurs: { enhet_id: synlig.enhet_id } });
  atk.logga(atk.handling, atk.grund(), `intyg:${synlig.id}`);
  // Säkerhetsgranskningen av runda 16: inget sparas i utkastet för att det öppnas. Förslagen visas i intygsapplikationen
  // för den som signerar och sparas först när personen sparar (forslagForUtkast).
  return { oppna: oppnaAdress(synlig) };
}

// Runda 16, r1: förnyelse eller förlängning av ett signerat intyg, och byte från ett ersatt intyg till det som ersatte
// det. Behörigheten prövas här i journalen, och intygsapplikationen skapar det nya utkastet med de svar som får följa
// med (intygstyper.overfor) och meddelar journalen med en statusuppdatering som har relationen till det gamla intyget.
let fornyaIApp = async () => { throw new Fel(502, 'Ingen intygsapplikation är ansluten.', 'motpart'); };
export const sattFornya = (fn) => { fornyaIApp = fn; };
export async function fornya(atk, p, id) {
  const synlig = synligRad(atk, id);
  const t = IT.typFor(synlig.typ, synlig.version);
  const b = behorighet(atk.personal, t);
  atk.krav(b.signera ?? b.utkast ?? 'skriv_intyg', { resurs: { enhet_id: synlig.enhet_id } });
  atk.logga(b.signera ?? b.utkast, atk.grund(), `intyg:${synlig.id}:fornya`);
  return fornyaIApp(atk.db, atk.personal, synlig.intygs_id);
}

// ---------------------------------------------------------------------------------------------------------------
// Producenten för CertificateStatusUpdateForCare 3.2. Intygsapplikationen anropar den med en händelse, adresserad till
// den vårdenhet som äger intyget. Varje kontroll görs innan något ändras, och ett meddelande som inte går att ta emot
// får ett fel med förklaring och ändrar ingenting. Svaret innehåller inga patientuppgifter.
// ---------------------------------------------------------------------------------------------------------------
const resultat = (kod, resultText = null, errorId = null) => ({ result: { resultCode: kod, resultText, errorId } });

// Runda 16, r1: ett utkast som intygsapplikationen har skapat genom att förnya eller byta ett intyg som journalen har.
// Journalen lägger in det bara när relationen pekar på ett intyg som journalen själv har på samma vårdenhet och för samma
// patient, och när den som skapade det har ett uppdrag på vårdenheten. Ett meddelande kan alltså aldrig lägga in ett
// intyg på en patient som journalen inte redan har ett intyg för på vårdenheten.
function nyttUrRelation(db, m, logiskAdress) {
  const rel = (m.intyg.relation ?? [])[0];
  const typ = rel?.typ?.code;
  if (!rel || !['FRLANG', 'KOPIA', 'ERSATT'].includes(typ) || rel.typ.codeSystem !== KV.relation) return null;
  if (m.handelse?.handelsekod?.code !== 'SKAPAT') return null;
  const gammal = db.query('SELECT * FROM lakarintyg WHERE intygs_id = ?').get(rel['intygs-id']?.extension ?? '');
  if (!gammal) return null;
  const agare = ve(db, gammal.enhet_id);
  if (logiskAdress !== agare.hsa_id || m.intyg.skapadAv?.enhet?.['enhets-id']?.extension !== agare.hsa_id) return null;
  const kod = m.intyg.typ?.code;
  const t = IT.typFor(kod, m.intyg.version);
  if (!t || t.kod !== kod) return null;
  const pers = db.query('SELECT id, enhet_id FROM personal WHERE hsa_id = ? AND aktiv = 1').get(m.intyg.skapadAv?.['personal-id']?.extension ?? '');
  if (!pers || vardenhetFor(db, pers.enhet_id) !== gammal.enhet_id) return null;
  const pid = personId(db.query('SELECT personnummer FROM patienter WHERE id = ?').get(gammal.patient_id) ?? {});
  if (!pid || m.intyg.patient?.['person-id']?.extension !== pid.extension) return null;
  const tid = iso();
  const id = Number(db.query("INSERT INTO lakarintyg (patient_id, enhet_id, typ, version, intygs_id, ref, skapad_av, skapad_tid, status, andrad_tid, relation_typ, relation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'utkast', ?, ?, ?)")
    .run(gammal.patient_id, gammal.enhet_id, kod, t.version, m.intyg['intygs-id'].extension, `VK-INTYG-${randomUUID()}`, pers.id, tid, tid, typ, gammal.id).lastInsertRowid);
  return db.query('SELECT * FROM lakarintyg WHERE id = ?').get(id);
}

// Grunden har redan prövat kuvertet, schemat, den logiska adressen (en vårdenhet i Vårdkällan) och att den anropande
// organisationen är den anslutna intygsapplikationen.
export function taEmotStatus(ctx, { begaran: m, logiskAdress }) {
  const { db } = ctx;
  const intygsId = m.intyg?.['intygs-id']?.extension;
  const kod = m.handelse?.handelsekod?.code;
  const tid = m.handelse?.tidpunkt;
  if (!Object.hasOwn(HANDELSER, kod ?? '')) return resultat('ERROR', `Händelsekoden ${kod ?? ''} finns inte i kodverket för händelser.`, 'VALIDATION_ERROR');
  // Intyget slås upp på intygets id, och referensen och vårdenheten ska stämma. En händelse för ett intyg som journalen
  // inte har skapat avvisas, så att ingen kan lägga in intyg på en patient genom att skicka ett meddelande. Undantaget är
  // ett förnyat intyg, som bara läggs in med relationen till ett intyg som journalen har (nyttUrRelation).
  const rad = db.query('SELECT * FROM lakarintyg WHERE intygs_id = ?').get(intygsId) ?? (m.ref ? null : nyttUrRelation(db, m, logiskAdress));
  if (!rad) return resultat('ERROR', 'Intyget finns inte i journalen.', 'APPLICATION_ERROR');
  if (m.ref && m.ref !== rad.ref) return resultat('ERROR', 'Referensen stämmer inte med intyget.', 'APPLICATION_ERROR');
  const agare = ve(db, rad.enhet_id);
  if (logiskAdress !== agare.hsa_id) return resultat('ERROR', 'Den logiska adressen är inte den vårdenhet som äger intyget.', 'VALIDATION_ERROR');
  if (m.intyg.skapadAv?.enhet?.['enhets-id']?.extension !== agare.hsa_id) return resultat('ERROR', 'Vårdenheten i intyget är inte den som skapade det.', 'APPLICATION_ERROR');
  const pid = personId(db.query('SELECT personnummer FROM patienter WHERE id = ?').get(rad.patient_id) ?? {});
  if (!pid || m.intyg.patient?.['person-id']?.extension !== pid.extension) return resultat('ERROR', 'Patienten i meddelandet är inte intygets patient.', 'APPLICATION_ERROR');
  tillampa(db, rad, { kod, tid, kalla: 'statusuppdatering', ejBesvarade: Number(m.mottagnaFragor?.ejBesvarade ?? 0), signerad: m.intyg.signeringstidpunkt ?? null, skickad: m.intyg.skickatTidpunkt ?? null });
  return resultat('OK');
}

// En händelse ändrar statusen bara framåt, och samma händelse vid samma tid läggs bara in en gång.
function tillampa(db, rad, { kod, tid, kalla, ejBesvarade = null, signerad = null, skickad = null }) {
  const ny = db.query('INSERT OR IGNORE INTO lakarintyg_handelser (intyg_id, patient_id, enhet_id, kod, tid, mottagen_tid, kalla) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(rad.id, rad.patient_id, rad.enhet_id, kod, tid, iso(), kalla).changes > 0;
  const mal = HANDELSER[kod].status;
  const nu = db.query('SELECT * FROM lakarintyg WHERE id = ?').get(rad.id);
  const status = mal && ORDNING.indexOf(mal) > ORDNING.indexOf(nu.status) ? mal : nu.status;
  db.query(`UPDATE lakarintyg SET status = ?, signerad_tid = coalesce(signerad_tid, ?), skickad_tid = coalesce(skickad_tid, ?),
    fragor_ej_besvarade = coalesce(?, fragor_ej_besvarade), andrad_tid = ? WHERE id = ?`)
    .run(status, signerad || (kod === 'SIGNAT' ? tid : null), skickad || (kod === 'SKICKA' ? tid : null), Number.isFinite(ejBesvarade) ? ejBesvarade : null, iso(), rad.id);
  return ny;
}

// ---------------------------------------------------------------------------------------------------------------
// Avstämningen med ListCertificatesForCareWithQA 3.3: journalen frågar intygsapplikationen efter patientens intyg på
// den egna vårdenheten och lägger in de händelser som aldrig kom fram. Den som är inloggad ser bara resultatet.
// ---------------------------------------------------------------------------------------------------------------
export const listaBegaran = ({ pid, enhetHsa }) => ({ 'person-id': pid, 'enhets-id': [hsa(enhetHsa)] });
export async function avstam(atk, p) {
  atk.krav('las_intyg');
  const db = atk.db;
  const enhet = ve(db, atk.personal.enhet_id);
  const pid = personId(p);
  if (!pid) return { avstamt: 0, text: 'Patienten har inget personnummer eller samordningsnummer, så det finns inga intyg i intygsapplikationen.' };
  let svar;
  try {
    svar = await r3.anropa(db, DEF.lista(), { logiskAdress: LOGISK_ADRESS_INTYGSAPPLIKATION, begaran: listaBegaran({ pid, enhetHsa: enhet.hsa_id }), transport: transportTill(db) });
  } catch (x) {
    if (!(x instanceof r3.RivtaFel)) throw x;
    atk.logga('las_intyg', atk.grund(), 'intyg:avstamning');
    return { avstamt: 0, fel: x.message, text: 'Intygsapplikationen svarade inte. Listan visar det journalen har fått.' };
  }
  let nya = 0;
  for (const item of svar.list?.item ?? []) {
    const intygsId = item.intyg?.['intygs-id']?.extension;
    const rad = intygsId ? db.query('SELECT * FROM lakarintyg WHERE intygs_id = ? AND patient_id = ? AND enhet_id = ?').get(intygsId, p.id, enhet.id) : null;
    if (!rad) continue;
    for (const h of item.handelser?.handelse ?? []) {
      const kod = h.handelsekod?.code;
      if (Object.hasOwn(HANDELSER, kod ?? '') && h.tidpunkt) nya += tillampa(db, rad, { kod, tid: h.tidpunkt, kalla: 'avstamning', ejBesvarade: Number(item.mottagnaFragor?.ejBesvarade ?? 0) }) ? 1 : 0;
    }
  }
  atk.logga('las_intyg', atk.grund(), 'intyg:avstamning');
  return { avstamt: nya, text: nya ? `${nya} ${nya === 1 ? 'händelse' : 'händelser'} som inte hade kommit fram lades in.` : 'Journalen och intygsapplikationen stämmer överens.' };
}

// Transporten till intygsapplikationen. I demon är den simulerad i samma process. Den sätts av
// intygsapplikation-simulerad.js, så att journalens kod inte beror på simuleringen.
let transportTill = () => { throw new r3.RivtaFel('transport', 'Ingen intygsapplikation är ansluten.'); };
export const sattTransport = (fn) => { transportTill = fn; };

// Producenten för statusuppdateringarna, adresserad till vårdenheterna. Den simulerade intygsapplikationen är den enda
// anslutna organisationen.
r3.vardenheter.registrera(DEF.status(), taEmotStatus);
r3.tillat('CertificateStatusUpdateForCare', LOGISK_ADRESS_INTYGSAPPLIKATION, MOTPART);

export { visningsnamn };
