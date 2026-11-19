// Runda 18, r2: att hitta rätt. Sökrutan Vad vill du göra?, ordlistan Jag letar efter och tomma vyer och fel som säger
// vad man kan göra i stället. Testnamnen för servertesterna (app/test/handlingssok.test.js), gränssnittstestet
// (test/hitta-ratt.cjs) och klickbudgeten, och tilläggen till posterna i Sussa 2.1, 3.1.8 och 8.4. Mappningsfilerna
// lägger tilläggen härifrån ovanpå sina egna poster med medR18r2, så att ändringen ligger samlad här.
import { klickbudgetTest } from '../krav.js';
import { FLODEN } from '../klickbudget.js';

const S = 'Vad vill du göra > ';
const G = 'Gränssnitt > Hitta rätt > ';
const kb = (id) => klickbudgetTest(FLODEN.find(f => f.id === id));

// Servertesterna i app/test/handlingssok.test.js.
export const T = {
  matcha: `${S}vardagliga ord, stavfel, böjningar och synonymer hittar rätt handling`,
  roll: `${S}listan byggs på servern ur behörigheten, så att varje roll bara får det rollen får`,
  saknas: `${S}en handling som rollen saknar säger vilken roll som gör den, utan patientuppgifter`,
  patient: `${S}med en öppen patient pekar handlingen på patientens flik, och en patient som inte är öppnad eller inte får ses ger samma svar som ingen patient`,
  skyddad: `${S}skyddad identitet: svaret innehåller aldrig namn eller personnummer, bara det id som anroparen skickade`,
  fraga: `${S}ett nummer eller ett namn som inte är en handling föreslår sökning av patient, och i en öppen journal sökning i journalen`,
  delegering: `${S}undersköterskan utan giltig delegering får veta att det krävs en delegering, och studenten utan handledning att den saknas`,
  loggar: `${S}sökningen kräver personalens inloggning, loggar inget och tar bara en fråga av rimlig längd`,
  ordlista: `${S}Jag letar efter: ordlistan kopplar ord från andra system och vardagen till Vårdkällans namn och vy, neutralt och utan namn på andra system`,
  texter: `${S}texterna är svenska utan tankstreck och ellipser, och varje handling pekar på en vy eller flik som finns i gränssnittet`,
};

// Gränssnittstestet i test/hitta-ratt.cjs.
export const GT = {
  roller: `${G}sökrutan nås från sidhuvudet och med Ctrl K i varje roll, och varje förslag öppnar en vy som rollen får`,
  patient: `${G}med en öppen patient öppnar sökrutan formuläret i patientens journal, och utan patient väntar handlingen tills patienten öppnas`,
  saknas: `${G}en handling som rollen saknar säger vilken roll som gör den, och ett ord från ett annat system förklaras`,
  matning: `${G}mätningen av sökningar anropas genom r1:s funktion när den finns, utan söktext med siffror`,
  ordlista: `${G}ordlistan Jag letar efter går att filtrera, länkar bara till det rollen får och är öppen utan inloggning`,
  tomma: `${G}varje tom lista och varje fel i rollernas vyer och i journalens flikar säger vad man kan göra i stället`,
};

const SOKRUTAN = 'Sökrutan Vad vill du göra? i sidhuvudet (och Ctrl K) tar emot egna ord, till exempel sjukskriv, ge dos eller boka tid, och visar de handlingar som rollen får. När en patient är öppen leder valet till rätt flik i patientens journal med formuläret öppet, och ett nummer eller ett namn som inte är en handling blir en sökning efter patienten eller i den öppna journalen.';

const POSTER = {
  '3.1.8.1': {
    tester: [T.matcha, T.roll, T.patient, T.skyddad, T.loggar],
    losningTillagg: SOKRUTAN,
    expertTillagg: 'Sökrutan tål stavfel, böjningar och sammansatta ord, förstår ord från andra journalsystem och säger vilken roll som gör det som rollen inte får.',
  },
  '3.1.8.2': {
    tester: [T.matcha, T.fraga, T.ordlista],
    losningTillagg: 'Sökning efter handlingar med egna ord i sökrutan Vad vill du göra?, och ordlistan Jag letar efter med ord från andra journalsystem och vardagen.',
  },
  '2.1.1.1': {
    tester: [T.roll, T.saknas, T.texter],
    losningTillagg: 'En konsekvent väg in för alla roller: sökrutan Vad vill du göra? i sidhuvudet ger samma handlingar som menyn och flikarna, byggda ur samma behörighet.',
  },
  '8.4.1.1': {
    tester: [kb('sokrutan-remiss'), kb('sokrutan-blodtryck'), kb('sokrutan-ge-dos'), GT.roller, GT.patient, GT.saknas, GT.matning, GT.ordlista, GT.tomma],
    anmarkningTillagg: 'Runda 18 (r2): den som testar första gången hittar rätt med sökrutan Vad vill du göra? och ordlistan Jag letar efter, och ett automatiskt test går igenom varje vy i menyn och varje flik i journalen för varje demoroll och kräver att varje tom lista och varje fel säger vad man kan göra i stället. Testet bedömer texten med regler, inte med användare.',
  },
  '8.4.1.3': {
    tester: [GT.tomma],
    anmarkningTillagg: 'Runda 18 (r2): tomma lägen och fel säger vad man kan göra i stället, med en länk eller knapp när det finns en nästa handling, i linje med WCAG 3.3.3 (förslag vid fel).',
  },
};

const lagg = (a, b) => (b ? `${a ?? ''}${a ? ' ' : ''}${b}` : a);

// Lägger rundans tillägg ovanpå avsnittets poster. tester läggs till postens egna, och tilläggen läggs efter postens
// lösning, expertroll och anmärkning. En planerad post ändras inte.
export const medR18r2 = (poster) => poster.map(x => {
  const p = Object.hasOwn(POSTER, x.id) ? POSTER[x.id] : null;
  if (!p || x.avsedd === 'planerat') return x;
  return {
    ...x,
    tester: [...new Set([...(x.tester ?? []), ...(p.tester ?? [])])],
    losning: lagg(x.losning, p.losningTillagg),
    expert: lagg(x.expert, p.expertTillagg),
    anmarkning: lagg(x.anmarkning, p.anmarkningTillagg),
  };
});
