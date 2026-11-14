// Runda 15, r4: anteckningsvyn med underlaget, referenserna, utkastet som sparas av sig självt, varianterna, läs- och
// skrivordningen, de egna fraserna och mätningen av tecken i klickbudgeten (granskningen av mallarna, F1, F2, F5, F6
// och F9). Testnamnen för servertesterna (app/test/anteckningsvy-r15.test.js) och klickbudgeten, och tilläggen till
// posterna i Sussa 3.1.2, 3.1.3, 3.1.7 och 8.4. Mappningsfilerna lägger tilläggen härifrån ovanpå sina egna poster med
// medR15r4, så att ändringen ligger samlad här.
import { klickbudgetTest } from '../krav.js';
import { FLODEN } from '../klickbudget.js';

const U = 'Anteckningsvyn: underlaget > ';
const R = 'Anteckningsvyn: referenser > ';
const K = 'Anteckningsvyn: utkast > ';
const V = 'Anteckningsvyn: varianter och ordning > ';
const F = 'Anteckningsvyn: egna fraser > ';
const kb = (id) => klickbudgetTest(FLODEN.find(f => f.id === id));

export const T = {
  underlag: `${U}underlaget för en daganteckning har mätvärden sedan förra daganteckningen med pil, läkemedel under vårdtillfället och diagnoserna`,
  synligt: `${U}underlaget räknas bara på det som syns: en annan vårdenhets diagnos kräver aktivt val, och en spärrad vårdenhet ändrar inte svaret`,
  dos: `${U}en ändrad dos räknas bara på ordinationer som syns: med spärr på den förra ordinationens vårdenhet blir det en insättning`,
  akut: `${U}på akuten fyller systemet i kontaktorsaken och prioriteten ur triagen med källa, och skyddad identitet röjs inte`,
  roll: `${U}fel roll: vårdadministratören får inte mallen eller underlaget, och en okänd mall ger 404`,
  referens: `${R}ett värde ur underlaget sparas som referens med datum och källa, och en referens som inte håller sparas som vanlig text`,
  rattelse: `${R}en rättelse behåller referensen när texten står kvar`,
  utkast: `${K}utkastet sparas av sig självt på patienten och vårdkontakten, ändras med samma id och syns bara för den som skriver`,
  utkastSkydd: `${K}ett utkast som tillhör någon annan eller redan är signerat ändras inte, och fel roll får inte spara`,
  utkastBort: `${K}den som skriver kan ta bort sitt eget utkast, men inte någon annans eller en signerad anteckning`,
  avbrott: `${K}ett utkast som skrevs under avbrottet sparas från skrivkön, och en senare version av samma utkast ändrar samma anteckning`,
  variant: `${V}systemet väljer variant ur kontakten: telefon, psykiatrins vårdenhet, suicidtankar och kroniska sjukdomar på vårdcentralen`,
  variantMall: `${V}mallen för patienten har varianterna och de kroniska sjukdomarna som patienten har, ur diagnoserna som syns`,
  ordning: `${V}läsordningen visar bedömning och åtgärd först utan att ändra det sparade, och skrivordningen är vårdenhetens förval`,
  bedomning: `${V}den senaste bedömningen räknas bland anteckningarna som syns`,
  fraser: `${F}egna fraser har tak och gränser, sparas med personen och syns inte för någon annan`,
  egenOrdning: `${F}egen ordning på sökorden flyttar bara mallens sökord och gäller i mallen för personen`,
  // Beslut 2026-11-14 (anteckningsvy-r15b.test.js).
  flerVarianter: 'Anteckningsvyn: fler varianter > systemet väljer variant ur kontakten och patientens uppgifter: digital kontakt, barn, äldre med många läkemedel, palliativ vård och graviditet',
  barn: 'Anteckningsvyn: fler varianter > för ett barn visar underlaget tillväxten och vaccinationerna ur systemet, bara det som syns',
  aldre: 'Anteckningsvyn: fler varianter > äldre med många läkemedel räknas ur läkemedelslistan som syns, och en spärrad vårdenhets läkemedel räknas inte',
  signal: 'Anteckningsvyn: aktivitet och utloggning > aktivitetssignalen skickas högst en gång i minuten',
  bakgrund: 'Anteckningsvyn: aktivitet och utloggning > sparande i bakgrunden utan inmatning förlänger inte inloggningen: efter tiden utan aktivitet loggas den ut med texten sparad',
  inmatning: 'Anteckningsvyn: aktivitet och utloggning > inmatning i rutan räknas som aktivitet: en signal i minuten håller inloggningen vid liv medan användaren skriver',
};

const POSTER = {
  '3.1.7.1': {
    avsedd: 'uppfyllt_demo',
    tester: [T.underlag, T.synligt, T.dos, T.akut, T.referens, T.rattelse, T.barn, kb('daganteckning'), kb('omvardnadsanteckning')],
    losning: 'Varje uppgift registreras en gång och samma post används i översikten, Min journal, FHIR och överföringen till NLL. Vårdkontakten skapas när någon börjar dokumentera, ett vårdtillfälle följer med vid flytt utan att något registreras om, och orsaken från akutbesöket eller remissen följer med till inskrivningen och den nya kontakten. I formulären fyller systemet i åldern och det senaste mätvärdet, och ett nytt mätvärde i ett formulär registreras en gång bland mätvärdena. I anteckningarna visar systemet underlaget bredvid sökorden: kontaktorsaken, prioriteten ur triagen, mätvärden och provsvar sedan förra anteckningen av samma slag med en pil för förändringen, läkemedelsändringar under vårdkontakten och aktuella diagnoser. Ett klick för in värdet med datum som en referens till mätvärdet, ordinationen eller diagnosen, och i FHIR följer referensen med. Kontaktorsak och Prioritet fyller systemet i med källan.',
    expert: 'Systemet återanvänder det som redan finns: ordinationen skickas till NLL, kontakten skapas ur sammanhanget, formulären fyller i det journalen redan har, och i anteckningen står blodtrycket, dosändringen och diagnosen bredvid skrivrutan, så att ett klick ersätter att skriva om dem. Servern prövar varje referens mot det som den som skriver får se och drar aldrig in något i texten av sig självt, och klickbudgeten stoppar ett flöde där något skrivs för hand som systemet redan visste.',
    anmarkning: 'Principen gäller systemets egna flöden. Flödena mellan vårdgivare täcks av 3.2.2.3 och 3.5.1.1, och NLL är simulerad. Mätvärden från utrustning eller patienten som ännu inte är bedömda visas inte i underlaget. En referens visar värdet som det var när det fördes in; rättas mätvärdet efteråt står anteckningen kvar som den skrevs.',
  },
  '3.1.3.5': { tester: [T.underlag, T.referens, T.utkast, T.variant, T.flerVarianter, T.aldre] },
  // K2 1.6.1, justerbar tidsgräns: inmatning i rutan räknas som aktivitet, sparandet i bakgrunden gör det inte.
  '8.4.1.3': { tester: [T.signal, T.bakgrund, T.inmatning] },
  '3.1.2.3': { tester: [T.ordning, T.egenOrdning, kb('senaste-bedomning')] },
  '8.4.1.1': { tester: [kb('daganteckning'), kb('omvardnadsanteckning'), kb('senaste-bedomning')] },
};

// Lägger rundans tillägg ovanpå avsnittets poster. tester läggs till postens egna, och de andra fälten ersätter postens.
export const medR15r4 = (poster) => poster.map(x => {
  const p = Object.hasOwn(POSTER, x.id) ? POSTER[x.id] : null;
  if (!p || (x.avsedd === 'planerat' && !p.avsedd)) return x;
  const { tester = [], ...ovrigt } = p;
  return { ...x, ...ovrigt, tester: [...new Set([...(x.tester ?? []), ...tester])] };
});
