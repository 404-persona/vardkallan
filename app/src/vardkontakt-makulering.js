// Runda 15, r2, andra omgången (beslut 2026-11-14): makulering av en genomförd vårdkontakt som har registrerats på fel
// patient. Tredje omgången (beslut 2026-11-14): samma rättelse för ett vårdtillfälle, och fyra ögon när rätt patient
// saknar vårdrelation till vårdenheten.
//
// Den som får rätta vårdkontakter (handlingen registrera_vardkontakt på kontaktens vårdenhet) makulerar med en motivering.
// Systemet gör resten:
//   - Med rätt patients person- eller samordningsnummer flyttas kontakten och allt som hör till den (anteckningar med hela
//     rättelsekedjan, diagnoser, mätvärden, ordinationer, remisser, åtgärder, bokningar med betalningar och väntande
//     kallelser, och det som i sin tur pekar på dem) till rätt patient, på samma sätt som när två journaler slås samman
//     (identitet.js): bara patient_id ändras, och skyddet mot ändringar släpper bara igenom just den flytten. Kallelser som
//     redan har skickats ligger kvar, eftersom de faktiskt skickades till den patienten.
//   - Ett vårdtillfälle flyttas på samma sätt med sina vårdkontakter och allt som hör till dem och till vårdtillfället.
//     Ett vårdtillfälle raderas aldrig, så det makuleras inte utan rätt patient.
//   - Utan rätt patient makuleras en vårdkontakt. Det går bara när ingen dokumentation hör till den, eftersom
//     journaluppgifter aldrig förstörs: en anteckning eller diagnos flyttas till rätt journal när patienten är känd. Ett
//     betalt besök återbetalas först i kassan.
//   - På fel patient står kvar att en vårdkontakt eller ett vårdtillfälle makulerades, när, av vem och varför, men
//     ingenting om den andra patienten. Kopplingen mellan de två finns bara i åtkomstloggen, med samma referens på båda.
//   - Har rätt patient redan vårdrelation till vårdenheten flyttas uppgifterna direkt, och den flyttade kontakten ger ingen
//     vårdrelation. Annars blir flytten ett förslag som en andra behörig person godkänner i sin egen inloggning (fyra
//     ögon, som i kontrasignering.js och konfiguration.js): vårdenhetens verksamhetschef eller en annan vårdadministratör
//     på vårdenheten. Förslaget ger ingen åtkomst till rätt patient, och svaret är detsamma för alla nummer som inte kan
//     flyttas direkt, så att det inte röjer något om numret. Först vid godkännandet flyttas uppgifterna, och då får rätt
//     patient den vårdrelation som kontakten hade gett om den hade registrerats rätt från början, aldrig mer.
//   - Engagemangsindex rättas av sig självt för båda patienterna.
import { Fel, iso } from './db.js';
import { loggaRad } from './logg.js';
import { vardenhetFor, kanRoll, visningsnamn, visningsPnr, Atkomst } from './atkomst.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS vardkontakt_makuleringar (
  id INTEGER PRIMARY KEY, slag TEXT NOT NULL DEFAULT 'vardkontakt' CHECK (slag IN ('vardkontakt', 'vardtillfalle')),
  vardkontakt_id INTEGER, vardtillfalle_id INTEGER, patient_id TEXT NOT NULL, enhet_id TEXT NOT NULL, typ TEXT, start TEXT, orsak_kontakt TEXT,
  atgard TEXT NOT NULL CHECK (atgard IN ('flyttad', 'makulerad')), tid TEXT NOT NULL, av TEXT NOT NULL, godkand_av TEXT, forslag_id INTEGER,
  orsak TEXT NOT NULL CHECK (length(trim(orsak)) >= 10), foljde TEXT NOT NULL, CHECK (vardkontakt_id IS NOT NULL OR vardtillfalle_id IS NOT NULL));
CREATE TRIGGER IF NOT EXISTS vk_makulering_raderas_ej BEFORE DELETE ON vardkontakt_makuleringar BEGIN SELECT RAISE(ABORT, 'En makulering raderas inte'); END;
CREATE TRIGGER IF NOT EXISTS vk_makulering_andras_ej BEFORE UPDATE OF slag, vardkontakt_id, vardtillfalle_id, enhet_id, typ, start, atgard, tid, av, godkand_av, forslag_id, orsak, foljde
  ON vardkontakt_makuleringar BEGIN SELECT RAISE(ABORT, 'En makulering ändras inte'); END;
CREATE TABLE IF NOT EXISTS makulering_forslag (
  id INTEGER PRIMARY KEY, slag TEXT NOT NULL CHECK (slag IN ('vardkontakt', 'vardtillfalle')), objekt_id INTEGER NOT NULL, patient_id TEXT NOT NULL,
  enhet_id TEXT NOT NULL, nummer TEXT NOT NULL, orsak TEXT NOT NULL CHECK (length(trim(orsak)) >= 10), foreslagen_av TEXT NOT NULL, foreslagen TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'vantar' CHECK (status IN ('vantar', 'godkand', 'avslagen', 'aterkallad', 'ej_genomford')),
  beslutad_av TEXT, beslutad TEXT, kommentar TEXT, makulering_id INTEGER);
CREATE UNIQUE INDEX IF NOT EXISTS ux_makulering_forslag_vantar ON makulering_forslag (slag, objekt_id) WHERE status = 'vantar';
CREATE TRIGGER IF NOT EXISTS mk_forslag_raderas_ej BEFORE DELETE ON makulering_forslag BEGIN SELECT RAISE(ABORT, 'Ett förslag om flytt raderas inte'); END;
CREATE TRIGGER IF NOT EXISTS mk_forslag_andras_ej BEFORE UPDATE OF slag, objekt_id, enhet_id, nummer, orsak, foreslagen_av, foreslagen ON makulering_forslag
  BEGIN SELECT RAISE(ABORT, 'Ett förslag om flytt ändras inte'); END;
CREATE TRIGGER IF NOT EXISTS mk_forslag_beslutat BEFORE UPDATE OF status, beslutad_av, beslutad, kommentar, makulering_id ON makulering_forslag WHEN OLD.status <> 'vantar'
  BEGIN SELECT RAISE(ABORT, 'Ett beslutat förslag om flytt ändras inte'); END;
`;
export const sakra = (db) => db.exec(SCHEMA);

const ORD = {
  vardkontakt: { Namn: 'Vårdkontakten', namn: 'vårdkontakten', en: 'en vårdkontakt' },
  vardtillfalle: { Namn: 'Vårdtillfället', namn: 'vårdtillfället', en: 'ett vårdtillfälle' },
};

// Vårdkontakten eller vårdtillfället som ska rättas, med de vårdkontakter som flyttas med.
export function objekt(db, slag, id) {
  const vk = require('./vardkontakt.js');
  if (slag === 'vardkontakt') {
    const v = vk.hamtaKontakt(db, id);
    return { slag, id: v.id, rad: v, patientId: v.patient_id, enhetId: v.enhet_id, start: v.start, typ: v.typ, orsak: v.orsak ?? null, kontakter: [v.id], vardtillfalle: null };
  }
  if (slag !== 'vardtillfalle') throw new Fel(404, 'Det finns inget sådant att rätta.', 'saknas');
  const vt = vk.hamtaVardtillfalle(db, id);
  const kontakter = db.query('SELECT id FROM vardkontakter WHERE vardtillfalle_id = ? AND patient_id = ? ORDER BY id').all(vt.id, vt.patient_id).map(r => r.id);
  return { slag, id: vt.id, rad: vt, patientId: vt.patient_id, enhetId: vt.enhet_id, start: vt.inskriven, typ: 'slutenvard', orsak: vt.orsak ?? null, kontakter, vardtillfalle: vt.id };
}

// Tabeller som aldrig flyttas: loggen, identiteten, makuleringen och förslagen, och vårdtillfället och vårdkontakterna,
// som flyttas för sig.
const UTAN = new Set(['atkomstlogg', 'identiteter', 'sammanslagningar', 'dubblettforslag', 'patienter', 'vardkontakt_makuleringar', 'makulering_forslag',
  'ei_markerade', 'ei_poster', 'vardkontakter', 'vardtillfallen']);
// Ett id-fält som pekar på en tabell: anteckning_id pekar på anteckningar, bokning_id på bokningar.
const tabeller = (db) => db.query("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name);
const kolumner = (db, t) => db.query(`PRAGMA table_info(${t})`).all().map(k => k.name);
function malFor(alla, kol) {
  const p = kol.slice(0, -3);
  return [p, `${p}er`, `${p}ar`, `${p}r`, `${p}n`, `${p}en`, `${p}or`].find(t => alla.includes(t)) ?? null;
}
const BENAMNING = { anteckningar: 'anteckningar', diagnoser: 'diagnoser', matvarden: 'mätvärden', ordinationer: 'ordinationer', remisser: 'remisser', atgarder: 'åtgärder',
  administreringar: 'givna doser', bokningar: 'bokningar', vaccinationer: 'vaccinationer', labb_bestallningar: 'provbeställningar', betalningar: 'betalningar', kallelser: 'kallelser' };
const ph = (lista) => lista.map(() => '?').join(', ');
// Det som hör till kontakten eller vårdtillfället: rader med vardkontakt_id för någon av kontakterna eller med
// vardtillfalle_id för vårdtillfället, med patientens id, och det som i sin tur pekar på dem. Ger en Map tabell -> lista
// med id (eller rowid).
export function tillhor(db, o) {
  const alla = tabeller(db);
  const meta = new Map(alla.filter(t => !UTAN.has(t)).map(t => [t, kolumner(db, t)]).filter(([, k]) => k.includes('patient_id')));
  const idFor = (t) => (meta.get(t).includes('id') ? 'id' : 'rowid');
  const ut = new Map();
  // Säkerhetsgranskningen efter sammanslagningen: varje rad som hittas genom en annan rad får sin förälder, så att
  // synligheten kan följa beroendekedjan (synligt).
  const foraldrar = new Map();
  Object.defineProperty(ut, 'foraldrar', { value: foraldrar, enumerable: false });
  const lagg = (t, ids) => {
    const fore = new Set(ut.get(t) ?? []);
    const nya = ids.filter(i => !fore.has(i));
    if (nya.length) ut.set(t, [...fore, ...nya]);
    return nya.length > 0;
  };
  for (const [t, k] of meta) {
    if (o.kontakter.length && k.includes('vardkontakt_id')) {
      lagg(t, db.query(`SELECT ${idFor(t)} AS id FROM ${t} WHERE vardkontakt_id IN (${ph(o.kontakter)}) AND patient_id = ?`).all(...o.kontakter, o.patientId).map(r => r.id));
    }
    if (o.vardtillfalle && k.includes('vardtillfalle_id')) {
      lagg(t, db.query(`SELECT ${idFor(t)} AS id FROM ${t} WHERE vardtillfalle_id = ? AND patient_id = ?`).all(o.vardtillfalle, o.patientId).map(r => r.id));
    }
  }
  // Det som pekar på det som flyttas, i flera varv, så att en betalning för en bokning eller en kontrasignering av en
  // anteckning följer med. En kallelse som redan har skickats ligger kvar.
  // Säkerhetsgranskningen efter sammanslagningen: rader som pekar med typ och id (en kontrasignering av en anteckning,
  // en makulering av en dos, uppmärksamhetsinformation byggd på en diagnos eller ordination och en återbetalning av en
  // bokning) följer också med, så att inget blir kvar hos fel patient.
  const TYPADE = [['kontrasigneringar', 'typ', 'post_id', { anteckning: 'anteckningar', matvarde: 'matvarden' }],
    ['makuleringar', 'typ', 'post_id', { administrering: 'administreringar', vatskebalans: 'vatskebalans' }],
    ['uppmarksamhet', 'kalla_typ', 'kalla_id', { diagnos: 'diagnoser', ordination: 'ordinationer' }],
    ['aterbetalningar', 'kalla', 'kalla_id', { bokning: 'bokningar' }]];
  for (let varv = 0; varv < 4; varv++) {
    let ny = false;
    for (const [t, typKol, idKol, typer] of TYPADE) {
      const k = meta.get(t);
      if (!k || !k.includes(typKol) || !k.includes(idKol)) continue;
      for (const [typ, mal] of Object.entries(typer)) {
        if (!ut.has(mal)) continue;
        const malIds = ut.get(mal);
        const rader = db.query(`SELECT ${idFor(t)} AS id, ${idKol} AS foralder FROM ${t} WHERE ${typKol} = ? AND ${idKol} IN (${ph(malIds)}) AND patient_id = ?`).all(typ, ...malIds, o.patientId);
        for (const r of rader) {
          const nyckel = `${t}:${r.id}`;
          if (!foraldrar.has(nyckel)) foraldrar.set(nyckel, new Set());
          foraldrar.get(nyckel).add(`${mal}:${r.foralder}`);
        }
        if (lagg(t, rader.map(r => r.id))) ny = true;
      }
    }
    for (const [t, k] of meta) {
      for (const kol of k.filter(x => x.endsWith('_id') && !['patient_id', 'enhet_id', 'vardkontakt_id', 'vardtillfalle_id', 'id'].includes(x))) {
        const mal = malFor(alla, kol);
        if (!mal || mal === t || !ut.has(mal)) continue;
        const malIds = ut.get(mal);
        const extra = t === 'kallelser' ? " AND status <> 'skickad'" : '';
        const rader = db.query(`SELECT ${idFor(t)} AS id, ${kol} AS foralder FROM ${t} WHERE ${kol} IN (${ph(malIds)}) AND patient_id = ?${extra}`).all(...malIds, o.patientId);
        for (const r of rader) {
          const k = `${t}:${r.id}`;
          if (!foraldrar.has(k)) foraldrar.set(k, new Set());
          foraldrar.get(k).add(`${mal}:${r.foralder}`);
        }
        if (lagg(t, rader.map(r => r.id))) ny = true;
      }
    }
    if (!ny) break;
  }
  return ut;
}
// Säkerhetsgranskningen efter sammanslagningen: det som visas för användaren räknas bara på rader som användaren får se.
// En rad från en vårdenhet som användaren inte får se (till exempel en spärrad) flyttas ändå med, men räknas inte och
// nämns inte, så att antalen aldrig röjer att den finns.
// Synligheten följer beroendekedjan: en rad är synlig bara om dess egna vårdenheter får ses och alla rader den hittades
// genom är synliga, så att en rad utan vårdenhet som hör till en dold rad inte heller räknas.
export function synligt(atk, foljer) {
  const db = atk.db;
  const foraldrar = foljer.foraldrar ?? new Map();
  const egen = new Map();
  for (const [t, ids] of foljer) {
    const kol = kolumner(db, t).filter(k => k.endsWith('enhet_id'));
    const har = kolumner(db, t).includes('id') ? 'id' : 'rowid';
    const rader = kol.length && ids.length ? db.query(`SELECT ${har} AS id, ${kol.join(', ')} FROM ${t} WHERE ${har} IN (${ph(ids)})`).all(...ids) : ids.map(id => ({ id }));
    for (const r of rader) egen.set(`${t}:${r.id}`, kol.every(k => !r[k] || r[k] === 'extern' || atk.prova('registrera_vardkontakt', { enhet_id: r[k] }).tillaten));
  }
  const minne = new Map();
  const syns = (k) => {
    if (minne.has(k)) return minne.get(k);
    minne.set(k, false);
    const v = (egen.get(k) ?? false) && [...(foraldrar.get(k) ?? [])].every(syns);
    minne.set(k, v);
    return v;
  };
  const ut = new Map();
  for (const [t, ids] of foljer) {
    const kvar = ids.filter(id => syns(`${t}:${id}`));
    if (kvar.length) ut.set(t, kvar);
  }
  return ut;
}
// Säkerhetsgranskningen efter sammanslagningen: när något hindrar en makulering eller flytt får användaren samma svar
// oavsett om det är något som användaren ser eller något dolt, utan antal, och systemförvaltningen får samma meddelande.
export const HINDRAD = 'Vårdkontakten har dokumentation, som aldrig förstörs, så den kan inte makuleras utan rätt patient. Ange rätt patient, så flyttas den dit. Systemförvaltningen har fått ett meddelande om något annat behöver rättas.';
function meddelaForvaltningen(atk, o) {
  require('./sakerhetslogg.js').logga(atk.db, { typ: 'flytt_hindrad', personal_id: atk.personal.id, enhet_id: atk.personal.enhet_id, metod: 'POST', vag: `/api/${o.slag}/:id/makulera`, status: 409,
    beskrivning: `En makulering eller flytt av ${o.slag === 'vardtillfalle' ? 'vårdtillfälle' : 'vårdkontakt'} ${o.id} stoppades och kan behöva rättas av systemförvaltningen.` });
}
const sammanfattning = (foljer) => [...foljer].map(([t, ids]) => `${ids.length} ${BENAMNING[t] ?? t.replace(/_/g, ' ')}`).join(', ');

// Prövar att kontakten eller vårdtillfället får makuleras av personen.
function provaObjekt(atk, o) {
  const ord = ORD[o.slag];
  atk.krav('registrera_vardkontakt', { resurs: { enhet_id: o.enhetId }, beskrivning: `${o.slag}:${o.id}:makulera` });
  if (vardenhetFor(atk.db, o.enhetId) !== vardenhetFor(atk.db, atk.personal.enhet_id)) throw new Fel(403, `Bara vårdenheten som registrerade ${ord.namn} kan makulera ${o.slag === 'vardkontakt' ? 'den' : 'det'}.`, 'nekad');
  if ((o.rad.kalla ?? 'vardkallan') !== 'vardkallan') throw new Fel(409, `${ord.Namn} kommer från ett annat system och rättas där.`, 'ogiltig');
  if (o.slag === 'vardkontakt') {
    const v = o.rad;
    if (v.vardtillfalle_id || v.typ === 'slutenvard') throw new Fel(409, 'Vårdkontakten hör till ett vårdtillfälle. Rätta vårdtillfället, så följer kontakten med.', 'ogiltig');
    if (v.planerad && !v.ankomst) throw new Fel(409, 'Vårdkontakten är planerad och har inte genomförts. Avboka besöket i stället.', 'ogiltig');
  }
}

const DOKUMENTATION_UTAN = new Set(['bokningar', 'kallelser']);
const harDokumentation = (foljer) => [...foljer.keys()].some(t => !DOKUMENTATION_UTAN.has(t));
const pagaende = (db, o) => db.query("SELECT * FROM makulering_forslag WHERE slag = ? AND objekt_id = ? AND status = 'vantar'").get(o.slag, o.id);
const VT_UTAN = 'Ett vårdtillfälle raderas aldrig. Ange rätt patient, så flyttas vårdtillfället dit med allt som hör till det.';

// GET: vad som följer med, så att personen ser det innan något görs.
export function forhandsvisa(atk, o) {
  sakra(atk.db);
  provaObjekt(atk, o);
  const alla = tillhor(atk.db, o);
  const foljer = synligt(atk, alla);
  const ord = ORD[o.slag];
  atk.logga('registrera_vardkontakt', atk.grund(), `${o.slag}:${o.id}:makulering-forhandsvisning`);
  const kontakter = o.slag === 'vardtillfalle' && o.kontakter.length ? `${o.kontakter.length} ${o.kontakter.length === 1 ? 'vårdkontakt' : 'vårdkontakter'}, ` : '';
  return {
    slag: o.slag, id: o.id, start: o.start, orsak: o.orsak,
    foljer: [...foljer].map(([t, ids]) => ({ tabell: t, text: BENAMNING[t] ?? t.replace(/_/g, ' '), antal: ids.length })),
    kanMakuleras: o.slag === 'vardkontakt' && !harDokumentation(foljer),
    vantar: Boolean(pagaende(atk.db, o)),
    text: foljer.size || kontakter ? `Det här följer med till rätt patient: ${kontakter}${sammanfattning(foljer) || 'inga andra uppgifter'}.` : `Inga uppgifter hör till ${ord.namn}.`,
    utanPatientText: o.slag === 'vardtillfalle' ? VT_UTAN
      : harDokumentation(foljer) ? 'Vårdkontakten har dokumentation, som aldrig förstörs. Ange rätt patient, så flyttas den dit.' : 'Utan rätt patient makuleras vårdkontakten. Den finns kvar som makulerad med din motivering.',
    fyraOgonText: FYRA_OGON_TEXT,
  };
}

// Flyttar raderna till rätt patient på samma sätt som en sammanslagning: flaggan sammanslagning_pagar släpper igenom
// patient_id i triggrar som känner till den, och andra triggrar som skyddar mot ändringar tas bort under flytten och
// läggs tillbaka med exakt samma definition i samma transaktion.
function flytta(db, tabell, ids, fran, till) {
  if (!ids.length) return;
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

// Säkerhetsgranskningen av andra omgången: rätt patient prövas i behörighetsmotorn innan något ändras. Försöken har ett
// tak per person i ett glidande fönster på ett dygn, som fullmakterna (ombud.js), räknat ur åtkomstloggen, så att en
// person aldrig kan låsa ute någon annan. Flytten är en del av identitetshanteringen och kräver vårdadministratörens
// handling för sammanslagning (sla_samman).
//
// Tredje omgången: ett nummer flyttas direkt bara när personen får registrera en vårdkontakt på rätt patient vid
// vårdenheten, med samma prövning som för en ny kontakt, alltså när rätt patient redan har vårdrelation till vårdenheten,
// och skyddad identitet bara efter det aktiva valet att visa identiteten. Varje annat nummer (okänt, samma patient, en
// sammanslagen journal, en patient som avled före besöket, en patient utan vårdrelation till vårdenheten och skyddad
// identitet utan valet) blir ett förslag med exakt samma svar. Varje förslag räknas mot taket, liksom varje godkännande
// som inte kunde genomföras.
export const MAX_FORSOK = 10;
export const FORSOK_FONSTER_MS = 24 * 3600_000;
export const FORMAT = 'Skriv personnummer, samordningsnummer eller reservnummer för rätt patient.';
export const EJ_ANVANDBAR = 'Flytten kan inte göras till den journalen. Inget har flyttats, och förslaget är avslutat. Kontrollera numret med den som föreslog flytten.';
export const FYRA_OGON_TEXT = 'Har rätt patient ingen vårdrelation till vårdenheten flyttas inget direkt. Flytten blir ett förslag som vårdenhetens verksamhetschef eller en annan vårdadministratör godkänner i sin egen inloggning.';
export const FORSLAG_TEXT = 'Flytten kan inte göras direkt. Den väntar nu på att vårdenhetens verksamhetschef eller en annan vårdadministratör godkänner den i sin egen inloggning. Inget har flyttats, och förslaget ger ingen åtkomst till någon journal.';
const NUMMERTYPER = ['personnummer', 'samordningsnummer', 'reservnummer'];
const nekadResurs = (slag) => `makulering:${slag}:nekad`;

function taket(db, personal) {
  const fran = new Date(Date.now() - FORSOK_FONSTER_MS).toISOString();
  const n = db.query(`SELECT count(*) AS n FROM atkomstlogg WHERE personal_id = ? AND tid >= ? AND ((resurs LIKE 'makulering:%:nekad' AND resultat = 'nekad')
    OR (resurs LIKE 'makulering:forslag:%:skapad'))`).get(personal.id, fran).n;
  if (n >= MAX_FORSOK) throw new Fel(429, 'Du har gjort många försök att flytta uppgifter till nummer som inte kan flyttas direkt. Fler försök stoppas i ett dygn.', 'for_manga');
}

// Patienten som numret leder till, eller null när numret inte kan användas: okänt, samma patient, en sammanslagen journal
// eller en patient som avled före kontakten.
function losUpp(db, t, o) {
  const { hittaPaIdentitet } = require('./identitet.js');
  const till = hittaPaIdentitet(db, t)?.patientId;
  if (!till || till === o.patientId) return null;
  const p = db.query('SELECT * FROM patienter WHERE id = ?').get(till);
  if (!p || p.sammanslagen_till) return null;
  const avliden = require('./avliden.js').avlidenFor(db, till);
  if (avliden && avliden.datum < String(o.start).slice(0, 10)) return null;
  return till;
}
function tolkaNummer(nummer) {
  if (typeof nummer !== 'string' || nummer.length > 20) return null;
  const t = require('./identitet.js').tolka(nummer);
  return t?.ok && NUMMERTYPER.includes(t.typ) ? t : null;
}

// Ger { till } när flytten kan göras direkt, annars { till: null, nummer } för ett förslag.
function provaNummer(atk, nummer, o, valFor) {
  const db = atk.db;
  const { Atkomst } = require('./atkomst.js');
  if (!kanRoll(atk.personal, 'sla_samman')) throw new Fel(403, 'Bara vårdadministratören flyttar uppgifter till en annan patient, som när två journaler slås samman.', 'nekad');
  taket(db, atk.personal);
  const t = tolkaNummer(nummer);
  if (!t) throw new Fel(400, FORMAT, 'ogiltig', { falt: ['rattPatient'] });
  const forslag = { till: null, nummer: t.varde };
  const till = losUpp(db, t, o);
  if (!till) return forslag;
  const p = db.query('SELECT skyddad FROM patienter WHERE id = ?').get(till);
  const val = valFor(till) ?? {};
  const a = new Atkomst(db, atk.personal, till, val, 'registrera_vardkontakt');
  if (!a.prova('registrera_vardkontakt', { enhet_id: o.enhetId }).tillaten) return forslag;
  if (p.skyddad && !(val.visa_identitet && kanRoll(atk.personal, 'visa_identitet'))) return forslag;
  return { till, nummer: t.varde };
}

export const NY_RELATION = 'Uppgifterna har något, till exempel en remiss eller en operationsanmälan, som skulle ge rätt patient en vårdrelation till en vårdenhet som patienten inte har i dag. Inget har flyttats. Be den vårdenheten rätta uppgifterna först.';
// Säkerhetsgranskningen efter sammanslagningen: texten nämner ingen vårdenhet, eftersom användaren kanske inte får se
// den, och pekar på systemförvaltningen, som kan rätta uppgifterna.
export const ANNAN_ENHET = 'Flytten kan inte göras från din vårdenhet, eftersom inte allt som hör till uppgifterna får registreras på rätt patient härifrån. Inget har flyttats. Kontakta systemförvaltningen, som kan rätta uppgifterna.';
// Vårdenheterna som patienten har vårdrelation till, enligt behörighetsmotorns regel.
function relationer(db, patientId, nu) {
  const { harVardrelation } = require('./atkomst.js');
  return new Set(db.query("SELECT id FROM enheter WHERE typ = 'vardenhet'").all().map(r => r.id).filter(e => harVardrelation(db, patientId, e, nu)));
}
// Vårdenheterna som de flyttade raderna hör till (kolumner som slutar på enhet_id), med kontaktens eller vårdtillfällets.
function enheterFor(db, o, foljer) {
  const enheter = new Set([vardenhetFor(db, o.enhetId)]);
  const radEnheter = (tabell, ids) => {
    const kol = kolumner(db, tabell).filter(k => k.endsWith('enhet_id'));
    if (!kol.length || !ids.length) return;
    const har = kolumner(db, tabell).includes('id') ? 'id' : 'rowid';
    for (const r of db.query(`SELECT ${kol.join(', ')} FROM ${tabell} WHERE ${har} IN (${ph(ids)})`).all(...ids)) {
      for (const k of kol) if (r[k] && r[k] !== 'extern') enheter.add(vardenhetFor(db, r[k]) ?? r[k]);
    }
  };
  for (const [tabell, ids] of foljer) radEnheter(tabell, ids);
  radEnheter('vardkontakter', o.kontakter);
  return enheter;
}
// Direkt flytt: varje vårdenhet som raderna hör till prövas för rätt patient.
function provaEnheter(atk, till, o, foljer, valFor) {
  const { Atkomst } = require('./atkomst.js');
  const a = new Atkomst(atk.db, atk.personal, till, valFor(till) ?? {}, 'registrera_vardkontakt');
  for (const e of enheterFor(atk.db, o, foljer)) if (!a.prova('registrera_vardkontakt', { enhet_id: e }).tillaten) { meddelaForvaltningen(atk, o); throw new Fel(409, ANNAN_ENHET, 'ogiltig'); }
}

// Gör rättelsen i en transaktion. aktor är den som utför den (vid fyra ögon den som godkänner), av den som makulerade
// eller föreslog. Med behallRelation (fyra ögon) ger kontakterna den vårdrelation till vårdenheten som de hade gett om
// de hade registrerats rätt från början, och ingen annan. Utan ger de ingen vårdrelation alls.
function genomfor(db, { aktor, av, godkandAv = null, forslagId = null, o, till, orsak, foljer, nu, behallRelation = false, grund, iTransaktion = () => {} }) {
  const fran = o.patientId;
  const t = iso(nu);
  const relationFore = till ? relationer(db, till, nu) : null;
  const tillaten = behallRelation ? new Set([vardenhetFor(db, o.enhetId)]) : new Set();
  let id;
  db.transaction(() => {
    const vkId = o.slag === 'vardkontakt' ? o.id : (o.kontakter[0] ?? null);
    id = Number(db.query(`INSERT INTO vardkontakt_makuleringar (slag, vardkontakt_id, vardtillfalle_id, patient_id, enhet_id, typ, start, orsak_kontakt, atgard, tid, av, godkand_av, forslag_id, orsak, foljde)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(o.slag, vkId, o.vardtillfalle, fran, o.enhetId, o.typ, o.start, o.orsak, till ? 'flyttad' : 'makulerad', t, av, godkandAv, forslagId, orsak,
        JSON.stringify({ ...(o.slag === 'vardtillfalle' ? { vardkontakter: o.kontakter.length } : {}), ...Object.fromEntries([...foljer].map(([k, ids]) => [k, ids.length])) })).lastInsertRowid);
    if (till) {
      db.query("INSERT OR REPLACE INTO installningar VALUES ('sammanslagning_pagar', ?)").run(`${fran}>${till}`);
      for (const [tabell, ids] of foljer) flytta(db, tabell, ids, fran, till);
      flytta(db, 'vardkontakter', o.kontakter, fran, till);
      if (o.vardtillfalle) flytta(db, 'vardtillfallen', [o.vardtillfalle], fran, till);
      // Hälsoärendet och kedjan av kontakter hör till den första patienten. Vid en direkt flytt ger kontakterna ingen
      // vårdrelation hos rätt patient.
      if (o.kontakter.length) {
        db.query(`UPDATE vardkontakter SET halsoarende_id = NULL, foregaende_id = NULL${behallRelation ? '' : ', ger_vardrelation = 0'} WHERE id IN (${ph(o.kontakter)})`).run(...o.kontakter);
      }
      db.query("DELETE FROM installningar WHERE nyckel = 'sammanslagning_pagar'").run();
      const ny = [...relationer(db, till, nu)].filter(e => !relationFore.has(e) && !tillaten.has(e));
      if (ny.length) throw new Fel(409, NY_RELATION, 'ogiltig');
    } else {
      // En bokning för kontakten pekar inte längre på den. Kontakten själv tas bort ur vårdkontakterna och finns kvar som
      // makulerad, så att den aldrig ger vårdrelation eller avgift.
      for (const b of foljer.get('bokningar') ?? []) db.query('UPDATE bokningar SET vardkontakt_id = NULL WHERE id = ?').run(b);
      db.query('DELETE FROM vardkontakter WHERE id = ?').run(o.id);
    }
    loggaRad(db, { tid: t, personal_id: aktor.id, enhet_id: aktor.enhet_id, patient_id: fran, handling: 'registrera_vardkontakt',
      resurs: `makulering:${o.slag}:${id}:${till ? 'flyttad' : 'makulerad'}`, grund, syfte: orsak });
    if (till) loggaRad(db, { tid: t, personal_id: aktor.id, enhet_id: aktor.enhet_id, patient_id: till, handling: 'registrera_vardkontakt',
      resurs: `makulering:${o.slag}:${id}:flyttad-hit`, grund: 'administrativ', syfte: orsak });
    iTransaktion(id);
  })();
  // Engagemangsindex för båda patienterna, eftersom flytten görs med triggrarna för ändringar borttagna.
  try { require('./engagemangsindex.js').markeraPatienter(db, till ? [fran, till] : [fran]); } catch (e) { console.error('Engagemangsindex:', e.message); }
  return id;
}

const klarText = (o, till, foljer) => {
  const ord = ORD[o.slag];
  if (!till) return `${ord.Namn} är makulerad.`;
  const delar = [o.slag === 'vardtillfalle' && o.kontakter.length ? `${o.kontakter.length} ${o.kontakter.length === 1 ? 'vårdkontakt' : 'vårdkontakter'}` : '', sammanfattning(foljer)].filter(Boolean).join(', ');
  return o.slag === 'vardtillfalle' ? `Vårdtillfället är makulerat här och flyttat till rätt patient, med ${delar || 'inga andra uppgifter'}.`
    : `Vårdkontakten är makulerad här och flyttad till rätt patient, med ${delar || 'inga andra uppgifter'}.`;
};

// POST: makulerar med motivering, och flyttar det som hör till kontakten eller vårdtillfället när rätt patient anges.
// body: { orsak, rattPatient? }
export function makulera(atk, o, body = {}, { nu = new Date(), valFor = () => ({}) } = {}) {
  const db = atk.db;
  sakra(db);
  provaObjekt(atk, o);
  const ord = ORD[o.slag];
  const orsak = typeof body.orsak === 'string' ? body.orsak.trim().slice(0, 500) : '';
  if (orsak.length < 10) throw new Fel(400, `Skriv varför ${ord.namn} makuleras, med minst tio tecken. Motiveringen står kvar i journalen.`, 'ogiltig', { falt: ['orsak'] });
  if (pagaende(db, o)) throw new Fel(409, `Det finns redan ett förslag om att flytta ${ord.namn} som väntar på godkännande. Återkalla det först, eller vänta på beslutet.`, 'ogiltig');
  const n = body.rattPatient ? provaNummer(atk, body.rattPatient, o, valFor) : null;
  if (n && !n.till) return foresla(atk, o, n.nummer, orsak, nu);
  const till = n?.till ?? null;
  const foljer = tillhor(db, o);
  if (!till && o.slag === 'vardtillfalle') throw new Fel(409, VT_UTAN, 'ogiltig', { falt: ['rattPatient'] });
  if (!till && harDokumentation(foljer)) {
    meddelaForvaltningen(atk, o);
    throw new Fel(409, HINDRAD, 'ogiltig', { falt: ['rattPatient'] });
  }
  if (!till && db.query("SELECT 1 FROM sqlite_master WHERE name = 'betalningar'").get() && (foljer.get('bokningar') ?? []).some(b => db.query('SELECT 1 FROM betalningar WHERE bokning_id = ?').get(b))) {
    throw new Fel(409, 'Besöket är betalt. Återbetala avgiften i kassan först, sedan kan vårdkontakten makuleras.', 'ogiltig');
  }
  // Andra säkerhetsgranskningen: allt som flyttas prövas i behörighetsmotorn för rätt patient vid varje vårdenhet som
  // raderna hör till, och flytten får aldrig ge rätt patient en vårdrelation som inte fanns före flytten, från någon av
  // de källor som behörighetsmotorn läser (vårdkontakter, remisser, operationsanmälningar och listning).
  if (till) provaEnheter(atk, till, o, foljer, valFor);
  const syns = synligt(atk, foljer);
  const id = genomfor(db, { aktor: atk.personal, av: atk.personal.id, o, till, orsak, foljer, nu, grund: atk.grund() });
  atk.loggad = true;
  return { makulering: id, atgard: till ? 'flyttad' : 'makulerad', text: klarText(o, till, syns) };
}

// Förslaget: numret sparas som det skrevs, och ingenting slås upp för den som föreslår. Svaret är detsamma för alla
// nummer, så att det inte röjer om numret finns, har vårdrelation eller skyddad identitet.
function foresla(atk, o, nummer, orsak, nu) {
  const db = atk.db;
  const t = iso(nu);
  const id = Number(db.query('INSERT INTO makulering_forslag (slag, objekt_id, patient_id, enhet_id, nummer, orsak, foreslagen_av, foreslagen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(o.slag, o.id, o.patientId, o.enhetId, nummer, orsak, atk.personal.id, t).lastInsertRowid);
  loggaRad(db, { tid: t, personal_id: atk.personal.id, enhet_id: atk.personal.enhet_id, patient_id: o.patientId, handling: 'registrera_vardkontakt',
    resurs: `makulering:forslag:${id}:skapad`, grund: atk.grund(), syfte: orsak });
  atk.loggad = true;
  return [202, { atgard: 'foreslagen', text: FORSLAG_TEXT }];
}

// Vem som får godkänna: vårdenhetens verksamhetschef, eller en annan vårdadministratör på samma vårdenhet. Aldrig den
// som föreslog flytten.
export function behorig(db, personal, enhetId) {
  if (!personal || !kanRoll(personal, 'godkanna_flytt')) return false;
  const ve = vardenhetFor(db, enhetId);
  if (personal.yrke === 'verksamhetschef') {
    try { return Boolean(db.query('SELECT 1 FROM verksamhetschefer WHERE enhet_id = ? AND personal_id = ?').get(ve, personal.id)); } catch { return false; }
  }
  return kanRoll(personal, 'sla_samman') && vardenhetFor(db, personal.enhet_id) === ve;
}
function hamtaForslag(db, id) {
  sakra(db);
  const f = db.query('SELECT * FROM makulering_forslag WHERE id = ?').get(Number(id));
  if (!f) throw new Fel(404, 'Förslaget finns inte.', 'saknas');
  return f;
}
const STATUS = { vantar: 'Väntar på godkännande', godkand: 'Godkänd och flyttad', avslagen: 'Avslagen', aterkallad: 'Återkallad', ej_genomford: 'Kunde inte genomföras' };
const personKort = (db, id) => {
  const p = id && db.query('SELECT id, namn, titel FROM personal WHERE id = ?').get(id);
  return p ? { id: p.id, namn: p.namn, titel: p.titel } : null;
};
function stang(db, f, personal, status, kommentar, nu) {
  db.query('UPDATE makulering_forslag SET status = ?, beslutad_av = ?, beslutad = ?, kommentar = ? WHERE id = ?').run(status, personal.id, iso(nu), kommentar ?? null, f.id);
  loggaRad(db, { tid: iso(nu), personal_id: personal.id, enhet_id: personal.enhet_id, patient_id: f.patient_id, handling: 'registrera_vardkontakt',
    resurs: `makulering:forslag:${f.id}:${status.replace('_', '-')}`, grund: 'administrativ', syfte: kommentar ?? null });
}

// Godkänner ett förslag som någon annan har lagt. Numret slås upp först nu, med samma regler som för en direkt flytt,
// och skyddad identitet flyttas aldrig genom ett förslag. Kan flytten inte göras är svaret detsamma för alla orsaker,
// förslaget avslutas och försöket räknas mot taket. Allt som flyttas ska höra till vårdenheten, så att godkännandet
// aldrig ger rätt patient en vårdrelation till en annan vårdenhet.
export function godkann(db, personal, forslagId, { nu = new Date(), valFor = () => ({}) } = {}) {
  const f = hamtaForslag(db, forslagId);
  if (f.status !== 'vantar') throw new Fel(409, 'Förslaget är redan beslutat.', 'ogiltig');
  if (f.foreslagen_av === personal.id) throw new Fel(403, 'Fyra ögon: en annan behörig person än den som föreslog flytten godkänner den, i sin egen inloggning.', 'nekad');
  if (!behorig(db, personal, f.enhet_id)) throw new Fel(403, 'Bara vårdenhetens verksamhetschef eller en annan vårdadministratör på vårdenheten godkänner flytten.', 'nekad');
  taket(db, personal);
  let o = null;
  try { o = objekt(db, f.slag, f.objekt_id); } catch { o = null; }
  // Kontakten kan ha knutits till ett vårdtillfälle eller kommit från ett annat system sedan förslaget lades.
  if (o && ((o.rad.kalla ?? 'vardkallan') !== 'vardkallan' || (o.slag === 'vardkontakt' && (o.rad.vardtillfalle_id || o.rad.typ === 'slutenvard')))) o = null;
  if (!o || o.patientId !== f.patient_id) {
    stang(db, f, personal, 'ej_genomford', 'Uppgifterna hade redan rättats.', nu);
    throw new Fel(409, 'Uppgifterna har redan rättats eller tagits bort. Förslaget är avslutat.', 'ogiltig');
  }
  // Säkerhetsgranskningen efter sammanslagningen: behörigheten prövades mot förslagets vårdenhet. Har kontakten eller
  // vårdtillfället bytt vårdenhet sedan dess genomförs flytten inte.
  if (bytt(db, f, o)) {
    stang(db, f, personal, 'ej_genomford', BYTT_TEXT, nu);
    throw new Fel(409, `${BYTT_TEXT} Förslaget är avslutat.`, 'ogiltig');
  }
  // Godkännaren ser patienten och kontakten, så godkännandet prövas och loggas som när förslaget öppnas.
  const atkG = oppnaPatient(db, personal, f, valFor);
  const t = require('./identitet.js').tolka(f.nummer);
  const till = t?.ok ? losUpp(db, t, o) : null;
  if (!till || db.query('SELECT skyddad FROM patienter WHERE id = ?').get(till)?.skyddad) {
    loggaRad(db, { personal_id: personal.id, enhet_id: personal.enhet_id, patient_id: f.patient_id, handling: 'registrera_vardkontakt', resurs: nekadResurs(f.slag), grund: 'nekad', resultat: 'nekad' });
    stang(db, f, personal, 'ej_genomford', null, nu);
    throw new Fel(404, EJ_ANVANDBAR, 'saknas');
  }
  const foljer = tillhor(db, o);
  const ve = vardenhetFor(db, o.enhetId);
  if ([...enheterFor(db, o, foljer)].some(e => e !== ve)) { meddelaForvaltningen(atkG, o); throw new Fel(409, ANNAN_ENHET, 'ogiltig'); }
  const syns = synligt(atkG, foljer);
  const id = genomfor(db, {
    aktor: personal, av: f.foreslagen_av, godkandAv: personal.id, forslagId: f.id, o, till, orsak: f.orsak, foljer, nu, behallRelation: true, grund: 'administrativ',
    iTransaktion: (mid) => {
      db.query("UPDATE makulering_forslag SET status = 'godkand', beslutad_av = ?, beslutad = ?, makulering_id = ? WHERE id = ?").run(personal.id, iso(nu), mid, f.id);
      loggaRad(db, { tid: iso(nu), personal_id: personal.id, enhet_id: personal.enhet_id, patient_id: f.patient_id, handling: 'registrera_vardkontakt',
        resurs: `makulering:forslag:${f.id}:godkand`, grund: 'administrativ', syfte: f.orsak });
    },
  });
  return { makulering: id, atgard: 'flyttad', text: `Flytten är godkänd. ${klarText(o, till, syns)}`, forslag: forslagUt(db, hamtaForslag(db, f.id), personal) };
}

// Avslår ett förslag (en behörig person som inte föreslog det, med en kommentar) eller återkallar det (den som föreslog).
export function avsluta(db, personal, forslagId, { kommentar } = {}, { nu = new Date() } = {}) {
  const f = hamtaForslag(db, forslagId);
  if (f.status !== 'vantar') throw new Fel(409, 'Förslaget är redan beslutat.', 'ogiltig');
  const egen = f.foreslagen_av === personal.id;
  if (!egen && !behorig(db, personal, f.enhet_id)) throw new Fel(403, 'Bara vårdenhetens verksamhetschef eller en annan vårdadministratör på vårdenheten avslår flytten.', 'nekad');
  // Säkerhetsgranskningen efter sammanslagningen: har objektet bytt vårdenhet avslutas förslaget som ej genomfört.
  let ob = null;
  try { ob = objekt(db, f.slag, f.objekt_id); } catch { ob = null; }
  if (ob && bytt(db, f, ob)) {
    stang(db, f, personal, 'ej_genomford', BYTT_TEXT, nu);
    return { forslag: forslagUt(db, hamtaForslag(db, f.id), personal), text: `${BYTT_TEXT} Förslaget är avslutat, och inget har flyttats.` };
  }
  const k = typeof kommentar === 'string' ? kommentar.trim().slice(0, 500) : '';
  if (!egen && k.length < 3) throw new Fel(400, 'Skriv varför flytten avslås, så att den som föreslog den vet vad som behöver göras.', 'ogiltig', { falt: ['kommentar'] });
  stang(db, f, personal, egen ? 'aterkallad' : 'avslagen', k || null, nu);
  return { forslag: forslagUt(db, hamtaForslag(db, f.id), personal), text: egen ? 'Förslaget är återkallat. Inget har flyttats.' : 'Flytten är avslagen. Inget har flyttats.' };
}

// Ett förslag för den som föreslog det och för den som kan godkänna det. Numret visas som det skrevs, men ingenting om
// patienten som numret leder till förrän flytten är godkänd. Fel patient visas med skyddad identitet maskerad.
// Säkerhetsgranskningen efter sammanslagningen: i listan och inkorgen bara en ogenomskinlig referens (vårdenhet, tid och
// status). Patienten, kontakten, numret och motiveringen visas först när förslaget öppnas (forslagDetalj), prövat på
// patienten och loggat.
export function forslagUt(db, f, personal) {
  let o = null;
  try { o = objekt(db, f.slag, f.objekt_id); } catch { o = null; }
  const flyttad = Boolean(o && bytt(db, f, o));
  return {
    id: f.id, slag: f.slag, rubrik: f.slag === 'vardkontakt' ? 'Vårdkontakt på fel patient' : 'Vårdtillfälle på fel patient',
    vardenhet: db.query('SELECT id, namn FROM enheter WHERE id = ?').get(vardenhetFor(db, f.enhet_id)) ?? null,
    foreslagenAv: personKort(db, f.foreslagen_av), foreslagen: f.foreslagen,
    status: f.status, statusText: STATUS[f.status], beslutadAv: personKort(db, f.beslutad_av), beslutad: f.beslutad,
    ...(flyttad && f.status === 'vantar' ? { bytt: true, byttText: BYTT_TEXT } : {}),
    // Kommentaren till ett beslut, för den som föreslog och den som beslutade.
    ...(f.kommentar && personal && [f.foreslagen_av, f.beslutad_av].includes(personal.id) ? { kommentar: f.kommentar } : {}),
    egen: f.foreslagen_av === personal?.id, kanGodkanna: f.status === 'vantar' && !flyttad && f.foreslagen_av !== personal?.id && behorig(db, personal, f.enhet_id),
  };
}
const BYTT_TEXT = 'Kontakten eller vårdtillfället har bytt vårdenhet sedan flytten föreslogs, så godkännandet gäller inte längre.';
const bytt = (db, f, o) => vardenhetFor(db, o.enhetId) !== vardenhetFor(db, f.enhet_id);
// Prövar att personen får se patienten i förslaget, som annan administrativ läsning, och loggar det.
function oppnaPatient(db, personal, f, valFor) {
  const atk = new Atkomst(db, personal, f.patient_id, valFor(f.patient_id), 'las_flytt');
  const beskrivning = `makulering:forslag:${f.id}`;
  atk.krav('las_flytt', { resurs: { enhet_id: f.enhet_id }, beskrivning });
  atk.logga('las_flytt', atk.grund(), beskrivning);
  return atk;
}
// Ett öppnat förslag: för den som föreslog det och för den som kan godkänna det. Numret visas som det skrevs, men inget om
// patienten som numret leder till förrän flytten är godkänd. Fel patient visas med skyddad identitet maskerad.
export function forslagDetalj(db, personal, forslagId, { valFor = () => ({}) } = {}) {
  const f = hamtaForslag(db, forslagId);
  if (f.foreslagen_av !== personal.id && !behorig(db, personal, f.enhet_id)) throw new Fel(404, 'Förslaget finns inte.', 'saknas');
  const atk = oppnaPatient(db, personal, f, valFor);
  let o = null;
  try { o = objekt(db, f.slag, f.objekt_id); } catch { o = null; }
  const p = db.query('SELECT * FROM patienter WHERE id = ?').get(f.patient_id);
  const visa = Boolean(valFor(f.patient_id)?.visa_identitet);
  const t = require('./identitet.js').tolka(f.nummer);
  const foljer = o && f.status === 'vantar' && o.patientId === f.patient_id && !bytt(db, f, o) ? synligt(atk, tillhor(db, o)) : null;
  return {
    ...forslagUt(db, f, personal),
    objekt: o && !bytt(db, f, o) ? { id: o.id, start: o.start, orsak: o.orsak, vardenhet: db.query('SELECT id, namn FROM enheter WHERE id = ?').get(vardenhetFor(db, o.enhetId)) ?? null } : null,
    felPatient: p ? { id: p.id, namn: visningsnamn(p, visa), personnummer: visningsPnr(p, visa) } : null,
    rattNummer: t?.ok ? t.visning : f.nummer,
    foljer: foljer ? (sammanfattning(foljer) || 'inga andra uppgifter') : null,
    // Kommentaren till ett beslut visas bara som forslagUt avgör (den som föreslog och den som beslutade). Inget fält här
    // skriver över ett fält från forslagUt.
    orsak: f.orsak,
  };
}

// Förslagen för den inloggade: de som väntar på personens godkännande och personens egna som väntar.
export function forslagFor(db, personal) {
  sakra(db);
  const vantar = db.query("SELECT * FROM makulering_forslag WHERE status = 'vantar' ORDER BY foreslagen").all();
  const beslutade = db.query("SELECT * FROM makulering_forslag WHERE status <> 'vantar' AND (foreslagen_av = ? OR beslutad_av = ?) ORDER BY beslutad DESC LIMIT 20").all(personal.id, personal.id);
  return {
    attGodkanna: vantar.filter(f => f.foreslagen_av !== personal.id && behorig(db, personal, f.enhet_id)).map(f => forslagUt(db, f, personal)),
    mina: vantar.filter(f => f.foreslagen_av === personal.id).map(f => forslagUt(db, f, personal)),
    beslutade: beslutade.map(f => forslagUt(db, f, personal)),
    text: FYRA_OGON_TEXT,
  };
}

// Makulerade vårdkontakter och vårdtillfällen på patienten, och flyttar som väntar på godkännande, för den som får se
// vårdenheten. Ingenting om en annan patient, och numret i ett förslag bara för den som föreslog det.
export function forPatient(atk) {
  const db = atk.db;
  sakra(db);
  const rader = db.query('SELECT * FROM vardkontakt_makuleringar WHERE patient_id = ? ORDER BY tid DESC').all(atk.patientId);
  const makulerade = atk.filtrera(rader, 'las_admin').map(r => ({
    id: r.id, slag: r.slag, start: r.start, orsakKontakt: r.orsak_kontakt, vardenhet: db.query('SELECT id, namn FROM enheter WHERE id = ?').get(r.enhet_id) ?? null,
    tid: r.tid, av: personKort(db, r.av), godkandAv: personKort(db, r.godkand_av), orsak: r.orsak, atgard: r.atgard,
    text: r.atgard === 'flyttad' ? `Registrerad på fel patient och flyttad till rätt journal med sina uppgifter${r.godkand_av ? ', efter godkännande' : ''}.` : 'Registrerad på fel patient och makulerad.',
  }));
  return makulerade;
}
export function vantandeForPatient(atk) {
  const db = atk.db;
  sakra(db);
  const rader = db.query("SELECT * FROM makulering_forslag WHERE patient_id = ? AND status = 'vantar' ORDER BY foreslagen").all(atk.patientId);
  return atk.filtrera(rader, 'las_admin').map(f => ({
    id: f.id, slag: f.slag, objektId: f.objekt_id, foreslagen: f.foreslagen, foreslagenAv: personKort(db, f.foreslagen_av), orsak: f.orsak, egen: f.foreslagen_av === atk.personal.id,
    ...(f.foreslagen_av === atk.personal.id ? { rattNummer: require('./identitet.js').tolka(f.nummer)?.visning ?? f.nummer } : {}),
    text: `Flytt till rätt patient väntar på godkännande av vårdenhetens verksamhetschef eller en annan vårdadministratör.`,
  }));
}
