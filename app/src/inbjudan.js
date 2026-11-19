// Tillägg 2026-11-19 (Jonas), runda 18, r1: bjud in en kollega och dela i sociala medier. Systemet skickar aldrig något
// självt och sparar inga adresser: testaren får en färdig text med länken (public/js/inbjudan-regler.js) och skickar den
// själv. Länken har en slumpad kod per inbjudan och kanalen, och går alltid till testinbjudans startsida.
//
// Två tabeller i synpunktsdatabasen (synpunkter.js), med samma gallring:
//   inbjudningar     koden, tiden och skaparen som HMAC (för taket), inget om testaren.
//   inbjudan_besok   ett besök via en kod: kanalen, tiden och om besökaren gjorde klart ett första pass. Besöket har ett
//                    eget slumpat id som sandlådan minns, så att ett genomfört pass kan räknas utan att koden eller
//                    besöket kopplas till mätningen, svaren eller synpunkterna.
import { Fel } from './db.js';
import { nyttNummer, skapareFor } from './synpunkter.js';
import { KANALER, KOD, BESOK } from '../public/js/inbjudan-regler.js';

// Taken räknas på servern per skapare, alltså adressgruppen som HMAC (som för synpunkterna), ur raderna i databasen. De
// gäller därför också när anropet kommer utan sessionskaka, som en ny tom session varje gång. Finns en session gäller
// dess tak dessutom. Ett globalt tak per minut och timme gäller nya koder oavsett adress. När det totala taket är nått
// stoppas nya rader med 503 (fail closed). Inga levande rader tas bort när någon skapar en ny; bara gallringen tar bort
// rader, efter ålder (synpunkter.stada).
export const TAK_INBJUDAN = { perMinut: 3, perTimme: 10, perAdress: 20, totalt: 50000, globaltPerMinut: 60, globaltPerTimme: 600 };
export const TAK_BESOK = { perMinut: 30, perTimme: 100, perAdress: 200, totalt: 500000 };
const DAG = 86400_000;
const fel429 = (text) => new Fel(429, text, 'for_manga');
function provaTakPerSkapare(db, tabell, { skapare, nu, tak, session = null, nyckel, namn }) {
  const ms = nu.getTime();
  const antal = (fonster) => db.query(`SELECT count(*) AS n FROM ${tabell} WHERE skapare = ? AND tid > ?`).get(skapare, new Date(ms - fonster).toISOString()).n;
  if (antal(60_000) >= tak.perMinut) throw fel429(`Högst ${tak.perMinut} ${namn} på en minut. Vänta en stund och försök igen.`);
  if (antal(3600_000) >= tak.perTimme) throw fel429(`Högst ${tak.perTimme} ${namn} i timmen från samma adress. Vänta en stund och försök igen.`);
  if (antal(DAG) >= tak.perAdress) throw fel429(`Det har kommit väldigt många ${namn} från din adress i dag. Försök igen i morgon.`);
  if (session) {
    const tider = (session[nyckel] ?? []).filter(x => x > ms - 3600_000);
    session[nyckel] = tider;
    if (tider.filter(x => x > ms - 60_000).length >= tak.perMinut) throw fel429(`Högst ${tak.perMinut} ${namn} på en minut. Vänta en stund och försök igen.`);
    if (tider.length >= tak.perTimme) throw fel429(`Högst ${tak.perTimme} ${namn} i timmen från samma webbläsare. Vänta en stund och försök igen.`);
    tider.push(ms);
  }
  const alla = (fonster) => db.query(`SELECT count(*) AS n FROM ${tabell} WHERE tid > ?`).get(new Date(ms - fonster).toISOString()).n;
  if ((tak.globaltPerMinut && alla(60_000) >= tak.globaltPerMinut) || (tak.globaltPerTimme && alla(3600_000) >= tak.globaltPerTimme)) {
    throw new Fel(503, `Demon tar emot väldigt många ${namn} just nu. Vänta en stund och försök igen.`, 'fullt');
  }
  if (db.query(`SELECT count(*) AS n FROM ${tabell}`).get().n >= tak.totalt) {
    throw new Fel(503, `Demon tar inte emot fler ${namn} just nu, eftersom taket för hela testet är nått. Gamla ${namn} raderas efter ett år.`, 'fullt');
  }
}

export function skapa(db, { nu = new Date(), session = null, adress = 'okänd', tak = TAK_INBJUDAN } = {}) {
  const skapare = skapareFor(adress);
  provaTakPerSkapare(db, 'inbjudningar', { skapare, nu, tak, session, nyckel: 'inbjudanTider', namn: 'inbjudningar' });
  const kod = nyttNummer(db, 'I', 'inbjudningar', 'kod');
  db.query('INSERT INTO inbjudningar (kod, tid, skapare) VALUES (?, ?, ?)').run(kod, nu.toISOString(), skapare);
  return { kod };
}

// Ett besök via en inbjudan. En okänd kod eller kanal ger samma svar och sparar inget, så att svaret inte röjer vilka
// koder som finns. Taken per adressgrupp gäller också här.
export function besok(db, body = {}, { nu = new Date(), adress = 'okänd', tak = TAK_BESOK } = {}) {
  const { kod, kanal } = body ?? {};
  if (typeof kod !== 'string' || !KOD.test(kod) || typeof kanal !== 'string' || !KANALER.some(([k]) => k === kanal)) return { besok: null };
  if (!db.query('SELECT 1 FROM inbjudningar WHERE kod = ?').get(kod)) return { besok: null };
  const skapare = skapareFor(adress);
  provaTakPerSkapare(db, 'inbjudan_besok', { skapare, nu, tak, namn: 'besök' });
  const id = nyttNummer(db, 'B', 'inbjudan_besok', 'besok');
  db.query('INSERT INTO inbjudan_besok (besok, kod, kanal, tid, pass, skapare) VALUES (?, ?, ?, ?, 0, ?)').run(id, kod, kanal, nu.toISOString(), skapare);
  return { besok: id };
}

// Besökaren gjorde klart ett första pass. Bara en markering på besöket.
export function passKlar(db, besokId) {
  if (typeof besokId !== 'string' || !BESOK.test(besokId)) return false;
  return db.query('UPDATE inbjudan_besok SET pass = 1 WHERE besok = ?').run(besokId).changes > 0;
}

// Testledarens sammanställning: antal koder, och besök och genomförda pass per kanal. Inga koder lämnas ut.
export function sammanstall(db) {
  const per = new Map(db.query('SELECT kanal, count(*) AS besok, sum(pass) AS pass FROM inbjudan_besok GROUP BY kanal').all().map(r => [r.kanal, r]));
  const perKanal = KANALER.map(([k, text]) => ({ kanal: k, text, besok: per.get(k)?.besok ?? 0, pass: per.get(k)?.pass ?? 0 }));
  return {
    koder: db.query('SELECT count(*) AS n FROM inbjudningar').get().n,
    besok: perKanal.reduce((a, x) => a + x.besok, 0), pass: perKanal.reduce((a, x) => a + x.pass, 0), perKanal,
  };
}
