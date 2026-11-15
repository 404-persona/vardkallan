// Runda 15, r5: mallarnas innehåll. Yrkesmallar och undersköterskans anteckning, omvårdnadsprocessen med föreslagna
// statusområden, formulärens förifyllnad ur läkemedelslistan, NEWS2 och förra svaret, och fackspråket. Testnamnen för
// servertesterna (app/test/mallar-r15r5.test.js) och tilläggen till posterna i Sussa 3.1.3, 3.2.2, 5.1.1, 5.1.3 och
// 12.1. Mappningsfilerna lägger tilläggen härifrån ovanpå sina egna poster med medR15r5, så att ändringen ligger samlad här.
const Y = 'Yrkesmallar > ';
const O = 'Omvårdnadsprocessen > ';
const F = 'Formulärens förifyllnad i runda 15 > ';
const N = 'Fackspråket i runda 15 > ';
const S = 'Seed i runda 15 > ';

export const T = {
  usk: `${Y}undersköterskan skriver observationsanteckningar och ingen annan mall, och sjuksköterskan ser anteckningen`,
  api: `${Y}mallarna i API:t är bara yrkets, och yrkets huvudmall står först`,
  parameter: `${Y}vilka yrken som skriver med vilka mallar är en parameter med fyra ögon, och behörigheten går inte att vidga`,
  uskFormular: `${Y}undersköterskan fyller bara i de formulär som vårdgivaren har gett yrket`,
  mall: `${O}omvårdnadsanteckningen har processens delar och statusområden med egna namn, utan VIPS-modellens namn`,
  forslag: `${O}systemet föreslår statusområden ur vårdplanen, förra anteckningen, NEWS2, smärtan och vikten, med förklaring`,
  forslagSparr: `${O}förslagen räknas bara på den egna vårdenhetens uppgifter: en spärrad eller annan vårdenhet ändrar inte svaret`,
  resultat: `${O}omvårdnadsproblem och resultat mot vårdplanens mål sparas, och resultatet förs in i vårdplanen vid signeringen`,
  resultatKrav: `${O}resultat mot målet kräver ett mål i en pågående plan på den egna vårdenheten, och nödåtkomst ger bara läsning`,
  processApi: `${O}API: processen ger mål, problemförslag, observationer från undersköterskan och formulär att fylla i`,
  fhir: `${O}FHIR: omvårdnadsproblem som Condition och resultat som Goal i anteckningens Composition`,
  fallrisk: `${F}läkemedel som ökar risken för fall räknas ur ATC-koderna enligt Socialstyrelsens lista`,
  fallriskForifyll: `${F}fallriskbedömningen fylls i med antalet läkemedel och förra svaret, källan sparas, och en spärrad vårdenhets läkemedel räknas inte`,
  news2: `${F}NEWS2 från det senaste dygnet fyller i en fråga, och en definition med antal måste täcka alla antal`,
  dubbletter: `${N}inga två sökord har samma kod i Snomed CT`,
  status: `${N}Status har en avsnittskod, och Planering och Aktivitet skiljs från Åtgärd och Fysisk aktivitet`,
  begrepp: `${N}omvårdnadsproblemen och de nya sökorden har giltiga begrepp i den internationella utgåvan`,
  uskFormularParameter: 'Undersköterskans behörighet i runda 15 > undersköterskan fyller i de formulär som vårdgivaren har gett yrket, fallriskbedömningen från början, och ett formulär som yrket inte har stoppas',
  uskSmal: 'Undersköterskans behörighet i runda 15 > undersköterskans behörigheter är desamma som före runda 15, med bara den smala handlingen för anteckningar tillagd',
  seed: `${S}seeden har undersköterskans, sjuksköterskans och fysioterapeutens anteckningar med de nya mallarna, och en ny sandlåda fungerar`,
};
export const TESTER_YRKEN = [T.usk, T.api, T.parameter, T.uskFormular, T.uskFormularParameter, T.uskSmal];
export const TESTER_PROCESS = [T.mall, T.forslag, T.forslagSparr, T.resultat, T.resultatKrav, T.processApi, T.fhir];
export const TESTER_FORIFYLL = [T.fallrisk, T.fallriskForifyll, T.news2];
export const TESTER_FACKSPRAK = [T.dubbletter, T.status, T.begrepp];

const MALLAR_LOSNING = 'Varje yrke har sina mallar och systemet väljer mallen efter yrket: läkarnas anteckningstyper, sjuksköterskans omvårdnadsanteckning med omvårdnadsprocessen, undersköterskans observationsanteckning (observation och utförd åtgärd) och fysioterapeutens anteckning med funktion, aktivitet, mål, åtgärd och resultat. Mallar för arbetsterapeut, kurator och dietist är byggda på samma sätt. Alla yrken dokumenterar i samma journal och läser varandras omvårdnadsanteckningar, så att sjuksköterskan ser undersköterskans observationer i sitt underlag.';
const PROCESS_LOSNING = 'Omvårdnadsanteckningen följer omvårdnadsprocessen: omvårdnadsproblem, mål, åtgärd och resultat, och tolv statusområden med egna namn som är grupperade efter ICF (WHO). Statusområdena fälls ut när de behövs. Omvårdnadsproblemen är begrepp i Snomed CT som systemet föreslår ur journalen, och resultatet bedöms mot vårdplanens mål och förs in i vårdplanen när anteckningen signeras.';
const PROCESS_ANM = 'Förslagsreglerna är demoregler. Statusområdena är Vårdkällans egna och inte VIPS-modellens, som är upphovsrättsligt skyddad. Omvårdnadsproblemen är begrepp i den internationella utgåvan av Snomed CT, och ICNP-delmängden i den svenska utgåvan är inte kontrollerad, eftersom den kräver licens.';
const FORIFYLL_LOSNING = 'Formulärens förifyllnad omfattar också läkemedelslistan, där systemet räknar läkemedlen som ökar risken för fall ur ATC-koderna enligt Socialstyrelsens lista (Indikatorer för god läkemedelsterapi hos äldre, tabell 4 med tabell 3 och bilaga 1), NEWS2 från det senaste dygnet och förra svaret i samma formulär. Ett fast svar kan väljas av systemet ur ett antal. Källan står under svaret och i anteckningens text, och ett svar som ändras sparas utan källa. Fritextfrågorna kan dikteras.';

const POSTER = {
  '3.1.3.1': {
    losning: `Anteckningar skrivs i mallar med sökord per anteckningstyp och yrke, och omvårdnadsanteckningen följer omvårdnadsprocessen med statusområden som fälls ut. Mallarna för tobaksvanor och levnadsvanor har fasta svarsalternativ. Verksamhetens formulär byggs på sidan Formulär, med fasta svar, skalor, regler, kroppsbild och förifyllnad ur journalen, och fylls i som journalanteckningar. ${FORIFYLL_LOSNING}`,
    tester: [T.mall, T.api],
  },
  '3.1.3.5': {
    tester: [...TESTER_YRKEN, ...TESTER_PROCESS, ...TESTER_FORIFYLL],
    losning: `Strukturerat: mallar med sökord, formulär med fasta svar som verksamheten bygger själv, mätvärden och skalor, och omvårdnadsproblem med kod och resultat mot vårdplanens mål. Ostrukturerat: fritext under varje sökord, dikterad eller skriven, också i formulärens fritextfrågor. Skalor och poängmodeller med text: NEWS2, Glasgow Coma Scale, NRS och ACVPU, och formulärens egna skalor. Bilder med markeringar: kroppsbilden i formulären. Underlag för beräkningar: svaren sparas strukturerat bredvid texten. ${MALLAR_LOSNING} ${PROCESS_LOSNING}`,
    expert: 'Mallen väljs efter yrket, och systemet föreslår de statusområden, omvårdnadsproblem och formulär som gäller patienten i dag ur vårdplanen, förra anteckningen, NEWS2, fallrisken, såren, smärtan och vikten, med varför, och visar vårdplanens mål och undersköterskans observationer. I formulären fyller systemet i ålder, mätvärden, antalet läkemedel som ökar risken för fall, NEWS2 och förra svaret och skriver texten, och det som är kodsatt eller räknat fram står med källa, så att det syns vad som är inmatat och vad som är kodsatt.',
    anmarkning: `Skalorna och fallriskbedömningens poäng är demoregler och inte kliniskt beslutsstöd, och ingen validerad skala är byggd, eftersom ingen med prövad licens har behövts. ${PROCESS_ANM}`,
  },
  '3.2.2.1': {
    tester: [T.resultat, T.resultatKrav, T.processApi],
    losning: 'Standardiserade vårdplaner som mallar (hjärtsvikt, förebyggande av trycksår, diabetes, förebyggande av fall och vårdplan vid psykiatrisk tvångsvård) och individuella planer med mål, åtgärder, ansvarig yrkesroll och uppföljningsdatum, under fliken Planer och i översikten. Omvårdnadsanteckningen visar planens mål, och resultatet som sjuksköterskan bedömer där förs in i vårdplanen som den senaste bedömningen av målet.',
    expert: 'Systemet föreslår standardplanen ur diagnosen och sammanhanget och fyller i mål, åtgärder, ansvarig och uppföljningsdatum, så läkaren eller sjuksköterskan sätter upp planen med två klick. I omvårdnadsanteckningen står planens mål med den senaste bedömningen, och resultatet behöver inte skrivas en gång till i vårdplanen.',
    anmarkning: 'Mallarna och när de föreslås är demoregler, inte granskade av vården. Mallarna är fasta i koden (se D11). Resultatet i en omvårdnadsanteckning ersätter inte planens uppföljning, som fortfarande görs i planen med nästa datum.',
  },
  '5.1.1.3': {
    tester: [...TESTER_FORIFYLL, T.uskFormular],
    anmarkning: 'Villkor och regler skrivs i byggaren som korta rader, till exempel poäng minst 3, och systemet förklarar en rad som inte går att tolka. Bilden är kroppsbilden. Formulären används som journalanteckningar och lämnas ut i FHIR, men inte i remisser eller i Min journal som formulär för patienten. Listan över läkemedel som ökar risken för fall är Socialstyrelsens, men poängen i fallriskbedömningen är en demoregel. En dikterad fritext i ett formulär märks inte som dikterad i anteckningen, som i sökorden.',
  },
  '5.1.3.2': { tester: TESTER_FACKSPRAK },
  '5.1.3.4': {
    tester: [...TESTER_FACKSPRAK, T.fhir],
    anmarkning: 'Delmängden är begrepp i den internationella utgåvan, kontrollerade mot tx.fhir.org (20250201), och sedan runda 15 stoppar bygget två sökord med samma kod. Den svenska utgåvan med svenska termer och ICNP-delmängden för omvårdnad kräver licens och är inte kontrollerade. Tolv sökord har ingen exakt motsvarighet och får ingen kod. Sökning och inmatning med hjälp av strukturen i Snomed CT finns inte.',
  },
  '12.1.1.7': {
    tester: [T.parameter],
    anmarkning: 'Det som inte går att ändra står på sidan med skälet: skrivna anteckningar och registrerade värden, koden och enheten för en mätvärdestyp som har värden (en ny kod blir en ny mätvärdestyp), namnet och kategorin för journalens inbyggda mallar, och sökorden i de strukturerade mallarna för tobak, levnadsvanor och donation, som systemet skriver ur svaren. Sedan runda 15 är också vilka mallar varje yrke skriver med en parameter med fyra ögon, och en mall kan bara ges till ett yrke som har behörighet att skriva i mallens kategori, eftersom behörigheten följer patientdatalagen. Kontrollen av UCUM är en demoregel som omfattar de vanliga enheterna i vården, och de engelska termerna för nya koder kontrolleras inte mot en terminologitjänst i demon.',
  },
};

// Lägger rundans tillägg ovanpå avsnittets poster. tester läggs till postens egna, och de andra fälten ersätter postens.
export const medR15r5 = (poster) => poster.map(x => {
  const p = POSTER[x.id];
  if (!p) return x;
  const { tester = [], ...ovrigt } = p;
  return { ...x, ...ovrigt, tester: [...new Set([...x.tester, ...tester])] };
});
