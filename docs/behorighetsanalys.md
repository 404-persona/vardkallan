# Behovs- och riskanalys per roll

Det här är Vårdkällans egen behovs- och riskanalys för tilldelningen av behörigheter, enligt patientdatalagen 4 kap. 2 § och HSLF-FS 2016:40 4 kap. 2 och 3 §§. För varje roll beskrivs vilket behov av uppgifter rollen har, vilka risker åtkomsten medför och hur risken begränsas, och vilka handlingar rollen har i behörighetsmotorn (`app/src/atkomst.js`). En vårdgivare som använder Vårdkällan gör sin egen analys utifrån sin verksamhet. Den här analysen är utgångspunkten och visar hur rollerna i systemet är tänkta.

Analysen och koden hänger ihop. Ett test i bygget (`app/test/behorighetsanalys.test.js`) stoppar bygget om en roll i koden saknar analys, om listan med handlingar här skiljer sig från koden eller om en handling som analysen säger att rollen inte ska ha finns i koden.

För alla roller gäller: all behörighet prövas på servern i varje anrop, varje åtkomst till patientuppgifter loggas i en logg som inte går att ändra, och handlingar som rollen saknar nekas och loggas som nekade.

## Läkare (lakare)

Behov: Utreder, diagnostiserar och behandlar. Behöver läsa och skriva hela journalen för patienter med vårdrelation, ordinera läkemedel och cytostatika, beställa prover och undersökningar, bedöma och besvara remisser, kontrasignera och använda nödåtkomst när patienten inte kan samtycka.

Risker: Bredast åtkomst av alla roller, och därmed störst risk för otillåten läsning (nyfikenhet, fel patient) och för felaktiga ordinationer.

Så begränsas risken: Åtkomst bara med vårdrelation på den egna vårdenheten. Andra vårdenheter kräver aktivt val, spärrar kräver patientens samtycke, och nödåtkomst häver aldrig en spärr, loggas och flaggas i logguppföljningen. Ordinationer kontrolleras mot varningsreglerna och kräver motiverad kvittens. Den som signerat kan inte kontrasignera själv.

Får inte: `las_logg`, `konfigurera`, `datauttag`, `faktureringsunderlag`, `sla_samman`, `gallra`.

Handlingar i koden (95): `las_oversikt`, `las_journal`, `las_omvardnad`, `skriv_journal`, `skriv_omvardnad`, `las_lakemedel`, `ordinera`, `las_matvarden`, `registrera_matvarde`, `las_diagnoser`, `las_remiss`, `remittera`, `mottag_remiss`, `bedom_remiss`, `svara_remiss`, `kvittera_svar`, `las_admin`, `sok`, `vantrum`, `nodatkomst`, `andra_enheter`, `samtycke_sparr`, `visa_identitet`, `registrera_patient`, `andra_identitet`, `registrera_vardkontakt`, `vardtillfalle`, `halsoarende`, `skriv_ut`, `utlamna`, `begara_kontrasignering`, `kontrasignera`, `ge_lakemedel`, `delegera`, `faststalla_direktiv`, `faststalla_mall`, `utvardera_lakemedel`, `lakemedelsgenomgang`, `las_vardplan`, `vardplan`, `vardplan_atgard`, `las_tvangsvard`, `tvangsvard`, `samordna`, `godkanna_mall`, `bevaka`, `bevaka_enhet`, `las_tidbok`, `statistik`, `las_kostnader`, `fardigbehandlad`, `hjalpmedel`, `registrera_diagnos`, `kvalitetsregister`, `utbildning`, `las_planering`, `utfora_uppgift`, `planera`, `fordela_remiss`, `remisskonferens`, `las_prover`, `bestalla_prov`, `ta_prov`, `vidimera_provsvar`, `ordinera_kontroll`, `koppla_utrustning`, `godkanna_matvarde`, `anestesibedomning`, `las_operation`, `operation_anmala`, `operation_planera`, `operation_registrera`, `las_graviditet`, `graviditet`, `las_cytostatika`, `ordinera_cytostatika`, `ge_cytostatika`, `forskriva_forbrukning`, `bestalla_lakemedel`, `rapportera_graviditetsregistret`, `undersokning_utfora`, `patientgrupp`, `infart`, `restjournal`, `signeringslista`, `registrera_overkanslighet`, `donation`, `meddelande_invanare`, `las_intyg`, `skriv_intyg`, `sjukfall_mina`, `handleda`, `vaccinera`, `boka_bhv`, `rapportera_bhvq`.

## Sjuksköterska (sjukskoterska)

Behov: Planerar och ger omvårdnad, ger läkemedel, tar prover och registrerar mätvärden. Behöver läsa journalen och läkemedelslistan och skriva omvårdnadsanteckningar. Utfärdar intyg om graviditet på mödrahälsovården och intyg om tillfällig föräldrapenning, som Försäkringskassan tar emot från sjuksköterskor.

Risker: Läsning utan behov, och läkemedel som ges utan giltig ordination.

Så begränsas risken: Kan inte ordinera läkemedel annat än enligt generella direktiv och muntliga ordinationer som läkaren signerar. Samma regler för vårdrelation, aktivt val, spärr och nödåtkomst som för läkaren. Administreringen kontrollerar ordinationen.

Får inte: `ordinera`, `skriv_journal`, `kontrasignera`, `ordinera_cytostatika`, `las_logg`, `konfigurera`, `skriv_intyg`.

Handlingar i koden (74): `las_oversikt`, `las_journal`, `las_omvardnad`, `skriv_omvardnad`, `las_lakemedel`, `ge_lakemedel`, `las_matvarden`, `registrera_matvarde`, `las_diagnoser`, `las_remiss`, `las_admin`, `sok`, `vantrum`, `nodatkomst`, `andra_enheter`, `samtycke_sparr`, `visa_identitet`, `registrera_patient`, `andra_identitet`, `registrera_vardkontakt`, `vardtillfalle`, `halsoarende`, `skriv_ut`, `utlamna`, `begara_kontrasignering`, `delegera`, `ordinera_direktiv`, `registrera_muntlig_ordination`, `utvardera_lakemedel`, `las_vardplan`, `vardplan`, `vardplan_atgard`, `las_tvangsvard`, `samordna`, `bevaka`, `bevaka_enhet`, `las_tidbok`, `statistik`, `las_kostnader`, `hjalpmedel`, `kvalitetsregister`, `utbildning`, `las_planering`, `utfora_uppgift`, `planera`, `las_prover`, `bestalla_prov_uppdrag`, `ta_prov`, `koppla_utrustning`, `godkanna_matvarde`, `las_operation`, `operation_planera`, `operation_registrera`, `las_graviditet`, `graviditet`, `las_cytostatika`, `ge_cytostatika`, `forskriva_forbrukning`, `bestalla_lakemedel`, `rapportera_graviditetsregistret`, `undersokning_utfora`, `patientgrupp`, `infart`, `restjournal`, `registrera_overkanslighet`, `donation`, `meddelande_invanare`, `las_intyg`, `intyg_graviditet`, `intyg_tfp`, `handleda`, `vaccinera`, `boka_bhv`, `rapportera_bhvq`.

## Undersköterska (underskoterska)

Behov: Omvårdnad, mätvärden och provtagning. Behöver se läkemedel, mätvärden, överkänslighet och omvårdnadsanteckningar.

Risker: Tillgång till känsliga läkaranteckningar, diagnoser och kuratorns och psykologens anteckningar, som inte behövs för uppgiften.

Så begränsas risken: Läser inga läkaranteckningar, inga diagnoser och sedan runda 16 inte kuratorns och psykologens anteckningar, som läses med las_journal. Ger läkemedel bara med en giltig delegering i dag. Ingen nödåtkomst.

Får inte: `las_journal`, `las_diagnoser`, `ordinera`, `nodatkomst`, `skriv_journal`.

Handlingar i koden (25): `las_oversikt`, `las_omvardnad`, `las_lakemedel`, `las_matvarden`, `registrera_matvarde`, `las_admin`, `sok`, `vantrum`, `andra_enheter`, `samtycke_sparr`, `visa_identitet`, `skriv_ut`, `ge_lakemedel`, `las_vardplan`, `vardplan_atgard`, `las_tvangsvard`, `utbildning`, `las_planering`, `utfora_uppgift`, `las_prover`, `bestalla_prov_uppdrag`, `ta_prov`, `koppla_utrustning`, `las_operation`, `skriv_observation`.

## Vårdadministratör (vardadministrator)

Behov: Tar emot remisser, bokar, kallar, checkar in, registrerar vårdkontakter och patienter och hanterar kassan. Flyttar uppgifter som har registrerats på fel patient till rätt patient, och godkänner en annan vårdadministratörs förslag om flytt. Skapar och fyller i utkast till intyg åt läkaren och markerar dem klara för signering, som i Webcert.

Risker: Insyn i journaltext eller läkemedel utan vårdbehov.

Så begränsas risken: Ser kontaktuppgifter, vårdkontakter och remissernas status men ingen journaltext och inga läkemedel. Åtkomsten grundas som administrativ uppgift. Signerar aldrig intyg, och förifyllnaden av ett utkast tar inget ur journalen som rollen inte får läsa. För en patient med skyddade personuppgifter når rollen inte intygen.

Får inte: `las_journal`, `las_omvardnad`, `las_lakemedel`, `las_diagnoser`, `ordinera`, `skriv_intyg`.

Handlingar i koden (40): `las_admin`, `las_remiss_status`, `mottag_remiss`, `sok`, `vantrum`, `andra_enheter`, `visa_identitet`, `registrera_patient`, `andra_identitet`, `sla_samman`, `registrera_vardkontakt`, `skriv_ut`, `utlamna`, `boka`, `kalla`, `checka_in`, `vantelista`, `bevaka`, `bevaka_enhet`, `las_tidbok`, `statistik`, `las_kostnader`, `lma`, `registrera_sparr`, `utbildning`, `remittera_pa_uppdrag`, `fordela_remiss`, `remisskonferens`, `registrera_beslut_pa_uppdrag`, `registrera_extern_remiss`, `undersokning_utfora`, `restjournal`, `godkanna_flytt`, `las_flytt`, `meddelande_invanare`, `fullmakt`, `kassa`, `kapacitet`, `las_intyg`, `utkast_intyg`.

## Logggranskare (logggranskare)

Behov: Följer upp åtkomstloggen och gör stickprovskontroller enligt HSLF-FS 2016:40 4 kap. 9 och 9 b §§.

Risker: Loggen visar vilka patienter som har vårdats var, och granskaren skulle kunna läsa journalen.

Så begränsas risken: Läser loggen men aldrig journalen. Loggen kan inte ändras, och granskningarna sparas.

Får inte: `las_journal`, `las_oversikt`, `las_lakemedel`.

Handlingar i koden (3): `las_logg`, `sok`, `utbildning`.

## Arkivarie (arkivarie)

Behov: Registrerar beslut, skapar exportpaket till e-arkiv och verkställer gallring och förstöring efter beslut.

Risker: Att journaler utplånas utan beslut.

Så begränsas risken: Läser inte journalen. Gallring tar bara journaler äldre än tio år efter den sista uppgiften, och allt loggas.

Får inte: `las_journal`, `las_oversikt`, `ordinera`.

Handlingar i koden (5): `registrera_arkivbeslut`, `arkivera`, `gallra`, `utbildning`, `forskning_godkann`.

## Analytiker (uppföljning) (uppfoljning)

Behov: Hämtar datauttag och statistik för verksamhetsuppföljning och rapporterar till myndigheter och register.

Risker: Att uppgifter går att knyta till enskilda patienter.

Så begränsas risken: Datauttaget saknar namn och personnummer och använder pseudonymer. Små tal spärras. Läser inte journalen.

Får inte: `las_journal`, `las_oversikt`, `sok`.

Handlingar i koden (6): `datauttag`, `statistik_region`, `myndighetsrapport`, `utbildning`, `anvandartest_las`, `forskning_bestall`.

## Farmaceut (farmaceut)

Behov: Gör farmaceutens bedömning i läkemedelsgenomgången och bereder cytostatika.

Risker: Tillgång till journaltext som inte behövs för läkemedelsbedömningen.

Så begränsas risken: Läser läkemedelslistan, mätvärden och diagnoser men inga journalanteckningar. Ordinerar inte.

Får inte: `las_journal`, `ordinera`, `skriv_journal`.

Handlingar i koden (12): `las_oversikt`, `las_lakemedel`, `las_matvarden`, `las_diagnoser`, `las_admin`, `sok`, `andra_enheter`, `samtycke_sparr`, `visa_identitet`, `lakemedelsgenomgang`, `utbildning`, `bereda_cytostatika`.

## Kommunens personal (simulerad) (kommun)

Behov: Samordnad planering inför utskrivning.

Risker: Att en annan huvudman läser regionens journal.

Så begränsas risken: Ser bara det regionen har skickat i samordnad planering och läser aldrig journalen.

Får inte: `las_journal`, `las_oversikt`, `sok`.

Handlingar i koden (2): `samverkan`, `utbildning`.

## Verksamhetschef (verksamhetschef)

Behov: Utser uppdrag i läkemedelshanteringen, fastställer direktiv, utfärdar utbildarintyg och följer vårdenhetens intyg och signeringslistan. Godkänner som andra person att uppgifter som har registrerats på fel patient flyttas till en patient utan vårdrelation till vårdenheten.

Risker: Att chefsrollen används för att läsa enskilda patienters journaler.

Så begränsas risken: Läser inte journalen. Uppgifterna gäller den egna vårdenheten. Ett förslag om flytt visar numret som skrevs men ingenting om patienten som numret leder till, och den som föreslog flytten kan aldrig godkänna den själv.

Får inte: `las_journal`, `las_oversikt`, `ordinera`.

Handlingar i koden (10): `lakemedelsansvar`, `utbildning`, `intyg_enhet`, `forskning_godkann`, `signeringslista`, `godkanna_gallring`, `godkanna_flytt`, `las_flytt`, `vyforval`, `sjukfall_enhet`.

## Ekonom (ekonom)

Behov: Hämtar faktureringsunderlag och ändrar prislistor.

Risker: Att ekonomiska underlag röjer vårdinnehåll eller skyddade personuppgifter.

Så begränsas risken: Läser inte journalen. Underlaget innehåller aldrig namn eller adress för en patient med skyddade personuppgifter.

Får inte: `las_journal`, `las_oversikt`, `sok`.

Handlingar i koden (3): `faktureringsunderlag`, `prislista`, `utbildning`.

## Systemförvaltare (systemforvaltare)

Behov: Ändrar regler och parametrar, förbereder omorganisationer, beslutar om undantag och förvaltar det öppna API:t. Registrerar incidenter, följer upp servicenivåerna och tar ut incidentrapporten till beställaren.

Risker: Att ändringar i konfigurationen ger någon åtkomst eller ändrar regler utan kontroll, och att patientuppgifter hamnar i en incident som lämnar systemet.

Så begränsas risken: Läser inte journalen. Ändringar kräver fyra ögon, det vill säga en andra systemförvaltare i sin egen inloggning, och loggas. En incident tar inte emot en text som ser ut att innehålla ett personnummer, och incidentrapporten har inga patientuppgifter och loggas i säkerhetsloggen.

Får inte: `las_journal`, `las_oversikt`, `ordinera`.

Handlingar i koden (8): `konfigurera`, `omorganisera`, `undanta`, `lagring`, `forvalta_api`, `servicenivaer`, `utbildning`, `vyforval`.

## Fysioterapeut (fysioterapeut)

Behov: Läser journalen, skriver anteckningar, registrerar mätvärden och skickar, tar emot och besvarar remisser.

Risker: Läsning utan behov och läkemedel som ordineras utanför yrkets ansvar.

Så begränsas risken: Ordinerar och ger inga läkemedel. Samma regler för vårdrelation, aktivt val och spärr som för övrig vårdpersonal.

Får inte: `ordinera`, `ge_lakemedel`, `nodatkomst`.

Handlingar i koden (33): `las_oversikt`, `las_journal`, `las_omvardnad`, `skriv_omvardnad`, `las_lakemedel`, `las_matvarden`, `registrera_matvarde`, `las_diagnoser`, `las_remiss`, `remittera`, `mottag_remiss`, `bedom_remiss`, `svara_remiss`, `kvittera_svar`, `las_admin`, `sok`, `andra_enheter`, `samtycke_sparr`, `visa_identitet`, `skriv_ut`, `las_vardplan`, `vardplan_atgard`, `bevaka`, `bevaka_enhet`, `las_tidbok`, `statistik`, `utbildning`, `las_planering`, `utfora_uppgift`, `planera`, `fordela_remiss`, `remisskonferens`, `meddelande_invanare`.

## Systemkonto för en tillämpning (systemkonto)

Behov: En tillämpning utan inloggad person hämtar avgränsade uppgifter genom det öppna API:t (SMART Backend Services). En organisation som är ansluten via tjänstekontrakt i RIVTA (NPÖ, Journalen och sammanhållen journalföring) läser journalanteckningar och åtgärder för de vårdenheter den är ansluten för.

Risker: Att en tillämpning hämtar mer än den behöver, utan en person som ansvarar i stunden. Att journalanteckningar lämnas ut till en organisation som inte ska ha dem.

Så begränsas risken: Prövas mot kontots vårdenheter och informationsmängder, aldrig med vårdrelation, med pseudonymer som förval. Kan bara läsa. Journalanteckningar och åtgärder (las_journal) är informationsmängder som bara ett konto för en anslutning via tjänstekontrakt kan få, aldrig ett konto som registreras för det öppna API:t, och aldrig för patienter med skyddade personuppgifter eller spärrade uppgifter.

Får inte: `skriv_journal`, `ordinera`, `nodatkomst`.

Handlingar i koden (6): `las_oversikt`, `las_diagnoser`, `las_matvarden`, `las_lakemedel`, `las_admin`, `las_journal`.

## Arbetsterapeut (arbetsterapeut)

Behov: Bedömer vad patienten klarar i vardagen, anpassar och förskriver hjälpmedel och planerar inför utskrivningen. Behöver läsa journalen, skriva arbetsterapianteckningar, registrera mätvärden och skicka, ta emot och besvara remisser.

Risker: Läsning utan behov och läkemedel som ordineras eller ges utanför yrkets ansvar.

Så begränsas risken: Ordinerar och ger inga läkemedel och har ingen nödåtkomst. Skriver bara med yrkets mallar i omvårdnadens kategori. Samma regler för vårdrelation, aktivt val och spärr som för övrig vårdpersonal.

Får inte: `ordinera`, `ge_lakemedel`, `nodatkomst`, `skriv_journal`.

Handlingar i koden (34): `las_oversikt`, `las_journal`, `las_omvardnad`, `skriv_omvardnad`, `las_lakemedel`, `las_matvarden`, `registrera_matvarde`, `las_diagnoser`, `las_remiss`, `remittera`, `mottag_remiss`, `bedom_remiss`, `svara_remiss`, `kvittera_svar`, `las_admin`, `sok`, `andra_enheter`, `samtycke_sparr`, `visa_identitet`, `skriv_ut`, `las_vardplan`, `vardplan_atgard`, `bevaka`, `bevaka_enhet`, `las_tidbok`, `statistik`, `utbildning`, `las_planering`, `utfora_uppgift`, `planera`, `fordela_remiss`, `remisskonferens`, `meddelande_invanare`, `hjalpmedel`.

## Dietist (dietist)

Behov: Utreder och behandlar nutritionen. Behöver läsa journalen, läkemedelslistan och mätvärdena som vikt och provsvar, skriva dietistanteckningar och ta emot och besvara remisser.

Risker: Läsning utan behov och läkemedel som ordineras eller ges utanför yrkets ansvar.

Så begränsas risken: Ordinerar och ger inga läkemedel och har ingen nödåtkomst. Skriver bara med yrkets mallar i omvårdnadens kategori. Samma regler för vårdrelation, aktivt val och spärr som för övrig vårdpersonal.

Får inte: `ordinera`, `ge_lakemedel`, `nodatkomst`, `skriv_journal`.

Handlingar i koden (33): `las_oversikt`, `las_journal`, `las_omvardnad`, `skriv_omvardnad`, `las_lakemedel`, `las_matvarden`, `registrera_matvarde`, `las_diagnoser`, `las_remiss`, `remittera`, `mottag_remiss`, `bedom_remiss`, `svara_remiss`, `kvittera_svar`, `las_admin`, `sok`, `andra_enheter`, `samtycke_sparr`, `visa_identitet`, `skriv_ut`, `las_vardplan`, `vardplan_atgard`, `bevaka`, `bevaka_enhet`, `las_tidbok`, `statistik`, `utbildning`, `las_planering`, `utfora_uppgift`, `planera`, `fordela_remiss`, `remisskonferens`, `meddelande_invanare`.

## Logoped (logoped)

Behov: Utreder och behandlar kommunikation, språk, tal, röst och sväljning och förskriver kommunikationshjälpmedel. Behöver läsa journalen, skriva logopedanteckningar och ta emot och besvara remisser.

Risker: Läsning utan behov och läkemedel som ordineras eller ges utanför yrkets ansvar.

Så begränsas risken: Ordinerar och ger inga läkemedel och har ingen nödåtkomst. Skriver bara med yrkets mallar i omvårdnadens kategori. Samma regler för vårdrelation, aktivt val och spärr som för övrig vårdpersonal.

Får inte: `ordinera`, `ge_lakemedel`, `nodatkomst`, `skriv_journal`.

Handlingar i koden (34): `las_oversikt`, `las_journal`, `las_omvardnad`, `skriv_omvardnad`, `las_lakemedel`, `las_matvarden`, `registrera_matvarde`, `las_diagnoser`, `las_remiss`, `remittera`, `mottag_remiss`, `bedom_remiss`, `svara_remiss`, `kvittera_svar`, `las_admin`, `sok`, `andra_enheter`, `samtycke_sparr`, `visa_identitet`, `skriv_ut`, `las_vardplan`, `vardplan_atgard`, `bevaka`, `bevaka_enhet`, `las_tidbok`, `statistik`, `utbildning`, `las_planering`, `utfora_uppgift`, `planera`, `fordela_remiss`, `remisskonferens`, `meddelande_invanare`, `hjalpmedel`.

## Psykolog (psykolog)

Behov: Utreder och behandlar, också med psykoterapi (psykoterapeuten är en titel inom rollen). Behöver läsa journalen, läkemedelslistan och mätvärdena, registrera skattningar, skriva psykologanteckningar, se om patienten vårdas med tvång och ta emot och besvara remisser.

Risker: Psykologens anteckningar är känsliga, och läsning utan behov är en risk för integriteten.

Så begränsas risken: Ordinerar och ger inga läkemedel, beslutar inte om tvångsvård och har ingen nödåtkomst. Anteckningarna har samma inre sekretess, spärr och loggning som andra anteckningar.

Får inte: `ordinera`, `ge_lakemedel`, `tvangsvard`, `nodatkomst`.

Handlingar i koden (34): `las_oversikt`, `las_journal`, `las_omvardnad`, `skriv_omvardnad`, `las_lakemedel`, `las_matvarden`, `registrera_matvarde`, `las_diagnoser`, `las_remiss`, `remittera`, `mottag_remiss`, `bedom_remiss`, `svara_remiss`, `kvittera_svar`, `las_admin`, `sok`, `andra_enheter`, `samtycke_sparr`, `visa_identitet`, `skriv_ut`, `las_vardplan`, `vardplan_atgard`, `bevaka`, `bevaka_enhet`, `las_tidbok`, `statistik`, `utbildning`, `las_planering`, `utfora_uppgift`, `planera`, `fordela_remiss`, `remisskonferens`, `meddelande_invanare`, `las_tvangsvard`.

## Hälso- och sjukvårdskurator (kurator)

Behov: Arbetar med patientens sociala förhållanden, krisstöd och samtal, och upprättar samordnade individuella planer (SIP). Behöver läsa journalen och diagnoserna, skriva kuratorsanteckningar, se om patienten vårdas med tvång och ta emot och besvara remisser.

Risker: Kuratorns anteckningar är ofta känsliga, och läsning utan behov är en risk för integriteten. Läkemedel och mätvärden behövs inte i arbetet.

Så begränsas risken: Läser inte läkemedelslistan och mätvärdena, ordinerar och ger inga läkemedel och har ingen nödåtkomst. Anteckningarna har samma inre sekretess, spärr och loggning som andra anteckningar, och andra vårdenheter ser dem bara efter ett aktivt val.

Får inte: `las_lakemedel`, `las_matvarden`, `ordinera`, `ge_lakemedel`, `nodatkomst`.

Handlingar i koden (32): `las_oversikt`, `las_journal`, `las_omvardnad`, `skriv_omvardnad`, `las_diagnoser`, `las_remiss`, `remittera`, `mottag_remiss`, `bedom_remiss`, `svara_remiss`, `kvittera_svar`, `las_admin`, `sok`, `andra_enheter`, `samtycke_sparr`, `visa_identitet`, `skriv_ut`, `las_vardplan`, `vardplan_atgard`, `bevaka`, `bevaka_enhet`, `las_tidbok`, `statistik`, `utbildning`, `las_planering`, `utfora_uppgift`, `planera`, `fordela_remiss`, `remisskonferens`, `meddelande_invanare`, `las_tvangsvard`, `samordna`.

## Barnmorska (barnmorska)

Behov: För graviditetsjournalen och förlossningsjournalen, ger läkemedel och gör det sjuksköterskan gör på förlossningen och BB, rapporterar till Graviditetsregistret, förskriver preventivmedel och handleder barnmorskestudenter.

Risker: Läkemedel som förskrivs utanför förskrivningsrätten, och läsning utan behov.

Så begränsas risken: Kräver vid inloggning genom en extern tjänst både barnmorskans och sjuksköterskans legitimation, eftersom rollen har sjuksköterskans handlingar. Har inte handlingen ordinera. Förskrivningen gäller bara de preventivmedel som föreskrifterna räknar upp, systemet visar bara dem, och en allvarlig varning stoppar förskrivningen och hänvisar till läkaren. Gör inte barnhälsovårdens uppgifter.

Får inte: `ordinera`, `vaccinera`, `skriv_journal`, `skriv_intyg`.

Handlingar i koden (71): `las_oversikt`, `las_journal`, `las_omvardnad`, `skriv_omvardnad`, `las_lakemedel`, `ge_lakemedel`, `las_matvarden`, `registrera_matvarde`, `las_diagnoser`, `las_remiss`, `las_admin`, `sok`, `vantrum`, `nodatkomst`, `andra_enheter`, `samtycke_sparr`, `visa_identitet`, `registrera_patient`, `andra_identitet`, `registrera_vardkontakt`, `vardtillfalle`, `halsoarende`, `skriv_ut`, `utlamna`, `begara_kontrasignering`, `delegera`, `ordinera_direktiv`, `registrera_muntlig_ordination`, `utvardera_lakemedel`, `las_vardplan`, `vardplan`, `vardplan_atgard`, `las_tvangsvard`, `samordna`, `bevaka`, `bevaka_enhet`, `las_tidbok`, `statistik`, `las_kostnader`, `hjalpmedel`, `kvalitetsregister`, `utbildning`, `las_planering`, `utfora_uppgift`, `planera`, `las_prover`, `bestalla_prov_uppdrag`, `ta_prov`, `koppla_utrustning`, `godkanna_matvarde`, `las_operation`, `operation_planera`, `operation_registrera`, `las_graviditet`, `graviditet`, `las_cytostatika`, `ge_cytostatika`, `forskriva_forbrukning`, `bestalla_lakemedel`, `rapportera_graviditetsregistret`, `undersokning_utfora`, `patientgrupp`, `infart`, `restjournal`, `registrera_overkanslighet`, `donation`, `meddelande_invanare`, `las_intyg`, `intyg_graviditet`, `forskriva_preventivmedel`, `handleda`.

## Läkarstudent (lakarstudent)

Behov: Lär sig under handledning av en läkare. Behöver läsa journalen för patienterna på handledarens vårdenhet och skriva anteckningar som handledaren kontrasignerar.

Risker: Att studenten fattar beslut eller dokumenterar utan handledning, och att åtkomsten finns kvar efter praktiken.

Så begränsas risken: Åtkomst bara under en pågående handledning hos en läkare på samma vårdenhet, prövad i varje anrop. Ordinerar inte, ger inga läkemedel, signerar inga intyg och har ingen nödåtkomst, inga aktiva val och ingen visning av skyddad identitet. Varje signerad anteckning går till handledaren för kontrasignering.

Får inte: `ordinera`, `ge_lakemedel`, `skriv_intyg`, `nodatkomst`, `skriv_journal`, `andra_enheter`.

Handlingar i koden (14): `las_oversikt`, `las_journal`, `las_omvardnad`, `las_lakemedel`, `las_matvarden`, `las_diagnoser`, `las_remiss`, `las_admin`, `sok`, `las_vardplan`, `las_prover`, `las_planering`, `skriv_handledd`, `utbildning`.

## Sjuksköterskestudent (sjukskoterskestudent)

Behov: Lär sig under handledning av en sjuksköterska eller barnmorska. Behöver läsa journalen och läkemedelslistan för patienterna på handledarens vårdenhet och skriva omvårdnadsanteckningar som handledaren kontrasignerar.

Risker: Att studenten ger läkemedel eller dokumenterar utan handledning, och att åtkomsten finns kvar efter praktiken.

Så begränsas risken: Åtkomst bara under en pågående handledning på samma vårdenhet, prövad i varje anrop. Ger inga läkemedel på egen hand, ordinerar inte och har ingen nödåtkomst. Varje signerad anteckning går till handledaren för kontrasignering.

Får inte: `ordinera`, `ge_lakemedel`, `skriv_omvardnad`, `nodatkomst`, `delegera`.

Handlingar i koden (14): `las_oversikt`, `las_journal`, `las_omvardnad`, `las_lakemedel`, `las_matvarden`, `las_diagnoser`, `las_remiss`, `las_admin`, `sok`, `las_vardplan`, `las_prover`, `las_planering`, `skriv_handledd`, `utbildning`.

## Barnmorskestudent (barnmorskestudent)

Behov: Lär sig under handledning av en barnmorska. Behöver läsa journalen och graviditetsjournalen för patienterna på handledarens vårdenhet och skriva anteckningar som handledaren kontrasignerar.

Risker: Att studenten för graviditets- eller förlossningsjournalen eller ger läkemedel utan handledning, och att åtkomsten finns kvar efter praktiken.

Så begränsas risken: Åtkomst bara under en pågående handledning hos en barnmorska på samma vårdenhet, prövad i varje anrop. Läser graviditetsjournalen men för den inte, ger inga läkemedel på egen hand, förskriver inte och har ingen nödåtkomst. Varje signerad anteckning går till handledaren för kontrasignering.

Får inte: `graviditet`, `ordinera`, `ge_lakemedel`, `forskriva_preventivmedel`, `nodatkomst`.

Handlingar i koden (15): `las_oversikt`, `las_journal`, `las_omvardnad`, `las_lakemedel`, `las_matvarden`, `las_diagnoser`, `las_remiss`, `las_admin`, `sok`, `las_vardplan`, `las_prover`, `las_planering`, `las_graviditet`, `skriv_handledd`, `utbildning`.

## Rehabkoordinator (rehabkoordinator)

Behov: Ger koordineringsinsatser till sjukskrivna patienter enligt lagen (2019:1297) om koordineringsinsatser för sjukskrivna patienter: personligt stöd, intern samordning och samverkan med andra aktörer. Behöver, som rollen i Ineras Rehabstöd, se vårdenhetens pågående sjukfall (namn, personnummer, ålder, kön, diagnos och sysselsättning i det nuvarande intyget, datum, längd, grad och läkare) och sätta REKO-status per sjukfall.

Risker: Översikten visar många patienter på en gång, och diagnoserna är känsliga. Koordineringsinsatser utan patientens samtycke strider mot lagen (3 §).

Så begränsas risken: Tabellen är tom tills koordinatorn söker, och varje patient som visas loggas. Bara sjukintygen på den egna vårdenheten räknas, varje patient prövas med vårdrelation mot vårdenheten, och patienter med skyddade personuppgifter visas inte. Läser inte journalen, läkemedelslistan eller intygen, skriver och signerar inga intyg och har ingen nödåtkomst, inga aktiva val och inget samtycke till spärrade uppgifter. Statusarna Aktiv och Uppföljning kräver att koordinatorn bekräftar patientens samtycke, och historiken ändras aldrig.

Får inte: `las_journal`, `las_lakemedel`, `las_intyg`, `skriv_intyg`, `utkast_intyg`, `nodatkomst`, `andra_enheter`, `samtycke_sparr`, `visa_identitet`, `sok`.

Handlingar i koden (4): `sjukfall_reko`, `reko_lasa`, `reko_satta`, `utbildning`.
