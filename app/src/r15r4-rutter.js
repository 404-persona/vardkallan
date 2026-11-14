// Runda 15, r4: API för anteckningsvyn: mallen med underlag och varianter för en patient, utkastet som sparas av sig
// självt och personens egna fraser och ordning på sökorden. Behörigheten prövas i modulerna av behörighetsmotorn, och
// varje anrop som rör en patient loggas på patienten (medPatient).
import { Fel } from './db.js';
import * as konfiguration from './konfiguration.js';
import { mallarFor as strukturMallar } from './journalstruktur.js';
import { mallarFor as formularMallar } from './formularmotor.js';
import * as journal from './journal.js';
import * as anteckningsmall from './anteckningsmall.js';
import * as utkast from './anteckningsutkast.js';
import * as fraser from './egna-fraser.js';

// Mallarna som den inloggade får använda, med vårdenhetens anpassning (samma som GET /api/mallar).
export const mallarForPerson = (c) => [...strukturMallar(c.db, c.personal, konfiguration.mallar(c.db)), ...formularMallar(c.db, c.personal)];
const mallFor = (c, typ) => (typeof typ === 'string' ? mallarForPerson(c).find(m => m.typ === typ) ?? null : null);
const heltal = (v) => (v == null || v === '' ? null : /^\d{1,9}$/.test(String(v)) ? Number(v) : NaN);

export function registreraRutter({ rutt, kravInloggad, medPatient }) {
  rutt('GET', '/api/patient/:id/anteckningsmall', (c, id) => {
    kravInloggad(c);
    const mall = mallFor(c, c.url.searchParams.get('typ'));
    if (!mall) throw new Fel(404, 'Mallen finns inte eller får inte användas av din yrkesroll.', 'saknas');
    const utkastId = heltal(c.url.searchParams.get('utkast'));
    if (Number.isNaN(utkastId)) throw new Fel(400, 'Ogiltigt utkast.', 'ogiltig', { falt: ['utkast'] });
    return medPatient(c, id, journal.skrivHandling(mall.kategori), (atk) => anteckningsmall.forPatient(atk, mall, { utkastId }));
  });
  rutt('PUT', '/api/patient/:id/anteckningsutkast', (c, id) => {
    kravInloggad(c);
    const kat = utkast.kategori(c.db, id, c.body ?? {});
    if (!kat) throw new Fel(400, 'Okänd anteckningstyp.', 'ogiltig', { falt: ['typ'] });
    return medPatient(c, id, journal.skrivHandling(kat), (atk) => utkast.spara(atk, c.body ?? {}));
  });
  rutt('GET', '/api/egna-fraser', (c) => fraser.lista(c.db, kravInloggad(c)));
  rutt('POST', '/api/egna-fraser', (c) => [201, fraser.lagg(c.db, kravPersonal(c), c.body ?? {})]);
  rutt('DELETE', '/api/egna-fraser/:fid', (c, fid) => fraser.taBort(c.db, kravPersonal(c), fid));
  rutt('PUT', '/api/egna-fraser/ordning', (c) => {
    const p = kravPersonal(c);
    const mall = mallFor(c, c.body?.typ);
    if (!mall) throw new Fel(400, 'Välj en mall som du får använda.', 'ogiltig', { falt: ['typ'] });
    return fraser.sattOrdning(c.db, p, mall, c.body?.ordning ?? null);
  });

  // Bara den som skriver i journalen har fraser och egen ordning.
  function kravPersonal(c) {
    const p = kravInloggad(c);
    if (!['skriv_journal', 'skriv_omvardnad'].some(h => require('./atkomst.js').kanRoll(p, h))) throw new Fel(403, 'Egna fraser finns för den som skriver i journalen.', 'nekad');
    return p;
  }
}
