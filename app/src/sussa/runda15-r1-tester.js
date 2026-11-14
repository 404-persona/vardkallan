// Runda 15, r1: testnamnen för tillitsnivån och SITHS som flerfaktor (test/tillitsniva-r15.test.js och gränssnittstesterna).
// Används av kravregistret (L5 i krav.js) och Sussa-mappningen för 5.2.1.1 och 5.2.1.6.
export const TESTER_TILLITSNIVA_R15 = [
  'Tillitsnivån tolkas ur acr > tillitsnivå: Ineras, DIGG:s och eIDAS identifierare tolkas, en självdeklarerad nivå räknas lägre och ett okänt eller saknat värde är en faktor',
  ...[
    'simulerat SITHS-kort: demorollen loggar in direkt med tillitsnivå 3, också med en registrerad faktor',
    'simulerat SITHS-kort: utan kortet i demon (tillitsnivå 2) kompletteras inloggningen med faktorn, och utan faktor leds personen till att registrera en',
    'biljett med nivå 3 från en godkänd inloggningstjänst räknas som flerfaktor, också med en registrerad faktor',
    'biljett med nivå 2 stoppas när tjänsten kräver nivå 3, och förklaringen säger vad som gäller och vem som kan ändra det',
    'biljett med nivå 2 godtas när tjänstens lägsta nivå är 2, men ger behörighet först efter passkey eller kod',
    'saknad nivå stoppas med tjänstens standard, och med lägsta nivå 1 räknas den som en faktor',
    'en osignerad biljett eller en biljett med fel nyckel godtas aldrig, också med nivå 4',
    'en inloggningstjänst som inte är godkänd går inte att logga in genom, oavsett nivå',
    'lägsta nivå per tjänst: ändringen kräver fyra ögon och motivering, systemet förklarar nivåerna och säkerhetsloggen visar beslutet',
    'loggen: säkerhetsloggen visar metod och tillitsnivå för lyckade och misslyckade inloggningar, och sessionen visar dem',
    'känsliga handlingar: nödåtkomst, att häva en spärr och fyra ögon kräver en inloggning med flerfaktor, och en session utan nivå stoppas med förklaring',
  ].map(t => `SITHS och tillitsnivå 3 som flerfaktor > ${t}`),
  ...[
    'acr_values: inloggningsbegäran ber om tjänstens lägsta nivå och högre, och nivån i svaret prövas ändå',
    'acr_values: en tjänst som anger sina nivåer får bara de nivåer den stödjer, från lägsta nivån',
  ].map(t => `E-legitimation i Min journal och acr_values > ${t}`),
];
// Invånarens e-legitimation i Min journal (L5).
export const TESTER_E_LEGITIMATION_R15 = [
  'e-legitimation: invånaren loggar in direkt med tillitsnivå 3, också med en faktor',
  'e-legitimation: med lägre tillitsnivå kompletteras inloggningen i Min journal med faktorn, och utan faktor leds invånaren till registreringen',
  'e-legitimation: ombud och vårdnadshavare loggar in som förut, med tillitsnivå 3',
].map(t => `E-legitimation i Min journal och acr_values > ${t}`);
