// Runda 18, r5: listor som uppdaterar sig själva. Arbetslistan, inkorgen, väntrummet och avdelningens planering visar
// det nya utan att någon behöver ladda om. Var tjugonde sekund frågar gränssnittet servern i bakgrunden (X-Vk-Bakgrund),
// med samma behörighet som listan. Har något ändrats ritas vyn om utan att fokus eller rullning flyttas, och en
// skärmläsare får veta att listan är uppdaterad.
//
// Frågan räknas inte som aktivitet för utloggningen, görs inte när fliken inte syns, inte under ett avbrott och inte
// efter fem minuter utan att användaren har gjort något. En sandlåda som vilar väcks inte (servern svarar 204). Medan
// användaren skriver i ett fält, har en dialog öppen eller markerar text väntar omritningen tills det är klart.
import { avbrott } from './ui.js';
import { arPersonal, ritaTyst } from './app.js';

export const LISTOR = { '#/arbetslista': '/api/arbetslista', '#/inkorg': '/api/inkorg', '#/vantrum': '/api/vantrum', '#/avdelning': '/api/avdelning/planering' };
export const INTERVALL_MS = 20_000;
export const VILA_MS = 5 * 60_000;
// Testerna kan korta intervallet (window.__vkLevandeIntervall i millisekunder).
const intervall = () => Math.max(500, Number(globalThis.__vkLevandeIntervall) || INTERVALL_MS);

let aktivitet = Date.now();
let senast = { vy: null, data: null };
let vantar = false;
let timer = null;

for (const t of ['pointerdown', 'keydown', 'wheel', 'touchstart']) document.addEventListener(t, () => { aktivitet = Date.now(); }, { capture: true, passive: true });

const vyNu = () => (location.hash || '').split('?')[0];
function upptagen() {
  const a = document.activeElement;
  if (a && a !== document.body && a.matches('input, textarea, select, [contenteditable="true"]')) return true;
  if (document.querySelector('dialog[open]') || document.body.classList.contains('meny-oppen')) return true;
  try { if (String(getSelection?.() ?? '').trim()) return true; } catch { /* inget markerat */ }
  return false;
}

function meddela() {
  let el = document.getElementById('levande-status');
  if (!el) {
    el = document.createElement('p');
    el.id = 'levande-status';
    el.className = 'sr';
    el.setAttribute('aria-live', 'polite');
    document.body.append(el);
  }
  el.textContent = '';
  setTimeout(() => { el.textContent = 'Listan är uppdaterad.'; }, 50);
}

async function hamta(vag) {
  try {
    const r = await fetch(vag, { credentials: 'same-origin', cache: 'no-store', headers: { 'X-Vk-Bakgrund': '1' } });
    return r.status === 200 ? await r.text() : null;
  } catch { return null; }
}

async function kolla() {
  const vy = vyNu();
  const vag = Object.hasOwn(LISTOR, vy) ? LISTOR[vy] : null;
  if (!vag || !arPersonal() || document.hidden || avbrott.aktivt || avbrott.simulerat || Date.now() - aktivitet > VILA_MS) return;
  const text = await hamta(vag);
  if (text == null || vyNu() !== vy) return;
  if (senast.vy !== vy || senast.data == null) { senast = { vy, data: text }; return; }
  if (text === senast.data && !vantar) return;
  senast.data = text;
  if (upptagen()) { vantar = true; return; }
  vantar = false;
  await ritaTyst();
  meddela();
}

function schemalagg() {
  clearTimeout(timer);
  timer = setTimeout(async () => { await kolla().catch(() => {}); schemalagg(); }, intervall());
}

// Anropas efter varje visad vy (app.js). En ny vy får en ny jämförelse.
export function efterVy() {
  const vy = vyNu();
  if (senast.vy !== vy) { senast = { vy, data: null }; vantar = false; }
  if (Object.hasOwn(LISTOR, vy)) setTimeout(() => kolla().catch(() => {}), 1000);
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) kolla().catch(() => {}); });
schemalagg();
