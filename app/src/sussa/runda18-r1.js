// Runda 18, r1: första passet i testinbjudan (forsta-pass.js, testinbjudan.js och public/js/forsta-pass.js). Testnamnen
// för servertesterna (app/test/forsta-pass.test.js) och testerna av gränssnittet (test/anvandartest.cjs), och tilläggen
// till posterna 8.4.1.1 till 8.4.1.3. Mappningsfilen för 8.4 lägger tilläggen härifrån ovanpå sina poster med medR18r1,
// så att ändringen ligger samlad här. Posterna förblir delvis uppfyllda tills riktiga testare har svarat.
const FP = 'Första passet > ';
const GP = 'Gränssnitt > Användartest > första passet: ';

export const T18R1 = {
  pass: `${FP}varje yrkesroll har ett pass med en uppgift ur sina egna uppdrag, en motivering, en klickbudget och vägledning med steg`,
  forst: `${FP}passet står först i uppdragen, och tiden räknas från att testaren har svarat på frågan om mätning`,
  nej: `${FP}utan samtycke mäts ingenting: ingen mätning tas emot, och jämförelsen sparas utan tid`,
  matning: `${FP}mätningen sparas med serverns tid och status, och svaret ger återkopplingen mot Sussas tidsklass och klickbudget`,
  prova: `${FP}mätningen prövas på servern: fel typ, för stora tal och okända steg ger 400, och okända fält sparas inte`,
  avbrutet: `${FP}ett avbrutet eller övergivet pass räknas som avbrutet, och ett klart pass tar inte emot fler mätningar`,
  inga: `${FP}inget som sparas innehåller patientens id, namn eller personnummer`,
  sus: `${FP}SUS efter passet är valfritt, poängen räknas på servern och svaret sparas en gång`,
  testledare: `${FP}testledaren ser per yrkesroll och uppgift antal pass, andel klarade, medianer mot budget, stegen där flest fastnar och SUS med medelvärde och spridning`,
  export: `${FP}exporten som CSV och Markdown och skriptets utskrift av det nya har passen och SUS`,
  krav: `${FP}kravsidans sammanfattning räknas ur databasen och visar bara antal och SUS-medelvärdet`,
  gallring: `${FP}passen och SUS gallras efter samma tid som synpunkterna, och taken gäller också dem`,
  vidare: `${FP}efter passet väljer testaren nästa uppdrag eller avslutar, och vägledningen följer inte med`,
};

// Tillägg 2026-11-19 (Jonas): bjud in andra och dela (inbjudan.js och public/js/inbjudan-regler.js).
const IB = 'Inbjudan > ';
export const T18R1IB = {
  skapa: `${IB}en inbjudan får en slumpad kod utan något om testaren, och taken per session och timme, per adress och totalt gäller`,
  besok: `${IB}ett besök via en inbjudan sparar bara kanalen, och en okänd kod eller kanal ger samma svar utan att något sparas`,
  pass: `${IB}ett genomfört pass räknas på besöket utan koppling till mätningen, svaren eller synpunkterna`,
  testledare: `${IB}testledaren ser bara antal per kanal och hur många som genomförde ett pass, och inbjudningarna gallras som synpunkterna`,
  text: `${IB}inbjudningstexten är neutral och delningslänkarna går till tjänsternas egna delningssidor med länken till testinbjudans startsida`,
};

// Testerna av gränssnittet i test/anvandartest.cjs. Ett test per yrkesroll gör passet med vägledningen.
export const PASSROLLER = ['lakare-sjukhus', 'lakare-primarvard', 'sjukskoterska', 'underskoterska', 'barnmorska', 'vardadministrator', 'fysioterapeut', 'systemforvaltare', 'patient'];
export const ROLLTEXT = {
  'lakare-sjukhus': 'läkaren på sjukhus', 'lakare-primarvard': 'läkaren i primärvården', sjukskoterska: 'sjuksköterskan', underskoterska: 'undersköterskan',
  barnmorska: 'barnmorskan', vardadministrator: 'vårdadministratören', fysioterapeut: 'fysioterapeuten', systemforvaltare: 'systemförvaltaren', patient: 'patienten i Min journal',
};
export const G18R1 = {
  samtycke: `${GP}frågan om mätning ställs en gång före passet, och med nej skickas ingen mätning`,
  roll: (id) => `${GP}${ROLLTEXT[id]} följer vägledningen genom hela uppgiften, och passet gör uppgiften inte dyrare än klickbudgeten`,
  annanVag: `${GP}vägledningen följer med när testaren tar en annan väg, kan stängas av och slås på igen och läses upp för skärmläsare`,
  aterkoppling: `${GP}återkopplingen visar tid och steg mot Sussas tidsklass och klickbudget, och SUS efter passet räknas på servern`,
  mobil: `${GP}vägledningen fungerar på 390 px och med tangentbordet, och markeringen skymmer inte det som ska klickas`,
  inga: `${GP}inget som skickas under passet innehåller patientens id, namn eller personnummer`,
  bjudIn: 'Gränssnitt > Användartest > inbjudan: testaren får en färdig text med länken, delningslänkarna öppnar tjänsternas delningssidor utan att något skickas, och en besökare via länken räknas per kanal',
};
const T = T18R1;
const G = G18R1;
const ALLA_G = [G.samtycke, ...PASSROLLER.map(G.roll), G.annanVag, G.aterkoppling, G.mobil, G.inga, G.bjudIn];

const MATT = 'Runda 18 (r1): varje yrkesroll i testinbjudan börjar med ett första pass på högst fem minuter: en patient och en uppgift som yrket gör varje dag, för personalen ur Sussas testfall (3.1, 4.1, 4.2, 5.1 och 2.6), med vägledning som pekar ut nästa steg i gränssnittet och följer det testaren gör. Före passet frågar systemet en gång om passet får mätas. Med ja mäts tiden till första handling, tiden per steg, återvändor, öppnad hjälp, sökningar och avbrutna pass, utan personuppgifter och utan något om demons patienter, och efter passet ser testaren sin tid mot Sussas tidsklass och sina steg mot klickbudgeten och kan svara på SUS. Testledaren ser per yrkesroll och uppgift antal pass, andel klarade, medianer mot budget, de steg där flest fastnar och SUS med medelvärde och spridning, och kravsidan visar antalet genomförda pass och SUS-medelvärdet ur databasen. Testaren kan bjuda in en kollega eller dela länken i sociala medier: systemet skickar aldrig något självt och sparar inga adresser, och länken har en slumpad kod som bara visar kanalen och om besökaren genomförde ett pass.';

const POSTER = {
  '8.4.1.1': {
    tester: [T.pass, T.matning, T.testledare, T.krav, ...PASSROLLER.map(G.roll), G.aterkoppling],
    anmarkning: `Processen är Vårdkällans egen: testfallen och klickbudgeten är automatiska. Runda 13 (r1) bjuder in personal som arbetar i Cosmic eller andra journalsystem: startsidan för testare ger uppdrag per yrke efter Sussas 34 testfall, som systemet bockar av på servern, och efter varje uppdrag svarar testaren om det var lättare, ungefär lika eller svårare än i sitt journalsystem. ${MATT} Inga svar från riktiga testare finns ännu när detta skrivs, så posten är delvis uppfylld tills de har svarat. Alla Sussas 34 testfall går att genomföra inom klickbudgeten, och resultatet står per testfall på kravsidan under K4. Tidsklassen per testfall är Vårdkällans bedömning, eftersom Sussa aldrig lämnade ut den. Tillgängligheten prövas bara delvis (tangentbord och 360 pixlars bredd i genomgången).`,
  },
  '8.4.1.2': {
    tester: [T.forst, T.nej, T.prova, T.avbrutet, T.inga, T.sus, T.export, T.gallring, T.vidare, G.samtycke, G.annanVag, G.inga, ...Object.values(T18R1IB), G.bjudIn],
    expert: 'Systemet räknar poängen för varje mätning och omvandlar dem till Sussas utvärderingspoäng, så att testledaren inte behöver kunna formlerna, och formulären sparar inga patientuppgifter. I testinbjudan bockar systemet av uppdragen själv, prövar svaret på frågeuppdragen mot Sussas rätta svar och fyller i vy, roll, uppdrag, version och webbläsare i varje synpunkt, så att testaren bara svarar på det som bara testaren vet. I första passet pekar systemet själv ut nästa steg, mäter var testaren fastnar utan att testaren behöver rapportera något och räknar SUS-poängen på servern.',
    anmarkning: `SUS och expertgranskning är underlag för riktiga användartester: inga testpersoner har fyllt i formulären än, och ingen användbarhetsexpert har granskat systemet. Runda 13 (r1): testinbjudan samlar jämförelser och synpunkter från personal i vården i en egen databas, utan namn och utan riktiga personnummer, och testledaren läser dem per uppdrag och journalsystem med en läskod som skapas på servern. ${MATT} Testarna väljer själva att vara med, så urvalet är inte representativt, och svaren är självskattade. Kartläggningen av användarna bygger på Sussas testfall, inte på egna intervjuer eller observationer. Skisser och prototyper i flera alternativ görs inte.`,
  },
  '8.4.1.3': {
    tester: [G.mobil, G.annanVag],
    anmarkning: 'De automatiska kontrollerna är skrivna i projektet, utan en extern tillgänglighetsmotor. Det som bara kan bedömas av människor, till exempel att rubriker och länktexter beskriver syftet och att språket är begripligt, är märkt så i redogörelsen och inte prövat med användare med funktionsnedsättning. Ingen granskning med skärmläsare är gjord. ISO 9241-11 följs genom användartestet med SUS (docs/anvandartest.md) och, från runda 18, SUS efter första passet i testinbjudan, som ännu inte är besvarat av vårdpersonal. Vägledningen i första passet läses upp för skärmläsare, flyttar fokus till nästa steg på begäran, fungerar på 390 px och stängs av med ett klick.',
  },
};

export const ALLA_TESTER = [...Object.values(T), ...Object.values(T18R1IB), ...ALLA_G];

// Lägger rundans tillägg ovanpå avsnittets poster. tester läggs till postens egna, och de andra fälten ersätter postens.
export const medR18r1 = (poster) => poster.map(x => {
  const p = Object.hasOwn(POSTER, x.id) ? POSTER[x.id] : null;
  if (!p) return x;
  const tidigare = x.tester ?? [];
  const { tester = [], ...rest } = p;
  return { ...x, ...rest, tester: [...tidigare, ...tester.filter(t => !tidigare.includes(t))] };
});
