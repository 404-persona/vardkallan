// Runda 18, r2: API för sökrutan "Vad vill du göra?" och ordlistan "Jag letar efter" (handlingssok.js).
//
//   GET /api/handlingar/sok?q=&patient=   handlingarna som passar frågan, för den inloggade personalen. patient är den
//                                         patient som är öppen i gränssnittet och räknas bara när den har öppnats i
//                                         sessionen och får ses. Svaret innehåller aldrig patientuppgifter.
//   GET /api/handlingar/ordlista          ordlistan, med länkar bara för det rollen får. Öppen utan inloggning.
//
// Sökningen läser inga patientuppgifter och loggar därför inget i åtkomstloggen. Behörigheten för en öppen patient
// prövas i behörighetsmotorn (prova), som inte heller loggar.
import { Fel } from './db.js';
import * as hs from './handlingssok.js';

const ID = /^[\w-]{1,64}$/;

export function registreraRutter({ rutt, kravInloggad, sessionUt, valFor }) {
  const fel = hs.kontrolleraKatalog();
  if (fel.length) throw new Error(`Katalogen för sökrutan är fel: ${fel.join('; ')}`);

  rutt('GET', '/api/handlingar/sok', (c) => {
    const personal = kravInloggad(c);
    const q = c.url.searchParams.get('q') ?? '';
    const pid = c.url.searchParams.get('patient') ?? '';
    if (q.length > hs.MAX_FRAGA) throw new Fel(400, `Skriv högst ${hs.MAX_FRAGA} tecken.`, 'ogiltig');
    if (pid && !ID.test(pid)) throw new Fel(400, 'Patientens id är ogiltigt.', 'ogiltig');
    // Bara en patient som har öppnats i sessionen räknas. Annars är svaret detsamma som utan patient.
    const rad = pid && c.s.oppnade?.has(pid) ? c.db.query('SELECT id, fodd FROM patienter WHERE id = ?').get(pid) : null;
    const sess = sessionUt(c.s);
    return hs.sok(c.db, { sess, personal, val: rad ? valFor(c.s, rad.id) : {}, patient: rad, fraga: q });
  });

  rutt('GET', '/api/handlingar/ordlista', (c) => hs.ordlista(c.personal && c.s ? sessionUt(c.s) : null));
}

// Adresserna som inte skapar en sandlåda (ordlistan läses också av den som inte är inloggad).
export const UTAN_SESSION = ['/api/handlingar/ordlista'];
