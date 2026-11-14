// Runda 15, r5: API för omvårdnadsprocessen (omvardnadsprocess.js). Behörigheten prövas av behörighetsmotorn, och
// anropet loggas på patienten som de andra anropen (medPatient).
import * as omvardnad from './omvardnadsprocess.js';

export function registreraRutter({ rutt, kravInloggad, medPatient }) {
  // Det som omvårdnadsanteckningen behöver: vårdplanens mål med den senaste bedömningen, omvårdnadsproblemen med
  // systemets förslag, de föreslagna statusområdena, undersköterskans observationer och formulär som borde fyllas i.
  rutt('GET', '/api/patient/:id/omvardnadsprocess', (c, id) => { kravInloggad(c); return medPatient(c, id, 'skriv_omvardnad', (atk) => omvardnad.forPatient(atk)); });
}
