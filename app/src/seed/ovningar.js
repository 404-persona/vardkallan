// Övningarna i utbildningsmiljön som de var i första versionen (runda 7, r2). Seeden lägger in dem som version 1, och
// sedan ändrar verksamhetschefen eller en utbildare dem i gränssnittet (utbildning.js). Inga patientuppgifter utom
// demopatienternas påhittade namn. Modulen beror inte på db.js.
import { YRKEN } from './personal.js';

const JOURNAL = ['lakare', 'sjukskoterska', 'underskoterska', 'vardadministrator', 'farmaceut', 'fysioterapeut'];
const ALLA = Object.keys(YRKEN);

const o = (id, roller, fraga, alternativ, ratt, forklaring, prova = null) => ({ id, roller, fraga, alternativ: alternativ.map(([a, text]) => ({ id: a, text })), ratt, forklaring, prova });

export const OVNINGAR_V1 = [
  o('logg', ALLA, 'Vad händer när du öppnar journalen för en patient i Vårdkällan?', [
    ['a', 'Inget sparas om du bara läser.'],
    ['b', 'Åtkomsten skrivs i åtkomstloggen med vem, när och på vilken grund, och patienten kan se den i Min journal.'],
    ['c', 'Bara ändringar i journalen loggas.'],
  ], 'b', 'Varje åtkomst till patientuppgifter loggas, också när du bara läser. Loggen går inte att ändra, och patienten ser i Min journal vilken vårdenhet och yrkesroll som har läst.'),
  o('expert', ALLA, 'Ett val dyker upp som du inte vet hur du ska fylla i. Vad gäller i Vårdkällan?', [
    ['a', 'Du behöver kunna kodverket för att fylla i det.'],
    ['b', 'Systemet fyller i det som går att räkna ut, föreslår resten och förklarar på vanlig svenska varför något inte går.'],
    ['c', 'Hoppa över valet, det kontrolleras ändå inte.'],
  ], 'b', 'Systemet är experten: koder, vårdkontakt, enhet och tider sätts av systemet, och när något inte går står det varför. Knappen Hjälp i flödet förklarar stegen.'),
  o('andra-enheter', JOURNAL, 'Du behöver läsa vad en annan vårdenhet har dokumenterat om demopatienten Gunnar Åkesson. Hur gör du?', [
    ['a', 'Ber en kollega på den andra vårdenheten skriva ut journalen.'],
    ['b', 'Väljer Visa uppgifter från andra vårdenheter i patienthuvudet och anger syftet, som systemet föreslår.'],
    ['c', 'Det går inte att läsa andra vårdenheters uppgifter.'],
  ], 'b', 'Inre sekretess: andra vårdenheters uppgifter visas efter ett aktivt val med syfte. Valet loggas och gäller sessionen för den patienten.', '#/patient/p01'),
  o('sparr', JOURNAL, 'Demopatienten Elin Sandberg har spärrat uppgifter. Vad ser du som inte arbetar på den spärrade vårdenheten?', [
    ['a', 'Allt, eftersom du har vårdrelation.'],
    ['b', 'En spärrmarkering, men inte innehållet eller vilken vårdenhet det gäller. Spärren hävs bara med patientens samtycke i stunden.'],
    ['c', 'Innehållet, om du väljer nödåtkomst.'],
  ], 'b', 'En spärr hävs bara tillfälligt med patientens samtycke, och nödåtkomst häver aldrig en spärr.'),
  o('skyddad', JOURNAL, 'En patient har skyddade personuppgifter. Vad visar systemet i arbetslistan och väntrummet?', [
    ['a', 'Namn och adress som vanligt.'],
    ['b', 'Skyddad identitet i stället för namnet, och adressen visas aldrig. Väntrummet visar bara könummer.'],
    ['c', 'Patienten visas inte alls.'],
  ], 'b', 'Systemet maskerar skyddad identitet överallt utan att någon behöver komma ihåg det. Visa identitet kräver ett syfte och loggas.', '#/arbetslista'),
  o('overkanslighet', ['lakare'], 'Du ordinerar amoxicillin till demopatienten Gunnar Åkesson, som är överkänslig mot penicilliner. Vad gör systemet?', [
    ['a', 'Sparar ordinationen utan varning.'],
    ['b', 'Varnar innan ordinationen sparas och kräver en motivering om du ändå vill ordinera.'],
    ['c', 'Tar bort överkänsligheten ur journalen.'],
  ], 'b', 'Ordinationen kontrolleras mot överkänslighet och andra läkemedel innan den sparas. En allvarlig varning kräver en motivering, som sparas med ordinationen.', '#/patient/p01/lakemedel'),
  o('nodatkomst', ['lakare', 'sjukskoterska'], 'Patienten saknar vårdrelation till din vårdenhet och kan inte samtycka, men du behöver journalen för vården. Vad gäller?', [
    ['a', 'Du kan inte öppna journalen.'],
    ['b', 'Du väljer Nödåtkomst med ett syfte. Åtkomsten flaggas i loggen och följs upp, och en spärr hävs aldrig.'],
    ['c', 'Du öppnar journalen som vanligt.'],
  ], 'b', 'Nödåtkomst kräver syfte och intyg om att patienten inte kan samtycka. Den syns för logggranskaren.', '#/sok'),
  o('dubbel-dos', ['sjukskoterska', 'underskoterska'], 'Du ska ge en dos från Läkemedel att ge, och systemet varnar för dubbel dos. Vad betyder det?', [
    ['a', 'Att listan är fel och varningen kan bortses från.'],
    ['b', 'Att en dos av samma läkemedel redan är registrerad nyss. Kontrollera innan du ger igen.'],
    ['c', 'Att läkaren måste ordinera på nytt.'],
  ], 'b', 'Systemet räknar fram dagens doser ur ordinationerna och varnar för dubbel dos, för tidig dos och högsta dygnsdos, med en förklaring.', '#/administrering'),
  o('news2', ['sjukskoterska'], 'Du registrerar vitalparametrar och NEWS2 blir 7. Vad gör systemet?', [
    ['a', 'Inget, du räknar NEWS2 själv.'],
    ['b', 'Räknar NEWS2, skriver vad som ska göras och när nästa kontroll ska göras, och larmar i inkorgen för sjuksköterskan och läkaren.'],
    ['c', 'Skickar ett sms till patienten.'],
  ], 'b', 'NEWS2 räknas ur vitalparametrarna. En summa som kräver åtgärd larmar i inkorgen. Reglerna är demoregler.'),
  o('delegering', ['underskoterska'], 'När får du som undersköterska ge ett läkemedel?', [
    ['a', 'När som helst om sjuksköterskan säger det.'],
    ['b', 'Bara med en giltig delegering. Systemet prövar delegeringen för just den dosen och visar knappen Ge bara då.'],
    ['c', 'Aldrig.'],
  ], 'b', 'Delegeringen registreras av en sjuksköterska eller läkare enligt HSLF-FS 2017:37 9 kap., och systemet påminner innan den går ut.', '#/delegeringar'),
  // Runda 15, r5: undersköterskans observationsanteckning och omvårdnadsprocessen.
  o('observation', ['underskoterska'], 'Du har hjälpt patienten till toaletten och sett att hon är ostadig. Hur dokumenterar du det?', [
    ['a', 'Du berättar det för sjuksköterskan, som skriver det.'],
    ['b', 'Du skriver en observationsanteckning med det du har sett och det du har gjort. Systemet väljer mallen, och sjuksköterskan ser anteckningen i sitt underlag.'],
    ['c', 'Du skriver det i en daganteckning.'],
  ], 'b', 'Undersköterskan dokumenterar i en kort observationsanteckning med sökorden Observation och Utförd åtgärd. Vårdgivaren bestämmer vilka mallar yrket skriver med.', '#/patient/p01'),
  o('omvardnadsprocess', ['sjukskoterska'], 'Du skriver en omvårdnadsanteckning för en patient med vårdplanen Förebyggande av fall. Vad gör systemet?', [
    ['a', 'Visar alla tolv statusområden och låter dig välja.'],
    ['b', 'Föreslår de områden och omvårdnadsproblem som gäller patienten i dag och säger varför, visar undersköterskans observationer och vårdplanens mål, och för in ditt resultat i vårdplanen när du signerar.'],
    ['c', 'Skriver anteckningen åt dig.'],
  ], 'b', 'Förslagen kommer ur vårdplanen, förra anteckningen, NEWS2, fallrisken, såren, smärtan och vikten på din vårdenhet. Reglerna är demoregler.', '#/patient/p01'),
  o('boka', ['vardadministrator'], 'En remiss väntar på tid. Hur bokar du?', [
    ['a', 'Letar själv efter en ledig tid i tidboken och räknar dagarna mot vårdgarantin.'],
    ['b', 'Väljer en av de tider som systemet föreslår i Dagens arbete. Systemet räknar dagarna mot vårdgarantin och skriver kallelsen.'],
    ['c', 'Ringer patienten först.'],
  ], 'b', 'Systemet föreslår de lämpligaste tiderna, så att bokningen är ett klick, och väljer kanal för kallelsen.', '#/idag'),
  o('samman', ['vardadministrator'], 'Systemet har hittat en trolig dubblett. Vem slår samman journalerna?', [
    ['a', 'Den som först ser dubbletten.'],
    ['b', 'Vårdadministratören bekräftar sammanslagningen, med behörighet till båda journalerna. Den gamla identiteten går att söka på.'],
    ['c', 'Systemet slår samman utan att fråga.'],
  ], 'b', 'Systemet hittar troliga dubbletter, och bara en vårdadministratör bekräftar sammanslagningen.'),
  o('genomgang', ['farmaceut'], 'Vad gör du i en fördjupad läkemedelsgenomgång?', [
    ['a', 'Ändrar ordinationerna själv.'],
    ['b', 'Går igenom läkemedlen med läkaren och patienten. Systemet tar fram läkemedelsberättelsen.'],
    ['c', 'Skickar en remiss till apoteket.'],
  ], 'b', 'Farmaceuten deltar i genomgången, och läkaren ordinerar. Systemet sammanställer underlaget.'),
  o('stickprov', ['logggranskare'], 'Hur väljs åtkomsterna i ett stickprov?', [
    ['a', 'Granskaren väljer själv vilka personer som ska granskas.'],
    ['b', 'Systemet drar åtkomsterna slumpvis för perioden, och du markerar var och en som befogad eller att den ska utredas.'],
    ['c', 'Bara nödåtkomster granskas.'],
  ], 'b', 'Stickprov enligt HSLF-FS 2016:40 4 kap. 9 b §. Nödåtkomster är dessutom flaggade i logguppföljningen.', '#/logg'),
  o('gallring', ['arkivarie'], 'När får en journal gallras?', [
    ['a', 'När den är äldre än tio år.'],
    ['b', 'Bara efter ett registrerat beslut, och åtkomstloggen ändras inte.'],
    ['c', 'När patienten ber om det.'],
  ], 'b', 'Gallring och förstöring görs bara efter ett registrerat beslut. Exportpaketet följer Riksarkivets FGS.', '#/arkiv'),
  o('datauttag', ['uppfoljning'], 'Vad innehåller datauttaget för uppföljning?', [
    ['a', 'Hela journalen med namn.'],
    ['b', 'Uppgifter utan namn och personnummer, uppdaterade varje natt.'],
    ['c', 'Bara antalet patienter.'],
  ], 'b', 'Datauttaget har inga namn eller personnummer och uppdateras varje natt.', '#/datauttag'),
  o('samverkan', ['kommun'], 'Vad ser du som kommunens personal i Vårdkällan?', [
    ['a', 'Patientens hela journal.'],
    ['b', 'Den samordnade planeringen som delas med kommunen, inte journalen.'],
    ['c', 'Ingenting.'],
  ], 'b', 'Kommunen är en simulerad part i demon och ser bara den samordnade planeringen.', '#/samverkan'),
  o('ledningsansvar', ['verksamhetschef'], 'Vilket ansvar kan du som verksamhetschef inte lämna över?', [
    ['a', 'Inget, allt kan lämnas över.'],
    ['b', 'Det samlade ledningsansvaret för läkemedel. Enskilda uppgifter kan uppdras åt andra, och systemet påminner när ett uppdrag saknas.'],
    ['c', 'Ansvaret för läkemedelsmallarna.'],
  ], 'b', 'Gröna häftet 1.3: ledningsansvaret kan inte överlåtas, men uppdrag som medicinskt ansvarig läkare kan utses.', '#/lakemedelsansvar'),
  o('intyg', ['verksamhetschef'], 'Hur ser du vilka på vårdenheten som har giltigt intyg?', [
    ['a', 'Du frågar var och en.'],
    ['b', 'Under Utbildning. Systemet vet vilka som arbetar på vårdenheten, räknar giltigheten och visar vilka som går ut inom 30 dagar.'],
    ['c', 'Det går inte att se.'],
  ], 'b', 'Intyget gäller i ett år. Systemet räknar själv vilka som har giltigt intyg.', '#/utbildning'),
  // Runda 7: ekonomen (r3) och systemförvaltaren (r4) fick egna övningar när delarna slogs ihop.
  o('ekonomi-underlag', ['ekonom'], 'Ekonomisystemet behöver förra månadens faktureringsunderlag för en vårdenhet. Hur tar du fram det?', [
    ['a', 'Ber vårdenheten registrera alla besök och åtgärder i en lista.'],
    ['b', 'Hämtar underlaget för vårdenheten och månaden som fil. Systemet har redan skapat posterna ur det som har hänt och räknat priserna och betalningsmottagarna.'],
    ['c', 'Läser journalerna och räknar själv.'],
  ], 'b', 'Systemet skapar faktureringsunderlaget av sig självt ur vårdkontakter, åtgärder, läkemedel och hjälpmedel. Ekonomen läser aldrig journalen, och varje export loggas på patienterna i underlaget.', '#/ekonomi'),
  o('fyra-ogon', ['systemforvaltare'], 'Du har föreslagit en ändring av en regel. När börjar den gälla?', [
    ['a', 'Direkt när du sparar den.'],
    ['b', 'När en annan systemförvaltare har godkänt den, från det giltighetsdatum som står i förslaget.'],
    ['c', 'När du själv har godkänt den.'],
  ], 'b', 'Fyra ögon: ingen godkänner sina egna ändringar. Systemet visar effekten i förväg, kontrollerar att värdet är rimligt och sparar historiken, som inte går att ändra.', '#/regler'),
  // Runda 15, r2: samtycket i samtyckestjänsten och köerna till de nationella tjänsterna.
  o('samtycke-annat-system', ['lakare', 'sjukskoterska'], 'Patienten berättar att samtycket till sammanhållen journalföring redan är givet i ett annat system hos vårdgivaren. Vad gör du?', [
    ['a', 'Registrerar samtycket en gång till i Vårdkällan.'],
    ['b', 'Inget extra. Systemet hittar samtycket i samtyckestjänsten och skriver att det gäller här också. Du gör bara det aktiva valet med syftet.'],
    ['c', 'Ber patienten återkalla samtycket i det andra systemet först.'],
  ], 'b', 'Ett samtycke för vårdenheten gäller i alla system hos vårdgivaren. Systemet prövar samtycket både i Vårdkällan och i samtyckestjänsten, som är simulerad i demon.', null),
  o('vardkontakt-fel-patient', ['vardadministrator'], 'Ett besök har registrerats på fel patient, och läkaren har redan skrivit en anteckning på det. Vad gör du?', [
    ['a', 'Ber läkaren skriva om anteckningen på rätt patient och låter besöket stå kvar.'],
    ['b', 'Väljer Registrerad på fel patient på vårdkontakten, skriver varför och anger numret för rätt patient. Systemet flyttar besöket med anteckningen dit och lämnar bara makuleringen kvar på fel patient.'],
    ['c', 'Raderar besöket.'],
  ], 'b', 'Journaluppgifter förstörs aldrig. Systemet flyttar allt som hör till besöket, och på fel patient står bara att kontakten är makulerad, utan något om den andra patienten. Har rätt patient ingen vårdrelation till vårdenheten väntar flytten på att verksamhetschefen eller en annan vårdadministratör godkänner den.', null),
  // Runda 15, r2, tredje omgången: fyra ögon när rätt patient saknar vårdrelation.
  o('flytt-fyra-ogon', ['verksamhetschef'], 'En vårdadministratör föreslår att ett besök på fel patient flyttas till en patient som inte har vårdrelation till vårdenheten. Vad gör du?', [
    ['a', 'Godkänner direkt, eftersom förslaget kommer från en kollega.'],
    ['b', 'Öppnar Flyttar till rätt patient, kontrollerar numret mot underlaget och godkänner eller avslår med en kommentar. Först när du godkänner flyttas besöket, och rätt patient får den vårdrelation som besöket ger.'],
    ['c', 'Öppnar journalen för rätt patient för att se om det stämmer.'],
  ], 'b', 'Förslaget ger ingen åtkomst till rätt patient och visar bara numret som skrevs. Den som föreslog flytten kan aldrig godkänna den själv.', '#/flyttar'),
  o('nationella-koer', ['systemforvaltare'], 'Samtyckestjänsten har inte svarat på en timme. Vad händer med samtyckena som registreras under tiden?', [
    ['a', 'De går förlorade och måste registreras igen.'],
    ['b', 'De gäller i Vårdkällan och ligger i kön. Systemet skickar dem när tjänsten svarar, och sidan Nationella tjänster visar det som inte har kommit fram, utan patientuppgifter.'],
    ['c', 'Ingen kan registrera samtycke förrän tjänsten svarar.'],
  ], 'b', 'Köerna till samtyckestjänsten och engagemangsindex försöker igen av sig själva, med allt längre mellan försöken. Du kan skicka det som väntar direkt.', '#/nationella-tjanster'),
];
// Runda 15, r4: anteckningsvyn med underlaget, utkastet som sparas av sig självt och de egna fraserna.
OVNINGAR_V1.push(
  o('underlag', ['lakare', 'sjukskoterska', 'underskoterska', 'fysioterapeut'], 'Du skriver en daganteckning och vill ta med dagens blodtryck. Hur gör du?', [
    ['a', 'Öppnar mätvärdena i ett annat fönster och skriver av värdet.'],
    ['b', 'Klickar på blodtrycket i underlaget bredvid sökorden. Systemet för in värdet med datum där du senast skrev, som en referens till mätvärdet.'],
    ['c', 'Systemet drar in alla dagens värden i anteckningen av sig självt.'],
  ], 'b', 'Underlaget visar det som hör till anteckningen: mätvärden sedan förra anteckningen av samma slag med en pil för förändringen, läkemedelsändringar och diagnoser. Inget förs in av sig självt, så att anteckningen bara får med det du väljer.', '#/patient/p01/journal'),
  o('utkast-sparas', ['lakare', 'sjukskoterska', 'underskoterska', 'fysioterapeut'], 'Mitt i en anteckning klickar du på en tidigare anteckning i listan. Vad händer med det du har skrivit?', [
    ['a', 'Texten försvinner om du inte har sparat.'],
    ['b', 'Den tidigare anteckningen öppnas i en läsruta ovanför, och din text står kvar. Utkastet sparas också av sig självt.'],
    ['c', 'Du måste först trycka på Spara utkast.'],
  ], 'b', 'Utkastet sparas en kort stund efter att du har slutat skriva och när du lämnar rutan, och syns bara för dig. Lämnar du patienten sparas texten först, och systemet frågar bara om det inte gick.', '#/patient/p01/journal'),
  o('egna-fraser', ['lakare', 'sjukskoterska', 'underskoterska', 'fysioterapeut'], 'Vad får en egen fras innehålla?', [
    ['a', 'Värden ur journalen, till exempel ett blodtryck med datum.'],
    ['b', 'Text som du själv har skrivit, till exempel Inga bröstsmärtor, ingen andnöd.'],
    ['c', 'En hel mall med många sökord.'],
  ], 'b', 'Fraserna är dina egna korta texter och skrivs in med punkt, kortnamnet och tabb. Värden ur journalen förs in med underlaget, så att de alltid har datum och källa. Högst 20 fraser per person.', '#/patient/p01/journal'),
);
// Runda 16, r2: stödet vid sjukskrivning, beslutsstödet och förlängningen för läkaren, och vårdenhetens översikt för
// verksamhetschefen.
OVNINGAR_V1.push(
  o('sjukfall-forlang', ['lakare'], 'Demopatienten Marek Zieliński är sjukskriven och intyget går snart ut. Hur förlänger du sjukskrivningen?', [
    ['a', 'Skriver ett nytt sjukintyg från början och räknar ut när perioden ska börja.'],
    ['b', 'Klickar på Förläng sjukskrivningen i fliken Sjukskrivning. Förra intyget förnyas med de svar som inte har ändrats, och systemet föreslår perioden från dagen efter förra intyget.'],
    ['c', 'Ändrar slutdatumet i det signerade intyget.'],
  ], 'b', 'Ett signerat intyg ändras aldrig. Systemet föreslår perioden, som du fyller i med ett klick, och du tar ställning till grad, underlag och prognos och signerar.', '#/patient/p18/sjukskrivning'),
  o('fmb-varning', ['lakare'], 'Beslutsstödet säger att den sammanlagda sjukskrivningen blir längre än Socialstyrelsens rekommendation. Vad gör du?', [
    ['a', 'Kortar perioden så att varningen försvinner.'],
    ['b', 'Bedömer patienten. Behövs en längre sjukskrivning skriver du varför i fråga 37, en gång, och motiveringen följer med när intyget förnyas.'],
    ['c', 'Intyget går inte att signera förrän varningen är borta.'],
  ], 'b', 'Rekommendationen är ett stöd, inte en gräns. Systemet räknar dagarna ur patientens tidigare intyg, och Försäkringskassan får din motivering i intyget.'),
  o('sjukfall-regel', ['lakare'], 'Ett sjukintyg slutar den 10:e och nästa börjar den 14:e. Räknas de som ett sjukfall?', [
    ['a', 'Nej, sjukfallet bryts så fort det finns en dag utan intyg.'],
    ['b', 'Ja. Intyg med högst 5 dagars uppehåll hör till samma sjukfall, men dagarna mellan intygen räknas inte i sjukskrivningens längd.'],
    ['c', 'Ja, och dagarna mellan intygen räknas med i längden.'],
  ], 'b', 'Regeln är densamma som i Rehabstöd och Webcert. Systemet räknar sjukfallet själv och visar var patienten är i rehabiliteringskedjan.', '#/sjukskrivningar'),
  o('sjukfall-enhet', ['verksamhetschef'], 'Varför står det dolt på flera rader i Sjukskrivningar på vårdenheten?', [
    ['a', 'Uppgifterna har inte hunnit räknas.'],
    ['b', 'Små antal visas inte, så att översikten inte pekar ut enskilda patienter. Patienter med skyddade personuppgifter räknas inte alls.'],
    ['c', 'Det är ett fel som ska anmälas.'],
  ], 'b', 'Översikten visar bara antal, utan patientuppgifter. Antal mellan 1 och 4 döljs, och fler rutor döljs när de dolda antalen annars skulle gå att räkna fram ur totalen.', '#/sjukskrivningar/enhet'),
);

// Runda 16, r1: intygen i intygsapplikationen, för läkaren och vårdadministratören.
OVNINGAR_V1.push(
  o('intyg-ersatt', ['lakare'], 'Demopatienten Mikael Svensson har ett läkarintyg för högre körkortsbehörigheter (TSTRK1007) från 2024. Han behöver ett nytt. Hur gör du?', [
    ['a', 'Skriver ett nytt TSTRK1007, eftersom det är samma intyg som förra gången.'],
    ['b', 'Klickar på Skriv TS 8071 i stället vid det gamla intyget. Systemet vet att TS8071 har ersatt TSTRK1007 och tar med de svar som får följa med.'],
    ['c', 'Letar upp rätt blankett på Transportstyrelsens webbplats.'],
  ], 'b', 'TSTRK1007 kan inte utfärdas sedan den 31 januari 2025. Systemet visar bara de intyg som gäller nu, säger vad som ersatte det gamla och byter med ett klick.', '#/patient/p14/intyg'),
  o('intyg-fornya', ['lakare'], 'Du förnyar ett läkarintyg för sjukpenning som skrevs i version 1 av blanketten. Vad följer med till det nya utkastet?', [
    ['a', 'Allt, också sjukskrivningens grad och period.'],
    ['b', 'Svaren på frågor som inte har ändrats i version 2. Grad och period, underlag och prognos tar du ställning till på nytt.'],
    ['c', 'Ingenting, du skriver allt från början.'],
  ], 'b', 'Bara svar på oförändrade frågor följer med, som Inera beskriver för FK 7804 och AG7804. Det du ska bedöma på nytt följer aldrig med, och systemet säger hur många frågor det gäller.', '#/patient/p14/intyg'),
  o('intyg-arbetsgivare', ['lakare'], 'Patienten vill ha ett läkarintyg till sin arbetsgivare men vill inte att arbetsgivaren får veta diagnosen. Vad gäller?', [
    ['a', 'Intyget skickas digitalt till arbetsgivaren med diagnosen.'],
    ['b', 'Intyget skrivs ut och lämnas av patienten. Svarar patienten nej på frågan om att förmedla diagnosen finns den inte med, och patienten kan dölja den på utskriften.'],
    ['c', 'Det går inte att skriva intyget utan diagnos.'],
  ], 'b', 'Läkarintyg om arbetsförmåga till arbetsgivaren och under sjuklöneperioden kan inte skickas digitalt. Diagnosen är patientens att dela.'),
  o('intyg-utkast', ['vardadministrator'], 'Du har fyllt i ett utkast till ett läkarutlåtande åt läkaren. Hur gör du klart det?', [
    ['a', 'Signerar det själv, så att läkaren slipper.'],
    ['b', 'Klickar på Markera klart för signering. Läkaren signerar. När läkaren öppnar utkastet föreslår systemet det läkaren får se ur journalen, till exempel diagnosen, och läkaren sparar det.'],
    ['c', 'Skickar det till Försäkringskassan.'],
  ], 'b', 'Vårdadministratören skapar och fyller i utkast men signerar aldrig, och ser bara de svar som den själv har skrivit. Journalen visar Klart för signering av sig själv.', '#/patient/p01/intyg'),
  o('intyg-skyddad', ['vardadministrator'], 'En patient har skyddade personuppgifter och behöver ett intyg. Kan du skapa utkastet?', [
    ['a', 'Ja, som för alla patienter.'],
    ['b', 'Nej. För en patient med skyddade personuppgifter skapar den som signerar intyget, och systemet säger det.'],
    ['c', 'Ja, men bara om du döljer namnet.'],
  ], 'b', 'Som i Webcert skapar och hanterar bara den som får signera intyg för en patient med skyddade personuppgifter, och bara på den vårdenhet där intyget skrevs.'),
  o('intyg-graviditet', ['vardadministrator'], 'Vem signerar ett intyg om graviditet till Försäkringskassan?', [
    ['a', 'Bara läkaren.'],
    ['b', 'Läkaren, barnmorskan eller sjuksköterskan vid mödrahälsovården.'],
    ['c', 'Vårdadministratören.'],
  ], 'b', 'Försäkringskassan tar emot intyget om graviditet från läkare, barnmorska eller sjuksköterska vid mödrahälsovården. Systemet visar knappen Signera bara för den som får signera.'),
);
// Runda 16, r3: de nya yrkesrollerna och studenterna. Paramedicinarna och barnmorskan gör journalens övningar om andra
// vårdenheter, spärr och skyddad identitet, och alla som skriver gör övningarna om underlaget och utkastet. Studenterna
// har egna övningar om handledningen, och handledarna om att kontrasignera.
{
  const NYA = ['arbetsterapeut', 'dietist', 'logoped', 'kurator', 'psykolog', 'barnmorska'];
  const STUDENTER = ['lakarstudent', 'sjukskoterskestudent', 'barnmorskestudent'];
  const lagg = (id, roller) => { const x = OVNINGAR_V1.find(v => v.id === id); for (const r of roller) if (!x.roller.includes(r)) x.roller.push(r); };
  for (const id of ['andra-enheter', 'sparr', 'skyddad', 'egna-fraser']) lagg(id, NYA);
  for (const id of ['underlag', 'utkast-sparas']) lagg(id, [...NYA, ...STUDENTER]);
  lagg('sparr', STUDENTER);
  OVNINGAR_V1.push(
    o('student-signera', STUDENTER, 'Du är student och har skrivit en anteckning efter ett samtal med patienten. Vad händer när du signerar den?', [
      ['a', 'Anteckningen blir signerad i handledarens namn.'],
      ['b', 'Anteckningen blir signerad i ditt namn, märkt att du skrev den under handledning, och systemet skickar den till din handledare för kontrasignering.'],
      ['c', 'Du kan inte signera, så anteckningen ligger kvar som utkast.'],
    ], 'b', 'Journalen ska visa vem som har skrivit varje anteckning. Det du signerar är märkt med din handledare och syns som inte kontrasignerat tills handledaren har läst och kontrasignerat det i sin inkorg.', '#/arbetslista'),
    o('student-lakemedel', STUDENTER, 'Patienten ber om något mot smärtan. Vad gör du som student?', [
      ['a', 'Ordinerar paracetamol, eftersom det är ett vanligt läkemedel.'],
      ['b', 'Ger en dos från läkemedelslistan på egen hand.'],
      ['c', 'Säger till din handledare. Studenter ordinerar aldrig och ger läkemedel bara under tillsyn av den som har legitimation, så systemet har inga sådana knappar för dig.'],
    ], 'c', 'Bara läkare och vissa andra yrken med legitimation får ordinera, och en student ger läkemedel bara under tillsyn (HSLF-FS 2017:37 5 kap. och 7 kap. 7 §). Därför saknar studentens roll de handlingarna.'),
    o('student-handledning', STUDENTER, 'Din praktikperiod tog slut i går. Vad händer när du försöker öppna en journal?', [
      ['a', 'Journalen öppnas som vanligt i en vecka till.'],
      ['b', 'Systemet säger att du inte har någon pågående handledning, och journalen öppnas inte. Övningarna kan du fortfarande göra.'],
      ['c', 'Du får öppna journalen om du anger ett syfte.'],
    ], 'b', 'Studentens åtkomst gäller bara under en pågående handledning hos en handledare på samma vårdenhet. Systemet prövar det vid varje anrop, och handledaren registrerar en ny handledning om perioden förlängs.', '#/handledning'),
    o('handleda-kontrasignera', ['lakare', 'sjukskoterska', 'barnmorska'], 'Din student har signerat en anteckning. Var hittar du den, och vad gör du?', [
      ['a', 'Du söker upp patienten och letar i journalen.'],
      ['b', 'Den ligger i din inkorg under Att kontrasignera. Du läser den, går igenom den med studenten om något behöver rättas, och kontrasignerar med ett klick.'],
      ['c', 'Du behöver inte göra något, studentens signatur räcker.'],
    ], 'b', 'Systemet skickar varje anteckning som studenten signerar till handledaren. Anteckningen är märkt som inte kontrasignerad tills du har kontrasignerat den.', '#/inkorg'),
    o('preventivmedel', ['barnmorska'], 'En patient på barnmorskemottagningen vill börja med p-piller. Hur förskriver du?', [
      ['a', 'Du ber en läkare ordinera, eftersom barnmorskan inte får förskriva läkemedel.'],
      ['b', 'Du väljer Förskriv preventivmedel och preventivmedlet. Systemet fyller i orsak, dosering och uppföljning om ett år och kontrollerar mot överkänslighet och andra läkemedel.'],
      ['c', 'Du ordinerar som en läkare, med alla läkemedel i katalogen.'],
    ], 'b', 'Barnmorskans förskrivningsrätt gäller hormonella preventivmedel, akut-p-piller, p-ring och hormonspiral. Systemet visar bara dem, och en allvarlig varning skickar dig till en läkare.', '#/patient/p11/lakemedel'),
    o('yrkets-mall', ['arbetsterapeut', 'dietist', 'logoped', 'kurator', 'psykolog'], 'Du ska dokumentera ett besök. Hur vet du vilken mall du ska använda?', [
      ['a', 'Du väljer bland alla mallar i journalen och hoppas att det är rätt.'],
      ['b', 'Systemet väljer ditt yrkes mall, till exempel psykologanteckningen eller logopedanteckningen, med de sökord som yrket dokumenterar.'],
      ['c', 'Du skriver i en läkares daganteckning.'],
    ], 'b', 'Varje yrke ser bara sina mallar, och vårdgivaren bestämmer vilka mallar yrket skriver med. Anteckningen hör till omvårdnadens dokumentation och har samma behörighet, spärr och loggning som andra anteckningar.', '#/arbetslista'),
    o('kurator-vem-ser', ['kurator', 'psykolog'], 'Vem kan läsa en anteckning som du skriver om patientens sociala förhållanden eller psykiska mående?', [
      ['a', 'All personal i regionen.'],
      ['b', 'Läkare, sjuksköterskor, barnmorskor och annan personal som läser journalen och vårdar patienten på din vårdenhet, men inte undersköterskan. Andra vårdenheter ser den bara efter ett aktivt val med syfte, och om patienten har spärrat din vårdenhet bara med patientens samtycke.'],
      ['c', 'Bara du själv.'],
    ], 'b', 'Kuratorns och psykologens anteckningar läses inte av undersköterskan, som inte behöver dem i sitt arbete. Inre sekretess gäller per vårdenhet. Varje läsning loggas, och patienten ser i Min journal vilka som har läst.'),
    // Runda 16, r3 (beslut 2026-11-15): kuratorn och SIP.
    o('kurator-sip', ['kurator'], 'En patient behöver insatser både från vården och från kommunen. Vad gör du?', [
      ['a', 'Ber läkaren upprätta planen, eftersom kuratorn inte får.'],
      ['b', 'Upprättar en samordnad individuell plan (SIP) under Planer i journalen, med patientens samtycke, insatserna per huvudman och vem som har det övergripande ansvaret.'],
      ['c', 'Skriver insatserna i en kuratorsanteckning.'],
    ], 'b', 'Kuratorn upprättar samordnade individuella planer med samma behörighet som läkaren och sjuksköterskan. Planen kräver patientens samtycke, och kommunen ser bara det som har skickats till den.'),
  );
}
// Runda 16: rehabkoordinatorn (rehabkoordinator.js). Samtycket till koordineringsinsatser, vad tabellen visar och vad
// läkaren ser av REKO-statusen.
OVNINGAR_V1.push(
  o('reko-samtycke', ['rehabkoordinator'], 'Patienten vill ha hjälp att planera återgången i arbete, och du ska börja ge koordineringsinsatser. Vad gör du i systemet?', [
    ['a', 'Du sätter REKO-status Aktiv. Samtycket behövs inte, eftersom läkaren redan har sjukskrivit patienten.'],
    ['b', 'Du sätter REKO-status Aktiv, bekräftar att patienten har samtyckt till koordineringsinsatser och anger om samtycket var muntligt eller skriftligt.'],
    ['c', 'Du ber läkaren sätta statusen.'],
  ], 'b', 'Koordineringsinsatser ges bara om patienten samtycker (lagen (2019:1297) om koordineringsinsatser för sjukskrivna patienter 3 §). Samtycket gäller tills patienten avböjer eller insatserna avslutas.', '#/rehabkoordinator'),
  o('reko-tabell', ['rehabkoordinator'], 'Du öppnar Sjukfall och tabellen är tom. Varför?', [
    ['a', 'Det finns inga sjukskrivna patienter på vårdenheten.'],
    ['b', 'Tabellen fylls först när du söker, gärna med ett filter på REKO-status. Varje patient som visas loggas, så du ser bara det du behöver.'],
    ['c', 'Du behöver göra ett aktivt val för varje patient.'],
  ], 'b', 'Som i Rehabstöd är tabellen tom tills du söker. Du ser sjukfallen på din egen vårdenhet, men inte patienter med skyddade personuppgifter.', '#/rehabkoordinator'),
  o('reko-lakaren', ['rehabkoordinator', 'lakare'], 'Rehabkoordinatorn har satt REKO-status Kontaktad för en sjukskriven patient. Vem ser statusen?', [
    ['a', 'Läkaren och rehabkoordinatorn på vårdenheten. Läkaren ser den i Mina sjukskrivningar och på fliken Sjukskrivning men ändrar den inte.'],
    ['b', 'All personal i regionen.'],
    ['c', 'Bara rehabkoordinatorn.'],
  ], 'a', 'Statusen gäller sjukfallet på vårdenheten. Bara rehabkoordinatorn sätter den, och varje ändring finns kvar i historiken med vem och när.', '#/sjukskrivningar'),
);
// Runda 18, r3 (Sussa B1 till B5): priserna där beslutet fattas och kostnaden i vårdprocessen för läkaren, kostnaderna
// per vårdenhet för verksamhetschefen och ekonomen, och uthämtningen av hjälpmedel för vårdadministratören.
OVNINGAR_V1.push(
  o('pris-periodens-vara', ['lakare'], 'Du ordinerar ett läkemedel och systemet säger att periodens vara i utbytesgruppen är billigare. Vad behöver du göra?', [
    ['a', 'Byta till periodens vara själv, annars blir ordinationen fel.'],
    ['b', 'Ingenting. Apoteket byter till periodens vara om du inte motsätter dig utbyte. Priset är ett stöd, och du väljer det som är medicinskt rätt.'],
    ['c', 'Fråga patienten vilket läkemedel som är billigast.'],
  ], 'b', 'Systemet visar priset diskret där du beslutar och föreslår bara likvärdiga alternativ. Det gör inget flöde längre, och priserna i demon är påhittade.'),
  o('kostnad-jamforelse', ['lakare'], 'Kostnadsrutan säger att kostnaden hittills är högre än ersättningen för ett jämförbart vårdtillfälle. Vad betyder det?', [
    ['a', 'Att patienten måste skrivas ut.'],
    ['b', 'Att vårdtillfället hittills har kostat mer enligt prislistan än vad ett vårdtillfälle i samma DRG-grupp ersätts med. Det är information, inget beslut.'],
    ['c', 'Att något i journalen är fel.'],
  ], 'b', 'Systemet räknar kostnaden ur det som har hänt och jämför med DRG-gruppen. I demon är grupperingen en egen demogruppering, inte NordDRG.'),
  o('kostnader-vardenhet', ['verksamhetschef', 'ekonom'], 'Hur ser du vad vården på din vårdenhet har kostat de senaste månaderna?', [
    ['a', 'Du ber ekonomen ta fram en sammanställning.'],
    ['b', 'Under Kostnader per vårdenhet. Systemet räknar kostnaden per månad ur det som har hänt, som diagram och tabell, utan patientuppgifter.'],
    ['c', 'Du räknar själv ur journalerna.'],
  ], 'b', 'Systemet räknar kostnaderna enligt prislistan. Ersättningen enligt DRG och patientavgifterna står för sig, och den pågående månaden är preliminär.', '#/kostnader'),
  o('hjalpmedel-uthamtning', ['vardadministrator'], 'En patient kommer till receptionen för att hämta ut en knäortos som läkaren har förskrivit. Hur registrerar du det?', [
    ['a', 'Du skriver in hjälpmedlet och avgiften i kassan för hand.'],
    ['b', 'Du öppnar patientens översikt, där hjälpmedlet står med avgiften, och klickar på hur patienten betalar. Systemet registrerar uthämtningen och betalningen och visar kvittot.'],
    ['c', 'Läkaren registrerar uthämtningen.'],
  ], 'b', 'Systemet vet vad som ska hämtas ut och vad det kostar. Betalningen kommer med i kassan, dagsavslutet och faktureringsunderlaget. Terminalen är simulerad.'),
);
