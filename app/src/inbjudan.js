// Tillägg 2026-11-19 (Jonas), runda 18, r1: bjud in en kollega och dela i sociala medier. Systemet skickar aldrig något
// självt och sparar inga adresser: testaren får en färdig text med länken (public/js/inbjudan-regler.js) och skickar den
// själv. Länken har en slumpad kod per inbjudan och kanalen, och går alltid till testinbjudans startsida.
//
// Två tabeller i synpunktsdatabasen (synpunkter.js), med samma gallring:
//   inbjudningar     koden, tiden och skaparen som HMAC (för taket), inget om testaren.
//   inbjudan_besok   ett besök via en kod: kanalen, tiden och om besökaren gjorde klart ett första pass. Besöket har ett
//                    eget slumpat id som sandlådan minns, så att ett genomfört pass kan räknas utan att koden eller
//                    besöket kopplas till mätningen, svaren eller synpunkterna.
import { provaTak, nyttNummer, skapareFor } from './synpunkter.js';
import { KANALER, KOD, BESOK } from '../public/js/inbjudan-regler.js';

// Taken. En inbjudan skapas per session (sandlåda) högst så här ofta, och besöken har ett tak per adress och dygn.
export const TAK_INBJUDAN = { perMinut: 3, perTimme: 10, perAdress: 30, totalt: 50000 };
export const TAK_BESOK = { perMinut: 1e9, perTimme: 1e9, perAdress: 200, totalt: 500000 };

export function skapa(db, { nu = new Date(), session = {}, adress = 'okänd', tak = TAK_INBJUDAN } = {}) {
  const skapare = skapareFor(adress);
  provaTak(db, 'inbjudningar', { session, skapare, nu, tak, nyckel: 'inbjudanTider' });
  const kod = nyttNummer(db, 'I', 'inbjudningar', 'kod');
  db.query('INSERT INTO inbjudningar (kod, tid, skapare) VALUES (?, ?, ?)').run(kod, nu.toISOString(), skapare);
  return { kod };
}

// Ett besök via en inbjudan. En okänd kod eller kanal ger samma svar och sparar inget, så att svaret inte röjer vilka
// koder som finns. Taket per adress gäller också här.
export function besok(db, body = {}, { nu = new Date(), adress = 'okänd', tak = TAK_BESOK } = {}) {
  const { kod, kanal } = body ?? {};
  if (typeof kod !== 'string' || !KOD.test(kod) || typeof kanal !== 'string' || !KANALER.some(([k]) => k === kanal)) return { besok: null };
  if (!db.query('SELECT 1 FROM inbjudningar WHERE kod = ?').get(kod)) return { besok: null };
  const skapare = skapareFor(adress);
  provaTak(db, 'inbjudan_besok', { session: {}, skapare, nu, tak, nyckel: 'besokTider' });
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
