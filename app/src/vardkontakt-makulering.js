// Runda 15, r2, andra omgången (beslut 2026-11-14): makulering av en genomförd vårdkontakt som har registrerats på fel
// patient.
//
// Den som får rätta vårdkontakter (handlingen registrera_vardkontakt på kontaktens vårdenhet) makulerar med en motivering.
// Systemet gör resten:
//   - Med rätt patients person- eller samordningsnummer flyttas kontakten och allt som hör till den (anteckningar med hela
//     rättelsekedjan, diagnoser, mätvärden, ordinationer, remisser, åtgärder, bokningar med betalningar och väntande
//     kallelser, och det som i sin tur pekar på dem) till rätt patient, på samma sätt som när två journaler slås samman
//     (identitet.js): bara patient_id ändras, och skyddet mot ändringar släpper bara igenom just den flytten. Kallelser som
//     redan har skickats ligger kvar, eftersom de faktiskt skickades till den patienten.
//   - Utan rätt patient makuleras kontakten. Det går bara när ingen dokumentation hör till den, eftersom journaluppgifter
//     aldrig förstörs: en anteckning eller diagnos flyttas till rätt journal när patienten är känd. Ett betalt besök
//     återbetalas först i kassan.
//   - På fel patient står kvar att en vårdkontakt makulerades, när, av vem och varför, men ingenting om den andra
//     patienten. Kopplingen mellan de två finns bara i åtkomstloggen, med samma referens på båda patienterna.
//   - En makulerad kontakt ger ingen vårdrelation, och inte heller en flyttad. Engagemangsindex rättas av sig självt för
//     båda patienterna.
//   - Ett vårdtillfälle och en planerad kontakt makuleras inte här: en planerad kontakt avbokas, och ett vårdtillfälle
//     rättas för sig.
import { Fel, iso } from './db.js';
import { loggaRad } from './logg.js';
import { vardenhetFor } from './atkomst.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS vardkontakt_makuleringar (
  id INTEGER PRIMARY KEY, vardkontakt_id INTEGER NOT NULL, patient_id TEXT NOT NULL, enhet_id TEXT NOT NULL, typ TEXT, start TEXT, orsak_kontakt TEXT,
  atgard TEXT NOT NULL CHECK (atgard IN ('flyttad', 'makulerad')), tid TEXT NOT NULL, av TEXT NOT NULL, orsak TEXT NOT NULL CHECK (length(trim(orsak)) >= 10),
  foljde TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS vk_makulering_raderas_ej BEFORE DELETE ON vardkontakt_makuleringar BEGIN SELECT RAISE(ABORT, 'En makulering raderas inte'); END;
CREATE TRIGGER IF NOT EXISTS vk_makulering_andras_ej BEFORE UPDATE OF vardkontakt_id, enhet_id, typ, start, atgard, tid, av, orsak, foljde ON vardkontakt_makuleringar
  BEGIN SELECT RAISE(ABORT, 'En makulering ändras inte'); END;
`;
export const sakra = (db) => db.exec(SCHEMA);

// Tabeller som aldrig flyttas: loggen, identiteten och makuleringen själv.
const UTAN = new Set(['atkomstlogg', 'identiteter', 'sammanslagningar', 'dubblettforslag', 'patienter', 'vardkontakt_makuleringar', 'ei_markerade', 'ei_poster']);
// Ett id-fält som pekar på en tabell: anteckning_id pekar på anteckningar, bokning_id på bokningar.
const tabeller = (db) => db.query("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name);
const kolumner = (db, t) => db.query(`PRAGMA table_info(${t})`).all().map(k => k.name);
function malFor(alla, kol) {
  const p = kol.slice(0, -3);
  return [p, `${p}er`, `${p}ar`, `${p}r`, `${p}n`, `${p}en`, `${p}or`].find(t => alla.includes(t)) ?? null;
}
const BENAMNING = { anteckningar: 'anteckningar', diagnoser: 'diagnoser', matvarden: 'mätvärden', ordinationer: 'ordinationer', remisser: 'remisser', atgarder: 'åtgärder',
  administreringar: 'givna doser', bokningar: 'bokningar', vaccinationer: 'vaccinationer', labb_bestallningar: 'provbeställningar', betalningar: 'betalningar', kallelser: 'kallelser' };
// Det som hör till kontakten: rader med vardkontakt_id och patientens id, och det som i sin tur pekar på dem. Ger en
// Map tabell -> lista med id (eller rowid).
export function tillhor(db, v) {
  const alla = tabeller(db);
  const meta = new Map(alla.filter(t => !UTAN.has(t)).map(t => [t, kolumner(db, t)]).filter(([, k]) => k.includes('patient_id')));
  const idFor = (t) => (meta.get(t).includes('id') ? 'id' : 'rowid');
  const ut = new Map();
  for (const [t, k] of meta) {
    if (t === 'vardkontakter' || !k.includes('vardkontakt_id')) continue;
    const ids = db.query(`SELECT ${idFor(t)} AS id FROM ${t} WHERE vardkontakt_id = ? AND patient_id = ?`).all(v.id, v.patient_id).map(r => r.id);
    if (ids.length) ut.set(t, ids);
  }
  // Det som pekar på det som flyttas, i flera varv, så att en betalning för en bokning eller en kontrasignering av en
  // anteckning följer med. En kallelse som redan har skickats ligger kvar.
  for (let varv = 0; varv < 4; varv++) {
    let ny = false;
    for (const [t, k] of meta) {
      if (t === 'vardkontakter') continue;
      for (const kol of k.filter(x => x.endsWith('_id') && !['patient_id', 'enhet_id', 'vardkontakt_id', 'id'].includes(x))) {
        const mal = malFor(alla, kol);
        if (!mal || mal === t || !ut.has(mal)) continue;
        const malIds = ut.get(mal);
        const extra = t === 'kallelser' ? " AND status <> 'skickad'" : '';
        const ids = db.query(`SELECT ${idFor(t)} AS id FROM ${t} WHERE ${kol} IN (${malIds.map(() => '?').join(', ')}) AND patient_id = ?${extra}`).all(...malIds, v.patient_id).map(r => r.id);
        const fore = new Set(ut.get(t) ?? []);
        const alla2 = [...fore, ...ids.filter(i => !fore.has(i))];
        if (alla2.length > fore.size) { ut.set(t, alla2); ny = true; }
      }
    }
    if (!ny) break;
  }
  return ut;
}
const sammanfattning = (foljer) => [...foljer].map(([t, ids]) => `${ids.length} ${BENAMNING[t] ?? t.replace(/_/g, ' ')}`).join(', ');

// Prövar att kontakten får makuleras av personen. Ger kontakten.
function provaKontakt(atk, v) {
  atk.krav('registrera_vardkontakt', { resurs: { enhet_id: v.enhet_id }, beskrivning: `vardkontakt:${v.id}:makulera` });
  if (vardenhetFor(atk.db, v.enhet_id) !== vardenhetFor(atk.db, atk.personal.enhet_id)) throw new Fel(403, 'Bara vårdenheten som registrerade vårdkontakten kan makulera den.', 'nekad');
  if (v.kalla !== 'vardkallan') throw new Fel(409, 'Vårdkontakten kommer från ett annat system och rättas där.', 'ogiltig');
  if (v.vardtillfalle_id || v.typ === 'slutenvard') throw new Fel(409, 'Vårdkontakten hör till ett vårdtillfälle, som rättas för sig. Den makuleras inte här.', 'ogiltig');
  if (v.planerad && !v.ankomst) throw new Fel(409, 'Vårdkontakten är planerad och har inte genomförts. Avboka besöket i stället.', 'ogiltig');
}

// GET: vad som följer med, så att personen ser det innan något görs.
export function forhandsvisa(atk, v) {
  provaKontakt(atk, v);
  const foljer = tillhor(atk.db, v);
  atk.logga('registrera_vardkontakt', atk.grund(), `vardkontakt:${v.id}:makulering-forhandsvisning`);
  return {
    vardkontakt: { id: v.id, start: v.start, orsak: v.orsak }, foljer: [...foljer].map(([t, ids]) => ({ tabell: t, text: BENAMNING[t] ?? t.replace(/_/g, ' '), antal: ids.length })),
    kanMakuleras: !harDokumentation(foljer),
    text: foljer.size ? `Det här följer med till rätt patient: ${sammanfattning(foljer)}.` : 'Inga uppgifter hör till vårdkontakten.',
    utanPatientText: harDokumentation(foljer) ? 'Vårdkontakten har dokumentation, som aldrig förstörs. Ange rätt patient, så flyttas den dit.' : 'Utan rätt patient makuleras vårdkontakten. Den finns kvar som makulerad med din motivering.',
  };
}
const DOKUMENTATION_UTAN = new Set(['bokningar', 'kallelser']);
const harDokumentation = (foljer) => [...foljer.keys()].some(t => !DOKUMENTATION_UTAN.has(t));

// Flyttar raderna till rätt patient på samma sätt som en sammanslagning: flaggan sammanslagning_pagar släpper igenom
// patient_id i triggrar som känner till den, och andra triggrar som skyddar mot ändringar tas bort under flytten och
// läggs tillbaka med exakt samma definition i samma transaktion.
function flytta(db, tabell, ids, fran, till) {
  const har = kolumner(db, tabell).includes('id');
  const skydd = db.query("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ? AND sql LIKE '%UPDATE%' AND sql NOT LIKE '%sammanslagning_pagar%'").all(tabell);
  for (const x of skydd) db.exec(`DROP TRIGGER "${x.name}"`);
  try {
    const q = db.query(`UPDATE ${tabell} SET patient_id = ? WHERE ${har ? 'id' : 'rowid'} = ? AND patient_id = ?`);
    for (const id of ids) q.run(till, id, fran);
  } finally {
    for (const x of skydd) db.exec(x.sql);
  }
}

// Säkerhetsgranskningen av andra omgången: rätt patient prövas i behörighetsmotorn innan något ändras, och alla nummer
// som inte kan användas ger exakt samma svar (okänt nummer, samma patient, en sammanslagen journal, en patient som avled
// före besöket, en patient som personen inte får registrera en vårdkontakt på vid vårdenheten, och skyddad identitet
// utan aktivt val att visa identiteten), så att rutten inte kan användas för att pröva om ett nummer finns. Försöken
// har ett tak per person och per sandlåda, som fullmakterna (ombud.js), och räknas ur åtkomstloggen.
//
// Den strängaste av de två reglerna gäller: flytten är en del av identitetshanteringen och kräver vårdadministratörens
// handling för sammanslagning (sla_samman), och personen ska få registrera en vårdkontakt på rätt patient vid kontaktens
// vårdenhet, med samma prövning som för en ny kontakt. Flytten skapar aldrig en vårdrelation: den flyttade kontakten ger
// ingen vårdrelation hos rätt patient, så att en registrering aldrig ger åtkomst.
export const MAX_FORSOK = 10;
export const MAX_FORSOK_SANDLADA = 30;
export const EJ_ANVANDBAR = 'Vårdkontakten kan inte flyttas till den journalen. Kontrollera numret, eller registrera patienten och vårdrelationen först.';
const NEKAD_RESURS = 'makulering:vardkontakt:nekad';
function rattPatient(atk, nummer, v, valFor) {
  const db = atk.db;
  const { kanRoll, Atkomst } = require('./atkomst.js');
  if (!kanRoll(atk.personal, 'sla_samman')) throw new Fel(403, 'Bara vårdadministratören flyttar en vårdkontakt till en annan patient, som när två journaler slås samman.', 'nekad');
  const misslyckade = (villkor, ...arg) => db.query(`SELECT count(*) AS n FROM atkomstlogg WHERE resurs = ? AND resultat = 'nekad' ${villkor}`).get(NEKAD_RESURS, ...arg).n;
  if (misslyckade('AND personal_id = ?', atk.personal.id) >= MAX_FORSOK || misslyckade('') >= MAX_FORSOK_SANDLADA) {
    throw new Fel(429, 'Du har gjort många försök att flytta vårdkontakter till nummer som inte kan användas. Fler försök stoppas. Kontakta systemförvaltaren.', 'for_manga');
  }
  const fel = () => {
    loggaRad(db, { personal_id: atk.personal.id, enhet_id: atk.personal.enhet_id, patient_id: v.patient_id, handling: 'registrera_vardkontakt', resurs: NEKAD_RESURS, grund: 'nekad', resultat: 'nekad' });
    return new Fel(404, EJ_ANVANDBAR, 'saknas', { falt: ['rattPatient'] });
  };
  if (typeof nummer !== 'string' || nummer.length > 20) throw fel();
  const { tolka, hittaPaIdentitet } = require('./identitet.js');
  const t = tolka(nummer);
  if (!t?.ok || !['personnummer', 'samordningsnummer', 'reservnummer'].includes(t.typ)) throw fel();
  const till = hittaPaIdentitet(db, t)?.patientId;
  if (!till || till === v.patient_id) throw fel();
  const p = db.query('SELECT * FROM patienter WHERE id = ?').get(till);
  if (!p || p.sammanslagen_till) throw fel();
  const avliden = require('./avliden.js').avlidenFor(db, till);
  if (avliden && avliden.datum < String(v.start).slice(0, 10)) throw fel();
  const val = valFor(till) ?? {};
  const a = new Atkomst(db, atk.personal, till, val, 'registrera_vardkontakt');
  if (!a.prova('registrera_vardkontakt', { enhet_id: v.enhet_id }).tillaten) throw fel();
  if (p.skyddad && !(val.visa_identitet && kanRoll(atk.personal, 'visa_identitet'))) throw fel();
  return till;
}

// POST: makulerar kontakten med motivering, och flyttar det som hör till den när rätt patient anges.
// body: { orsak, rattPatient? }
export function makulera(atk, v, body = {}, { nu = new Date(), valFor = () => ({}) } = {}) {
  const db = atk.db;
  sakra(db);
  provaKontakt(atk, v);
  const orsak = typeof body.orsak === 'string' ? body.orsak.trim().slice(0, 500) : '';
  if (orsak.length < 10) throw new Fel(400, 'Skriv varför vårdkontakten makuleras, med minst tio tecken. Motiveringen står kvar i journalen.', 'ogiltig', { falt: ['orsak'] });
  const till = body.rattPatient ? rattPatient(atk, body.rattPatient, v, valFor) : null;
  const foljer = tillhor(db, v);
  if (!till && harDokumentation(foljer)) throw new Fel(409, `Vårdkontakten har dokumentation (${sammanfattning(new Map([...foljer].filter(([t]) => !DOKUMENTATION_UTAN.has(t))))}), som aldrig förstörs. Ange rätt patient, så flyttas den dit.`, 'ogiltig', { falt: ['rattPatient'] });
  if (!till && db.query("SELECT 1 FROM sqlite_master WHERE name = 'betalningar'").get() && (foljer.get('bokningar') ?? []).some(b => db.query('SELECT 1 FROM betalningar WHERE bokning_id = ?').get(b))) {
    throw new Fel(409, 'Besöket är betalt. Återbetala avgiften i kassan först, sedan kan vårdkontakten makuleras.', 'ogiltig');
  }
  const fran = v.patient_id;
  const t = iso(nu);
  let id;
  db.transaction(() => {
    id = Number(db.query('INSERT INTO vardkontakt_makuleringar (vardkontakt_id, patient_id, enhet_id, typ, start, orsak_kontakt, atgard, tid, av, orsak, foljde) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(v.id, fran, v.enhet_id, v.typ, v.start, v.orsak ?? null, till ? 'flyttad' : 'makulerad', t, atk.personal.id, orsak, JSON.stringify(Object.fromEntries([...foljer].map(([k, ids]) => [k, ids.length])))).lastInsertRowid);
    if (till) {
      db.query("INSERT OR REPLACE INTO installningar VALUES ('sammanslagning_pagar', ?)").run(`${fran}>${till}`);
      for (const [tabell, ids] of foljer) flytta(db, tabell, ids, fran, till);
      flytta(db, 'vardkontakter', [v.id], fran, till);
      // Hälsoärendet och kedjan av kontakter hör till den första patienten, och den flyttade kontakten ger ingen
      // vårdrelation hos rätt patient.
      db.query('UPDATE vardkontakter SET halsoarende_id = NULL, foregaende_id = NULL, ger_vardrelation = 0 WHERE id = ?').run(v.id);
      db.query("DELETE FROM installningar WHERE nyckel = 'sammanslagning_pagar'").run();
    } else {
      // En bokning för kontakten pekar inte längre på den. Kontakten själv tas bort ur vårdkontakterna och finns kvar som
      // makulerad, så att den aldrig ger vårdrelation eller avgift.
      for (const b of foljer.get('bokningar') ?? []) db.query('UPDATE bokningar SET vardkontakt_id = NULL WHERE id = ?').run(b);
      db.query('DELETE FROM vardkontakter WHERE id = ?').run(v.id);
    }
    loggaRad(db, { tid: t, personal_id: atk.personal.id, enhet_id: atk.personal.enhet_id, patient_id: fran, handling: 'registrera_vardkontakt',
      resurs: `makulering:vardkontakt:${id}:${till ? 'flyttad' : 'makulerad'}`, grund: atk.grund(), syfte: orsak });
    if (till) loggaRad(db, { tid: t, personal_id: atk.personal.id, enhet_id: atk.personal.enhet_id, patient_id: till, handling: 'registrera_vardkontakt',
      resurs: `makulering:vardkontakt:${id}:flyttad-hit`, grund: 'administrativ', syfte: orsak });
  })();
  atk.loggad = true;
  // Engagemangsindex för båda patienterna, eftersom flytten görs med triggrarna för ändringar borttagna.
  try { require('./engagemangsindex.js').markeraPatienter(db, till ? [fran, till] : [fran]); } catch (e) { console.error('Engagemangsindex:', e.message); }
  return {
    makulering: id, atgard: till ? 'flyttad' : 'makulerad',
    text: till ? `Vårdkontakten är makulerad här och flyttad till rätt patient, med ${foljer.size ? sammanfattning(foljer) : 'inga andra uppgifter'}.` : 'Vårdkontakten är makulerad.',
  };
}

// Makulerade vårdkontakter på patienten, för den som får se kontaktens vårdenhet. Ingenting om en annan patient.
export function forPatient(atk) {
  const db = atk.db;
  sakra(db);
  const rader = db.query('SELECT * FROM vardkontakt_makuleringar WHERE patient_id = ? ORDER BY tid DESC').all(atk.patientId);
  return atk.filtrera(rader, 'las_admin').map(r => ({
    id: r.id, start: r.start, orsakKontakt: r.orsak_kontakt, vardenhet: db.query('SELECT id, namn FROM enheter WHERE id = ?').get(r.enhet_id) ?? null,
    tid: r.tid, av: db.query('SELECT id, namn, titel FROM personal WHERE id = ?').get(r.av) ?? null, orsak: r.orsak, atgard: r.atgard,
    text: r.atgard === 'flyttad' ? 'Registrerad på fel patient och flyttad till rätt journal med sina uppgifter.' : 'Registrerad på fel patient och makulerad.',
  }));
}
