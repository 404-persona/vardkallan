// Runda 15: sökorden som systemet föreslår i en mall för en patient och en kontakt (gränssnittet mellan r4 och r5).
// Rutten som ger mallen för en patient svarar med foreslagna: [{ sokord, varfor }], och anteckningsvyn visar dem överst
// och fäller ut resten.
//
// Runda 15, r5 (F4): i omvårdnadsanteckningen föreslår systemet de statusområden som gäller patienten i dag ur
// vårdplanen, förra omvårdnadsanteckningen, NEWS2, fallrisken, såren, smärtskattningen och vikten (omvardnadsprocess.js).
// Varje förslag har en kort förklaring. Bara den egna vårdenhetens uppgifter som den som skriver får se räknas, utan
// aktiva val och nödåtkomst, så att ett förslag aldrig röjer en annan eller spärrad vårdenhet. Andra mallar har inga
// förslag. Reglerna är demoregler.
import { Atkomst } from './atkomst.js';
import * as omvardnad from './omvardnadsprocess.js';

// mall är mallen ({ typ, sokord }) eller dess typ. kontakt är vårdkontakten anteckningen skrivs på, eller null.
export function foreslagnaSokord(atk, patientId, mall, kontakt = null) { // eslint-disable-line no-unused-vars
  const typ = typeof mall === 'string' ? mall : mall?.typ;
  if (typ !== omvardnad.TYP) return [];
  const a = patientId === atk.patientId ? atk : new Atkomst(atk.db, atk.personal, patientId, {}, 'las_omvardnad');
  // Sökorden som mallen har i dag, så att ett område som vårdgivaren har tagit bort ur mallen inte föreslås.
  const sokord = Array.isArray(mall?.sokord) ? mall.sokord.map(s => (typeof s === 'string' ? s : s?.namn)) : omvardnad.MALL.sokord;
  return omvardnad.foreslagnaOmraden(a).filter(f => sokord.includes(f.sokord));
}
