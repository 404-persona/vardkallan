// Runda 15, r4: mallen för en ny anteckning för en patient och en kontakt (GET /api/patient/:id/anteckningsmall).
//
// Svaret har det som anteckningsvyn behöver för att systemet ska vara experten när någon skriver:
//   mall           mallen som den gäller för personen, med vårdenhetens anpassning och skrivordning och personens egen
//                  ordning på sökorden (egna-fraser.js)
//   varianter      undersökorden som kan fällas ut inom mallen, och vilka systemet har valt och varför (mallvarianter.js)
//   foreslagna     sökorden som systemet föreslår överst, med en kort förklaring (mallforslag.js, del r5)
//   underlag       det som hör till anteckningen: kontaktorsak, prioritet, mätvärden, provsvar, läkemedel och diagnoser
//                  (anteckningsunderlag.js), och förifyllnaden av Kontaktorsak och Prioritet med källan
//   utkast         den inloggades egna utkast för patienten, så att vyn kan föreslå att fortsätta i stället för att börja
//                  om. Bara författaren ser sina utkast.
// Allt prövas med den skrivandes behörighet, och åtkomsten loggas på patienten.
import { Fel, idag } from './db.js';
import { kanRoll, alder } from './atkomst.js';
import * as lakemedel from './lakemedel.js';
import * as journal from './journal.js';
import * as underlag from './anteckningsunderlag.js';
import * as varianter from './mallvarianter.js';
import * as fraser from './egna-fraser.js';
import { foreslagnaSokord } from './mallforslag.js';
import { forvalFor } from './presentationsvyer.js';

const namn = (s) => (typeof s === 'string' ? s : s?.namn);

// Vårdenhetens skrivordning ur förvalet för vyn anteckning, eller mallens ordning.
export const skrivordningFor = (db, personal) => forvalFor(db, personal, 'anteckning')?.skrivordning ?? 'mall';

function patientUppgifter(atk) {
  const db = atk.db;
  const p = db.query('SELECT fodd FROM patienter WHERE id = ?').get(atk.patientId);
  const ut = { alder: p ? alder(p.fodd, idag()) : null, lakemedel: 0, graviditet: false };
  if (kanRoll(atk.personal, 'las_lakemedel')) ut.lakemedel = lakemedel.synligaOrdinationer(atk).filter(o => o.status === 'aktiv' && (!o.slut || o.slut >= idag())).length;
  if (kanRoll(atk.personal, 'las_graviditet')) {
    try { ut.graviditet = atk.filtrera(db.query("SELECT * FROM graviditeter WHERE patient_id = ? AND status = 'pagaende'").all(atk.patientId), 'las_graviditet').length > 0; } catch { /* utan graviditetsjournal */ }
  }
  return ut;
}

export function forPatient(atk, mall, { utkastId = null } = {}) {
  if (!mall) throw new Fel(404, 'Mallen finns inte.', 'saknas');
  atk.krav(journal.skrivHandling(mall.kategori, atk.personal));
  const db = atk.db;
  const kontakt = (() => { try { return kanRoll(atk.personal, 'las_admin') ? require('./vardkontakt.js').aktuell(atk) : null; } catch (e) { if (e instanceof Fel) return null; throw e; } })();
  const strukt = Boolean(mall.strukturerad || mall.formular);
  const ordning = strukt ? 'mall' : skrivordningFor(db, atk.personal);
  let sokord = strukt ? mall.sokord : varianter.skrivordning(mall.sokord, ordning);
  const egen = strukt ? null : fraser.ordningFor(db, atk.personal, mall.typ);
  if (egen) {
    const finns = new Set(sokord.map(namn));
    if (egen.length === finns.size && egen.every(x => finns.has(x))) sokord = egen.map(n => sokord.find(s => namn(s) === n));
  }
  const diagnoser = kanRoll(atk.personal, 'las_diagnoser') ? journal.synligaDiagnoser(atk) : [];
  // Beslut 2026-11-14: patientens ålder, antalet aktuella läkemedel och en pågående graviditet, bara det som syns.
  const patient = patientUppgifter(atk);
  const ut = {
    mall: { ...mall, sokord },
    skrivordning: { id: ordning, text: varianter.SKRIVORDNINGAR[ordning] ?? null, egen: Boolean(egen) },
    varianter: strukt ? [] : varianter.varianterFor(mall.typ),
    valdaVarianter: strukt ? [] : varianter.valjVarianter(db, atk.personal, mall.typ, { kontakt, diagnoser, patient }),
    foreslagna: (() => { const f = foreslagnaSokord(atk, atk.patientId, { ...mall, sokord }, kontakt); return Array.isArray(f) ? f : []; })(),
    underlag: strukt ? null : underlag.underlag(atk, { typ: mall.typ, utkastId, kontakt, alder: patient.alder }),
    utkast: journal.synligaAnteckningar(atk).filter(a => a.status === 'utkast' && a.forfattare_id === atk.personal.id && a.id !== utkastId)
      .map(a => ({ id: a.id, typ: a.typ, skapad: a.skapad, andrad: a.andrad ?? a.skapad })),
  };
  return ut;
}
