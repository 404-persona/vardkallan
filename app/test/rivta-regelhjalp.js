// Testspår 2: hjälp för testerna av affärsreglerna i tjänstekontraktsbeskrivningarna (TKB). Reglerna står i
// app/rivta-regler/<domän>/<Kontrakt>.json med TKB:s formulering ordagrant, och fältreglerna dessutom som Schematron i
// <Kontrakt>.sch, där varje assert har regelns id. Ett test som prövar en regel säger det med provar(kontrakt, [id]) i
// testet, och test/rivta-regler.test.js kontrollerar att förteckningen och testerna stämmer med varandra.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { expect } from 'bun:test';
import { join } from 'node:path';
import { tolka } from '../src/rivta/xml.js';
import { schematron } from '../src/rivta/schematron.js';
import * as F from './rivta-facit.js';

export const REGLER = join(import.meta.dir, '..', 'rivta-regler');

// Markerar att testet prövar reglerna. Ger id:na, så att de kan användas i testet.
export const provar = (kontrakt, ids) => { void kontrakt; return ids; };

export const forteckning = (doman, kontrakt) => JSON.parse(readFileSync(join(REGLER, doman, `${kontrakt}.json`), 'utf8'));

const schCache = new Map();
export function regelSchema(doman, kontrakt) {
  const f = join(REGLER, doman, `${kontrakt}.sch`);
  if (!schCache.has(f)) schCache.set(f, existsSync(f) ? schematron(readFileSync(f, 'utf8')) : null);
  return schCache.get(f);
}

// Prövar ett meddelande (ett kuvert eller ett element som text) mot Vårdkällans regler ur TKB och, när den finns, mot
// Ineras constraints.xml i testsviten. Ger [{ id, nod, test, kalla }].
export function prova(text, { doman, kontrakt, mapp = null }) {
  const rot = tolka(text);
  const ut = [];
  const s = regelSchema(doman, kontrakt);
  if (s) ut.push(...s.prova(rot).map(f => ({ id: f.id, nod: f.nod, test: f.test, kalla: 'TKB' })));
  const c = mapp ? F.constraints(doman, mapp) : null;
  if (c) ut.push(...c.prova(rot).map(f => ({ id: f.id ?? f.monster, nod: f.nod, test: f.test, kalla: 'Ineras constraints.xml' })));
  return ut;
}

// Ineras exempel i en testsvit: begäran i testfallen (med testsvitens egna data.xml) och svaren i mocken. Ger
// [{ namn, text, tvattat, saknas }]. Testsvitens platshållare ${...} som inte finns i data.xml blir kvar, och ? är
// SoapUI:s platshållare för en sträng.
export function exempel(doman, mapp, { extra = {} } = {}) {
  const p = F.projekt(doman, mapp);
  const d = F.data(doman, mapp);
  const ut = [];
  for (const tf of p.testfall) {
    for (const s of tf.steg.filter(x => x.typ === 'request')) {
      const f = F.fyllI(s.text, { ...d.global, ...(d.testfall[tf.namn] ?? {}), ...extra });
      const t = F.tvatta(f.text);
      ut.push({ namn: `${tf.namn}: ${s.namn}`, text: t.text, tvattat: t.tvattat, saknas: f.saknas });
    }
  }
  // Mockens platshållare fylls i av SoapUI ur begäran. Här fylls de i med testsvitens egna uppgifter (data.xml för
  // producentens testsvit), och documentId med ett påhittat id.
  const svit = mapp.endsWith('Mock') ? F.data(doman, mapp.slice(0, -4)) : { global: {} };
  const mockVarden = { patientIdType: '1.2.752.129.2.1.3.1', documentId: 'exempel-1', ...svit.global, ...d.global, ...extra };
  for (const m of p.mock) {
    const f = F.fyllI(m.text, mockVarden);
    const t = F.tvatta(f.text);
    ut.push({ namn: `mock ${m.operation}: ${m.namn}`, text: t.text, tvattat: t.tvattat, saknas: f.saknas });
  }
  return ut;
}

// Kroppens element i ett kuvert, eller null.
export function kropp(text) {
  const k = F.kuvertAv(text);
  return k.fel || k.fault ? null : k.kropp;
}

// Felen i Ineras exempel skrivs till <Kontrakt>.exempelfel.json med VK_SKRIV_EXEMPELFEL=1 och jämförs annars med filen.
export function jamforExempelfel(doman, kontrakt, fel) {
  const f = join(REGLER, doman, `${kontrakt}.exempelfel.json`);
  if (process.env.VK_SKRIV_EXEMPELFEL === '1' || !existsSync(f)) writeFileSync(f, `${JSON.stringify({ beskrivning: `Fel i Ineras exempel för ${kontrakt} (testsvitens begäran och mockens svar) mot schemat, TKB:s regler och testsvitens egna Schematron-regler. Felen redovisas och rättas inte. Platshållarna i exemplen (\${...} och ?) är ifyllda med testsvitens egna uppgifter där de finns.`, fel }, null, 2)}\n`);
  expect(fel).toEqual(JSON.parse(readFileSync(f, 'utf8')).fel);
}

// Prövar varje exempel: kuvertet, schemat för kroppen och reglerna. Ger en sorterad lista med fel per exempel.
export function exempelfel(doman, kontrakt, mapp, def, { mock = null } = {}) {
  const ut = [];
  for (const e of [...exempel(doman, mapp), ...(mock ? exempel(doman, mock).filter(x => x.namn.startsWith('mock ')) : [])]) {
    const fel = [];
    if (e.tvattat) fel.push('exemplet har tecknen \\r som text mellan elementen i kuvertet');
    if (e.saknas.length) fel.push(`platshållare utan värde i testsviten: ${e.saknas.join(', ')}`);
    const k = F.kuvertAv(e.text);
    if (k.fel) { fel.push(`inget giltigt SOAP-kuvert: ${k.fel.message}`); ut.push({ exempel: e.namn, fel }); continue; }
    if (k.fault) continue;
    const s = def.schema.validera(k.kropp);
    if (s.length) fel.push(...s.slice(0, 5).map(x => `schemat: ${x}`));
    // Mockens svar prövas också mot testsvitens Schematron för producenten, och begäran mot den för konsumenten.
    const egen = e.namn.startsWith('mock ') ? mapp : (mock && existsSync(F.katalog(doman, mock)) ? mock : null);
    for (const f of prova(e.text, { doman, kontrakt, mapp: egen })) fel.push(`${f.kalla} ${f.id ?? ''}: ${f.nod}`);
    if (fel.length) ut.push({ exempel: e.namn, fel: [...new Set(fel)] });
  }
  return ut;
}

