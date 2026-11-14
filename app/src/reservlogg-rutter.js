// Beslut 2026-11-14 (runda 15, r3): systemförvaltarens vy över loggen från reservservern. När reservservern har använts
// visar sidan Lagring att det finns en logg som inte är inläst, med antal rader, period och vilken kopia reservservern
// läste, och systemförvaltaren läser in den med ett klick. Kommandot bun src/reservserver.js --las-in-logg finns kvar som
// reserv. Bara loggen för den egna sandlådan visas (nyckeln för dess säkerhetskopior), och inläsningen loggas.
import * as reservserver from './reservserver.js';
import { kanRoll } from './atkomst.js';
import { Fel } from './db.js';

export function registreraRutter({ rutt, kravInloggad, kopior, reservloggKatalog = null }) {
  // Simulerade loggar i demon, per sandlåda, så att vyn går att pröva utan en reservserver.
  const minne = new Map();
  const kravSf = (c) => {
    const p = kravInloggad(c);
    if (!kanRoll(p, 'lagring')) throw new Fel(403, 'Bara systemförvaltningen läser in loggen från reservservern.', 'nekad');
    return p;
  };
  const nyckel = (c) => kopior.nyckel(c.s.kopieId);
  rutt('GET', '/api/reservlogg', (c) => { kravSf(c); return reservserver.loggOversikt(c.db, { katalog: reservloggKatalog, minne, nyckel: nyckel(c) }); });
  rutt('POST', '/api/reservlogg/las-in', (c) => {
    const p = kravSf(c);
    return reservserver.lasInFil(c.db, p, { katalog: reservloggKatalog, minne, nyckel: nyckel(c), fil: c.body?.fil });
  });
  // Demon: en simulerad logg från en reservserver för den här sandlådan, märkt som simulerad.
  rutt('POST', '/api/reservlogg/demo', (c) => { kravSf(c); return [201, reservserver.simuleraLogg(c.db, { minne, nyckel: nyckel(c) })]; });
}
