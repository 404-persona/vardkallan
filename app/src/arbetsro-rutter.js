// Runda 18, r5: API för lärdomarna från vårdpersonalens erfarenheter (listor utan överflöd).
//
//   GET /api/mallar/senaste   de anteckningsmallar som den inloggade senast har använt, högst tre, och bara bland dem som
//                             rollen får skriva med. Svaret innehåller bara mallarnas namn, inga patientuppgifter, och
//                             läser inga patientuppgifter, så inget loggas.
import { mallarForPerson } from './mallar-yrken.js';

export const MAX_SENASTE = 3;

export function registreraRutter({ rutt, kravInloggad, mallar }) {
  rutt('GET', '/api/mallar/senaste', (c) => {
    const p = kravInloggad(c);
    const tillatna = new Set(mallarForPerson(c.db, p, mallar(c)).map(m => m.typ));
    const rader = c.db.query('SELECT typ, max(skapad) AS senast FROM anteckningar WHERE forfattare_id = ? GROUP BY typ ORDER BY senast DESC LIMIT 20').all(p.id);
    return { typer: rader.map(r => r.typ).filter(t => tillatna.has(t)).slice(0, MAX_SENASTE) };
  });
}
