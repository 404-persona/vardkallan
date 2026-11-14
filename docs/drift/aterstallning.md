# Återställning efter haveri

Plan, process och verktyg för att återställa systemet efter ett haveri, med säkerhetskopiering, provåterläsning, reservservern och förslag till återställningstid och högsta dataförlust.

Dokumentet är ett underlag som den som driver Vårdkällan tar över, anpassar och fyller i. Ett dokument gör inte att ett åtagande är uppfyllt: åtagandet kräver en driftansvarig organisation som arbetar efter dokumentet och kan visa det för beställaren. Platshållare står inom hakparentes och börjar med fyll i.

## Krav i Sussa som dokumentet gäller

| Id | Krav | Slag |
| --- | --- | --- |
| 5.3.1.16 | Återställning efter systemhaveri | Skallkrav vid leverans |
| KD1.1.3.1 | Krav på datalagring | Skallkrav vid leverans |
| KD1.1.3.2 | Krav på datalagring | Skallkrav vid leverans |
| KD1.1.3.3 | Krav på datalagring | Skallkrav vid leverans |
| KD1.1.3.6 | Dataförlust | Utvärderingskriterium |

## Syfte

Den som driver systemet ska ha en plan, en process och verktyg för att återställa efter ett systemhaveri (5.3.1.16), tillhandahålla den datalagring som krävs (KD1.1.3.1) och utföra och ansvara för säkerhetskopieringen (KD1.1.3.2). Dokumentet beskriver vad systemet gör själv och vad driften måste lägga till.

## Mål för återställningen

| Mål | Förslag | Grund för förslaget |
| --- | --- | --- |
| Längsta tid till återställd tjänst (RTO) | [fyll i: tid, förslag 2 timmar] | Max åtgärdstid för prioritet 1 i DU2 |
| Högsta dataförlust (RPO) | [fyll i: tid, förslag 15 minuter] | Systemet tar en kopia var femtonde minut när något har ändrats |
| Hur länge kopior sparas | [fyll i: tid, förslag 30 dagar för dygnskopior och 1 år för månadskopior] | Systemet sparar själv de åtta senaste kopiorna, alltså omkring två timmar bakåt när databasen ändras hela tiden |

Det som registreras i läsläget under ett avbrott (doser och mätvärden i skrivkön) finns kvar i webbläsarna och skickas när servern svarar, också efter en återställning.

## Säkerhetskopieringen i systemet

- Servern tar en konsistent ögonblicksbild av databasen var femtonde minut när något har ändrats (`KOPIOR_MINUTER`), och före varje återställning och återgång. En systemförvaltare kan också ta en kopia när som helst.
- Kopian skrivs på två platser (`KOPIOR_KATALOG` och `KOPIOR_ANDRA`) och verifieras på båda: kontrollsumman ska vara densamma som för ögonblicksbilden, och kopian läst från platsen ska vara en hel databas med alla tabeller och med hela hashkedjor i åtkomstloggen och säkerhetsloggen.
- Kopiorna är komprimerade och ligger under en nyckel som inte avslöjar vilken databas de hör till. Nyckeln sparas bredvid kopiorna.
- I driften ska den andra platsen vara en annan volym på en annan ort. Det väljer den som driver systemet med `KOPIOR_ANDRA`.

## Återställning till en tidpunkt

1. En systemförvaltare väljer en tidpunkt i vyn Lagring.
2. Systemet tar den senaste verifierade kopian före tidpunkten och läser den från den andra platsen om den första är skadad.
3. Systemet visar vad som går förlorat, och en andra systemförvaltare godkänner i sin egen inloggning (fyra ögon).
4. Läget före återställningen sparas först som en kopia, så att återställningen går att göra ogjord.
5. Raderna i åtkomstloggen och säkerhetsloggen som har skrivits efter kopian förs över till den återställda databasen, så att inga loggar går förlorade. Registrerade faktorer för inloggning förs också över.
6. Alla loggas ut och loggar in på nytt.

Det som gjordes mellan kopian och tidpunkten, högst femton minuter, återställs inte.

## Provåterläsning

En systemförvaltare kan göra en provåterläsning i vyn Lagring: systemet tar en kopia, läser in den i en ny databas och jämför tabeller, antal rader och loggarnas hashkedjor. Resultatet sparas utan patientuppgifter, med tid, storlek och kontrollsumma ([`app/src/lagring.js`](../../app/src/lagring.js), `POST /api/lagring/prov`).

| Prov | Hur ofta | Vem |
| --- | --- | --- |
| Provåterläsning i systemet | [fyll i: förslag varje vecka] | Systemförvaltare |
| Återställning till en tidpunkt i acceptanstestmiljön | [fyll i: förslag varje kvartal] | Systemförvaltare och driftleverantören |
| Återuppbyggnad av hela tjänsten på en ny server | [fyll i: förslag en gång per år] | Driftleverantören |

## Reservservern

Medan kärnsystemet återställs kan vården läsa journalen på en reservserver på en annan plats. Reservservern läser den senaste verifierade kopian, så att återläsningen ger ett fungerande system att läsa i (KD1.1.3.3), och inget som fanns i kopian går förlorat för den som behöver det (KD1.1.3.6).

1. Starta avbildningen av den version som är i drift på reservserverns plats, med kopiornas platser monterade bara för läsning och med inställningarna `RESERVSERVER=1`, `KOPIOR_KATALOG` och `KOPIOR_ANDRA` (eller kommandot `bun src/reservserver.js`). `RESERV_LOGG` är katalogen på reservserverns egen disk där loggen skrivs, `RESERV_LOGG_NYCKEL` (minst 32 tecken) är nyckeln som loggen signeras med och ska vara densamma som i kärnsystemet, och `FLERFAKTOR_NYCKEL` ska vara densamma som i kärnsystemet, så att engångskoderna fungerar. Utan `RESERV_LOGG_NYCKEL` startar reservservern inte med en logg.
2. Ska reservservern visa en viss databas, och inte den senaste kopian av alla, anger driften `RESERV_SANDLADA` med nyckeln som systemförvaltaren ser på sidan Säkerhetskopior.
3. Reservservern väljer själv den senaste kopian som är verifierad, kontrollerar den på samma sätt som vid en återställning och läser den från den andra platsen om den första är skadad. Finns ingen kopia som håller startar den inte, och säger varför.
4. Kontrollera att `GET /api/health` har fältet reservserver med kopians tid och ålder, och logga in som en vanlig användare. Raden överst på sidan säger att det är en reservserver och hur gamla uppgifterna är.
5. Meddela verksamheten adressen till reservservern och att den bara kan läsas.
6. När kärnsystemet är i drift igen: stäng reservservern och gör katalogen med dess logg tillgänglig för kärnsystemet med `RESERV_LOGG`. Sidan Lagring visar då att det finns en logg som inte är inläst, med antal rader, period och kopia, och systemförvaltaren läser in den med ett klick. Kommandot `bun src/reservserver.js --las-in-logg <fil> --databas <fil>` gör samma sak och finns som reserv. Varje rad läses in en gång, med sin tid och person, märkt Reservservern, och en logg vars kedja inte håller läses inte in.

Reservservern ändrar aldrig något på platserna för kopiorna, och den tar inga egna kopior. Det som registrerades efter kopian finns inte där.

## Haveri av hela servern

Systemets egna kopior skyddar mot skadad databas och fel i en version. Ett haveri av hela servern eller datahallen kräver driftens egen plan:

1. Bekräfta haveriet och starta processen för större incident, och starta reservservern så att vården kan läsa journalen under tiden.
2. Starta avbildningen av den version som var i drift på en ny server. Varje version är en egen avbildning, byggd ur samma källkod, och bygget stoppas om ett test är rött ([`app/Dockerfile`](../../app/Dockerfile)).
3. Gör kopiorna från den andra platsen och nyckeln till dem tillgängliga för den nya servern.
4. Läs in den senaste verifierade kopian och kontrollera den med en provåterläsning.
5. Kontrollera att versionen och schemaversionen stämmer i `GET /api/health` och vyn Uppgraderingar.
6. Låt användarna logga in. Skrivköerna i webbläsarna skickas och loggarna från läsläget förs över.
7. Rapportera till beställaren och boka ett uppföljningsmöte.

Att bygga upp hela tjänsten på en ny server från kopiorna på den andra platsen är inte prövat i systemets tester. Den som driver systemet ska ta fram de exakta stegen för sin miljö och öva dem.

## Datalagringen

Driftleverantören tillhandahåller lagringen: databasen, säkerhetskopiorna på två platser, driftens egna kopior med längre lagringstid och lagringen för bilder och media. Vyn Lagring visar storleken, en prognos ett, tre och tio år framåt och storleken på kopiorna, och kan ta ut en huvudmans uppgifter för sig.

## Det systemet redan har som stöd

- Säkerhetskopior på två platser med verifiering, återställning till en tidpunkt med fyra ögon och läsning från den andra platsen när den första är skadad ([`app/src/sakerhetskopior.js`](../../app/src/sakerhetskopior.js), [`docs/design.md`](../design.md) avsnittet Uppgraderingar med återgång och säkerhetskopior).
- Provåterläsning och lagringsprognos ([`app/src/lagring.js`](../../app/src/lagring.js)).
- Migreringar som går att backa, så att en äldre version kan starta mot databasen ([`app/src/releaser.js`](../../app/src/releaser.js)).
- Loggarna med hashkedjor, som kontrolleras i varje kopia ([`app/src/logg.js`](../../app/src/logg.js), [`app/src/sakerhetslogg.js`](../../app/src/sakerhetslogg.js)).
- Reservservern, som läser den senaste verifierade kopian, bara kan läsas och loggar till en egen fil som läses in efteråt ([`app/src/reservserver.js`](../../app/src/reservserver.js)).

## Att fylla i för den som driver systemet

| Fält | Värde |
| --- | --- |
| Längsta tid till återställd tjänst (RTO) | [fyll i: tid] |
| Högsta dataförlust (RPO) | [fyll i: tid] |
| Första platsen för kopiorna | [fyll i: volym] |
| Andra platsen för kopiorna | [fyll i: volym på annan ort] |
| Driftens egna kopior med längre lagringstid | [fyll i: hur ofta, var och hur länge] |
| Förvaring av nyckeln till kopiorna | [fyll i: var och vem som har åtkomst] |
| Reservserver | [fyll i: var den står, vem som startar den och hur verksamheten får adressen] |
| Senaste övade återuppbyggnad | [fyll i: datum och resultat] |

## Förkortningar

- RPO: den största mängd data, mätt i tid, som får gå förlorad vid ett haveri (Recovery Point Objective)
- RTO: den längsta tid det får ta att återställa tjänsten efter ett haveri (Recovery Time Objective)

Dokumentet skrivs ur Vårdkällans källkod (app/src/driftdokument.js). Den som tar över det kan kopiera filen och fortsätta i sin egen dokumenthantering.
