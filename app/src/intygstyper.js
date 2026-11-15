// Runda 16, r1: intygstyperna i den integrerade intygsapplikationen, med frågor, svarsalternativ, giltighet i tid,
// vem som får skapa och signera, mottagare och hur intyget når mottagaren (Sussa 2.2.1.9, 3.1.4.1 och 3.1.4.2).
//
// Varje intygstyp är en rad med kod och version. Koden är Intygstjänstens kod i kodverket för intygstyper
// (KV Intygstyp, b64ea353-e8f6-4832-b563-fc7d46f29548), hämtad ur Ineras öppna källkod (sklintyg/certificate-service,
// CodeSystemKvIntygstyp, och sklintyg/common, modulernas EntryPoint) den 15 november 2026. Raden har en giltighet i tid
// (fran och till, med klockslag), så att nästa byte av blankett eller version är en ändring av en rad: den gamla raden får
// ett slut och den nya en start. Ett intyg som redan är skrivet läses alltid med sin egen rad, också när raden har slutat
// gälla, men ett nytt intyg kan bara skapas med en rad som gäller just nu.
//
// Frågorna har samma id som i blanketterna och i Intygstjänsten, så att svaren kan föras mellan versioner. Texterna och
// alternativen är tagna ur samma källa (Försäkringskassans, Transportstyrelsens och arbetsgivarnas blanketter som de är
// modellerade i Intygstjänsten). Där en blankett har många frågor har demon de frågor som bär bedömningen, och det står
// i intygstypens anmärkning. Inget skickas till någon mottagare: sändningen är simulerad.
//
// Systemet är experten: en fråga kan ha en förifyllnad (forifyll), som journalen räknar fram ur det den inloggade får se
// (lakarintyg.js), ett villkor för när den visas (visas) och en markering för att läkaren ska ta ställning på nytt vid
// förnyelse (nyBedomning). Systemet avgör själv vilka intyg som får skrivas för patienten, av vem och när.

export const KV_INTYGSTYP = 'b64ea353-e8f6-4832-b563-fc7d46f29548';
export const KV_RELATION = 'c2362fcd-eda0-4f9a-bd13-b3bbaf7f2146';
export const RELATIONER = { FRLANG: 'Förlängning', ERSATT: 'Ersätter', KOPIA: 'Kopia', KOMPLT: 'Komplettering' };

// Tidpunkterna för bytena. Svensk tid med tidszon, så att jämförelsen blir rätt året om.
export const TIDPUNKTER = {
  // Ineras sida Aktuellt för Webcert: TSTRK1007 kan inte utfärdas efter 2025-01-31 kl. 13, TS8071 är aktiverat från
  // 2025-02-03 kl. 07.30.
  tstrk1007Slut: '2025-01-31T13:00:00+01:00',
  ts8071Start: '2025-02-03T07:30:00+01:00',
  // Ineras sida: fyra nya intyg från 2024-12-03 (merkostnadsersättning, närståendepenning, graviditet, tillfällig
  // föräldrapenning). Klockslaget är inte publicerat; demon räknar från dagens början.
  nyaDec2024: '2024-12-03T00:00:00+01:00',
  // Releasen i november 2025: ny version av FK 7804 och AG7804, AG1-14, FK 7426, FK 7427, FK 3221 och FK 7810. Ett
  // regionalt nyhetsbrev anger att FK 7804 produktionssattes torsdag 20 november 2025 kl. 18.00. Demon antar samma
  // tidpunkt för de övriga intygen i releasen.
  nov2025: '2025-11-20T18:00:00+01:00',
  // Ineras sida, kommande release 16 november 2026 kl. 00.01: FK 7809 får inte utfärdas för patienter under 18 år, och
  // FK 7210 varnar när dagens datum anges som beräknat födelsedatum.
  nov2026: '2026-11-16T00:01:00+01:00',
};
const T = TIDPUNKTER;

// Kodverk som frågorna använder (Försäkringskassans KV_FKMU och Transportstyrelsens kodverk, som i Intygstjänsten).
const KV = {
  underlag1: { UNDERSOKNING: 'Min undersökning av patienten', TELEFONKONTAKT: 'Min telefonkontakt med patienten', JOURNALUPPGIFTER: 'Journaluppgifter från den', ANNAT: 'Annat' },
  underlag2: { FYSISKUNDERSOKNING: 'Min undersökning vid fysiskt vårdmöte', DIGITALUNDERSOKNING: 'Min undersökning vid digitalt vårdmöte', TELEFONKONTAKT: 'Min telefonkontakt med patienten', JOURNALUPPGIFTER: 'Journaluppgifter från den', ANNAT: 'Annat' },
  underlagLu: { UNDERSOKNING: 'Min undersökning av patienten', JOURNALUPPGIFTER: 'Journaluppgifter från den', ANHORIG: 'Anhörigs eller annans beskrivning av patienten', ANNAT: 'Annat' },
  underlagLu2: { FYSISKUNDERSOKNING: 'Min undersökning vid fysiskt vårdmöte', DIGITALUNDERSOKNING: 'Min undersökning vid digitalt vårdmöte', JOURNALUPPGIFTER: 'Journaluppgifter från den', ANHORIG: 'Anhörigs eller annans beskrivning av patienten', ANNAT: 'Annat' },
  underlagBarn: { FYSISKUNDERSOKNING: 'Min undersökning vid fysiskt vårdmöte', DIGITALUNDERSOKNING: 'Min undersökning vid digitalt vårdmöte', FORALDER: 'Förälders beskrivning av barnet', JOURNALUPPGIFTER: 'Journaluppgifter från den', ANNAT: 'Annat' },
  underlagNarst: { UNDERSOKNING: 'Min undersökning av patienten', JOURNALUPPGIFTER: 'Journaluppgifter från den', ANNAT: 'Annat' },
  sysselsattning1: { NUVARANDE_ARBETE: 'Nuvarande arbete', ARBETSSOKANDE: 'Arbetssökande, att utföra sådant arbete som är normalt förekommande på arbetsmarknaden', FORALDRALEDIG: 'Föräldraledighet', STUDIER: 'Studier' },
  sysselsattning2: { NUVARANDE_ARBETE: 'Nuvarande arbete', ARBETSSOKANDE: 'Arbetssökande', FORALDRALEDIG: 'Föräldraledighet', STUDIER: 'Studier' },
  nedsattning: { EN_FJARDEDEL: '25 procent', HALFTEN: '50 procent', TRE_FJARDEDEL: '75 procent', HELT_NEDSATT: '100 procent' },
  prognos1: {
    STOR_SANNOLIKHET: 'Patienten kommer med stor sannolikhet att återgå helt i nuvarande sysselsättning efter denna sjukskrivning',
    ATER_X_ANTAL_DGR: 'Patienten kommer med stor sannolikhet att återgå helt i nuvarande sysselsättning efter x antal dagar',
    SANNOLIKT_INTE: 'Patienten kommer med stor sannolikhet inte att återgå helt i nuvarande sysselsättning',
    PROGNOS_OKLAR: 'Prognos för återgång i nuvarande sysselsättning är oklar',
  },
  prognos2: {
    STOR_SANNOLIKHET: 'Patienten förväntas kunna återgå helt i nuvarande sysselsättning efter detta intygs slutdatum',
    ATER_X_ANTAL_MANADER: 'Patienten förväntas kunna återgå helt i nuvarande sysselsättning efter angiven tid',
    SANNOLIKT_INTE: 'Patienten förväntas inte kunna återgå helt i nuvarande sysselsättning',
    PROGNOS_OKLAR: 'Prognosen för återgång i nuvarande sysselsättning är svårbedömd',
  },
  dagar1: { TRETTIO_DGR: '30 dagar', SEXTIO_DGR: '60 dagar', NITTIO_DGR: '90 dagar', HUNDRAATTIO_DAGAR: '180 dagar' },
  atgarder1: { ARBETSTRANING: 'Arbetsträning', ARBETSANPASSNING: 'Arbetsanpassning', SOKA_NYTT_ARBETE: 'Söka nytt arbete', BESOK_ARBETSPLATS: 'Besök på arbetsplatsen', ERGONOMISK: 'Ergonomisk bedömning', HJALPMEDEL: 'Hjälpmedel', KONFLIKTHANTERING: 'Konflikthantering', KONTAKT_FHV: 'Kontakt med företagshälsovård', OMFORDELNING: 'Omfördelning av arbetsuppgifter', OVRIGA_ATGARDER: 'Övrigt', INTE_AKTUELLT: 'Inte aktuellt' },
  tillsyn: { EN_ATTONDEL: 'En åttondel av den ordinarie tiden', EN_FJARDEDEL: 'En fjärdedel av den ordinarie tiden', HALVA: 'Halva den ordinarie tiden', TRE_FJARDEDELAR: 'Tre fjärdedelar av den ordinarie tiden', HELA: 'Hela den ordinarie tiden' },
  vardsituation: { ENDAST_PALLIATIV: 'Vård i patientens sista tid i livet (dagar, veckor eller månader)', AKUT_LIVSHOTANDE: 'Akut livshotande tillstånd (till exempel vård på intensivvårdsavdelning)', ANNAT: 'Annat' },
  kannedom: { INGEN_TIDIGARE: 'Ingen tidigare kännedom', MINDRE_AN_ETT_AR: 'Kännedom i mindre än ett år', MER_AN_ETT_AR: 'Kännedom i mer än ett år' },
  funktion1: { INTELLEKTUELL_FUNKTION: 'Intellektuell funktion', KOMMUNIKATION_SOCIAL_INTERAKTION: 'Övergripande psykosociala funktioner', PSYKISK_FUNKTION: 'Annan psykisk funktion', HORSELFUNKTION: 'Hörselfunktion', SYNFUNKTION: 'Synfunktion', SINNESFUNKTION: 'Övriga sinnesfunktioner och smärta', KOORDINATION: 'Balans, koordination och motorik', ANNAN_KROPPSILIG_FUNKTION: 'Annan kroppslig funktion' },
  funktion2: { INTELLEKTUELL_FUNKTION: 'Intellektuell funktion', KOMMUNIKATION_SOCIAL_INTERAKTION: 'Övergripande psykosociala funktioner', UPPMARKSAMHET: 'Uppmärksamhet, koncentration och exekutiv funktion', PSYKISK_FUNKTION: 'Psykisk funktion', SINNESFUNKTION: 'Sinnesfunktioner och smärta', KOORDINATION: 'Balans, koordination och motorik', ANDNINGS_FUNKTION: 'Andningsfunktion', ANNAN_KROPPSILIG_FUNKTION: 'Annan kroppslig funktion' },
  aktivitet: { LARANDE_BEGRANSNING: 'Lärande, tillämpa kunskap samt allmänna uppgifter och krav', KOMMUNIKATION_BEGRANSNING: 'Kommunikation', FORFLYTTNING_BEGRANSNING: 'Förflyttning', PERSONLIG_VARD_BEGRANSNING: 'Personlig vård och sköta sin hälsa', OVRIGA_BEGRANSNING: 'Övriga aktivitetsbegränsningar' },
  idKontroll: { IDK1: 'ID-kort', IDK2: 'Företagskort eller tjänstekort', IDK3: 'Svenskt körkort', IDK4: 'Personlig kännedom', IDK5: 'Försäkran enligt 18 kap. 4 §', IDK6: 'Pass' },
  ts8071Avser: { gr_II: 'Körkortstillstånd grupp II (C1, C1E, C, CE)', gr_II_III: 'Körkortstillstånd grupp II och III (C1, C1E, C, CE, D1, D1E, D, DE)', forlang_gr_II: 'Förlängning av högre behörighet II (C1, C1E, C, CE)', forlang_gr_II_III: 'Förlängning av högre behörighet II och III (C1, C1E, C, CE, D1, D1E, D, DE)', utbyt_utl_kk: 'Utbyte av utländskt körkort', tax_leg: 'Ansökan om taxiförarlegitimation', int_begar_ts: 'Intyg i annat fall på begäran av Transportstyrelsen' },
  tsKalla: { journal: 'Journaluppgifter', distkont: 'Distanskontakt', undersokn: 'Undersökning av personen' },
  tsBedomning: { ja: 'Ja', nej: 'Nej', ejstalln: 'Kan inte ta ställning' },
  behorighet: { AM: 'AM', A1: 'A1', A2: 'A2', A: 'A', B: 'B', BE: 'BE', TRAKTOR: 'Traktor', C1: 'C1', C1E: 'C1E', C: 'C', CE: 'CE', D1: 'D1', D1E: 'D1E', D: 'D', DE: 'DE', TAXI: 'Taxi' },
  diabetesTyp: { DIABETES_TYP_1: 'Typ 1', DIABETES_TYP_2: 'Typ 2', ANNAN: 'Annan form av diabetes' },
  diabetesBehandling: { INSULIN: 'Insulin', TABLETTER: 'Tabletter', ANNAN: 'Annan behandling' },
  olamplighet: { OLAMPLIGHET: 'Anmälan om olämplighet', SANNOLIK_OLAMPLIGHET: 'Anmälan om sannolik olämplighet' },
  dodsplats: { SJUKHUS: 'Sjukhus', ORDINART_BOENDE: 'Ordinärt boende', SARSKILT_BOENDE: 'Särskilt boende', ANNAN: 'Annan eller okänd' },
  undersokningYttre: { JA: 'Ja', UNDERSOKNING_SKA_GORAS: 'Nej, rättsmedicinsk undersökning ska göras', UNDERSOKNING_GJORT_KORT_FORE_DODEN: 'Nej, den avlidne undersökt kort före döden' },
  doiGrund: { UNDERSOKNING_FORE_DODEN: 'Undersökning före döden', UNDERSOKNING_EFTER_DODEN: 'Yttre undersökning efter döden', KLINISK_OBDUKTION: 'Klinisk obduktion', RATTSMEDICINSK_OBDUKTION: 'Rättsmedicinsk obduktion', RATTSMEDICINSK_BESIKTNING: 'Rättsmedicinsk likbesiktning' },
};
export const KODVERK = KV;

// En fråga. typ: kryss (en ruta), ja_nej, val (ett av alternativen), flerval, underlag (flerval med datum per
// alternativ), datum, period ({ fran, till }), perioder ([{ kod, fran, till }]), text, rad (kort text), heltal och
// diagnoser ([{ kod, text }]). visas: [fråga, värde] eller [fråga, [värden]], där frågans svar ska vara värdet eller
// innehålla något av värdena. dold: samma form, frågan döljs när villkoret gäller.
const f = (id, typ, text, extra = {}) => ({ id, typ, text, ...extra });
const kat = (rubrik, fragor) => ({ rubrik, fragor });
const SMITTA = ['27', true];

// Läkarintyg för sjukpenning, FK 7804, och arbetsgivarens AG7804. Version 1 till 20 november 2025, version 2 därefter.
function sjukpenning(version, { arbetsgivare = false } = {}) {
  const v2 = version === '2.0';
  const sm = { dold: SMITTA };
  return [
    kat('Smittbärarpenning', [f('27', 'kryss', 'Förhållningsregler enligt smittskyddslagen på grund av smitta')]),
    kat('Grund för medicinskt underlag', [
      f('1', 'underlag', 'Intyget är baserat på', { alt: v2 ? KV.underlag2 : KV.underlag1, krav: true, nyBedomning: true, forifyll: 'vardkontakt', ...sm }),
      f('1.3', 'rad', 'Ange vad annat är', { krav: true, visas: ['1', 'ANNAT'], nyBedomning: true, max: 100 }),
    ]),
    kat('Sysselsättning', [
      f('28', 'flerval', 'I relation till vilken sysselsättning bedömer du arbetsförmågan?', { alt: v2 ? KV.sysselsattning2 : KV.sysselsattning1, krav: true, ...sm }),
      f('29', 'text', 'Ange yrke och arbetsuppgifter', { krav: true, visas: ['28', 'NUVARANDE_ARBETE'], max: 120 }),
    ]),
    kat('Diagnos', [
      ...(arbetsgivare ? [f('100', 'ja_nej', 'Önskar patienten förmedla information om diagnos/diagnoser till sin arbetsgivare?', { krav: true })] : []),
      f('6', 'diagnoser', 'Diagnos/diagnoser för sjukdom som orsakar nedsatt arbetsförmåga', { krav: true, forifyll: 'diagnoser', ...(arbetsgivare ? { visas: ['100', true] } : {}) }),
    ]),
    kat('Funktionsnedsättning', [f('35', 'text', 'Ange vilken/vilka funktionsnedsättningar patienten har till följd av sjukdom och om möjligt svårighetsgrad. Ange även vad din bedömning av funktionsnedsättningar baseras på.', { krav: true, forifyll: 'status', max: 4000, ...sm })]),
    kat('Aktivitetsbegränsning', [f('17', 'text', 'Beskriv vad du bedömer att patienten har svårt att göra på grund av sin sjukdom. Ange om möjligt svårighetsgrad.', { krav: true, max: 4000, ...sm })]),
    kat('Medicinsk behandling', v2
      ? [f('19', 'text', 'Beskriv pågående och planerade medicinska behandlingar/åtgärder som kan påverka arbetsförmågan', { max: 4000, ...sm })]
      : [f('19', 'text', 'Ange pågående medicinska behandlingar/åtgärder', { max: 4000, ...sm }), f('20', 'text', 'Ange planerade medicinska behandlingar/åtgärder', { max: 4000, ...sm })]),
    kat('Bedömning', [
      f('32', 'perioder', 'Min bedömning av patientens nedsättning av arbetsförmågan', { alt: KV.nedsattning, krav: true, nyBedomning: true }),
      f('37', 'text', 'Patientens arbetsförmåga bedöms nedsatt längre tid än den som Socialstyrelsens försäkringsmedicinska beslutsstöd anger, därför att', { max: 4000 }),
      f('34', 'kryss', 'Patienten skulle kunna arbeta helt eller delvis vid hjälp med transport till och från arbetsplatsen', sm),
      v2
        ? f('33', 'ja_nej', 'Kommer möjligheterna till återgång i arbete försämras om arbetstiden förläggs ojämnt vid deltidssjukskrivning?', { krav: true, visas: ['32', ['EN_FJARDEDEL', 'HALFTEN', 'TRE_FJARDEDEL']] })
        : f('33', 'ja_nej', 'Finns det medicinska skäl till att arbetstiden behöver förläggas på ett annat sätt än att arbetstiden minskas lika mycket varje dag?', { visas: ['32', ['EN_FJARDEDEL', 'HALFTEN', 'TRE_FJARDEDEL']] }),
      v2
        ? f('33.2', 'text', 'Beskriv de medicinska skälen till att möjligheterna till återgång i arbete försämras', { krav: true, visas: ['33', true], max: 4000 })
        : f('33.2', 'text', 'Beskriv arbetstidsförläggningen och de medicinska skälen till den', { krav: true, visas: ['33', true], max: 4000 }),
    ]),
    kat('Prognos', v2 ? [
      f('39', 'val', 'Prognos för arbetsförmåga utifrån aktuellt undersökningstillfälle', { alt: KV.prognos2, krav: true, nyBedomning: true, ...sm }),
      f('39.4', 'heltal', 'Ange antal månader', { krav: true, visas: ['39', 'ATER_X_ANTAL_MANADER'], min: 1, max: 99, nyBedomning: true }),
      f('39.2', 'text', 'Beskriv vad som ligger till grund för bedömningen', { krav: true, visas: ['39', 'PROGNOS_OKLAR'], nyBedomning: true, max: 4000 }),
    ] : [
      f('39', 'val', 'Prognos för arbetsförmåga utifrån aktuellt undersökningstillfälle', { alt: KV.prognos1, krav: true, nyBedomning: true, ...sm }),
      f('39.3', 'val', 'Ange antal dagar', { alt: KV.dagar1, krav: true, visas: ['39', 'ATER_X_ANTAL_DGR'], nyBedomning: true }),
    ]),
    kat('Åtgärder som kan främja återgången i arbete', v2
      ? [f('44', 'text', 'Här kan du beskriva andra åtgärder än åtgärder inom hälso- och sjukvården som kan främja återgången i arbete', { max: 4000, ...sm })]
      : [f('40', 'flerval', 'Vilka åtgärder kan göra det lättare för patienten att återgå i arbete?', { alt: KV.atgarder1, ...sm }), f('44', 'text', 'Beskriv hur åtgärderna kan främja återgången i arbete', { max: 4000, ...sm })]),
    kat('Övrigt', [f('25', 'text', arbetsgivare ? 'Övriga upplysningar till arbetsgivaren' : 'Övriga upplysningar', { max: 4000 })]),
    kat('Kontakt', arbetsgivare
      ? [f('103', 'kryss', 'Jag önskar att arbetsgivaren kontaktar mig', { nyBedomning: true }), f('103.2', 'text', 'Ange varför du vill ha kontakt och vem som i första hand ska kontaktas samt kontaktuppgifter', { visas: ['103', true], nyBedomning: true, max: 4000 })]
      : [f('26', 'kryss', 'Jag önskar att Försäkringskassan kontaktar mig', { nyBedomning: true, ...sm }), f('26.2', 'text', 'Ange gärna varför du vill ha kontakt', { visas: ['26', true], nyBedomning: true, max: 4000 })]),
  ];
}

// Läkarutlåtanden för sjukersättning och aktivitetsersättning (FK 7800, 7801 och 7802). Demon har frågorna som bär
// bedömningen; underrubrikerna för funktionsnedsättningarna är sammanförda i en fråga.
function sjukersattning({ forlangdSkolgang = false } = {}) {
  return [
    kat('Grund för medicinskt underlag', [
      f('1', 'underlag', 'Utlåtandet är baserat på', { alt: KV.underlagLu, krav: true, nyBedomning: true, forifyll: 'vardkontakt' }),
      f('1.3', 'rad', 'Ange vad annat är', { krav: true, visas: ['1', 'ANNAT'], nyBedomning: true, max: 100 }),
      f('2', 'val', 'Jag har kännedom om patienten sedan', { alt: KV.kannedom, krav: true, nyBedomning: true }),
      f('3', 'ja_nej', 'Är utlåtandet även baserat på andra medicinska utredningar eller underlag?', { krav: true }),
      f('4', 'text', 'Ange utredning eller underlag', { krav: true, visas: ['3', true], max: 4000 }),
    ]),
    kat('Diagnos', [
      f('6', 'diagnoser', 'Diagnoser för sjukdomar som påverkar patientens arbetsförmåga', { krav: true, forifyll: 'diagnoser' }),
      f('5', 'text', 'Beskriv kortfattat historiken för diagnoserna', { krav: true, max: 4000 }),
    ]),
    kat('Funktionsnedsättning', forlangdSkolgang
      ? [f('15', 'text', 'Beskriv debut och utveckling av funktionsnedsättningen', { krav: true, max: 4000, forifyll: 'status' }), f('16', 'text', 'Beskriv funktionsnedsättningens påverkan på patientens skolgång', { krav: true, max: 4000 })]
      : [f('8', 'text', 'Beskriv funktionsnedsättningarna, med undersökningsfynd och hur de påverkar patienten', { krav: true, max: 4000, forifyll: 'status' }), f('17', 'text', 'Beskriv vad patienten har svårt att göra på grund av sin sjukdom', { krav: true, max: 4000 })]),
    kat('Behandling och förutsättningar', forlangdSkolgang ? [] : [
      f('18', 'text', 'Avslutade medicinska behandlingar', { max: 4000 }),
      f('19', 'text', 'Pågående och planerade medicinska behandlingar', { max: 4000 }),
      f('22', 'text', 'Medicinska förutsättningar för arbete', { krav: true, max: 4000 }),
    ]),
    kat('Övrigt', [f('25', 'text', 'Övriga upplysningar', { max: 4000 })]),
    kat('Kontakt', [f('26', 'kryss', 'Jag önskar att Försäkringskassan kontaktar mig', { nyBedomning: true }), f('26.2', 'text', 'Ange gärna varför du vill ha kontakt', { visas: ['26', true], nyBedomning: true, max: 4000 })]),
  ];
}

// AG1-14, läkarintyg om arbetsförmåga under sjuklöneperioden (SKR och arbetsgivarna).
const AG114 = [
  kat('Grund för medicinskt underlag', [
    f('10', 'underlag', 'Intyget är baserat på', { alt: KV.underlag2, krav: true, nyBedomning: true, forifyll: 'vardkontakt' }),
    f('10.3', 'rad', 'Ange vad annat är', { krav: true, visas: ['10', 'ANNAT'], nyBedomning: true, max: 100 }),
  ]),
  kat('Sysselsättning', [f('1', 'text', 'Bedöm arbetsförmåga utifrån ordinarie arbete. Ange yrke och arbetsuppgifter.', { krav: true, max: 4000 })]),
  kat('Diagnos', [
    f('3', 'ja_nej', 'Önskar patienten förmedla information om diagnos/diagnoser till sin arbetsgivare?', { krav: true }),
    f('4', 'diagnoser', 'Diagnos/diagnoser för sjukdom som orsakar nedsatt arbetsförmåga', { krav: true, visas: ['3', true], forifyll: 'diagnoser' }),
  ]),
  kat('Arbetsförmåga', [
    f('5', 'text', 'På vilket sätt medför sjukdomen nedsatt arbetsförmåga?', { krav: true, max: 4000 }),
    f('6', 'ja_nej', 'Finns arbetsförmåga trots sjukdom?', { krav: true }),
    f('6.2', 'text', 'Beskriv arbetsförmågan', { krav: true, visas: ['6', true], max: 4000 }),
    f('7', 'heltal', 'Patientens arbetsförmåga bedöms vara nedsatt med (ange antal procent)', { krav: true, min: 1, max: 100, nyBedomning: true }),
    f('7.2', 'period', 'Period då arbetsförmågan bedöms vara nedsatt', { krav: true, maxDagar: 14, nyBedomning: true }),
  ]),
  kat('Övrigt', [f('8', 'text', 'Övriga upplysningar till arbetsgivaren', { max: 4000 })]),
  kat('Kontakt', [
    f('9', 'kryss', 'Jag önskar att arbetsgivaren kontaktar mig', { nyBedomning: true }),
    f('9.2', 'text', 'Ange varför du vill ha kontakt och vem som i första hand ska kontaktas samt kontaktuppgifter', { krav: true, visas: ['9', true], nyBedomning: true, max: 4000 }),
  ]),
];

// Intyg om graviditet, FK 7210.
const IGRAV = [
  kat('Graviditet', [f('54', 'datum', 'Beräknat datum för förlossning', { krav: true, forifyll: 'graviditet', varnaIdag: { fran: T.nov2026, text: 'Du har angivit dagens datum som beräknat födelsedatum. Säkerställ att datumet stämmer.' } })]),
];

// Intyg om tillfällig föräldrapenning, FK 7472.
const ITFP = [
  kat('Barnets sjukdom', [f('55', 'text', 'Ange diagnos eller symtom', { krav: true, forifyll: 'diagnoserText', max: 4000 })]),
  kat('Bedömning', [f('56', 'perioder', 'Jag bedömer att barnet inte ska vårdas i ordinarie tillsynsform', { alt: KV.tillsyn, krav: true, nyBedomning: true })]),
];

// Läkarutlåtande för närståendepenning, FK 3226.
const LUNSP = [
  kat('Grund för medicinskt underlag', [
    f('1', 'underlag', 'Utlåtandet är baserat på', { alt: KV.underlagNarst, krav: true, nyBedomning: true, forifyll: 'vardkontakt' }),
    f('1.3', 'rad', 'Ange vad annat är', { krav: true, visas: ['1', 'ANNAT'], nyBedomning: true, max: 100 }),
  ]),
  kat('Diagnos', [f('58', 'diagnoser', 'Diagnos eller diagnoser för det tillstånd som orsakar ett hot mot patientens liv', { krav: true, forifyll: 'diagnoser' })]),
  kat('Påtagligt hot mot patientens liv', [
    f('52', 'val', 'Patientens vårdsituation', { alt: KV.vardsituation, krav: true }),
    f('52.2', 'datum', 'Ange från och med när patientens överlevnad bedömdes till dagar, veckor eller månader', { krav: true, visas: ['52', 'ENDAST_PALLIATIV'] }),
    f('52.3', 'datum', 'Ange när tillståndet blev akut livshotande', { krav: true, visas: ['52', 'AKUT_LIVSHOTANDE'] }),
    f('52.4', 'text', 'Beskriv på vilket sätt sjukdomstillståndet utgör ett påtagligt hot mot patientens liv', { krav: true, visas: ['52', ['AKUT_LIVSHOTANDE', 'ANNAT']], max: 4000 }),
    f('52.5', 'ja_nej', 'Kan du uppskatta hur länge tillståndet kommer vara livshotande?', { krav: true, visas: ['52', ['AKUT_LIVSHOTANDE', 'ANNAT']] }),
    f('52.6', 'datum', 'Till och med vilket datum', { krav: true, visas: ['52.5', true] }),
  ]),
  kat('Samtycke', [f('53', 'ja_nej', 'Har patienten de medicinska förutsättningarna för att kunna lämna samtycke?', { krav: true, nyBedomning: true })]),
];

// Läkarutlåtanden om funktionsnedsättning: merkostnadsersättning (FK 7809), omvårdnadsbidrag eller
// merkostnadsersättning för barn (FK 3221) och assistansersättning (FK 7810). Funktionsområdena väljs med kodverket;
// beskrivningen av områdena är sammanförd i en fråga i demon.
function funktionsutlatande({ barn = false, assistans = false, funktion = KV.funktion2 } = {}) {
  const vem = barn ? 'barnet' : 'patienten';
  return [
    kat('Grund för medicinskt underlag', [
      f('1', 'underlag', 'Utlåtandet är baserat på', { alt: barn || assistans ? KV.underlagLu2 : KV.underlagLu, krav: true, nyBedomning: true, forifyll: 'vardkontakt' }),
      f('1.3', 'rad', 'Ange vad annat är', { krav: true, visas: ['1', 'ANNAT'], nyBedomning: true, max: 100 }),
      f('1.4', 'rad', 'Ange anhörigs eller annans relation till patienten', { krav: true, visas: ['1', 'ANHORIG'], nyBedomning: true, max: 100 }),
      ...(assistans ? [f('2', 'val', 'Jag har kännedom om patienten sedan', { alt: KV.kannedom, krav: true, nyBedomning: true })] : []),
      f('3', 'ja_nej', 'Är utlåtandet även baserat på andra medicinska utredningar eller underlag?', { krav: true }),
      f('4', 'text', 'Ange utredning eller underlag', { krav: true, visas: ['3', true], max: 4000 }),
    ]),
    kat('Diagnos', [
      f('58', 'diagnoser', 'Diagnos eller diagnoser', { krav: true, forifyll: 'diagnoser' }),
      f('5', 'text', 'Sammanfatta historiken för diagnoserna', { krav: true, max: 4000 }),
    ]),
    kat('Funktionsnedsättning', [
      f('funktionsnedsattning', 'flerval', 'Vilka funktionsområden är nedsatta?', { alt: funktion, krav: true }),
      f('8', 'text', `Beskriv funktionsnedsättningarna, med undersökningsfynd och hur de påverkar ${vem}`, { krav: true, max: 4000, forifyll: 'status' }),
    ]),
    kat('Aktivitetsbegränsning', [
      ...(assistans ? [f('aktivitetsbegransning', 'flerval', 'Inom vilka områden har patienten aktivitetsbegränsningar?', { alt: KV.aktivitet, krav: true })] : []),
      f('17', 'text', `Beskriv vad ${vem} har svårt att göra på grund av sin funktionsnedsättning`, { krav: barn || assistans, max: 4000 }),
    ]),
    kat('Behandling och prognos', [
      f('50', 'text', 'Ange pågående och planerade medicinska behandlingar', { max: 4000 }),
      f(barn || assistans ? '39' : '51', 'text', `Hur förväntas ${vem}s funktionsnedsättning och aktivitetsbegränsningar utvecklas över tid?`, { krav: true, max: 4000 }),
    ]),
    ...(assistans ? [kat('Sjukvårdande insatser och egenvård', [
      f('70', 'ja_nej', 'Har patienten behov av hjälp som innefattar sjukvårdande insatser enligt hälso- och sjukvårdslagen?', { krav: true }),
      f('70.2', 'text', 'Ange vilka insatser och i vilken omfattning', { krav: true, visas: ['70', true], max: 4000 }),
      f('70.3', 'ja_nej', 'Har patienten behov av hjälp som bedöms kunna utföras som egenvård?', { krav: true }),
      f('70.4', 'text', 'Ange vilka insatser och i vilken omfattning', { krav: true, visas: ['70.3', true], max: 4000 }),
    ])] : []),
    kat('Övrigt', [f('25', 'text', 'Övriga upplysningar', { max: 4000 })]),
  ];
}

// Läkarutlåtanden för tillfällig föräldrapenning: allvarligt sjukt barn under 18 (FK 7426) och barn 12 till 16 år
// (FK 7427). Intyget skrivs om barnet, för förälderns ansökan.
function tfpBarn({ allvarligt = true } = {}) {
  return [
    kat('Grund för medicinskt underlag', [
      f('1', 'underlag', 'Utlåtandet är baserat på', { alt: KV.underlagBarn, krav: true, nyBedomning: true, forifyll: 'vardkontakt' }),
      f('1.3', 'rad', 'Ange vad annat är', { krav: true, visas: ['1', 'ANNAT'], nyBedomning: true, max: 100 }),
    ]),
    kat('Barnets diagnos', [
      f('58', 'diagnoser', 'Barnets diagnos', { forifyll: 'diagnoser', kravEttAv: ['58', '55'] }),
      f('55', 'text', 'Fyll i vilka symtom barnet har om diagnos inte är fastställd', { max: 4000 }),
    ]),
    kat('Barnets hälsotillstånd', allvarligt ? [
      f('60', 'text', 'Varför bedömer du att barnet är allvarligt sjukt eller att det finns en stark misstanke om allvarlig diagnos?', { krav: true, max: 4000 }),
      f('71', 'text', 'Barnets aktuella somatiska hälsotillstånd', { max: 4000 }),
      f('72', 'text', 'Barnets aktuella psykiska hälsotillstånd', { max: 4000 }),
      f('19', 'text', 'Pågående medicinska behandlingar/åtgärder', { max: 4000 }),
      f('20', 'text', 'Planerade medicinska behandlingar/åtgärder', { max: 4000 }),
    ] : [
      f('59', 'text', 'Beskriv barnets aktuella hälsotillstånd', { krav: true, max: 4000 }),
      f('19', 'text', 'Ange pågående och planerade behandlingar', { max: 4000 }),
      f('62', 'text', 'Beskriv barnets behov av vård eller tillsyn', { krav: true, max: 4000 }),
    ]),
    kat('Period', allvarligt ? [
      f('61', 'period', 'För vilken period bedömer du att barnet är allvarligt sjukt?', { krav: true, nyBedomning: true }),
      f('61.2', 'text', 'Motivera bedömningen av perioden som du anser att det finns ett påtagligt hot mot barnets liv', { krav: true, nyBedomning: true, max: 4000 }),
      f('62', 'ja_nej', 'Vårdas barnet inneliggande på sjukhus?', { krav: true, nyBedomning: true, forifyll: 'inneliggande' }),
      f('62.2', 'period', 'Ange period', { krav: true, visas: ['62', true], nyBedomning: true }),
      f('62.3', 'ja_nej', 'Är barnet inskrivet med hemsjukvård?', { krav: true, nyBedomning: true }),
      f('62.4', 'period', 'Ange period', { krav: true, visas: ['62.3', true], nyBedomning: true }),
    ] : [
      f('62.6', 'period', 'Under vilken period behöver barnet vård eller tillsyn?', { krav: true, nyBedomning: true }),
      f('62.1', 'ja_nej', 'Vårdas barnet inneliggande på sjukhus?', { krav: true, nyBedomning: true, forifyll: 'inneliggande' }),
      f('62.2', 'period', 'Ange period', { krav: true, visas: ['62.1', true], nyBedomning: true }),
    ]),
  ];
}

// TS8071, läkarintyg för högre körkortsbehörigheter, taxiförarlegitimation och på begäran av Transportstyrelsen.
// Varje område har en ja eller nej-fråga och en beskrivning vid ja. Systemet föreslår ja och beskrivningen när det
// finns en diagnos i journalen som läkaren får se (aldrig nej, eftersom en saknad diagnos inte är ett svar).
const jn = (id, text, beskrivning, forifyll = null) => [
  f(id, 'ja_nej', text, { krav: true, ...(forifyll ? { forifyll } : {}) }),
  f(`${id}.2`, 'text', beskrivning, { krav: true, visas: [id, true], max: 400 }),
];
const TS8071 = [
  kat('Intyget avser', [f('1', 'flerval', 'Intyget avser', { alt: KV.ts8071Avser, krav: true })]),
  kat('Intyget är baserat på', [
    f('2', 'val', 'Intyget är baserat på', { alt: KV.tsKalla, krav: true, forifyll: 'tsKalla' }),
    f('2.2', 'datum', 'Datum för undersökning/kontakt', { krav: true, forifyll: 'vardkontaktDatum' }),
  ]),
  kat('Identitet', [f('3', 'val', 'Identitet styrkt genom', { alt: KV.idKontroll, krav: true })]),
  kat('Synfunktioner', [
    f('4', 'ja_nej', 'Intyg om synfunktioner kommer att skickas in av legitimerad optiker', { krav: true }),
    f('5', 'rad', 'Synskärpa (höger, vänster och binokulärt, utan och med korrektion)', { krav: true, visas: ['4', false], max: 200 }),
    ...jn('7', 'Finns uppgift om ögonsjukdom eller synnedsättning?', 'Ange sjukdom/synnedsättning', 'ts.ogon'),
  ]),
  kat('Balanssinne', jn('8', 'Har personen överraskande anfall av balansrubbningar eller yrsel som kan innebära en trafiksäkerhetsrisk?', 'Ange vilken typ av anfall och tidpunkt för senaste anfall', 'ts.balans')),
  kat('Hörsel', jn('9', 'Har personen svårt att uppfatta vanlig samtalsstämma på fyra meters avstånd? Hörapparat får användas.', 'Ange hur hörseln är nedsatt och om hörapparat används')),
  kat('Rörelseorganens funktioner', jn('10', 'Har personen någon sjukdom eller funktionsnedsättning som påverkar rörligheten och som medför att fordon inte kan köras på ett trafiksäkert sätt?', 'Ange nedsättning eller sjukdom')),
  kat('Hjärt- och kärlsjukdomar', jn('11', 'Har eller har personen haft någon hjärt- eller kärlsjukdom?', 'Ange vilken sjukdom och tidpunkt för diagnos', 'ts.hjarta')),
  kat('Diabetes', [f('12', 'ja_nej', 'Har personen läkemedelsbehandlad diabetes?', { krav: true, forifyll: 'ts.diabetes' })]),
  kat('Neurologiska sjukdomar', jn('13', 'Har personen någon neurologisk sjukdom eller finns tecken på neurologisk sjukdom?', 'Ange vilken sjukdom och vilka tecken', 'ts.neuro')),
  kat('Epilepsi, epileptiskt anfall och annan medvetandestörning', jn('14', 'Har eller har personen haft epilepsi?', 'Ange tidpunkt för senaste epileptiska anfall', 'ts.epilepsi')),
  kat('Allvarligt nedsatt njurfunktion', jn('15', 'Har personen allvarligt nedsatt njurfunktion?', 'Ange diagnos och om njurtransplantation har genomgåtts', 'ts.njure')),
  kat('Demens och andra kognitiva störningar', jn('16', 'Har personen diagnos demens eller annan kognitiv störning eller finns tecken på demens eller andra kognitiva störningar?', 'Ange vilka tecken, eventuell diagnos och grad', 'ts.kognitiv')),
  kat('Sömn- och vakenhetsstörningar', jn('17', 'Har personen en sömn- eller vakenhetsstörning eller symtom på sådan problematik?', 'Ange vilken diagnos/vilka symtom', 'ts.somn')),
  kat('Alkohol, andra psykoaktiva substanser och läkemedel', [
    ...jn('18', 'Har personen eller har personen haft en diagnos missbruk, beroende eller substansbrukssyndrom?', 'Ange vilken diagnos, tidpunkt för när diagnosen ställdes och för vilken/vilka substanser', 'ts.substans'),
    f('18.8', 'ja_nej', 'Pågår läkarordinerat bruk av läkemedel som kan innebära en trafiksäkerhetsrisk?', { krav: true }),
    f('18.9', 'text', 'Ange läkemedel och ordinerad dos', { krav: true, visas: ['18.8', true], max: 400 }),
  ]),
  kat('Psykiska sjukdomar och störningar', jn('19', 'Har personen eller har personen haft psykisk sjukdom eller störning?', 'Ange vilken sjukdom eller störning', 'ts.psyk')),
  kat('ADHD, autismspektrumtillstånd och likartade tillstånd', jn('20', 'Har personen någon neuropsykiatrisk funktionsnedsättning till exempel ADHD, ADD, DCD, Aspergers syndrom eller Tourettes syndrom?', 'Ange diagnos och om tillståndet bedöms utgöra en trafiksäkerhetsrisk', 'ts.npf')),
  kat('Intellektuell funktionsnedsättning', jn('26', 'Har personen någon intellektuell funktionsnedsättning?', 'Vilken diagnos och grad?', 'ts.intellektuell')),
  kat('Övrig medicinering', [
    f('21', 'ja_nej', 'Har personen någon stadigvarande medicinering som inte nämnts i något avsnitt ovan?', { krav: true, forifyll: 'ts.medicinering' }),
    f('21.2', 'text', 'Ange vilken eller vilka mediciner', { krav: true, visas: ['21', true], max: 400, forifyll: 'lakemedelText' }),
  ]),
  kat('Övrig kommentar', [f('22', 'text', 'Ange övriga upplysningar', { max: 4000 })]),
  kat('Bedömning', [
    f('23', 'val', 'Bedöms personen utifrån Transportstyrelsens föreskrifter och allmänna råd (TSFS 2010:125) om medicinska krav för innehav av körkort m.m. ha en sjukdom eller funktionsnedsättning som innebär en trafiksäkerhetsrisk?', { alt: KV.tsBedomning, krav: true }),
    f('23.2', 'text', 'Du kan inte ta ställning till om det finns en risk, ange orsaken till detta', { krav: true, visas: ['23', 'ejstalln'], max: 4000 }),
    f('23.3', 'text', 'Du bedömer att det finns en risk, ange orsaken till detta', { krav: true, visas: ['23', 'ja'], max: 4000 }),
  ]),
];

// TSTRK1007, det ersatta läkarintyget för högre behörigheter. Bara för att kunna läsa intyg som redan är skrivna.
const TSTRK1007 = [
  kat('Intyget avser', [f('1', 'flerval', 'Intyget avser behörighet', { alt: { C1: 'C1', C1E: 'C1E', C: 'C', CE: 'CE', D1: 'D1', D1E: 'D1E', D: 'D', DE: 'DE', TAXI: 'Taxi', ANNAT: 'Annat' }, krav: true })]),
  kat('Identitet', [f('2', 'val', 'Identitet styrkt genom', { alt: KV.idKontroll, krav: true })]),
  kat('Bedömning', [f('33', 'flerval', 'Patienten uppfyller kraven för', { alt: KV.behorighet, krav: true }), f('32', 'text', 'Övriga kommentarer', { max: 4000 })]),
];

// TSTRK1031, läkarintyg för diabetes och körkort (Transportstyrelsen). Systemet fyller i diagnosåret, typen och
// behandlingen ur journalen och visar senaste HbA1c bredvid frågorna.
const TSTRK1031 = [
  kat('Intyget avser', [f('1', 'flerval', 'Intyget avser behörighet', { alt: KV.behorighet, krav: true })]),
  kat('Identitet', [f('2', 'val', 'Identitet styrkt genom', { alt: KV.idKontroll, krav: true })]),
  kat('Allmänt', [
    f('35', 'heltal', 'År då diabetesdiagnosen ställdes', { krav: true, min: 1900, max: 2100, forifyll: 'diabetesAr' }),
    f('18', 'val', 'Typ av diabetes', { alt: KV.diabetesTyp, krav: true, forifyll: 'diabetesTyp' }),
    f('207', 'ja_nej', 'Har patienten medicinering för sin diabetes?', { krav: true, forifyll: 'diabetesMedicinering' }),
    f('209', 'flerval', 'Behandling', { alt: KV.diabetesBehandling, krav: true, visas: ['207', true], forifyll: 'diabetesBehandling' }),
    f('208', 'ja_nej', 'Medför medicineringen risk för hypoglykemi?', { krav: true, visas: ['207', true], forifyll: 'hypoglykemiRisk' }),
  ]),
  kat('Hypoglykemi', [
    f('200', 'ja_nej', 'Har patienten kontroll över sitt sjukdomstillstånd?', { krav: true }),
    f('201', 'ja_nej', 'Förstår patienten riskerna med hypoglykemi?', { krav: true }),
    f('110', 'ja_nej', 'Har patienten förmåga att känna varningstecken på hypoglykemi?', { krav: true }),
    f('202', 'ja_nej', 'Kan patienten vidta adekvata åtgärder vid hypoglykemi?', { krav: true }),
    f('106', 'ja_nej', 'Har patienten haft återkommande hypoglykemier under det senaste året?', { krav: true }),
    f('107', 'ja_nej', 'Har patienten haft återkommande hypoglykemier i vaket tillstånd de senaste tolv månaderna?', { krav: true }),
    f('203', 'ja_nej', 'Har patienten haft allvarlig hypoglykemi de senaste tolv månaderna?', { krav: true }),
    f('204', 'ja_nej', 'Gör patienten regelbundna blodsockerkontroller?', { krav: true }),
  ]),
  kat('Övrigt', [
    f('206', 'ja_nej', 'Har patienten komplikationer av sjukdomen som kan påverka trafiksäkerheten?', { krav: true }),
    f('34', 'ja_nej', 'Bör patienten undersökas av en specialist i diabetes?', { krav: true }),
  ]),
  kat('Bedömning', [f('33', 'flerval', 'Patienten uppfyller kraven för', { alt: KV.behorighet, krav: true }), f('32', 'text', 'Övriga kommentarer', { max: 4000 })]),
];

// TSTRK1009, läkares anmälan till Transportstyrelsen om olämplighet att ha körkort (körkortslagen 10 kap. 6 §).
const TSTRK1009 = [
  kat('Identitet', [f('2', 'val', 'Identitet styrkt genom', { alt: KV.idKontroll, krav: true })]),
  kat('Anmälan', [
    f('46', 'val', 'Anmälan avser', { alt: KV.olamplighet, krav: true }),
    f('1', 'flerval', 'Anmälan avser behörighet', { alt: KV.behorighet, krav: true }),
  ]),
  kat('Medicinska förhållanden', [
    f('47', 'text', 'Beskriv de medicinska förhållanden som gör att personen är eller sannolikt är olämplig att ha körkort', { krav: true, forifyll: 'diagnoserText', max: 4000 }),
    f('48', 'datum', 'Datum för senaste undersökning', { krav: true, forifyll: 'vardkontaktDatum' }),
  ]),
  kat('Beslut', [f('49', 'kryss', 'Jag vill få information om Transportstyrelsens beslut')]),
];

// Dödsbevis (Skatteverket) och dödsorsaksintyg (Socialstyrelsen). Dödsdatumet fyller systemet i ur registreringen.
const DB = [
  kat('Identitet', [f('1', 'val', 'Identiteten styrkt genom', { alt: KV.idKontroll, krav: true })]),
  kat('Dödsdatum och dödsplats', [
    f('2', 'ja_nej', 'Är dödsdatumet säkert?', { krav: true }),
    f('2.2', 'datum', 'Dödsdatum', { krav: true, forifyll: 'dodsdatum' }),
    f('3', 'rad', 'Kommun där döden inträffade', { krav: true, max: 100 }),
    f('4', 'val', 'Var inträffade döden?', { alt: KV.dodsplats, krav: true }),
  ]),
  kat('Explosivt implantat', [
    f('5', 'ja_nej', 'Har den avlidne haft ett explosivt implantat (till exempel pacemaker eller implanterbar defibrillator)?', { krav: true }),
    f('5.2', 'ja_nej', 'Har implantatet avlägsnats?', { krav: true, visas: ['5', true] }),
  ]),
  kat('Yttre undersökning', [
    f('6', 'val', 'Har en yttre undersökning av kroppen genomförts?', { alt: KV.undersokningYttre, krav: true }),
    f('7', 'ja_nej', 'Har polisanmälan gjorts?', { krav: true }),
  ]),
];
const DOI = [
  kat('Dödsdatum', [f('2.2', 'datum', 'Dödsdatum', { krav: true, forifyll: 'dodsdatum' })]),
  kat('Dödsorsak', [
    f('8', 'text', 'Den terminala dödsorsaken var', { krav: true, max: 400 }),
    f('8.2', 'text', 'Som var en följd av', { max: 400 }),
    f('10', 'text', 'Andra sjukdomar som bidragit till dödsfallet', { max: 400, forifyll: 'diagnoserText' }),
  ]),
  kat('Operation och skada', [
    f('11', 'ja_nej', 'Har den avlidne opererats inom fyra veckor före döden?', { krav: true }),
    f('12', 'ja_nej', 'Har dödsfallet orsakats av yttre orsak, skada eller förgiftning?', { krav: true }),
  ]),
  kat('Grund för dödsorsaksuppgifterna', [f('13', 'flerval', 'Uppgifterna om dödsorsak är baserade på', { alt: KV.doiGrund, krav: true })]),
];

// sandning: samrad (skickas i samråd med patienten, som också kan skicka det själv), utskrift (kan bara skrivas ut och
// lämnas av patienten, och patienten kan välja att dölja diagnosen), post (skrivs ut och skickas med post till mottagaren)
// eller vid_signering (skickas av sig självt när
// intyget signeras). utfardare: handlingar som får signera. utkast: handlingar som får skapa och fylla i men inte signera.
// alder: [lägst, högst] år, eventuellt med en regel från en viss tid (alderFran). sekretess: får skrivas för en patient
// med skyddade personuppgifter (då bara av den som får signera). kraver: graviditet (en pågående graviditet i
// graviditetsjournalen). fornyas: kan förnyas eller förlängas.
const LAKARE = ['skriv_intyg'];
const UTKAST = ['utkast_intyg'];
const rad = (x) => ({ sekretess: true, avliden: false, alder: [0, 130], utfardare: LAKARE, utkast: UTKAST, sandning: 'samrad', fornyas: false, giltig: {}, anmarkning: null, ...x });
export const INTYGSTYPER = [
  rad({ kod: 'LISJP', blankett: 'FK 7804', version: '1.0', text: 'Läkarintyg för sjukpenning', mottagare: 'Försäkringskassan', part: 'FKASSA', alder: [16, 69], fornyas: true, giltig: { till: T.nov2025 }, ersattsAv: { kod: 'LISJP', version: '2.0' }, fragor: sjukpenning('1.0') }),
  rad({ kod: 'LISJP', blankett: 'FK 7804', version: '2.0', text: 'Läkarintyg för sjukpenning', mottagare: 'Försäkringskassan', part: 'FKASSA', alder: [16, 69], fornyas: true, giltig: { fran: T.nov2025 }, fragor: sjukpenning('2.0') }),
  rad({ kod: 'AG7804', blankett: 'AG7804', version: '1.0', text: 'Läkarintyg om arbetsförmåga, arbetsgivaren', mottagare: 'Arbetsgivaren, via patienten', part: 'INVANA', alder: [16, 69], sandning: 'utskrift', fornyas: true, giltig: { till: T.nov2025 }, ersattsAv: { kod: 'AG7804', version: '2.0' }, diagnosFraga: '100', fragor: sjukpenning('1.0', { arbetsgivare: true }) }),
  rad({ kod: 'AG7804', blankett: 'AG7804', version: '2.0', text: 'Läkarintyg om arbetsförmåga, arbetsgivaren', mottagare: 'Arbetsgivaren, via patienten', part: 'INVANA', alder: [16, 69], sandning: 'utskrift', fornyas: true, giltig: { fran: T.nov2025 }, diagnosFraga: '100', fragor: sjukpenning('2.0', { arbetsgivare: true }) }),
  rad({ kod: 'AG1-14', blankett: 'AG1-14', version: '2.0', text: 'Läkarintyg om arbetsförmåga, sjuklöneperioden', mottagare: 'Arbetsgivaren, via patienten', part: 'INVANA', alder: [16, 69], sandning: 'utskrift', fornyas: true, giltig: { fran: T.nov2025 }, diagnosFraga: '3', fragor: AG114 }),
  rad({ kod: 'LUSE', blankett: 'FK 7800', version: '1.0', text: 'Läkarutlåtande för sjukersättning', mottagare: 'Försäkringskassan', part: 'FKASSA', alder: [19, 66], fragor: sjukersattning(), anmarkning: 'Frågorna om funktionsnedsättning är sammanförda i en fråga i demon.' }),
  rad({ kod: 'LUAE_NA', blankett: 'FK 7801', version: '1.0', text: 'Läkarutlåtande för aktivitetsersättning vid nedsatt arbetsförmåga', mottagare: 'Försäkringskassan', part: 'FKASSA', alder: [19, 29], fragor: sjukersattning(), anmarkning: 'Frågorna om funktionsnedsättning är sammanförda i en fråga i demon.' }),
  rad({ kod: 'LUAE_FS', blankett: 'FK 7802', version: '1.0', text: 'Läkarutlåtande för aktivitetsersättning vid förlängd skolgång', mottagare: 'Försäkringskassan', part: 'FKASSA', alder: [19, 29], fragor: sjukersattning({ forlangdSkolgang: true }), anmarkning: 'Åldern är en demoregel (aktivitetsersättning gäller från 19 till och med 29 år).' }),
  rad({ kod: 'LUMEK', blankett: 'FK 7809', version: '1.0', text: 'Läkarutlåtande för merkostnadsersättning', mottagare: 'Försäkringskassan', part: 'FKASSA', giltig: { fran: T.nyaDec2024 }, alderFran: [{ fran: T.nov2026, alder: [18, 130], skal: 'Läkarutlåtandet för merkostnadsersättning skrivs från 18 år. För barn används läkarutlåtandet för omvårdnadsbidrag eller merkostnadsersättning (FK 3221).' }], fragor: funktionsutlatande({ funktion: KV.funktion1 }), fornyas: true }),
  rad({ kod: 'LU_OMV_MEK', blankett: 'FK 3221', version: '1.0', text: 'Läkarutlåtande för omvårdnadsbidrag eller merkostnadsersättning', mottagare: 'Försäkringskassan', part: 'FKASSA', alder: [0, 17], giltig: { fran: T.nov2025 }, fragor: funktionsutlatande({ barn: true }), fornyas: true, anmarkning: 'Utlåtandet gäller barn i demon (omvårdnadsbidrag och merkostnadsersättning för barn).' }),
  rad({ kod: 'LUAS', blankett: 'FK 7810', version: '1.0', text: 'Läkarutlåtande för assistansersättning', mottagare: 'Försäkringskassan', part: 'FKASSA', giltig: { fran: T.nov2025 }, fragor: funktionsutlatande({ assistans: true }), fornyas: true }),
  rad({ kod: 'LUNSP', blankett: 'FK 3226', version: '1.0', text: 'Läkarutlåtande för närståendepenning', mottagare: 'Försäkringskassan', part: 'FKASSA', giltig: { fran: T.nyaDec2024 }, fragor: LUNSP, fornyas: true, anmarkning: 'Utlåtandet skrivs om den svårt sjuka patienten, för den närståendes ansökan.' }),
  rad({ kod: 'IGRAV', blankett: 'FK 7210', version: '1.0', text: 'Intyg om graviditet', mottagare: 'Försäkringskassan', part: 'FKASSA', alder: [10, 60], giltig: { fran: T.nyaDec2024 }, kraver: 'graviditet', utfardare: ['skriv_intyg', 'intyg_graviditet'], fragor: IGRAV, anmarkning: 'Läkare, barnmorska eller sjuksköterska vid mödrahälsovården utfärdar intyget (Försäkringskassan).' }),
  rad({ kod: 'ITFP', blankett: 'FK 7472', version: '1.0', text: 'Intyg om tillfällig föräldrapenning', mottagare: 'Försäkringskassan', part: 'FKASSA', alder: [0, 11], giltig: { fran: T.nyaDec2024 }, utfardare: ['skriv_intyg', 'intyg_tfp'], fragor: ITFP, fornyas: true, anmarkning: 'Intyget skrivs om barnet, för förälderns ansökan. Åldern är en demoregel: för barn som har fyllt 12 används FK 7427.' }),
  rad({ kod: 'LU_TFP_ASB18', blankett: 'FK 7426', version: '1.0', text: 'Läkarutlåtande för tillfällig föräldrapenning för ett allvarligt sjukt barn som inte har fyllt 18 år', mottagare: 'Försäkringskassan', part: 'FKASSA', alder: [0, 17], giltig: { fran: T.nov2025 }, fragor: tfpBarn(), fornyas: true, anmarkning: 'Utlåtandet skrivs om barnet, för förälderns ansökan.' }),
  rad({ kod: 'LU_TFP_B12_16', blankett: 'FK 7427', version: '1.0', text: 'Läkarutlåtande för tillfällig föräldrapenning, barn 12 till 16 år', mottagare: 'Försäkringskassan', part: 'FKASSA', alder: [12, 15], giltig: { fran: T.nov2025 }, fragor: tfpBarn({ allvarligt: false }), fornyas: true, anmarkning: 'Utlåtandet skrivs om barnet, för förälderns ansökan.' }),
  rad({ kod: 'TSTRK1007', blankett: 'TSTRK 1007', version: '1.0', text: 'Läkarintyg för högre körkortsbehörigheter', mottagare: 'Transportstyrelsen', part: 'TRANSP', sekretess: false, alder: [16, 130], giltig: { till: T.tstrk1007Slut }, ersattsAv: { kod: 'TS8071', version: '1.0' }, fragor: TSTRK1007, anmarkning: 'Ersatt av TS8071. Ett skrivet intyg kan läsas men inget nytt kan skapas.' }),
  rad({ kod: 'TS8071', blankett: 'TS 8071', version: '1.0', text: 'Läkarintyg för högre körkortsbehörigheter, taxiförarlegitimation och på begäran av Transportstyrelsen', mottagare: 'Transportstyrelsen', part: 'TRANSP', sekretess: false, alder: [16, 130], giltig: { fran: T.ts8071Start }, fragor: TS8071, anmarkning: 'Synskärpan är en fråga med fritext i demon. Följdfrågorna i varje område är sammanförda i beskrivningen.' }),
  rad({ kod: 'TSTRK1031', blankett: 'TSTRK 1031', version: '1.0', text: 'Läkarintyg diabetes, lämplighet att inneha körkort', mottagare: 'Transportstyrelsen', part: 'TRANSP', sekretess: false, alder: [16, 130], fragor: TSTRK1031, anmarkning: 'Frågetexterna är förenklade ur Intygstjänstens version 4 av intyget.' }),
  rad({ kod: 'TSTRK1009', blankett: 'TSTRK 1009', version: '1.0', text: 'Läkares anmälan till Transportstyrelsen om olämplighet att ha körkort', mottagare: 'Transportstyrelsen, med post', part: 'TRANSP', sekretess: false, alder: [16, 130], sandning: 'post', fragor: TSTRK1009, anmarkning: 'Läkaren är skyldig att anmäla och ska informera patienten om anmälan. Anmälan är inget intyg i Webcert: den signeras, skrivs ut och skickas med post (en regions rutin 2026). Demon har den i intygsapplikationen för att systemet ska kunna fylla i den.' }),
  rad({ kod: 'DB', blankett: 'Dödsbevis', version: '1.0', text: 'Dödsbevis', mottagare: 'Skatteverket', part: 'SKV', avliden: true, sandning: 'vid_signering', fragor: DB }),
  rad({ kod: 'DOI', blankett: 'Dödsorsaksintyg', version: '1.0', text: 'Dödsorsaksintyg', mottagare: 'Socialstyrelsen', part: 'SOS', avliden: true, sandning: 'vid_signering', fragor: DOI }),
];

export const KODER = [...new Set(INTYGSTYPER.map(t => t.kod))];
const nyckel = (kod, version) => `${kod}|${version}`;
const PER_VERSION = new Map(INTYGSTYPER.map(t => [nyckel(t.kod, t.version), t]));

// Tidpunkten som ett Date. Ett datum (ÅÅÅÅ-MM-DD) räknas som klockan 12 svensk tid den dagen.
export function tidpunkt(x = new Date()) {
  if (x instanceof Date) return x;
  if (typeof x === 'string' && /^\d{4}-\d\d-\d\d$/.test(x)) return new Date(`${x}T12:00:00+01:00`);
  const d = new Date(x);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}
export const galler = (t, nu = new Date()) => {
  const ms = tidpunkt(nu).getTime();
  return (!t.giltig.fran || ms >= Date.parse(t.giltig.fran)) && (!t.giltig.till || ms < Date.parse(t.giltig.till));
};
// Versionen av en intygstyp som gäller vid tidpunkten, eller null.
export const aktuell = (kod, nu = new Date()) => INTYGSTYPER.find(t => t.kod === kod && galler(t, nu)) ?? null;
// En bestämd version, för att läsa ett intyg som redan är skrivet. Saknas versionen används den senaste med koden.
export const typFor = (kod, version = null) => (version && PER_VERSION.get(nyckel(kod, version))) ?? [...INTYGSTYPER].reverse().find(t => t.kod === kod) ?? null;
// Den äldsta versionen som någonsin har gällt, för koder som ingen version gäller för nu (de ersatta).
export const senast = (kod) => [...INTYGSTYPER].reverse().find(t => t.kod === kod) ?? null;

// Åldersgränsen som gäller vid tidpunkten.
export function alderFor(t, nu = new Date()) {
  const ms = tidpunkt(nu).getTime();
  const r = (t.alderFran ?? []).filter(x => ms >= Date.parse(x.fran)).at(-1);
  return r ? { alder: r.alder, skal: r.skal } : { alder: t.alder, skal: null };
}

// Första bokstaven liten mitt i en mening, men bara i ett vanligt ord: förkortningar och namn behåller sina stora
// bokstäver (lärdomen från runda 15).
export const iMening = (s) => (s && /^[A-ZÅÄÖ][a-zåäö]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const datumSv = (s) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(s));
export const giltighetText = (t) => {
  if (t.giltig.till && t.ersattsAv) {
    const ny = typFor(t.ersattsAv.kod, t.ersattsAv.version);
    return ny.kod === t.kod ? `Version ${t.version} gällde till ${datumSv(t.giltig.till)}. Nya intyg skrivs med version ${ny.version}.` : `Ersattes av ${ny.blankett}, ${iMening(ny.text)}, den ${datumSv(ny.giltig.fran)}.`;
  }
  return null;
};

// ---------------------------------------------------------------------------------------------------------------
// Frågorna och svaren. Allt nedan är rena funktioner, som både servern och testerna använder.
// ---------------------------------------------------------------------------------------------------------------
export const fragorFor = (t) => t.fragor.flatMap(k => k.fragor);
const varde = (svar, id) => (Object.hasOwn(svar ?? {}, id) ? svar[id] : null);
function uppfyllt(villkor, svar) {
  const [id, ska] = villkor;
  const v = varde(svar, id);
  if (v == null) return false;
  const lista = Array.isArray(ska) ? ska : [ska];
  if (Array.isArray(v)) return v.some(x => lista.includes(typeof x === 'object' ? x.kod : x));
  if (v && typeof v === 'object') return Object.keys(v).some(k => lista.includes(k));
  return lista.includes(v);
}
// Om frågan visas med de svar som finns. En fråga vars villkor hänger på en fråga som inte visas visas inte heller.
export function synlig(t, fraga, svar, djup = 0) {
  if (djup > 10) return false;
  const alla = fragorFor(t);
  const beror = (v) => { const o = alla.find(x => x.id === v[0]); return o ? synlig(t, o, svar, djup + 1) : true; };
  if (fraga.dold && beror(fraga.dold) && uppfyllt(fraga.dold, svar)) return false;
  if (fraga.visas) return beror(fraga.visas) && uppfyllt(fraga.visas, svar);
  return true;
}
const tomt = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
const dagar = (fran, till) => Math.round((Date.parse(`${till}T12:00:00Z`) - Date.parse(`${fran}T12:00:00Z`)) / 86400_000) + 1;

// Vad som saknas eller är fel innan intyget kan signeras, på vanlig svenska. Varje rad pekar på sin fråga.
export function saknas(t, svar = {}) {
  const ut = [];
  const sedda = new Set();
  for (const k of t.fragor) {
    for (const q of k.fragor) {
      if (!synlig(t, q, svar)) continue;
      const v = varde(svar, q.id);
      const rad = (text) => ut.push({ fraga: q.id, rubrik: k.rubrik, text });
      if (q.kravEttAv && !sedda.has(q.kravEttAv.join())) {
        sedda.add(q.kravEttAv.join());
        if (q.kravEttAv.every(id => tomt(varde(svar, id)))) rad(`${q.text.replace(/\?$/, '')} eller symtom`);
      }
      if (q.krav && tomt(v)) { rad(q.text.replace(/\?$/, '')); continue; }
      if (q.typ === 'period' && v && q.maxDagar && v.fran && v.till && dagar(v.fran, v.till) > q.maxDagar) rad(`${q.text}: perioden kan vara högst ${q.maxDagar} dagar`);
      if (q.typ === 'perioder' && Array.isArray(v)) {
        const s = [...v].sort((a, b) => a.fran.localeCompare(b.fran));
        for (let i = 1; i < s.length; i++) if (s[i].fran <= s[i - 1].till) { rad(`${q.text}: perioderna överlappar varandra`); break; }
      }
    }
  }
  return ut;
}

// Vad som saknas som en mening, med rubrikerna där något saknas.
export function saknasText(lista) {
  const r = [...new Set(lista.map(x => x.rubrik))].map(iMening);
  if (!r.length) return '';
  const delar = r.length === 1 ? r[0] : `${r.slice(0, -1).join(', ')} och ${r.at(-1)}`;
  return `Fyll i det som saknas under ${delar} innan intyget signeras.`;
}

// Varningar som inte stoppar signeringen, till exempel dagens datum som beräknat födelsedatum.
export function varningar(t, svar = {}, nu = new Date(), dag = null) {
  const ut = [];
  for (const q of fragorFor(t)) {
    if (q.varnaIdag && varde(svar, q.id) && varde(svar, q.id) === dag && tidpunkt(nu).getTime() >= Date.parse(q.varnaIdag.fran)) ut.push({ fraga: q.id, text: q.varnaIdag.text });
  }
  return ut;
}

// Ett svar på en fråga, prövat mot frågans typ och alternativ. Kastar ett fel med en förklaring.
const DATUM = /^\d{4}-\d\d-\d\d$/;
const arDatum = (v) => typeof v === 'string' && DATUM.test(v) && !Number.isNaN(Date.parse(v)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
export class SvarsFel extends Error { constructor(fraga, text) { super(text); this.fraga = fraga; } }
export function normaliseraSvar(q, v) {
  if (v == null || v === '') return null;
  const fel = (text) => { throw new SvarsFel(q.id, `${q.text.replace(/\?$/, '')}: ${text}`); };
  const kod = (x) => (typeof x === 'string' && Object.hasOwn(q.alt, x) ? x : fel('välj ett av alternativen.'));
  const datum = (x) => (arDatum(x) ? x : fel('datum skrivs ÅÅÅÅ-MM-DD.'));
  const period = (x) => {
    if (!x || typeof x !== 'object' || Array.isArray(x)) fel('ange från och med och till och med.');
    const p = { fran: datum(x.fran), till: datum(x.till) };
    if (p.till < p.fran) fel('slutdatumet kan inte vara före startdatumet.');
    return p;
  };
  switch (q.typ) {
    case 'kryss': case 'ja_nej':
      if (typeof v !== 'boolean') fel('svara ja eller nej.');
      return q.typ === 'kryss' && v === false ? null : v;
    case 'val': return kod(v);
    case 'flerval': {
      if (!Array.isArray(v) || v.length > Object.keys(q.alt).length) fel('välj ett eller flera av alternativen.');
      const u = [...new Set(v.map(kod))];
      return u.length ? u : null;
    }
    case 'underlag': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) fel('välj vad intyget är baserat på och ange datum.');
      const ut = {};
      for (const [k, d] of Object.entries(v)) ut[kod(k)] = datum(d);
      return Object.keys(ut).length ? ut : null;
    }
    case 'datum': return datum(v);
    case 'period': return period(v);
    case 'perioder': {
      if (!Array.isArray(v) || v.length > 10) fel('ange en eller flera perioder.');
      const ut = v.map(x => ({ kod: kod(x?.kod), ...period(x) }));
      return ut.length ? ut : null;
    }
    case 'text': case 'rad': {
      if (typeof v !== 'string') fel('svaret ska vara text.');
      const s = v.trim().slice(0, q.max ?? 4000);
      return s || null;
    }
    case 'heltal': {
      const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,4}$/.test(v.trim()) ? Number(v.trim()) : NaN;
      if (!Number.isInteger(n) || n < (q.min ?? 0) || n > (q.max ?? 9999)) fel(`ange ett heltal mellan ${q.min ?? 0} och ${q.max ?? 9999}.`);
      return n;
    }
    case 'diagnoser': {
      if (!Array.isArray(v) || v.length > 3) fel('ange högst tre diagnoser.');
      const ut = v.map(x => {
        const k = typeof x?.kod === 'string' ? x.kod.trim().toUpperCase().replace('.', '') : '';
        if (!/^[A-Z]\d{2}[0-9A-Z]{0,4}$/.test(k)) fel('ange diagnosen med en kod ur ICD-10-SE.');
        const text = typeof x.text === 'string' ? x.text.trim().slice(0, 200) : '';
        return { kod: k, text: text || k };
      });
      return ut.length ? ut : null;
    }
    default: return fel('frågan kan inte besvaras.');
  }
}

// Fingeravtrycket av en fråga: det som ska vara oförändrat för att ett svar ska få följa med till en ny version.
const avtryck = (q) => JSON.stringify([q.typ, q.text, q.alt ? Object.entries(q.alt) : null, q.min ?? null, q.max ?? null]);

// Överföringen mellan två intygstyper eller versioner, vid förnyelse, förlängning och byte från ett ersatt intyg. Bara
// svaren på frågor som finns i båda med samma text, typ och alternativ följer med, och aldrig en fråga som läkaren ska ta
// ställning till på nytt (nyBedomning i någon av versionerna). Ger svaren och en förklaring för varje fråga som inte följde.
export function overfor(fran, till, svar = {}) {
  const ny = new Map(fragorFor(till).map(q => [q.id, q]));
  const ut = {};
  const foljde = [];
  const foljdeInte = [];
  for (const q of fragorFor(fran)) {
    const v = varde(svar, q.id);
    if (tomt(v)) continue;
    const m = ny.get(q.id);
    const skal = !m ? 'Frågan finns inte i den nya versionen.'
      : q.nyBedomning || m.nyBedomning ? 'Du tar ställning till frågan på nytt.'
        : avtryck(q) !== avtryck(m) ? 'Frågan har ändrats i den nya versionen.' : null;
    if (skal) foljdeInte.push({ fraga: q.id, text: q.text, skal });
    else { ut[q.id] = v; foljde.push(q.id); }
  }
  return { svar: ut, foljde, foljdeInte };
}
