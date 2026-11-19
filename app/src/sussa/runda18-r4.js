// Runda 18, r4: rättelser av texter på kravsidan som hade blivit inaktuella när funktionerna byggdes i senare versioner.
// Varje rättelse byter en exakt mening i en posts lösning, expertroll eller anmärkning mot en mening som stämmer med
// koden i version 1.8. Testet i app/test/textgranskning.test.js stoppar bygget om en rättelse inte längre hittar sin
// mening (då har någon annan ändrat texten, och rättelsen ska prövas igen).
export const RATTELSER = [
  // Utkast till anteckningar sparas under ett avbrott sedan version 1.5 (anteckningsutkast.js, skrivko.js).
  { ids: ['2.3.1.4'], falt: 'anmarkning',
    fore: 'Under avbrottet går bara givna doser och mätvärden att registrera, vilket är den beslutade avgränsningen (beslut 2026-11-08). Annat skrivande, som anteckningar och ordinationer, väntar tills förbindelsen är tillbaka, eftersom det behöver en aktuell journal.',
    efter: 'Under avbrottet går det att registrera givna doser och mätvärden, vilket är den beslutade avgränsningen (beslut 2026-11-08), och sedan version 1.5 att skriva utkast till anteckningar. De sparas krypterat i webbläsaren och förs till journalen när förbindelsen är tillbaka. Att signera, ordinera och annat skrivande väntar tills förbindelsen är tillbaka, eftersom det behöver en aktuell journal.' },
  // E-remiss från en vårdgivare utanför Vårdkällan tas emot sedan version 1.4 (eremiss.js).
  { ids: ['3.3.1.3'], falt: 'anmarkning',
    fore: 'Remisser från vårdgivare utanför Vårdkällan finns bara som registrerade pappersremisser (3.3.1.2).',
    efter: 'Remisser från vårdgivare utanför Vårdkällan kommer som e-remiss från den simulerade motparten eller registreras som pappersremisser (3.3.1.2).' },
  // Jämförelsen med folkbokföringen i PU-tjänsten finns sedan version 1.4 (rivta/register.js), men namnet hämtas inte
  // när en patient registreras (identitet.js).
  { ids: ['3.1.1.1', '3.1.1.3'], falt: 'anmarkning',
    fore: 'Det finns ingen koppling till folkbokföringen (PU-tjänsten), så namnet skrivs in för hand och ett samordningsnummers giltighet kontrolleras inte hos Skatteverket.',
    efter: 'Namnet hämtas inte ur folkbokföringen när en patient registreras utan skrivs in för hand, och ett samordningsnummers giltighet kontrolleras inte hos Skatteverket. Namnet och adressen kan sedan jämföras med folkbokföringen i den simulerade PU-tjänsten (2.2.1.2).' },
  // Parametrarna är fler än femton sedan runda 8, och journalen har fler än sex mallar (konfiguration.js parametrar).
  { ids: ['12.1.1.3', '12.1.1.5', '12.1.1.6'], falt: 'anmarkning',
    fore: 'I demon finns femton parametrar: larmgränserna för mottagningskvittens och kvittens av remissvar, dosfönstret före och efter dostiden, påminnelsen innan en delegering går ut, påminnelsen före en bokad tid, antalet åtkomster i ett stickprov, åren innan gallring föreslås, förslaget att avsluta ett hälsoärende och sökorden i journalens sex mallar.',
    efter: 'Bland parametrarna finns larmgränserna för mottagningskvittens och kvittens av remissvar, dosfönstret före och efter dostiden, påminnelsen innan en delegering går ut, påminnelsen före en bokad tid, antalet åtkomster i ett stickprov, åren innan gallring föreslås, förslaget att avsluta ett hälsoärende, sökorden i journalens mallar, mallarna för varje yrke, paketen i beställning och svar, läkemedelsvarningarnas interaktioner och maxdoser och de diagnoser som får föras till mellanarkivet. Sidan Regler och parametrar visar alla med sitt gällande värde.' },
  // Läkemedelsmallar för en substans byggs och ändras i gränssnittet sedan version 1.2 (lakemedelsmallar-ui.js).
  { ids: ['3.5.1.3'], falt: 'anmarkning',
    fore: 'En mall fastställs av en läkare (Gröna häftet 688488 R5 avsnitt 1.4.3), i demon med API:t, och det finns inget eget gränssnitt för att bygga en mall.',
    efter: 'En mall fastställs av en läkare (Gröna häftet 688488 R5 avsnitt 1.4.3). En mall för en substans byggs och ändras under Direktiv och uppföljning, och en mall med flera ordinationer i demon med API:t.' },
  { ids: ['3.5.1.3'], falt: 'anmarkning',
    fore: 'Ett gränssnitt för att bygga eller ändra en mall saknas, liksom farmaceutens förvaltning av mallarna (mallförvaltare på Läkemedelscentrum).',
    efter: 'Farmaceutens förvaltning av mallarna (mallförvaltare på Läkemedelscentrum) finns inte.' },
];

// Byter meningarna i mappningen. Ger tillbaka de rättelser som inte hittade sin mening, för testet.
export function rattaTexter(mappning) {
  const missade = [];
  for (const r of RATTELSER) {
    for (const id of r.ids) {
      const m = mappning.find(x => x.id === id);
      if (!m || typeof m[r.falt] !== 'string' || !m[r.falt].includes(r.fore)) { missade.push(`${id} ${r.falt}: ${r.fore}`); continue; }
      m[r.falt] = m[r.falt].replace(r.fore, r.efter);
    }
  }
  return missade;
}

// Testerna som visar att texterna på de publika sidorna granskas vid varje version (vårt D7, små releaser).
const TG = 'Textgranskning > ';
export const TESTER_TEXTGRANSKNING = [
  `${TG}varje post i kända begränsningar är granskad i den aktuella versionen`,
  `${TG}alla handskrivna texter på de fyra sidorna är granskade i den aktuella versionen och oförändrade sedan dess`,
  `${TG}handskrivna tal i de fyra sidornas texter stämmer med källan, och ett okänt tal stoppar bygget`,
];
export const TEXTGRANSKNING_ANM = 'Från version 1.8 är granskningen av texterna på de publika sidorna #/testa, #/om, #/krav och #/moduler ett steg i varje ny version (docs/testmetod.md): bygget stoppas när en känd begränsning eller en källa med handskrivna texter inte är granskad i versionen, när en text har ändrats sedan granskningen och när ett tal i texterna skiljer sig från det som koden räknar fram.';
