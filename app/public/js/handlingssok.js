// Runda 18, r2: sökrutan "Vad vill du göra?". En knapp i sidhuvudet och kortkommandot Ctrl K (Cmd K på Mac) öppnar en
// ruta där personalen skriver med egna ord, till exempel sjukskriv, skriv remiss, ge dos eller boka tid. Servern svarar
// med de handlingar som rollen får (GET /api/handlingar/sok), och för en öppen patient med länkar till patientens flik,
// där formuläret öppnas med det som går att fylla i redan ifyllt. Saknar rollen handlingen säger rutan vilken roll som
// gör den. En handling i journalen som väljs utan öppen patient väntar tills patienten öppnas från listan.
//
// Knappen och rutan har egna klasser och id (hs-), så att andra delars element och tester inte påverkas.
import { esc, api, notis, ikon, avbrott } from './ui.js';
import { arPersonal } from './app.js';
import { aktuellPatient } from './vyer/patient.js';

export const KNAPP = '[data-a="vad-vill-du"]';
export const knappHtml = () => `<button type="button" class="knapp liten sekundar hs-knapp" data-a="vad-vill-du" aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K">${ikon.sok}<span>Vad vill du göra?</span><kbd class="hs-tangent" aria-hidden="true">Ctrl K</kbd></button>`;

// Runda 18, r2 och r1: gränssnittet mot r1:s mätning av sökningar i testinbjudan. r1:s block sätter funktionen
// window.vkMatning.sokning, som bara mäter när testaren har samtyckt. Anropet är en no-op när funktionen inte finns.
// Det som skickas: handlingens id eller null, antalet träffar, om något passade, om rutan stängdes utan val, tiden från
// att rutan öppnades i millisekunder och frågan bara när den saknar siffror och har högst 40 tecken, så att inga
// personnummer eller andra nummer följer med.
function matSokning(h) {
  try {
    const f = globalThis.vkMatning?.sokning;
    if (typeof f === 'function') f(h);
  } catch { /* mätningen får aldrig störa sökningen */ }
}

let dialog = null;
let lage = { pid: null, oppnad: 0, fraga: '', svar: null, nr: 0, pagaende: null };
// En handling i journalen som väntar på att en patient öppnas: { mal, klicka, fokus, namn, tills }.
let vantande = null;

// Patienten som är öppen i journalen just nu, bara när adressen och patienthuvudet gäller samma patient.
function oppenPatient() {
  const m = (location.hash || '').match(/^#\/patient\/([\w-]+)/);
  const h = aktuellPatient();
  if (!m || !h || h.id !== m[1]) return null;
  return { id: h.id, namn: h.skyddad && !h.identitetVisad ? 'patienten med skyddad identitet' : h.namn };
}

function bygg() {
  dialog = document.createElement('dialog');
  dialog.className = 'hs-dialog';
  dialog.id = 'hs-dialog';
  dialog.setAttribute('aria-labelledby', 'hs-rubrik');
  dialog.innerHTML = `<div class="hs-inre">
      <div class="hs-huvud"><h2 id="hs-rubrik">Vad vill du göra?</h2><button type="button" class="knapp text liten" data-hs-stang>${ikon.kryss}<span>Stäng</span></button></div>
      <label class="hs-etikett" for="hs-falt">Skriv med egna ord</label>
      <input id="hs-falt" type="search" autocomplete="off" spellcheck="false" maxlength="80" aria-describedby="hs-hjalp" aria-controls="hs-traffar" placeholder="Till exempel sjukskriv, ge dos eller boka tid">
      <p class="hjalp" id="hs-hjalp"></p>
      <p class="sr" id="hs-status" aria-live="polite"></p>
      <div id="hs-svar"></div>
      <p class="liten hs-fot"><a href="#/ordlista" data-hs-ordlista>Jag letar efter: ord från andra journalsystem</a><span>Öppna rutan med Ctrl K.</span></p>
    </div>`;
  document.body.append(dialog);
  const falt = dialog.querySelector('#hs-falt');
  let timer = null;
  falt.addEventListener('input', () => {
    clearTimeout(timer);
    lage.fraga = falt.value;
    timer = setTimeout(() => sok(falt.value), 90);
  });
  falt.addEventListener('keydown', async (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); dialog.querySelector('[data-hs-i]')?.focus(); }
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(timer);
      // Väntar in sökningen på det som står i fältet, så att Enter alltid väljer det som passar texten.
      if (lage.svar?.fraga !== falt.value.trim() || lage.pagaende) await sok(falt.value);
      const forsta = lage.svar?.traffar?.find(t => t.href || t.klicka || (t.kraverPatient && !t.forklaring));
      if (forsta) valj(forsta);
    }
  });
  dialog.addEventListener('keydown', (e) => {
    const lista = [...dialog.querySelectorAll('[data-hs-i]')];
    const i = lista.indexOf(document.activeElement);
    if (i < 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); lista[Math.min(i + 1, lista.length - 1)].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (i === 0 ? falt : lista[i - 1]).focus(); }
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) { stang(); return; }
    if (e.target.closest('[data-hs-stang]')) { stang(); return; }
    if (e.target.closest('[data-hs-ordlista]')) { matSokning(matning(null, { ordlista: true })); dialog.close(); return; }
    const a = e.target.closest('[data-hs-i]');
    if (!a) return;
    e.preventDefault();
    const t = lage.svar?.traffar?.[Number(a.dataset.hsI)];
    if (t) valj(t);
  });
  dialog.addEventListener('cancel', () => matSokning(matning(null, { avbruten: true })));
}

const matning = (handling, extra = {}) => {
  const f = (lage.fraga ?? '').trim();
  return { handling, traffar: lage.svar?.traffar?.length ?? 0, passade: Boolean(lage.svar?.traffar?.length), tidMs: Math.round(performance.now() - lage.oppnad),
    fraga: f && !/\d/.test(f) && f.length <= 40 ? f : null, patient: Boolean(lage.pid), ...extra };
};

export function oppna() {
  if (!arPersonal()) return;
  if (!dialog) bygg();
  const p = oppenPatient();
  lage = { pid: p?.id ?? null, oppnad: performance.now(), fraga: '', svar: null, nr: lage.nr, pagaende: null };
  dialog.querySelector('#hs-hjalp').textContent = p
    ? `Gäller ${p.namn}. En handling i journalen öppnas direkt för patienten.`
    : 'En handling i journalen öppnas när du har valt patient i listan.';
  const falt = dialog.querySelector('#hs-falt');
  falt.value = '';
  if (!dialog.open) dialog.showModal();
  falt.focus();
  sok('');
}

function stang() {
  matSokning(matning(null, { avbruten: true }));
  dialog?.close();
}

async function sok(text) {
  const fraga = String(text ?? '').trim();
  const nr = ++lage.nr;
  const ut = dialog.querySelector('#hs-svar');
  if (avbrott.aktivt || avbrott.simulerat) {
    ut.innerHTML = '<p class="ruta ruta-info liten">Under avbrottet går det bara att läsa i läskopian, och sökrutan behöver servern. Använd menyn och flikarna i journalen tills förbindelsen är tillbaka.</p>';
    return;
  }
  const jobb = api(`/api/handlingar/sok?${new URLSearchParams({ q: fraga, ...(lage.pid ? { patient: lage.pid } : {}) })}`, { tyst: true });
  lage.pagaende = jobb;
  try {
    const svar = await jobb;
    if (nr !== lage.nr) return;
    lage.svar = svar;
    ritaSvar(svar);
  } catch (e) {
    if (nr !== lage.nr || e?.kod === 'avbruten') return;
    lage.svar = null;
    ut.innerHTML = `<p class="ruta ruta-info liten">${esc(e?.status === 400 ? e.message : 'Sökningen svarar inte just nu. Använd menyn, eller försök igen om en stund.')}</p>`;
  } finally {
    if (lage.pagaende === jobb) lage.pagaende = null;
  }
}

function traffHtml(t, i, pid) {
  const plats = t.kraverPatient ? (pid && t.href ? 'I journalen' : 'Välj patient först') : '';
  const under = [t.vy, plats].filter(Boolean).join('. ');
  if (t.forklaring) {
    return `<li class="hs-traff hs-ej"><span class="hs-namn">${esc(t.namn)}</span><span class="under-text">${esc(t.forklaring)}</span></li>`;
  }
  const href = t.href ?? (t.kraverPatient ? '#/arbetslista' : location.hash || '#/');
  return `<li><a class="hs-traff" href="${esc(href)}" data-hs-i="${i}" data-hs-id="${esc(t.id)}"><span class="hs-namn">${esc(t.namn)}</span><span class="under-text">${esc(under)}.</span>${t.via ? `<span class="hs-via">${esc(t.via)}</span>` : ''}</a></li>`;
}

function ritaSvar(svar) {
  const ut = dialog.querySelector('#hs-svar');
  const status = dialog.querySelector('#hs-status');
  const delar = [];
  if (svar.traffar.length) {
    delar.push(`${svar.vanliga ? '<h3 class="hs-under">Vanligt för dig</h3>' : ''}<ul class="hs-traffar" id="hs-traffar">${svar.traffar.map((t, i) => traffHtml(t, i, lage.pid)).join('')}</ul>`);
  }
  if (svar.saknas?.length) {
    delar.push(`<h3 class="hs-under">Görs av en annan roll</h3><ul class="hs-saknas">${svar.saknas.map(s => `<li>${esc(s.text)}</li>`).join('')}</ul>`);
  }
  if (!svar.traffar.length && svar.inget) delar.push(`<p class="hs-inget">${esc(svar.inget)} <a href="#/ordlista" data-hs-ordlista>Öppna Jag letar efter</a>.</p>`);
  ut.innerHTML = delar.join('');
  status.textContent = svar.vanliga ? '' : svar.traffar.length ? `${svar.traffar.length} förslag. Enter väljer det första.` : (svar.inget ?? '');
}

// Väntar tills ett element finns och syns, högst ms millisekunder.
async function vanta(sel, ms = 8000) {
  const slut = Date.now() + ms;
  while (Date.now() < slut) {
    const el = document.querySelector(sel);
    if (el && el.getClientRects().length) return el;
    await new Promise(r => setTimeout(r, 80));
  }
  return null;
}

// Det som görs efter att vyn har öppnats: knappar som bara öppnar ett formulär eller en dialog, och fältet som får fokus.
async function efter(t) {
  for (const sel of t.klicka ?? []) {
    const el = await vanta(sel);
    if (!el) return;
    el.click();
  }
  if (t.fokus) (await vanta(t.fokus))?.focus();
}

async function ga(href) {
  if (location.hash === href) return;
  const bytt = new Promise(r => window.addEventListener('hashchange', () => setTimeout(r, 0), { once: true }));
  location.hash = href;
  await bytt;
}

async function valj(t) {
  matSokning(matning(t.id));
  dialog.close();
  if (t.kraverPatient && !t.href) {
    vantande = { mal: t.mal, klicka: t.klicka, fokus: t.fokus, namn: t.namn, tills: Date.now() + 15 * 60_000 };
    notis(`Öppna patienten i listan. Du kommer sedan direkt till ${t.namn.charAt(0).toLowerCase()}${t.namn.slice(1)}.`, 'info');
    await ga('#/arbetslista');
    return;
  }
  if (t.href) await ga(t.href);
  await efter(t);
}

// En handling som väntar på en patient: när patientens journal öppnas från listan byts adressen till handlingens flik
// innan journalen ritas. Lyssnaren läggs innan app.js lägger sin, eftersom modulen läses in först.
const PAUSA = /^#\/(arbetslista|sok|vantrum|inkorg)(\?|$)/;
window.addEventListener('hashchange', () => {
  // Bakåtknappen medan rutan är öppen: rutan stängs, så att den aldrig ligger kvar över en annan sida.
  if (dialog?.open) dialog.close();
  if (!vantande) return;
  // En handling väntar bara för den som valde den: efter en utloggning eller efter 15 minuter glöms den.
  if (Date.now() > vantande.tills || !arPersonal()) { vantande = null; return; }
  const m = (location.hash || '').match(/^#\/patient\/([\w-]+)$/);
  if (!m) { if (!PAUSA.test(location.hash || '')) vantande = null; return; }
  const v = vantande;
  vantande = null;
  const flik = v.mal.flik === 'oversikt' && !v.mal.sub ? '' : `/${v.mal.flik}${v.mal.sub ? `/${v.mal.sub}` : ''}`;
  if (flik) history.replaceState(null, '', `#/patient/${m[1]}${flik}`);
  if (v.klicka?.length || v.fokus) setTimeout(() => efter(v), 0);
});

document.addEventListener('click', (e) => {
  if (e.target.closest(KNAPP)) oppna();
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k' && arPersonal()) {
    e.preventDefault();
    if (dialog?.open) dialog.querySelector('#hs-falt').focus(); else oppna();
  }
});
