// Runda 18, r3: ekonomin och datalagringen. Bör-kraven B1 till B5 (borkrav.js) räknas fram ur posterna 3.4.4.4, 7.1.1.1,
// 7.1.1.2 och 7.1.2.1, och KD1.1.3.5 gäller lagringen av äldre uppgifter i en egen databas (lagring-aldre.js). Testnamnen
// är de exakta namnen i test/ekonomi-r18.test.js, test/lagring-aldre.test.js och klickbudgeten.
import { klickbudgetTest } from '../krav.js';
import { FLODEN } from '../klickbudget.js';

const flode = (id) => klickbudgetTest(FLODEN.find(f => f.id === id));
const K = 'Ekonomi 1.8: kostnader i vårdprocessen > ';
const P = 'Ekonomi 1.8: priser där beslutet fattas > ';
const H = 'Ekonomi 1.8: uthämtning och betalning av hjälpmedel > ';
const A = 'Ekonomi 1.8: avtal med betalningsmottagare > ';
const V = 'Ekonomi 1.8: kostnader per vårdenhet > ';
const L = 'Lagringen för äldre uppgifter > ';

export const T18 = {
  kostnad: `${K}rutan har prover och undersökningar, källan för varje belopp och jämförelsen med en jämförbar process i samma DRG-grupp`,
  sparr: `${K}spärr: prover på en spärrad vårdenhet syns inte, och hela svaret är detsamma med och utan den dolda beställningen`,
  lakemedel: `${P}läkemedlet har sitt pris och periodens vara i katalogen, utan något extra steg, och vårdadministratören ser inga priser`,
  prover: `${P}beställningen av prover och undersökningar har priset för varje analys och paket`,
  hjalpmedel: `${P}hjälpmedlen har priset och basmodellen ur sortimentet som likvärdigt billigare alternativ`,
  uthamtning: `${H}ett hjälpmedel som hämtas ut är förskrivet tills patienten hämtar det i receptionen och betalar, med kvitto, och betalningen finns i kassan och underlaget`,
  uthamtningProvas: `${H}uthämtningen prövas: en annan vårdenhet, en roll utan kassa och en betalning som inte ändras`,
  avtal: `${A}ett avtal med en annan region ger rabatt på utomlänsvården i underlaget, och bara ekonomen registrerar avtal`,
  kommun: `${A}utan överenskommelse betalar kommunen genomsnittskostnaden i riket enligt 5 kap. 6 §, och med en överenskommelse avtalets pris`,
  vardenhet: `${V}verksamhetschefen ser sina vårdenheter per månad utan patientuppgifter, ekonomen ser alla, och läkaren inte alls`,
  flytt: `${L}filer äldre än lagringsklassens gräns flyttas till en egen databas och läses därifrån med samma innehåll`,
  igen: `${L}flytten går att köra igen utan dubbletter, och inget försvinner`,
  failClosed: `${L}regeln och kontrollsumman prövas på varje rad, och en rad som inte stämmer stoppar hela flytten`,
  behorighet: `${L}behörighet och loggning: bara systemförvaltningen flyttar, och en flyttad fil prövas som förut`,
  gallring: `${L}gallring och radering tar bort filen också i lagringen för äldre uppgifter`,
  samman: `${L}sammanslagning av journaler: en flyttad fil följer med och går att läsa i den gällande journalen`,
  kopia: `${L}säkerhetskopian, provåterläsningen, en ny miljö och uttaget per huvudman tar med den äldre databasen`,
  klassning: 'Lagringsklasser för alla tabeller > varje tabell som någon modul skapar, också de som skapas först när de används, har en klass för lagringen och uttaget',
  api: 'Lagringen för äldre uppgifter i API:t > API: systemförvaltaren ser lagringen för äldre uppgifter på sidan Lagring och flyttar, och svaret har inga patientuppgifter',
};

const POSTER = {
  '7.1.1.2': {
    avsedd: 'uppfyllt_demo',
    tester: [T18.avtal, T18.kommun, T18.uthamtning, T18.hjalpmedel],
    losning: 'Prislistor per vårdenhet med versioner, giltighetstid och historik, som bara ekonomen ändrar och som loggas. Betalningsmottagaren räknas fram: egen region, en annan region vid utomlänsvård, Migrationsverket för asylsökande med LMA-kort, kommunen för dygn med betalningsansvar, patienten eller vårdnadshavaren för avgiften, och väntan vid reservnummer. Sedan version 1.8 har ekonomen avtal med betalningsmottagarna: en annan region med rabatt på utomlänsvården och en kommun med överenskommet pris per vårddygn för utskrivningsklara patienter. Utan överenskommelse räknar systemet med genomsnittskostnaden i riket för ett vårddygn, som 5 kap. 6 § lagen (2017:612) säger. Underlaget har avtalet, beloppet före rabatten och kassans kvitto för hjälpmedelsavgifter som har betalats vid uthämtningen. Vårdtillfällen grupperas i DRG-liknande demogrupper, och medicinskt färdigbehandlad ingår i underlaget, antingen från läkarens registrering eller från underrättelsen om utskrivningsklar i den samordnade planeringen.',
    expert: 'Systemet avgör betalningsmottagaren ur identitet, ålder, folkbokföring och LMA-kort, väljer själv det avtal som gällde dagen för vården och faller tillbaka på lagens belopp när det saknas, grupperar vårdtillfället ur den ansvariga vårdenhetens huvuddiagnos och tar medicinskt färdigbehandlad från den samordnade planeringen, så att ingen behöver kunna riksavtalet, lagen eller DRG.',
    anmarkning: 'DRG-grupperna är en egen demogruppering och inte NordDRG, som är licensierad och inte får användas. Folkbokföringen och den nationella tjänsten för utomlänsvård är simulerade, och fältlistan för utomlänsvård bygger inte på tjänstens specifikation, som inte är läst. Avtalen i demon är påhittade, och genomsnittskostnaden i riket per vårddygn är ett demovärde, inte det belopp som gäller. Ersättning från andra länder enligt EU-förordningen och den nordiska konventionen hanteras inte.',
  },
  '7.1.2.1': {
    avsedd: 'uppfyllt_demo',
    tester: [T18.kostnad, T18.sparr, T18.lakemedel, T18.prover, T18.hjalpmedel, T18.vardenhet, flode('hamta-ut-hjalpmedel'), flode('kostnader-vardenhet')],
    losning: 'I patientens översikt finns en ruta med kostnaden hittills för det pågående vårdtillfället eller dagens vårdkontakt: vårddygn, läkemedel, material, åtgärder, hjälpmedel och sedan version 1.8 prover och undersökningar, med källan för varje belopp (prislistans version och giltighet, schablonerna och laboratoriernas priser). Rutan jämför med ersättningen för ett jämförbart vårdtillfälle i samma DRG-grupp och visar patientens högkostnadsskydd med rabatterna. Där beslutet fattas visas priset diskret: i läkemedelskatalogen när läkaren ordinerar, med periodens vara i utbytesgruppen när den är billigare, vid beställning av prover och undersökningar per analys och paket, och vid förskrivning av hjälpmedel med basmodellen ur sortimentet som likvärdigt alternativ. Verksamhetschefen och ekonomen ser kostnaderna per vårdenhet och månad som diagram och tabell. Läkare och sjuksköterskor ser hela rutan, vårdadministratören avgifterna, högkostnadsskyddet och hjälpmedlen att ta betalt för.',
    expert: 'Systemet räknar kostnaden av sig självt ur det som har hänt, säger var varje belopp kommer ifrån och jämför med DRG-gruppen. Priset visas där beslutet fattas utan att något flöde får fler steg, och systemet föreslår bara likvärdiga alternativ: läkaren bestämmer.',
    anmarkning: 'Priserna är påhittade demopriser, inte TLV:s eller någon regions priser, och utbytesgrupperna och periodens vara är påhittade. DRG är en demogruppering, inte NordDRG. Rutan räknar bara på de besök och beställningar användaren får se, så den kan visa mindre än patienten har betalat när det finns besök på en annan vårdenhet eller en spärrad enhet. Att räkna över allt skulle röja att dolda besök finns, och patienten ser hela högkostnadsskyddet i Min journal. Jämförelsen bygger på DRG-gruppens ersättning, inte på kostnaden för andra patienters vårdtillfällen. Vårdkällan har inget mörkt läge i övrigt, så diagrammet för verksamhetschefen följer datorns mörka läge i sin egen ruta.',
  },
  'KD1.1.3.5': {
    avsedd: 'uppfyllt_demo',
    tester: [T18.flytt, T18.igen, T18.failClosed, T18.behorighet, T18.gallring, T18.samman, T18.kopia, T18.api, T18.klassning],
    losning: 'Varje uppgift hör till en huvudman genom den enhet den registrerades på, och en huvudmans uppgifter tas ut till en egen databas med samma tabeller, index och triggrar (se KD1.1.3.4). Sidan Lagring visar databasens storlek, antal rader per tabell och de största tabellerna, och en prognos ur tillväxten för ett, tre och tio år, också med fördubblad aktivitet. Lagringsklasserna har kvalitet, svarstid och pris per gigabyte. Sedan version 1.8 flyttar systemet det som enligt lagringsklassen Lagring för äldre uppgifter ska flyttas, filinnehållet i avslutade vårdkontakter och äldre handlingar (bilder och filer i journalen, inskannade restjournaler och mellanarkivets paket), till en egen databas och läser det därifrån. Raden om filen stannar i den aktiva databasen, så journalen ser likadan ut, och läsningen prövas, loggas och gallras som förut. Flytten görs av systemet en gång om dygnet och av systemförvaltaren med ett klick, prövar regeln och kontrollsumman på varje rad och stoppar hela flytten om något inte stämmer. Säkerhetskopian, provåterläsningen, nya miljöer och uttaget per huvudman tar med den äldre databasen. Varje tabell som någon modul skapar, också de som skapas först när de används, har en klass för uttaget per huvudman, och bygget stoppas när en ny tabell saknar klass.',
    expert: 'Systemet avgör själv vad som ska flyttas ur lagringsklassen och vårdkontakternas datum, flyttar det utan att någon behöver komma ihåg det och läser det ur rätt databas, så att ingen användare märker var uppgiften ligger. Det räknar också tillväxten och visar vad lagringsklasserna sparar.',
    anmarkning: 'I demon är den äldre databasen en SQLite-databas i minnet som kopplas till sandlådan och följer med i samma ögonblicksbild när sandlådan sparas. I driften är den en egen fil på en billigare volym. Det som flyttas är filinnehållet. Journalens strukturerade rader (anteckningar, mätvärden och vårdkontakter) stannar i den aktiva databasen, och de äldsta av dem förs till mellanarkivet efter ett beslut (5.4.2.2). Priserna per gigabyte är demovärden, och prognosen är linjär ur det senaste årets tillväxt.',
  },
};

// Lägger rundans tillägg ovanpå avsnittets poster.
export const medR18r3 = (poster) => poster.map(x => {
  const p = POSTER[x.id];
  if (!p) return x;
  const { tester = [], ...ovrigt } = p;
  return { ...x, ...ovrigt, tester: [...new Set([...(x.tester ?? []), ...tester])] };
});
