// Runda 16, r2: det som Socialstyrelsens försäkringsmedicinska beslutsstöd behöver ur ett utkast i den simulerade
// intygsapplikationen: intygstypen, statusen, patienten och de svar som den inloggade får se. Behörigheten och loggningen
// är intygsapplikationens egen (visa), och svar som personen inte får se kommer aldrig med. Motiveringen till
// beslutsstödet skrivs i intygets fråga 37 och sparas som de andra svaren (intygsapplikation-simulerad.js spara).
// Inget sparas här.
import * as intygsapp from './intygsapplikation-simulerad.js';

export function utkastFor(db, personal, intygsId, val = {}) {
  const v = intygsapp.visa(db, personal, intygsId, val);
  return { intygsId: v.intygsId, typ: v.typ, status: v.status, patientId: v.patientId, svar: { ...(v.svar ?? {}) } };
}
