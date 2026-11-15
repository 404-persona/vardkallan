// Runda 16, r3: studenter som dokumenterar under handledning (läkarstudent, sjuksköterskestudent och barnmorskestudent).
//
// Det som gäller i författningarna: studenter räknas som hälso- och sjukvårdspersonal när de medverkar i vården
// (patientsäkerhetslagen 1 kap. 4 §), men de är inte skyldiga att föra journal (patientdatalagen 3 kap. 3 §), och
// journalen ska visa vem som har gjort varje anteckning (3 kap. 6 §). Studenter får inte ordinera läkemedel
// (HSLF-FS 2017:37 5 kap. 2 till 5 §§) och får bara administrera läkemedel under tillsyn (7 kap. 7 §). Hur en students
// anteckning ska hanteras är vårdgivarens rutin (HSLF-FS 2016:40 6 kap. 4 och 5 §§). Vårdkällans rutin är:
//
// - Handledaren registrerar handledningen för en student på sin egen vårdenhet, med en tid som systemet föreslår.
// - Studenten läser och skriver bara under en pågående handledning, och bara på handledarens vårdenhet
//   (atkomst.js aktivHandledning, som prövas i varje anrop). Byter handledaren vårdenhet, slutar handledaren eller går
//   tiden ut, stängs åtkomsten direkt.
// - Studenten skriver anteckningar med de mallar som yrket har och signerar dem i sitt eget namn, så att det syns vem som
//   skrev. Systemet skickar varje signerad anteckning till handledaren för kontrasignering, och anteckningen är märkt
//   med handledaren och om den är kontrasignerad.
// - Studenten ordinerar aldrig, ger aldrig läkemedel, signerar aldrig intyg och har ingen nödåtkomst. Rollerna saknar
//   de handlingarna i atkomst.js.
import { Fel, iso, datumAv, addDagar } from './db.js';
import { kanRoll, vardenhetFor, aktivHandledning, STUDENTER } from './atkomst.js';
import { loggaRad } from './logg.js';

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS handledningar (
  id INTEGER PRIMARY KEY, student_id TEXT NOT NULL, handledare_id TEXT NOT NULL, enhet_id TEXT NOT NULL,
  fran TEXT NOT NULL, till TEXT NOT NULL, registrerad_av TEXT NOT NULL, registrerad TEXT NOT NULL, avslutad TEXT, avslutad_av TEXT
);
CREATE INDEX IF NOT EXISTS ix_handledning_student ON handledningar (student_id);
CREATE TABLE IF NOT EXISTS handledda_anteckningar (
  anteckning_id INTEGER PRIMARY KEY, student_id TEXT NOT NULL, handledare_id TEXT NOT NULL, handledning_id INTEGER NOT NULL,
  kontrasignering_id INTEGER, tid TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS handledda_anteckningar_andras_ej BEFORE UPDATE ON handledda_anteckningar
  BEGIN SELECT RAISE(ABORT, 'Uppgiften om vem som handledde en anteckning ändras inte'); END;
CREATE TRIGGER IF NOT EXISTS handledningar_andras_ej BEFORE UPDATE ON handledningar
  WHEN NEW.student_id IS NOT OLD.student_id OR NEW.handledare_id IS NOT OLD.handledare_id OR NEW.enhet_id IS NOT OLD.enhet_id
    OR NEW.fran IS NOT OLD.fran OR NEW.registrerad_av IS NOT OLD.registrerad_av OR NEW.registrerad IS NOT OLD.registrerad
    OR (OLD.avslutad IS NOT NULL AND (NEW.avslutad IS NOT OLD.avslutad OR NEW.till IS NOT OLD.till))
  BEGIN SELECT RAISE(ABORT, 'En handledning ändras inte, den avslutas'); END;
`;
export function sakra(db) { db.exec(SCHEMA); }

// Den verksamhetsförlagda utbildningen är i demon åtta veckor, och en handledning registreras för högst ett halvår.
export const STANDARD_DAGAR = 56;
export const MAX_DAGAR = 183;

// Demons handledningar: varje student har en handledare på sin vårdenhet, från två veckor före seedens dag.
export const SEED = [
  { student: 'stud-lak', handledare: 'lak-kard' },
  { student: 'stud-ssk', handledare: 'ssk-kard' },
  { student: 'stud-bm', handledare: 'bm-uso' },
];
export function seeda(db, bas = new Date()) {
  sakra(db);
  const idag = datumAv(bas);
  const pers = (id) => db.query('SELECT * FROM personal WHERE id = ?').get(id);
  for (const s of SEED) {
    const st = pers(s.student), hl = pers(s.handledare);
    if (!st || !hl || db.query('SELECT 1 FROM handledningar WHERE student_id = ?').get(st.id)) continue;
    db.query('INSERT INTO handledningar (student_id, handledare_id, enhet_id, fran, till, registrerad_av, registrerad) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(st.id, hl.id, vardenhetFor(db, hl.enhet_id), addDagar(idag, -14), addDagar(idag, STANDARD_DAGAR - 14), hl.id, iso(bas));
  }
}

const kort = (db, id) => {
  const p = id && db.query('SELECT id, namn, titel, yrke FROM personal WHERE id = ?').get(id);
  return p ? { id: p.id, namn: p.namn, titel: p.titel } : null;
};
const handledningUt = (db, h) => ({
  id: h.id, student: kort(db, h.student_id), handledare: kort(db, h.handledare_id), fran: h.fran, till: h.till, avslutad: h.avslutad ?? null,
});
const logga = (db, personal, resurs, nu) => loggaRad(db, { personal_id: personal.id, enhet_id: personal.enhet_id, patient_id: null, handling: 'handleda', resurs, grund: 'administrativ', tid: iso(nu) });

// Till sessionen och menyn: för en student handledningen just nu, för en handledare om det finns studenter på
// vårdenheten som yrket handleder. Annars null, så att menyn inte visar Handledning för den som inte behöver den.
export function session(db, personal, nu = new Date()) {
  if (!personal) return null;
  if (Object.hasOwn(STUDENTER, personal.yrke)) {
    const h = aktivHandledning(db, personal, nu);
    return { student: true, pagar: Boolean(h), handledare: h ? kort(db, h.handledare_id) : null, till: h?.till ?? null };
  }
  if (!kanRoll(personal, 'handleda')) return null;
  let pa;
  try { pa = studenterPa(db, personal, nu); } catch { return null; }
  return pa.length ? { student: false, studenter: pa.filter(x => x.aktiv?.handledare_id === personal.id).length } : null;
}

// Det en student når utan pågående handledning: sessionen, inloggningen, övningarna, nyheterna, handledningen och de
// sidor som inte rör patienter. Allt annat stoppar servern före rutten (server.js).
export const UTAN_HANDLEDNING_TILLATET = /^\/api\/(session|login|logout|inloggning|flerfaktor|utbildning|nyheter|handledning|krav|moduler|drift|health|tillganglighet|demo\/personal|demo\/invanare|synpunkter?|testa|reset)(\/|$)/;
export function stoppasUtanHandledning(db, personal, vag) {
  if (!personal || !Object.hasOwn(STUDENTER, personal.yrke ?? '')) return false;
  if (UTAN_HANDLEDNING_TILLATET.test(vag)) return false;
  return !aktivHandledning(db, personal);
}

// Studenter på vårdenheten som personen får handleda, och deras handledning just nu.
function studenterPa(db, handledare, nu) {
  const ve = vardenhetFor(db, handledare.enhet_id);
  const yrken = Object.entries(STUDENTER).filter(([, s]) => s.handledare.includes(handledare.yrke)).map(([y]) => y);
  if (!yrken.length) return [];
  return db.query(`SELECT * FROM personal WHERE aktiv = 1 AND yrke IN (${yrken.map(() => '?').join(', ')}) ORDER BY namn`).all(...yrken)
    .filter(p => vardenhetFor(db, p.enhet_id) === ve)
    .map(p => ({ student: p, aktiv: aktivHandledning(db, p, nu) }));
}

// Översikten: studenten ser sin handledare och tiden, handledaren sina studenter och vilka studenter på vårdenheten som
// saknar handledare. Inga patientuppgifter.
export function oversikt(db, personal, nu = new Date()) {
  sakra(db);
  if (Object.hasOwn(STUDENTER, personal.yrke)) {
    const h = aktivHandledning(db, personal, nu);
    const vantar = h ? db.query("SELECT count(*) AS n FROM handledda_anteckningar x JOIN kontrasigneringar k ON k.id = x.kontrasignering_id WHERE x.student_id = ? AND k.status = 'begard'").get(personal.id).n : 0;
    return {
      roll: 'student', handledning: h ? handledningUt(db, h) : null, vantarKontrasignering: vantar,
      skal: h ? `Du dokumenterar under handledning av ${h.handledare_namn} till och med ${h.till}. Det du signerar går till handledaren för kontrasignering.` : 'Du har ingen pågående handledning. Be din handledare registrera handledningen.',
    };
  }
  if (!kanRoll(personal, 'handleda')) throw new Fel(403, 'Din yrkesroll handleder inte studenter.', 'nekad');
  const pa = studenterPa(db, personal, nu);
  return {
    roll: 'handledare',
    studenter: pa.filter(x => x.aktiv?.handledare_id === personal.id).map(x => handledningUt(db, x.aktiv)),
    utanHandledare: pa.filter(x => !x.aktiv).map(x => kort(db, x.student.id)),
    forslagTill: addDagar(datumAv(nu), STANDARD_DAGAR),
  };
}

// Handledaren registrerar en handledning för en student på sin egen vårdenhet. Tiden börjar i dag, och slutet föreslås
// av systemet. Samma neutrala svar för en student som inte finns, inte är aktiv eller arbetar på en annan vårdenhet.
export function registrera(db, personal, { studentId, till } = {}, nu = new Date()) {
  sakra(db);
  if (!kanRoll(personal, 'handleda')) throw new Fel(403, 'Din yrkesroll handleder inte studenter.', 'nekad');
  const st = typeof studentId === 'string' ? db.query('SELECT * FROM personal WHERE id = ? AND aktiv = 1').get(studentId) : null;
  if (!st || !Object.hasOwn(STUDENTER, st.yrke) || vardenhetFor(db, st.enhet_id) !== vardenhetFor(db, personal.enhet_id)) {
    throw new Fel(400, 'Välj en student på din vårdenhet.', 'ogiltig', { falt: ['studentId'] });
  }
  if (!STUDENTER[st.yrke].handledare.includes(personal.yrke)) {
    throw new Fel(400, `En ${STUDENTER[st.yrke].namn.toLowerCase()} handleds av ${STUDENTER[st.yrke].handledare.map(y => ({ lakare: 'en läkare', sjukskoterska: 'en sjuksköterska', barnmorska: 'en barnmorska' })[y]).join(' eller ')}.`, 'ogiltig', { falt: ['studentId'] });
  }
  const fran = datumAv(nu);
  const slut = till === undefined || till === null || till === '' ? addDagar(fran, STANDARD_DAGAR) : till;
  if (typeof slut !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(slut) || slut < fran || slut > addDagar(fran, MAX_DAGAR)) {
    throw new Fel(400, `Handledningen slutar tidigast i dag och senast ${addDagar(fran, MAX_DAGAR)}, ett halvår fram.`, 'ogiltig', { falt: ['till'] });
  }
  const pagar = aktivHandledning(db, st, nu);
  if (pagar) throw new Fel(409, `${st.namn} har redan en pågående handledning till och med ${pagar.till}. Den avslutas först.`, 'ogiltig');
  const r = db.query('INSERT INTO handledningar (student_id, handledare_id, enhet_id, fran, till, registrerad_av, registrerad) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(st.id, personal.id, vardenhetFor(db, personal.enhet_id), fran, slut, personal.id, iso(nu));
  logga(db, personal, `handledning:${r.lastInsertRowid}`, nu);
  return handledningUt(db, db.query('SELECT * FROM handledningar WHERE id = ?').get(r.lastInsertRowid));
}

// Handledaren avslutar sin handledning. Studenten har åtkomst till journalen till och med att handledningen avslutas.
export function avsluta(db, personal, id, nu = new Date()) {
  sakra(db);
  const h = /^\d{1,9}$/.test(String(id)) ? db.query('SELECT * FROM handledningar WHERE id = ?').get(Number(id)) : null;
  if (!h || h.handledare_id !== personal.id || !kanRoll(personal, 'handleda')) throw new Fel(404, 'Handledningen finns inte bland dina.', 'saknas');
  if (h.avslutad) throw new Fel(400, 'Handledningen är redan avslutad.', 'ogiltig');
  db.query('UPDATE handledningar SET avslutad = ?, avslutad_av = ? WHERE id = ?').run(iso(nu), personal.id, h.id);
  logga(db, personal, `handledning:${h.id}:avslutad`, nu);
  return handledningUt(db, db.query('SELECT * FROM handledningar WHERE id = ?').get(h.id));
}

// När studenten signerar en anteckning (journal.signera): anteckningen knyts till handledningen och systemet ber
// handledaren kontrasignera den. Utan pågående handledning signeras inget.
export function vidSignering(atk, a, t = iso()) {
  if (!Object.hasOwn(STUDENTER, atk.personal.yrke ?? '')) return null;
  const db = atk.db;
  sakra(db);
  const h = aktivHandledning(db, atk.personal);
  if (!h) throw new Fel(403, 'Du har ingen pågående handledning och kan inte signera.', 'nekad');
  const k = db.query('INSERT INTO kontrasigneringar (patient_id, typ, post_id, enhet_id, begard_av, begard, mottagare_id, kommentar) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(a.patient_id, 'anteckning', a.id, a.enhet_id, atk.personal.id, t, h.handledare_id, `Skriven av ${STUDENTER[atk.personal.yrke].namn.toLowerCase()} under din handledning.`);
  db.query('INSERT INTO handledda_anteckningar (anteckning_id, student_id, handledare_id, handledning_id, kontrasignering_id, tid) VALUES (?, ?, ?, ?, ?, ?)')
    .run(a.id, atk.personal.id, h.handledare_id, h.id, Number(k.lastInsertRowid), t);
  atk.logga('skriv_handledd', atk.grund(), `anteckning:${a.id}:kontrasignering`, 'tillaten', `Till handledaren ${h.handledare_namn}`);
  return { handledare: h.handledare_id, kontrasignering: Number(k.lastInsertRowid) };
}

// Uppgiften om handledningen för en anteckning, eller null. Följer med anteckningen (journal.anteckningUt).
export function forAnteckning(db, anteckningId) {
  let x;
  try { x = db.query('SELECT * FROM handledda_anteckningar WHERE anteckning_id = ?').get(anteckningId); } catch { return null; }
  if (!x) return null;
  const k = x.kontrasignering_id ? db.query('SELECT status, kontrasignerad FROM kontrasigneringar WHERE id = ?').get(x.kontrasignering_id) : null;
  return { student: kort(db, x.student_id), handledare: kort(db, x.handledare_id), kontrasignerad: k?.status === 'kontrasignerad' ? k.kontrasignerad : null };
}

// Om en begäran om kontrasignering är systemets begäran till handledaren för en students anteckning. Handledaren
// kontrasignerar den med handlingen handleda, också när yrket inte har kontrasignera.
export function arHandledd(db, k) {
  if (!k || k.typ !== 'anteckning') return false;
  try { return Boolean(db.query('SELECT 1 FROM handledda_anteckningar WHERE anteckning_id = ? AND kontrasignering_id = ? AND handledare_id = ?').get(k.post_id, k.id, k.mottagare_id)); } catch { return false; }
}
