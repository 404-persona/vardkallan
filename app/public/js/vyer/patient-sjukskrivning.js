// Runda 16, r2: patientens sjukskrivning. Systemet för ihop sjukintygen till sjukfall efter regeln i Rehabstöd, räknar
// dagar och grad över tiden, visar var patienten är i rehabiliteringskedjan och Socialstyrelsens rekommendation för
// diagnosen, och förlänger sjukskrivningen med ett klick: utkastet börjar dagen efter förra intyget och har det som inte
// har ändrats ifyllt.
import { esc, api, notis, felNotis, medKnapp, tidpunkt } from '../ui.js';

const grad = (g) => (g == null ? '' : `${g} %`);
const period = (p) => `${p.fran} till ${p.till}`;

// Graden över tiden som en stapel med ett fält per avsnitt, och samma sak i text för skärmläsare.
function tidslinje(s) {
  const totalt = s.tidslinje.reduce((n, t) => n + t.dagar, 0) || 1;
  return `<div class="sjk-tidslinje" aria-hidden="true">${s.tidslinje.map(t => `<span class="sjk-avsnitt sjk-grad-${esc(t.grad)}" style="flex-grow:${Math.max(1, Math.round((t.dagar / totalt) * 100))}" title="${esc(`${period(t)}, ${grad(t.grad)}`)}"></span>`).join('')}</div>
    <ul class="enkel-lista sjk-avsnittslista">${s.tidslinje.map(t => `<li>${esc(period(t))}: <strong>${esc(grad(t.grad))}</strong> <span class="under-text">${esc(t.dagar)} dagar</span></li>`).join('')}</ul>`;
}

function intygLista(s) {
  return `<ul class="enkel-lista">${s.intyg.map(i => `<li><strong>${esc(i.perioder.map(p => p.text).join('; '))}</strong>
    <span class="under-text">${esc(i.diagnos ? `${i.diagnos.kod} ${i.diagnos.text ?? ''}` : '')}${i.sysselsattning ? `. ${esc(i.sysselsattning)}` : ''}</span>
    <span class="under-text">${esc(i.vardenhet ?? '')}${i.lakare ? `, ${esc(i.lakare)}` : ''}, signerat ${esc(tidpunkt(i.signerad))}. ${esc(i.kalla)}${i.status === 'skickat' ? '. Skickat till Försäkringskassan (simulerat)' : ''}</span>
    ${i.motivering ? `<span class="under-text">Motivering till beslutsstödet: ${esc(i.motivering)}</span>` : ''}</li>`).join('')}</ul>`;
}

function sjukfallKort(s, rubrik) {
  const k = s.rehabkedjan;
  const f = s.fmb;
  return `<article class="ruta sjk-kort" aria-label="${esc(rubrik)}">
    <h3>${esc(s.diagnos ? `${s.diagnos.kod} ${s.diagnos.text ?? ''}` : 'Sjukfall')}</h3>
    <p>${s.pagaende ? `Dag <strong>${esc(s.uppskattadDag)}</strong> i sjukfallet. ` : ''}${esc(s.dagar)} dagar med sjukskrivning, ${esc(s.start)} till ${esc(s.slut)}, ${esc(s.antalIntyg)} intyg.</p>
    ${s.pagaende ? `<p>Grad i dag: <strong>${esc(grad(s.aktuellGrad))}</strong>. Intyget går ut ${esc(s.slut)}${s.kvarDagar != null ? `, om ${esc(s.kvarDagar)} ${s.kvarDagar === 1 ? 'dag' : 'dagar'}` : ''}.${s.sysselsattning ? ` Sysselsättning: ${esc(s.sysselsattning.toLowerCase())}.` : ''}</p>` : ''}
    ${k ? `<p class="${k.nara ? 'ruta sjk-varning' : 'sjk-kedja'}">${esc(k.text)}</p>` : ''}
    ${f ? `<p class="${f.over && !f.motiverat ? 'ruta sjk-varning' : 'under-text'}">${f.over
      ? `Sjukfallet är längre än Socialstyrelsens rekommendation för diagnosen (som längst ${esc(f.maxText)}).${f.motiverat ? ' Läkaren har motiverat varför i intyget.' : ' Ingen motivering finns i intygen.'}`
      : `Inom Socialstyrelsens rekommendation för diagnosen (som längst ${esc(f.maxText)}).`}</p>` : ''}
    <h4>Grad över tiden</h4>${tidslinje(s)}
    <details><summary>Intygen i sjukfallet (${esc(s.intyg.length)})</summary>${intygLista(s)}</details>
  </article>`;
}

export async function visa(el, ctx) {
  const pid = encodeURIComponent(ctx.id);
  const d = await api(`/api/patient/${pid}/sjukskrivning`);
  if (!ctx.aktuell()) return;
  const f = d.forlangning;
  const b = d.beslutsstod;
  el.innerHTML = `<div class="flikhuvud"><h2>Sjukskrivning</h2></div>
    <p class="ingress">Systemet för ihop sjukintygen till sjukfall och räknar dagar och grad. ${esc(d.regel)}</p>
    <p class="ruta ruta-info liten">${esc(d.simulerat)}</p>
    ${f ? `<section class="ruta sjk-forlang" aria-labelledby="sjk-forlang"><h3 id="sjk-forlang">Förläng sjukskrivningen</h3>
      <p>${esc(f.text)}</p>
      <p class="under-text">Från förra intyget följer med: ${esc(f.foljerMed.join(', '))}. Allt annat tar du ställning till på nytt i intyget.</p>
      <div class="knapprad"><button type="button" class="knapp" data-forlang>Förläng sjukskrivningen</button></div></section>` : ''}
    ${d.dolda?.kraverVal ? `<p class="ruta ruta-info liten">${esc(d.dolda.text)}</p>` : ''}
    <section aria-labelledby="sjk-pagaende"><h3 id="sjk-pagaende">Pågående sjukfall</h3>
      ${d.pagaende.length ? d.pagaende.map(s => sjukfallKort(s, 'Pågående sjukfall')).join('') : '<p class="tom">Inget pågående sjukfall.</p>'}</section>
    ${b ? `<details class="sjk-fmb"><summary>Socialstyrelsens beslutsstöd för ${esc(b.diagnosrubrik.toLowerCase())}</summary>
      <p>${b.rekommenderadMaxText ? `Rekommenderad sjukskrivning som längst: ${esc(b.rekommenderadMaxText)}.` : 'Ingen längsta tid anges.'}</p>
      <h4>Typiska funktionsnedsättningar</h4><p>${esc(b.funktionsnedsattning)}</p>
      <h4>Typiska aktivitetsbegränsningar</h4><p>${esc(b.aktivitetsbegransning)}</p>
      <p class="under-text">${esc(b.kalla)}</p></details>` : ''}
    <section aria-labelledby="sjk-tidigare"><h3 id="sjk-tidigare">Tidigare sjukfall</h3>
      ${d.tidigare.length ? `<details><summary>Visa tidigare sjukfall (${esc(d.tidigare.length)})</summary>${d.tidigare.map(s => sjukfallKort(s, 'Tidigare sjukfall')).join('')}</details>` : '<p class="tom">Inga tidigare sjukfall.</p>'}</section>`;
  el.querySelector('[data-forlang]')?.addEventListener('click', async (e) => {
    try {
      const r = await medKnapp(e.currentTarget, () => api(`/api/patient/${pid}/sjukskrivning/forlang`, { metod: 'POST', data: {} }));
      notis(`${r.text}${r.forifyllt?.length ? ` Förifyllt: ${r.forifyllt.join(', ')}.` : ''}`);
      location.hash = r.oppna;
    } catch (x) { felNotis(x); }
  });
}
