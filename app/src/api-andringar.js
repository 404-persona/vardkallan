// Ändringsloggen för det öppna API:t (runda 9, r6, Sussa 2.5.1.1 och 2.5.1.3). Ett öppet gränssnitt som hålls aktuellt
// behöver tala om vad som ändrats i varje version. Varje resurstyp och varje skrivning som CapabilityStatement anger har
// en rad här med den version där den kom, och testet i app/test/runda9-r6.test.js stoppar bygget om
// CapabilityStatement anger något som loggen saknar, eller tvärtom. Versionen i CapabilityStatement är programmets version
// i package.json, och den senaste raden här gäller samma version.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const VERSION = (() => { try { return JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8')).version; } catch { return null; } })();

// resurser är resurstyperna som kom i versionen, skrivning är resurstyp och interaktion (Condition:create) och
// annat är ändringar som inte är en resurstyp, till exempel SMART on FHIR.
export const ANDRINGAR = [
  // Runda 18: version 1.8. Varje del lägger sina rader i annat i ett eget block.
  {
    version: '1.8.0', datum: '2026-11-19',
    text: 'Den som testar för första gången, ekonomin och lagringen för äldre uppgifter.',
    resurser: [], skrivning: [], annat: [
      // Runda 18, r3: ekonomin och lagringen för äldre uppgifter (docs/api-avvikelser.md).
      'Nya rutter för uthämtning och betalning av hjälpmedel med kvitto, priset för ett läkemedel, kostnaderna per vårdenhet och månad, avtal med betalningsmottagare och flytten till lagringen för äldre uppgifter. Läkemedelskatalogen och förslaget för beställning av prover har priset för den som ser priser, och kostnadsrutan har prover och undersökningar, källor, jämförelse och hjälpmedel att hämta ut (docs/api-avvikelser.md).',
    ],
  },
  // Legitimation och förskrivningsrätt ur HOSP: version 1.7.
  {
    version: '1.7.0', datum: '2026-11-17',
    text: 'Legitimationen och förskrivningsrätten ur Socialstyrelsens register (HOSP).',
    resurser: [], skrivning: [], annat: [
      // HOSP: legitimationen och förskrivningsrätten ur Socialstyrelsens register (docs/api-avvikelser.md).
      'Nya rutter för systemförvaltarens lista över personalens legitimation ur HOSP, för att hämta om uppgifterna och för de egna uppgifterna, ett fält i läkemedelskatalogen för läkemedel som den inloggade inte får förskriva, förklaringen i barnmorskans förslag till preventivmedel, en lista i rapporten från inläsningen av personalkatalogen och 403 med en förklaring när förskrivningsrätten saknas eller är begränsad eller legitimationen saknas eller är återkallad (docs/api-avvikelser.md)',
    ],
  },
  // Runda 16: version 1.6. Varje del lägger sina rader i annat i ett eget block.
  {
    version: '1.6.0', datum: '2026-11-15',
    text: 'Intygen, stödet vid sjukskrivning och nya roller.',
    resurser: [], skrivning: [], annat: [
      // Runda 16, r1: intygen (docs/api-avvikelser.md).
      'Intygstyperna har version och blankett, och svaren i intygsapplikationen ligger per fråga i fältet "svar" med frågans id som nyckel i GET och POST /api/intygsapplikation/:id. Fälten från version 1.5 tas emot som förut för sjukpenningen (docs/api-avvikelser.md)',
      'Nya rutter för förnyelse och byte från ett ersatt intyg, utskrift och åtgärderna för klart för signering och byte (docs/api-avvikelser.md). Sändning kräver att patienten har bekräftat den, och makulering en orsak',
      // Runda 16, r3: de nya rollerna, handledningen och preventivmedlen (docs/api-avvikelser.md).
      'Nya yrken i personalkatalogen och sessionen: arbetsterapeut, dietist, logoped, kurator, psykolog, barnmorska och tre studenter (läkarstudent, sjuksköterskestudent och barnmorskestudent). Barnmorskan har ett eget yrke i stället för sjuksköterskans',
      'GET och POST /api/handledning och POST /api/handledning/{id}/avsluta för studenternas handledning, och fältet handledning på en anteckning som en student har skrivit',
      'GET och POST /api/patient/{id}/preventivmedel för barnmorskans förskrivning av preventivmedel',
      'En inloggning genom en extern tjänst kräver legitimationen för rollen ur Ineras kodverk för legitimerad yrkesgrupp. Barnmorskans roll kräver både barnmorskans och sjuksköterskans legitimation, och sjuksköterskans roll sjuksköterskans',
      // Runda 16, r3 (beslut 2026-11-15): kuratorns och psykologens anteckningar och kuratorns SIP.
      'Kuratorns och psykologens anteckningar (Kuratorsanteckning och Psykologanteckning) lämnas inte ut till undersköterskan, varken i journalens API, sökningen, översikten, utskriften eller FHIR Composition, och kuratorn kan upprätta en samordnad individuell plan med POST /api/patient/{id}/samordning och typ sip',
      // Runda 16, r2: stödet vid sjukskrivning (docs/api-avvikelser.md).
      'Nya rutter i det interna API:t: patientens sjukfall med beslutsstöd och förslag till förlängning (GET /api/patient/:id/sjukskrivning), förlängning med ett klick (POST /api/patient/:id/sjukskrivning/forlang), läkarens pågående sjukfall (GET /api/sjukskrivningar), vårdenhetens sjukfall som antal (GET /api/sjukskrivningar/enhet) och Socialstyrelsens försäkringsmedicinska beslutsstöd för ett utkast med förslaget till perioden (GET /api/intygsapplikation/:id/beslutsstod)',
      'Statusuppdateringen för ett signerat sjukintyg har svaren 28, 32 och 37 (sysselsättning, sjukskrivningens perioder och motiveringen till beslutsstödet), och förlängningen förnyar förra intyget',
      // Runda 16: rehabkoordinatorn (docs/api-avvikelser.md).
      'Nytt yrke rehabkoordinator i personalkatalogen och sessionen. Nya rutter: vårdenhetens pågående sjukfall för rehabkoordinatorn med filter på REKO-status (GET /api/rehabkoordinator/sjukfall med parametrarna för sökningen och statusen), sjukfallen för en patient med REKO-historiken (GET /api/rehabkoordinator/patient/:id) och att sätta REKO-status (POST /api/rehabkoordinator/patient/:id/reko). Sjukfallen i GET /api/sjukskrivningar och GET /api/patient/:id/sjukskrivning har fältet reko',
    ],
  },
  // Runda 15: version 1.5. Varje del lägger sina rader i annat i ett eget block.
  {
    version: '1.5.0', datum: '2026-11-14',
    text: 'Ny resurstyp i FHIR: Consent.',
    resurser: [
      // Runda 15, r2: samtycket till sammanhållen journalföring.
      'Consent',
    ], skrivning: [], annat: [
      // Runda 15, r3: mellanarkivet i FHIR, i läkemedelslistan och reservservern (docs/api-avvikelser.md).
      'Composition, Observation, MedicationRequest och MedicationAdministration tar med handlingar ur mellanarkivet, med id ma-<nummer>, koden mellanarkiv i meta.tag (kodsystemet lagring) och paketet i meta.source',
      'Läkemedelslistan i det interna API:t har fältet mellanarkiv med avslutade ordinationer ur mellanarkivet, och en handling ur mellanarkivet kan vara en ordination eller en administrering (docs/api-avvikelser.md)',
      // Beslut 2026-11-14.
      'Encounter, Condition och ServiceRequest tar med avslutade vårdkontakter, tillfälliga diagnoser och avslutade remisser ur mellanarkivet, och referenserna till dem pekar på id:t ma-<nummer>',
      'Min journal visar handlingarna i mellanarkivet med id ma-<nummer> och fältet arkiv, och sidan Lagring har loggen från reservservern (docs/api-avvikelser.md)',
      'Invånarens FHIR-API (en session från Min journal) tar med det som Min journal visar ur mellanarkivet, med samma tagg, i sökningen på patient, i $everything och på id ma-<nummer>',
      'Reservservern svarar 423 med koden reservserver på varje anrop som skulle ändra något, och hälsokontrollen och sessionen har fältet reservserver med kopians tid och ålder',
      // Runda 15, r5: mallarna per yrke, omvårdnadsprocessen och formulärens förifyllnad (docs/api-avvikelser.md).
      'Omvårdnadsanteckningen har omvårdnadsproblem och resultat mot vårdplanens mål (process i POST /api/patient/:id/anteckningar), och Composition har dem som Condition och Goal i contained',
      'Nytt: GET /api/patient/:id/omvardnadsprocess med vårdplanens mål, föreslagna omvårdnadsproblem och statusområden, undersköterskans observationer och formulär att fylla i',
      'GET /api/mallar ger bara de mallar som personens yrke skriver med, yrkets huvudmall först (huvudmall), och de nya mallarna Observationsanteckning, Fysioterapianteckning, Arbetsterapianteckning, Kuratorsanteckning och Dietistanteckning',
      'Formulärens förifyllnad har läkemedel som ökar risken för fall, NEWS2 och förra svaret, och ett svarsalternativ kan ha ett antal',
      'Sökorden Status och Planering har nya koder i Snomed CT, och Aktivitet har ingen kod',
      // Runda 15, r4: anteckningsvyn.
      'Composition: ett sökord med värden ur underlaget har section.entry med referenser till Observation, MedicationRequest, Condition och Encounter, bara till resurser som läsaren får se',
      'Nya rutter i det interna API:t: mallen med underlag, varianter och förslag för en patient (GET /api/patient/:id/anteckningsmall), utkastet som sparas av sig självt (PUT och DELETE /api/patient/:id/anteckningsutkast), egna fraser och egen ordning på sökorden (/api/egna-fraser) och den senaste bedömningen i listan över anteckningar (docs/api-avvikelser.md)',
      // Runda 15, r1: SITHS och tillitsnivå 3 som flerfaktor, och lägsta tillitsnivå per inloggningstjänst.
      'Inloggningens tillitsnivå i sessionen, lägsta tillitsnivå per inloggningstjänst med fyra ögon och demons inloggning med tillitsnivå 2 för personalen och invånaren i det interna API:t, och inloggningsbegäran till en inloggningstjänst ber om tjänstens lägsta nivå. Känsliga handlingar svarar 403 med en egen felkod när inloggningen inte är flerfaktor (docs/api-avvikelser.md)',
      // Runda 15, r2: samtycket i samtyckestjänsten och engagemangsindex (docs/rivta.md och docs/api-avvikelser.md).
      'Samtycket till sammanhållen journalföring prövas både i Vårdkällan och i samtyckestjänsten (GetExtendedConsentsForPatient 1.0), och registreringar och återkallelser skickas genom en kö. Läget för sammanhållen journalföring har samtyckeGaller, samtyckeKalla, samtyckeText och samtyckestjanst',
      'Engagemangsindex uppdateras av sig självt när journalen ändras, efter Ineras regler för Update 1.0, och nya rutter för systemförvaltarens sida Nationella tjänster (docs/api-avvikelser.md)',
      'Samtyckets giltighet (giltighet och giltigTill), hämtning för skyddade personuppgifter bara vid nödåtkomst, och makulering av en vårdkontakt på fel patient i det interna API:t (docs/api-avvikelser.md)',
      // Säkerhetsgranskningen efter sammanslagningen.
      'Förslag om flytt till rätt patient: listan utan patientuppgifter och GET /api/flyttar/:id för det öppnade förslaget, makulering utan rätt patient bara för en planerad kontakt, och FHIR svarar 404 på en resurs som är dold av spärr (docs/api-avvikelser.md)',
    ],
  },
  // Runda 14: version 1.4. Varje del lägger sina rader i annat i ett eget block.
  {
    version: '1.4.0', datum: '2026-11-13',
    text: 'Inga nya resurstyper eller skrivningar i FHIR.',
    resurser: [], skrivning: [], annat: [
      // Runda 14, r2: tjänstekontrakten i RIVTA (docs/rivta.md och docs/api-avvikelser.md).
      'Tjänstekontrakten i RIVTA: producent för GetCareDocumentation 2.1, GetDiagnosis 2.0, GetAlertInformation 2.0, GetCareContacts 2.0 och AssertCareEngagement 1.0 med SOAP och ömsesidig TLS, och konsument för HSA, PU-tjänsten, spärrtjänsten, samtyckestjänsten, den aggregerande tjänsten och engagemangsindex (simulerade i demon)',
      'Tabellen över tjänstekontrakt har för varje kontrakt i RIVTA versionen, rollen och att det är byggt, testat lokalt och inte anslutet (rivta och rivtaStatus)',
      'Nya rutter i det interna API:t: tillfällig hävning av spärr hos en annan vårdgivare, jämförelse av spärrar med spärrtjänsten, folkbokföringen ur PU-tjänsten, personalens uppgifter ur HSA och engagemangsindex (docs/api-avvikelser.md)',
      // Runda 14, r3: intyg, e-remiss och vaccinationer med tjänstekontrakt i RIVTA.
      'Intyg genom intygsapplikationen (/api/patient/:id/intyg och /api/intygsapplikation/:id) och e-remiss (/api/patient/:id/eremiss) i det interna API:t (docs/api-avvikelser.md)',
      'Tjänstekontrakten CreateDraftCertificate, CertificateStatusUpdateForCare, ListCertificatesForCareWithQA, ProcessRequest, ProcessRequestConfirmation, ProcessRequestOutcome och GetVaccinationHistory i RIVTA, byggda och validerade mot sina scheman (docs/rivta.md)',
      'Formulärtjänsten, 1177:s inkorg, NKRR, dosdispenseringen och Infektionsverktyget som konsument mot simulerade tjänster, och RIVTA Basic Profile 2.0 med wsa:To och xsi:type i grunden (docs/rivta.md)',
      // Runda 14, r4: mellanarkivet, reservdatorn för läkemedel och testprotokollet (docs/api-avvikelser.md).
      'Journalhandlingar i mellanarkivet per patient och en i taget, och beslut om överföring till mellanarkiv med underlag och överföring, i det interna API:t',
      'Listan för vårdenhetens reservdator för läkemedel med inskrivna patienters ordinationer och dagens doser i det interna API:t',
      'Nytt: GET /api/krav/testprotokoll, testprotokollet med spårbarhet från krav till testfall, öppet utan inloggning',
      // Runda 14, r5: servicenivåerna, incidentregistret och incidentrapporten till beställaren.
      'Incidentregistret, månadsrapporten för servicenivåerna och incidentrapporten till beställaren i det interna API:t för systemförvaltaren (docs/api-avvikelser.md)',
      // Runda 14, r1: inloggning genom beställarens inloggningstjänst (Sussa 5.2.1.1).
      'Inloggning genom vårdgivarens egen inloggningstjänst med OpenID Connect (authorization code och PKCE), konfigurationen av tjänsterna med fyra ögon och övningstjänsten i det interna API:t (docs/api-avvikelser.md)',
    ],
  },
  // Version 1.3.2: inkorgen vid försenad NEWS2.
  {
    version: '1.3.2', datum: '2026-11-13',
    text: 'Inga nya resurstyper eller skrivningar i FHIR.',
    resurser: [], skrivning: [], annat: [
      'Åtgärden för en försenad kontroll enligt NEWS2 i inkorgen är en lista, som för ett larm',
    ],
  },
  // Runda 13: version 1.3.1, rättelserna för kvällar och nätter.
  {
    version: '1.3.1', datum: '2026-11-12',
    text: 'Inga nya resurstyper eller skrivningar i FHIR.',
    resurser: [], skrivning: [], annat: [
      'Kassans demoläge i användartestet svarar 201 med en ny ankomst i stället för 400 när ingen tid har öppnat för incheckning',
    ],
  },
  // Runda 13: version 1.3. Varje del lägger sina rader i annat i ett eget block.
  {
    version: '1.3.0', datum: '2026-11-12',
    text: 'Inga nya resurstyper eller skrivningar i FHIR.',
    resurser: [], skrivning: [], annat: [
      // Runda 13, r1: testinbjudan, guidade uppdrag och synpunkter.
      'Synpunkter från testare, guidade uppdrag med jämförelse och testledarens läsning med läskod i det interna API:t (docs/api-avvikelser.md)',
      // Runda 13, r4: väntelistan, vätskebalansen, vaccinationerna och systemförvaltningen (docs/api-avvikelser.md).
      'Väntan som inte räknas i vårdgarantin och avslut från väntelistan med orsak, och vårdgarantin för sig i väntelistans poster, i det interna API:t (docs/api-avvikelser.md)',
      'Tid och period för en registrering i vätskebalansen i det interna API:t',
      'Kontrollen före en vaccination och dosens utgångsdatum och injektionsställe i det interna API:t',
      'Allt som väntar på godkännande i systemförvaltningen i det interna API:t',
      // Runda 13, r2: kapacitet, tak och fynden från säkerhetsgranskningen av runda 12.
      'Svaret 503 med koden demo_full och tiden tills det är lönt att försöka igen när demon är full, och kapaciteten i /api/drift',
      'Taken 429 för tunga anrop per sandlåda och adress, och 507 när sandlådans databas är full',
      'Återställning av en säkerhetskopia med fyra ögon: ett förslag och ett godkännande av en andra systemförvaltare',
      'Att lägga till eller ta bort en faktor för flerfaktor kräver en färsk bekräftelse med en befintlig faktor',
    ],
  },
  // Runda 12: version 1.2. Varje del lägger sina rader i annat i ett eget block.
  {
    version: '1.2.0', datum: '2026-11-11',
    text: 'Inga nya resurstyper eller skrivningar i FHIR.',
    resurser: [], skrivning: [], annat: [
      // Runda 12, r1: journalens struktur och läkemedelsmallarna utan programmerare.
      'Mallar, sökord och mätvärdestyper som systemförvaltningen skapar i /api/journalstruktur, med anteckningstypens och sökordens koder i Composition och mätvärdestypens kod och UCUM i Observation',
      'Läkemedelsmallar som läkaren bygger och ändrar i det interna API:t, som beskrivs i docs/api-avvikelser.md',
      // Runda 12, r2: uppgraderingar med återgång, säkerhetskopior och schemaversionen i /api/health.
      'Uppgraderingar med återgång och godkännande av två systemförvaltare i det interna API:t (docs/api-avvikelser.md)',
      'Säkerhetskopior och återställning till en tidpunkt i det interna API:t (docs/api-avvikelser.md)',
      'Programmets schemaversion i hälsokontrollen',
      'Återföringen av all data i exportpaketet tar med vårdgivarens tabeller som NDJSON och databasens schema, och paketet har XML-schemana för METS',
    ],
  },
  // Runda 11: version 1.1. Inga nya resurstyper eller skrivningar i FHIR.
  {
    version: '1.1.0', datum: '2026-11-11',
    text: 'Modulregistret i GET /api/moduler: varje modul med status, var den nås och hur många av dess krav som är uppfyllda, räknat ur koden och kravregistret. Inga nya resurstyper eller skrivningar i FHIR. Operationsplaneringen och anestesin har nya rutter i det interna API:t, som beskrivs i docs/api-avvikelser.md. Graviditet, förlossning och BB i REST-API:t: ultraljudsjournalen, inskrivningssamtalet, CTG, smärtlindringen, födelseanmälan, BB-journalen, efterkontrollen och rapporteringen till Graviditetsregistret (simulerat). Inga nya FHIR-resurser. Regimbiblioteket med versioner och godkännande, beredningsenhetens arbetslista, lager, spårbarhet och kapacitet, infusionens händelser, premedicineringen, patientens rapporter om cytostatika i Min journal, transfusionsreaktioner och blodcentralens vy. Bilder, filmer och ljud i journalen som Media, studierna i det simulerade multimediaarkivet som ImagingStudy, och DICOMweb (QIDO-RS och WADO-RS) mot arkivet. Undersökningar i radiologi, klinisk fysiologi och klinisk neurofysiologi med åtgärden i KVÅ, prioritet och vårdförlopp i ServiceRequest. Producentsystemen skickar rättade svar, koder och underlag, och patientnära instrument skickar sina svar med provets etikett. Den simulerade producenten för tjänstekontrakt svarar också på GetObservations och GetActivities, med samma behörighet och loggning som FHIR.',
    resurser: ['Media', 'ImagingStudy'], skrivning: [], annat: ['Modulregistret i GET /api/moduler', 'Graviditet, förlossning och BB i REST-API:t (docs/api-avvikelser.md)', 'Tabeller för graviditeter och förlossningar i datauttaget för uppföljning', 'Regimbiblioteket och vårdenhetens vy för cytostatika', 'Beredningsenheten för cytostatika', 'Infusionens start, paus, reaktion, extravasering och slut', 'Transfusionsreaktioner och blodcentralens vy', 'DICOMweb mot det simulerade multimediaarkivet med QIDO-RS och WADO-RS', 'DiagnosticReport med status corrected eller amended för ett rättat svar', 'DiagnosticReport.presentedForm för underlag i svaret', 'Koder i KVÅ och Snomed CT i DiagnosticReport.code och conclusionCode', 'DiagnosticReport.specimen med provets etikett från ett patientnära instrument', 'DiagnosticReport.imagingStudy med studiens DICOM-uid', 'GetObservations och GetActivities i den simulerade producenten för tjänstekontrakt'],
  },
  // Runda 10, r1: systemkonton, prenumerationer på en population, överkänslighet och patienter via API:t och
  // Patient/$everything för personalen (Sussa 2.5.1.1 och 2.5.1.2).
  {
    version: '1.0.0', datum: '2026-11-08',
    text: 'Systemkonton för tillämpningar utan inloggad person med SMART Backend Services och pseudonymer som förval, prenumerationer på alla poster av en typ på kontots vårdenheter, registrering av överkänslighet och nya patienter, makulering av doser och provbeställningar via API:t och Patient/$everything för personalen.',
    // Runda 10, r3: formulären och svaren i dem.
    resurser: ['Questionnaire', 'QuestionnaireResponse'], skrivning: ['AllergyIntolerance:create', 'Patient:create', 'MedicationAdministration:delete', 'ServiceRequest:delete'],
    annat: ['SMART Backend Services med client_credentials och private_key_jwt för systemkonton', 'Prenumerationer på en population för systemkonton', 'Patient/[id]/$everything för personalen',
      'Makulering med DELETE eller $makulera och en orsak', 'Pseudonymer för systemkonton utan omfånget för identitet'],
  },
  {
    version: '0.9.0', datum: '2026-11-08',
    text: 'Diagnoser, bokning av en remiss och inskrivning kan göras via API:t, och CapabilityStatement anger programmets version. Ändringsloggen finns på sidan Öppet API och i API:t.',
    resurser: [], skrivning: ['Condition:create', 'Appointment:create', 'Encounter:create'],
    annat: ['Versionen i CapabilityStatement följer programmets version', 'Ändringsloggen i API:t'],
  },
  {
    version: '0.8.0', datum: '2026-11-08',
    text: 'Provtagningens rör och laboratoriernas svar.',
    resurser: ['DiagnosticReport', 'Specimen'], skrivning: [], annat: [],
  },
  {
    version: '0.7.0', datum: '2026-11-08',
    text: 'Vaccinationer i barnhälsovården och posterna i faktureringsunderlaget.',
    resurser: ['Immunization', 'ChargeItem'], skrivning: [], annat: [],
  },
  {
    version: '0.6.0', datum: '2026-11-03',
    text: 'Skrivning via FHIR, prenumerationer, SMART on FHIR, tidboken, läkemedelsprocessen, vårdplaner och åtgärder med KVÅ.',
    resurser: ['EpisodeOfCare', 'MedicationAdministration', 'List', 'CarePlan', 'Procedure', 'Schedule', 'Slot', 'Appointment', 'Subscription'],
    skrivning: ['Observation:create', 'Composition:create', 'Composition:update', 'MedicationRequest:create', 'MedicationRequest:update', 'ServiceRequest:create', 'Appointment:patch', 'Encounter:patch', 'Subscription:create', 'Subscription:delete'],
    annat: ['SMART on FHIR med EHR launch och standalone launch', 'Prenumerationer med rest-hook och bara id i meddelandet'],
  },
  {
    version: '0.1.0', datum: '2026-10-31',
    text: 'Första versionen av det öppna API:t: läsning av journalen i FHIR R4 med samma behörighet och loggning som gränssnittet, och definitionerna av tilläggen och kodsystemen.',
    resurser: ['Patient', 'Encounter', 'Condition', 'Observation', 'MedicationRequest', 'AllergyIntolerance', 'Flag', 'ServiceRequest', 'Composition', 'Organization', 'Practitioner', 'AuditEvent', 'StructureDefinition', 'CodeSystem', 'ValueSet'],
    skrivning: [], annat: ['Patient/[id]/$everything', 'Min journal når sina egna resurser med patientens session'],
  },
];

// Runda 13, r3: flerfaktor som krav, begäran om undantag av en anteckning och vårdgarantierna (docs/api-avvikelser.md).
ANDRINGAR.find(a => a.version === '1.3.0').annat.push(
  'När vårdgivaren kräver flerfaktor slutför POST /api/flerfaktor/totp och /api/flerfaktor/passkey inloggningen och ger sessionen',
  'Begäran om undantag av en anteckning från anteckningens meny, och systemförvaltarens avslag av en begäran',
  'Behandlingsgarantin i anmälan till operation och på operationsväntelistan',
  'Uppgift om hur identiteten kontrollerades när en dos ges utan skannat armband',
  'Verksamhetschefens godkännande av gallring och radering för sin vårdenhet',
  'Uppgift om att det finns spärrade uppgifter hos en annan vårdgivare vid sammanhållen journalföring',
);

// Runda 12, r3: flerfaktorsinloggning i det interna API:t (docs/api-avvikelser.md).
ANDRINGAR.find(a => a.version === '1.2.0').annat.push('Flerfaktorsinloggning med passkeys (WebAuthn) och engångskoder (RFC 6238) i det interna API:t');

// Det CapabilityStatement anger: alla resurstyper och alla skrivande interaktioner.
const SKRIVANDE = new Set(['create', 'update', 'patch', 'delete']);
export function franCapability(cs) {
  const resurser = cs.rest[0].resource;
  return {
    resurser: resurser.map(r => r.type),
    skrivning: resurser.flatMap(r => r.interaction.filter(i => SKRIVANDE.has(i.code)).map(i => `${r.type}:${i.code}`)),
  };
}

export function andringslogg() {
  return { version: VERSION, andringar: ANDRINGAR };
}
