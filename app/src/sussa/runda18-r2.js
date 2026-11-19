// Runda 18, r2: att hitta rätt. Sökrutan Vad vill du göra?, ordlistan Jag letar efter och tomma vyer och fel som säger
// vad man kan göra i stället. Testnamnen för servertesterna (app/test/handlingssok.test.js), gränssnittstestet
// (test/hitta-ratt.cjs) och klickbudgeten, och tilläggen till posterna i Sussa 2.1, 3.1.8 och 8.4. Mappningsfilerna
// lägger tilläggen härifrån ovanpå sina egna poster med medR18r2, så att ändringen ligger samlad här. Runda 18, r5 lägger
// sina tillägg i samma fil (R5 nedan) för Sussa 2.1, 3.1.3, 3.4.1, 8.4 och KD1.2.
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
    losningTillagg: `${SOKRUTAN} Sökrutan tål stavfel, böjningar och sammansatta ord, förstår ord från andra journalsystem och säger vilken roll som gör det som rollen inte får.`,
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

// Runda 18, r5: lärdomar från vårdpersonalens erfarenheter av ett annat journalsystem. Servertesterna i
// app/test/arbetsro-r18.test.js, gränssnittstesterna i test/arbetsro.cjs och test/svarstider-klient.cjs.
const R = 'Två som arbetar med samma patient > ';
const L = 'Listor som uppdaterar sig själva > ';
const O = 'Listor utan överflöd > ';
const W = 'Svarstider i webbläsaren > ';
const GA = 'Gränssnitt > Arbetsro > ';
const GS = 'Gränssnitt > Svarstider i webbläsaren > ';
export const T5 = {
  dos: `${R}den som ändrar dosen efter en annan får besked om vem som ändrade vad, och inget sparas förrän den bekräftar`,
  utsatt: `${R}en ordination som någon annan har satt ut ger besked om vem, när och varför, och ingen kan ändra den`,
  behorighet: `${R}beskedet ges först efter behörigheten: den som inte får ordinera får samma nekande som förut`,
  flikar: `${R}två flikar som skriver i samma patients journal samtidigt får inga fel och inget tappas`,
  vila: `${L}en fråga i bakgrunden väcker inte en vilande sandlåda och räknas inte som aktivitet, och en vanlig fråga läser in den`,
  vilaBeh: `${L}samma behörighet som listan: utan inloggning ger frågan i bakgrunden 401 och ingen lista`,
  senaste: `${O}de senast använda mallarna är personens egna, högst tre och bara sådana som rollen får skriva med`,
  andraEnheter: `${O}andra vårdenheters formulär och lokala mallar finns inte i listan`,
  webb: `${W}mätningen räknas bara när den gäller gränssnittet som körs, och sidan Svarstider får den utan inloggning`,
};
export const G5 = {
  vet: `${GA}systemet frågar aldrig det det vet: inga val med ett enda alternativ, inget obligatoriskt fält för den inloggades yrke, vårdenhet eller namn, och tid för det som görs nu är förifylld`,
  osparad: `${GA}osparad text finns kvar när man går till en annan patient eller rad, systemet säger var den finns, och ett byte av patient märks i patienthuvudet`,
  flikar: `${GA}i två flikar med samma inloggning följer den andra fliken med till en ny patient utan att texten försvinner`,
  listor: `${GA}listor går att söka i på början eller en del av namnet, och mallarna har de senast använda och egna favoriter först`,
  levande: `${GA}inkorgen visar det nya av sig själv utan att fokus flyttas, och frågan räknas inte som aktivitet`,
  samtidig: `${GA}den som ändrar en dos som har ändrats i en annan flik får besked om vad som ändrats, och den egna ändringen sparas med ett klick`,
  aterkoppling: `${GS}95 procent av stegen ger synlig återkoppling inom 100 ms, också med processorn strypt fyra gånger`,
  resultat: `${GS}95 procent av stegen har sitt resultat inom 500 ms på en vanlig dator`,
  strypt: `${GS}95 procent av stegen har sitt resultat inom 1 sekund med processorn strypt fyra gånger`,
};
const R5 = {
  '2.1.1.1': {
    tester: [T5.flikar, T5.webb, T5.dos],
    losningTillagg: 'Två som arbetar med samma patient får aldrig ett fel som tappar text: en ändring av en ordination som någon annan har ändrat sparas inte, och beskedet säger vem som ändrade vad, med den egna ändringen kvar. Svarstiderna mäts också i webbläsaren, vanligt och med processorn strypt fyra gånger, och visas på sidan Svarstider.',
  },
  '3.1.3.5': {
    tester: [T5.senaste, T5.andraEnheter],
    losningTillagg: 'Mallarna och formulären visas med förslagen för situationen, de senast använda och egna favoriter först, och resten i bokstavsordning med ett sökfält. Andra vårdenheters formulär och lokala mallar finns inte i listan.',
  },
  '3.4.1.8': {
    tester: [T5.vila, T5.vilaBeh],
    losningTillagg: 'Arbetslistan, inkorgen, väntrummet och avdelningens planering visar det nya av sig själva, utan att någon behöver ladda om, med samma behörighet som listan.',
  },
  '8.4.1.1': {
    tester: [G5.vet, G5.osparad, G5.flikar, G5.listor, G5.levande, G5.samtidig, G5.aterkoppling, G5.resultat, G5.strypt],
    anmarkningTillagg: 'Runda 18 (r5): lärdomar från vårdpersonalens erfarenheter av ett annat journalsystem prövas automatiskt i varje roll: att systemet inte frågar det det vet, att osparad text följer med när man byter patient, att listor går att söka i och uppdaterar sig själva, att två som arbetar med samma patient får ett begripligt besked, och svarstiden från klick till återkoppling och resultat, också med processorn strypt fyra gånger.',
  },
  'KD1.2.1.3': {
    tester: [G5.aterkoppling, G5.resultat, G5.strypt],
    losningTillagg: 'Svarstiden mäts också i webbläsaren för klickbudgetens flöden, från klick till synlig återkoppling och till färdigt resultat, vanligt och med processorn strypt fyra gånger, och visas på sidan Svarstider med målen 100 ms, 500 ms och 1 sekund.',
  },
};

const lagg = (a, b) => (b ? `${a ?? ''}${a ? ' ' : ''}${b}` : a);

// Lägger rundans tillägg ovanpå avsnittets poster. tester läggs till postens egna, och tilläggen läggs efter postens
// lösning, expertroll och anmärkning. En planerad post ändras inte.
const ett = (x, p) => (!p || x.avsedd === 'planerat' ? x : {
  ...x,
  tester: [...new Set([...(x.tester ?? []), ...(p.tester ?? [])])],
  losning: lagg(x.losning, p.losningTillagg),
  expert: lagg(x.expert, p.expertTillagg),
  anmarkning: lagg(x.anmarkning, p.anmarkningTillagg),
});
export const medR18r2 = (poster) => poster.map(x => ett(ett(x, Object.hasOwn(POSTER, x.id) ? POSTER[x.id] : null), Object.hasOwn(R5, x.id) ? R5[x.id] : null));
