// Runda 18, r5: API för lärdomarna från vårdpersonalens erfarenheter (listor utan överflöd).
//
//   GET /api/mallar/senaste   de anteckningsmallar som den inloggade senast har använt, högst tre, och bara bland dem som
//                             rollen får skriva med. Svaret innehåller bara mallarnas namn, inga patientuppgifter, och
//                             läser inga patientuppgifter, så inget loggas.
//   GET /api/drift/webblasare  svarstiderna i webbläsaren för klickbudgetens flöden, vanligt och med processorn strypt
//                             fyra gånger (test/svarstider-klient.cjs), med om mätningen gäller gränssnittet som körs.
//                             Öppen utan inloggning, som sidan Svarstider.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mallarForPerson } from './mallar-yrken.js';
import { gransnittHash, PUBLIC } from './klientresultat.js';

export const SVARSTIDER_FIL = fileURLToPath(new URL('../svarstider-klient.json', import.meta.url));
let hashCache = null;
export function webblasarSvarstider(fil = SVARSTIDER_FIL, publicDir = PUBLIC) {
  let d = null;
  try { d = existsSync(fil) ? JSON.parse(readFileSync(fil, 'utf8')) : null; } catch { d = null; }
  if (!d) return { finns: false, text: 'Svarstiderna i webbläsaren är inte mätta för det här gränssnittet än.' };
  hashCache ??= existsSync(publicDir) ? gransnittHash(publicDir) : null;
  return { finns: true, aktuell: Boolean(hashCache && d.gransnittHash === hashCache), tid: d.tid, webblasare: d.webblasare, mal: d.mal, lagen: d.lagen };
}

export const MAX_SENASTE = 3;

export function registreraRutter({ rutt, kravInloggad, mallar }) {
  rutt('GET', '/api/drift/webblasare', () => webblasarSvarstider());
  rutt('GET', '/api/mallar/senaste', (c) => {
    const p = kravInloggad(c);
    const tillatna = new Set(mallarForPerson(c.db, p, mallar(c)).map(m => m.typ));
    const rader = c.db.query('SELECT typ, max(skapad) AS senast FROM anteckningar WHERE forfattare_id = ? GROUP BY typ ORDER BY senast DESC LIMIT 20').all(p.id);
    return { typer: rader.map(r => r.typ).filter(t => tillatna.has(t)).slice(0, MAX_SENASTE) };
  });
}

// Adresserna som inte skapar en sandlåda.
export const UTAN_SESSION = ['/api/drift/webblasare'];
