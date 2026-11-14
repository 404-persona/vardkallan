// Runda 15, r4: stödet i anteckningsvyn (granskningen av mallarna, F1, F2, F5 och F9). Används av vyer/patient-journal.js.
//
// Underlaget: bredvid sökorden visar systemet det som hör till anteckningen. Ett klick för in värdet i sökordet där man
// senast skrev, med datum, och sparar det som en referens (servern prövar den). Inget dras in av sig självt.
// Utkastet: sparas av sig självt en kort stund efter att man har slutat skriva och när man lämnar rutan, på servern med
// samma behörighet som anteckningen. Under ett avbrott läggs det krypterat i skrivkön och sparas när servern svarar.
// Lämnar man sidan sparas texten först, och systemet frågar bara om den inte gick att spara.
// Varianter och förslag: sökord som systemet föreslår eller har valt ur kontakten är utfällda, resten fälls ut med ett
// klick. Läsordningen visar bedömning och åtgärd först.
// Egna fraser: punkt och kortnamnet och tabbtangenten, eller ett klick i listan.
import { esc, api, ApiFel, klockslag, datum, notis, ikon, avbrott } from './ui.js';
import { lamnaVakt } from './app.js';

const PAUS_MS = 1500;
const namn = (s) => (typeof s === 'string' ? s : s?.namn);

// ---------------------------------------------------------------------------------------------------------------
// Mallen för patienten

// Mallen med underlag, varianter och förslag, eller null när servern inte kan svara (till exempel i läsläget).
export async function hamtaStod(ctx, typ, utkastId = null) {
  try { return await api(`/api/patient/${encodeURIComponent(ctx.id)}/anteckningsmall?typ=${encodeURIComponent(typ)}${utkastId ? `&utkast=${utkastId}` : ''}`); } catch { return null; }
}

// Sökorden som fält: { namn, utfallt, varfor? }. Förslagen först och utfällda, varianternas sökord där varianten hör
// hemma, och sökord som systemet inte har valt infällda. Utan förslag och varianter är alla mallens sökord utfällda.
export function sokordLista(mall, stod, harText = new Set()) {
  const bas = (stod?.mall?.sokord ?? mall.sokord).map(s => (typeof s === 'string' ? { namn: s, utfallt: true } : { namn: s.namn, utfallt: Boolean(s.utfallt), variant: s.variant ?? null }));
  const foreslagna = (stod?.foreslagna ?? []).filter(f => typeof f?.sokord === 'string' && f.sokord);
  const valda = new Map((stod?.valdaVarianter ?? []).map(v => [v.id, v]));
  let lista = bas.map(b => ({ ...b, utfallt: b.variant ? valda.has(b.variant) : b.utfallt }));
  // Ett sökord som en vald variant ersätter fälls in, men finns kvar.
  for (const v of stod?.varianter ?? []) {
    const vald = valda.get(v.id);
    if (vald) for (const e of v.ersatter ?? []) { const x = lista.find(y => y.namn === e); if (x) x.utfallt = false; }
    const nya = v.sokord.filter(n => !lista.some(y => y.namn === n)).map(n => ({ namn: n, variant: v.id, utfallt: Boolean(vald) && (!vald.utfallda || vald.utfallda.includes(n)) }));
    const i = lista.findIndex(y => y.namn === v.efter);
    lista.splice(i >= 0 ? i + 1 : lista.length, 0, ...nya);
  }
  if (foreslagna.length) {
    const forst = foreslagna.map(f => ({ ...(lista.find(y => y.namn === f.sokord) ?? { namn: f.sokord }), utfallt: true, varfor: f.varfor }));
    lista = [...forst, ...lista.filter(y => !foreslagna.some(f => f.sokord === y.namn)).map(y => ({ ...y, utfallt: y.utfallt && !y.variant ? false : y.utfallt }))];
  }
  // Ett sökord med text är alltid utfällt.
  return lista.map(y => (harText.has(y.namn) ? { ...y, utfallt: true } : y));
}

// Fälten för sökorden. forifyllt: { [sokord]: { text, kalla, ref } } från underlaget.
export function sokordFalt(lista, varden = {}, { rost = new Set(), forifyllt = {} } = {}) {
  const utfallda = lista.filter(s => s.utfallt);
  const infallda = lista.filter(s => !s.utfallt);
  const falt = (s, i) => {
    const f = !varden[s.namn] && Object.hasOwn(forifyllt, s.namn) ? forifyllt[s.namn] : null;
    const id = `so-${i}`;
    const hjalp = [s.varfor ? `<span class="hjalp" data-foreslaget>${esc(s.varfor)}</span>` : '', f ? `<span class="hjalp" data-forifyllt>Ifyllt av systemet. ${esc(f.kalla)}. Ändra om det behövs.</span>` : ''].join('');
    return `<div class="falt" data-sokordfalt="${esc(s.namn)}"><label for="${id}">${esc(s.namn)}</label><textarea id="${id}" name="${id}" data-sokord="${esc(s.namn)}" rows="${i < 2 ? 3 : 2}" spellcheck="true" lang="sv"${rost.has(s.namn) ? ' data-inmatning="rost"' : ''}${f ? ` data-forifyllt-ref="${esc(JSON.stringify({ ...f.ref, text: f.text }))}"` : ''}>${esc(varden[s.namn] ?? f?.text ?? '')}</textarea>${hjalp}</div>`;
  };
  return `${utfallda.map((s, i) => falt(s, i)).join('')}<div data-infallda>${infallda.length ? `<p class="fler-sokord"><span class="under-text">Fler sökord:</span> ${infallda.map(s => `<button type="button" class="knapp liten text" data-utfall="${esc(s.namn)}" aria-expanded="false">${ikon.plus}<span>${esc(s.namn)}</span></button>`).join(' ')}</p>` : ''}</div>`;
}

// Varianterna som systemet har valt, med varför.
export function variantRad(stod) {
  const v = (stod?.valdaVarianter ?? []).map(x => ({ ...x, namn: stod.varianter.find(y => y.id === x.id)?.namn ?? x.id }));
  return v.length ? v.map(x => `<p class="ruta ruta-info liten" data-variant="${esc(x.id)}"><strong>${esc(x.namn)}.</strong> ${esc(x.varfor)}</p>`).join('') : '';
}

// ---------------------------------------------------------------------------------------------------------------
// Underlaget

const PIL = { upp: '↑', ned: '↓', samma: '→' };
const post = (x, extra = '') => `<li><button type="button" class="underlag-post" data-infoga="${esc(JSON.stringify({ ...x.ref, text: x.text }))}" data-underlag-text="${esc(x.text)}"${extra}>
  <span class="underlag-text">${esc(x.text)}</span>${x.pil ? ` <span class="underlag-pil" title="${esc(x.pilText)}"><span aria-hidden="true">${PIL[x.pil]}</span><span class="sr">, ${esc(x.pilText)}</span></span>` : ''}${x.nytt === false ? '' : x.nytt ? ' <span class="tagg">Ny</span>' : ''}</button></li>`;
const grupp = (rubrik, rader, under = '') => (rader?.length ? `<section class="underlag-grupp"><h3>${esc(rubrik)}</h3>${under ? `<p class="under-text">${esc(under)}</p>` : ''}<ul>${rader.map(x => post(x)).join('')}</ul></section>` : '');

export function underlagHtml(u) {
  if (!u) return '';
  const delar = [
    u.kontakt ? grupp('Kontaktorsak', [u.kontakt], u.kontakt.kalla) : '',
    u.prioritet ? grupp('Prioritet', [u.prioritet], u.prioritet.kalla) : '',
    grupp('Mätvärden', u.matvarden, u.sedanText),
    grupp('Provsvar', u.provsvar, u.sedanText),
    grupp('Läkemedel', u.lakemedel, u.lakemedelText),
    grupp('Diagnoser', u.diagnoser),
  ].filter(Boolean);
  return `<aside class="ant-underlag" aria-labelledby="ul-rubrik"><h2 id="ul-rubrik">Underlag</h2>
    <p class="under-text">Ett klick för in värdet med datum där du senast skrev. Inget förs in av sig självt.</p>
    ${delar.length ? delar.join('') : '<p class="tom">Inget nytt sedan förra anteckningen av samma slag.</p>'}</aside>`;
}

// ---------------------------------------------------------------------------------------------------------------
// Fälten: referenser, utfällning, egna fraser

let fraserCache = null;
export async function egnaFraser({ nya = false } = {}) {
  if (!fraserCache || nya) { try { fraserCache = await api('/api/egna-fraser'); } catch { fraserCache = { fraser: [], ordningar: {}, tak: 20, maxText: 400 }; } }
  return fraserCache;
}
export const glomFraser = () => { fraserCache = null; };

// För in text i ett fält där markören står, med mellanslag före om det behövs, och sätter markören efter.
function infoga(t, text) {
  const a = t.selectionStart ?? t.value.length;
  const b = t.selectionEnd ?? a;
  const fore = t.value.slice(0, a);
  const mellan = fore && !/\s$/.test(fore) ? ' ' : '';
  t.value = `${fore}${mellan}${text}${t.value.slice(b)}`;
  const pos = a + mellan.length + text.length;
  t.focus();
  t.setSelectionRange(pos, pos);
  t.dispatchEvent(new Event('input', { bubbles: true }));
}

// Kopplar fälten i formuläret. Ger sistaFalt(), referenserna per fält och en funktion som läser sökorden.
export function kopplaFalt(form, { forvalda = [] } = {}) {
  const refs = new WeakMap();
  let sista = null;
  const textfalt = () => [...form.querySelectorAll('textarea[data-sokord]')];
  const forbered = (t) => {
    if (t.dataset.kopplad) return;
    t.dataset.kopplad = '1';
    const r = [];
    if (t.dataset.forifylltRef) { try { r.push(JSON.parse(t.dataset.forifylltRef)); } catch { /* ingen referens */ } }
    const f = forvalda.find(x => x.sokord === t.dataset.sokord);
    if (Array.isArray(f?.referenser)) r.push(...f.referenser.filter(x => x.id));
    refs.set(t, r);
    t.addEventListener('focus', () => { sista = t; });
    t.addEventListener('keydown', (e) => fras(e, t));
  };
  textfalt().forEach(forbered);
  sista = textfalt()[0] ?? null;
  form.addEventListener('click', (e) => {
    const knapp = e.target.closest('[data-utfall]');
    if (knapp) { utfall(form, knapp.dataset.utfall, forbered); return; }
    const ul = e.target.closest('[data-infoga]');
    if (ul) {
      const ref = JSON.parse(ul.dataset.infoga);
      const t = sista?.isConnected ? sista : textfalt()[0];
      if (!t) return;
      infoga(t, ref.text);
      refs.get(t)?.push(ref);
    }
  });
  return {
    sistaFalt: () => sista,
    las: () => textfalt().map(t => {
      const text = t.value.trim();
      const r = (refs.get(t) ?? []).filter((x, i, l) => text.includes(x.text) && l.findIndex(y => y.typ === x.typ && y.id === x.id) === i);
      return { sokord: t.dataset.sokord, text, ...(t.dataset.inmatning === 'rost' ? { inmatning: 'rost' } : {}), ...(r.length ? { referenser: r } : {}) };
    }),
    forbered,
  };
}

// Fäller ut ett infällt sökord och sätter fokus i det.
function utfall(form, sokordNamn, forbered) {
  const knapp = [...form.querySelectorAll('[data-utfall]')].find(b => b.dataset.utfall === sokordNamn);
  if (!knapp) return;
  const alla = form.querySelectorAll('textarea[data-sokord]').length;
  const id = `so-u${alla}-${Math.random().toString(36).slice(2, 7)}`;
  const div = document.createElement('div');
  div.className = 'falt';
  div.dataset.sokordfalt = sokordNamn;
  div.innerHTML = `<label for="${id}">${esc(sokordNamn)}</label><textarea id="${id}" name="${id}" data-sokord="${esc(sokordNamn)}" rows="2" spellcheck="true" lang="sv"></textarea>`;
  const infallda = form.querySelector('[data-infallda]');
  infallda.before(div);
  knapp.remove();
  if (!infallda.querySelector('[data-utfall]')) infallda.innerHTML = '';
  const t = div.querySelector('textarea');
  forbered(t);
  t.focus();
}

// Punkt, kortnamnet och tabb byter kortnamnet mot den egna frasen.
function fras(e, t) {
  if (e.key !== 'Tab' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || !fraserCache?.fraser?.length) return;
  const pos = t.selectionStart;
  if (pos !== t.selectionEnd) return;
  const m = t.value.slice(0, pos).match(/(^|\s)\.([a-zåäö0-9]{1,12})$/i);
  const f = m && fraserCache.fraser.find(x => x.kort === m[2].toLocaleLowerCase('sv'));
  if (!f) return;
  e.preventDefault();
  const start = pos - m[2].length - 1;
  t.value = `${t.value.slice(0, start)}${f.text}${t.value.slice(pos)}`;
  t.setSelectionRange(start + f.text.length, start + f.text.length);
  t.dispatchEvent(new Event('input', { bubbles: true }));
}

// Knappen Fraser: listan med personens fraser och en länk för att hantera dem.
export function fraserKnapp() {
  return `<div class="fraser"><button type="button" class="knapp liten sekundar" data-fraser aria-expanded="false" aria-controls="fraser-lista">${ikon.lista}<span>Mina fraser</span></button><div id="fraser-lista" class="fraser-lista" hidden></div></div>`;
}
export function kopplaFraser(form, falt) {
  const knapp = form.querySelector('[data-fraser]');
  const lista = form.querySelector('#fraser-lista');
  if (!knapp) return;
  const rita = async () => {
    const f = await egnaFraser();
    lista.innerHTML = `${f.fraser.length ? `<ul>${f.fraser.map(x => `<li><button type="button" class="knapp liten text" data-fras="${x.id}"><span class="fras-kort">.${esc(x.kort)}</span> ${esc(x.text)}</button></li>`).join('')}</ul>` : '<p class="under-text">Du har inga egna fraser än.</p>'}
      <p class="under-text">Skriv punkt och kortnamnet, till exempel .${esc(f.fraser[0]?.kort ?? 'ub')}, och tryck på tabb.</p>
      <button type="button" class="knapp liten sekundar" data-hantera-fraser>Hantera mina fraser och min ordning</button>`;
  };
  knapp.addEventListener('click', async () => {
    const oppen = lista.hidden;
    if (oppen) await rita();
    lista.hidden = !oppen;
    knapp.setAttribute('aria-expanded', String(oppen));
  });
  lista.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fras]');
    if (b) {
      const f = (await egnaFraser()).fraser.find(x => String(x.id) === b.dataset.fras);
      const t = falt.sistaFalt();
      if (f && t?.isConnected) infoga(t, f.text);
      lista.hidden = true;
      knapp.setAttribute('aria-expanded', 'false');
      return;
    }
    if (e.target.closest('[data-hantera-fraser]')) { await hanteraFraser(form.dataset.mall ?? null); await rita(); }
  });
  egnaFraser().catch(() => {});
}

// Dialogen där personen lägger till och tar bort fraser och väljer sin ordning på sökorden i mallen.
export async function hanteraFraser(mallTyp) {
  const dl = document.createElement('dialog');
  dl.className = 'dialog fraser-dialog';
  dl.setAttribute('aria-labelledby', 'fd-rubrik');
  document.body.append(dl);
  const mallar = mallTyp ? await api('/api/mallar').catch(() => []) : [];
  const mall = mallar.find(m => m.typ === mallTyp && !m.strukturerad && !m.formular) ?? null;
  const rita = async (nya = false) => {
    const f = await egnaFraser({ nya });
    const ordning = mall ? (f.ordningar[mall.typ] ?? mall.sokord.map(namn)) : [];
    dl.innerHTML = `<h2 id="fd-rubrik" tabindex="-1">Mina fraser</h2>
      <p>Egna korta texter som du skriver in med punkt, kortnamnet och tabb. De är bara dina, sparas inte med någon patient och får inte innehålla värden ur journalen. Högst ${f.tak} fraser och ${f.maxText} tecken per fras.</p>
      ${f.fraser.length ? `<ul class="fras-tabell">${f.fraser.map(x => `<li><span class="fras-kort">.${esc(x.kort)}</span> <span>${esc(x.text)}</span> <button type="button" class="knapp liten text" data-ta-bort="${x.id}" aria-label="Ta bort frasen .${esc(x.kort)}">${ikon.kryss}<span>Ta bort</span></button></li>`).join('')}</ul>` : '<p class="tom">Inga fraser än.</p>'}
      <form data-ny-fras novalidate><div class="falt-rad"><div class="falt"><label for="fd-kort">Kortnamn</label><input id="fd-kort" name="kort" maxlength="13" autocomplete="off" aria-describedby="fd-kort-h"><span class="hjalp" id="fd-kort-h">Bokstäver eller siffror, till exempel ub.</span></div>
      <div class="falt"><label for="fd-text">Frasen</label><textarea id="fd-text" name="text" rows="2" maxlength="${f.maxText}"></textarea></div></div>
      <p class="form-fel" role="alert" hidden></p><button type="submit" class="knapp sekundar">Lägg till frasen</button></form>
      ${mall ? `<h3>Min ordning i ${esc(mall.typ.toLowerCase())}</h3><p class="under-text">Bara ordningen när du själv skriver. Sökorden är vårdenhetens.</p>
        <ol class="ordning-lista">${ordning.map((n, i) => `<li><span>${esc(n)}</span> <button type="button" class="knapp liten text" data-upp="${i}"${i === 0 ? ' disabled' : ''} aria-label="Flytta ${esc(n)} upp">Upp</button></li>`).join('')}</ol>
        <div class="knapprad"><button type="button" class="knapp liten sekundar" data-standard>Vårdenhetens ordning</button></div>` : ''}
      <div class="knapprad"><button type="button" class="knapp" data-stang>Stäng</button></div>`;
    dl.querySelector('[data-ny-fras]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fo = e.currentTarget;
      const fel = fo.querySelector('.form-fel');
      try { await api('/api/egna-fraser', { metod: 'POST', data: { kort: fo.kort.value, text: fo.text.value } }); await rita(true); dl.querySelector('#fd-kort')?.focus(); notis('Frasen är sparad.'); } catch (x) { fel.textContent = x.message; fel.hidden = false; }
    });
    dl.querySelectorAll('[data-ta-bort]').forEach(b => b.addEventListener('click', async () => { try { await api(`/api/egna-fraser/${b.dataset.taBort}`, { metod: 'DELETE' }); await rita(true); dl.querySelector('h2').focus(); } catch { /* notis visad */ } }));
    dl.querySelectorAll('[data-upp]').forEach(b => b.addEventListener('click', async () => {
      const i = Number(b.dataset.upp);
      const ny = [...ordning];
      [ny[i - 1], ny[i]] = [ny[i], ny[i - 1]];
      try { await api('/api/egna-fraser/ordning', { metod: 'PUT', data: { typ: mall.typ, ordning: ny } }); await rita(true); dl.querySelector(`[data-upp="${i - 1}"]`)?.focus() ?? dl.querySelector('h2').focus(); } catch { /* notis visad */ }
    }));
    dl.querySelector('[data-standard]')?.addEventListener('click', async () => { try { await api('/api/egna-fraser/ordning', { metod: 'PUT', data: { typ: mall.typ, ordning: [] } }); await rita(true); notis('Sökorden står i vårdenhetens ordning.'); } catch { /* notis visad */ } });
    dl.querySelector('[data-stang]').addEventListener('click', () => dl.close());
  };
  await rita();
  const forra = document.activeElement;
  await new Promise((klar) => {
    dl.addEventListener('close', () => { dl.remove(); if (forra?.isConnected) forra.focus(); klar(); }, { once: true });
    dl.showModal();
    dl.querySelector('h2').focus();
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Utkastet som sparas av sig självt

const tidText = (t) => `${datum(t)} kl. ${klockslag(t)}`;

// Styr sparandet för ett formulär. typ är mallen, anteckningId utkastet om det finns, las() sokorden i fälten.
// Ger { spara(), nu(), osparat(), anteckningId(), stopp() }.
export function autospara(form, ctx, { typ, anteckningId = null, las, nyKontakt = () => ({}), vidSparat = () => {}, pausad = () => false }) {
  let id = anteckningId;
  let timer = null;
  let senast = JSON.stringify(las());
  let pagar = null;
  let fel = null;
  const lokalId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const status = form.querySelector('[data-sparstatus]');
  const visa = (text) => { if (status) status.textContent = text; };
  const osparat = () => JSON.stringify(las()) !== senast;
  async function spara() {
    clearTimeout(timer);
    timer = null;
    if (pagar) await pagar.catch(() => {});
    const sokord = las();
    const json = JSON.stringify(sokord);
    if (json === senast) return id;
    pagar = (async () => {
      try {
        const r = await api(`/api/patient/${encodeURIComponent(ctx.id)}/anteckningsutkast`, { metod: 'PUT', tyst: true, ko: true, data: { ...(id ? { anteckningId: id } : {}), typ, sokord, lokalId, ...nyKontakt() } });
        senast = json;
        fel = null;
        if (r?.koad) visa('Utkastet är sparat krypterat på datorn och sparas i journalen när servern svarar igen.');
        else if (!r?.tomt) { id = r.id; visa(`Utkastet sparades ${klockslag(r.sparad)}. Det syns bara för dig tills du signerar.`); vidSparat(r); }
      } catch (e) {
        fel = e;
        visa(`Utkastet kunde inte sparas: ${e.message} Texten finns kvar här.`);
        throw e;
      } finally { pagar = null; }
    })();
    await pagar;
    return id;
  }
  const schemalagg = () => { if (pausad()) return; clearTimeout(timer); timer = setTimeout(() => spara().catch(() => {}), PAUS_MS); };
  const lamnar = (e) => { if (!form.contains(e.relatedTarget) && osparat() && !pausad()) spara().catch(() => {}); };
  form.addEventListener('input', schemalagg);
  form.addEventListener('focusout', lamnar);
  // Lämnar man vyn sparas texten först. Går det inte frågar systemet en gång.
  lamnaVakt.fn = async () => {
    if (!form.isConnected || !osparat()) return true;
    try { await spara(); return true; } catch {
      return window.confirm(`Texten i ${typ.toLowerCase()} kunde inte sparas. Lämnar du sidan försvinner den. Vill du lämna ändå?`);
    }
  };
  const vidStang = (e) => {
    if (!form.isConnected || !osparat()) return;
    // Texten skickas med keepalive, så att den kommer fram också när fliken stängs. Om förra försöket misslyckades
    // frågar webbläsaren först.
    try {
      fetch(`/api/patient/${encodeURIComponent(ctx.id)}/anteckningsutkast`, { method: 'PUT', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(id ? { anteckningId: id } : {}), typ, sokord: las(), lokalId }) });
    } catch { /* fliken stängs */ }
    if (fel) { e.preventDefault(); e.returnValue = ''; }
  };
  window.addEventListener('beforeunload', vidStang);
  visa(id ? `Utkastet sparas av sig självt.` : 'Utkastet sparas av sig självt när du har börjat skriva.');
  return {
    spara, osparat, anteckningId: () => id,
    stopp: () => {
      clearTimeout(timer);
      form.removeEventListener('input', schemalagg);
      form.removeEventListener('focusout', lamnar);
      window.removeEventListener('beforeunload', vidStang);
      lamnaVakt.fn = null;
      senast = JSON.stringify(las());
    },
    schemalagg,
    tidText,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Läsordningen: bedömning och åtgärd först (APSO), utan att det sparade ändras.

export const LAS_FORST = ['Bedömning', 'Åtgärd'];
export function lasordning(sokord) {
  if (!Array.isArray(sokord) || !sokord.some(s => LAS_FORST.includes(s.sokord))) return sokord;
  return [...LAS_FORST.flatMap(n => sokord.filter(s => s.sokord === n)), ...sokord.filter(s => !LAS_FORST.includes(s.sokord))];
}

// En text med referenser till underlaget visas med källan bredvid värdet.
export function textMedReferenser(s) {
  let html = esc(s.text);
  for (const r of s.referenser ?? []) {
    const e = esc(r.text);
    if (html.includes(e)) html = html.replace(e, () => `<span class="ant-ref" title="${esc(r.kalla ?? 'Ur journalen')}">${e}<span class="sr"> (${esc(r.kalla ?? 'Ur journalen')})</span></span>`);
  }
  return html;
}

export const iLaslage = () => Boolean(avbrott.aktivt || avbrott.simulerat);
export { ApiFel };
