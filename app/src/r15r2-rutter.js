// Runda 15, r2: köerna till de nationella tjänsterna för systemförvaltaren (Sussa 2.2.1.4 och 2.2.1.10). Systemet
// skickar själv till samtyckestjänsten och engagemangsindex; systemförvaltaren ser läget, kan skicka det som väntar
// direkt och stämma av hela engagemangsindex. Inget i svaren har patientuppgifter.
import { Fel, installning } from './db.js';
import { kanRoll } from './atkomst.js';
import { loggaRad } from './logg.js';
import * as ei from './engagemangsindex.js';
import * as samtycke from './samtycke-nationellt.js';
import * as makulering from './vardkontakt-makulering.js';

const AVBROTT = 'nationella.simulerat_avbrott';
function kravForvaltare(c, kravInloggad) {
  const p = kravInloggad(c);
  if (!kanRoll(p, 'forvalta_api')) throw new Fel(403, 'Bara systemförvaltaren ser köerna till de nationella tjänsterna.', 'nekad');
  return p;
}

export function lage(db, nu = new Date()) {
  return {
    samtyckestjansten: samtycke.lageForvaltning(db, nu),
    engagemangsindex: ei.lage(db, nu),
    simuleratAvbrott: installning(db, AVBROTT) === '1',
    simulerat: 'Samtyckestjänsten och engagemangsindex är simulerade i demon. Inget lämnar demon.',
  };
}

export function registreraRutter({ rutt, kravInloggad, medPatient, valFor }) {
  // Runda 15, r2, andra omgången: makulering av en genomförd vårdkontakt som har registrerats på fel patient.
  // Tredje omgången: samma rättelse för ett vårdtillfälle, och förslag med fyra ögon när rätt patient saknar vårdrelation.
  const medObjekt = (c, slag, id, fn) => {
    kravInloggad(c);
    const o = makulering.objekt(c.db, slag, id);
    return medPatient(c, o.patientId, 'registrera_vardkontakt', (atk) => fn(atk, o));
  };
  for (const [slag, bas] of [['vardkontakt', '/api/vardkontakt/:id'], ['vardtillfalle', '/api/vardtillfalle/:id']]) {
    rutt('GET', `${bas}/makulering`, (c, id) => medObjekt(c, slag, id, (atk, o) => makulering.forhandsvisa(atk, o)));
    rutt('POST', `${bas}/makulera`, (c, id) => medObjekt(c, slag, id, (atk, o) => makulering.makulera(atk, o, c.body, { valFor: (pid) => valFor(c.s, pid) })));
  }
  rutt('GET', '/api/flyttar', (c) => makulering.forslagFor(c.db, kravInloggad(c)));
  // Säkerhetsgranskningen efter sammanslagningen: förslaget öppnas för sig, prövat på patienten och loggat.
  rutt('GET', '/api/flyttar/:id', (c, id) => makulering.forslagDetalj(c.db, kravInloggad(c), id, { valFor: (pid) => valFor(c.s, pid) }));
  rutt('POST', '/api/flyttar/:id/godkann', (c, id) => makulering.godkann(c.db, kravInloggad(c), id, { valFor: (pid) => valFor(c.s, pid) }));
  rutt('POST', '/api/flyttar/:id/avsluta', (c, id) => makulering.avsluta(c.db, kravInloggad(c), id, c.body));
  rutt('GET', '/api/nationella-tjanster', (c) => { kravForvaltare(c, kravInloggad); return lage(c.db); });
  // Skickar allt som väntar nu, utan att vänta på nästa försök.
  rutt('POST', '/api/nationella-tjanster/skicka', (c) => {
    const p = kravForvaltare(c, kravInloggad);
    const s = samtycke.skickaKo(c.db, { tvinga: true });
    const e = ei.skicka(c.db, { tvinga: true });
    loggaRad(c.db, { personal_id: p.id, enhet_id: p.enhet_id, handling: 'forvalta_api', resurs: 'nationella-tjanster:skicka', grund: 'administrativ' });
    return { ...lage(c.db), text: s.fel || e.fel ? 'Tjänsterna svarar inte än. Systemet fortsätter att försöka av sig självt.' : 'Allt som väntade är skickat.' };
  });
  // Märker alla patienter, så att hela engagemangsindex stäms av mot journalen i nästa omgångar.
  rutt('POST', '/api/nationella-tjanster/avstam', (c) => {
    const p = kravForvaltare(c, kravInloggad);
    ei.markeraPatienter(c.db);
    loggaRad(c.db, { personal_id: p.id, enhet_id: p.enhet_id, handling: 'forvalta_api', resurs: 'engagemangsindex:avstamning', grund: 'administrativ' });
    return { ...lage(c.db), text: 'Hela engagemangsindex stäms av mot journalen i de närmaste omgångarna.' };
  });
  // Demo: simulera att de nationella tjänsterna inte svarar, för att se köerna arbeta.
  rutt('POST', '/api/nationella-tjanster/avbrott', (c) => {
    const p = kravForvaltare(c, kravInloggad);
    if (typeof c.body.simulera !== 'boolean') throw new Fel(400, 'Ange om avbrottet ska simuleras.', 'ogiltig', { falt: ['simulera'] });
    installning(c.db, AVBROTT, c.body.simulera ? '1' : '0');
    loggaRad(c.db, { personal_id: p.id, enhet_id: p.enhet_id, handling: 'forvalta_api', resurs: `nationella-tjanster:avbrott:${c.body.simulera ? 'pa' : 'av'}`, grund: 'administrativ' });
    return lage(c.db);
  });
}

// Körs vid varje anrop med en sandlåda, som bara skickar det som väntar till samtyckestjänsten, och av en timer varje
// minut, som också skickar till engagemangsindex och gör grundladdningen och den dagliga avstämningen. Engagemangsindex
// räknas aldrig om i en användares anrop, så att arbetet aldrig syns i svarstiden eller i sandlådans tidsbudget.
export function efterTid(db, nu = new Date(), { anrop = true } = {}) {
  samtycke.efterTid(db, nu);
  // Högst tre patienter per sandlåda och minut, ändringar före avstämningen, så att servern aldrig blir upptagen länge.
  if (!anrop) ei.efterTid(db, nu, { avstamning: true, maxPatienter: 3 });
}

// Efter en handling som ändrar något: borttagningar ur engagemangsindex för skydd och spärr skickas direkt.
export function efterHandling(db, nu = new Date()) {
  ei.efterHandling(db, nu);
}

// Timerns schema över de vakna sandlådorna. Sandlådor med en borttagning för skydd eller spärr först, och de skickas alltid,
// sedan sandlådor med ändringar och sist avstämningen. Inom samma nivå börjar varje varv där förra varvet slutade, så att
// ingen sandlåda svälter. Det som inte är brådskande slutar när varvets tid (maxMs) är slut.
let markor = 0;
export function schemalagg(dbs, { nu = new Date(), maxMs = 150 } = {}) {
  const t0 = performance.now();
  const n = dbs.length;
  if (!n) return;
  const start = markor % n;
  const ordning = dbs.map((db, i) => ({ db, plats: (i - start + n) % n, prio: ei.prioritet(db) })).sort((a, b) => b.prio - a.prio || a.plats - b.plats);
  let senast = start;
  for (const x of ordning) {
    if (x.prio < 2 && performance.now() - t0 > maxMs) break;
    try { efterTid(x.db, nu, { anrop: false }); } catch (e) { console.error('De nationella köerna:', e.message); }
    senast = (start + x.plats) % n;
  }
  markor = senast + 1;
}

// Rader i systemförvaltarens inkorg när något inte har kommit fram, utan patientuppgifter.
export function inkorg(c) {
  // Tredje omgången: flyttar till rätt patient som väntar på den inloggades godkännande.
  const flyttar = c.personal && c.db && kanRoll(c.personal, 'godkanna_flytt') ? { flyttarAttGodkanna: makulering.forslagFor(c.db, c.personal).attGodkanna } : {};
  if (!c.personal || !kanRoll(c.personal, 'forvalta_api') || !c.db) return flyttar;
  const s = samtycke.lageForvaltning(c.db);
  const e = ei.lage(c.db);
  const rader = [];
  if (s.ejFramme) rader.push({ tjanst: 'samtyckestjansten', rubrik: 'Samtyckestjänsten', text: s.text, href: '#/nationella-tjanster' });
  if (e.ejFramme) rader.push({ tjanst: 'engagemangsindex', rubrik: 'Engagemangsindex', text: e.text, href: '#/nationella-tjanster' });
  return { ...flyttar, nationellaTjanster: rader };
}
