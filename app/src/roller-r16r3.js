// Runda 16, r3: de nya yrkesrollerna i sandlådan. En ny sandlåda får personalen ur seeden (masterdata) och
// handledningarna här. En sandlåda som sparades före runda 16 får också den nya personalen med samma HSA-id som i en ny
// sandlåda, och barnmorskan på förlossningen får sin egen roll. Inget annat ändras i en äldre sandlåda.
import { PERSONAL } from './seed/personal.js';
import * as handledning from './handledning.js';

const hsaFor = (i) => `SE2321000164-VKP${String(i + 1).padStart(3, '0')}`;

export function sakra(db, bas = new Date()) {
  const ins = db.query('INSERT OR IGNORE INTO personal (id, namn, yrke, titel, enhet_id, hsa_id, demo, aktiv) VALUES (?, ?, ?, ?, ?, ?, ?, 1)');
  PERSONAL.forEach((p, i) => {
    if (p.r16 && db.query('SELECT 1 FROM enheter WHERE id = ?').get(p.enhet)) ins.run(p.id, p.namn, p.yrke, p.titel, p.enhet, hsaFor(i), p.demo ? 1 : 0);
  });
  // Barnmorskan hade sjuksköterskans roll med titeln barnmorska före runda 16.
  db.query("UPDATE personal SET yrke = 'barnmorska' WHERE id = 'bm-uso' AND yrke = 'sjukskoterska' AND titel = 'Barnmorska'").run();
  handledning.seeda(db, bas);
}
