// Tillägg 2026-11-19 (Jonas), runda 18, r1: bjud in en kollega och dela i sociala medier. Gränssnittet och servern
// (src/inbjudan.js) delar texten, kanalerna och länkarna.
//
// Systemet skickar aldrig något självt och sparar inga adresser. Testaren får en färdig text med länken och skickar den
// själv: Dela (webbläsarens delning), Kopiera, E-post (testarens eget e-postprogram) eller tjänsternas egna delningssidor
// som vanliga länkar, utan skript, knappar eller spårare från tjänsterna. Länken går alltid till testinbjudans startsida
// och har en slumpad kod för inbjudan och kanalen, som bara visar att besökaren kom via en inbjudan och varifrån.

// Kanalen sparas, texten visas.
export const KANALER = [
  ['lank', 'Länk'],
  ['epost', 'E-post'],
  ['linkedin', 'LinkedIn'],
  ['facebook', 'Facebook'],
  ['x', 'X'],
];
export const KOD = /^I-[A-HJ-NP-Z2-9]{6}$/;
export const BESOK = /^B-[A-HJ-NP-Z2-9]{6}$/;

// Länken till testinbjudans startsida med inbjudans kod och kanalen.
export const lankFor = (origin, kod, kanal) => `${origin}/#/testa?i=${encodeURIComponent(kod)}&k=${encodeURIComponent(kanal)}`;

export const AMNE = 'Pröva Vårdkällan, ett öppet journalsystem';
// Texten är kort och neutral: vad Vårdkällan är, att passet tar fem minuter och att patienterna är påhittade.
export const inbjudningstext = (lank) => `Jag har testat Vårdkällan, ett öppet journalsystem med fri källkod som byggs efter den kravspecifikation som regionerna i Sussa samverkan tog fram. Ett första pass tar ungefär fem minuter och kräver ingen inloggning eller förkunskap. Demon har bara påhittade patienter. Du kan pröva här: ${lank}`;
export const kortText = 'Ett öppet journalsystem med fri källkod. Ett första pass tar ungefär fem minuter, och demon har bara påhittade patienter.';

// Delningssidorna hos tjänsterna. Vanliga länkar som öppnas i en ny flik; inget laddas från tjänsterna förrän testaren
// själv klickar, och inget skickas förrän testaren själv publicerar där.
export function delningslankar(origin, kod) {
  const u = (k) => encodeURIComponent(lankFor(origin, kod, k));
  return {
    epost: `mailto:?subject=${encodeURIComponent(AMNE)}&body=${encodeURIComponent(inbjudningstext(lankFor(origin, kod, 'epost')))}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u('linkedin')}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u('facebook')}`,
    x: `https://x.com/intent/post?text=${encodeURIComponent(`${AMNE}. ${kortText}`)}&url=${u('x')}`,
  };
}

// Det som sparas om inbjudningar. Visas i dialogen och på sidan Om demon.
export const INBJUDAN_SPARAS = 'När du bjuder in någon skapar systemet en slumpad kod för länken. Koden sparas med tiden, men utan något om dig. Kommer någon via länken sparas bara kanalen (länk, e-post, LinkedIn, Facebook eller X), tiden och om besökaren gjorde klart ett första pass. Koden kopplas aldrig till dina eller besökarens svar, synpunkter eller mätningar, och inga e-postadresser eller namn sparas.';
