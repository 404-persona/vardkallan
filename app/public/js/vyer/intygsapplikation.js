// Runda 14, r3: den simulerade intygsapplikationen (Sussa 2.2.1.9). Den öppnas från fliken Intyg i journalen, med
// patienten, läkaren och vårdenheten ifyllda, som Webcert i integrerat läge. Den är simulerad och inte Webcert: inget
// intyg lämnar demon. Varje ändring, signering och sändning meddelas journalen med statusuppdateringar.
// Runda 16, r1: alla intyg i Webcert, med blankettens frågor och svarsalternativ. Formuläret byggs ur intygstypen som
// servern skickar. Det som journalen fyllde i står med sin källa, följdfrågor visas bara när de gäller, och knapparna är
// de som den inloggade får använda för intyget just nu.
import { esc, api, notis, medKnapp, vyRubrik, tidpunkt } from '../ui.js';
// Runda 16, r2: Socialstyrelsens försäkringsmedicinska beslutsstöd medan läkaren skriver sjukintyget.
import * as fmbPanel from '../beslutsstod-fmb-ui.js';

export const namn = 'intygsapplikation';

const idFor = (id) => `ia-${String(id).replace(/[^\w-]/g, '-')}`;
const idag = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
const plusDagar = (datum, n) => { const d = new Date(`${datum}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Samma regel som servern (intygstyper.js synlig): visas när svaret är värdet eller innehåller något av värdena.
function uppfyllt(villkor, svar) {
  const [id, ska] = villkor;
  const v = svar[id];
  if (v == null) return false;
  const lista = Array.isArray(ska) ? ska : [ska];
  if (Array.isArray(v)) return v.some(x => lista.includes(typeof x === 'object' ? x.kod : x));
  if (v && typeof v === 'object') return Object.keys(v).some(k => lista.includes(k));
  return lista.includes(v);
}
function synlig(fragor, q, svar, djup = 0) {
  if (djup > 10) return false;
  const beror = (v) => { const o = fragor.find(x => x.id === v[0]); return o ? synlig(fragor, o, svar, djup + 1) : true; };
  if (q.dold && beror(q.dold) && uppfyllt(q.dold, svar)) return false;
  if (q.visas) return beror(q.visas) && uppfyllt(q.visas, svar);
  return true;
}

const kallaHtml = (k) => (k ? `<span class="under-text ia-kalla">Förifyllt ur journalen: ${esc(k)}</span>` : '');
const krav = (q) => (q.krav ? ' <span class="under-text">(obligatorisk)</span>' : '');

function fragaHtml(q, v, kalla, av) {
  const id = idFor(q.id);
  const n = `q-${q.id}`;
  const dis = av ? ' disabled' : '';
  const alt = Object.entries(q.alt ?? {});
  switch (q.typ) {
    case 'kryss':
      return `<div class="falt falt-kryss"><label><input type="checkbox" id="${id}" name="${n}"${v === true ? ' checked' : ''}${dis}> ${esc(q.text)}</label>${kallaHtml(kalla)}</div>`;
    case 'ja_nej':
      return `<fieldset class="falt" id="${id}"><legend>${esc(q.text)}${krav(q)}</legend>
        <label><input type="radio" name="${n}" value="ja"${v === true ? ' checked' : ''}${dis}> Ja</label>
        <label><input type="radio" name="${n}" value="nej"${v === false ? ' checked' : ''}${dis}> Nej</label>${kallaHtml(kalla)}</fieldset>`;
    case 'val':
      if (alt.length > 6) return `<div class="falt"><label for="${id}">${esc(q.text)}${krav(q)}</label><select id="${id}" name="${n}"${dis}><option value="">Välj</option>${alt.map(([k, t]) => `<option value="${esc(k)}"${v === k ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>${kallaHtml(kalla)}</div>`;
      return `<fieldset class="falt" id="${id}"><legend>${esc(q.text)}${krav(q)}</legend>${alt.map(([k, t]) => `<label><input type="radio" name="${n}" value="${esc(k)}"${v === k ? ' checked' : ''}${dis}> ${esc(t)}</label>`).join('')}${kallaHtml(kalla)}</fieldset>`;
    case 'flerval':
      return `<fieldset class="falt" id="${id}"><legend>${esc(q.text)}${krav(q)}</legend>${alt.map(([k, t]) => `<label><input type="checkbox" name="${n}" value="${esc(k)}"${(v ?? []).includes(k) ? ' checked' : ''}${dis}> ${esc(t)}</label>`).join('')}${kallaHtml(kalla)}</fieldset>`;
    case 'underlag':
      return `<fieldset class="falt" id="${id}"><legend>${esc(q.text)}${krav(q)}</legend>${alt.map(([k, t], i) => `<div class="ia-rad"><label><input type="checkbox" name="${n}" value="${esc(k)}"${v?.[k] ? ' checked' : ''}${dis}> ${esc(t)}</label>
        <label class="sr" for="${id}-d${i}">Datum för ${esc(t.toLowerCase())}</label><input type="date" id="${id}-d${i}" data-datum-for="${esc(k)}" value="${esc(v?.[k] ?? '')}"${dis}></div>`).join('')}${kallaHtml(kalla)}</fieldset>`;
    case 'datum':
      return `<div class="falt"><label for="${id}">${esc(q.text)}${krav(q)}</label><input type="date" id="${id}" name="${n}" value="${esc(v ?? '')}"${dis}>${kallaHtml(kalla)}</div>`;
    case 'period':
      return `<fieldset class="falt" id="${id}"><legend>${esc(q.text)}${krav(q)}</legend>
        <label for="${id}-start">Från och med</label><input type="date" id="${id}-start" name="${n}" value="${esc(v?.fran ?? '')}"${dis}>
        <label for="${id}-slut">Till och med</label><input type="date" id="${id}-slut" value="${esc(v?.till ?? '')}"${dis}>${q.maxDagar ? `<span class="under-text">Högst ${q.maxDagar} dagar.</span>` : ''}${kallaHtml(kalla)}</fieldset>`;
    case 'perioder':
      return `<fieldset class="falt" id="${id}"><legend>${esc(q.text)}${krav(q)}</legend>${alt.map(([k, t], i) => {
        const p = (v ?? []).find(x => x.kod === k);
        return `<div class="ia-rad"><label><input type="checkbox" name="${n}" value="${esc(k)}"${p ? ' checked' : ''}${dis}> ${esc(t)}</label>
          <label class="sr" for="${id}-f${i}">Från och med, ${esc(t)}</label><input type="date" id="${id}-f${i}" data-fran-for="${esc(k)}" value="${esc(p?.fran ?? '')}"${dis}>
          <label class="sr" for="${id}-t${i}">Till och med, ${esc(t)}</label><input type="date" id="${id}-t${i}" data-till-for="${esc(k)}" value="${esc(p?.till ?? '')}"${dis}></div>`;
      }).join('')}${kallaHtml(kalla)}</fieldset>`;
    case 'text':
      return `<div class="falt"><label for="${id}">${esc(q.text)}${krav(q)}</label><textarea id="${id}" name="${n}" rows="3" maxlength="${q.max ?? 4000}"${dis}>${esc(v ?? '')}</textarea>${kallaHtml(kalla)}</div>`;
    case 'rad':
      return `<div class="falt"><label for="${id}">${esc(q.text)}${krav(q)}</label><input type="text" id="${id}" name="${n}" maxlength="${q.max ?? 200}" value="${esc(v ?? '')}"${dis}>${kallaHtml(kalla)}</div>`;
    case 'heltal':
      return `<div class="falt"><label for="${id}">${esc(q.text)}${krav(q)}</label><input type="number" inputmode="numeric" id="${id}" name="${n}" min="${q.min ?? 0}" max="${q.max ?? 9999}" value="${esc(v ?? '')}"${dis}>${kallaHtml(kalla)}</div>`;
    case 'diagnoser':
      return `<fieldset class="falt" id="${id}"><legend>${esc(q.text)}${krav(q)}</legend>${[0, 1, 2].map(i => `<div class="ia-rad">
        <label for="${id}-k${i}">${i === 0 ? 'Diagnoskod' : `Diagnoskod ${i + 1}`}</label><input type="text" id="${id}-k${i}" name="${i === 0 ? n : ''}" data-kod="${i}" value="${esc(v?.[i]?.kod ?? '')}" maxlength="10" autocomplete="off"${dis}>
        <label for="${id}-b${i}">Diagnos</label><input type="text" id="${id}-b${i}" data-text="${i}" value="${esc(v?.[i]?.text ?? '')}" maxlength="200"${dis}></div>`).join('')}${kallaHtml(kalla)}</fieldset>`;
    default: return '';
  }
}

// Läser formulärets värde för en fråga i den form som servern tar emot.
function lasVarde(form, q) {
  const n = `q-${q.id}`;
  const alla = [...form.querySelectorAll(`[name="${n}"]`)];
  switch (q.typ) {
    case 'kryss': return alla[0]?.checked ? true : null;
    case 'ja_nej': { const c = alla.find(x => x.checked); return c ? c.value === 'ja' : null; }
    case 'val': { const c = alla.find(x => x.checked) ?? (alla[0]?.tagName === 'SELECT' ? alla[0] : null); return c?.value || null; }
    case 'flerval': { const l = alla.filter(x => x.checked).map(x => x.value); return l.length ? l : null; }
    case 'underlag': {
      const ut = {};
      for (const c of alla.filter(x => x.checked)) ut[c.value] = form.querySelector(`#${idFor(q.id)} [data-datum-for="${c.value}"]`)?.value || idag();
      return Object.keys(ut).length ? ut : null;
    }
    case 'period': {
      const f = form.querySelector(`#${idFor(q.id)}-start`)?.value;
      const t = form.querySelector(`#${idFor(q.id)}-slut`)?.value;
      return f || t ? { fran: f, till: t } : null;
    }
    case 'perioder': {
      const l = alla.filter(x => x.checked).map(c => ({ kod: c.value, fran: form.querySelector(`#${idFor(q.id)} [data-fran-for="${c.value}"]`)?.value || null, till: form.querySelector(`#${idFor(q.id)} [data-till-for="${c.value}"]`)?.value || null }));
      return l.length ? l : null;
    }
    case 'heltal': return alla[0]?.value ? Number(alla[0].value) : null;
    case 'diagnoser': {
      const l = [0, 1, 2].map(i => ({ kod: form.querySelector(`#${idFor(q.id)} [data-kod="${i}"]`)?.value.trim(), text: form.querySelector(`#${idFor(q.id)} [data-text="${i}"]`)?.value.trim() })).filter(x => x.kod);
      return l.length ? l : null;
    }
    default: return alla[0]?.value?.trim() ? alla[0].value : null;
  }
}

export async function visa(main, iid) {
  // Runda 16, r2: vyn ritas bara om användaren fortfarande är på det här intyget. Annars kunde en sen omritning efter
  // Signera skriva över vyn som användaren just gick till.
  const har = () => location.hash.split('?')[0] === `#/intygsapplikation/${encodeURIComponent(iid)}`;
  if (!har()) return;
  const d = await api(`/api/intygsapplikation/${encodeURIComponent(iid)}`);
  if (!har()) return;
  const av = !d.kan.andra;
  const fragor = d.kategorier.flatMap(k => k.fragor);
  // Svar som den inloggade inte får se visas som ifyllda, utan värde, och skickas inte med när utkastet sparas.
  const dolda = new Set(d.dolda ?? []);
  // Förslagen ur journalen står i de tomma frågorna med sin källa. De sparas först när du sparar eller signerar.
  const forslag = d.forslag?.svar ?? {};
  const visat = { ...forslag, ...d.svar };
  const kallaFor = (id) => (Object.hasOwn(d.svar, id) ? d.kallor[id] : forslag[id] !== undefined ? `${d.forslag.kallor[id]} (förslag, sparas när du sparar)` : null);
  const svarNu = (form) => Object.fromEntries(fragor.map(q => [q.id, lasVarde(form, q)]));
  main.innerHTML = `${vyRubrik(d.text, esc(d.simulerad))}
    <div class="ruta ruta-info"><p><strong>Intygsapplikation (simulerad, inte Webcert)</strong></p>
      <p class="liten">${esc(d.blankett)}, version ${esc(d.version)}. Patient: ${esc(d.patient.namn)}, ${esc(d.patient.personnummer)}. Vårdenhet: ${esc(d.vardenhet ?? '')}. Skapat av ${esc(d.skapadAv)} ${esc(tidpunkt(d.skapad))}. Mottagare: ${esc(d.mottagare)}.</p>
      <p class="liten">Status: <span class="tagg">${esc(d.statusText)}</span> ${esc(d.sandning.text)} ${esc(d.vemSignerar)}</p>
      ${d.relation ? `<p class="liten">${esc(d.relation.text)} av ett tidigare intyg.</p>` : ''}</div>
    ${d.giltighet ? `<div class="ruta ruta-varning" role="status"><p>${esc(d.giltighet)}</p>${d.kan.byt ? `<button type="button" class="knapp" data-atgard="byt">Byt till ${esc(d.byttMot.blankett)}</button>` : ''}${d.kan.fornya && d.byttMot ? `<button type="button" class="knapp" data-atgard="fornya">${d.byttMot.kod === d.typ ? `Förnya med version ${esc(d.byttMot.version)}` : `Skriv ${esc(d.byttMot.blankett)} i stället`}</button>` : ''}</div>` : ''}
    ${d.underlag?.length ? `<div class="ruta ruta-info"><p><strong>Underlag ur journalen</strong></p><ul class="enkel-lista">${d.underlag.map(u => `<li>${esc(u)}</li>`).join('')}</ul></div>` : ''}
    <div class="fmb-yta"></div>
    <form class="ia-form" novalidate>
      <p class="form-fel" role="alert" hidden></p>
      ${d.kategorier.map(k => `<section class="ia-kategori" aria-label="${esc(k.rubrik)}"><h2 class="ia-rubrik">${esc(k.rubrik)}</h2>
        ${k.fragor.map(q => `<div class="ia-fraga" data-fraga="${esc(q.id)}"${synlig(fragor, q, visat) || dolda.has(q.id) ? '' : ' hidden'}>${dolda.has(q.id) ? `<p class="falt"><strong>${esc(q.text)}</strong><span class="under-text">Ifyllt. Svaret visas för den som signerar intyget.</span></p>` : fragaHtml(q, visat[q.id], kallaFor(q.id), av)}</div>`).join('')}</section>`).join('')}
      ${d.varningar.length ? `<div class="ruta ruta-varning">${d.varningar.map(v => `<p>${esc(v.text)}</p>`).join('')}</div>` : ''}
      ${d.saknas.length ? `<p class="forslag-varfor">Innan intyget kan signeras behövs svar under: ${esc([...new Set(d.saknas.map(x => x.rubrik))].join(', '))}.</p>` : ''}
      ${d.kan.skicka ? `<div class="falt falt-kryss"><label><input type="checkbox" name="samrad" id="ia-samrad"> Patienten vill att intyget skickas till ${esc(d.mottagare)}</label></div>` : ''}
      ${d.kan.makulera ? `<details class="ia-makulera"><summary>Makulera intyget</summary><div class="falt"><label for="ia-orsak">Varför makuleras intyget?</label><textarea id="ia-orsak" name="orsak" rows="2" maxlength="500"></textarea>
        <p class="under-text">Makulera bara ett intyg med allvarliga fel, till exempel utfärdat på fel patient.</p></div><button type="button" class="knapp sekundar" data-atgard="makulera">Makulera</button></details>` : ''}
      <div class="knapprad">
        ${d.kan.andra ? '<button type="submit" class="knapp sekundar">Spara</button>' : ''}
        ${d.kan.signera ? '<button type="button" class="knapp" data-atgard="signera">Signera</button>' : ''}
        ${d.kan.klar ? '<button type="button" class="knapp" data-atgard="klar">Markera klart för signering</button>' : ''}
        ${d.kan.skicka ? '<button type="button" class="knapp" data-atgard="skicka">Skicka till mottagaren</button>' : ''}
        ${d.kan.skrivUt ? '<button type="button" class="knapp sekundar" data-utskrift>Skriv ut</button>' : ''}
        ${d.kan.fornya && !d.giltighet ? '<button type="button" class="knapp sekundar" data-atgard="fornya">Förnya</button>' : ''}
        ${d.kan.arbetsgivare ? '<button type="button" class="knapp sekundar" data-atgard="arbetsgivare">Skapa intyg till arbetsgivaren</button>' : ''}
        ${d.kan.radera ? '<button type="button" class="knapp sekundar" data-atgard="radera">Radera utkastet</button>' : ''}
      </div>
    </form>
    <section class="ia-utskrift" hidden aria-labelledby="ia-utskrift-rubrik"></section>
    <p><a href="#/patient/${encodeURIComponent(d.patientId)}/intyg">Tillbaka till journalen</a></p>`;
  const form = main.querySelector('.ia-form');
  // Följdfrågorna visas och döljs när svaren ändras.
  form.addEventListener('change', (e) => {
    // En grad som kryssas i utan datum får en period av systemet: från dagen efter den förra perioden, eller i dag, och
    // två veckor. Ett underlag som kryssas i får dagens datum. Läkaren ändrar datumen om de inte stämmer.
    const c = e.target;
    const q = fragor.find(x => `q-${x.id}` === c.name);
    if (c.type === 'checkbox' && c.checked && q?.typ === 'perioder') {
      const rot = main.querySelector(`#${idFor(q.id)}`);
      const fran = rot.querySelector(`[data-fran-for="${c.value}"]`);
      const till = rot.querySelector(`[data-till-for="${c.value}"]`);
      if (!fran.value) {
        const slut = [...rot.querySelectorAll('[data-till-for]')].map(x => x.value).filter(Boolean).sort().at(-1);
        fran.value = slut ? plusDagar(slut, 1) : idag();
      }
      if (!till.value) till.value = plusDagar(fran.value, 13);
    }
    if (c.type === 'checkbox' && c.checked && q?.typ === 'underlag') {
      const d = main.querySelector(`#${idFor(q.id)} [data-datum-for="${c.value}"]`);
      if (d && !d.value) d.value = idag();
    }
    const s = svarNu(form);
    for (const q of fragor) if (!dolda.has(q.id)) main.querySelector(`.ia-fraga[data-fraga="${q.id}"]`).hidden = !synlig(fragor, q, s);
  });
  // Runda 16, r2: beslutsstödet följer perioden, diagnosen och motiveringen som läkaren skriver, för den som signerar.
  if (d.typ === 'LISJP') {
    const fmb = () => fmbPanel.visa(main.querySelector('.fmb-yta'), iid, d.kan.andra ? form : null);
    fmb();
    if (d.kan.andra) form.addEventListener('change', (e) => { if (e.target.closest('.ia-fraga[data-fraga="32"], .ia-fraga[data-fraga="6"], .ia-fraga[data-fraga="37"]')) fmb(); });
  }
  // Bara synliga frågor skickas med värde. En dold fråga skickas tom, så att ett gammalt svar inte blir kvar.
  const data = () => { const s = svarNu(form); return { svar: Object.fromEntries(fragor.filter(q => !dolda.has(q.id)).map(q => [q.id, synlig(fragor, q, s) ? s[q.id] : null])) }; };
  const spara = (knapp) => medKnapp(knapp, () => api(`/api/intygsapplikation/${encodeURIComponent(iid)}`, { metod: 'POST', data: data() }), form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await spara(e.submitter ?? form.querySelector('button'))) { notis('Utkastet är sparat.'); visa(main, iid); }
  });
  // Runda 16, r2: huvudytan finns kvar mellan vyerna för samma inloggade, så lyssnaren från ett tidigare intyg tas bort
  // först. Annars gällde ett klick på Signera också det förra intyget (två anrop och fel som 409).
  if (main.iaKlick) main.removeEventListener('click', main.iaKlick);
  main.iaKlick = async (e) => {
    const b = e.target.closest('[data-atgard]');
    if (b) {
      const a = b.dataset.atgard;
      if (d.kan.andra && ['signera', 'klar'].includes(a) && !(await spara(null))) return;
      const body = a === 'skicka' ? { samrad: Boolean(form.querySelector('#ia-samrad')?.checked) } : a === 'makulera' ? { orsak: form.querySelector('#ia-orsak')?.value ?? '' } : {};
      const r = await medKnapp(b, () => api(`/api/intygsapplikation/${encodeURIComponent(iid)}/${a}`, { metod: 'POST', data: body }), form);
      if (!r) return;
      if (r.oppna) { notis(r.meddelande ?? 'Det nya utkastet är skapat.'); location.hash = r.oppna; return; }
      notis(`Intyget: ${r.statusText.toLowerCase()}. Journalen har fått statusen.`);
      visa(main, iid);
      return;
    }
    const u = e.target.closest('[data-utskrift], [data-skriv]');
    if (u) {
      const rutan = main.querySelector('.ia-utskrift');
      const dolj = rutan.querySelector('#ia-dolj')?.checked ? '1' : '0';
      if (u.matches('[data-skriv]')) { window.print(); return; }
      const p = await medKnapp(u, () => api(`/api/intygsapplikation/${encodeURIComponent(iid)}/utskrift?dolj_diagnos=${dolj}`));
      if (!p) return;
      rutan.hidden = false;
      rutan.innerHTML = `<h2 id="ia-utskrift-rubrik">${esc(p.rubrik)}</h2>
        <p class="liten">${p.namn ? `${esc(p.namn)}, ` : ''}${esc(p.personnummer)}. ${esc(p.vardenhet ?? '')}. Signerat ${esc(tidpunkt(p.signerad))} av ${esc(p.signeradAv)}.</p>
        ${p.kanDolja ? `<div class="falt falt-kryss"><label><input type="checkbox" id="ia-dolj"${p.diagnosDold ? ' checked' : ''} data-utskrift> Dölj diagnosen på utskriften (patientens val)</label></div>` : p.diagnosDold ? '<p class="under-text">Patienten har valt att inte förmedla diagnosen till arbetsgivaren.</p>' : ''}
        <dl class="ia-utskrift-svar">${p.rader.map(x => `<dt>${esc(x.fraga)}</dt><dd>${esc(x.svar)}</dd>`).join('')}</dl>
        <p class="under-text">${esc(p.simulerad)}</p>
        <button type="button" class="knapp" data-skriv>Skriv ut intyget</button>`;
      rutan.querySelector('h2').focus?.();
    }
  };
  main.addEventListener('click', main.iaKlick);
}
