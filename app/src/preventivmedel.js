// Runda 16, r3: barnmorskans förskrivning av preventivmedel.
//
// En legitimerad barnmorska med bevis om förskrivningsrätt får förskriva läkemedel för antikonception (SOSFS 1996:21),
// och vilka läkemedel det är står i Läkemedelsverkets föreskrifter HSLF-FS 2021:75, 2 kap. 9 § och bilaga 3:
// kombinerade p-piller och sekvenspreparat (ATC G03AA och G03AB), gestagener (G03AC), akut-p-piller (levonorgestrel
// G03AD01 och ulipristal G03AD02), p-ring (G02BB01) och hormonspiral (G02BA03). Barnmorskan får ordinera det som hon får
// förskriva (HSLF-FS 2017:37 5 kap. 2 §). Doxycyklin mot verifierad klamydia ingår också i föreskriften, men kräver en
// diagnos som barnmorskan inte registrerar i demon, så det är inte med här. Kopparspiralen är ingen läkemedelspost.
//
// Systemet är experten: barnmorskan väljer bara preventivmedlet. Systemet visar bara de läkemedel i katalogen som
// förskrivningsrätten omfattar, fyller i ordinationsorsaken (antikonception), doseringen för produkten och uppföljningen
// om ett år, och kontrollerar mot överkänslighet och andra läkemedel med samma regler som läkarens ordination. En
// allvarlig varning stoppar förskrivningen och hänvisar till läkaren, eftersom bedömningen av en varning hör till den
// som har vidare förskrivningsrätt. Allt annat stoppas med en förklaring på vanlig svenska.
import { Fel, addDagar, idag } from './db.js';
import * as lakemedel from './lakemedel.js';

export const ATC = ['G03AA', 'G03AB', 'G03AC', 'G03AD01', 'G03AD02', 'G02BB01', 'G02BA03'];
export const KALLA = 'Läkemedelsverkets föreskrifter (HSLF-FS 2021:75) om förordnande och utlämnande av läkemedel och teknisk sprit, 2 kap. 9 § och bilaga 3, och Socialstyrelsens föreskrifter om barnmorskors förskrivning av hormonella antikonceptionella medel (1996:21).';
export const ORSAK = 'Antikonception';
export const UPPFOLJNING_DAGAR = 365;
export const arPreventivmedel = (atc) => typeof atc === 'string' && ATC.some(a => atc.startsWith(a));

// Doseringen som systemet föreslår för läkemedelsformen. Akut-p-piller tas en gång, de andra dagligen.
function standard(lm) {
  if (lm.atc.startsWith('G03AD')) return { dosering: '1 tablett en gång, så snart som möjligt efter samlaget', dos: 1, dosEnhet: 'tablett', tider: [], typ: 'tillfallig' };
  if (lm.atc.startsWith('G02BB')) return { dosering: '1 vaginalring i 3 veckor, sedan 1 veckas uppehåll', dos: 1, dosEnhet: 'st', tider: [], typ: 'staende' };
  if (lm.atc.startsWith('G02BA')) return { dosering: 'Insättning av hormonspiralen', dos: 1, dosEnhet: 'st', tider: [], typ: 'tillfallig' };
  return { dosering: '1 tablett dagligen', dos: 1, dosEnhet: 'tablett', tider: ['08:00'], typ: 'staende' };
}

const katalog = (db) => db.query('SELECT * FROM katalog ORDER BY namn, styrka').all().filter(k => arPreventivmedel(k.atc));
const lakemedelUt = (k) => ({ id: k.id, namn: k.namn, substans: k.substans, styrka: k.styrka, form: k.form, atc: k.atc, ...standard(k) });

// Det som barnmorskan behöver för att förskriva: preventivmedlen i katalogen med förslag på dosering, orsaken och
// uppföljningen. Bara för den som har förskrivningsrätten.
export function forslag(atk) {
  atk.krav('forskriva_preventivmedel');
  // HOSP: förskrivningsrätten som barnmorska ur Socialstyrelsens register. Utan den visas inga preventivmedel, och
  // systemet säger varför (hosp.js).
  const h = require('./hosp.js').forskrivning(atk.db, atk.personal, { typ: 'preventivmedel' });
  return {
    kan: h.kan, lakemedel: h.kan ? katalog(atk.db).map(lakemedelUt) : [], ordinationsorsak: ORSAK, uppfoljningsdatum: addDagar(idag(), UPPFOLJNING_DAGAR),
    varfor: h.kan ? 'Som barnmorska förskriver du hormonella preventivmedel, akut-p-piller, p-ring och hormonspiral. Andra läkemedel ordineras av en läkare.' : h.varfor,
    kalla: KALLA,
  };
}

// Förskrivningen. Ordinationen sparas som läkarens, med samma kontroller och överföring till Nationella läkemedelslistan,
// men med handlingen forskriva_preventivmedel och barnmorskan som förskrivare.
export function forskriv(atk, inp = {}) {
  atk.krav('forskriva_preventivmedel');
  const lm = typeof inp.lakemedelId === 'string' ? atk.db.query('SELECT * FROM katalog WHERE id = ?').get(inp.lakemedelId) : null;
  if (!lm) throw new Fel(400, 'Välj preventivmedlet.', 'ogiltig', { falt: ['lakemedelId'] });
  if (!arPreventivmedel(lm.atc)) {
    throw new Fel(403, `${lm.namn} är inte ett preventivmedel som barnmorskan får förskriva. Barnmorskans förskrivningsrätt gäller hormonella preventivmedel, akut-p-piller, p-ring och hormonspiral. Be en läkare ordinera det.`, 'nekad', { falt: ['lakemedelId'] });
  }
  const s = standard(lm);
  const start = typeof inp.start === 'string' && inp.start ? inp.start : idag();
  const kropp = {
    // Doseringen är systemets för produkten, så att texten aldrig säger något annat än dosen.
    lakemedelId: lm.id, dosering: s.dosering,
    dos: s.dos, dosEnhet: s.dosEnhet, tider: s.tider, typ: s.typ,
    ordinationsorsak: ORSAK, start, uppfoljningsdatum: typeof inp.uppfoljningsdatum === 'string' && inp.uppfoljningsdatum ? inp.uppfoljningsdatum : addDagar(start, UPPFOLJNING_DAGAR),
  };
  try {
    // En allvarlig varning kvitteras aldrig av barnmorskan: kvitteringar från klienten följer inte med.
    return lakemedel.spara(atk, kropp, { handling: 'forskriva_preventivmedel', historikText: `Förskriven av barnmorskan ${atk.personal.namn}` });
  } catch (e) {
    if (e instanceof Fel && e.extra?.kraverKvittens) {
      throw new Fel(409, 'Systemet varnar för en allvarlig risk med preventivmedlet för patienten. Barnmorskan förskriver inte trots en allvarlig varning. Be en läkare bedöma varningen och ordinera.', 'varning', { varningar: e.extra.varningar, demoregler: true });
    }
    throw e;
  }
}
