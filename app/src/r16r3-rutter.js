// Runda 16, r3: API för handledningen av studenter (handledning.js) och barnmorskans förskrivning av preventivmedel
// (preventivmedel.js). Behörigheten prövas av behörighetsmotorn, och anrop som rör en patient loggas på patienten.
import * as handledning from './handledning.js';
import * as preventivmedel from './preventivmedel.js';

export function registreraRutter({ rutt, kravInloggad, medPatient }) {
  // Studenten ser sin handledare och tiden, handledaren sina studenter och studenterna på vårdenheten utan handledare.
  rutt('GET', '/api/handledning', (c) => handledning.oversikt(c.db, kravInloggad(c)));
  rutt('POST', '/api/handledning', (c) => [201, handledning.registrera(c.db, kravInloggad(c), c.body)]);
  rutt('POST', '/api/handledning/:id/avsluta', (c, id) => handledning.avsluta(c.db, kravInloggad(c), id));
  // Barnmorskans förskrivning: förslaget med preventivmedlen i katalogen, och förskrivningen.
  rutt('GET', '/api/patient/:id/preventivmedel', (c, id) => { kravInloggad(c); return medPatient(c, id, 'forskriva_preventivmedel', (atk) => preventivmedel.forslag(atk)); });
  rutt('POST', '/api/patient/:id/preventivmedel', (c, id) => {
    kravInloggad(c);
    return [201, medPatient(c, id, 'forskriva_preventivmedel', (atk) => require('./vardkontakt.js').knyt(atk, 'ordinationer', preventivmedel.forskriv(atk, c.body), c.body))];
  });
}
