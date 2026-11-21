import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nyDb } from './hjalp.js';
import * as rivta from '../src/rivta/index.js';
import * as F from './rivta-facit.js';
import { registreraForTjanstekontrakt } from '../src/systemkonton.js';
import { iso } from '../src/db.js';

// Testspår 2: Ineras egna testsviter för producenterna (app/rivta/<domän>/test-suite/<Kontrakt>/) körs mot Vårdkällans
// producenter i samma process, med samma kuvert, prövning och validering som över ömsesidig TLS. Varje testfall i
// SoapUI-projektet skickas som det står, med Vårdkällans uppgifter i stället för testsvitens data.xml
// (app/rivta-regler/<domän>/<Kontrakt>.data.json, som Ineras anvisning säger), och svaret prövas med testfallets egna
// kontroller: SOAP, schemat, testsvitens Schematron-regler och Ineras innehållskontroller (test/rivta-facit.js). Ett
// testfall som inte är tillämpligt för Vårdkällan står med sitt skäl i data-filen, och en kontroll som bara går att köra i
// SoapUI (egna Groovy-skript, lasttester) räknas upp som hoppad. Allt annat ska vara grönt.

export const REGLER = join(import.meta.dir, '..', 'rivta-regler');
const J = rivta.journal;
const FALL = [
  ['riv.clinicalprocess.healthcond.description', 'GetDiagnosis', J.GET_DIAGNOSIS],
  ['riv.clinicalprocess.healthcond.description', 'GetCareDocumentation', J.GET_CARE_DOCUMENTATION],
  ['riv.clinicalprocess.healthcond.description', 'GetAlertInformation', J.GET_ALERT_INFORMATION],
  ['riv.clinicalprocess.logistics.logistics', 'GetCareContacts', J.GET_CARE_CONTACTS],
  ['riv.ehr.accesscontrol', 'AssertCareEngagement', J.ASSERT_CARE_ENGAGEMENT],
];

export const lasData = (doman, mapp) => JSON.parse(readFileSync(join(REGLER, doman, `${mapp}.data.json`), 'utf8'));

// Konsumenter som bara finns i testet, för testfallen om filtrering per konsument (7.1 och 7.2): ett systemkonto med en
// enda vårdenhet.
function sakraKonsumenter(db, lista) {
  rivta.konsumenter.sakraDemo(db);
  for (const k of lista) {
    if (db.query('SELECT 1 FROM rivta_konsumenter WHERE hsa_id = ?').get(k.hsaId)) continue;
    const id = registreraForTjanstekontrakt(db, { namn: k.namn, syfte: 'Testfall i Ineras testsvit.', vardenheter: k.vardenheter, mangder: ['anteckningar', 'diagnoser', 'uppmarksamhet', 'overkanslighet', 'vardkontakter'], hsaId: k.hsaId });
    db.query('INSERT INTO rivta_konsumenter (hsa_id, namn, systemkonto_id, kontrakt, simulerad, registrerad) VALUES (?, ?, ?, ?, 1, ?)')
      .run(k.hsaId, k.namn, id, JSON.stringify(['GetCareDocumentation', 'GetDiagnosis', 'GetAlertInformation', 'GetCareContacts']), iso());
  }
}

// Testfall 1.7 kräver ett internt fel hos producenten ("t.ex. att man stänger av kopplingen mot en databas"). Databasen
// svarar då med ett fel på varje fråga om patienter, efter att den anropande organisationen har prövats.
const trasigDb = (db) => new Proxy(db, {
  get(t, k) {
    if (k === 'query') return (sql) => { if (/patienter/i.test(sql)) throw new Error('Databasen svarar inte (simulerat i testet).'); return t.query(sql); };
    const v = t[k];
    return typeof v === 'function' ? v.bind(t) : v;
  },
});

// Kör alla testfall i en testsvit. Ger [{ namn, utfall: 'ok' | 'ej tillämpligt' | 'fel', fel, hoppade }].
export async function korSvit(db, doman, mapp, def) {
  const d = lasData(doman, mapp);
  const inera = F.data(doman, mapp);
  sakraKonsumenter(db, d.konsumenter ?? []);
  const ut = [];
  for (const tf of F.projekt(doman, mapp).testfall) {
    if (Object.hasOwn(d.ejTillampligt ?? {}, tf.namn)) { ut.push({ namn: tf.namn, utfall: 'ej tillämpligt', skal: d.ejTillampligt[tf.namn] }); continue; }
    if (tf.av) { ut.push({ namn: tf.namn, utfall: 'ej tillämpligt', skal: 'Testfallet är avstängt i testsviten.' }); continue; }
    const egna = d.testfall?.[tf.namn] ?? {};
    const varden = { ...inera.global, ...(inera.testfall[tf.namn] ?? {}), ...d.global, ...egna };
    const ctx = { db: egna['internt fel'] ? trasigDb(db) : db };
    // Producenten skriver ett internt fel till loggen. I testfall 1.7 är felet avsiktligt och hörs inte.
    const logg = console.error;
    if (egna['internt fel']) console.error = () => {};
    const r = await F.korTestfall(tf, { varden, def, doman, mapp, skicka: async ({ text, soapAction, huvuden }) => {
      const s = await rivta.vardkallan.hanteraAnrop(ctx, { text, soapAction, vag: def.vag, avsandare: { hsaId: huvuden['x-rivta-original-serviceconsumer-hsaid'] || d.global.httpHeaderHsaId, via: 'tjänsteplattform' } });
      return { status: s.status, huvuden: s.headers, text: s.body };
    } });
    console.error = logg;
    const fel = [...r.saknas.map(n => `Uppgiften ${n} saknas.`), ...r.steg.flatMap(s => s.kontroller.filter(k => k.ok === false).map(k => `${s.namn}: ${k.namn ?? k.typ}: ${k.text}`))];
    const hoppade = r.steg.flatMap(s => s.kontroller.filter(k => k.hoppad).map(k => `${k.namn ?? k.typ}: ${k.hoppad}`));
    ut.push({ namn: tf.namn, utfall: fel.length ? 'fel' : 'ok', fel, hoppade, tvattat: Boolean(r.tvattat), svar: r.steg.map(s => s.svar) });
  }
  return ut;
}

describe('Ineras testsviter mot Vårdkällans producenter', () => {
  for (const [doman, mapp, def] of FALL) {
    test(`${mapp}: alla tillämpliga testfall i Ineras testsvit går igenom`, async () => {
      const db = nyDb();
      const r = await korSvit(db, doman, mapp, def);
      expect(r.filter(x => x.utfall === 'fel').map(x => `${x.namn}: ${x.fel.join(' | ')}`)).toEqual([]);
      // Varje testfall i testsviten är antingen kört eller har ett skäl att inte köras.
      expect(r.length).toBe(F.projekt(doman, mapp).testfall.length);
      expect(r.filter(x => x.utfall === 'ok').length).toBeGreaterThan(r.length / 2);
    });
  }

  test('ett internt fel hos producenten blir ett SOAP Fault utan personuppgifter, med ett log-id som inte går att spåra till patienten', async () => {
    const db = nyDb();
    for (const [doman, mapp, def] of FALL) {
      const r = (await korSvit(db, doman, mapp, def)).find(x => x.namn === '1.7 SoapFault');
      expect([mapp, r.utfall]).toEqual([mapp, 'ok']);
      const text = r.svar.join('');
      expect(text).toContain('soap:Server');
      expect(text).not.toMatch(/\d{12}/);
      expect(text).toMatch(/Felets id är [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\./);
    }
  });
});
