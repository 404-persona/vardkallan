// Runda 12, r3 (vårt L2): behovs- och riskanalysen per roll, enligt patientdatalagen 4 kap. 2 § och HSLF-FS 2016:40
// 4 kap. 2 och 3 §§. Analysen är data här, bredvid behörighetsmotorn, så att ett test kan stoppa bygget om en roll i
// atkomst.js saknar analys eller om analysen säger något annat än koden. docs/behorighetsanalys.md skrivs ur den med
// scripts/behorighetsanalys-md.js.
//
// För varje roll: behovet av uppgifter, riskerna, hur risken begränsas och handlingar som rollen inte ska ha. Listan
// med rollens handlingar i dokumentet tas direkt ur ROLLER.
import { ROLLER } from './atkomst.js';
// Några moduler lägger till handlingar i ROLLER när de laddas (till exempel barnhälsovården). Servern laddar alla, så
// att analysen jämförs med rollerna som de är i drift.
import './server.js';

export const INLEDNING = [
  "Det här är Vårdkällans egen behovs- och riskanalys för tilldelningen av behörigheter, enligt patientdatalagen 4 kap. 2 § och HSLF-FS 2016:40 4 kap. 2 och 3 §§. För varje roll beskrivs vilket behov av uppgifter rollen har, vilka risker åtkomsten medför och hur risken begränsas, och vilka handlingar rollen har i behörighetsmotorn (`app/src/atkomst.js`). En vårdgivare som använder Vårdkällan gör sin egen analys utifrån sin verksamhet. Den här analysen är utgångspunkten och visar hur rollerna i systemet är tänkta.",
  "Analysen och koden hänger ihop. Ett test i bygget (`app/test/behorighetsanalys.test.js`) stoppar bygget om en roll i koden saknar analys, om listan med handlingar här skiljer sig från koden eller om en handling som analysen säger att rollen inte ska ha finns i koden.",
  "För alla roller gäller: all behörighet prövas på servern i varje anrop, varje åtkomst till patientuppgifter loggas i en logg som inte går att ändra, och handlingar som rollen saknar nekas och loggas som nekade."
];

export const ANALYS = {
  lakare: {
    namn: "Läkare",
    behov: "Utreder, diagnostiserar och behandlar. Behöver läsa och skriva hela journalen för patienter med vårdrelation, ordinera läkemedel och cytostatika, beställa prover och undersökningar, bedöma och besvara remisser, kontrasignera och använda nödåtkomst när patienten inte kan samtycka.",
    risker: "Bredast åtkomst av alla roller, och därmed störst risk för otillåten läsning (nyfikenhet, fel patient) och för felaktiga ordinationer.",
    atgarder: "Åtkomst bara med vårdrelation på den egna vårdenheten. Andra vårdenheter kräver aktivt val, spärrar kräver patientens samtycke, och nödåtkomst häver aldrig en spärr, loggas och flaggas i logguppföljningen. Ordinationer kontrolleras mot varningsreglerna och kräver motiverad kvittens. Den som signerat kan inte kontrasignera själv.",
    inte: ["las_logg", "konfigurera", "datauttag", "faktureringsunderlag", "sla_samman", "gallra"],
  },
  sjukskoterska: {
    namn: "Sjuksköterska",
    behov: "Planerar och ger omvårdnad, ger läkemedel, tar prover och registrerar mätvärden. Behöver läsa journalen och läkemedelslistan och skriva omvårdnadsanteckningar. Utfärdar intyg om graviditet på mödrahälsovården och intyg om tillfällig föräldrapenning, som Försäkringskassan tar emot från sjuksköterskor.",
    risker: "Läsning utan behov, och läkemedel som ges utan giltig ordination.",
    atgarder: "Kan inte ordinera läkemedel annat än enligt generella direktiv och muntliga ordinationer som läkaren signerar. Samma regler för vårdrelation, aktivt val, spärr och nödåtkomst som för läkaren. Administreringen kontrollerar ordinationen.",
    inte: ["ordinera", "skriv_journal", "kontrasignera", "ordinera_cytostatika", "las_logg", "konfigurera", "skriv_intyg"],
  },
  underskoterska: {
    namn: "Undersköterska",
    behov: "Omvårdnad, mätvärden och provtagning. Behöver se läkemedel, mätvärden, överkänslighet och omvårdnadsanteckningar.",
    risker: "Tillgång till känsliga läkaranteckningar, diagnoser och kuratorns och psykologens anteckningar, som inte behövs för uppgiften.",
    atgarder: "Läser inga läkaranteckningar, inga diagnoser och sedan runda 16 inte kuratorns och psykologens anteckningar, som läses med las_journal. Ger läkemedel bara med en giltig delegering i dag. Ingen nödåtkomst.",
    inte: ["las_journal", "las_diagnoser", "ordinera", "nodatkomst", "skriv_journal"],
  },
  vardadministrator: {
    namn: "Vårdadministratör",
    behov: "Tar emot remisser, bokar, kallar, checkar in, registrerar vårdkontakter och patienter och hanterar kassan. Flyttar uppgifter som har registrerats på fel patient till rätt patient, och godkänner en annan vårdadministratörs förslag om flytt. Skapar och fyller i utkast till intyg åt läkaren och markerar dem klara för signering, som i Webcert.",
    risker: "Insyn i journaltext eller läkemedel utan vårdbehov.",
    atgarder: "Ser kontaktuppgifter, vårdkontakter och remissernas status men ingen journaltext och inga läkemedel. Åtkomsten grundas som administrativ uppgift. Signerar aldrig intyg, och förifyllnaden av ett utkast tar inget ur journalen som rollen inte får läsa. För en patient med skyddade personuppgifter når rollen inte intygen.",
    inte: ["las_journal", "las_omvardnad", "las_lakemedel", "las_diagnoser", "ordinera", "skriv_intyg"],
  },
  logggranskare: {
    namn: "Logggranskare",
    behov: "Följer upp åtkomstloggen och gör stickprovskontroller enligt HSLF-FS 2016:40 4 kap. 9 och 9 b §§.",
    risker: "Loggen visar vilka patienter som har vårdats var, och granskaren skulle kunna läsa journalen.",
    atgarder: "Läser loggen men aldrig journalen. Loggen kan inte ändras, och granskningarna sparas.",
    inte: ["las_journal", "las_oversikt", "las_lakemedel"],
  },
  arkivarie: {
    namn: "Arkivarie",
    behov: "Registrerar beslut, skapar exportpaket till e-arkiv och verkställer gallring och förstöring efter beslut.",
    risker: "Att journaler utplånas utan beslut.",
    atgarder: "Läser inte journalen. Gallring tar bara journaler äldre än tio år efter den sista uppgiften, och allt loggas.",
    inte: ["las_journal", "las_oversikt", "ordinera"],
  },
  uppfoljning: {
    namn: "Analytiker (uppföljning)",
    behov: "Hämtar datauttag och statistik för verksamhetsuppföljning och rapporterar till myndigheter och register.",
    risker: "Att uppgifter går att knyta till enskilda patienter.",
    atgarder: "Datauttaget saknar namn och personnummer och använder pseudonymer. Små tal spärras. Läser inte journalen.",
    inte: ["las_journal", "las_oversikt", "sok"],
  },
  farmaceut: {
    namn: "Farmaceut",
    behov: "Gör farmaceutens bedömning i läkemedelsgenomgången och bereder cytostatika.",
    risker: "Tillgång till journaltext som inte behövs för läkemedelsbedömningen.",
    atgarder: "Läser läkemedelslistan, mätvärden och diagnoser men inga journalanteckningar. Ordinerar inte.",
    inte: ["las_journal", "ordinera", "skriv_journal"],
  },
  kommun: {
    namn: "Kommunens personal (simulerad)",
    behov: "Samordnad planering inför utskrivning.",
    risker: "Att en annan huvudman läser regionens journal.",
    atgarder: "Ser bara det regionen har skickat i samordnad planering och läser aldrig journalen.",
    inte: ["las_journal", "las_oversikt", "sok"],
  },
  verksamhetschef: {
    namn: "Verksamhetschef",
    behov: "Utser uppdrag i läkemedelshanteringen, fastställer direktiv, utfärdar utbildarintyg och följer vårdenhetens intyg och signeringslistan. Godkänner som andra person att uppgifter som har registrerats på fel patient flyttas till en patient utan vårdrelation till vårdenheten.",
    risker: "Att chefsrollen används för att läsa enskilda patienters journaler.",
    atgarder: "Läser inte journalen. Uppgifterna gäller den egna vårdenheten. Ett förslag om flytt visar numret som skrevs men ingenting om patienten som numret leder till, och den som föreslog flytten kan aldrig godkänna den själv.",
    inte: ["las_journal", "las_oversikt", "ordinera"],
  },
  ekonom: {
    namn: "Ekonom",
    behov: "Hämtar faktureringsunderlag och ändrar prislistor.",
    risker: "Att ekonomiska underlag röjer vårdinnehåll eller skyddade personuppgifter.",
    atgarder: "Läser inte journalen. Underlaget innehåller aldrig namn eller adress för en patient med skyddade personuppgifter.",
    inte: ["las_journal", "las_oversikt", "sok"],
  },
  systemforvaltare: {
    namn: "Systemförvaltare",
    behov: "Ändrar regler och parametrar, förbereder omorganisationer, beslutar om undantag och förvaltar det öppna API:t. Registrerar incidenter, följer upp servicenivåerna och tar ut incidentrapporten till beställaren.",
    risker: "Att ändringar i konfigurationen ger någon åtkomst eller ändrar regler utan kontroll, och att patientuppgifter hamnar i en incident som lämnar systemet.",
    atgarder: "Läser inte journalen. Ändringar kräver fyra ögon, det vill säga en andra systemförvaltare i sin egen inloggning, och loggas. En incident tar inte emot en text som ser ut att innehålla ett personnummer, och incidentrapporten har inga patientuppgifter och loggas i säkerhetsloggen.",
    inte: ["las_journal", "las_oversikt", "ordinera"],
  },
  fysioterapeut: {
    namn: "Fysioterapeut",
    behov: "Läser journalen, skriver anteckningar, registrerar mätvärden och skickar, tar emot och besvarar remisser.",
    risker: "Läsning utan behov och läkemedel som ordineras utanför yrkets ansvar.",
    atgarder: "Ordinerar och ger inga läkemedel. Samma regler för vårdrelation, aktivt val och spärr som för övrig vårdpersonal.",
    inte: ["ordinera", "ge_lakemedel", "nodatkomst"],
  },
  systemkonto: {
    namn: "Systemkonto för en tillämpning",
    behov: "En tillämpning utan inloggad person hämtar avgränsade uppgifter genom det öppna API:t (SMART Backend Services). En organisation som är ansluten via tjänstekontrakt i RIVTA (NPÖ, Journalen och sammanhållen journalföring) läser journalanteckningar och åtgärder för de vårdenheter den är ansluten för.",
    risker: "Att en tillämpning hämtar mer än den behöver, utan en person som ansvarar i stunden. Att journalanteckningar lämnas ut till en organisation som inte ska ha dem.",
    atgarder: "Prövas mot kontots vårdenheter och informationsmängder, aldrig med vårdrelation, med pseudonymer som förval. Kan bara läsa. Journalanteckningar och åtgärder (las_journal) är informationsmängder som bara ett konto för en anslutning via tjänstekontrakt kan få, aldrig ett konto som registreras för det öppna API:t, och aldrig för patienter med skyddade personuppgifter eller spärrade uppgifter.",
    inte: ["skriv_journal", "ordinera", "nodatkomst"],
  },
};

// Runda 16, r3: de nya yrkesrollerna och studenterna.
Object.assign(ANALYS, {
  arbetsterapeut: {
    namn: "Arbetsterapeut",
    behov: "Bedömer vad patienten klarar i vardagen, anpassar och förskriver hjälpmedel och planerar inför utskrivningen. Behöver läsa journalen, skriva arbetsterapianteckningar, registrera mätvärden och skicka, ta emot och besvara remisser.",
    risker: "Läsning utan behov och läkemedel som ordineras eller ges utanför yrkets ansvar.",
    atgarder: "Ordinerar och ger inga läkemedel och har ingen nödåtkomst. Skriver bara med yrkets mallar i omvårdnadens kategori. Samma regler för vårdrelation, aktivt val och spärr som för övrig vårdpersonal.",
    inte: ["ordinera", "ge_lakemedel", "nodatkomst", "skriv_journal"],
  },
  dietist: {
    namn: "Dietist",
    behov: "Utreder och behandlar nutritionen. Behöver läsa journalen, läkemedelslistan och mätvärdena som vikt och provsvar, skriva dietistanteckningar och ta emot och besvara remisser.",
    risker: "Läsning utan behov och läkemedel som ordineras eller ges utanför yrkets ansvar.",
    atgarder: "Ordinerar och ger inga läkemedel och har ingen nödåtkomst. Skriver bara med yrkets mallar i omvårdnadens kategori. Samma regler för vårdrelation, aktivt val och spärr som för övrig vårdpersonal.",
    inte: ["ordinera", "ge_lakemedel", "nodatkomst", "skriv_journal"],
  },
  logoped: {
    namn: "Logoped",
    behov: "Utreder och behandlar kommunikation, språk, tal, röst och sväljning och förskriver kommunikationshjälpmedel. Behöver läsa journalen, skriva logopedanteckningar och ta emot och besvara remisser.",
    risker: "Läsning utan behov och läkemedel som ordineras eller ges utanför yrkets ansvar.",
    atgarder: "Ordinerar och ger inga läkemedel och har ingen nödåtkomst. Skriver bara med yrkets mallar i omvårdnadens kategori. Samma regler för vårdrelation, aktivt val och spärr som för övrig vårdpersonal.",
    inte: ["ordinera", "ge_lakemedel", "nodatkomst", "skriv_journal"],
  },
  kurator: {
    namn: "Hälso- och sjukvårdskurator",
    behov: "Arbetar med patientens sociala förhållanden, krisstöd och samtal, och upprättar samordnade individuella planer (SIP). Behöver läsa journalen och diagnoserna, skriva kuratorsanteckningar, se om patienten vårdas med tvång och ta emot och besvara remisser.",
    risker: "Kuratorns anteckningar är ofta känsliga, och läsning utan behov är en risk för integriteten. Läkemedel och mätvärden behövs inte i arbetet.",
    atgarder: "Läser inte läkemedelslistan och mätvärdena, ordinerar och ger inga läkemedel och har ingen nödåtkomst. Anteckningarna har samma inre sekretess, spärr och loggning som andra anteckningar, och andra vårdenheter ser dem bara efter ett aktivt val.",
    inte: ["las_lakemedel", "las_matvarden", "ordinera", "ge_lakemedel", "nodatkomst"],
  },
  psykolog: {
    namn: "Psykolog",
    behov: "Utreder och behandlar, också med psykoterapi (psykoterapeuten är en titel inom rollen). Behöver läsa journalen, läkemedelslistan och mätvärdena, registrera skattningar, skriva psykologanteckningar, se om patienten vårdas med tvång och ta emot och besvara remisser.",
    risker: "Psykologens anteckningar är känsliga, och läsning utan behov är en risk för integriteten.",
    atgarder: "Ordinerar och ger inga läkemedel, beslutar inte om tvångsvård och har ingen nödåtkomst. Anteckningarna har samma inre sekretess, spärr och loggning som andra anteckningar.",
    inte: ["ordinera", "ge_lakemedel", "tvangsvard", "nodatkomst"],
  },
  barnmorska: {
    namn: "Barnmorska",
    behov: "För graviditetsjournalen och förlossningsjournalen, ger läkemedel och gör det sjuksköterskan gör på förlossningen och BB, rapporterar till Graviditetsregistret, förskriver preventivmedel och handleder barnmorskestudenter.",
    risker: "Läkemedel som förskrivs utanför förskrivningsrätten, och läsning utan behov.",
    atgarder: "Kräver vid inloggning genom en extern tjänst både barnmorskans och sjuksköterskans legitimation, eftersom rollen har sjuksköterskans handlingar. Har inte handlingen ordinera. Förskrivningen gäller bara de preventivmedel som föreskrifterna räknar upp, systemet visar bara dem, och en allvarlig varning stoppar förskrivningen och hänvisar till läkaren. Gör inte barnhälsovårdens uppgifter.",
    inte: ["ordinera", "vaccinera", "skriv_journal", "skriv_intyg"],
  },
  lakarstudent: {
    namn: "Läkarstudent",
    behov: "Lär sig under handledning av en läkare. Behöver läsa journalen för patienterna på handledarens vårdenhet och skriva anteckningar som handledaren kontrasignerar.",
    risker: "Att studenten fattar beslut eller dokumenterar utan handledning, och att åtkomsten finns kvar efter praktiken.",
    atgarder: "Åtkomst bara under en pågående handledning hos en läkare på samma vårdenhet, prövad i varje anrop. Ordinerar inte, ger inga läkemedel, signerar inga intyg och har ingen nödåtkomst, inga aktiva val och ingen visning av skyddad identitet. Varje signerad anteckning går till handledaren för kontrasignering.",
    inte: ["ordinera", "ge_lakemedel", "skriv_intyg", "nodatkomst", "skriv_journal", "andra_enheter"],
  },
  sjukskoterskestudent: {
    namn: "Sjuksköterskestudent",
    behov: "Lär sig under handledning av en sjuksköterska eller barnmorska. Behöver läsa journalen och läkemedelslistan för patienterna på handledarens vårdenhet och skriva omvårdnadsanteckningar som handledaren kontrasignerar.",
    risker: "Att studenten ger läkemedel eller dokumenterar utan handledning, och att åtkomsten finns kvar efter praktiken.",
    atgarder: "Åtkomst bara under en pågående handledning på samma vårdenhet, prövad i varje anrop. Ger inga läkemedel på egen hand, ordinerar inte och har ingen nödåtkomst. Varje signerad anteckning går till handledaren för kontrasignering.",
    inte: ["ordinera", "ge_lakemedel", "skriv_omvardnad", "nodatkomst", "delegera"],
  },
  barnmorskestudent: {
    namn: "Barnmorskestudent",
    behov: "Lär sig under handledning av en barnmorska. Behöver läsa journalen och graviditetsjournalen för patienterna på handledarens vårdenhet och skriva anteckningar som handledaren kontrasignerar.",
    risker: "Att studenten för graviditets- eller förlossningsjournalen eller ger läkemedel utan handledning, och att åtkomsten finns kvar efter praktiken.",
    atgarder: "Åtkomst bara under en pågående handledning hos en barnmorska på samma vårdenhet, prövad i varje anrop. Läser graviditetsjournalen men för den inte, ger inga läkemedel på egen hand, förskriver inte och har ingen nödåtkomst. Varje signerad anteckning går till handledaren för kontrasignering.",
    inte: ["graviditet", "ordinera", "ge_lakemedel", "forskriva_preventivmedel", "nodatkomst"],
  },
});
// Runda 16: rehabkoordinatorn (rehabkoordinator.js).
ANALYS.rehabkoordinator = {
  namn: "Rehabkoordinator",
  behov: "Ger koordineringsinsatser till sjukskrivna patienter enligt lagen (2019:1297) om koordineringsinsatser för sjukskrivna patienter: personligt stöd, intern samordning och samverkan med andra aktörer. Behöver, som rollen i Ineras Rehabstöd, se vårdenhetens pågående sjukfall (namn, personnummer, ålder, kön, diagnos och sysselsättning i det nuvarande intyget, datum, längd, grad och läkare) och sätta REKO-status per sjukfall.",
  risker: "Översikten visar många patienter på en gång, och diagnoserna är känsliga. Koordineringsinsatser utan patientens samtycke strider mot lagen (3 §).",
  atgarder: "Tabellen är tom tills koordinatorn söker, och varje patient som visas loggas. Bara sjukintygen på den egna vårdenheten räknas, varje patient prövas med vårdrelation mot vårdenheten, och patienter med skyddade personuppgifter visas inte. Läser inte journalen, läkemedelslistan eller intygen, skriver och signerar inga intyg och har ingen nödåtkomst, inga aktiva val och inget samtycke till spärrade uppgifter. Statusarna Aktiv och Uppföljning kräver att koordinatorn bekräftar patientens samtycke, och historiken ändras aldrig.",
  inte: ["las_journal", "las_lakemedel", "las_intyg", "skriv_intyg", "utkast_intyg", "nodatkomst", "andra_enheter", "samtycke_sparr", "visa_identitet", "sok"],
};

export function markdown() {
  const ut = ['# Behovs- och riskanalys per roll', '', ...INLEDNING.flatMap(s => [s, '']).slice(0, -1)];
  for (const [roll, h] of Object.entries(ROLLER)) {
    const a = ANALYS[roll];
    if (!a) continue;
    ut.push('', `## ${a.namn} (${roll})`, '', `Behov: ${a.behov}`, '', `Risker: ${a.risker}`, '', `Så begränsas risken: ${a.atgarder}`, '',
      `Får inte: ${a.inte.map(x => `\`${x}\``).join(', ')}.`, '', `Handlingar i koden (${h.length}): ${h.map(x => `\`${x}\``).join(', ')}.`);
  }
  return `${ut.join('\n')}\n`;
}
