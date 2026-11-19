// Runda 19, r1: en flik som var öppen före en uppdatering får den nya versionen utan att den som testar behöver veta
// att sidan ska laddas om. Appen laddas en gång och byter sedan bara vy, så utan det här körde en gammal flik den gamla
// koden.
//
// Klienten läser gränssnittets version (en hash av public/, som /api/health redan visar) när appen startar. När vyn
// byts och när fliken blir synlig igen, högst en gång i minuten, jämför den med serverns version. Är den ny laddas
// sidan om direkt, och testaren hamnar i samma vy (adressen och flikens lagring följer med). Finns det text som inte är
// sparad visas en rad i stället, och sidan laddas om vid nästa vybyte när texten är sparad.
//
// Avbrottsläget (servern svarar inte, läskopian) och reservservern utlöser aldrig en omladdning: då jämförs ingenting.
import { esc, avbrott } from './ui.js';
import { harOsparadText } from './osparad-text.js';
import { lamnaVakt } from './app.js';

export const INTERVALL_MS = 60_000;
export const RAD_TEXT = 'En ny version av Vårdkällan finns. Spara det du skriver, så laddas sidan om.';

let min = null;
let senast = 0;
let ny = false;

const iAvbrott = () => Boolean(avbrott.aktivt || avbrott.simulerat);

// Serverns version, eller null när den inte går att avgöra (avbrott, fel, reservserver). null jämförs aldrig.
async function serverns() {
  if (iAvbrott() || !navigator.onLine) return null;
  try {
    const r = await fetch('/api/health', { cache: 'no-store', credentials: 'same-origin' });
    if (!r.ok) return null;
    const h = await r.json();
    if (h.reservserver) return null;
    return typeof h.gransnitt === 'string' && h.gransnitt ? h.gransnitt : null;
  } catch { return null; }
}

// Text som inte är sparad: formulär i vyn (osparad-text.js), en öppen anteckning med vakt, en öppen dialog eller
// testarens panel med något ifyllt.
export function osparat() {
  if (harOsparadText() || lamnaVakt.fn) return true;
  const ifyllt = (rot) => [...rot.querySelectorAll('textarea, input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="search"])')]
    .some(e => !e.disabled && !e.readOnly && String(e.value ?? '').trim() !== '' && e.value !== e.defaultValue);
  for (const d of document.querySelectorAll('dialog[open]')) if (ifyllt(d)) return true;
  const panel = document.getElementById('testare-panel');
  return Boolean(panel && ifyllt(panel));
}

function visaRad() {
  let el = document.getElementById('ny-version-rad');
  if (el) return;
  el = document.createElement('div');
  el.id = 'ny-version-rad';
  el.className = 'ny-version-rad';
  el.setAttribute('role', 'status');
  el.innerHTML = `<p><strong>${esc(RAD_TEXT)}</strong></p>`;
  const ram = document.getElementById('osparad-rad') ?? document.getElementById('nyhetsruta') ?? document.getElementById('ram');
  if (ram?.parentNode) ram.insertAdjacentElement('beforebegin', el); else document.body.prepend(el);
}

function laddaOm() {
  if (iAvbrott()) return;
  if (osparat()) { visaRad(); return; }
  location.reload();
}

async function jamfor({ tvinga = false } = {}) {
  const t = Date.now();
  if (!tvinga && t - senast < INTERVALL_MS) return;
  senast = t;
  const v = await serverns();
  if (!v) return;
  if (!min) { min = v; return; }
  if (v !== min) { ny = true; laddaOm(); }
}

// En gång när appen startar.
export async function init() {
  senast = Date.now();
  min = await serverns();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') jamfor(); });
}

// Efter varje visad vy (app.js). När en ny version redan är upptäckt prövas omladdningen vid varje vybyte.
export function efterVy() {
  if (ny) { laddaOm(); return; }
  jamfor();
}
