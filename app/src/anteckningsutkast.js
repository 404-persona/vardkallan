// Runda 15, r4: utkastet sparas av sig självt (granskningen av mallarna, F2).
//
// Anteckningsvyn sparar utkastet en kort stund efter att man har slutat skriva och när man lämnar rutan, så att ingen
// text försvinner när man klickar på en annan anteckning eller lämnar patienten. Utkastet är en anteckning med status
// utkast, knuten till patienten och till den vårdkontakt som systemet väljer, och sparas med samma behörighet och
// samma prövning som när man sparar med knappen (journal.js). Det syns bara för den som skriver och blir den signerade
// anteckningen när den signeras, så att inget utkast ligger kvar bredvid.
//
// En tom ruta sparas inte, och ett utkast som redan är signerat ändras inte: då förklarar servern varför. Under ett
// avbrott läggs utkastet krypterat i skrivkön i webbläsaren (public/js/lasekopia.js) och sparas här när servern svarar
// igen (skrivko.js), med samma funktion.
import { Fel } from './db.js';
import * as journal from './journal.js';
import * as vardkontakt from './vardkontakt.js';
import { formularFor } from './formularmotor.js';

// Utkastet för id:t, om det är den inloggades eget utkast för patienten. Annars samma svar som för ett som inte finns.
function egetUtkast(atk, id) {
  const a = Number.isInteger(id) && id > 0 ? atk.db.query('SELECT * FROM anteckningar WHERE id = ?').get(id) : null;
  if (!a || a.patient_id !== atk.patientId || a.forfattare_id !== atk.personal.id) throw new Fel(404, 'Utkastet finns inte.', 'saknas');
  if (a.status !== 'utkast') throw new Fel(409, 'Anteckningen är redan signerad, så utkastet sparas inte. Öppna anteckningen och rätta den om något ska ändras.', 'signerad');
  return a;
}

// Kategorin som utkastet prövas med: det befintliga utkastets eller mallens.
export function kategori(db, patientId, { anteckningId, typ } = {}) {
  if (anteckningId != null) {
    const a = Number.isInteger(anteckningId) ? db.query('SELECT kategori FROM anteckningar WHERE id = ? AND patient_id = ?').get(anteckningId, patientId) : null;
    if (a) return a.kategori;
  }
  return journal.kategoriFor(db, typ);
}

const harText = (sokord) => Array.isArray(sokord) && sokord.some(s => typeof s?.text === 'string' && s.text.trim());

// Sparar utkastet. body: { anteckningId?, typ, sokord, nyKontakt? }. Ger { id, status, andrad, skapad, sparad } eller
// { tomt: true } när det inte finns någon text att spara.
export function spara(atk, body = {}) {
  const { anteckningId = null, typ, sokord } = body;
  if (anteckningId != null && !Number.isInteger(anteckningId)) throw new Fel(400, 'Ogiltigt utkast.', 'ogiltig', { falt: ['anteckningId'] });
  if (anteckningId != null) {
    const a = egetUtkast(atk, anteckningId);
    const ut = journal.andraUtkast(atk, a, { sokord: Array.isArray(sokord) ? sokord.map(s => ({ ...s, text: typeof s?.text === 'string' ? s.text : '' })) : sokord });
    return svar(ut);
  }
  const kat = journal.kategoriFor(atk.db, typ);
  if (!kat) throw new Fel(400, 'Okänd anteckningstyp.', 'ogiltig', { falt: ['typ'] });
  if (['Tobaksvanor', 'Levnadsvanor'].includes(typ)) throw new Fel(400, 'Den här mallen sparas med svaren och knappen Spara utkast.', 'ogiltig', { falt: ['typ'] });
  if (!harText(sokord)) return { tomt: true };
  const ut = vardkontakt.knyt(atk, 'anteckningar', journal.skapaAnteckning(atk, { typ, sokord: sokord.filter(s => typeof s?.text === 'string' && s.text.trim()) }), body);
  return svar(ut);
}
const svar = (a) => ({ id: a.id, typ: a.typ, status: a.status, skapad: a.skapad, andrad: a.andrad ?? a.skapad, vardkontaktId: a.vardkontaktId ?? null, sparad: new Date().toISOString() });

// Tar bort den inloggades eget utkast, till exempel när personen byter mall innan något är signerat. Texten följer med
// till den nya mallen i vyn. Ett utkast i en mall med svar (tobak, levnadsvanor, formulär) tas inte bort här.
export function taBort(atk, id) {
  const a = egetUtkast(atk, id);
  atk.krav(journal.skrivHandling(a.kategori));
  if (['Tobaksvanor', 'Levnadsvanor'].includes(a.typ) || formularFor(atk.db, a.id)) throw new Fel(400, 'Utkastet har svar i en mall och tas inte bort här.', 'ogiltig');
  atk.db.query("DELETE FROM anteckningar WHERE id = ? AND status = 'utkast' AND forfattare_id = ?").run(a.id, atk.personal.id);
  return { borttaget: a.id };
}
