// Runda 15, r5 (F7, Sussa 5.1.1.3 och 3.1.7.1): läkemedel som ökar risken för fall, räknade ur läkemedelslistan.
//
// Källa: Socialstyrelsen, Indikatorer för god läkemedelsterapi hos äldre (artikelnummer 2017-6-7), tabell 4
// Läkemedel/läkemedelsgrupper som ökar risken för fall, med tabell 3 (läkemedel som kan orsaka eller förvärra
// ortostatism) och bilaga 1 (läkemedelsgrupper med betydande antikolinerga effekter), som tabell 4 hänvisar till.
// Hämtad 2026-11-14 från socialstyrelsen.se, sha256 4c44df21c8cc603c04bbf2601adb2a3b20882ab6791bfa83321c616c96ac8c63
// (docs/kodkontroll.md). Listan är myndighetens. Hur formuläret använder antalet (poängen i fallriskbedömningen) är
// Vårdkällans demoregel.
//
// Systemet räknar varje aktuell ordination en gång, också när läkemedlet hör till flera grupper.
export const KALLA = 'Socialstyrelsen, Indikatorer för god läkemedelsterapi hos äldre (2017-6-7), tabell 4 med tabell 3 och bilaga 1';

// Grupperna med ATC-kod eller början av en ATC-kod, och undantagen inom gruppen.
export const GRUPPER = [
  // Tabell 4.
  { atc: 'N02A', text: 'Opioider', tabell: '4' },
  { atc: 'N05A', utom: ['N05AN'], text: 'Antipsykotiska läkemedel', tabell: '4' },
  { atc: 'N05B', text: 'Lugnande medel, ataraktika', tabell: '4' },
  { atc: 'N05C', text: 'Sömnmedel och lugnande medel', tabell: '4' },
  { atc: 'N06A', text: 'Antidepressiva medel', tabell: '4' },
  // Tabell 3, läkemedel som kan orsaka ortostatism eller blodtrycksfall.
  { atc: 'C01D', text: 'Kärlvidgande medel för hjärtsjukdomar (nitrater)', tabell: '3' },
  { atc: 'C02', text: 'Antihypertensiva medel', tabell: '3' },
  { atc: 'C03', text: 'Diuretika', tabell: '3' },
  { atc: 'C07', text: 'Beta-receptorblockerande medel', tabell: '3' },
  { atc: 'C08', text: 'Kalciumantagonister', tabell: '3' },
  { atc: 'C09', text: 'Medel som påverkar renin-angiotensinsystemet', tabell: '3' },
  { atc: 'G04CA', text: 'Medel vid benign prostatahyperplasi, alfa-1-receptorblockerande medel', tabell: '3' },
  { atc: 'N04B', text: 'Medel vid parkinsonism, dopaminerga medel', tabell: '3' },
  // Bilaga 1, läkemedel med betydande antikolinerga effekter.
  { atc: 'A03AB', text: 'Medel vid funktionella tarmsymtom, antikolinerga', tabell: 'bilaga 1' },
  { atc: 'A03BA', text: 'Medel vid funktionella tarmsymtom, antikolinerga', tabell: 'bilaga 1' },
  { atc: 'A03BB', text: 'Medel vid funktionella tarmsymtom, antikolinerga', tabell: 'bilaga 1' },
  { atc: 'A04AD', text: 'Antiemetika, antikolinerga', tabell: 'bilaga 1' },
  { atc: 'C01BA', text: 'Antiarytmika, vissa', tabell: 'bilaga 1' },
  { atc: 'G04BD', utom: ['G04BD12'], text: 'Medel mot inkontinens', tabell: 'bilaga 1' },
  { atc: 'M03BC01', text: 'Muskelavslappande medel, övriga centralt verkande', tabell: 'bilaga 1' },
  { atc: 'M03BC51', text: 'Muskelavslappande medel, övriga centralt verkande', tabell: 'bilaga 1' },
  { atc: 'N02AG', text: 'Opioider i kombination med spasmolytika', tabell: 'bilaga 1' },
  { atc: 'N04A', text: 'Medel vid parkinsonism, antikolinerga', tabell: 'bilaga 1' },
  { atc: 'N05AA02', text: 'Vissa antipsykotiska läkemedel', tabell: 'bilaga 1' },
  { atc: 'N05AB04', text: 'Vissa antipsykotiska läkemedel', tabell: 'bilaga 1' },
  { atc: 'N05AF03', text: 'Vissa antipsykotiska läkemedel', tabell: 'bilaga 1' },
  { atc: 'N05AH02', text: 'Vissa antipsykotiska läkemedel', tabell: 'bilaga 1' },
  { atc: 'N05BB01', text: 'Vissa lugnande medel', tabell: 'bilaga 1' },
  { atc: 'N06AA', text: 'Antidepressiva, icke-selektiva monoaminåterupptagshämmare', tabell: 'bilaga 1' },
  { atc: 'R06AA02', text: 'Antihistaminer, vissa (första generationen)', tabell: 'bilaga 1' },
  { atc: 'R06AA04', text: 'Antihistaminer, vissa (första generationen)', tabell: 'bilaga 1' },
  { atc: 'R06AB', text: 'Antihistaminer, vissa (första generationen)', tabell: 'bilaga 1' },
  { atc: 'R06AD', text: 'Antihistaminer, vissa (första generationen)', tabell: 'bilaga 1' },
  { atc: 'R06AE05', text: 'Antihistaminer, vissa (första generationen)', tabell: 'bilaga 1' },
  { atc: 'R06AX02', text: 'Antihistaminer, vissa (första generationen)', tabell: 'bilaga 1' },
];

// Gruppen som en ATC-kod hör till, eller null.
export function grupp(atc) {
  if (typeof atc !== 'string' || !atc) return null;
  return GRUPPER.find(g => atc.startsWith(g.atc) && !(g.utom ?? []).some(u => atc.startsWith(u))) ?? null;
}

// Räknar läkemedel som ökar risken för fall. lakemedel är [{ namn, atc }] för de aktuella ordinationerna.
export function rakna(lakemedel) {
  const traffar = lakemedel.map(l => ({ ...l, grupp: grupp(l.atc) })).filter(l => l.grupp);
  return { antal: traffar.length, lakemedel: traffar.map(l => ({ namn: l.namn, atc: l.atc, grupp: l.grupp.text })), kalla: KALLA };
}
