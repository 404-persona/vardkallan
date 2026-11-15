// Runda 16, r2: hämtar Socialstyrelsens försäkringsmedicinska beslutsstöd (FMB) ur det öppna API:t och skriver ett
// utdrag till src/fmb/fmb-data.json, som Vårdkällans beslutsstöd vid sjukskrivning läser (src/fmb.js).
//
// Källa: https://api.socialstyrelsen.se/fmb (dokumentation:
// https://api.socialstyrelsen.se/fmb/dokumentation/psi/swagger-ui/index.html). Socialstyrelsen tillhandahåller datamängden
// med villkoret CC0 (https://www.socialstyrelsen.se/statistik-och-data/oppna-data/forsakringsmedicinskt-beslutsstod/).
// Utdraget tar med det som beslutsstödet visar: diagnosrubrikerna med sina ICD-10-SE-koder, de typiska
// funktionsnedsättningarna och aktivitetsbegränsningarna med ICF-koder, och typfallen med den rekommenderade
// sjukskrivningstiden och graden. Texterna förkortas inte och ändras inte, utom att HTML blir vanlig text.
//
//   bun scripts/fmb-hamta.js                         hämtar ur API:t
//   bun scripts/fmb-hamta.js diag.json typfall.json  läser två sparade svar från API:t
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const API = 'https://api.socialstyrelsen.se/fmb';
const UT = join(import.meta.dir, '..', 'src', 'fmb', 'fmb-data.json');

async function hamta(vag) {
  const r = await fetch(`${API}${vag}`, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${vag}: ${r.status}`);
  return r.json();
}

// HTML i texterna (listor och stycken) blir vanlig text med radbrytningar och punkter.
export function tillText(s) {
  return String(s ?? '')
    .replace(/<li[^>]*>/gi, '\n• ').replace(/<\/li>/gi, '')
    .replace(/<\/?(ul|ol|p|br)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .split('\n').map(r => r.trim()).filter(Boolean).join('\n');
}

const koder = (lista) => (lista ?? []).filter(Boolean).map(k => ({ kod: k.kod, text: k.beskrivning ?? null }));

export function utdrag(diag, typfall, hamtad) {
  const diagnoser = diag.data.map(({ id, attributes: a }) => ({
    id,
    rubrik: a.diagnosrubrik,
    koder: (a.diagnoskod ?? []).map(k => k.kod),
    funktionsnedsattning: tillText(a.funktionsnedsattning?.funktionsnedsattningsbeskrivning),
    funktionsnedsattningIcf: koder(a.funktionsnedsattning?.centralkod),
    aktivitetsbegransning: tillText(a.aktivitetsbegransning?.aktivitetsbegransningsbeskrivning),
    aktivitetsbegransningIcf: koder(a.aktivitetsbegransning?.centralkod),
    senastUppdaterad: a.senastuppdaterad ?? null,
  })).sort((x, y) => x.rubrik.localeCompare(y.rubrik, 'sv'));
  const typ = typfall.data.filter(t => t.attributes.status?.kod === 'giltig').map(({ id, attributes: a }) => {
    const r = a.rekommenderadsjukskrivning ?? {};
    return {
      id,
      koder: (a.fmbtillstand?.diagnoskod ?? []).map(k => k.kod),
      tillstand: (a.fmbtillstand?.tillstandsmening ?? '').trim(),
      rekommendation: tillText(r.typfalletsrekommenderadesjukskrivning),
      tid: r.maximalsjukskrivningstid == null || r.maximalsjukskrivningstid === '' ? null : Number(r.maximalsjukskrivningstid),
      enhet: r.maximalsjukskrivningsenhet ?? null,
      grad: r.maximalsjukskrivningsgrad?.beskrivning ?? null,
    };
  }).sort((x, y) => x.id.localeCompare(y.id));
  return {
    kalla: 'Socialstyrelsen, Försäkringsmedicinskt beslutsstöd, öppet API (https://api.socialstyrelsen.se/fmb)',
    licens: 'CC0',
    version: diag.meta?.version ?? null,
    hamtad,
    diagnoser,
    typfall: typ,
  };
}

if (import.meta.main) {
  const [d, t] = process.argv.slice(2);
  const diag = d ? JSON.parse(readFileSync(d, 'utf8')) : await hamta('/forsakringsmedicinskdiagnosinformation');
  const typfall = t ? JSON.parse(readFileSync(t, 'utf8')) : await hamta('/typfall');
  const hamtad = process.env.FMB_HAMTAD ?? new Date().toISOString().slice(0, 10);
  const ut = utdrag(diag, typfall, hamtad);
  mkdirSync(dirname(UT), { recursive: true });
  writeFileSync(UT, `${JSON.stringify(ut, null, 1)}\n`);
  console.log(`${ut.diagnoser.length} diagnosrubriker och ${ut.typfall.length} typfall skrivna till ${UT}`);
}
