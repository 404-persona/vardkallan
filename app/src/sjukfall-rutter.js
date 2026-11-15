// Runda 16, r2: API för stödet vid sjukskrivning (sjukfall.js). Behörigheten prövas i modulen och av behörighetsmotorn,
// och varje anrop som rör en patient loggas på patienten (medPatient, eller per patient i läkarens översikt).
import * as sjukfall from './sjukfall.js';

export function registreraRutter({ rutt, kravInloggad, medPatient, valFor }) {
  // Patientens sjukfall, beslutsstödet för det pågående och förslaget till förlängning.
  rutt('GET', '/api/patient/:id/sjukskrivning', (c, id) => { kravInloggad(c); return medPatient(c, id, 'las_intyg', (atk, p) => sjukfall.forPatient(atk, p)); });
  // Ett klick: utkastet till förlängningen skapas i intygsapplikationen, med det som inte har ändrats.
  rutt('POST', '/api/patient/:id/sjukskrivning/forlang', async (c, id) => { kravInloggad(c); return [201, await medPatient(c, id, 'skriv_intyg', (atk, p) => sjukfall.forlang(atk, p, c.body))]; });
  // Beslutsstödet i intygsapplikationen medan läkaren skriver, och motiveringen som följer med i intyget.
  rutt('GET', '/api/intygsapplikation/:iid/beslutsstod', (c, iid) => sjukfall.beslutsstodForUtkast(c.db, kravInloggad(c), iid, valForIntyg(c, iid), c.url.searchParams));
  // Läkarens pågående sjukfall och vårdenhetens översikt för verksamhetschefen.
  rutt('GET', '/api/sjukskrivningar', (c) => sjukfall.minaSjukfall(c.db, kravInloggad(c), (pid) => valFor(c.s, pid)));
  rutt('GET', '/api/sjukskrivningar/enhet', (c) => sjukfall.enhetensSjukfall(c.db, kravInloggad(c)));

  function valForIntyg(c, iid) {
    const r = typeof iid === 'string' && /^[0-9a-f-]{36}$/.test(iid) ? c.db.query('SELECT patient_id FROM sim_intygsapplikation WHERE intygs_id = ?').get(iid) : null;
    return r ? valFor(c.s, r.patient_id) : {};
  }
}
