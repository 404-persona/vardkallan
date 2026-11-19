// Runda 18, r5: rätt patient, och inget arbete försvinner. När någon har börjat skriva i ett formulär (ordination,
// remiss, mätvärde, intyg) och går till en annan patient, remiss eller rad, finns texten kvar i fliken och systemet säger
// var. Formuläret fylls i igen med texten när det öppnas för samma patient, och en rad överst visar de osparade texterna
// med en länk tillbaka. Anteckningar sparas redan som utkast på servern (anteckningsstod.js), och då säger systemet att
// utkastet är sparat och var det finns.
//
// Texten sparas bara i flikens minne, aldrig i webbläsarens lagring, och glöms vid utloggning. Ett byte av patient märks:
// patienthuvudet markeras och systemet säger vilken patient som nu är öppen.
import { esc, notis } from './ui.js';
import { arPersonal } from './app.js';

const SKIPPA = 'form[role="search"], [data-journalsok], .sokform, .mv-urval, .ol-filter, .tl-filter';
const TEXTTYPER = new Set(['', 'text', 'number', 'email', 'tel', 'url', 'date', 'time', 'datetime-local']);
// Formulär med text som användaren har ändrat: form -> { pid, namn, flik, vag }.
const andrade = new Map();
// Osparade texter: nyckel -> { pid, namn, rubrik, vag, falt, server }.
const utkast = new Map();
let forraPatient = null;

const patientI = (hash) => (hash || '').match(/^#\/patient\/([\w-]+)(?:\/([a-z]+))?/);
const bandNamn = () => document.querySelector('.patientband h1')?.textContent?.trim() ?? '';
const rubrikFor = (form) => (form.querySelector('h2, h3, legend')?.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80) || 'formuläret';
const formNyckel = (form) => form.id || form.getAttribute('aria-labelledby') || form.className.split(' ')[0] || 'formular';
const nyckelFor = (hash, form) => {
  const m = patientI(hash);
  return m ? `${m[1]}|${m[2] ?? 'oversikt'}|${formNyckel(form)}` : `${(hash || '').split('?')[0]}|${formNyckel(form)}`;
};
const textfalt = (form) => [...form.querySelectorAll('textarea, input')].filter(e => (e.tagName === 'TEXTAREA' || TEXTTYPER.has(e.type)) && (e.name || e.id) && !e.disabled && e.type !== 'hidden');

document.addEventListener('input', (e) => {
  const f = e.target.closest?.('main form');
  if (!f || f.matches(SKIPPA) || !(e.target.matches('textarea') || TEXTTYPER.has(e.target.type))) return;
  const m = patientI(location.hash);
  andrade.set(f, { pid: m?.[1] ?? null, namn: m ? bandNamn() : '', vag: location.hash });
}, true);
document.addEventListener('submit', (e) => { andrade.delete(e.target); }, true);
// En knapp som sparar formuläret utan att skicka det (Signera, Spara, Registrera) räknas som att texten är sparad.
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('button');
  const f = b?.closest('form');
  if (f && andrade.has(f) && /^(Spara|Signera|Skicka|Registrera|Ordinera|Ändra|Skriv|Förläng|Beställ)/.test(b.textContent.trim())) andrade.delete(f);
}, true);

function sparaAndrade() {
  const sparade = [];
  for (const [form, info] of andrade) {
    andrade.delete(form);
    if (!form.isConnected) continue;
    const falt = Object.fromEntries(textfalt(form).filter(x => x.value.trim()).map(x => [x.name || x.id, x.value]));
    if (!Object.keys(falt).length) continue;
    const server = form.matches('[data-skrivruta]');
    const u = { ...info, rubrik: rubrikFor(form), falt, server };
    if (!server) utkast.set(nyckelFor(info.vag, form), u);
    sparade.push(u);
  }
  return sparade;
}

function meddela(sparade) {
  for (const u of sparade) {
    const vem = u.pid ? ` för ${u.namn || 'patienten'}` : '';
    notis(u.server
      ? `Anteckningen${vem} är sparad som utkast. Den finns under fliken Journal i patientens journal och bland osignerade anteckningar i inkorgen.`
      : `Texten i ${u.rubrik.toLowerCase()}${vem} är sparad i den här fliken. Den står i formuläret igen när du öppnar det${vem}.`, 'info', { kvar: true });
  }
  ritaRad();
}

// Raden överst med de osparade texterna och en länk tillbaka till var och en.
function ritaRad() {
  let el = document.getElementById('osparad-rad');
  if (!utkast.size || !arPersonal()) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'osparad-rad';
    el.className = 'osparad-rad';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Osparad text');
    const ram = document.getElementById('nyhetsruta') ?? document.getElementById('ram');
    ram?.parentNode ? ram.insertAdjacentElement('beforebegin', el) : document.body.prepend(el);
  }
  el.innerHTML = `<p><strong>Osparad text i den här fliken:</strong></p><ul>${[...utkast.values()].map(u => `<li><a href="${esc(u.vag)}">${esc(u.namn || 'Utan patient')}, ${esc(u.rubrik)}</a></li>`).join('')}</ul>`;
}

// När ett formulär med samma nyckel visas igen fylls texten i.
function aterstall(form) {
  const k = nyckelFor(location.hash, form);
  const u = utkast.get(k);
  if (!u) return;
  utkast.delete(k);
  for (const x of textfalt(form)) {
    const v = u.falt[x.name || x.id];
    if (v == null) continue;
    x.value = v;
    x.dispatchEvent(new Event('input', { bubbles: true }));
  }
  andrade.set(form, { pid: u.pid, namn: u.namn, vag: location.hash });
  notis(`Din text i ${u.rubrik.toLowerCase()} är tillbaka.`, 'info');
  ritaRad();
}
new MutationObserver((andringar) => {
  if (!utkast.size) return;
  for (const a of andringar) for (const n of a.addedNodes) {
    if (n.nodeType !== 1) continue;
    for (const f of [...(n.matches('main form') ? [n] : []), ...n.querySelectorAll('form')]) if (f.closest('main')) aterstall(f);
  }
}).observe(document.documentElement, { childList: true, subtree: true });

// Lyssnaren läggs innan app.js lägger sin, eftersom modulen läses in först. Texten tas med innan vyn byts.
window.addEventListener('hashchange', () => {
  if (!arPersonal()) { andrade.clear(); utkast.clear(); ritaRad(); return; }
  const sparade = sparaAndrade();
  if (sparade.length) setTimeout(() => meddela(sparade), 0);
});

// Anropas efter varje visad vy (app.js): ett byte av patient märks i patienthuvudet och i ett meddelande.
export function efterVy() {
  if (!arPersonal()) { utkast.clear(); forraPatient = null; ritaRad(); return; }
  const m = patientI(location.hash);
  const pid = m?.[1] ?? null;
  const band = document.querySelector('.patientband');
  if (pid && band && forraPatient && forraPatient !== pid) {
    band.classList.add('patientbyte');
    setTimeout(() => band.classList.remove('patientbyte'), 2500);
    notis(`Du har bytt patient. Nu är ${bandNamn() || 'en annan patient'} öppen.`, 'info');
  }
  if (pid) forraPatient = pid;
  ritaRad();
  for (const f of document.querySelectorAll('main form')) aterstall(f);
}
