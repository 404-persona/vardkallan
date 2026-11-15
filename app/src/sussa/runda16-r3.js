// Runda 16, r3: de nya yrkesrollerna, barnmorskan som egen roll, skötaren och studenterna under handledning. Testnamnen
// för servertesterna (app/test/roller-r16r3.test.js) och tilläggen till posterna i Sussa 3.1.3, 3.1.11, 4.7, 5.2 och
// 12.1. Mappningsfilerna lägger tilläggen härifrån ovanpå sina egna poster med medR16r3, så att ändringen ligger samlad här.
const R = 'Runda 16, r3: rollerna i behörighetsmotorn > ';
const L = 'Runda 16, r3: legitimationen vid inloggning genom en extern tjänst > ';
const D = 'Runda 16, r3: demopersonalen och sandlådan > ';
const M = 'Runda 16, r3: yrkenas mallar > ';
const S = 'Runda 16, r3: studenterna under handledning > ';
const B = 'Runda 16, r3: barnmorskan > ';

export const T = {
  roller: `${R}de nya rollerna finns, har utbildningen och har aldrig ordination, nödåtkomst eller läkarens journalskrivning`,
  barnmorska: `${R}barnmorskan har allt som sjuksköterskan har utom barnhälsovården, och förskriver preventivmedel men ordinerar inte`,
  studentRoller: `${R}studenterna läser det som yrket behöver, skriver bara under handledning och ger, ordinerar och signerar aldrig intyg`,
  skotare: `${R}skötaren på psykiatrin är undersköterska med titeln skötare och har inget mer än undersköterskan`,
  koder: `${L}varje legitimerad roll kräver koden ur Ineras kodverk, och barnmorskan kräver BM`,
  utanLeg: `${L}den som saknar legitimationen för yrket får inte rollen, och en sjuksköterskelegitimation ger inte barnmorskans roll`,
  demo: `${D}den nya personalen finns på rimliga vårdenheter, går att logga in som, och en ny sandlåda fungerar`,
  aldre: `${D}en sandlåda från före runda 16 får den nya personalen, barnmorskans roll och handledningarna, en gång`,
  ovningar: `${D}varje ny roll har minst tre övningar och en analys av behov och risker`,
  mallar: `${M}psykologen, logopeden och barnmorskan har egna mallar, och varje sökord har en Snomed-kod eller en förklaring`,
  sekretess: `${M}kuratorns och psykologens anteckningar följer reglerna för vårdenhet och spärr: andra vårdenheter ser dem bara efter ett aktivt val`,
  signera: `${S}studenten skriver och signerar under handledning, och anteckningen går till handledaren för kontrasignering`,
  aldrig: `${S}studenten ordinerar inte, ger inga läkemedel, registrerar inga mätvärden och använder inte nödåtkomst`,
  tid: `${S}åtkomsten följer handledningens tid och handledarens vårdenhet, och stängs när något inte går att avgöra`,
  registrera: `${S}handledaren registrerar och avslutar en handledning för en student på sin vårdenhet, och bara rätt yrke handleder`,
  bmStudent: `${S}barnmorskestudenten läser graviditetsjournalen på förlossningen men för den inte`,
  utanHandledning: `${S}en student utan pågående handledning ser inga patienter i arbetslistan, sökningen eller inkorgen, men når övningarna och handledningen`,
  sidor: `${B}barnmorskan på förlossningen har förlossningens och mödrahälsovårdens sidor som förut, och barnmorskan på vårdcentralen mödrahälsovården`,
  forskriv: `${B}barnmorskan förskriver preventivmedel, och systemet fyller i orsak, dosering och uppföljning`,
  inteAnnat: `${B}barnmorskan förskriver inget annat läkemedel och ordinerar inte, och sjuksköterskan förskriver inte preventivmedel`,
};
export const TESTER_ROLLER = [T.roller, T.barnmorska, T.studentRoller, T.skotare, T.demo, T.aldre, T.ovningar];
export const TESTER_STUDENT = [T.signera, T.aldrig, T.tid, T.registrera, T.bmStudent, T.utanHandledning];

const ROLLER_LOSNING = 'Sedan runda 16 har varje yrke en egen roll med minsta åtkomst: arbetsterapeut, dietist, logoped, hälso- och sjukvårdskurator och psykolog (psykoterapeuten är en titel inom rollen) skriver med sitt yrkes mall, och barnmorskan är en egen roll med egen legitimation. Skötaren i psykiatrin är undersköterska med titeln skötare, eftersom skötare varken är ett yrke med legitimation eller en skyddad titel och arbetet är detsamma. Läkarstudenter, sjuksköterskestudenter och barnmorskestudenter dokumenterar under en namngiven handledare, och handledaren kontrasignerar det de signerar.';

// Tilläggen per post. tester läggs till postens egna, och text läggs till efter postens text. expertErsatt ersätter
// postens text om systemets expertroll.
const POSTER = {
  '3.1.3.5': {
    tester: [T.mallar, T.sekretess, T.signera],
    losning: ' Sedan runda 16 har psykologen, logopeden och barnmorskan egna mallar, och arbetsterapeuten, dietisten och kuratorn skriver med sina mallar i egna roller. En student skriver med yrkets mallar under handledning.',
  },
  '3.1.11.3': {
    tester: [T.signera],
    losning: ' Sedan runda 16 kontrasignerar handledaren det som en student har signerat: systemet skickar anteckningen till handledaren när studenten signerar, och anteckningen är märkt med handledaren och om den är kontrasignerad.',
  },
  '4.7.1.2': {
    tester: [T.barnmorska, T.sidor, T.forskriv, T.inteAnnat, T.bmStudent],
    losning: ' Sedan runda 16 är barnmorskan en egen roll med egen legitimation. Hon gör allt som förut på mödrahälsovården och förlossningen och förskriver preventivmedel på barnmorskemottagningen, där systemet bara visar de läkemedel som förskrivningsrätten omfattar.',
  },
  '5.2.1.6': {
    tester: [T.koder, T.utanLeg, T.tid, T.utanHandledning],
    anmarkning: ' Sedan runda 16 kräver inloggningen genom en extern tjänst legitimationen för varje roll ur Ineras kodverk för legitimerad yrkesgrupp, och en students åtkomst prövas mot handledningen vid varje anrop.',
  },
  '5.2.1.8': {
    tester: [...TESTER_ROLLER, T.koder, T.utanLeg, T.registrera],
    losning: ` ${ROLLER_LOSNING}`,
    expertErsatt: 'Rollen följer yrket i katalogen och legitimationen i biljetten, och en students åtkomst följer handledningen och handledarens vårdenhet, så att ingen behöver lägga upp eller ta bort behörighet för hand. Handledaren registrerar handledningen med ett klick, och systemet föreslår tiden.',
  },
  '12.1.1.7': {
    tester: [T.mallar],
    anmarkning: ' Sedan runda 16 har också psykologen, logopeden, barnmorskan och studenterna en parameter för sina mallar.',
  },
};

// Lägger rundans tillägg ovanpå avsnittets poster: tester läggs till postens egna, och texterna läggs till efter postens.
export const medR16r3 = (poster) => poster.map(x => {
  const p = POSTER[x.id];
  if (!p) return x;
  const ut = { ...x, tester: [...new Set([...x.tester, ...(p.tester ?? [])])] };
  for (const f of ['losning', 'anmarkning']) if (p[f]) ut[f] = `${x[f] ?? ''}${p[f]}`.trim();
  // Systemets expertroll är en till två meningar, så den ersätts i stället för att förlängas.
  if (p.expertErsatt) ut.expert = p.expertErsatt;
  return ut;
});
