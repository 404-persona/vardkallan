// Runda 13, r1: testarens verktyg i varje vy. Knappen Lämna synpunkt syns alltid, längst ner till höger (på mobil en
// rad längst ner), och panelen med uppdragen följer med mellan vyerna när testaren har valt en yrkesroll på #/testa.
//
// Systemet fyller själv i det som går att räkna ut: sidan, demorollen, uppdraget, versionen, skärmens bredd och
// webbläsaren (servern sätter version, gränssnitt, webbläsare och tid själv). Panelen frågar servern efter varje
// sidbyte och varje sparad ändring om ett uppdrag har blivit gjort, och ställer då jämförelsefrågan.
import { esc, api, ikon, krokar, notis, felNotis, faltFel, avbrott } from './ui.js';
import { S, loggaIn, loggaInInvanare } from './app.js';
import { TYPER, ALLVAR, YRKEN, SYSTEM, AR, VARDFORM, JAMFORELSE, SPARAS, VEM_LASER, HUR_LANGE, PERSONNUMMER_TEXT, MAX_TEXT, MAX_KONTAKT, MAX_MITT_SYSTEM } from './synpunkt-regler.js';
// Runda 18, r1: första passet med vägledning, mätning med samtycke, återkoppling och SUS efter passet.
import * as fp from './forsta-pass.js';
import { MATNING_FRAGA, MATNING_TEXT } from './forsta-pass-steg.js';
import { SUS_PASTAENDEN, SUS_INSTRUKTION, SUS_SKALA, SUS_KALLA } from './sus.js';
// Tillägg 2026-11-19 (Jonas): bjud in en kollega och dela.
import { lankFor, inbjudningstext, delningslankar, AMNE, INBJUDAN_SPARAS } from './inbjudan-regler.js';

const AKTIV = 'vk_testare_aktiv';
const OPPEN = 'vk_testare_oppen';
// Runda 18, r1: svaret på frågan om mätning, så att frågan ställs en gång.
export const MATNING = 'vk_testare_matning';
// Tillägg 2026-11-19: kanalen som besökaren kom via, i den här fliken.
export const VIA_NYCKEL = 'vk_testare_via';
const las = (k, s = sessionStorage) => { try { return s.getItem(k); } catch { return null; } };
const satt = (k, v, s = sessionStorage) => { try { if (v == null) s.removeItem(k); else s.setItem(k, v); } catch { /* utan lagring */ } };

let T = null;
let rot = null;
let hamtar = null;
let senast = 0;

const val = (lista, namn, valt, tomText) => `<option value="">${esc(tomText)}</option>${lista.map(([k, t]) => `<option value="${esc(k)}"${k === valt ? ' selected' : ''}>${esc(t)}</option>`).join('')}`;
export function profilFalt(p = {}, prefix = 'tp') {
  return `<div class="falt-rad testare-profil">
    <div class="falt"><label for="${prefix}-system">Journalsystem du använder i dag</label><select id="${prefix}-system" name="system">${val(SYSTEM, 'system', p.system, 'Vill inte ange')}</select></div>
    <div class="falt"><label for="${prefix}-ar">Hur länge</label><select id="${prefix}-ar" name="ar">${val(AR, 'ar', p.ar, 'Vill inte ange')}</select></div>
    <div class="falt"><label for="${prefix}-yrke">Yrke</label><select id="${prefix}-yrke" name="yrke">${val(YRKEN, 'yrke', p.yrke, 'Vill inte ange')}</select></div>
    <div class="falt"><label for="${prefix}-vardform">Var du arbetar</label><select id="${prefix}-vardform" name="vardform">${val(VARDFORM, 'vardform', p.vardform, 'Vill inte ange')}</select></div>
  </div>`;
}
export const profilUr = (form) => Object.fromEntries(['system', 'ar', 'yrke', 'vardform'].map(k => [k, form.querySelector(`[name="${k}"]`)?.value ?? '']).filter(([, v]) => v));

// Vyn som systemet fyller i: adressens väg utan fråga.
const vyNu = () => (location.hash || '#/').split('?')[0];

export function init() {
  if (rot) return;
  rot = document.createElement('aside');
  rot.id = 'testare';
  rot.className = 'testare-dock';
  rot.setAttribute('aria-label', 'Testa Vårdkällan');
  rot.innerHTML = `<div class="testare-panel" id="testare-panel" hidden></div>
    <div class="testare-knappar">
      <button type="button" class="knapp sekundar testare-uppdragsknapp" data-tp="vaxla" aria-expanded="false" aria-controls="testare-panel" hidden></button>
      <button type="button" class="knapp testare-synpunkt" data-tp="synpunkt">${ikon.penna}<span>Lämna synpunkt</span></button>
    </div>
    <p class="sr" id="testare-meddelande" aria-live="polite"></p>`;
  document.body.append(rot);
  document.body.classList.add('har-testare');
  rot.addEventListener('click', klick);
  rot.addEventListener('submit', skicka);
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--testare-hojd', `${rot.querySelector('.testare-knappar').offsetHeight}px`);
    // Runda 18, r1: under första passet får sidan plats under panelen, så att vägledningen kan rulla fram allt.
    document.documentElement.style.setProperty('--testare-dock-hojd', `${rot.offsetHeight}px`);
  }).observe(rot);
  // Efter en sparad ändring kan ett uppdrag ha blivit gjort.
  const forra = krokar.efterSkrivning;
  krokar.efterSkrivning = (vag) => { forra?.(vag); if (T?.aktiv && !/^\/api\/(testare|synpunkter|login|logout|reset)/.test(vag)) uppdatera(); };
}

// Efter varje sidbyte (app.js).
// Första gången efter att sessionen finns, så att uppdragen syns också i en ny flik, och sedan bara när uppdrag pågår.
let hamtatEnGang = false;
export function efterVy() { if (!hamtatEnGang || las(AKTIV) || T?.aktiv) { hamtatEnGang = true; uppdatera(); } }

export async function uppdatera({ visa = false } = {}) {
  if (!rot) return;
  // Under ett avbrott, också ett simulerat, frågar panelen inte servern. Den visar det den visade senast.
  if (avbrott.aktivt || avbrott.simulerat) return;
  const nr = ++senast;
  hamtar = api('/api/testare', { tyst: true, bakgrund: true, direkt: true }).catch(() => null);
  const t = await hamtar;
  if (nr !== senast || !t) return;
  const nyaKlara = T?.aktiv && t.aktiv ? t.attBesvara.filter(id => !T.attBesvara.includes(id)) : [];
  T = t;
  satt(AKTIV, t.aktiv ? '1' : null);
  if (nyaKlara.length) {
    const u = t.uppdrag.find(x => x.id === nyaKlara[0]);
    rot.querySelector('#testare-meddelande').textContent = `Uppdraget ${u?.titel ?? ''} är klart.`;
    satt(OPPEN, '1', localStorage);
  }
  rita({ oppna: visa || nyaKlara.length > 0 });
}

export async function starta(testroll, profil, knapp) {
  // Runda 18, r1: uppdragen börjar med första passet. Har testaren redan svarat på frågan om mätning följer svaret med.
  const matning = las(MATNING, localStorage);
  // Tillägg 2026-11-19: kanalen som besökaren kom via följer med, så att ett genomfört pass räknas på kanalen.
  const via = las(VIA_NYCKEL);
  const r = await api('/api/testare/starta', { metod: 'POST', data: { testroll, profil, pass: true, ...(['ja', 'nej'].includes(matning) ? { matning } : {}), ...(via ? { via } : {}) } });
  T = r;
  satt(AKTIV, '1');
  satt(OPPEN, '1', localStorage);
  return r;
}

const ikonFor = (u, aktuell) => (u.status === 'klar' ? `<span class="tp-status tp-klar" aria-hidden="true">${ikon.bock}</span>` : u.status === 'hoppade_over' ? `<span class="tp-status tp-hoppad" aria-hidden="true">${ikon.pil}</span>` : `<span class="tp-status${aktuell ? ' tp-aktuell' : ''}" aria-hidden="true"></span>`);
const statusText = (u) => (u.status === 'klar' ? 'klart' : u.status === 'hoppade_over' ? 'överhoppat' : 'kvar');

function rita({ oppna = false } = {}) {
  const knapp = rot.querySelector('[data-tp="vaxla"]');
  const panel = rot.querySelector('#testare-panel');
  if (!T?.aktiv) { knapp.hidden = true; panel.hidden = true; panel.innerHTML = ''; document.body.classList.remove('har-uppdrag', 'i-forsta-pass'); fp.stoppa(); return; }
  document.body.classList.add('har-uppdrag');
  const n = T.uppdrag.length;
  const gjorda = T.klara + T.hoppade;
  knapp.hidden = false;
  // Runda 18, r1: under passet heter knappen Första passet, och panelen är öppen.
  const iPass = T.pass && T.pass.fas !== 'klar';
  knapp.innerHTML = `${ikon.lista}<span>${iPass ? 'Första passet' : `Uppdrag ${Math.min(gjorda + 1, n)} av ${n}`}</span>`;
  if (iPass && T.pass.fas !== 'pagar') oppna = true;
  const oppen = oppna || las(OPPEN, localStorage) === '1';
  panel.hidden = !oppen;
  knapp.setAttribute('aria-expanded', String(oppen));
  const fraga = T.attBesvara[0] ? T.uppdrag.find(u => u.id === T.attBesvara[0]) : null;
  const aktuell = T.uppdrag.find(u => u.id === T.aktuellt);
  const inloggadSom = S.session?.personal?.id ?? (S.session?.invanare ? S.session.invanare.id : null);
  const ratt = T.demoroll ? inloggadSom === T.demoroll : inloggadSom === T.invanare;
  panel.innerHTML = `<div class="tp-huvud"><h2 id="tp-rubrik">${esc(T.knapp)}: ${iPass ? 'första passet' : `${gjorda} av ${n} uppdrag`}</h2>
      <button type="button" class="knapp text liten" data-tp="stang" aria-label="Fäll ihop uppdragen">${ikon.kryss}</button></div>
    ${ratt ? '' : `<div class="ruta ruta-info liten tp-roll"><p>Uppdragen görs som ${esc(T.om.replace(/^Du (arbetar som|är) /, '').split(',')[0])}. ${inloggadSom ? 'Du är inloggad som någon annan.' : 'Du är inte inloggad.'}</p><button type="button" class="knapp liten" data-tp="logga-in">Logga in igen</button></div>`}
    ${iPass ? passHtml(T.pass, fraga) : fraga ? jamforelseHtml(fraga) : aktuell ? aktuelltHtml(aktuell) : `<div class="tp-klart"><p><strong>Alla uppdrag är gjorda.</strong> Tack! Du kan fortsätta pröva systemet fritt och lämna synpunkter från varje sida.</p><p><a href="#/testa">Välj en annan yrkesroll</a></p></div>`}
    ${iPass ? '' : `<details class="tp-alla"><summary>Alla uppdrag</summary><ol class="tp-lista">${T.uppdrag.map(u => `<li class="${u.id === T.aktuellt ? 'tp-ar-aktuell' : ''}">${ikonFor(u, u.id === T.aktuellt)}<span>${u.sussa ? `<span class="tp-sussa">Sussa ${esc(u.sussa)}</span> ` : ''}${esc(u.titel)}<span class="sr">, ${statusText(u)}</span></span></li>`).join('')}</ol></details>`}`;
  // Runda 18, r1: vägledningen följer passet. Steget skrivs i panelen när det byts.
  document.body.classList.toggle('i-forsta-pass', T.pass?.fas === 'pagar' && !panel.hidden);
  fp.aktivera(T, { onSteg: visaSteg });
  if (T.pass?.fas === 'pagar') visaSteg(fp.stegInfo());
  else if (T.pass?.fas === 'aterkoppling' && T.pass.matning === 'ja' && !T.pass.resultat) skickaMatning();
}

function aktuelltHtml(u) {
  return `<section class="tp-uppdrag" aria-labelledby="tp-aktuellt">
    <p class="tp-etikett">Nästa uppdrag${u.sussa ? `, Sussas testfall ${esc(u.sussa)}` : ''}</p>
    <h3 id="tp-aktuellt">${esc(u.titel)}</h3>
    <ul>${u.text.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
    ${u.slut ? `<p class="dampad liten">Klart när: ${esc(u.slut)}</p>` : ''}
    ${u.fraga ? `<form class="tp-fraga" data-tp-form="svar" data-id="${esc(u.id)}" novalidate><div class="falt"><label for="tp-svar">${esc(u.fraga)}</label><input id="tp-svar" name="svar" maxlength="200" autocomplete="off"></div><p class="form-fel" role="alert" hidden></p><button type="submit" class="knapp liten">Svara</button></form>`
    : '<p class="dampad liten">Systemet bockar av uppdraget när det är gjort.</p>'}
    <p class="knapprad"><button type="button" class="knapp text liten" data-tp="hoppa" data-id="${esc(u.id)}">Hoppa över uppdraget</button></p>
  </section>`;
}

// ---- Runda 18, r1: första passet i panelen. ------------------------------------------------------------------------
const minSek = (s) => (s == null ? '' : s < 60 ? `${s} ${s === 1 ? 'sekund' : 'sekunder'}` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`);
const antal = (n, en, flera) => `${n} ${n === 1 ? en : flera}`;
const passEtikett = (p) => `Första passet${p.sussa ? `, Sussas testfall ${esc(p.sussa)}` : ''}`;
function passHtml(p, fraga) {
  if (p.fas === 'samtycke') {
    return `<section class="tp-pass tp-samtycke" aria-labelledby="tp-pass-rubrik">
      <p class="tp-etikett">${passEtikett(p)}</p>
      <h3 id="tp-pass-rubrik">${esc(p.titel)}</h3>
      <p class="tp-pass-text">${esc(p.text)}</p>
      <p>Du behöver inte kunna systemet. Vägledningen visar nästa steg, och du kan stänga av den.</p>
      <h4 id="tp-matning-fraga">${esc(MATNING_FRAGA)}</h4>
      <p class="liten">${esc(MATNING_TEXT)}</p>
      <p class="knapprad"><button type="button" class="knapp liten" data-tp="matning" data-varde="ja">Ja, mät passet</button><button type="button" class="knapp sekundar liten" data-tp="matning" data-varde="nej">Nej, mät inte</button></p>
    </section>`;
  }
  if (p.fas === 'pagar') {
    const pa = fp.vagledningPa();
    return `<section class="tp-pass" aria-labelledby="tp-pass-rubrik">
      <p class="tp-etikett">${passEtikett(p)}</p>
      <h3 id="tp-pass-rubrik">${esc(p.titel)}</h3>
      <p class="tp-pass-text">${esc(p.text)}</p>
      <p class="tp-steg" id="tp-steg" tabindex="-1" aria-live="polite" data-steg=""${pa ? '' : ' hidden'}></p>
      <p class="knapprad tp-pass-knappar">${pa ? '<button type="button" class="knapp liten" data-tp="visa-steg">Visa var</button>' : ''}<button type="button" class="knapp sekundar liten" data-tp="vagledning">${pa ? 'Stäng av vägledningen' : 'Slå på vägledningen'}</button><button type="button" class="knapp text liten" data-tp="avbryt-pass">Avbryt passet</button></p>
      <p class="dampad liten">${p.matning === 'ja' ? 'Passet mäts, som du svarade ja till.' : 'Passet mäts inte.'} Systemet ser själv när uppgiften är gjord.</p>
    </section>`;
  }
  // Återkopplingen, sedan jämförelsen, SUS och valet av vad som händer sedan.
  const nasta = fraga?.id === p.uppdrag ? jamforelseHtml(fraga)
    : p.sus === null ? `<section class="tp-sus-erbjudande" aria-labelledby="tp-sus-rubrik"><h3 id="tp-sus-rubrik">Hur kändes det?</h3>
        <p>Vill du svara på tio korta påståenden om systemet? Det tar ungefär en minut och är frivilligt.</p>
        <p class="knapprad"><button type="button" class="knapp liten" data-tp="sus">Svara på påståendena</button><button type="button" class="knapp text liten" data-tp="sus-hoppa">Nej tack</button></p></section>`
    : `<section class="tp-vidare" aria-labelledby="tp-vidare-rubrik"><h3 id="tp-vidare-rubrik">Vad vill du göra nu?</h3>
        <p>Det finns fler uppdrag för yrket. De görs utan vägledning, och efter varje uppdrag får du en kort fråga.</p>
        <p class="knapprad"><button type="button" class="knapp liten" data-tp="vidare">Fortsätt med nästa uppdrag</button><button type="button" class="knapp sekundar liten" data-tp="avsluta-test">Avsluta testet</button></p>
        <p class="liten"><a href="#/testa">Välj en annan yrkesroll</a></p></section>`;
  return `${aterkopplingHtml(p)}${nasta}`;
}
function aterkopplingHtml(p) {
  const r = p.resultat;
  if (!r) return `<section class="tp-aterkoppling" aria-labelledby="tp-ak-rubrik"><h3 id="tp-ak-rubrik">Uppgiften är gjord</h3><p>Räknar ihop passet.</p></section>`;
  const klar = r.status === 'klar';
  const tk = r.tidsklass ? `Sussa räknade med högst ${r.tidsklass} minuter för uppgiften när systemen jämfördes, och under ${r.tidsklass / 3} minuter räknades som snabbt.` : 'Uppgiften är inte ett av Sussas testfall, så det finns ingen tidsklass att jämföra med.';
  const rader = [];
  if (r.tidS != null && klar) rader.push(`Det tog ${minSek(r.tidS)}. ${tk}${r.tidspoang === 10 ? ' Du var alltså snabb.' : ''}`);
  else if (klar) rader.push(tk);
  if (r.steg != null && klar) {
    rader.push(`Du behövde ${r.steg} steg: ${antal(r.klick, 'klick', 'klick')}, ${antal(r.faltbyten, 'fältbyte', 'fältbyten')} och ${antal(r.tangenter, 'tangent', 'tangenter')}. Klickbudgeten, som Vårdkällan ska klara uppgiften inom, är ${r.budget} steg.`);
    rader.push(r.steg <= r.budget ? 'Du klarade den inom budgeten.' : 'Det är vanligt att det tar fler steg första gången.');
  } else if (klar) rader.push(`Klickbudgeten, som Vårdkällan ska klara uppgiften inom, är ${r.budget} steg.`);
  if (p.matning === 'nej') rader.push('Du valde att passet inte mäts, så det här är bara vad uppgiften brukar kräva.');
  if (!klar) rader.push(p.matning === 'ja' ? 'Det som hann mätas är sparat och visar var det blev svårt. Det hjälper oss att göra systemet enklare.' : 'Det är bra att veta var det blev svårt. Skriv gärna det i frågan nedan.');
  return `<section class="tp-aterkoppling" aria-labelledby="tp-ak-rubrik">
    <p class="tp-etikett">${passEtikett(p)}</p>
    <h3 id="tp-ak-rubrik" tabindex="-1">${klar ? `${ikon.bock}Klart!` : 'Du avbröt passet'}</h3>
    ${rader.map(x => `<p>${esc(x)}</p>`).join('')}
    <p class="knapprad"><button type="button" class="knapp sekundar liten" data-tp="bjud-in">Bjud in en kollega</button></p>
  </section>`;
}
// Steget i panelen. forsta-pass.js anropar när steget byts.
function visaSteg(info) {
  const el = rot?.querySelector('#tp-steg');
  if (!el) return;
  el.dataset.steg = info.id;
  el.innerHTML = `${info.nr ? `<span class="tp-steg-nr">Steg ${info.nr} av ${info.antal}</span> ` : ''}${esc(info.text)}`;
}
let skickar = false;
async function skickaMatning({ avbruten = false } = {}) {
  if (skickar) return;
  skickar = true;
  try {
    let r = await fp.skicka({ avbruten });
    // Utan räkning i fliken (en ny flik eller en tömd webbläsare) rapporteras passet utan siffror.
    if (!r && T?.pass?.matning === 'ja' && !T.pass.resultat) r = await api('/api/testare/pass/matning', { metod: 'POST', data: { slut: true, avbruten, utanRakning: true }, direkt: true, tyst: true });
    if (r?.tillstand) T = r.tillstand;
  } catch (err) { if (err?.status !== 409) felNotis(err); else await uppdatera(); } finally { skickar = false; }
  rita({ oppna: true });
  rot.querySelector('#tp-ak-rubrik')?.focus();
}
// SUS efter passet i en dialog. Poängen räknar servern.
function susDialog() {
  const forra = document.activeElement;
  const dl = document.createElement('dialog');
  dl.className = 'dialog dialog-bred fp-sus-dialog';
  dl.setAttribute('aria-labelledby', 'fp-sus-rubrik');
  dl.innerHTML = `<div class="dialog-inre"><form id="fp-sus-form" novalidate>
    <h2 id="fp-sus-rubrik">Hur upplevde du systemet?</h2>
    <p>${esc(SUS_INSTRUKTION)}</p>
    <ol class="sus-lista">${SUS_PASTAENDEN.map((t, i) => `<li><fieldset class="sus"><legend>${esc(t)}</legend>
      <div class="sus-skala"><span class="sus-anda" aria-hidden="true">${esc(SUS_SKALA[1])}</span>
      ${[1, 2, 3, 4, 5].map(v => `<label class="sus-val"><input type="radio" name="sus${i + 1}" value="${v}"><span>${v}<span class="sr">${SUS_SKALA[v] ? `, ${esc(SUS_SKALA[v])}` : ''}</span></span></label>`).join('')}
      <span class="sus-anda" aria-hidden="true">${esc(SUS_SKALA[5])}</span></div></fieldset></li>`).join('')}</ol>
    <p class="dampad liten">Påståendena är System Usability Scale (SUS). Källa: ${esc(SUS_KALLA)}. Svaren sparas utan namn, och poängen räknas av servern.</p>
    <p class="form-fel" role="alert" hidden></p>
    <div class="knapprad"><button type="submit" class="knapp">Skicka svaren</button><button type="button" class="knapp sekundar" data-sus="stang">Avbryt</button></div>
  </form></div>`;
  document.body.append(dl);
  dl.addEventListener('close', () => { setTimeout(() => dl.remove(), 30); if (forra?.isConnected) forra.focus(); });
  dl.addEventListener('click', (e) => { if (e.target.closest('[data-sus="stang"]')) dl.close(); });
  dl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = dl.querySelector('form');
    const d = new FormData(form);
    const svar = SUS_PASTAENDEN.map((_, i) => (d.get(`sus${i + 1}`) == null ? null : Number(d.get(`sus${i + 1}`))));
    const f = form.querySelector('.form-fel');
    const saknas = svar.map((v, i) => (v == null ? i + 1 : null)).filter(Boolean);
    if (saknas.length) { f.textContent = `Svar saknas för påstående ${saknas.join(', ')}.`; f.hidden = false; form.querySelector(`[name="sus${saknas[0]}"]`).focus(); return; }
    const knapp = form.querySelector('[type="submit"]');
    knapp.disabled = true;
    try {
      const r = await api('/api/testare/pass/sus', { metod: 'POST', data: { svar }, direkt: true });
      T = r.tillstand;
      dl.close();
      notis(`Tack! Poängen blev ${String(r.poang).replace('.', ',')} av 100. Svaret är sparat med nummer ${r.nummer}.`);
      rita({ oppna: true });
    } catch (err) { f.textContent = err?.message ?? 'Svaren kunde inte skickas.'; f.hidden = false; } finally { if (knapp.isConnected) knapp.disabled = false; }
  });
  dl.addEventListener('cancel', (e) => { e.preventDefault(); dl.close(); });
  dl.showModal();
  dl.querySelector('input[name="sus1"]').focus();
}
// ---------------------------------------------------------------------------------------------------------------------

// ---- Tillägg 2026-11-19 (Jonas): bjud in en kollega och dela. ------------------------------------------------------
// Systemet skickar aldrig något självt och sparar inga adresser. Dialogen visar en färdig text som testaren skickar själv:
// Dela (webbläsarens delning där den finns), Kopiera, E-post (testarens eget e-postprogram) och tjänsternas egna
// delningssidor som vanliga länkar i en ny flik. Inget anrop görs när dialogen öppnas: länken bär bara kanalen.
let bjudOppen = false;
export function bjudInDialog() {
  if (bjudOppen) return;
  bjudOppen = true;
  const forra = document.activeElement;
  const origin = location.origin;
  const text = inbjudningstext(lankFor(origin, 'lank'));
  const l = delningslankar(origin);
  const dl = document.createElement('dialog');
  dl.className = 'dialog dialog-bred bj-dialog';
  dl.setAttribute('aria-labelledby', 'bj-rubrik');
  const nyFlik = 'target="_blank" rel="noopener noreferrer"';
  dl.innerHTML = `<div class="dialog-inre">
    <h2 id="bj-rubrik">Bjud in en kollega</h2>
    <p>Här är en färdig text med länken till testet. Du skickar den själv, på det sätt du vill. Vårdkällan skickar ingenting och sparar inga adresser.</p>
    <div class="falt"><label for="bj-text">Inbjudan</label><textarea id="bj-text" class="bj-text" rows="5" readonly>${esc(text)}</textarea></div>
    <p class="knapprad bj-knappar">${navigator.share ? '<button type="button" class="knapp" data-bj="dela">Dela</button>' : ''}<button type="button" class="knapp${navigator.share ? ' sekundar' : ''}" data-bj="kopiera">Kopiera texten</button><a class="knapp sekundar" data-bj-kanal="epost" href="${esc(l.epost)}">E-post</a></p>
    <h3 class="bj-sociala-rubrik">Dela i sociala medier</h3>
    <p class="liten">Länkarna öppnar tjänstens egen sida för att dela, i en ny flik. Inget publiceras förrän du själv gör det där.</p>
    <ul class="bj-sociala">
      <li><a data-bj-kanal="linkedin" href="${esc(l.linkedin)}" ${nyFlik}>Dela på LinkedIn<span class="sr"> (öppnas i en ny flik)</span></a></li>
      <li><a data-bj-kanal="facebook" href="${esc(l.facebook)}" ${nyFlik}>Dela på Facebook<span class="sr"> (öppnas i en ny flik)</span></a></li>
      <li><a data-bj-kanal="x" href="${esc(l.x)}" ${nyFlik}>Dela på X<span class="sr"> (öppnas i en ny flik)</span></a></li>
    </ul>
    <details class="bj-sparas"><summary>Det här sparas</summary><p>${esc(INBJUDAN_SPARAS)}</p></details>
    <p class="sr" aria-live="polite" id="bj-meddelande"></p>
    <div class="knapprad"><button type="button" class="knapp sekundar" data-bj="stang">Stäng</button></div>
  </div>`;
  document.body.append(dl);
  const meddela = (t) => { dl.querySelector('#bj-meddelande').textContent = t; notis(t); };
  dl.addEventListener('close', () => { bjudOppen = false; setTimeout(() => dl.remove(), 30); if (forra?.isConnected) forra.focus(); });
  dl.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-bj]');
    if (!b) return;
    if (b.dataset.bj === 'stang') return dl.close();
    if (b.dataset.bj === 'kopiera') {
      const ta = dl.querySelector('#bj-text');
      try { await navigator.clipboard.writeText(ta.value); meddela('Inbjudan är kopierad. Klistra in den där du vill skicka den.'); } catch { ta.focus(); ta.select(); meddela('Texten är markerad. Kopiera den med Ctrl+C, eller Cmd+C på Mac.'); }
    }
    if (b.dataset.bj === 'dela') {
      try { await navigator.share({ title: AMNE, text: inbjudningstext(lankFor(origin, 'dela')) }); } catch { /* testaren avbröt delningen */ }
    }
  });
  dl.addEventListener('cancel', (e) => { e.preventDefault(); dl.close(); });
  dl.showModal();
  dl.querySelector('#bj-text').focus();
}
// ---------------------------------------------------------------------------------------------------------------------

function jamforelseHtml(u) {
  return `<form class="tp-jamforelse" data-tp-form="jamforelse" data-id="${esc(u.id)}" novalidate aria-labelledby="tp-jf-rubrik">
    <p class="tp-etikett">${u.status === 'klar' ? 'Uppdraget är klart' : 'Du hoppade över uppdraget'}</p>
    <h3 id="tp-jf-rubrik">${esc(u.titel)}</h3>
    <fieldset><legend>Jämfört med hur du gör det i ditt journalsystem i dag, var det</legend>
      ${JAMFORELSE.map(([k, t]) => `<label class="val-rad"><input type="radio" name="jamforelse" value="${esc(k)}"><span>${esc(t)}</span></label>`).join('')}
    </fieldset>
    <div class="falt"><label for="tp-jf-text">Vad var bättre eller sämre? (frivilligt)</label><textarea id="tp-jf-text" name="text" rows="2" maxlength="${MAX_TEXT}"></textarea></div>
    <div class="falt"><label for="tp-jf-mitt">Ungefär hur många klick eller hur lång tid tar det i ditt system? (frivilligt)</label><input id="tp-jf-mitt" name="mittSystem" maxlength="${MAX_MITT_SYSTEM}" autocomplete="off"></div>
    ${T.profil?.system ? '' : `<details class="tp-om-dig"><summary>Om dig (frivilligt)</summary>${profilFalt(T.profil, 'tpj')}</details>`}
    <p class="form-fel" role="alert" hidden></p>
    <p class="knapprad"><button type="submit" class="knapp liten">Skicka</button><button type="button" class="knapp text liten" data-tp="hoppa-fraga" data-id="${esc(u.id)}">Svara inte</button></p>
  </form>`;
}

async function klick(e) {
  const b = e.target.closest('[data-tp]');
  if (!b) return;
  const a = b.dataset.tp;
  try {
    if (a === 'synpunkt') return synpunktDialog();
    if (a === 'vaxla' || a === 'stang') {
      const panel = rot.querySelector('#testare-panel');
      const oppen = a === 'vaxla' ? panel.hidden : false;
      satt(OPPEN, oppen ? '1' : '0', localStorage);
      rita();
      if (a === 'stang') rot.querySelector('[data-tp="vaxla"]').focus();
      return;
    }
    if (a === 'logga-in') return T.demoroll ? loggaIn(T.demoroll, b) : loggaInInvanare(T.invanare, b);
    // Runda 18, r1: första passet.
    if (a === 'matning') {
      satt(MATNING, b.dataset.varde, localStorage);
      T = await api('/api/testare/pass/samtycke', { metod: 'POST', data: { matning: b.dataset.varde }, direkt: true });
      rita({ oppna: true });
      rot.querySelector('#tp-steg')?.focus();
      return;
    }
    if (a === 'visa-steg') { if (!fp.visaMal()) rot.querySelector('#tp-steg')?.focus(); return; }
    if (a === 'vagledning') { const pa = fp.vaxlaVagledning(); rita({ oppna: true }); rot.querySelector('[data-tp="vagledning"]')?.focus(); rot.querySelector('#testare-meddelande').textContent = pa ? 'Vägledningen är på.' : 'Vägledningen är avstängd. Du kan slå på den igen här.'; return; }
    if (a === 'avbryt-pass') {
      if (T.pass?.matning === 'ja') return skickaMatning({ avbruten: true });
      T = await api(`/api/testare/uppdrag/${encodeURIComponent(T.pass.uppdrag)}/hoppa`, { metod: 'POST', data: {}, direkt: true });
      fp.rensa();
      return rita({ oppna: true });
    }
    if (a === 'sus') return susDialog();
    if (a === 'bjud-in') return bjudInDialog();
    if (a === 'sus-hoppa') { T = (await api('/api/testare/pass/sus', { metod: 'POST', data: { hoppa: true }, direkt: true })).tillstand; return rita({ oppna: true }); }
    if (a === 'vidare') { T = await api('/api/testare/pass/vidare', { metod: 'POST', data: {}, direkt: true }); rita({ oppna: true }); rot.querySelector('#tp-aktuellt')?.setAttribute('tabindex', '-1'); rot.querySelector('#tp-aktuellt')?.focus(); return; }
    if (a === 'avsluta-test') {
      T = await api('/api/testare/avsluta', { metod: 'POST', data: {}, direkt: true });
      satt(AKTIV, null);
      fp.rensa();
      rita();
      notis('Tack för att du testade Vårdkällan! Du kan fortsätta pröva systemet fritt och lämna synpunkter från varje sida.');
      rot.querySelector('[data-tp="synpunkt"]')?.focus();
      return;
    }
    if (a === 'hoppa') { T = await api(`/api/testare/uppdrag/${encodeURIComponent(b.dataset.id)}/hoppa`, { metod: 'POST', data: {}, direkt: true }); return rita({ oppna: true }); }
    if (a === 'hoppa-fraga') { const r = await api(`/api/testare/uppdrag/${encodeURIComponent(b.dataset.id)}/jamforelse`, { metod: 'POST', data: { hoppa: true }, direkt: true }); T = r.tillstand; return rita({ oppna: true }); }
  } catch (err) { felNotis(err); }
}

async function skicka(e) {
  const form = e.target.closest('[data-tp-form]');
  if (!form) return;
  e.preventDefault();
  const knapp = form.querySelector('[type="submit"]');
  knapp.disabled = true;
  try {
    const id = encodeURIComponent(form.dataset.id);
    if (form.dataset.tpForm === 'svar') {
      const r = await api(`/api/testare/uppdrag/${id}/svar`, { metod: 'POST', data: { svar: form.querySelector('[name="svar"]').value }, direkt: true });
      T = r.tillstand;
      if (!r.ratt) { const f = form.querySelector('.form-fel'); f.textContent = r.text; f.hidden = false; return; }
      rot.querySelector('#testare-meddelande').textContent = r.text;
      return rita({ oppna: true });
    }
    const jf = form.querySelector('[name="jamforelse"]:checked')?.value;
    if (!jf) { const f = form.querySelector('.form-fel'); f.textContent = 'Välj om det var lättare, ungefär lika eller svårare, eller att det inte går att jämföra.'; f.hidden = false; form.querySelector('[name="jamforelse"]').focus(); return; }
    const r = await api(`/api/testare/uppdrag/${id}/jamforelse`, { metod: 'POST', direkt: true,
      data: { jamforelse: jf, text: form.querySelector('[name="text"]').value, mittSystem: form.querySelector('[name="mittSystem"]').value, bredd: window.innerWidth, ...profilUr(form) } });
    T = r.tillstand;
    notis(`Tack! Svaret är sparat med nummer ${r.nummer}.`);
    rita({ oppna: true });
    rot.querySelector('#tp-aktuellt, #tp-jf-rubrik, #tp-rubrik')?.setAttribute('tabindex', '-1');
    rot.querySelector('#tp-aktuellt, #tp-jf-rubrik, #tp-rubrik')?.focus();
  } catch (err) {
    if (err?.status === 400) faltFel(form, err); else felNotis(err);
  } finally { if (knapp.isConnected) knapp.disabled = false; }
}

// Formuläret för en synpunkt. Texten har fokus direkt, så att testaren kan börja skriva.
let dlgOppen = false;
export function synpunktDialog() {
  if (dlgOppen) return;
  dlgOppen = true;
  const forra = document.activeElement;
  const vy = vyNu();
  const roll = S.session?.personal ? `${S.session.personal.namn}, ${S.session.personal.titel}` : S.session?.invanare ? 'invånare i Min journal' : 'inte inloggad';
  const dl = document.createElement('dialog');
  dl.className = 'dialog dialog-bred synpunkt-dialog';
  dl.setAttribute('aria-labelledby', 'sp-rubrik');
  dl.innerHTML = `<div class="dialog-inre"><form id="sp-form" novalidate>
    <h2 id="sp-rubrik">${ikon.penna}Lämna en synpunkt</h2>
    <p class="liten dampad">Vad är fel, vad saknas eller vad är svårt? Skriv vad du gjorde, vad som hände och vad du väntade dig.</p>
    <div class="falt"><label for="sp-text">Din synpunkt <span class="obl">(obligatoriskt)</span></label><textarea id="sp-text" name="text" rows="4" maxlength="${MAX_TEXT}" required aria-required="true" aria-describedby="sp-pnr"></textarea>
      <span class="hjalp" id="sp-pnr">${esc(PERSONNUMMER_TEXT)}</span></div>
    <fieldset><legend>Vad gäller det?</legend><div class="sp-val">${TYPER.map(([k, t]) => `<label class="val-rad"><input type="radio" name="typ" value="${esc(k)}"><span>${esc(t)}</span></label>`).join('')}</div></fieldset>
    <fieldset><legend>Hur allvarligt är det för dig?</legend>${ALLVAR.map(([k, t]) => `<label class="val-rad"><input type="radio" name="allvar" value="${esc(k)}"><span>${esc(t)}</span></label>`).join('')}</fieldset>
    <details class="sp-mer"><summary>Om dig och kontakt (frivilligt)</summary>
      ${profilFalt(T?.profil ?? {}, 'sp')}
      <div class="falt"><label for="sp-kontakt">Vill du att projektet kontaktar dig? E-post eller telefon</label><input id="sp-kontakt" name="kontakt" maxlength="${MAX_KONTAKT}" autocomplete="off" aria-describedby="sp-kontakt-h"><span class="hjalp" id="sp-kontakt-h">Helt frivilligt. ${esc(HUR_LANGE)}</span></div>
    </details>
    <details class="sp-sparas"><summary>Det här sparas</summary><ul>${SPARAS.map(t => `<li>${esc(t)}</li>`).join('')}</ul><p>${esc(VEM_LASER)}</p><p><a href="#/om">Mer om demon och integriteten</a></p></details>
    <p class="liten dampad sp-auto">Systemet fyller i själv: sidan ${esc(vy)}, ${esc(roll)}${T?.aktiv && T.aktuellt ? `, uppdraget ${esc(T.uppdrag.find(u => u.id === T.aktuellt)?.titel ?? '')}` : ''}, version och skärmbredd.</p>
    <p class="form-fel" role="alert" hidden></p>
    <div class="knapprad"><button type="submit" class="knapp">Skicka synpunkten</button><button type="button" class="knapp sekundar" data-sp="stang">Avbryt</button></div>
  </form></div>`;
  document.body.append(dl);
  const stang = () => { dl.close(); };
  dl.addEventListener('close', () => { dlgOppen = false; setTimeout(() => dl.remove(), 30); if (forra?.isConnected) forra.focus(); });
  dl.addEventListener('click', (e) => { if (e.target.closest('[data-sp="stang"]')) stang(); });
  dl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = dl.querySelector('form');
    const fel = form.querySelector('.form-fel');
    const data = { text: form.querySelector('[name="text"]').value, typ: form.querySelector('[name="typ"]:checked')?.value, allvar: form.querySelector('[name="allvar"]:checked')?.value,
      kontakt: form.querySelector('[name="kontakt"]').value, vy, bredd: window.innerWidth, ...profilUr(form) };
    const saknas = !data.text.trim() ? ['text', 'Skriv din synpunkt.'] : !data.typ ? ['typ', 'Välj vad synpunkten gäller.'] : !data.allvar ? ['allvar', 'Välj hur allvarligt det är för dig.'] : null;
    if (saknas) { fel.textContent = saknas[1]; fel.hidden = false; form.querySelector(`[name="${saknas[0]}"]`).focus(); return; }
    const knapp = form.querySelector('[type="submit"]');
    knapp.disabled = true;
    try {
      const r = await api('/api/synpunkter', { metod: 'POST', data, direkt: true });
      dl.querySelector('.dialog-inre').innerHTML = `<div class="synpunkt-kvitto" role="status">
        <h2 id="sp-rubrik" tabindex="-1">${ikon.bock}Tack!</h2>
        <p>Din synpunkt är sparad med nummer <strong>${esc(r.nummer)}</strong>. Du kan inte läsa eller ändra den efteråt, men numret visar att den har kommit fram.</p>
        <div class="knapprad"><button type="button" class="knapp" data-sp="stang">Stäng</button></div></div>`;
      dl.querySelector('#sp-rubrik').focus();
    } catch (err) {
      if (err?.status === 400) {
        if (err.data?.falt?.some(f => ['yrke', 'system', 'ar', 'vardform', 'kontakt'].includes(f))) dl.querySelector('.sp-mer').open = true;
        faltFel(form, err);
      } else { fel.textContent = err?.message ?? 'Synpunkten kunde inte skickas.'; fel.hidden = false; }
    } finally { if (knapp.isConnected) knapp.disabled = false; }
  });
  dl.addEventListener('cancel', (e) => { e.preventDefault(); stang(); });
  dl.showModal();
  dl.querySelector('#sp-text').focus();
}
