// HOSP: rutterna för legitimationen och förskrivningsrätten ur Socialstyrelsens register (hosp.js). Systemförvaltaren
// ser personalens uppgifter och kan hämta om dem, och var och en ser sina egna. Ingen annan ser något ur HOSP-svaret.
import * as hosp from './hosp.js';

export function registreraRutter({ rutt, kravInloggad }) {
  rutt('GET', '/api/hosp', (c) => hosp.lista(c.db, kravInloggad(c)));
  rutt('POST', '/api/hosp/hamta', (c) => hosp.hamtaOm(c.db, kravInloggad(c), { personalId: c.body?.personalId }));
  rutt('GET', '/api/hosp/mig', (c) => hosp.mig(c.db, kravInloggad(c)));
}
