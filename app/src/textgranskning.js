// Runda 18, r4: textgranskningen vid varje version. De fyra publika sidorna #/testa, #/om, #/krav och #/moduler är det
// en ny besökare läser först, och deras handskrivna texter blir inaktuella när systemet växer. Därför granskas de vid
// varje ny version, och granskningen kan inte glömmas:
//
// - Varje källa med handskrivna texter (en vy, en lista med data) står i kallor() med de sidor den syns på. Texterna
//   tas ur källan själv: texten mellan taggarna och meningarna i en vy (uttryck i ${} räknas inte, de räknas fram), och
//   fälten med text i data som testrollerna, uppdragen och modulregistret.
// - src/textgranskning-granskade.js säger för varje källa i vilken version den senast granskades och vilka texter som
//   granskades då (en kort hash per text). Kända begränsningar har fältet granskad på varje post.
// - Testet i app/test/textgranskning.test.js stoppar bygget när en källa eller en begränsning är granskad i en äldre
//   version än package.json (major och minor), när en text är ny eller ändrad sedan granskningen, och när ett tal i
//   texterna inte stämmer med det som koden räknar fram (kontrolleraTal) eller inte går att kontrollera.
// - scripts/textgranskning.js renderar sidorna mot en bas-url och skriver texten och listan över det som ska granskas
//   till en Markdown-fil per sida (GET /api/textgranskning).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KANDA_BEGRANSNINGAR } from '../public/js/kanda-begransningar.js';
import { SPARAS, VARFOR, HUR_LANGE, VEM_LASER, PERSONNUMMER_TEXT, GALLRING_DAGAR, KONTAKT_DAGAR } from '../public/js/synpunkt-regler.js';
import { TESTROLLER, uppdragUt } from './testinbjudan.js';
import { MODULER, STATUSAR } from './moduler.js';
import { KRAV } from './krav.js';
import { PRINCIP, INTE_VARDEN } from './version.js';
import { TESTFALL } from './sussa-testfall.js';
import { SPEC } from './sussa/index.js';
import { SANDLADA_TIMMAR } from './sandlada-livslangd.js';
import { GRANSKADE } from './textgranskning-granskade.js';

const APP = join(import.meta.dir, '..');

// Sidorna och vyerna som skriptet renderar.
export const SIDOR = [
  { id: 'testa', namn: 'Testa Vårdkällan', vyer: [{ namn: 'Startsidan för testare', hash: '#/testa' }] },
  { id: 'om', namn: 'Om demon och testet', vyer: [{ namn: 'Om demon och testet', hash: '#/om' }] },
  { id: 'krav', namn: 'Kravspårbarhet', vyer: [{ namn: 'Sussas kravspecifikation', hash: '#/krav' }, { namn: 'Bör-krav och målbild', hash: '#/krav?vy=bor' }, { namn: 'Eget ramverk', hash: '#/krav?vy=egna' }] },
  { id: 'moduler', namn: 'Moduler', vyer: [{ namn: 'Moduler', hash: '#/moduler' }] },
];

// Versionen som texterna granskas mot: major och minor ur package.json.
export function aktuellVersion() {
  const v = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8')).version;
  return String(v).split('.').slice(0, 2).join('.');
}

export const normalisera = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
export const hashFor = (t) => createHash('sha256').update(normalisera(t)).digest('hex').slice(0, 10);

// Tar bort uttrycken i ${}, också när de har klamrar inuti, så att bara det handskrivna blir kvar.
function utanUttryck(s) {
  let ut = '';
  let djup = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '$' && s[i + 1] === '{') { djup++; i++; continue; }
    if (djup && s[i] === '{') { djup++; continue; }
    if (djup && s[i] === '}') { djup--; continue; }
    if (!djup) ut += s[i];
  }
  return ut;
}

// De handskrivna texterna i en vy: texten mellan taggar och meningar i strängar (till exempel rubriken och ingressen i
// vyRubrik). Kommentarer räknas inte.
export function vytexter(kod) {
  const utan = utanUttryck(kod.split('\n').filter(r => !/^\s*\/\//.test(r)).join('\n'));
  const ut = new Set();
  const lagg = (t) => {
    const x = normalisera(t);
    if (x.length >= 8 && /\p{L}{3,}.*\s/u.test(x) && !/=>|[;{}=<>]|\|\||&&/.test(x)) ut.add(x);
  };
  for (const m of utan.matchAll(/>([^<>`]+)</g)) lagg(m[1]);
  for (const m of utan.matchAll(/'((?:[^'\\\n]|\\.){12,})'/g)) if (/^\p{Lu}/u.test(m[1]) && (m[1].match(/ /g) ?? []).length >= 3) lagg(m[1].replace(/\\'/g, "'"));
  return [...ut];
}
const vy = (fil) => vytexter(readFileSync(join(APP, fil), 'utf8'));

// Källorna med handskrivna texter, per sida. perPost betyder att varje post har fältet granskad (kända begränsningar).
export function kallor() {
  const uppdrag = TESTROLLER.flatMap(r => [r.knapp, r.om, ...r.uppdrag.flatMap(u => { const x = uppdragUt(u); return [x.titel, ...x.text, x.fraga, x.slut]; })]);
  return [
    { id: 'testa-vy', sidor: ['testa'], namn: 'Startsidan för testare (public/js/vyer/testa.js)', texter: vy('public/js/vyer/testa.js') },
    { id: 'testinbjudan-panel', sidor: ['testa'], namn: 'Panelen med uppdragen (public/js/testinbjudan.js)', texter: vy('public/js/testinbjudan.js') },
    { id: 'testroller', sidor: ['testa'], namn: 'Testrollerna och uppdragen (src/testinbjudan.js)', texter: uppdrag },
    { id: 'synpunkter', sidor: ['testa', 'om'], namn: 'Vad som sparas och hur länge (public/js/synpunkt-regler.js)', texter: [...SPARAS, VARFOR, HUR_LANGE, VEM_LASER, PERSONNUMMER_TEXT] },
    { id: 'kanda-begransningar', sidor: ['testa', 'om'], namn: 'Kända begränsningar (public/js/kanda-begransningar.js)', perPost: true, texter: KANDA_BEGRANSNINGAR.flatMap(b => [b.rubrik, b.text]) },
    { id: 'om-vy', sidor: ['om'], namn: 'Om demon och testet (public/js/vyer/om.js)', texter: vy('public/js/vyer/om.js') },
    { id: 'version', sidor: ['om', 'krav'], namn: 'Versionsprincipen och vad 1.0 inte betyder (src/version.js)', texter: [PRINCIP, INTE_VARDEN] },
    { id: 'krav-vy', sidor: ['krav'], namn: 'Kravsidan (public/js/vyer/krav.js)', texter: vy('public/js/vyer/krav.js') },
    { id: 'egna-krav', sidor: ['krav'], namn: 'Det egna ramverket (src/krav.js)', texter: KRAV.flatMap(k => [k.rubrik, k.anmarkning]) },
    { id: 'sussa-testfall', sidor: ['krav'], namn: 'Sussas testfall under K4 (src/sussa-testfall.js och public/js/sussa-testfall-ui.js)', texter: [...TESTFALL.flatMap(t => [t.tidsklassSkal, t.saknas, ...(t.avvikelser ?? []), ...t.korningar.map(k => k.motivering)]), ...vy('public/js/sussa-testfall-ui.js')] },
    { id: 'moduler-vy', sidor: ['moduler'], namn: 'Modulsidan (public/js/vyer/moduler.js)', texter: vy('public/js/vyer/moduler.js') },
    { id: 'moduler', sidor: ['moduler'], namn: 'Modulregistret (src/moduler.js)', texter: [...Object.values(STATUSAR).flatMap(s => [s.rubrik, s.text]), ...MODULER.flatMap(m => [m.namn, m.beskrivning, m.simulerat, m.nas])] },
  ].map(k => ({ ...k, texter: [...new Set(k.texter.map(normalisera).filter(Boolean))] }));
}

// Granskningen: vad som ska granskas i versionen och varför. fel är meddelandena som testet visar, att är listan som
// skriptet skriver överst i varje sidas fil.
export function granska({ version = aktuellVersion(), kallor: k = kallor(), granskade = GRANSKADE, begransningar = KANDA_BEGRANSNINGAR } = {}) {
  const fel = [];
  const att = [];
  for (const x of k.filter(y => !y.perPost)) {
    const reg = Object.hasOwn(granskade, x.id) ? granskade[x.id] : null;
    const kanda = new Set(String(reg?.texter ?? '').split(/\s+/).filter(Boolean));
    const nya = x.texter.filter(t => !kanda.has(hashFor(t)));
    const fore = fel.length;
    if (!reg) {
      fel.push(`${x.namn} är inte granskad.`);
      att.push({ sidor: x.sidor, kalla: x.namn, vad: 'Alla texter i källan', granskad: null });
    } else if (reg.granskad !== version) {
      fel.push(`${x.namn} är granskad i ${reg.granskad}, inte i ${version}.`);
      att.push({ sidor: x.sidor, kalla: x.namn, vad: 'Alla texter i källan', granskad: reg.granskad });
    }
    for (const t of reg ? nya : []) {
      fel.push(`Ny eller ändrad text i ${x.namn} (${hashFor(t)}): ${t}`);
      att.push({ sidor: x.sidor, kalla: x.namn, vad: `Ny eller ändrad text: ${t}`, granskad: null });
    }
    if (fel.length > fore) fel.push(`  När texterna är granskade: '${x.id}': { granskad: '${version}', texter: '${x.texter.map(hashFor).join(' ')}' },`);
  }
  const kb = k.find(y => y.id === 'kanda-begransningar') ?? { sidor: ['testa', 'om'], namn: 'Kända begränsningar' };
  for (const b of begransningar.filter(y => y.granskad !== version)) {
    fel.push(`Kända begränsningar: ${b.rubrik} är granskad i ${b.granskad ?? 'ingen version'}, inte i ${version}.`);
    att.push({ sidor: kb.sidor, kalla: kb.namn, vad: b.rubrik, granskad: b.granskad ?? null });
  }
  return { version, fel, att };
}
export const attGranska = (o) => granska(o).att;

// Tal och fakta som texterna får nämna, räknade ur koden.
export function fakta() {
  return {
    sussaTestfall: TESTFALL.length,
    sussaPoster: SPEC.poster.length,
    sandladaTimmar: SANDLADA_TIMMAR,
    testroller: TESTROLLER.length,
    uppdrag: TESTROLLER.reduce((n, r) => n + r.uppdrag.length, 0),
    moduler: MODULER.length,
    gallringDagar: GALLRING_DAGAR,
    kontaktDagar: KONTAKT_DAGAR,
  };
}

export const TALORD = ['noll', 'en', 'två', 'tre', 'fyra', 'fem', 'sex', 'sju', 'åtta', 'nio', 'tio', 'elva', 'tolv'];
// Ett tal i siffror eller i ord från två till tolv. En och ett räknas inte, eftersom de oftast är artiklar (ett testfall).
const tal = (s) => { const i = TALORD.indexOf(String(s).toLowerCase()); return /^\d+$/.test(s) ? Number(s) : i >= 2 ? i : null; };

// Påståenden med tal som koden räknar fram. n är talet i texten, och varde det som det ska vara.
const N = '(?<n>\\d+|\\p{L}+)';
const UTV = () => SPEC.poster.filter(p => p.typ === 'utvarderingskriterium').length;
export const FAKTA = [
  { namn: 'Sussas testfall', re: new RegExp(`(?<![\\d.,])${N} (?:användbarhets)?testfall\\b`, 'giu'), varde: f => f.sussaTestfall },
  { namn: 'poster i Sussas kravspecifikation', re: /(?<![\d.,])(?<n>\d+) (?:krav|poster)\b/giu, varde: f => f.sussaPoster },
  { namn: 'utvärderingskriterier i Sussas kravspecifikation', re: /(?<![\d.,])(?<n>\d+) utvärderingskriterier\b/giu, varde: () => UTV() },
  { namn: 'sandlådans livslängd', re: new RegExp(`(?:försvinner|raderas)(?: \\p{L}+){0,8}? (?:efter|på) ${N} timmar`, 'giu'), varde: f => f.sandladaTimmar },
  { namn: 'gallringen av synpunkter', re: /svar raderas efter (?<n>\d+) dagar/giu, varde: f => f.gallringDagar },
  { namn: 'gallringen av kontaktuppgifter', re: /kontaktuppgift raderas redan efter (?<n>\d+) dagar/giu, varde: f => f.kontaktDagar },
  { namn: 'testrollerna', re: /(?<![\d.,])(?<n>\d+) (?:yrkesroller|testroller)\b/giu, varde: f => f.testroller },
  { namn: 'modulerna', re: /(?<![\d.,])(?<n>\d+) moduler\b/giu, varde: f => f.moduler },
];

// Tal av de slag som går att räkna fram ur koden: antal testfall, krav, poster, moduler, roller, uppdrag, tester och
// villkor, och tider för när något raderas. Ett sådant tal som ingen regel i FAKTA känner igen stoppar bygget, eftersom
// det inte går att kontrollera (fail closed). Andra tal (doser, steg, lagrum, årtal) är inte fakta om systemet.
const TALET = `(?<n>\\d+|${TALORD.slice(2).join('|')})`;
export const FAKTASLAG = [
  new RegExp(`(?<![\\d.,\\p{L}])${TALET} (?:användbarhetstestfall|testfall|krav|poster|utvärderingskriterier|moduler|roller|yrkesroller|testroller|demoroller|uppdrag|tester|servertester|gränssnittstester|villkor)\\b`, 'giu'),
  new RegExp(`(?:försvinner|raderas|gallras)(?: \\p{L}+){0,8}? (?:efter|på) ${TALET} (?:timmar|dagar|veckor|månader|år)\\b`, 'giu'),
];

// Undantag: tal av ett sådant slag som inte är fakta att räkna fram, med en motivering.
export const INTE_FAKTA = [
];

// Kontrollerar talen i texterna. texter är [{ kalla, text }]. Ett tal som en regel i FAKTA känner igen ska ha rätt värde,
// och ett tal av ett slag i FAKTASLAG som varken är en regel eller ett undantag i INTE_FAKTA stoppar: räkna fram det i
// koden, lägg till en regel i FAKTA eller ett undantag med motivering i INTE_FAKTA.
export function kontrolleraTal(texter, f = fakta(), { undantag = INTE_FAKTA } = {}) {
  const fel = [];
  for (const { kalla, text } of texter) {
    const tackt = new Array(text.length + 1).fill(false);
    const tack = (i, n) => { for (let j = i; j < i + n; j++) tackt[j] = true; };
    for (const r of FAKTA) {
      for (const m of text.matchAll(r.re)) {
        const n = tal(m.groups.n);
        if (n == null) continue;
        if (n !== r.varde(f)) fel.push(`${kalla}: "${m[0]}" ska vara ${r.varde(f)} (${r.namn}).`);
        tack(m.index, m[0].length);
      }
    }
    for (const [re] of undantag) for (const m of text.matchAll(re)) tack(m.index, m[0].length);
    for (const re of FAKTASLAG) {
      for (const m of text.matchAll(re)) {
        const i = m.index + m[0].lastIndexOf(m.groups.n);
        if (!tackt[i]) fel.push(`${kalla}: "${m[0]}" går inte att kontrollera mot koden: "${text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40)}"`);
      }
    }
  }
  return fel;
}

// Tankstreck, ellipser och ordet hen hör inte hemma i Vårdkällans texter.
export const FORBJUDNA_ORD = /[\u2014\u2013\u2026]|(?<!\p{L})hens?(?!\p{L})/u;

// Svaret från GET /api/textgranskning: vad som ska granskas, och uppdragens texter, som syns först efter inloggningen.
export function svar() {
  return {
    version: aktuellVersion(),
    sidor: SIDOR,
    attGranska: attGranska(),
    uppdrag: TESTROLLER.map(r => ({ id: r.id, knapp: r.knapp, om: r.om, uppdrag: r.uppdrag.map(uppdragUt) })),
  };
}
