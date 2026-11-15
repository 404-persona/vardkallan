// Runda 16, r2: stödet vid sjukskrivning. Testnamnen (app/test/sjukfall-r16.test.js, fmb-r16.test.js,
// sjukfall-api-r16.test.js och klickbudgeten) och tilläggen till de poster i Sussa 3.2.1 och 3.4.1 som stödet berör.
// Mappningsfilerna lägger till dem med medR16r2, så att ändringen ligger samlad här. Tilläggen ändrar inte postens
// avsedda status: Socialstyrelsens data är ett utdrag ur det öppna API:t och intygen kommer från den simulerade
// intygsapplikationen.
import { klickbudgetTest } from '../krav.js';
import { FLODEN } from '../klickbudget.js';

const SJ = 'Stödet vid sjukskrivning > Sjukfall > ';
const API = 'Stödet vid sjukskrivning i API:t > Sjukfall > ';
const FMB = 'Försäkringsmedicinskt beslutsstöd > FMB > ';
const RK = 'Rehabkoordinatorn > Rehabkoordinatorn > ';
const flode = (id) => klickbudgetTest(FLODEN.find(f => f.id === id));

export const T16R2 = {
  regel: `${SJ}intyg med högst 5 dagars uppehåll hör till samma sjukfall, och dagar mellan intygen räknas inte`,
  kedjan: `${SJ}rehabiliteringskedjan: systemet säger när patienten närmar sig dag 90, 180 och 365`,
  status: `${SJ}det signerade sjukintyget ger journalen perioden, graden, diagnosen och sysselsättningen genom statusuppdateringen`,
  varning: `${SJ}beslutsstödet varnar när den sammanlagda sjukskrivningen blir längre än Socialstyrelsens rekommendation, med de tidigare intygen`,
  motivering: `${SJ}motiveringen skrivs en gång i fråga 37, följer med i intyget och i förlängningen`,
  forlang: `${SJ}förlängningen förnyar med ett klick förra intyget, och beslutsstödet föreslår perioden från dagen efter`,
  sparr: `${SJ}ett intyg på en spärrad vårdenhet räknas inte och röjs inte i dagar, summa eller varning, och räknas in med samtycke`,
  aktivtVal: `${SJ}ett intyg från en annan vårdenhet räknas in först efter ett aktivt val`,
  mina: `${SJ}läkarens översikt visar de pågående sjukfall där läkaren har signerat det nuvarande intyget, och loggar varje patient`,
  enhet: `${SJ}vårdenhetens översikt för verksamhetschefen visar antal utan patientuppgifter, och små antal döljs`,
  smaAntal: `${SJ}vårdenhetens översikt röjer inga små antal genom skillnaden mot totalen, och alla diagnoskapitel visas`,
  logg: `${SJ}beslutsstödet loggar läsningen av sjukintygen med den grund som användes, också ett aktivt val`,
  signerare: `${SJ}sjukskrivningen hör till läkaren som signerade intyget, också när vårdadministratören skapade utkastet`,
  nivaer: `${SJ}fråga 32 har en period per sjukskrivningsnivå, högst fyra, som i FK 7804`,
  demo: `${SJ}demon har sjukfall för läkaren på vårdcentralen: nära dag 90 och längre än rekommendationen, nära dag 180 och en skyddad patient`,
  svar: `${SJ}svaren om sjukskrivningen byggs och läses i kontraktets form, och ett felaktigt svar ger ingen period`,
  period: `${SJ}en period med orimligt långt intervall avvisas med en förklaring, och ett stort intervall i databasen räknas snabbt`,
  api: `${API}API: läkaren signerar ett sjukintyg, ser sjukfallet och beslutsstödet, motiverar och förlänger med ett klick`,
  apiEnhet: `${API}API: verksamhetschefen ser vårdenhetens sjukfall som antal, och läkaren gör det inte`,
  fmbDiagnos: `${FMB}diagnosen ger diagnosrubriken, funktionsnedsättningar, aktivitetsbegränsningar och typfall ur Socialstyrelsens data`,
  fmbTid: `${FMB}den längsta rekommenderade tiden är den längsta i typfallen, omräknad till dagar som i Webcert`,
  fmbUtdrag: `${FMB}utdraget ur det öppna API:t tar med alla giltiga typfall och gör HTML till vanlig text utan tankstreck`,
  // Runda 16: rehabkoordinatorn (app/test/rehabkoordinator-r16.test.js).
  rkRoll: `${RK}rollen har minsta åtkomst: sjukfallen och REKO-status, ingen journal, inga intyg, inga läkemedel, ingen nödåtkomst och inga andra vårdenheter`,
  rkSok: `${RK}tabellen är tom tills koordinatorn söker, och sökningen visar och loggar bara det Rehabstöd visar för rollen`,
  rkSamtycke: `${RK}koordineringsinsatser ges bara med patientens samtycke (lagen (2019:1297) 3 §): Aktiv och Uppföljning kräver ett bekräftat samtycke`,
  rkLakare: `${RK}läkaren ser REKO-statusen i sin översikt och på fliken Sjukskrivning men kan inte sätta den, och andra roller når inte listan`,
  rkApi: 'Stödet vid sjukskrivning i API:t > Rehabkoordinatorn > API: koordinatorn söker fram sjukfallen, sätter REKO-status med samtycke, och läkaren ser statusen',
};
const T = T16R2;
export const TESTER_R16R2 = Object.values(T);
export const forlangFlode = () => flode('forlang-sjukskrivning');

const FMB_LOSNING = ' Runda 16: när läkaren skriver ett sjukintyg visar systemet Socialstyrelsens försäkringsmedicinska beslutsstöd (FMB) för diagnosen: diagnosrubriken, typiska funktionsnedsättningar och aktivitetsbegränsningar och typfallen med rekommenderad sjukskrivningstid. Systemet räknar den sammanlagda sjukskrivningen ur patientens tidigare intyg och varnar när den blir längre än rekommendationen, och läkarens motivering följer med i intyget och i förlängningar.';
const FMB_ANM = ' FMB är ett utdrag ur Socialstyrelsens öppna API (villkor CC0) som byggs med scripts/fmb-hamta.js; det hämtas inte i drift och uppdateras inte av sig självt.';

const TILLAGG = {
  '3.2.1.1': {
    tester: [T.fmbDiagnos, T.fmbTid, T.varning, T.motivering, T.sparr, T.period],
    losning: FMB_LOSNING,
    anmarkning: `${FMB_ANM} Systemet hämtar rekommendationen för diagnosen själv, så läkaren behöver inte söka i beslutsstödet.`,
  },
  '3.2.1.2': {
    tester: [T.varning, T.motivering, T.api, T.logg, T.nivaer],
    losning: ' Runda 16: Socialstyrelsens försäkringsmedicinska beslutsstöd är integrerat i sjukintyget i intygsapplikationen och i patientens flik Sjukskrivning, och varningen följer perioden och nivån som läkaren väljer innan något är sparat.',
    anmarkning: `${FMB_ANM}`,
  },
  '3.2.1.3': {
    tester: [T.fmbDiagnos, T.varning, T.kedjan],
    losning: ' Runda 16: ett kunskapsbaserat stöd vid sjukskrivning (trappsteg 2) med nationell kunskap: Socialstyrelsens rekommenderade sjukskrivningstid jämförs med sjukfallet som systemet räknar ur intygen, och rehabiliteringskedjans gränser visas.',
    anmarkning: `${FMB_ANM} Bedömningen enligt MDR finns i docs/mdr-bedomning.md.`,
  },
  '3.4.1.3': {
    tester: [T.mina, T.enhet, T.kedjan, T.demo, T.apiEnhet, T.smaAntal, T.signerare, T.rkRoll, T.rkSok, T.rkSamtycke, T.rkLakare, T.rkApi],
    losning: ' Runda 16: sjukskrivningarna bevakas på individnivå (läkarens pågående sjukfall med intyg som snart går ut, gränser i rehabiliteringskedjan och sjukfall som är längre än rekommendationen) och på enhetsnivå (vårdenhetens sjukfall som antal för verksamhetschefen).',
    anmarkning: ' Systemet räknar bevakningarna ur intygen själv, och ingen behöver lägga upp en påminnelse om dag 90, 180 eller 365. Rehabkoordinatorn ser vårdenhetens pågående sjukfall och sätter REKO-status per sjukfall, med patientens samtycke till koordineringsinsatser, och läkaren ser statusen.',
  },
  '3.4.1.8': {
    tester: [T.mina, T.demo, T.forlang],
    losning: ' Runda 16: läkarens lista över pågående sjukfall har det som behöver ses över först, och varje rad leder till patientens sjukskrivning, där förlängningen görs med ett klick.',
    anmarkning: '',
  },
};

// Lägger till runda 16:s tester och texter i posterna. Avsedd status, kategori och expert ändras inte.
export const medR16r2 = (poster) => poster.map(p => {
  const t = TILLAGG[p.id];
  if (!t) return p;
  const tester = [...t.tester, ...(p.id === '3.4.1.8' ? [forlangFlode()] : [])];
  return {
    ...p,
    tester: [...(p.tester ?? []), ...tester.filter(x => !(p.tester ?? []).includes(x))],
    losning: `${p.losning ?? ''}${t.losning}`,
    anmarkning: `${p.anmarkning ?? ''}${t.anmarkning}`,
  };
});
