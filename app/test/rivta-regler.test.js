import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REGLER } from './rivta-regelhjalp.js';
import { RIVTA_ROT } from '../src/rivta/kontrakt.js';
import { DOKUMENT, textFor, dokumentVag, tkbSaknas, TKB_MEDDELANDE } from '../scripts/rivta-scheman.js';

// Testspår 2: regelförteckningarna för de byggda kontrakten (app/rivta-regler/<domän>/<Kontrakt>.json). Varje regel har
// TKB:s formulering ordagrant, avsnittet och vem den gäller, och antingen ett test som prövar den eller ett skäl. Testet
// kontrollerar att formuleringen finns i den pinnade texten av TKB, att varje test som en regel pekar på finns och säger
// att det prövar regeln (provar i testet eller regelns id i <Kontrakt>.sch), och att Vårdkällans egna texter i
// förteckningen följer språkreglerna.

const KONTRAKT = {
  'riv.clinicalprocess.healthcond.description': ['GetCareDocumentation', 'GetDiagnosis', 'GetAlertInformation'],
  'riv.clinicalprocess.logistics.logistics': ['GetCareContacts'],
  'riv.clinicalprocess.activityprescription.actoutcome': ['GetMedicationHistory'],
  'riv.ehr.accesscontrol': ['AssertCareEngagement'],
  'riv.ehr.blocking': ['CheckBlocks', 'GetAllBlocksForPatient', 'GetBlocksForPatient', 'RegisterTemporaryExtendedRevoke', 'CancelTemporaryExtendedRevoke'],
  'riv.ehr.patientconsent': ['CheckConsent', 'RegisterExtendedConsent', 'CancelExtendedConsent', 'GetExtendedConsentsForPatient'],
  'riv.infrastructure.directory.employee': ['GetEmployeeIncludingProtectedPerson'],
  'riv.population.residentmaster': ['LookupResidentForFullProfile'],
  'riv.itintegration.engagementindex': ['Update'],
  'riv.masterdata.organisationalresources.licensetopractice': ['GetHospPersonForPublicHealthCare'],
};
const STATUS = ['prövas', 'inte automatiskt', 'inte prövad än', 'avvikelse', 'inte tillämplig'];
const norm = (s) => s.replace(/\s+/g, ' ');
const texter = new Map();
// Runda 20: TKB:s text ligger inte i förrådet (ingen licens) utan hämtas till app/rivta-tkb/ med
// node scripts/rivta-scheman.js --tkb. Utan den hoppas jämförelsen med texten över, och resten av kontrollerna körs.
const tkb = (fil) => { if (!texter.has(fil)) { const [d, ...r] = fil.split('/'); texter.set(fil, norm(readFileSync(dokumentVag(d, r.join('/')), 'utf8'))); } return texter.get(fil); };
const SAKNAS = tkbSaknas();
if (SAKNAS.length) console.warn(`Regelförteckningarna: ${TKB_MEDDELANDE}. Jämförelsen av reglernas text med TKB hoppas över (${SAKNAS.length} filer saknas).`);

// Testerna i regelfilerna: namnen (med describe) och provar-anropen i varje test.
function tester() {
  const ut = new Map();
  for (const f of readdirSync(import.meta.dir).filter(x => /^rivta-regler-.*\.test\.js$/.test(x))) {
    const s = readFileSync(join(import.meta.dir, f), 'utf8');
    const T = /^const T = '([^']+)';/m.exec(s)[1];
    let describe = T;
    let aktuell = null;
    for (const rad of s.split('\n')) {
      const d = /^\s*describe\((?:T|`\$\{T\}([^`]*)`)/.exec(rad);
      if (d) describe = T + (d[1] ?? '');
      const t = /^\s*test\((?:'([^']+)'|`([^`]+)`)/.exec(rad);
      if (t) {
        aktuell = `${describe} > ${t[1] ?? t[2]}`;
        ut.set(aktuell, { fil: f, provar: new Map() });
        // Ett testnamn i en slinga över kontrakten blir ett test per kontrakt.
        if (aktuell.includes('${kontrakt}')) for (const k of Object.values(KONTRAKT).flat()) ut.set(aktuell.replace('${kontrakt}', k), { fil: f, provar: new Map() });
      }
      for (const m of rad.matchAll(/provar\('(\w+)', \[([^\]]*)\]\)/g)) {
        const ids = [...m[2].matchAll(/'([^']+)'/g)].map(x => x[1]);
        const p = ut.get(aktuell).provar;
        p.set(m[1], new Set([...(p.get(m[1]) ?? []), ...ids]));
      }
      // Ett provar-anrop i en slinga över kontrakt: for (const k of [...]) provar(k, [...]).
      const slinga = /for \(const k of (\[[^\]]*\]|\[\.\.\.(\w+), \.\.\.(\w+)\]|(\w+))\) provar\(k, \[([^\]]*)\]\)/.exec(rad);
      if (slinga) {
        const lista = { SPARR: ['CheckBlocks', 'GetAllBlocksForPatient', 'GetBlocksForPatient', 'RegisterTemporaryExtendedRevoke', 'CancelTemporaryExtendedRevoke'], SAMTYCKE: ['CheckConsent', 'RegisterExtendedConsent', 'CancelExtendedConsent', 'GetExtendedConsentsForPatient'] };
        const kontrakt = slinga[4] ? lista[slinga[4]] : slinga[2] ? [...lista[slinga[2]], ...lista[slinga[3]]] : [...slinga[1].matchAll(/'(\w+)'/g)].map(x => x[1]);
        const ids = [...slinga[5].matchAll(/'([^']+)'/g)].map(x => x[1]);
        for (const k of kontrakt) { const p = ut.get(aktuell).provar; p.set(k, new Set([...(p.get(k) ?? []), ...ids])); }
      }
    }
  }
  return ut;
}

describe('Regelförteckningarna för tjänstekontrakten', () => {
  const T = tester();
  for (const [doman, lista] of Object.entries(KONTRAKT)) {
    for (const kontrakt of lista) {
      test.skipIf(SAKNAS.length > 0)(`${kontrakt}: reglernas formulering finns ordagrant i TKB (kräver hämtad TKB)`, () => {
        const d = JSON.parse(readFileSync(join(REGLER, doman, `${kontrakt}.json`), 'utf8'));
        const fel = d.regler.filter(r => !r.text || !tkb(r.källa ?? `${doman}/${d.tkb}`).includes(norm(r.text))).map(r => `${r.id}: texten finns inte ordagrant i ${r.källa ?? `${doman}/${d.tkb}`}`);
        expect(fel).toEqual([]);
      });
      test(`${kontrakt}: reglerna har ett test eller ett skäl`, () => {
        const f = join(REGLER, doman, `${kontrakt}.json`);
        expect(existsSync(f)).toBe(true);
        const d = JSON.parse(readFileSync(f, 'utf8'));
        expect([d.domän, d.kontrakt]).toEqual([doman, kontrakt]);
        expect(d.tkb).toBe(textFor(DOKUMENT[doman].tkb));
        const sch = existsSync(join(REGLER, doman, `${kontrakt}.sch`)) ? new Set([...readFileSync(join(REGLER, doman, `${kontrakt}.sch`), 'utf8').matchAll(/<iso:assert id="([^"]+)"/g)].map(m => m[1])) : new Set();
        const fel = [];
        const ids = new Set();
        for (const r of d.regler) {
          if (ids.has(r.id)) fel.push(`${r.id}: id finns två gånger`);
          ids.add(r.id);
          if (!r.text) fel.push(`${r.id}: texten saknas`);
          if (!r.avsnitt) fel.push(`${r.id}: avsnitt saknas`);
          if (!['producent', 'konsument', 'båda'].includes(r.gäller)) fel.push(`${r.id}: gäller ${r.gäller}`);
          if (!STATUS.includes(r.status)) fel.push(`${r.id}: status ${r.status}`);
          if ((r.status === 'prövas') !== (r.prövas === true)) fel.push(`${r.id}: prövas och status stämmer inte`);
          if (r.prövas) {
            const t = T.get(r.test);
            if (!t) fel.push(`${r.id}: testet ${r.test} finns inte`);
            else if (!t.provar.get(kontrakt)?.has(r.id) && !(sch.has(r.id) && /fältreglerna i TKB|Vårdkällans begäran och den simulerade/.test(r.test))) fel.push(`${r.id}: testet ${r.test} säger inte att det prövar regeln`);
          } else if (!r.skäl) fel.push(`${r.id}: skäl saknas`);
          // Vårdkällans egna texter: inga tankstreck och inga tre punkter (TKB:s formulering citeras som den står).
          for (const x of [r.skäl, r.hur]) if (x && /[\u2013\u2014\u2026]|\.\.\./.test(x)) fel.push(`${r.id}: tankstreck eller tre punkter i egen text`);
        }
        // Varje regel som ett test säger att det prövar finns i förteckningen och pekar på ett test.
        for (const [namn, t] of T) for (const id of t.provar.get(kontrakt) ?? []) {
          const r = d.regler.find(x => x.id === id);
          if (!r) fel.push(`${namn} prövar ${id}, som inte finns`);
          else if (!r.prövas && r.status !== 'avvikelse') fel.push(`${id}: prövas i ${namn} men står inte som prövad`);
        }
        for (const id of sch) if (!ids.has(id)) fel.push(`${kontrakt}.sch har ${id}, som inte finns i förteckningen`);
        expect(fel).toEqual([]);
      });
    }
  }

  test('TKB och testsvitens filer är pinnade för alla domäner med byggda kontrakt', () => {
    for (const doman of Object.keys(KONTRAKT)) {
      const k = JSON.parse(readFileSync(join(RIVTA_ROT, doman, 'KALLA.json'), 'utf8'));
      expect([doman, Object.keys(k.text ?? {})]).toEqual([doman, [textFor(DOKUMENT[doman].tkb)]]);
      expect(Object.keys(k.dokument ?? {})).toContain(DOKUMENT[doman].tkb);
      // Runda 20: TKB och texten har ingen licens och ligger aldrig under app/rivta/.
      expect(k.utanförRepo).toEqual(expect.arrayContaining([DOKUMENT[doman].tkb, textFor(DOKUMENT[doman].tkb)]));
      for (const f of k.utanförRepo) expect([doman, f, existsSync(join(RIVTA_ROT, doman, f))]).toEqual([doman, f, false]);
    }
  });
});
