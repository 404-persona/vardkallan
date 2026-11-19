// Version 1.7.1: en behörighetsbegränsning räknas som en begränsning till narkotika bara när texten är en känd formulering.
// All annan text är en begränsning som systemet inte kan tolka, och då stoppas förskrivningen (fail closed). Tidigare
// räckte det att texten nämnde narkotika, så att en begränsning som också gällde annat bara stoppade narkotikan.
import { describe, test, expect, afterEach } from 'bun:test';
import { nyDb, atk } from './hjalp.js';
import { idag, addDagar, iso } from '../src/db.js';
import * as hosp from '../src/hosp.js';
import * as lakemedel from '../src/lakemedel.js';
import { AVVIKELSER } from '../src/seed/hosp.js';

const T = 'HOSP, legitimation och förskrivningsrätt > ';
const fel = (fn) => { try { fn(); } catch (e) { return e; } return null; };
const besok = (db, pid, enhet) => db.query("INSERT INTO vardkontakter (patient_id, enhet_id, typ, start, kalla) VALUES (?, ?, 'besok', ?, 'test')").run(pid, enhet, iso());
const ordination = (lakemedelId) => ({ lakemedelId, dosering: '1 tablett vid behov', dos: 1, dosEnhet: 'tablett', typ: 'vid_behov', vidBehov: true, ordinationsorsak: 'Smärta', start: idag(), uppfoljningsdatum: addDagar(idag(), 14) });
function sparaKvitterad(a, kropp) {
  try { return lakemedel.spara(a, kropp); } catch (e) {
    if (!e.extra?.kraverKvittens) throw e;
    return lakemedel.spara(a, { ...kropp, kvitteradeVarningar: e.extra.kraverKvittens.map(regel => ({ regel, motivering: 'Bedömt i testet' })) });
  }
}
const ALVEDON = 'VK-NPL-0026';
const ORIGINAL = AVVIKELSER['lak-ane-ort'].begransningar[0].text;
const medText = (text) => { AVVIKELSER['lak-ane-ort'].begransningar[0].text = text; const db = nyDb(); besok(db, 'p01', 'uso-ane'); return { db, a: atk(db, 'lak-ane-ort', 'p01', {}, 'ordinera') }; };

describe('HOSP, version 1.7.1', () => {
  afterEach(() => { AVVIKELSER['lak-ane-ort'].begransningar[0].text = ORIGINAL; });

  test(`${T}en begränsning som nämner narkotika men också gäller annat stoppar all förskrivning, och systemet säger varför`, () => {
    for (const text of ['Förskrivningsrätten omfattar inte narkotiska läkemedel eller bensodiazepiner.', 'Förskrivningsrätten omfattar endast narkotiska läkemedel.', 'Ej narkotika. Ej antibiotika.']) {
      const { db, a } = medText(text);
      const e = fel(() => lakemedel.spara(a, ordination(ALVEDON)));
      expect(e?.status).toBe(403);
      expect(e.message).toContain('Systemet kan inte avgöra vad begränsningen omfattar');
      expect(e.message).toContain(text);
      expect(db.query("SELECT count(*) AS n FROM ordinationer WHERE ordinerad_av = 'lak-ane-ort'").get().n).toBe(0);
    }
  });

  test(`${T}den kända formuleringen om narkotiska läkemedel känns igen även med andra stora bokstäver och mellanrum`, () => {
    for (const text of [ORIGINAL, '  förskrivningsrätten omfattar INTE narkotiska   läkemedel ', 'Förskrivningsrätten omfattar inte narkotiska läkemedel']) {
      const { a } = medText(text);
      expect(sparaKvitterad(a, ordination(ALVEDON)).ordination.lakemedel.id).toBe(ALVEDON);
    }
    expect(hosp.arBegransningTillNarkotika('Förskrivningsrätten omfattar inte narkotiska läkemedel eller bensodiazepiner.')).toBe(false);
    expect(hosp.arBegransningTillNarkotika(null)).toBe(false);
  });
});
