// Testspår 2: Ineras testsviter och exempel för de byggda kontrakten som facit. Filerna är pinnade under
// app/rivta/<domän>/test-suite/ (sha256 i KALLA.json) och läses som data: SoapUI-projekten tolkas som XML, och inget av
// deras Groovy-skript körs. Det som skripten gör med Ineras eget hjälpbibliotek (ContentAssertions i soapui-support) och
// SoapUI:s egna kontroller görs i stället här, med samma innebörd, så långt det går utan SoapUI:
//
//   SOAP Response               svaret är ett SOAP-kuvert
//   SOAP Fault Assertion        svaret är inget SOAP Fault (SoapUI:s typ heter så, men kontrollen visas som Not SOAP Fault)
//   Not SOAP Fault Assertion    svaret är ett SOAP Fault (visas som SOAP Fault i SoapUI)
//   Schema Compliance           kroppen följer kontraktets schema
//   Simple Contains/NotContains svaret innehåller eller innehåller inte en text
//   Response SLA Assertion      svarstiden är högst den angivna
//   assertSchematronConstraints testsvitens constraints.xml (src/rivta/schematron.js)
//   assertNonEmptyResponse, assertExactNumberOfRecords, assertSpecificValueIn(All|Any)Record,
//   assertElementExistsIn(All|Any)Record, assertElementExcludedInAnyRecord, assertValidEncoding
//
// Ett Groovy-skript med något annat än dessa anrop (egna slutningar, flera anrop i följd med räknade värden) körs inte,
// och skälet står i resultatet. Posterna i ett svar är svarselementets barn med det namn som vägen börjar med (eller
// alla barn utom result). Vägarna jämförs på lokala namn, utan prefix.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tolka, barnen, barn, attribut } from '../src/rivta/xml.js';
import { lasKuvert, SoapFel, SOAP_NS } from '../src/rivta/soap.js';
import { schematron } from '../src/rivta/schematron.js';
import { RIVTA_ROT } from '../src/rivta/kontrakt.js';

const CON = 'http://eviware.com/soapui/config';
const STORT = { byte: 16 * 1024 * 1024, element: 1_000_000, djup: 200 };
const lokal = (el, namn) => barnen(el, namn, CON);
const ett = (el, namn) => barn(el, namn, CON);

export const katalog = (doman, mapp) => join(RIVTA_ROT, doman, 'test-suite', mapp);

// Ett SoapUI-projekt: testfallen med sina steg och kontroller, och mockens svar.
export function projekt(doman, mapp) {
  const k = katalog(doman, mapp);
  const fil = readdirSync(k).find(f => f.endsWith('-soapui-project.xml'));
  const rot = tolka(readFileSync(join(k, fil), 'utf8'), STORT);
  const av = (el) => attribut(el, 'disabled') === 'true';
  const huvuden = (req) => {
    const s = lokal(ett(req, 'settings') ?? { barn: [] }, 'setting').find(x => attribut(x, 'id')?.endsWith('@request-headers'));
    if (!s) return {};
    const frag = tolka(s.text);
    return Object.fromEntries(barnen(frag, 'entry', CON).map(e => [attribut(e, 'key'), attribut(e, 'value')]));
  };
  const kontroll = (a) => ({
    typ: attribut(a, 'type'), namn: attribut(a, 'name'), av: av(a),
    // scriptText och script står utan namnrymd i SoapUI-projekten.
    skript: barn(ett(a, 'configuration') ?? { barn: [] }, 'scriptText', '')?.text ?? null,
    konfig: Object.fromEntries((ett(a, 'configuration')?.barn ?? []).map(b => [b.lokal, b.text])),
  });
  const testfall = [];
  for (const svit of lokal(rot, 'testSuite')) {
    for (const tc of lokal(svit, 'testCase')) {
      const steg = [];
      for (const st of lokal(tc, 'testStep')) {
        const config = ett(st, 'config');
        const typ = attribut(st, 'type');
        if (typ === 'request') {
          const req = ett(config, 'request');
          steg.push({ typ, namn: attribut(st, 'name'), av: av(st), operation: ett(config, 'operation')?.text ?? null, text: ett(req, 'request')?.text ?? '',
            huvuden: huvuden(req), kontroller: lokal(req, 'assertion').map(kontroll) });
        } else steg.push({ typ, namn: attribut(st, 'name'), av: av(st), skript: config ? (barn(config, 'script', '')?.text ?? null) : null });
      }
      testfall.push({ svit: attribut(svit, 'name'), namn: attribut(tc, 'name'), av: av(tc) || av(svit), steg });
    }
  }
  const mock = [];
  for (const ms of lokal(rot, 'mockService')) {
    for (const op of lokal(ms, 'mockOperation')) {
      for (const r of lokal(op, 'response')) mock.push({ operation: attribut(op, 'name'), namn: attribut(r, 'name'), text: ett(r, 'responseContent')?.text ?? '' });
    }
  }
  return { fil: join(k, fil), namn: attribut(rot, 'name'), testfall, mock };
}

// data.xml: de globala uppgifterna och varje testfalls egna. Kommentarer i filen är inga uppgifter.
export function data(doman, mapp) {
  const f = join(katalog(doman, mapp), 'data.xml');
  if (!existsSync(f)) return { global: {}, testfall: {} };
  // Filen har en instruktion för en stilmall (xml-stylesheet), som tolken inte tar emot. Den behövs inte för uppgifterna.
  const rot = tolka(readFileSync(f, 'utf8').replace(/<\?xml-stylesheet[^?]*\?>/g, ''));
  const platt = (el) => Object.fromEntries((el?.barn ?? []).filter(b => !b.barn.length).map(b => [b.lokal, b.text.trim()]));
  return {
    global: platt(barn(rot, 'globaldata')),
    testfall: Object.fromEntries(barnen(rot, 'testcase').map(t => [attribut(t, 'id'), { ...platt(barn(t, 'data')), ...(barn(t, 'description') ? { beskrivning: barn(t, 'description').text.trim() } : {}) }])),
  };
}

// Testsviternas SoapUI-projekt har på många ställen de två tecknen \\r (ett omvänt snedstreck och ett r) före
// radbrytningarna i exemplen, kvar från en äldre export. Det blir text mellan kuvertets element, och ett SOAP 1.1-kuvert
// får bara ha element där (Vårdkällan svarar med soap:Client). Felet i exemplet redovisas (test/rivta-facit-*.test.js),
// och för att resten av testfallet ska kunna prövas tas tecknen bort. Ger { text, tvattat }.
export function tvatta(text) {
  const ut = text.replace(/\\r(?=\r?\n)/g, '');
  return { text: ut, tvattat: ut !== text };
}

// Fyller i ${namn}, ${#Project#namn} och ${#TestCase#namn}. Ger { text, saknas: [namn] }.
export function fyllI(text, varden) {
  const saknas = new Set();
  const ut = text.replace(/\$\{(?:#(?:Project|TestCase|TestSuite)#)?([^}]+)\}/g, (m, namn) => {
    if (Object.hasOwn(varden, namn)) return xmlText(varden[namn]);
    saknas.add(namn);
    return m;
  });
  return { text: ut, saknas: [...saknas] };
}
const xmlText = (v) => String(v).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// ---------------------------------------------------------------------------------------------------------------
// Kontrollerna.
const schematronCache = new Map();
export function constraints(doman, mapp) {
  const f = join(katalog(doman, mapp), 'constraints.xml');
  if (!schematronCache.has(f)) schematronCache.set(f, existsSync(f) ? schematron(readFileSync(f, 'utf8')) : null);
  return schematronCache.get(f);
}

const stegNamn = (vag) => vag.split('/').filter(Boolean).map(s => s.replace(/^[^:]*:/, ''));
function poster(svarEl, vag = null) {
  const forsta = vag ? stegNamn(vag)[0] : null;
  return svarEl.barn.filter(b => (forsta ? b.lokal === forsta : b.lokal !== 'result'));
}
function iPost(post, vag) {
  let noder = [post];
  for (const n of stegNamn(vag).slice(1)) noder = noder.flatMap(x => x.barn.filter(b => b.lokal === n));
  return noder;
}
const text = (el) => el.text + el.barn.map(text).join('');

// Ett anrop till ContentAssertions i ett Groovy-skript. Ger null när skriptet inte kan köras här.
const KAND = /^\s*ca\.(assertSchematronConstraints|assertNonEmptyResponse|assertExactNumberOfRecords|assertSpecificValueInAllRecords|assertSpecificValueInAnyRecord|assertElementExistsInAnyRecord|assertElementExistsInAllRecords|assertElementExcludedInAnyRecord|assertValidEncoding)\(([^()]*)\)\s*;?\s*$/;
export function groovyAnrop(skript) {
  const rader = skript.split('\n').map(r => r.trim()).filter(r => r && !r.startsWith('//') && !/^import\s/.test(r) && !/^def ca = new ContentAssertions\(context, messageExchange(, log)?\)$/.test(r));
  if (!rader.length) return [];
  const ut = [];
  for (const r of rader) {
    const m = KAND.exec(r);
    if (!m) return null;
    const arg = m[2].trim() ? m[2].split(',').map(a => a.trim()) : [];
    ut.push({ metod: m[1], arg });
  }
  return ut;
}

// Kör en kontroll på ett svar. svar: { status, huvuden, text, ms }. Ger { ok, text } eller { hoppad: skäl }.
export function korKontroll(k, svar, { def, doman, mapp, varden }) {
  if (k.av) return { hoppad: 'Kontrollen är avstängd i testsviten.' };
  let kv = null;
  const kuvertet = () => (kv ??= (() => { try { return lasKuvert(svar.text); } catch (e) { return { fel: e }; } })());
  const kropp = () => kuvertet().kropp;
  switch (k.typ) {
    case 'SOAP Response': return kuvertet().fel ? { ok: false, text: `Svaret är inget SOAP-kuvert: ${kuvertet().fel.message}` } : { ok: true };
    case 'SOAP Fault Assertion': return kuvertet().fault ? { ok: false, text: `Svaret är ett SOAP Fault: ${kuvertet().fault.text}` } : { ok: !kuvertet().fel, text: kuvertet().fel?.message };
    case 'Not SOAP Fault Assertion': return kuvertet().fault ? { ok: true } : { ok: false, text: 'Svaret ska vara ett SOAP Fault.' };
    case 'Schema Compliance': {
      if (kuvertet().fault) return { ok: true, text: 'Ett SOAP Fault följer SOAP-schemat.' };
      if (!kropp()) return { ok: false, text: 'Svaret har ingen kropp.' };
      const fel = def.schema.validera(kropp());
      return fel.length ? { ok: false, text: fel.slice(0, 3).join(' ') } : { ok: true };
    }
    case 'Simple NotContains': return svar.text.includes(k.konfig.token ?? '') ? { ok: false, text: `Svaret innehåller ${k.konfig.token}.` } : { ok: true };
    case 'Simple Contains': return svar.text.includes(k.konfig.token ?? '') ? { ok: true } : { ok: false, text: `Svaret innehåller inte ${k.konfig.token}.` };
    case 'Response SLA Assertion': { const sla = Number(k.konfig.SLA ?? k.konfig.sla ?? 30000); return svar.ms <= sla ? { ok: true } : { ok: false, text: `Svarstiden ${svar.ms} ms är längre än ${sla} ms.` }; }
    case 'GroovyScriptAssertion': {
      const anrop = k.skript == null ? null : groovyAnrop(k.skript);
      if (anrop == null || !anrop.length) return { hoppad: 'Groovy-skriptet gör mer än Ineras ContentAssertions och kan inte köras utanför SoapUI.' };
      for (const a of anrop) {
        const r = contentAssertion(a, { svar, kuvert: kuvertet(), def, doman, mapp, varden });
        if (r.hoppad || !r.ok) return r;
      }
      return { ok: true };
    }
    default: return { hoppad: `SoapUI-kontrollen ${k.typ} gäller SoapUI självt och prövas inte här.` };
  }
}

function contentAssertion({ metod, arg }, { svar, kuvert, doman, mapp, varden }) {
  if (kuvert.fel) return { ok: false, text: kuvert.fel.message };
  if (kuvert.fault) return { ok: false, text: `Svaret är ett SOAP Fault: ${kuvert.fault.text}` };
  const svarEl = kuvert.kropp;
  const v = (a) => {
    const m = /^'(.*)'$/.exec(a) ?? /^"(.*)"$/.exec(a);
    if (m) return m[1];
    const c = /^context\.(\w+)$/.exec(a);
    if (c) return Object.hasOwn(varden, c[1]) ? varden[c[1]] : undefined;
    if (/^\d+$/.test(a)) return Number(a);
    return undefined;
  };
  const args = arg.map(v);
  // En väg som börjar med svarselementet självt (som /urn:UpdateResponse/urn:ResultCode) räknas från svarselementet.
  if (typeof args[0] === 'string' && stegNamn(args[0])[0] === svarEl?.lokal) args[0] = `/${stegNamn(args[0]).slice(1).join('/')}`;
  if (args.some(x => x === undefined)) return { hoppad: `Argumenten ${arg.join(', ')} kan inte räknas fram utanför SoapUI.` };
  switch (metod) {
    case 'assertSchematronConstraints': {
      const s = constraints(doman, mapp);
      if (!s) return { ok: false, text: 'Testsviten har ingen constraints.xml.' };
      const fel = s.prova(tolka(svar.text));
      return fel.length ? { ok: false, text: fel.slice(0, 3).map(f => `${f.nod}: ${f.test}`).join(' | ') } : { ok: true };
    }
    case 'assertNonEmptyResponse': return poster(svarEl).length ? { ok: true } : { ok: false, text: 'Svaret har inga poster.' };
    case 'assertExactNumberOfRecords': { const n = poster(svarEl).length; return n === args[0] ? { ok: true } : { ok: false, text: `Svaret har ${n} poster, inte ${args[0]}.` }; }
    case 'assertSpecificValueInAllRecords':
    case 'assertSpecificValueInAnyRecord': {
      const p = poster(svarEl, args[0]);
      if (!p.length) return { ok: false, text: 'Svaret har inga poster.' };
      const har = (x) => iPost(x, args[0]).some(n => text(n).trim() === String(args[1]));
      const ok = metod.endsWith('AllRecords') ? p.every(har) : p.some(har);
      return ok ? { ok: true } : { ok: false, text: `${metod.endsWith('AllRecords') ? 'Inte alla' : 'Ingen'} av posterna har ${args[0]} = ${args[1]}.` };
    }
    case 'assertElementExistsInAnyRecord':
    case 'assertElementExistsInAllRecords': {
      const p = poster(svarEl, args[0]);
      if (!p.length) return { ok: false, text: 'Svaret har inga poster.' };
      const har = (x) => iPost(x, args[0]).length > 0;
      const ok = metod.endsWith('AllRecords') ? p.every(har) : p.some(har);
      return ok ? { ok: true } : { ok: false, text: `${metod.endsWith('AllRecords') ? 'Inte alla' : 'Ingen'} av posterna har ${args[0]}.` };
    }
    case 'assertElementExcludedInAnyRecord': {
      const p = poster(svarEl, args[0]);
      if (!p.length) return { ok: false, text: 'Svaret har inga poster.' };
      return p.some(x => !iPost(x, args[0]).length) ? { ok: true } : { ok: false, text: `Alla poster har ${args[0]}.` };
    }
    case 'assertValidEncoding': {
      const prolog = /^\s*<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/.exec(svar.text)?.[1] ?? null;
      const typ = /charset=([^;\s]+)/i.exec(svar.huvuden?.['Content-Type'] ?? '')?.[1] ?? null;
      const giltig = (x) => x == null || /^utf-(8|16)$/i.test(x);
      if (!giltig(prolog) || !giltig(typ)) return { ok: false, text: `Teckenuppsättningen är ${prolog ?? typ}, inte UTF-8 eller UTF-16.` };
      if (prolog && typ && prolog.toLowerCase() !== typ.toLowerCase()) return { ok: false, text: `XML-prologen (${prolog}) och Content-Type (${typ}) har olika teckenuppsättningar.` };
      return { ok: true };
    }
    default: return { hoppad: `${metod} körs inte här.` };
  }
}

// Kör ett testfall mot en tjänst i samma process. skicka({ text, soapAction, huvuden }) ger { status, huvuden, text }.
// Ger { namn, steg: [{ namn, kontroller: [{ typ, namn, ok, text, hoppad }] }], saknas }.
export async function korTestfall(tf, { varden, skicka, def, doman, mapp }) {
  const ut = { namn: tf.namn, steg: [], saknas: [] };
  for (const s of tf.steg) {
    if (s.typ !== 'request' || s.av) continue;
    const ifyllt = fyllI(s.text, varden);
    ut.saknas.push(...ifyllt.saknas);
    const { text, tvattat } = tvatta(ifyllt.text);
    if (tvattat) ut.tvattat = true;
    const huv = Object.fromEntries(Object.entries(s.huvuden).filter(([k]) => k !== 'x-mock-response').map(([k, v]) => [k, fyllI(v ?? '', varden).text]));
    const t0 = performance.now();
    const svar = await skicka({ text, soapAction: def.soapAction, huvuden: huv });
    svar.ms = performance.now() - t0;
    const kontroller = s.kontroller.map(k => ({ typ: k.typ, namn: k.namn, ...korKontroll(k, svar, { def, doman, mapp, varden }) }));
    ut.steg.push({ namn: s.namn, begaran: text, svar: svar.text, kontroller });
  }
  return ut;
}

// Mockens svar som exempel: ${...} fylls i med värdena, och ? (SoapUI:s platshållare för en sträng) står kvar.
export function mockSvar(doman, mapp, varden = {}) {
  return projekt(doman, mapp).mock.map(m => ({ ...m, ...fyllI(m.text, varden) }));
}

// Ett exempel ur en testsvit eller ett mocksvar som ett kuvert: ger kroppens element eller felet.
export function kuvertAv(text) {
  try { return lasKuvert(text); } catch (e) { if (e instanceof SoapFel) return { fel: e }; throw e; }
}
export { SOAP_NS };
