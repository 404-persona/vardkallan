// Runda 15, r3: mellanarkivet för ordinationer och administreringar, FHIR och läskopian, och en fristående reservserver.
// Testnamnen delas med krav.js (D4 och M12). Mappningsfilerna lägger på detta sist (medR15r3).
const MA = 'Mellanarkiv för läkemedel > ';
const MF = 'FHIR ur mellanarkivet > ';
const ML = 'Läskopian och mellanarkivet > ';
const RS = 'Reservserver > ';
const GK = 'Gränssnitt > Klickbudget > ';

export const T15R3 = {
  overfor: `${MA}en avslutad ordination förs över med sina administreringar och sin historik, och finns inte kvar i den aktiva journalen`,
  aldrig: `${MA}en pågående eller aktuell ordination förs aldrig över, hur gammal den än är`,
  galler: `${MA}det som fortfarande gäller stannar i den aktiva journalen: uppmärksamhetsinformation, den senaste vidimeringen, svar från NLL och en plan för återinsättning`,
  senaste: `${MA}det senaste mätvärdet av varje typ stannar i den aktiva journalen, hur gammalt det än är`,
  lista: `${MA}läkemedelslistan visar avslutade ordinationer ur mellanarkivet märkta Ur mellanarkivet, och en roll utan läkemedel ser inga`,
  sparr: `${MA}en spärrad vårdenhets ordination syns inte, inte heller dess doser på en annan vårdenhet, och svaret är detsamma utan den`,
  las: `${MA}en ordination ur mellanarkivet öppnas med dosering, period, historik och doser, och läsningen loggas`,
  avvisa: `${MA}mellanarkivet avvisar en administrering vars ordination inte finns i paketet`,
  uppgradera: `${MA}en sandlåda från version 1.4 får tabellen uppgraderad med samma rader, och handlingarna skyddas som förut`,
  earkiv: `${MA}exporten till e-arkivet tar med handlingarna i mellanarkivet, med en post i indexet för varje`,
  gallring: `${MA}gallringsregeln räknar med det som finns i mellanarkivet, och för en ordination med när den sattes ut`,
  reservdator: `${MA}vårdenhetens reservdator tar inte med ordinationer ur mellanarkivet`,
  fhirSok: `${MF}sökningen på patient tar med handlingarna ur mellanarkivet märkta med meta.tag och meta.source, och läsningen på id loggas`,
  fhirSparr: `${MF}FHIR lämnar inte ut handlingar ur mellanarkivet från en spärrad vårdenhet, och en sådan resurs på id lämnas inte ut`,
  fhirSkyddad: `${MF}skyddad identitet: resurserna ur mellanarkivet bär inga personuppgifter och pekar på journalens id`,
  fhirRoll: `${MF}en roll utan läkemedel får inga ordinationer ur mellanarkivet, och undantag från FHIR gäller handlingarna där`,
  fhirAllt: `${MF}hela journalen ($everything) tar med handlingarna ur mellanarkivet`,
  kopiaInnehall: `${ML}läskopian har uppmärksamhetsinformationen, de aktuella läkemedlen och de senaste mätvärdena oavsett ålder, men inget ur mellanarkivet`,
  kopiaStorlek: `${ML}läskopian ryms inom sitt tak per patient och totalt, och den blir inte större av det som förs till mellanarkivet`,
  rsLaser: `${RS}reservservern läser den senaste verifierade säkerhetskopian och säger att den är en reservserver och hur gamla uppgifterna är`,
  rsLasEndast: `${RS}reservservern kan bara läsas: en registrering nekas med en förklaring, och journalens tabeller går inte att ändra`,
  rsLogg: `${RS}reservservern loggar all åtkomst som vanligt och skriver loggen till sin egen disk, och loggen läses in i kärnsystemet efteråt`,
  rsPlatser: `${RS}reservservern ändrar aldrig något på platserna för säkerhetskopiorna`,
  rsSkadad: `${RS}en skadad kopia på den första platsen läses från den andra, och utan någon kopia som håller startar reservservern inte`,
  rsDrift: `${RS}driften tar reservservern i drift med inställningen RESERVSERVER=1 och väljer sandlåda med nyckeln från sidan Säkerhetskopior`,
  kbOrdination: `${GK}Läsa en utsatt ordination ur mellanarkivet inom budget`,
};
const T = T15R3;
export const TESTER_MELLANARKIV = [T.overfor, T.aldrig, T.galler, T.senaste, T.lista, T.sparr, T.las, T.avvisa, T.uppgradera, T.earkiv, T.gallring, T.reservdator, T.kbOrdination];
export const TESTER_FHIR = [T.fhirSok, T.fhirSparr, T.fhirSkyddad, T.fhirRoll, T.fhirAllt];
export const TESTER_LASKOPIA = [T.kopiaInnehall, T.kopiaStorlek];
export const TESTER_RESERVSERVER = [T.rsLaser, T.rsLasEndast, T.rsLogg, T.rsPlatser, T.rsSkadad, T.rsDrift];

const RESERVSERVER = 'Runda 15: en fristående reservserver på en annan plats. Den är samma program som kärnsystemet, startat med inställningen RESERVSERVER=1 eller kommandot bun src/reservserver.js, och läser den senaste verifierade säkerhetskopian från platserna där kärnsystemet lägger sina kopior. Den kontrollerar kopian som vid en återställning och läser den från den andra platsen om den första är skadad, ändrar aldrig något där, kan bara läsas (varje registrering nekas med en förklaring och journalens tabeller har triggrar som stoppar en ändring), säger överst på varje sida och i varje svar att den är en reservserver och hur gamla uppgifterna är, och loggar varje läsning i åtkomstloggen som vanligt och till en fil på sin egen disk, som läses in i kärnsystemets logg när det är i drift igen. Hur driften tar den i drift står i docs/drift/kontinuitetsplan.md och docs/drift/aterstallning.md.';
const RESERVSERVER_EXPERT = 'Driften startar reservservern med en inställning. Systemet väljer själv den senaste kopian som håller, kontrollerar den och säger på vanlig svenska hur gamla uppgifterna är och vad man gör i stället för att registrera. Ingen behöver veta vilken kopia som är rätt eller komma ihåg att föra över loggen för hand.';
const RESERVSERVER_ANM = 'I demon prövas reservservern lokalt mot kopior som testerna skriver, och den publika demons drift är inte ändrad. Reservservern visar läget i kopian, högst femton minuter gammalt när kopiorna tas på schemat; det som registrerades efter kopian finns inte där. I driften ska reservservern stå i en annan datahall med egen ström och nät och läsa den andra platsen.';

// Hur posterna ändras. En text som slutar med + läggs till sist i den som finns.
export const POSTER = {
  '5.4.2.2': {
    tester: [...TESTER_MELLANARKIV, ...TESTER_FHIR, ...TESTER_LASKOPIA],
    losning: '+Runda 15: också avslutade ordinationer och administreringar förs över. En ordination förs över hela när den sattes ut eller slutade före gränsen, med sin historik, sina meddelanden till Nationella läkemedelslistan och alla sina doser, med kontrollen av patientens identitet, skanningen och kollegakontrollen som noter, så att en administrering aldrig finns utan sin ordination. Det som pågår eller gäller stannar alltid i den aktiva journalen: aktuella ordinationer, ordinationer som uppmärksamhetsinformationen, den senaste vidimeringen, en plan för återinsättning eller ett obesvarat meddelande till NLL pekar på, doser som är iordningsställda men inte registrerade, och det senaste mätvärdet av varje typ, hur gammalt det än är. Ordinationerna står i läkemedelslistan bland de utsatta och avslutade, i tidslinjen och i sökningen, märkta Ur mellanarkivet, med samma prövning som läkemedelslistan, och öppnas med dosering, period, historik och doser. FHIR-API:t lämnar ut handlingarna i mellanarkivet med samma behörighet och loggning som den aktiva journalen, med id ma-<nummer>, koden mellanarkiv i meta.tag (Vårdkällans kodsystem lagring) och paketet i meta.source. Exporten till e-arkivet tar med dem, och gallringsregeln räknar den sista uppgiften också ur mellanarkivet. Läskopian vid avbrott tar inte med det som har förts över.',
    expert: 'Den som arbetar i journalen och läkemedelslistan behöver inte veta att mellanarkivet finns: systemet visar handlingarna där de andra finns, märkta, och FHIR och e-arkivet tar med dem. Arkivarien registrerar bara beslutet, och systemet avgör självt vad som är avslutat och låter allt som pekar på något som gäller stanna i journalen.',
    anmarkning: 'Mellanarkivet är lokalt i demon och simulerat, och ingen koppling till ett verkligt mellanarkiv är gjord. Regeln är en regel i koden (fem år). Diagnoser, vårdkontakter och remisser stannar i den aktiva journalen, eftersom basfakta, vårdstrukturen och ekonomin använder dem. En ordination med uppgifter i tabeller som inte följer med (till exempel en trappning, en spädning eller en infusion i intensivvården) stannar i den aktiva journalen. Min journal visar inte handlingarna i mellanarkivet. I demon fördes Gunnar Åkessons äldre uppgifter ur VAS dit vid migreringen, också en kur med Alvedon från 2012 med doserna.',
  },
  '11.2.1.8': {
    tester: [...TESTER_LASKOPIA, ...TESTER_RESERVSERVER],
    losning: `+Läskopian har det som behövs vid ett avbrott oavsett hur gammalt det är: uppmärksamhetsinformationen, de aktuella läkemedlen och det senaste mätvärdet av varje typ, som aldrig förs till mellanarkivet. Det som har förts till mellanarkivet tas inte med, och läskopians storlek har ett tak per patient och totalt som testas. ${RESERVSERVER}`,
    expert: `+${RESERVSERVER_EXPERT}`,
    anmarkning: `+${RESERVSERVER_ANM}`,
  },
  'KD1.1.3.3': {
    tester: TESTER_RESERVSERVER,
    losning: `+${RESERVSERVER}`,
    expert: 'Systemet gör hela jämförelsen själv och säger vilken kontroll som inte höll och i vilken tabell. När kärnsystemet inte går att använda tar driften reservservern i drift med en inställning, och systemet väljer den senaste kopian som håller och säger hur gamla uppgifterna är.',
    anmarkning: `+${RESERVSERVER_ANM}`,
  },
  'KD1.1.3.6': {
    tester: TESTER_RESERVSERVER,
    losning: '+Runda 15: när kärnsystemet inte går att använda läser en fristående reservserver på en annan plats den senaste verifierade kopian, så att journalen kan läsas utan att något går förlorat, och åtkomsterna där loggas och läses in i kärnsystemets logg efteråt.',
    anmarkning: `+${RESERVSERVER_ANM}`,
  },
  'KD1.1.1.11': {
    tester: TESTER_RESERVSERVER,
    losning: '+Runda 15: kontinuitetsplanen beskriver också reservservern, som driften tar i drift med en inställning när kärnsystemet inte går att använda, och som säger på varje sida att den bara kan läsas och hur gamla uppgifterna är.',
  },
  'KD1.2.1.4': {
    tester: TESTER_RESERVSERVER,
    losning: '+Runda 15: reservservern är en redundans för läsning som driften kan ta i drift på en annan plats, ur den andra platsen för säkerhetskopiorna.',
    anmarkning: '+Reservservern ger läsning, inte full redundans: registreringar görs på papper och förs in när kärnsystemet är i drift igen.',
  },
};

// Kravregistrets egna krav (krav.js): läsåtkomsten vid avbrott och inlåsningen.
export const EGNA = {
  D4: [...TESTER_LASKOPIA, T.rsLaser, T.rsLasEndast, T.rsLogg],
  M12: [T.earkiv, T.fhirSok],
};

const lagg = (gammal, ny) => (typeof ny === 'string' && ny.startsWith('+') ? [gammal, ny.slice(1)].filter(Boolean).join(' ') : ny);
export const medR15r3 = (poster) => poster.map(x => {
  const p = POSTER[x.id];
  if (!p) return x;
  const { tester = [], ...ovrigt } = p;
  const ut = { ...x, tester: [...new Set([...(x.tester ?? []), ...tester])] };
  for (const [k, v] of Object.entries(ovrigt)) ut[k] = lagg(x[k], v);
  return ut;
});
