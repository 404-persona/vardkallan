// Tillägg 2026-11-19 (Jonas), runda 18, r1: bjud in en kollega och dela i sociala medier. Systemet skickar aldrig något
// självt och sparar inga adresser: testaren får en färdig text med länken (public/js/inbjudan-regler.js) och skickar den
// själv. Att bjuda in skapar ingen rad och inget anrop. Länken bär bara kanalen ur en fast lista (?via=linkedin), så
// delningen kan aldrig nekas eller fyllas upp av någon annan.
//
// Statistiken är räknare med fast storlek i synpunktsdatabasen: en rad per dag och kanal med antalet besök via en
// inbjudan och antalet genomförda första pass. Tabellen kan inte växa utöver dagar gånger kanaler och gallras efter
// GALLRING_DAGAR som synpunkterna. Kanalen hålls bara i besökarens sandlåda, så att ett genomfört pass räknas på rätt
// kanal. Missbruk kan bara blåsa upp siffrorna, och därför räknas en adressgrupp (HMAC, IPv6 per /48) högst
// MAX_PER_TIMME gånger i timmen. Det som går över räknas inte, men besökaren märker ingenting och nekas aldrig.
import { skapareFor } from './synpunkter.js';
import { KANALER } from '../public/js/inbjudan-regler.js';

export const MAX_PER_TIMME = 20;
const giltig = (k) => typeof k === 'string' && KANALER.some(([x]) => x === k);
export const giltigKanal = giltig;

export function sakra(db) {
  // Tabellerna för koder per inbjudan från före omgörningen tas bort.
  db.exec(`DROP TABLE IF EXISTS inbjudningar; DROP TABLE IF EXISTS inbjudan_besok;
  CREATE TABLE IF NOT EXISTS inbjudan_rakning (
    dag TEXT NOT NULL, kanal TEXT NOT NULL, besok INTEGER NOT NULL DEFAULT 0, pass INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (dag, kanal)
  );`);
  return db;
}

// Taket per adressgrupp och timme hålls i minnet. Det gäller bara hur mycket som räknas, aldrig vad besökaren får göra,
// och börjar om när servern startar om. Kartan har bara den pågående timmen: poster från tidigare timmar tas bort när
// timmen byts. Är kartan full räknas inga nya adressgrupper förrän nästa timme (fail closed), och ett globalt tak per
// timme gäller allt som räknas. Ingen besökare nekas något av det.
export class TakPerTimme {
  constructor({ maxPoster = 50000, globaltPerTimme = 5000 } = {}) {
    this.antal = new Map(); this.timme = null; this.totalt = 0; this.maxPoster = maxPoster; this.globaltPerTimme = globaltPerTimme;
  }
  far(adress, nu) {
    const timme = Math.floor(nu.getTime() / 3600_000);
    if (timme !== this.timme) { this.antal.clear(); this.timme = timme; this.totalt = 0; }
    if (this.totalt >= this.globaltPerTimme) return false;
    const nyckel = skapareFor(adress);
    const n = this.antal.get(nyckel);
    if (n === undefined && this.antal.size >= this.maxPoster) return false;
    if ((n ?? 0) >= MAX_PER_TIMME) return false;
    this.antal.set(nyckel, (n ?? 0) + 1);
    this.totalt++;
    return true;
  }
}
const standardTak = new TakPerTimme();

const dagFor = (nu) => nu.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
function rakna(db, kanal, kolumn, nu) {
  sakra(db);
  db.query(`INSERT INTO inbjudan_rakning (dag, kanal, ${kolumn}) VALUES (?, ?, 1) ON CONFLICT(dag, kanal) DO UPDATE SET ${kolumn} = ${kolumn} + 1`).run(dagFor(nu), kanal);
}

// Ett besök via en inbjudan. Svaret är alltid detsamma, så att det inte säger något om taket eller kanalen.
export function besok(db, body = {}, { nu = new Date(), adress = 'okänd', tak = standardTak } = {}) {
  const kanal = body?.kanal;
  if (giltig(kanal) && tak.far(adress, nu)) rakna(db, kanal, 'besok', nu);
  return { ok: true };
}

// Ett genomfört första pass för en besökare som kom via kanalen.
export function passKlar(db, kanal, { nu = new Date(), adress = 'okänd', tak = standardTak } = {}) {
  if (giltig(kanal) && tak.far(adress, nu)) rakna(db, kanal, 'pass', nu);
}

// Testledarens sammanställning: besök och genomförda pass per kanal, för alla dagar som finns kvar.
export function sammanstall(db) {
  sakra(db);
  const per = new Map(db.query('SELECT kanal, sum(besok) AS besok, sum(pass) AS pass FROM inbjudan_rakning GROUP BY kanal').all().map(r => [r.kanal, r]));
  const perKanal = KANALER.map(([k, text]) => ({ kanal: k, text, besok: per.get(k)?.besok ?? 0, pass: per.get(k)?.pass ?? 0 }));
  return { besok: perKanal.reduce((a, x) => a + x.besok, 0), pass: perKanal.reduce((a, x) => a + x.pass, 0), perKanal };
}

// Gallringen: dagarna som är äldre än gränsen.
export function stada(db, grans) {
  sakra(db);
  return db.query('DELETE FROM inbjudan_rakning WHERE dag < ?').run(dagFor(grans)).changes;
}
