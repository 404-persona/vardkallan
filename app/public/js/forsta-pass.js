// Runda 18, r1: vägledningen och mätningen i första passet. Ett lager ovanpå vyerna som pekar på befintliga element; det
// ändrar inga vyer. Stegen står i forsta-pass-steg.js och delas med servern.
//
// Vägledningen. En ram runt elementet som är nästa steg och en kort mening bredvid (på smal skärm bara ramen, eftersom
// meningen står i panelen). Ramen och meningen tar inte emot klick, så de skymmer aldrig det som ska klickas. Steget
// räknas fram ur det som syns efter varje ändring i sidan, så att vägledningen följer med när testaren tar en annan väg.
// Meningen läses upp för skärmläsare i panelen (aria-live), och Visa var flyttar fokus till elementet. Vägledningen kan
// stängas av och slås på igen; valet sparas i webbläsaren.
//
// Mätningen, bara när testaren har sagt ja: klick, fältbyten och tangenter med samma regler som klickbudgeten
// (anvandartest-rakning.js), tiden till första handlingen, tiden i varje steg, återvändor (testaren kommer tillbaka till
// ett steg som den redan har lämnat), öppnad hjälp och sökningar. Inget av det som skrivs, ingen adress och ingen text ur
// sidan följer med: bara stegens id och talen. Tillståndet ligger i sessionStorage, så att passet fortsätter om sidan
// laddas om, och när fliken stängs skickas det som har mätts hittills som ett delresultat.
//
// Runda 19, r1: samma vägledning i alla uppdrag. Under ett uppdrag (inget pass pågår och ingen jämförelsefråga väntar)
// hämtas stegen för det aktuella uppdraget ur uppdrag-steg/<testroll>.js, med dynamisk import så att bara den aktuella
// rollens fil hämtas. Byts uppdraget byts stegen. Vägledningen i passet visas direkt när passet börjar, också innan
// testaren har svarat på frågan om mätning. Mätningen gäller bara passet och börjar när testaren har sagt ja.
import { api } from './ui.js';
import { nyRakning, registrera } from './anvandartest-rakning.js';
import { malFor, arTextfalt } from './anvandartest.js';
import { stegFor } from './forsta-pass-steg.js';

const NYCKEL = 'vk_forsta_pass';
const AV = 'vk_forsta_pass_av';
const las = (k, s = sessionStorage) => { try { return s.getItem(k); } catch { return null; } };
const satt = (k, v, s = sessionStorage) => { try { if (v == null) s.removeItem(k); else s.setItem(k, v); } catch { /* utan lagring */ } };

let P = null;
let steg = [];
let nu = null;
let paSteg = null;
let lyssnar = false;
let observator = null;
let timer = null;
let ram = null;
let etikett = null;
// Runda 19, r1: vad vägledningen följer just nu: { typ: 'pass' | 'uppdrag', nyckel }. Stegfilerna per testroll.
let lage = null;
const stegFiler = new Map();

const spara = () => { if (P) satt(NYCKEL, JSON.stringify(P)); };
export const vagledningPa = () => las(AV, localStorage) !== '1';

// Startar eller fortsätter vägledningen i passet eller i det aktuella uppdraget. T är tillståndet från servern. onSteg
// anropas när steget byts.
export function aktivera(T, { onSteg } = {}) {
  paSteg = onSteg ?? paSteg;
  const p = T?.pass;
  if (p && (p.fas === 'pagar' || p.fas === 'samtycke')) { aktiveraPass(T); return; }
  const id = uppdragNu(T);
  if (id) { aktiveraUppdrag(T, id); return; }
  stoppa();
}
// Runda 19, r1: uppdraget som vägledningen följer, när inget pass pågår och ingen jämförelsefråga väntar.
export const uppdragNu = (T) => (T?.aktiv && (!T.pass || T.pass.fas === 'klar') && T.aktuellt && !T.attBesvara?.length ? T.aktuellt : null);
export const harVagledning = (T) => Boolean((T?.pass && ['pagar', 'samtycke'].includes(T.pass.fas)) || uppdragNu(T));
// Stegen för en testroll. Testrollens id kommer från servern och har bara små bokstäver och bindestreck.
export function hamtaStegfil(testroll) {
  if (!/^[a-z][a-z-]*$/.test(String(testroll))) return Promise.resolve({});
  if (!stegFiler.has(testroll)) stegFiler.set(testroll, import(`./uppdrag-steg/${testroll}.js`).then(m => m.default ?? {}).catch(() => { stegFiler.delete(testroll); return {}; }));
  return stegFiler.get(testroll);
}
function aktiveraUppdrag(T, id) {
  const nyckel = `${T.testroll}|${T.start}|${id}`;
  if (lage?.nyckel === nyckel) { if (lyssnar) berakna(); return; }
  if (lage?.typ === 'pass') stoppa();
  lage = { typ: 'uppdrag', nyckel, laddar: true };
  steg = [];
  nu = null;
  forraId = null;
  doljRam();
  hamtaStegfil(T.testroll).then((alla) => {
    if (lage?.nyckel !== nyckel) return;
    lage.laddar = false;
    steg = Object.hasOwn(alla, id) && Array.isArray(alla[id]) ? alla[id] : [];
    borja();
    berakna();
    paSteg?.(stegInfo());
  });
}
function aktiveraPass(T) {
  const p = T.pass;
  const nyckel = `pass|${T.testroll}|${T.start}`;
  if (lage && lage.nyckel !== nyckel) stoppa();
  lage = { typ: 'pass', nyckel };
  if (!P || P.testroll !== T.testroll || P.start !== T.start) {
    let sparat = null;
    try { sparat = JSON.parse(las(NYCKEL) ?? 'null'); } catch { sparat = null; }
    P = sparat && sparat.testroll === T.testroll && sparat.start === T.start ? sparat : {
      testroll: T.testroll, start: T.start, uppdrag: p.uppdrag, matning: p.matning, borjan: Date.now(), rakning: nyRakning(), forstaMs: null,
      steg: {}, aktuellt: null, sedan: Date.now(), hjalp: 0, sokningar: 0, aterkomster: 0, avstangd: 0, avstangdHela: false,
    };
  }
  // Runda 19, r1: vägledningen börjar direkt, men mätningen börjar först när testaren har sagt ja.
  if (P.matning !== 'ja' && p.matning === 'ja') {
    const t = Date.now();
    Object.assign(P, { borjan: t, sedan: t, rakning: nyRakning(), forstaMs: null, steg: {}, hjalp: 0, sokningar: 0, aterkomster: 0 });
    if (P.aktuellt) stegData(P.aktuellt).besok = 1;
  }
  P.matning = p.matning;
  spara();
  steg = stegFor(T.testroll);
  borja();
  berakna();
}
const matarPass = () => lage?.typ === 'pass' && P && P.matning === 'ja';

function borja() {
  if (lyssnar) return;
  lyssnar = true;
  for (const typ of ['pointerdown', 'click', 'focusin', 'keydown', 'change']) document.addEventListener(typ, lyssna, true);
  document.addEventListener('toggle', hjalpOppnad, true);
  window.addEventListener('hashchange', planera);
  window.addEventListener('resize', placera);
  window.addEventListener('scroll', placera, true);
  window.addEventListener('pagehide', delresultat);
  document.addEventListener('vk-sokning', matSokning);
  observator = new MutationObserver(planera);
  observator.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open', 'class', 'disabled'] });
}

// Stoppar vägledningen och lyssnandet. Mätningen ligger kvar tills den är skickad (skicka).
export function stoppa() {
  if (lyssnar) {
    lyssnar = false;
    for (const typ of ['pointerdown', 'click', 'focusin', 'keydown', 'change']) document.removeEventListener(typ, lyssna, true);
    document.removeEventListener('toggle', hjalpOppnad, true);
    window.removeEventListener('hashchange', planera);
    window.removeEventListener('resize', placera);
    window.removeEventListener('scroll', placera, true);
    window.removeEventListener('pagehide', delresultat);
    document.removeEventListener('vk-sokning', matSokning);
    observator?.disconnect();
    observator = null;
  }
  clearTimeout(timer);
  doljRam();
  nu = null;
  lage = null;
  forraId = null;
}
export const pagar = () => lyssnar;

// Räkningen. Klick i panelen, i synpunkten och i SUS-rutan räknas inte, eftersom de inte hör till uppgiften.
function lyssna(e) {
  if (!matarPass()) return;
  if (!e.isTrusted && !(e.type === 'change' && e.target instanceof HTMLSelectElement)) return;
  if (e.target instanceof Element && e.target.closest('#testare, .synpunkt-dialog, .fp-sus-dialog, #testlage')) return;
  const h = { typ: e.type, tid: Date.now(), mal: malFor(e.target), detail: e.detail };
  if (e.type === 'keydown') Object.assign(h, { tangent: e.key, iTextfalt: arTextfalt(e.target), iTextruta: e.target instanceof HTMLTextAreaElement, iLista: e.target instanceof HTMLSelectElement });
  const r = P.rakning;
  const fore = r.klick + r.faltbyten + r.tangenter;
  registrera(r, h);
  // Stegloggen behövs inte här och sparas inte: den har knapparnas texter.
  r.steg = [];
  if (P.forstaMs == null && fore === 0 && r.klick + r.faltbyten + r.tangenter > 0) P.forstaMs = Date.now() - P.borjan;
  spara();
}
const stegData = (id) => (P.steg[id] ??= { tidMs: 0, aterkomster: 0, hjalp: 0, sokningar: 0, besok: 0 });
function hjalpOppnad(e) {
  if (!matarPass()) return;
  const d = e.target;
  if (!(d instanceof HTMLDetailsElement) || !d.open || !d.matches('.flodeshjalp, [data-hjalp]')) return;
  P.hjalp++;
  if (P.aktuellt) stegData(P.aktuellt).hjalp++;
  spara();
}

// ---- Runda 18, r1 och r2: mätning av sökningar. ---------------------------------------------------------------------
// Sökrutan "Vad vill du göra?" (r2) anropar matSokning() varje gång någon söker, eller skickar händelsen
//   document.dispatchEvent(new CustomEvent('vk-sokning'))
// så att sökrutan inte behöver importera den här filen. Bara att en sökning gjordes räknas, aldrig vad som söktes.
// Under ett pass med mätning räknas sökningen i passet och i det steg som pågår; annars händer ingenting.
export function matSokning() {
  if (!matarPass() || !lyssnar) return;
  P.sokningar++;
  if (P.aktuellt) stegData(P.aktuellt).sokningar++;
  spara();
}
// ---------------------------------------------------------------------------------------------------------------------

// Steget räknas fram ur det som syns.
const hashGaller = (h) => { const x = (location.hash || '#/').split('?')[0]; return x === h || x.startsWith(`${h}/`); };
function synlig(el) {
  if (!el?.isConnected || !el.getClientRects().length) return false;
  if (getComputedStyle(el).visibility === 'hidden' || el.closest('[inert], [hidden]')) return false;
  const modal = [...document.querySelectorAll('dialog:modal')].at(-1);
  return !modal || modal.contains(el);
}
function hitta(m) {
  for (const el of document.querySelectorAll(m.sel)) {
    // Runda 19, r1: rad är det närmaste elementet runt målet (en rad, ett kort) som ska ha texten i innehaller.
    const runt = m.rad ? el.closest(m.rad) : el;
    if (runt && (!m.innehaller || runt.textContent.includes(m.innehaller)) && synlig(el)) return el;
  }
  return null;
}
function malForSteg(s) {
  if (s.hash && !hashGaller(s.hash)) return null;
  // Runda 19, r1: nar är ett eller flera element som måste synas, till exempel raden där svaret på en fråga står.
  if (s.nar && ![].concat(s.nar).every(n => hitta(n))) return null;
  for (const m of s.mal) { const el = hitta(m); if (el) return { el, text: m.text ?? s.text }; }
  return null;
}
function arKlar(s, el) {
  if (s.klar === 'valt') return el.checked === true || el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-checked') === 'true';
  if (s.klar === 'varde') return String(el.value ?? '').trim() !== '';
  // Runda 19, r1: en lista räknas som ändrad när ett annat alternativ än det förvalda är valt.
  if (s.klar === 'andrat' && el instanceof HTMLSelectElement) return el.value !== (([...el.options].find(o => o.defaultSelected) ?? el.options[0])?.value ?? '');
  if (s.klar === 'andrat') return 'defaultValue' in el ? el.value !== el.defaultValue && String(el.value).trim() !== '' : false;
  return false;
}
export function stegNu(lista = steg) {
  const hittade = lista.map(malForSteg);
  let j = -1;
  for (let i = lista.length - 1; i >= 0; i--) if (hittade[i]) { j = i; break; }
  if (j < 0) return null;
  // Runda 19, r1: fälten som räknas är de som syns mellan steget och närmaste steg före det som syns och inte är ett
  // fält, så att ett formulär som görs en gång till (en andra ordination) inte pekar tillbaka på det förra.
  let fran = 0;
  for (let i = j - 1; i >= 0; i--) if (hittade[i] && !lista[i].klar) { fran = i + 1; break; }
  for (let i = fran; i < j; i++) if (lista[i].klar && hittade[i] && !arKlar(lista[i], hittade[i].el)) return { index: i, id: lista[i].id, ...hittade[i] };
  return { index: j, id: lista[j].id, ...hittade[j] };
}

const planera = () => { clearTimeout(timer); timer = setTimeout(berakna, 120); };
let forraId = null;
function berakna() {
  if (!lyssnar || !lage) return;
  const forra = nu;
  nu = stegNu();
  const id = nu?.id ?? null;
  // Runda 19, r1: i ett uppdrag finns ingen mätning, bara steget.
  if (lage.typ === 'uppdrag' || !P) {
    if (id !== forraId) { forraId = id; paSteg?.(stegInfo()); if (nu && vagledningPa()) synligGor(nu.el); } else if (forra?.el !== nu?.el) paSteg?.(stegInfo());
    placera();
    return;
  }
  forraId = id;
  if (id !== P.aktuellt) {
    const t = Date.now();
    if (P.aktuellt) stegData(P.aktuellt).tidMs += t - P.sedan;
    P.sedan = t;
    if (id) {
      const d = stegData(id);
      if (d.besok > 0) { d.aterkomster++; P.aterkomster++; }
      d.besok++;
    }
    P.aktuellt = id;
    spara();
    paSteg?.(stegInfo());
    if (nu && vagledningPa()) synligGor(nu.el);
  } else if (forra?.el !== nu?.el) paSteg?.(stegInfo());
  placera();
}
// Det som panelen visar: stegets text och nummer, eller vad testaren kan göra när inget steg syns.
export function stegInfo() {
  // Runda 19, r1: ett uppdrag utan steg, eller medan stegen hämtas.
  if (lage?.typ === 'uppdrag' && lage.laddar) return { id: '', nr: null, antal: 0, text: 'Vägledningen hämtas.' };
  if (lage?.typ === 'uppdrag' && !steg.length) return { id: '', nr: null, antal: 0, text: 'Det här uppdraget har ingen vägledning än. Uppdraget säger vad som ska göras.' };
  if (!nu) {
    const modal = Boolean(document.querySelector('dialog:modal'));
    return { id: '', nr: null, antal: steg.length, text: modal ? 'Stäng rutan som är öppen, så visar vägledningen nästa steg.' : 'Gå till startsidan med menyn, så visar vägledningen nästa steg.' };
  }
  return { id: nu.id, nr: nu.index + 1, antal: steg.length, text: nu.text };
}

// Ramen och meningen. De ligger i den öppna dialogen när elementet är där, annars i sidan.
function skapaRam() {
  ram = document.createElement('div');
  ram.className = 'fp-ram';
  ram.setAttribute('aria-hidden', 'true');
  etikett = document.createElement('div');
  etikett.className = 'fp-etikett';
  etikett.setAttribute('aria-hidden', 'true');
}
function doljRam() { ram?.remove(); etikett?.remove(); }
function placera() {
  if (!lyssnar || !nu || !vagledningPa() || !nu.el.isConnected) { doljRam(); return; }
  if (!ram) skapaRam();
  const hem = nu.el.closest('dialog:modal') ?? document.body;
  if (ram.parentElement !== hem) { hem.append(ram, etikett); }
  // Runda 19, r1: svarsfältet i panelen får ramen ovanpå panelen.
  const iPanel = Boolean(nu.el.closest('#testare'));
  ram.classList.toggle('fp-i-panel', iPanel);
  etikett.classList.toggle('fp-i-panel', iPanel);
  const r = nu.el.getBoundingClientRect();
  const m = 4;
  Object.assign(ram.style, { top: `${r.top - m}px`, left: `${r.left - m}px`, width: `${r.width + 2 * m}px`, height: `${r.height + 2 * m}px` });
  etikett.textContent = nu.text;
  // Meningen ovanför elementet om det finns plats, annars under. Den läggs aldrig över elementet.
  const h = etikett.offsetHeight || 40;
  const ovanfor = r.top - h - 12 > 56;
  const vanster = Math.max(8, Math.min(r.left, window.innerWidth - etikett.offsetWidth - 8));
  Object.assign(etikett.style, { top: `${ovanfor ? r.top - h - 10 : r.bottom + 10}px`, left: `${vanster}px` });
  etikett.dataset.sida = ovanfor ? 'ovanfor' : 'under';
}
// Rullar fram elementet när ett nytt steg börjar och elementet inte syns, så att det hamnar mitt i den fria ytan mellan
// sidhuvudet (och ett fast patienthuvud) och panelen längst ner, aldrig under panelen.
function friYta(r) {
  const dock = document.getElementById('testare')?.getBoundingClientRect();
  // Panelen är ett hinder bara där den ligger: på en bred skärm ligger den längst ner till höger.
  const over = dock && r.right > dock.left && r.left < dock.right;
  const nere = over && dock.top > 0 && dock.top < window.innerHeight ? dock.top : window.innerHeight;
  const hinder = [...document.querySelectorAll('header, .patientband, .topp')].filter(e => ['sticky', 'fixed'].includes(getComputedStyle(e).position))
    .map(e => e.getBoundingClientRect().bottom).filter(b => b > 0 && b < window.innerHeight / 2);
  return { topp: Math.max(8, ...hinder), nere };
}
function synligGor(el) {
  const lugnt = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ block: 'nearest' });
  if (el.closest('dialog:modal')) return;
  const r = el.getBoundingClientRect();
  const { topp, nere } = friYta(r);
  if (r.top >= topp + 8 && r.bottom <= nere - 8) return;
  window.scrollBy({ top: (r.top + r.height / 2) - (topp + nere) / 2, behavior: lugnt ? 'auto' : 'smooth' });
}

// Visa var: rullar fram elementet och flyttar fokus dit.
export function visaMal() {
  if (!nu) return false;
  synligGor(nu.el);
  const fokus = nu.el.matches('a[href], button, input, select, textarea, summary, [tabindex]') ? nu.el : nu.el.querySelector('a[href], button, input, select, textarea, summary, [tabindex]');
  (fokus ?? nu.el).focus?.({ preventScroll: true });
  return true;
}
export function vaxlaVagledning() {
  const pa = !vagledningPa();
  satt(AV, pa ? null : '1', localStorage);
  if (P && !pa && lage?.typ === 'pass') { P.avstangd++; spara(); }
  if (pa && nu) synligGor(nu.el);
  placera();
  return pa;
}

// Det som skickas: talen och stegen, inget annat.
function kropp({ slut = true, avbruten = false } = {}) {
  const t = Date.now();
  const stegen = Object.entries(P.steg).map(([id, d]) => ({ id, tidS: Math.round(((d.tidMs + (id === P.aktuellt ? t - P.sedan : 0)) / 1000)), aterkomster: d.aterkomster, hjalp: d.hjalp, sokningar: d.sokningar }));
  const r = P.rakning;
  return {
    klick: r.klick, faltbyten: r.faltbyten, tangenter: r.tangenter, tidForstaS: P.forstaMs == null ? null : Math.round(P.forstaMs / 1000),
    hjalp: P.hjalp, sokningar: P.sokningar, aterkomster: P.aterkomster, vagledning: P.avstangd === 0 && vagledningPa(), avstangd: P.avstangd,
    steg: stegen, slut, avbruten, bredd: window.innerWidth,
  };
}
// Mätningen när passet är slut eller avbrutet. Svaret har återkopplingen och det nya tillståndet.
export async function skicka({ avbruten = false } = {}) {
  if (!P || P.matning !== 'ja' || P.skickad) { rensa(); return null; }
  P.skickad = true;
  spara();
  try {
    return await api('/api/testare/pass/matning', { metod: 'POST', data: kropp({ slut: true, avbruten }), direkt: true, tyst: true });
  } finally { rensa(); }
}
export function rensa() { stoppa(); P = null; satt(NYCKEL, null); }
// Delresultatet när fliken stängs eller laddas om. Passet fortsätter från sessionStorage om sidan kommer tillbaka.
function delresultat() {
  if (!P || P.matning !== 'ja' || P.skickad) return;
  try {
    fetch('/api/testare/pass/matning', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(kropp({ slut: false })) }).catch(() => {});
  } catch { /* fliken stängs */ }
}
