// Runda 16, r2: översikten över sjukskrivningar. Läkaren ser sina pågående sjukfall (där läkaren har signerat det
// nuvarande intyget, som i Rehabstöd), med det som behöver göras först överst: intyg som snart går ut, gränser i
// rehabiliteringskedjan och sjukfall som är längre än Socialstyrelsens rekommendation. Verksamhetschefen ser vårdenhetens
// sjukfall som antal, utan patientuppgifter.
import { esc, api, vyRubrik } from '../ui.js';
import { far } from '../app.js';

export const namn = 'sjukskrivningar';

const grad = (g) => (g == null ? '' : `${g} %`);

function rad(s) {
  const markeringar = [
    s.gaarUtSnart ? `<span class="tagg tagg-utkast">Går ut om ${esc(s.kvarDagar)} ${s.kvarDagar === 1 ? 'dag' : 'dagar'}</span>` : '',
    s.rehabkedjan?.nara ? `<span class="tagg tagg-utkast">Dag ${esc(s.rehabkedjan.nastaGrans)} om ${esc(s.rehabkedjan.kvar)} ${s.rehabkedjan.kvar === 1 ? 'dag' : 'dagar'}</span>` : '',
    s.fmb?.over ? `<span class="tagg tagg-utkast">Längre än rekommendationen${s.fmb.motiverat ? ', motiverat' : ''}</span>` : '',
    // Runda 16, rehabkoordinatorn: REKO-statusen, när rehabkoordinatorn har satt en.
    s.reko && s.reko.kod !== 'ingen' ? `<span class="tagg">REKO-status: ${esc(s.reko.text)}</span>` : '',
  ].filter(Boolean).join(' ');
  return `<li class="sjk-rad"><a href="#/patient/${encodeURIComponent(s.patientId)}/sjukskrivning"><strong>${esc(s.namn)}</strong></a> <span class="under-text">${esc(s.personnummer)}, ${esc(s.alder)} år</span>
    <span class="under-text">${esc(s.diagnos ? `${s.diagnos.kod} ${s.diagnos.text ?? ''}` : '')}</span>
    <span>Dag ${esc(s.uppskattadDag)} i sjukfallet, ${esc(s.dagar)} dagar med sjukskrivning. Grad ${esc(grad(s.aktuellGrad))}. Intyget går ut ${esc(s.slut)}.</span>
    ${markeringar ? `<span class="sjk-markeringar">${markeringar}</span>` : ''}</li>`;
}

const fordelning = (rubrik, rader) => `<section class="ruta" aria-label="${esc(rubrik)}"><h2>${esc(rubrik)}</h2>
  <div class="tabellrulle"><table class="tabell"><thead><tr><th scope="col">Grupp</th><th scope="col" class="tal">Antal</th></tr></thead>
  <tbody>${rader.length ? rader.map(r => `<tr><th scope="row">${esc(r.namn)}</th><td class="tal">${esc(r.text)}</td></tr>`).join('') : '<tr><td colspan="2">Inga.</td></tr>'}</tbody></table></div></section>`;

async function enhet(main) {
  const d = await api('/api/sjukskrivningar/enhet');
  main.innerHTML = `${vyRubrik('Sjukskrivningar på vårdenheten', esc(d.vardenhet ?? ''))}
    <p class="ingress">${esc(d.regel)}</p>
    <p class="ruta ruta-info">Pågående sjukfall i dag: <strong>${esc(d.totaltText)}</strong></p>
    <div class="sjk-fordelningar">
      ${fordelning('Sjukskrivningsgrad i dag', d.grad)}
      ${fordelning('Sjukskrivningens längd', d.langd)}
      ${fordelning('Diagnoskapitel', d.diagnoskapitel)}
      ${fordelning('Rehabiliteringskedjan', d.rehabkedjan)}
      ${fordelning('Socialstyrelsens beslutsstöd', d.overFmb)}
    </div>`;
}

export async function visa(main) {
  if (location.hash === '#/sjukskrivningar/enhet' || (!far('sjukfall_mina') && far('sjukfall_enhet'))) return enhet(main);
  const d = await api('/api/sjukskrivningar');
  const forst = d.sjukfall.filter(s => s.gaarUtSnart || s.rehabkedjan?.nara || (s.fmb?.over && !s.fmb.motiverat));
  const ovriga = d.sjukfall.filter(s => !forst.includes(s));
  main.innerHTML = `${vyRubrik('Mina sjukskrivningar', esc(d.vardenhet ?? ''))}
    <p class="ingress">${esc(d.regel)}</p>
    <p class="ruta ruta-info liten">${esc(d.simulerat)}</p>
    <section aria-labelledby="sjk-forst"><h2 id="sjk-forst">Behöver ses över (${esc(forst.length)})</h2>
      ${forst.length ? `<ul class="enkel-lista">${forst.map(rad).join('')}</ul>` : '<p class="tom">Inget intyg går ut inom en vecka, och ingen patient närmar sig en gräns i rehabiliteringskedjan. En patient hamnar här en vecka innan intyget går ut eller när en gräns närmar sig.</p>'}</section>
    <section aria-labelledby="sjk-ovriga"><h2 id="sjk-ovriga">Övriga pågående sjukfall (${esc(ovriga.length)})</h2>
      ${ovriga.length ? `<ul class="enkel-lista">${ovriga.map(rad).join('')}</ul>` : '<p class="tom">Inga fler pågående sjukfall.</p>'}</section>`;
}
