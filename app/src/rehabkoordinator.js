// Runda 16: rehabkoordinatorn (beslut från Jonas 2026-11-15). Regionen ska erbjuda koordineringsinsatser till
// sjukskrivna patienter när det behövs för att de ska kunna återgå i arbete (lagen (2019:1297) om koordineringsinsatser
// för sjukskrivna patienter 1 och 3 §§): personligt stöd, intern samordning och samverkan med andra aktörer. Den som
// utför insatserna kallas ofta rehabkoordinator, och i Ineras Rehabstöd är Rehabkoordinator en egen roll.
//
// Som i Rehabstöd (användarmanualen för version 2.0) ser rehabkoordinatorn de pågående sjukfallen på sin vårdenhet,
// utom för patienter med skyddade personuppgifter, och sätter en REKO-status per sjukfall: Ingen, Kontaktad, Aktiv,
// Uppföljning, Avslutad eller Avböjt. Ett nytt sjukfall har statusen Ingen. Läkaren ser statusen men sätter den inte.
// Tabellen är tom tills koordinatorn söker, och varje patient som visas loggas, som i Rehabstöd.
//
// Minsta åtkomst: sjukfallen räknas bara ur sjukintygen på den egna vårdenheten, och rollen ser det Rehabstöd visar i
// sjukfallstabellen (namn, personnummer, ålder, kön, diagnos och sysselsättning i det nuvarande intyget, datum, längd,
// grad och läkaren som signerade) och inget ur journalen. Varje patient prövas med behörighetsmotorn mot den egna
// vårdenheten, som läkarens översikt: utan vårdrelation visas patienten inte.
//
// Samtycket: koordineringsinsatserna ska bara ges om patienten samtycker (3 § andra stycket). Att kontakta patienten och
// erbjuda insatser kräver inget samtycke, men statusarna Aktiv och Uppföljning betyder att insatser ges och kräver att
// koordinatorn bekräftar att patienten har samtyckt, och hur (muntligt eller skriftligt). Samtycket gäller tills
// patienten avböjer eller insatserna avslutas; att börja igen kräver ett nytt samtycke. Uppgifter till
// Försäkringskassan om behov av rehabilitering (4 §) kräver ett eget samtycke och lämnas inte från demon.
import { Fel, iso, idag, addDagar } from './db.js';
import { kanRoll, vardenhetFor, prova, visningsnamn, visningsPnr, alder } from './atkomst.js';
import { loggaRad } from './logg.js';
import * as sjukfall from './sjukfall.js';
import { SYSSELSATTNINGAR } from './sjukfall-intygssvar.js';

// Statusarna i Rehabstöd, i samma ordning. Varje vårdenhet bestämmer vad de betyder lokalt; i demon kräver Aktiv och
// Uppföljning patientens samtycke, eftersom de betyder att koordineringsinsatser ges.
export const STATUSAR = [
  { kod: 'ingen', text: 'Ingen' },
  { kod: 'kontaktad', text: 'Kontaktad' },
  { kod: 'aktiv', text: 'Aktiv', kraverSamtycke: true },
  { kod: 'uppfoljning', text: 'Uppföljning', kraverSamtycke: true },
  { kod: 'avslutad', text: 'Avslutad' },
  { kod: 'avbojt', text: 'Avböjt' },
];
const STATUS = Object.fromEntries(STATUSAR.map(s => [s.kod, s]));
// Statusar som avslutar samtycket: patienten avböjer, insatserna avslutas, eller statusen återställs.
const AVSLUTAR_SAMTYCKE = new Set(['ingen', 'avbojt', 'avslutad']);
export const SAMTYCKE_SATT = { muntligt: 'Muntligt', skriftligt: 'Skriftligt' };
// Ett sjukfall som har tagit slut får status i så många dagar, som de nyligen avslutade sjukfallen i Rehabstöd.
export const NYLIGEN_AVSLUTAT = 14;
export const LAG = 'Koordineringsinsatser ges bara om patienten samtycker (lagen (2019:1297) om koordineringsinsatser för sjukskrivna patienter 3 §).';

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS reko_status (
  id INTEGER PRIMARY KEY, patient_id TEXT NOT NULL, vardenhet_id TEXT NOT NULL, sjukfall_start TEXT NOT NULL, status TEXT NOT NULL,
  samtycke INTEGER NOT NULL DEFAULT 0, samtycke_satt TEXT, personal_id TEXT NOT NULL, personal_namn TEXT NOT NULL, tid TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_reko_status_patient ON reko_status (patient_id, vardenhet_id);
CREATE TRIGGER IF NOT EXISTS reko_status_andras_ej BEFORE UPDATE ON reko_status BEGIN SELECT RAISE(ABORT, 'REKO-historiken ändras inte'); END;
CREATE TRIGGER IF NOT EXISTS reko_status_raderas_ej BEFORE DELETE ON reko_status BEGIN SELECT RAISE(ABORT, 'REKO-historiken raderas inte'); END;
`;
export const sakra = (db) => db.exec(SCHEMA);

// Historiken för ett sjukfall på en vårdenhet, äldst först, med samtycket som det gällde efter varje ändring.
function historikFor(db, patientId, vardenhet, start, slut) {
  sakra(db);
  const rader = db.query('SELECT * FROM reko_status WHERE patient_id = ? AND vardenhet_id = ? AND sjukfall_start >= ? AND sjukfall_start <= ? ORDER BY tid, id')
    .all(patientId, vardenhet, start, slut);
  let galler = false;
  let satt = null;
  return rader.map(r => {
    if (r.samtycke) { galler = true; satt = r.samtycke_satt; }
    if (AVSLUTAR_SAMTYCKE.has(r.status)) { galler = false; satt = null; }
    return {
      kod: r.status, text: STATUS[r.status]?.text ?? r.status, tid: r.tid, sattAv: r.personal_namn,
      samtycke: galler, samtyckeSatt: galler ? satt : null, samtyckeNu: Boolean(r.samtycke),
    };
  });
}

// Statusen för ett sjukfall som läkaren eller koordinatorn ser: den senaste på vårdenheten för sjukfallet mellan start och
// slut, annars Ingen.
export function rekoFor(db, patientId, vardenhet, start, slut) {
  const h = historikFor(db, patientId, vardenhet, start, slut);
  const sista = h.at(-1);
  return sista ? { kod: sista.kod, text: sista.text, tid: sista.tid, sattAv: sista.sattAv, samtycke: sista.samtycke, samtyckeSatt: sista.samtyckeSatt }
    : { kod: 'ingen', text: 'Ingen', tid: null, sattAv: null, samtycke: false, samtyckeSatt: null };
}

const sysselText = (s) => (Object.hasOwn(SYSSELSATTNINGAR, s ?? '') ? SYSSELSATTNINGAR[s].text : null);
const enhetsnamn = (db, id) => db.query('SELECT namn FROM enheter WHERE id = ?').get(id)?.namn ?? null;

// Sjukfallen för en patient ur sjukintygen på vårdenheten. Bara pågående, och om alla = true också nyligen avslutade.
function sjukfallPaEnheten(db, patientId, vardenhet, dag, { alla = false } = {}) {
  sjukfall.sakra(db);
  const rader = db.query("SELECT * FROM sjukskrivningar WHERE patient_id = ? AND status != 'makulerat'").all(patientId)
    .filter(r => vardenhetFor(db, r.enhet_id) === vardenhet);
  if (!rader.length) return [];
  return sjukfall.byggSjukfall(rader.map(sjukfall.somIntyg), { dag })
    .filter(s => s.pagaende || s.kommande || (alla && s.slut >= addDagar(dag, -NYLIGEN_AVSLUTAT)));
}

// En patient som rollen får se: finns, har inte skyddade personuppgifter, och behörighetsmotorn tillåter handlingen mot
// den egna vårdenheten. Annars null.
function patientFor(db, personal, patientId, handling, vardenhet) {
  if (typeof patientId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(patientId)) return null;
  const p = db.query('SELECT * FROM patienter WHERE id = ?').get(patientId);
  if (!p || p.skyddad) return null;
  const pr = prova(db, { personal, patient: patientId, handling, resurs: { enhet_id: vardenhet } });
  return pr.tillaten ? { p, grund: pr.grund } : null;
}

function rad(db, p, s, vardenhet, dag) {
  const nuvarande = s.intyg.find(i => i.id === s.nuvarandeIntygId) ?? s.intyg.at(-1);
  return {
    patientId: p.id, namn: visningsnamn(p), personnummer: visningsPnr(p), alder: alder(p.fodd, dag), kon: p.kon,
    diagnos: s.diagnos ? { kod: sjukfall.medPunkt(s.diagnos.kod), text: s.diagnos.text } : null,
    sysselsattning: sysselText(s.sysselsattning),
    start: s.start, slut: s.slut, dagar: s.dagar, uppskattadDag: s.uppskattadDag, aktuellGrad: s.aktuellGrad, pagaende: Boolean(s.pagaende || s.kommande),
    lakare: nuvarande?.personalNamn ?? null, rehabkedjan: s.rehabkedjan,
    reko: rekoFor(db, p.id, vardenhet, s.start, s.slut),
  };
}

const kravStatus = (kod) => {
  if (kod == null || kod === '' || kod === 'alla') return null;
  if (!Object.hasOwn(STATUS, kod)) throw new Fel(400, 'Okänd REKO-status.', 'valideringsfel');
  return kod;
};

// Sjukfallstabellen. Tom tills koordinatorn söker (q.sok), med filter på REKO-status (q.reko).
export function lista(db, personal, q = {}, dag = idag()) {
  if (!kanRoll(personal, 'sjukfall_reko')) throw new Fel(403, 'Vårdenhetens sjukfall är för rehabkoordinatorn.', 'nekad');
  const filter = kravStatus(q.reko);
  const vardenhet = vardenhetFor(db, personal.enhet_id);
  const bas = {
    vardenhet: enhetsnamn(db, vardenhet), statusar: STATUSAR, filter,
    regel: `Pågående sjukfall på din vårdenhet, ur sjukintygen som har utfärdats här. Patienter med skyddade personuppgifter visas inte. Intyg med högst ${sjukfall.DAGAR_MELLAN} dagars uppehåll hör till samma sjukfall.`,
    samtycke: LAG,
  };
  if (!q.sok) return { ...bas, sjukfall: null };
  sjukfall.sakra(db);
  const patienter = [...new Set(db.query(`SELECT s.patient_id, s.enhet_id FROM sjukskrivningar s JOIN patienter p ON p.id = s.patient_id
    WHERE s.status != 'makulerat' AND coalesce(p.skyddad, 0) = 0`).all().filter(r => vardenhetFor(db, r.enhet_id) === vardenhet).map(r => r.patient_id))];
  const ut = [];
  for (const pid of patienter) {
    const pt = patientFor(db, personal, pid, 'reko_lasa', vardenhet);
    if (!pt) continue;
    const s = sjukfallPaEnheten(db, pid, vardenhet, dag)[0];
    if (!s) continue;
    const r = rad(db, pt.p, s, vardenhet, dag);
    if (filter && r.reko.kod !== filter) continue;
    ut.push(r);
    loggaRad(db, { personal_id: personal.id, enhet_id: personal.enhet_id, patient_id: pid, handling: 'reko_lasa', resurs: 'sjukfall:rehabkoordinator', grund: pt.grund, resultat: 'tillaten' });
  }
  ut.sort((a, b) => (a.slut < b.slut ? -1 : a.slut > b.slut ? 1 : a.namn.localeCompare(b.namn, 'sv')));
  return { ...bas, sjukfall: ut };
}

// En patients sjukfall på vårdenheten med REKO-historiken, för koordinatorn.
export function forPatient(db, personal, patientId, dag = idag()) {
  if (!kanRoll(personal, 'reko_lasa')) throw new Fel(403, 'REKO-statusen är för rehabkoordinatorn.', 'nekad');
  const vardenhet = vardenhetFor(db, personal.enhet_id);
  const pt = patientFor(db, personal, patientId, 'reko_lasa', vardenhet);
  if (!pt) throw new Fel(404, 'Patienten har inget sjukfall på din vårdenhet som du kan se.', 'saknas');
  const lista = sjukfallPaEnheten(db, patientId, vardenhet, dag, { alla: true });
  loggaRad(db, { personal_id: personal.id, enhet_id: personal.enhet_id, patient_id: patientId, handling: 'reko_lasa', resurs: 'reko:patient', grund: pt.grund, resultat: 'tillaten' });
  return {
    statusar: STATUSAR, samtycke: LAG,
    sjukfall: lista.map(s => ({ ...rad(db, pt.p, s, vardenhet, dag), historik: historikFor(db, patientId, vardenhet, s.start, s.slut).reverse() })),
  };
}

// Sätter REKO-status för ett sjukfall: body { start, status, samtycke, samtyckeSatt }.
export function satt(db, personal, patientId, body = {}, dag = idag()) {
  if (!kanRoll(personal, 'reko_satta')) throw new Fel(403, 'REKO-status sätts av rehabkoordinatorn.', 'nekad');
  const kod = typeof body.status === 'string' ? body.status : '';
  if (!Object.hasOwn(STATUS, kod)) throw new Fel(400, 'Välj en REKO-status: Ingen, Kontaktad, Aktiv, Uppföljning, Avslutad eller Avböjt.', 'valideringsfel');
  const vardenhet = vardenhetFor(db, personal.enhet_id);
  const saknas = () => new Fel(404, 'Sjukfallet finns inte på din vårdenhet, eller har tagit slut.', 'saknas');
  if (typeof patientId !== 'string' || !db.query('SELECT 1 FROM patienter WHERE id = ? AND coalesce(skyddad, 0) = 0').get(patientId)) throw saknas();
  const s = sjukfallPaEnheten(db, patientId, vardenhet, dag, { alla: true }).find(x => x.start === body.start);
  if (!s) throw saknas();
  const pt = patientFor(db, personal, patientId, 'reko_satta', vardenhet);
  if (!pt) throw new Fel(403, 'Det finns ingen vårdrelation till patienten på din vårdenhet.', 'nekad');
  const nu = rekoFor(db, patientId, vardenhet, s.start, s.slut);
  let samtycke = 0;
  let samtyckeSatt = null;
  if (STATUS[kod].kraverSamtycke && !nu.samtycke) {
    if (body.samtycke !== true) throw new Fel(400, `${LAG} Bekräfta att patienten har samtyckt till koordineringsinsatser.`, 'valideringsfel');
    if (!Object.hasOwn(SAMTYCKE_SATT, body.samtyckeSatt ?? '')) throw new Fel(400, 'Ange om patienten samtyckte muntligt eller skriftligt.', 'valideringsfel');
    samtycke = 1;
    samtyckeSatt = body.samtyckeSatt;
  }
  sakra(db);
  // Tiden ökar alltid, så att historiken har en entydig ordning också när två ändringar görs inom samma millisekund.
  const sista = db.query('SELECT max(tid) AS t FROM reko_status WHERE patient_id = ?').get(patientId)?.t;
  let tid = iso();
  if (sista && tid <= sista) tid = new Date(Date.parse(sista) + 1).toISOString();
  db.query('INSERT INTO reko_status (patient_id, vardenhet_id, sjukfall_start, status, samtycke, samtycke_satt, personal_id, personal_namn, tid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(patientId, vardenhet, s.start, kod, samtycke, samtyckeSatt, personal.id, personal.namn, tid);
  loggaRad(db, { personal_id: personal.id, enhet_id: personal.enhet_id, patient_id: patientId, handling: 'reko_satta', resurs: `reko:${s.start}:${kod}`, grund: pt.grund, resultat: 'tillaten' });
  return { reko: rekoFor(db, patientId, vardenhet, s.start, s.slut) };
}

// Demon: rehabkoordinatorn har kontaktat patienten med lumbago-ischias på vårdcentralen, så att läkaren ser en status.
export function seedaDemo(db, dag = idag()) {
  sakra(db);
  if (db.query('SELECT 1 FROM reko_status LIMIT 1').get()) return;
  const rk = db.query("SELECT id, namn FROM personal WHERE id = 'rk-vc'").get();
  if (!rk) return;
  const s = sjukfallPaEnheten(db, 'p18', 'vc-tybble', dag)[0];
  if (!s) return;
  db.query("INSERT INTO reko_status (patient_id, vardenhet_id, sjukfall_start, status, samtycke, samtycke_satt, personal_id, personal_namn, tid) VALUES ('p18', 'vc-tybble', ?, 'kontaktad', 0, NULL, ?, ?, ?)")
    .run(s.start, rk.id, rk.namn, `${addDagar(dag, -3)}T09:30:00.000Z`);
}
