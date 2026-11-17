// Runda 15, r2: köerna till samtyckestjänsten och engagemangsindex för systemförvaltaren (Sussa 2.2.1.4 och 2.2.1.10).
// Systemet skickar själv. Systemförvaltaren ser läget, vad som inte har kommit fram och varför, kan skicka det som väntar
// direkt och stämma av hela engagemangsindex. Vyn har inga patientuppgifter.
import { esc, api, tidpunkt, notis, medKnapp, vyRubrik, ikon } from '../ui.js';

export const namn = 'nationella-tjanster';

const status = (fel, text) => `<p class="ruta ${fel ? 'ruta-larm' : 'ruta-ok'} liten" data-status>${fel ? ikon.varning : ikon.bock}<span>${esc(text)}</span></p>`;

function samtyckestjansten(s) {
  return `<section class="lm-sektion" aria-labelledby="nt-samtycke-r" id="nt-samtycke">
    <h2 id="nt-samtycke-r">Samtyckestjänsten</h2>
    ${status(s.ejFramme, s.text)}
    <dl class="faktarad">
      <div><dt>Väntar på att skickas</dt><dd data-vantar>${s.vantar}</dd></div>
      <div><dt>Har inte kommit fram</dt><dd>${s.ejFramme}</dd></div>
      <div><dt>Skickade senaste dygnet</dt><dd>${s.skickadeSenasteDygnet}</dd></div>
    </dl>
    ${s.rader.length ? `<div class="tabellrulle"><table class="tabell"><caption class="sr">Ändringar som inte har kommit fram</caption><thead><tr><th scope="col">Ändring</th><th scope="col">Köad</th><th scope="col">Försök</th><th scope="col">Nästa försök</th><th scope="col">Senaste fel</th></tr></thead>
      <tbody>${s.rader.map(r => `<tr><td>${esc(r.handling)}</td><td>${esc(tidpunkt(r.koad))}</td><td class="tal">${r.forsok}</td><td>${r.nastaForsok ? esc(tidpunkt(r.nastaForsok)) : ''}</td><td>${esc(r.fel ?? '')}</td></tr>`).join('')}</tbody></table></div>` : ''}
  </section>`;
}

function engagemangsindex(e) {
  return `<section class="lm-sektion" aria-labelledby="nt-ei-r" id="nt-ei">
    <h2 id="nt-ei-r">Engagemangsindex</h2>
    ${status(e.ejFramme, e.text)}
    <dl class="faktarad">
      <div><dt>Patienter med ändringar som väntar</dt><dd data-ei-vantar>${e.vantar}</dd></div>
      <div><dt>Nästa omgång</dt><dd>${e.nastaSandning ? esc(tidpunkt(e.nastaSandning)) : 'Ingen väntar'}</dd></div>
      <div><dt>Senast skickat</dt><dd>${e.senastSkickad ? esc(tidpunkt(e.senastSkickad)) : 'Inget än'}</dd></div>
      <div><dt>Poster per anrop</dt><dd>Högst ${e.installningar.posterPerAnrop}</dd></div>
    </dl>
    ${e.omgangar.length ? `<div class="tabellrulle"><table class="tabell"><caption class="sr">De senaste omgångarna</caption><thead><tr><th scope="col">Omgång</th><th scope="col">Anrop</th><th scope="col">Poster</th><th scope="col">Resultat</th></tr></thead>
      <tbody>${e.omgangar.map(o => `<tr><td>${esc(tidpunkt(o.tid))}</td><td class="tal">${o.anrop}</td><td class="tal">${o.poster}</td><td>${o.resultat === 'ok' ? 'Mottagen' : esc(o.fel ?? 'Fel')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="tom liten">Inga omgångar har skickats än.</p>'}
    <p class="liten dampad">Systemet anmäler av sig självt att det finns vårdkontakter, journalanteckningar, diagnoser, uppmärksamhetsinformation och vaccinationer om en patient, så att andra vårdgivare med rätt behörighet hittar dem. Skyddade personuppgifter, spärrade uppgifter och reservnummer anmäls aldrig. Hela indexet stäms av mot journalen en gång om dygnet.</p>
  </section>`;
}

// HOSP: personalens legitimation och förskrivningsrätt ur Socialstyrelsens register. Systemet hämtar själv; här ser
// systemförvaltaren vem som saknar giltig legitimation, vilka uppgifter som är gamla för att tjänsten inte svarar, och
// kan hämta om dem. Bara systemförvaltaren och personen själv ser uppgifterna.
const HOSP_STATUS = { ok: 'Giltig', saknas: 'Saknas', aterkallad: 'Återkallad', okand: 'Kunde inte hämtas', ej_i_hosp: 'Finns inte i HOSP' };
function hospSektion(h) {
  const problem = h.avvikelser > 0 || h.personal.some(p => p.status === 'okand' || (p.gammal && p.fel));
  return `<section class="lm-sektion" aria-labelledby="nt-hosp-r" id="nt-hosp">
    <h2 id="nt-hosp-r">Legitimation och förskrivningsrätt (HOSP)</h2>
    ${status(problem, h.text)}
    <p class="liten dampad">${esc(h.regel)}</p>
    <div class="tabellrulle"><table class="tabell"><caption class="sr">Personal med en roll som kräver legitimation</caption>
      <thead><tr><th scope="col">Person</th><th scope="col">Roll</th><th scope="col">Legitimation</th><th scope="col">Hämtad</th><th scope="col"><span class="sr">Åtgärd</span></th></tr></thead>
      <tbody>${h.personal.map(p => `<tr data-hosp-rad="${esc(p.id)}"><td>${esc(p.namn)}<span class="under-text">${esc(p.enhet ?? '')}</span></td><td>${esc(p.yrke)}</td>
        <td><strong>${esc(HOSP_STATUS[p.status] ?? p.status)}</strong><span class="under-text">${esc(p.text)}${p.gammal && p.fel ? ` De senast hämtade uppgifterna gäller. ${esc(p.fel)}` : ''}</span></td>
        <td>${p.hamtad ? esc(tidpunkt(p.hamtad)) : 'Inte än'}</td>
        <td>${p.status === 'ej_i_hosp' ? '' : `<button type="button" class="knapp liten sekundar" data-hosp-hamta="${esc(p.id)}" aria-label="Hämta om uppgifterna för ${esc(p.namn)}">Hämta om</button>`}</td></tr>`).join('')}</tbody></table></div>
    <div class="knapprad"><button type="button" class="knapp sekundar" data-hosp-alla>Hämta om alla</button></div>
    <p class="demoregel">${esc(h.simulerat)}</p>
  </section>`;
}
async function visaHosp(main) {
  const plats = main.querySelector('#nt-hosp-plats');
  if (!plats) return;
  const rita = (h) => {
    plats.innerHTML = hospSektion(h);
    plats.querySelector('[data-hosp-alla]').addEventListener('click', async (e) => {
      try { const r = await medKnapp(e.currentTarget, () => api('/api/hosp/hamta', { metod: 'POST', data: {} })); rita(r); notis('Uppgifterna är hämtade om.'); } catch { /* felet visas som notis */ }
    });
    for (const b of plats.querySelectorAll('[data-hosp-hamta]')) {
      b.addEventListener('click', async (e) => {
        try { const r = await medKnapp(e.currentTarget, () => api('/api/hosp/hamta', { metod: 'POST', data: { personalId: b.dataset.hospHamta } })); rita(r); notis('Uppgifterna är hämtade om.'); } catch { /* felet visas som notis */ }
      });
    }
  };
  try { rita(await api('/api/hosp')); } catch { plats.innerHTML = ''; }
}

export async function visa(main) {
  main.innerHTML = vyRubrik('Nationella tjänster', 'Systemet skickar själv till samtyckestjänsten och engagemangsindex, och försöker igen när en tjänst inte svarar. Här ser du läget och det som inte har kommit fram.') + '<div id="nt"><p class="tom">Hämtar.</p></div><div id="nt-hosp-plats"></div>';
  // HOSP: sektionen för legitimationen hämtas för sig.
  visaHosp(main);
  const rita = (d) => {
    const el = main.querySelector('#nt');
    if (!el) return;
    el.innerHTML = `${samtyckestjansten(d.samtyckestjansten)}${engagemangsindex(d.engagemangsindex)}
      <div class="knapprad"><button type="button" class="knapp" data-nt-skicka>Skicka det som väntar nu</button><button type="button" class="knapp sekundar" data-nt-avstam>Stäm av hela engagemangsindex</button></div>
      <section class="lm-sektion" aria-labelledby="nt-demo-r"><h2 id="nt-demo-r">Demo</h2>
        <div class="kryssfalt"><input type="checkbox" id="nt-avbrott" data-nt-avbrott${d.simuleratAvbrott ? ' checked' : ''}><label for="nt-avbrott">Simulera att de nationella tjänsterna inte svarar</label></div>
        <p class="demoregel">${esc(d.simulerat)} Med avbrottet påslaget gäller samtyckena i Vårdkällan, uppgifter från andra vårdgivare visas inte, och ändringarna väntar i köerna tills avbrottet slås av.</p>
      </section>`;
    el.querySelector('[data-nt-skicka]').addEventListener('click', async (e) => {
      try { const r = await medKnapp(e.currentTarget, () => api('/api/nationella-tjanster/skicka', { metod: 'POST', data: {} })); rita(r); notis(r.text); } catch { /* felet visas som notis */ }
    });
    el.querySelector('[data-nt-avstam]').addEventListener('click', async (e) => {
      try { const r = await medKnapp(e.currentTarget, () => api('/api/nationella-tjanster/avstam', { metod: 'POST', data: {} })); rita(r); notis(r.text); } catch { /* felet visas som notis */ }
    });
    el.querySelector('[data-nt-avbrott]').addEventListener('change', async (e) => {
      try { const r = await api('/api/nationella-tjanster/avbrott', { metod: 'POST', data: { simulera: e.currentTarget.checked } }); rita(r); notis(r.simuleratAvbrott ? 'Avbrottet simuleras.' : 'Tjänsterna svarar igen.'); } catch { /* felet visas som notis */ }
    });
  };
  rita(await api('/api/nationella-tjanster'));
}
