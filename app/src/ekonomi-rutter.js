// API för ekonomin (runda 7, r3, Sussa 7.1): faktureringsunderlaget, prislistorna, kostnaderna i vårdprocessen,
// medicinskt färdigbehandlad, utlämnade hjälpmedel och LMA-kort. All behörighet prövas i behörighetsmotorn, och
// ekonomens nekade försök loggas utan patient, som datauttaget.
import { Fel } from './db.js';
import { kanRoll } from './atkomst.js';
import { loggaRad } from './logg.js';
import * as ekonomi from './ekonomi.js';
import { hamtaVardtillfalle } from './vardkontakt.js';

export function registreraRutter({ rutt, kravInloggad, medPatient }) {
  // Ekonomens handlingar rör inte en enskild patient. Ett nekat försök loggas.
  const kravEkonom = (c, handling, resurs) => {
    const p = kravInloggad(c);
    if (!kanRoll(p, handling)) {
      loggaRad(c.db, { personal_id: p.id, enhet_id: p.enhet_id, handling, resurs, grund: 'nekad', resultat: 'nekad' });
      throw new Fel(403, 'Din yrkesroll har inte behörighet till det här.', 'nekad');
    }
    return p;
  };

  rutt('GET', '/api/ekonomi/oversikt', (c) => {
    const p = kravEkonom(c, 'faktureringsunderlag', 'faktureringsunderlag:oversikt');
    return ekonomi.oversikt(c.db, p, { period: c.url.searchParams.get('period') || null });
  });
  rutt('GET', '/api/ekonomi/underlag', (c) => {
    const p = kravEkonom(c, 'faktureringsunderlag', 'faktureringsunderlag:export');
    const q = c.url.searchParams;
    const ut = ekonomi.exportera(c.db, p, { vardenhet: q.get('vardenhet'), period: q.get('period') || ekonomi.forraManaden(), format: q.get('format') });
    return new Response(ut.text, { status: 200, headers: {
      'Content-Type': ut.contentType, 'Content-Disposition': `attachment; filename="${ut.namn}"`, 'Cache-Control': 'no-store',
      'X-Antal-Poster': String(ut.antal), 'X-Export-Id': String(ut.exportId), 'X-Content-Type-Options': 'nosniff',
    } });
  });
  rutt('GET', '/api/ekonomi/exporter', (c) => {
    kravEkonom(c, 'faktureringsunderlag', 'faktureringsunderlag:exporter');
    return { exporter: ekonomi.exporter(c.db) };
  });
  rutt('GET', '/api/ekonomi/prislistor', (c) => {
    const p = kravEkonom(c, 'prislista', 'prislista:alla');
    loggaRad(c.db, { personal_id: p.id, enhet_id: p.enhet_id, handling: 'prislista', resurs: 'prislista:alla', grund: 'ekonomi' });
    return { prislistor: ekonomi.prislistor(c.db), kategorier: ekonomi.KATEGORIER, demo: ekonomi.DEMO };
  });
  rutt('GET', '/api/ekonomi/prislistor/:enhet', (c, enhet) => {
    const p = kravEkonom(c, 'prislista', `prislista:${enhet}`);
    const ut = ekonomi.prislistaHistorik(c.db, enhet);
    loggaRad(c.db, { personal_id: p.id, enhet_id: p.enhet_id, handling: 'prislista', resurs: `prislista:${ut.vardenhet.id}`, grund: 'ekonomi' });
    return ut;
  });
  rutt('POST', '/api/ekonomi/prislistor/:enhet', (c, enhet) => {
    const p = kravEkonom(c, 'prislista', `prislista:${enhet}:andra`);
    return [201, ekonomi.andraPrislista(c.db, p, enhet, c.body)];
  });

  // Kostnaderna i vårdprocessen (7.1.2.1), medicinskt färdigbehandlad, hjälpmedel och LMA-kort.
  rutt('GET', '/api/patient/:id/kostnader', (c, id) => {
    kravInloggad(c);
    const q = c.url.searchParams;
    return medPatient(c, id, 'las_kostnader', (atk) => ekonomi.kostnader(atk, { vardtillfalle: q.get('vardtillfalle'), vardkontakt: q.get('vardkontakt') }));
  });
  rutt('POST', '/api/vardtillfalle/:id/fardigbehandlad', (c, id) => {
    kravInloggad(c);
    const vt = hamtaVardtillfalle(c.db, id);
    return medPatient(c, vt.patient_id, 'fardigbehandlad', (atk) => ekonomi.registreraFardigbehandlad(atk, vt, c.body));
  });
  rutt('GET', '/api/hjalpmedel', (c) => {
    const p = kravInloggad(c);
    if (!kanRoll(p, 'hjalpmedel')) throw new Fel(403, 'Din yrkesroll lämnar inte ut hjälpmedel.', 'nekad');
    return { hjalpmedel: ekonomi.hjalpmedelLista(c.db, p), demo: ekonomi.DEMO_AVGIFT };
  });
  rutt('POST', '/api/patient/:id/hjalpmedel', (c, id) => { kravInloggad(c); return medPatient(c, id, 'hjalpmedel', (atk) => ekonomi.registreraHjalpmedel(atk, c.body)); });
  rutt('POST', '/api/patient/:id/lma', (c, id) => { kravInloggad(c); return medPatient(c, id, 'lma', (atk) => ekonomi.registreraLma(atk, c.body)); });

  // Runda 18, r3 (Sussa B1): uthämtning och betalning av hjälpmedel i kassan, med kvitto. Patienten prövas med
  // las_kostnader, som rutan där kassören ser hjälpmedlen, och ekonomi.js prövar handlingen och vårdenheten för raden.
  rutt('POST', '/api/patient/:id/hjalpmedel/:hid/uthamta', (c, id, hid) => { kravInloggad(c); return medPatient(c, id, 'las_kostnader', (atk) => ekonomi.uthamta(atk, hid, c.body)); });
  rutt('GET', '/api/patient/:id/hjalpmedel/:hid/kvitto', (c, id, hid) => { kravInloggad(c); return medPatient(c, id, 'las_kostnader', (atk) => ekonomi.hjalpmedelKvitto(atk, hid)); });
  // Runda 18, r3 (Sussa B4): priset för ett läkemedel där det ordineras, för den som ser priser. Inga patientuppgifter.
  rutt('GET', '/api/priser/lakemedel/:id', (c, id) => {
    const p = kravInloggad(c);
    const priser = require('./ekonomi-priser.js');
    if (!priser.visarPriser(p)) throw new Fel(403, 'Din yrkesroll ser inte priserna.', 'nekad');
    const pr = priser.lakemedelspris(id);
    if (!pr) throw new Fel(404, 'Läkemedlet finns inte i katalogen.', 'saknas');
    return pr;
  });
  // Runda 18, r3 (Sussa B2): kostnaderna per vårdenhet och månad för verksamhetschefen och ekonomen.
  rutt('GET', '/api/ekonomi/kostnader', (c) => {
    const p = kravEkonom(c, 'ekonomi_oversikt', 'ekonomi:kostnader');
    const n = Number(c.url.searchParams.get('manader') ?? 6);
    return ekonomi.kostnadsoversikt(c.db, p, { manader: Number.isInteger(n) ? n : 6 });
  });
  // Runda 18, r3 (Sussa 7.1.1.2): avtal med betalningsmottagare, som ekonomen läser och registrerar med prislistornas handling.
  rutt('GET', '/api/ekonomi/avtal', (c) => {
    kravEkonom(c, 'prislista', 'ekonomiavtal:alla');
    return { avtal: ekonomi.avtalLista(c.db), regioner: Object.entries(ekonomi.REGIONER).map(([id, namn]) => ({ id, namn })), kommuner: ekonomi.KOMMUNER, demo: ekonomi.DEMO };
  });
  rutt('POST', '/api/ekonomi/avtal', (c) => {
    const p = kravEkonom(c, 'prislista', 'ekonomiavtal:ny');
    return [201, ekonomi.registreraAvtal(c.db, p, c.body)];
  });
}
