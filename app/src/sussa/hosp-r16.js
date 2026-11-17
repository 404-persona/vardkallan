// HOSP: legitimationen och förskrivningsrätten ur Socialstyrelsens register (hosp.js och app/test/hosp-r16.test.js).
// Mappningsfilerna för 2.2, 3.5.4 och 5.2 lägger till dessa tester och texter i sina poster, så att ändringen ligger
// samlad här. Ärlighetsregeln gäller: HOSP-tjänsten är simulerad och kontraktet är inte anslutet.
const H = 'HOSP, legitimation och förskrivningsrätt > ';
export const THOSP = {
  kontrakt: `${H}kontrakten GetHospPersonForPublicHealthCare, GetHospPersonForIvo och ProcessActivityOrder läses ur sina WSDL och schemana valideras`,
  simulerad: `${H}den simulerade HOSP-tjänsten ger legitimationen för demopersonalen, och anropet loggas utan personnummer`,
  avvikelser: `${H}avvikelserna i demon: begränsad förskrivningsrätt, sjuksköterska utan förskrivningsrätt och återkallad legitimation`,
  narkotika: `${H}en läkare med begränsad förskrivningsrätt ordinerar inte narkotiska läkemedel, i något flöde, och systemet säger varför`,
  forbrukning: `${H}den fasta regeln ger inte längre förskrivningsrätt för förbrukningsartiklar till en sjuksköterska som saknar den i HOSP`,
  preventivmedel: `${H}barnmorskans förskrivning av preventivmedel kräver förskrivningsrätt som barnmorska i HOSP`,
  aterkallad: `${H}en återkallad legitimation tar bort handlingarna som kräver den och stoppar inloggningen`,
  regel: `${H}regeln: uppgifterna hämtas om vid inloggning och förskrivning när de är äldre än ett dygn`,
  nere: `${H}svarar tjänsten inte gäller de senast hämtade uppgifterna, och det syns för systemförvaltningen`,
  roll: `${H}när systemförvaltningen ger någon en roll som kräver legitimation hämtar systemet uppgifterna och säger om den saknas`,
  synlighet: `${H}bara systemförvaltningen och personen själv ser uppgifterna ur HOSP`,
  plattform: `${H}anropet till HOSP går genom den lokala tjänsteplattformen med ömsesidig TLS`,
};
const T = THOSP;
const INTE_ANSLUTET = 'GetHospPersonForPublicHealthCare 1.1 är byggt och validerat mot tjänstekontraktet och testat lokalt genom tjänsteplattformen, men inte anslutet till den nationella tjänsteplattformen (kräver avtal med Inera och SITHS-funktionscertifikat). HOSP-tjänsten är simulerad med påhittade uppgifter, och personalens personnummer kommer i demon från den simulerade HSA-katalogen.';

const TILLAGG = {
  '2.2.1.1': {
    tester: [T.kontrakt, T.simulerad, T.roll, T.nere, T.plattform],
    losning: 'Vårdkällan är också konsument av HOSP med GetHospPersonForPublicHealthCare 1.1 (riv.masterdata.organisationalresources.licensetopractice), eftersom HOSP är master för legitimationen i personalinformationen i HSA. Legitimationen, förskrivningsrätten och behörighetsbegränsningarna hämtas när någon får en roll som kräver legitimation, vid inloggning och före en förskrivning när de är äldre än ett dygn.',
    expert: 'Systemet hämtar legitimationen ur HOSP själv när personalkatalogen ger någon en roll som kräver den, och säger på vanlig svenska om den saknas eller är återkallad. Svarar tjänsten inte gäller de senast hämtade uppgifterna, och systemförvaltaren ser det.',
    anmarkning: INTE_ANSLUTET,
  },
  '5.2.1.8': {
    tester: [T.aterkallad, T.roll, T.synlighet, T.narkotika, T.forbrukning],
    losning: 'Legitimationen och förskrivningsrätten för personalen hämtas ur Socialstyrelsens register (HOSP) i stället för att administreras: en saknad eller återkallad legitimation tar bort rollens handlingar och stoppar inloggningen, och förskrivningsrätten och behörighetsbegränsningarna styr förskrivningen.',
    ersatt: 'Vårdrelationen räknas ut ur inskrivning, listning och remiss, och legitimationen och förskrivningsrätten hämtas ur Socialstyrelsens register, så ingen administratör behöver lägga upp eller ta bort åtkomst för hand. Systemet förklarar varför något inte går och visar systemförvaltaren vem som saknar giltig legitimation.',
    anmarkning: `${INTE_ANSLUTET} Behörighetsbegränsningar som systemet inte kan tolka (allt utom narkotika) stoppar förskrivningen helt och hänvisar till systemförvaltningen.`,
  },
  '3.5.4.2': {
    tester: [T.forbrukning],
    losning: 'Förskrivningsrätten för förbrukningsartiklar kommer ur Socialstyrelsens register (HOSP) och inte ur yrket: en sjuksköterska utan förskrivningsrätt i registret förskriver inte.',
    ersatt: 'Systemet prövar förskrivningsrätten i Socialstyrelsens register, fyller i mängd, uttag, anvisning, giltighet och uppföljning och stoppar en dubbelförskrivning med förslag om förnyelse. Det kräver en orsak när en artikel sätts ut eller in igen och säger varför förskrivningen inte går när förskrivningsrätten saknas.',
    anmarkning: 'Förskrivningsrätten hämtas ur den simulerade HOSP-tjänsten.',
  },
  '3.5.4.4': {
    tester: [T.forbrukning],
    losning: 'Bara den som har förskrivningsrätt enligt Socialstyrelsens register (HOSP) får förslagen och kan förskriva.',
    expert: 'Förskrivningsrätten prövar systemet själv i Socialstyrelsens register innan något erbjuds.',
    anmarkning: 'Förskrivningsrätten hämtas ur den simulerade HOSP-tjänsten.',
  },
};

// expert är en till två meningar (test/sussa.test.js): ersatt ersätter texten, annars läggs expert till.
const fog = (a, b) => [a, b].filter(Boolean).join(' ');
export const medHosp = (poster) => poster.map(x => {
  const t = TILLAGG[x.id];
  if (!t) return x;
  const tidigare = x.tester ?? [];
  return { ...x, tester: [...tidigare, ...t.tester.filter(n => !tidigare.includes(n))], losning: fog(x.losning, t.losning), expert: t.ersatt ?? fog(x.expert, t.expert), anmarkning: fog(x.anmarkning, t.anmarkning) };
});
