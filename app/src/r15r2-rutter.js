// Runda 15, r2: köerna till de nationella tjänsterna för systemförvaltaren (Sussa 2.2.1.4 och 2.2.1.10). Systemet
// skickar själv till samtyckestjänsten och engagemangsindex; systemförvaltaren ser läget, kan skicka det som väntar
// direkt och stämma av hela engagemangsindex. Inget i svaren har patientuppgifter.
import { Fel, installning } from './db.js';
import { kanRoll } from './atkomst.js';
import { loggaRad } from './logg.js';
import * as ei from './engagemangsindex.js';
import * as samtycke from './samtycke-nationellt.js';

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

export function registreraRutter({ rutt, kravInloggad }) {
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

// Körs vid varje anrop med en sandlåda (fåtal patienter åt gången) och av en timer varje minut.
export function efterTid(db, nu = new Date(), { anrop = true } = {}) {
  samtycke.efterTid(db, nu);
  ei.efterTid(db, nu, { maxPatienter: anrop ? 5 : null });
}

// Rader i systemförvaltarens inkorg när något inte har kommit fram, utan patientuppgifter.
export function inkorg(c) {
  if (!c.personal || !kanRoll(c.personal, 'forvalta_api') || !c.db) return {};
  const s = samtycke.lageForvaltning(c.db);
  const e = ei.lage(c.db);
  const rader = [];
  if (s.ejFramme) rader.push({ tjanst: 'samtyckestjansten', rubrik: 'Samtyckestjänsten', text: s.text, href: '#/nationella-tjanster' });
  if (e.ejFramme) rader.push({ tjanst: 'engagemangsindex', rubrik: 'Engagemangsindex', text: e.text, href: '#/nationella-tjanster' });
  return { nationellaTjanster: rader };
}
