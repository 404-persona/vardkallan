// Runda 16, r1: intygen i den integrerade intygsapplikationen. Testnamnen (app/test/intyg-r16.test.js och
// klickbudgeten) och de poster i Sussa 2.2 och 3.1.4 som rundan berör. Mappningsfilerna ersätter sina poster med dessa,
// så att ändringen ligger samlad här. Ärlighetsregeln gäller: intygsapplikationen och mottagarna är simulerade och
// kontrakten är inte anslutna, så posterna är delvis uppfyllda.
import { flode } from './tidbok-tester.js';

const IN = 'Intygen i Webcert, runda 16 > Intyg r16 > ';
export const T16R1 = {
  giltighet: `${IN}TSTRK1007 kan skapas till 31 januari 2025 kl. 13, och TS8071 från 3 februari 2025 kl. 07.30`,
  version: `${IN}version 2 av FK 7804 och AG7804 gäller från 20 november 2025 kl. 18, och bytet är en ändring av en rad`,
  overfor: `${IN}vid förnyelse från version 1 till 2 följer bara svaren på oförändrade frågor, och aldrig det läkaren ska ta ställning till på nytt`,
  fornya: `${IN}ett signerat intyg i version 1 förnyas som version 2, och journalen får det nya utkastet med relationen`,
  ersatt: `${IN}ett ersatt TSTRK1007 läses med rätt namn och status och byts mot TS8071, och ett utkast av det kan inte signeras`,
  admin: `${IN}vårdadministratören skapar och fyller i ett utkast och markerar det klart för signering, men signerar aldrig`,
  skyddad: `${IN}för en patient med skyddade personuppgifter skapar bara den som signerar intyget, och vårdadministratören når inte utkastet`,
  graviditet: `${IN}sjuksköterskan på mödrahälsovården skriver och signerar intyg om graviditet, med beräknad förlossning ur graviditetsjournalen`,
  arbetsgivare: `${IN}intyg till arbetsgivaren skrivs bara ut, och patienten kan dölja diagnosen på utskriften`,
  agUrSjukpenning: `${IN}ett läkarintyg till arbetsgivaren skapas ur läkarintyget för sjukpenning med de svar som är desamma`,
  sandning: `${IN}dödsbeviset skickas när det signeras, och övriga intyg skickas bara i samråd med patienten`,
  forslag: `${IN}systemet föreslår intyget för barnets sjukdom efter ålder och allvar, och körkortsintyget när besöket gäller körkortet`,
  sparr: `${IN}förifyllnaden räknas bara på det läkaren får se: en diagnos på en spärrad vårdenhet ändrar ingenting`,
  alder: `${IN}åldersgränsen för FK 7809 gäller från 16 november 2026 kl. 00.01 och hänvisar till FK 3221 för barn`,
  svar: `${IN}ett svar som inte passar frågan, eller en fråga som inte finns, ger ett fel på svenska och ändrar ingenting`,
};
const T = T16R1;
const INTE_ANSLUTET = 'inte anslutet till den nationella tjänsteplattformen (kräver avtal med Inera och SITHS-funktionscertifikat)';
const SIMULERAT = 'Intygsapplikationen är simulerad och är inte Webcert, och inget intyg skickas till Försäkringskassan, Transportstyrelsen, Skatteverket, Socialstyrelsen eller någon arbetsgivare.';
const INTYGEN = 'Intygen är de som finns i Webcert i dag enligt Ineras sidor (hämtade 2026-11-15): läkarintyg för sjukpenning (FK 7804) i version 1 och 2, AG7804 i version 1 och 2, AG1-14, läkarutlåtanden för sjukersättning och aktivitetsersättning (FK 7800, 7801 och 7802), merkostnadsersättning (FK 7809), omvårdnadsbidrag eller merkostnadsersättning (FK 3221), assistansersättning (FK 7810), närståendepenning (FK 3226), intyg om graviditet (FK 7210), intyg om tillfällig föräldrapenning (FK 7472), läkarutlåtanden för tillfällig föräldrapenning (FK 7426 och 7427), TS8071, TSTRK1031, dödsbevis och dödsorsaksintyg. TSTRK1007 kan läsas men inte skapas. Läkarens anmälan till Transportstyrelsen (TSTRK1009) är inget intyg i Webcert utan skrivs ut och skickas med post; demon har den i intygsapplikationen. Att LUAE_FS och TSTRK1031 fortfarande finns i Webcert är inte bekräftat på Ineras sidor. Koderna är Intygstjänstens koder i kodverket för intygstyper ur Ineras öppna källkod.';

const POSTER = {
  '2.2.1.9': {
    tester: [T.giltighet, T.version, T.overfor, T.fornya, T.ersatt, T.admin, T.skyddad, T.graviditet, T.arbetsgivare, T.agUrSjukpenning, T.sandning, T.forslag, T.sparr, T.alder, T.svar, flode('skriv-sjukintyg'), flode('byt-ersatt-intyg')],
    losning: 'Fliken Intyg i journalen öppnar en integrerad intygsapplikation för patienten, som Webcert i integrerat läge: journalen skapar utkastet med CreateDraftCertificate, tar emot intygets händelser med CertificateStatusUpdateForCare adresserat till vårdenheten och stämmer av med ListCertificatesForCareWithQA. Alla intyg som finns i Webcert i dag finns med blankettens frågor, med giltighet i tid per version, så att ett byte av blankett eller version är en ändring av en rad. Ett signerat intyg förnyas med den version som gäller, och journalen får det nya utkastet med relationen till det gamla.',
    expert: 'Den inloggade väljer bara vilket intyg som ska skrivas. Systemet visar bara de intyg som får skrivas för patienten, av den som är inloggad och just nu, förklarar varför de andra inte går och föreslår det som passar (graviditet, barnets ålder och allvar, körkortet, sjukskrivning), och fyller i diagnoser, underlag, graviditet, läkemedel och diabetesuppgifter ur det den inloggade får se, med källa. Vid förnyelse följer bara svar på oförändrade frågor, aldrig det som läkaren ska ta ställning till på nytt.',
    anmarkning: `Byggt och validerat mot tjänstekontraktet riv.clinicalprocess.healthcond.certificate 4.0.5 (CreateDraftCertificate 3.3, CertificateStatusUpdateForCare 3.2, ListCertificatesForCareWithQA 3.3), testat lokalt mot tjänsteplattformen; ${INTE_ANSLUTET}. ${SIMULERAT} ${INTYGEN} Förifyllda svar som inte är diagnoser skickas i en egen namnrymd i förifyllnaden (förenkling i demon). I de stora blanketterna (TS8071, FK 7800 till 7810, TSTRK1031) är följdfrågorna sammanförda i en beskrivning per område, och tidpunkten för releasen i november 2025 är antagen för alla intyg i den utom FK 7804. Frågor och svar från mottagaren (ärendekommunikation) hanteras inte.`,
  },
  '3.1.4.1': {
    tester: [T.sandning, T.graviditet, T.ersatt, T.arbetsgivare],
    losning: 'Intygen till myndigheter och andra mottagare skrivs genom den integrerade intygsapplikationen: dödsbevis till Skatteverket och dödsorsaksintyg till Socialstyrelsen skickas när de signeras, intyg till Försäkringskassan och Transportstyrelsen skickas i samråd med patienten, och läkarens anmälan till Transportstyrelsen skrivs ut och skickas med post. Intyg till arbetsgivaren skrivs bara ut.',
    expert: 'Systemet vet vem mottagaren är och hur intyget ska nå den, och visar bara de val som gäller för intyget.',
    anmarkning: `${SIMULERAT} Sändningen till mottagaren är simulerad, och kontrakten för att skicka (SendCertificateToRecipient med flera) ligger i intygsapplikationen och är inte byggda i journalen.`,
  },
  '3.1.4.2': {
    tester: [T.sandning, T.graviditet, T.ersatt, T.giltighet, T.arbetsgivare, T.forslag, flode('byt-ersatt-intyg')],
    losning: 'Omfattningen är alla intyg i Webcert i dag, med blankettens frågor och svarsalternativ, giltighet i tid och överföring mellan versioner. Dödsbevis, dödsorsaksintyg, körkortsintygen (TS8071 och TSTRK1031) och läkarens anmälan till Transportstyrelsen finns med, liksom Försäkringskassans intyg och utlåtanden och arbetsgivarnas intyg.',
    expert: 'Systemet väljer själv rätt blankett och version, säger när ett intyg har ersatts och byter det med ett klick, och fyller i det journalen vet med källa. Den som skriver behöver aldrig veta vilken blankett som gäller.',
    anmarkning: `${SIMULERAT} ${INTYGEN} Elektroniskt utbyte med myndigheter utanför intygen (till exempel smittskyddsanmälan och patientregistret) ingår inte här.`,
  },
};

export const medR16r1 = (poster) => poster.map(x => {
  const a = POSTER[x.id];
  if (!a) return x;
  const tidigare = x.tester ?? [];
  return { ...x, avsedd: 'delvis', tester: [...tidigare, ...a.tester.filter(t => !tidigare.includes(t))], losning: a.losning, expert: a.expert, anmarkning: a.anmarkning };
});
