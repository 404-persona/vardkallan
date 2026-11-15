// Runda 16, r2: motiveringen till Socialstyrelsens försäkringsmedicinska beslutsstöd i den simulerade
// intygsapplikationen (FK 7804 fråga 37). Läkaren skriver den en gång i utkastet när sjukskrivningen blir längre än
// rekommendationen. Den följer med i intyget, i statusuppdateringen till journalen och i förlängningar.
//
// Behörigheten prövas av intygsapplikationens egen spara (bara personal med skriv_intyg på den vårdenhet som äger
// intyget, och bara i ett utkast), som också loggar och meddelar journalen att utkastet ändrats. Först därefter sparas
// motiveringen.
import { Fel } from './db.js';
import * as intygsapp from './intygsapplikation-simulerad.js';
import { harFrageNycklar } from './sjukfall-intygssvar.js';

export const MAX_TECKEN = 2000;

export async function sparaMotivering(db, personal, intygsId, body = {}, val = {}) {
  const t = body.motivering;
  if (t != null && typeof t !== 'string') throw new Fel(400, 'Motiveringen ska vara text.', 'ogiltig', { falt: ['motivering'] });
  const text = (t ?? '').trim().slice(0, MAX_TECKEN);
  const fore = await intygsapp.spara(db, personal, intygsId, {}, val);
  if (fore.typ !== 'LISJP') throw new Fel(400, 'Motiveringen till beslutsstödet hör till läkarintyget för sjukpenning.', 'ogiltig');
  const r = db.query('SELECT svar FROM sim_intygsapplikation WHERE intygs_id = ?').get(intygsId);
  const svar = JSON.parse(r.svar);
  // Svar med frågans id som nyckel får motiveringen som fråga 37, annars som motiveringFmb.
  const nyckel = harFrageNycklar(svar) ? '37' : 'motiveringFmb';
  if (text) svar[nyckel] = text; else delete svar[nyckel];
  db.query('UPDATE sim_intygsapplikation SET svar = ? WHERE intygs_id = ?').run(JSON.stringify(svar), intygsId);
  return { motivering: text || null, text: text ? 'Motiveringen är sparad i intyget.' : 'Motiveringen är borttagen ur intyget.' };
}

// Svaren i utkastet som beslutsstödet behöver, med intygsapplikationens egen behörighet och loggning (visa).
export function utkastFor(db, personal, intygsId, val = {}) {
  const v = intygsapp.visa(db, personal, intygsId, val);
  const r = db.query('SELECT svar FROM sim_intygsapplikation WHERE intygs_id = ?').get(intygsId);
  return { intygsId: v.intygsId, typ: v.typ, status: v.status, patientId: v.patientId, svar: JSON.parse(r.svar) };
}
