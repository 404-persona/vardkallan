// Runda 18, r5: två som arbetar med samma patient. När någon sparar en ändring av en ordination som en annan person
// redan har ändrat eller satt ut, sedan dialogen öppnades, sparas inget, och svaret säger vem som ändrade vad och när.
// Gränssnittet skickar det som visades när dialogen öppnades (forvantat: dosering, läkemedel och status), och visar
// besked med den egna texten kvar, så att inget skrivet försvinner.
//
// Prövningen görs efter behörigheten, så att ingen får veta mer än det den redan får se i läkemedelslistan.
import { Fel } from './db.js';

const namn = (db, id) => (id ? db.query('SELECT namn FROM personal WHERE id = ?').get(id)?.namn : null) ?? 'någon annan';
const klockslag = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return ` kl. ${d.toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' }).replace(':', '.')}`;
};
const lmNamn = (db, id) => db.query('SELECT namn FROM katalog WHERE id = ?').get(id)?.namn ?? 'läkemedlet';
const nuVarde = (o) => ({ status: o.status, dosering: o.dosering, lakemedelId: o.lakemedel_id });

// Kastar 409 när ordinationen har satts ut av någon annan. Gäller också utan forvantat, eftersom en utsatt ordination
// aldrig kan ändras igen.
export function provaUtsatt(db, o) {
  if (o.status === 'aktiv') return;
  throw new Fel(409, `${namn(db, o.utsatt_av)} satte ut ${lmNamn(db, o.lakemedel_id)}${klockslag(o.utsatt_tid)}${o.utsatt_orsak ? ` med orsaken ${o.utsatt_orsak.replace(/\.$/, '')}` : ''}. Inget mer behöver göras, och din ändring är inte sparad.`, 'andrad', { nu: nuVarde(o) });
}

// Kastar 409 när doseringen eller läkemedlet har ändrats sedan dialogen öppnades.
export function provaOrdination(db, o, forvantat) {
  provaUtsatt(db, o);
  if (!forvantat || typeof forvantat !== 'object') return;
  const andrad = (typeof forvantat.dosering === 'string' && forvantat.dosering !== o.dosering)
    || (typeof forvantat.lakemedelId === 'string' && forvantat.lakemedelId !== o.lakemedel_id);
  if (!andrad) return;
  const d = db.query("SELECT av, tid FROM dosandringar WHERE ordination_id = ? AND tillampad IS NOT NULL ORDER BY id DESC LIMIT 1").get(o.id);
  throw new Fel(409, `${namn(db, d?.av)} ändrade dosen av ${lmNamn(db, o.lakemedel_id)} till ${o.dosering}${klockslag(d?.tid)} medan du arbetade. Din ändring är inte sparad. Kontrollera den nya dosen och spara din ändring igen om den fortfarande behövs.`, 'andrad', { nu: nuVarde(o) });
}
