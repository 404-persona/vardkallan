// Runda 16, r2: API för stödet vid sjukskrivning (sjukfall.js). Behörigheten prövas i modulen och av behörighetsmotorn,
// och varje anrop som rör en patient loggas på patienten (medPatient, eller per patient i läkarens översikt).
import { Atkomst } from './atkomst.js';
import * as sjukfall from './sjukfall.js';
import * as beslutsstod from './intygsapplikation-beslutsstod-simulerad.js';

export function registreraRutter({ rutt, kravInloggad, medPatient, valFor }) {
  // Patientens sjukfall, beslutsstödet för det pågående och förslaget till förlängning.
  rutt('GET', '/api/patient/:id/sjukskrivning', (c, id) => { kravInloggad(c); return medPatient(c, id, 'las_intyg', (atk, p) => sjukfall.forPatient(atk, p)); });
  // Ett klick: utkastet till förlängningen skapas i intygsapplikationen, med det som inte har ändrats.
  rutt('POST', '/api/patient/:id/sjukskrivning/forlang', async (c, id) => { kravInloggad(c); return [201, await medPatient(c, id, 'skriv_intyg', (atk, p) => sjukfall.forlang(atk, p, c.body))]; });
  // Beslutsstödet i intygsapplikationen medan läkaren skriver, och motiveringen som följer med i intyget.
  rutt('GET', '/api/intygsapplikation/:iid/beslutsstod', (c, iid) => {
    const personal = kravInloggad(c);
    const u = beslutsstod.utkastFor(c.db, personal, iid, valForIntyg(c, iid));
    // Det som står i formuläret men inte är sparat räknas med, bara för bedömningen och bara i ett utkast. Datum och
    // nivå prövas som de sparade svaren (sjukfall-intygssvar.js).
    if (u.status === 'utkast') {
      for (const k of ['fran', 'till', 'nedsattning']) {
        const v = c.url.searchParams.get(k);
        if (typeof v === 'string' && v.length <= 20) u.svar[k] = v;
      }
    }
    return sjukfall.forUtkast(new Atkomst(c.db, personal, u.patientId, valFor(c.s, u.patientId), 'las_intyg'), u);
  });
  rutt('POST', '/api/intygsapplikation/:iid/beslutsstod/motivering', async (c, iid) => beslutsstod.sparaMotivering(c.db, kravInloggad(c), iid, c.body, valForIntyg(c, iid)));
  // Läkarens pågående sjukfall och vårdenhetens översikt för verksamhetschefen.
  rutt('GET', '/api/sjukskrivningar', (c) => sjukfall.minaSjukfall(c.db, kravInloggad(c), (pid) => valFor(c.s, pid)));
  rutt('GET', '/api/sjukskrivningar/enhet', (c) => sjukfall.enhetensSjukfall(c.db, kravInloggad(c)));

  function valForIntyg(c, iid) {
    const r = typeof iid === 'string' && /^[0-9a-f-]{36}$/.test(iid) ? c.db.query('SELECT patient_id FROM sim_intygsapplikation WHERE intygs_id = ?').get(iid) : null;
    return r ? valFor(c.s, r.patient_id) : {};
  }
}
