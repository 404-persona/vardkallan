// Runda 14, r3: patientens intyg genom intygsapplikationen (Sussa 2.2.1.9). Läkaren väljer bara vilket intyg som ska
// skrivas. Systemet föreslår det som passar patienten, visar bara de intyg som får skrivas, fyller i patienten,
// läkaren, vårdenheten och diagnosen och öppnar utkastet i intygsapplikationen. Statusen kommer av sig själv.
// Runda 16, r1: alla intyg i Webcert med blankettens nummer, och ett ersatt eller signerat intyg förnyas med ett klick
// till den version eller blankett som gäller nu. Den som skapar men inte signerar får veta vem som signerar.
import { esc, api, notis, felNotis, medKnapp, tidpunkt } from '../ui.js';

const STATUSKLASS = { utkast: 'tagg-obs', klart_for_signering: 'tagg-obs', signerat: '', skickat: '', makulerat: 'tagg-varning', raderat: '', fel: 'tagg-varning' };
const SANDNING = { utskrift: 'Skrivs ut och lämnas av patienten.', vid_signering: 'Skickas när det signeras.', samrad: 'Skickas i samråd med patienten.' };

export async function visa(el, ctx) {
  const pid = encodeURIComponent(ctx.id);
  const d = await api(`/api/patient/${pid}/intyg`);
  if (!ctx.aktuell()) return;
  const mojliga = d.typer.filter(t => t.mojlig);
  const ejMojliga = d.typer.filter(t => !t.mojlig);
  const forslag = d.forslag && mojliga.some(t => t.kod === d.forslag.kod) ? d.forslag : null;
  const valt = mojliga.find(t => t.kod === forslag?.kod) ?? mojliga[0];
  el.innerHTML = `<div class="flikhuvud"><h2>Intyg</h2></div>
    <p class="ingress">Intyg skrivs och signeras i intygsapplikationen, som öppnas med patienten, dig och vårdenheten ifyllda. Statusen visas här av sig själv.</p>
    <p class="ruta ruta-info liten">${esc(d.simulerat)}</p>
    ${d.kanSkriva ? `<section aria-labelledby="in-nytt"><h3 id="in-nytt">Skriv ett intyg</h3>
      ${mojliga.length ? `<form class="intyg-nytt">
        <div class="falt"><label for="in-typ">Intyg</label>
          <select id="in-typ" name="typ">${mojliga.map(t => `<option value="${esc(t.kod)}"${forslag?.kod === t.kod ? ' selected' : ''}>${esc(t.text)} (${esc(t.blankett)})</option>`).join('')}</select>
          ${forslag?.varfor ? `<p class="forslag-varfor">${esc(forslag.varfor)}</p>` : ''}
          <p class="under-text" data-in-info>${esc(valt ? `${SANDNING[valt.sandning] ?? ''}${valt.kanSignera ? '' : ' Du skapar och fyller i utkastet, och den som får signera intyget signerar.'}` : '')}</p></div>
        <div class="knapprad"><button type="submit" class="knapp">Skriv intyget</button></div>
      </form>` : '<p class="tom">Inga intyg kan skrivas för patienten.</p>'}
      ${ejMojliga.length ? `<details><summary>Intyg som inte kan skrivas för patienten (${ejMojliga.length})</summary><ul class="enkel-lista">${ejMojliga.map(t => `<li><strong>${esc(t.text)} (${esc(t.blankett)})</strong><span class="under-text">${esc(t.skal)}</span></li>`).join('')}</ul></details>` : ''}
    </section>` : ''}
    ${d.dolda?.kraverVal ? `<p class="ruta ruta-info liten">${esc(d.dolda.text)}</p>` : ''}
    <section aria-labelledby="in-lista"><h3 id="in-lista">Patientens intyg</h3>
      ${d.intyg.length ? `<ul class="enkel-lista intyg-lista">${d.intyg.map(i => `<li><strong>${esc(i.text)}</strong>${i.blankett ? ` <span class="under-text">${esc(i.blankett)}, version ${esc(i.version)}</span>` : ''} <span class="tagg ${STATUSKLASS[i.status] ?? ''}">${esc(i.statusText)}</span>
        <span class="under-text">${esc(i.vardenhet?.namn ?? '')}${i.skapadAv ? `, ${esc(i.skapadAv)}` : ''}, skapat ${esc(tidpunkt(i.skapad))}${i.signerad ? `, signerat ${esc(tidpunkt(i.signerad))}` : ''}${i.mottagare ? `. Mottagare: ${esc(i.mottagare)}` : ''}${i.relation ? `. ${esc(i.relation.text)} av ett tidigare intyg` : ''}</span>
        ${i.ersatt ? `<span class="under-text">${esc(i.ersatt)}</span>` : ''}
        ${i.handelser.length ? `<span class="under-text">Händelser: ${esc(i.handelser.map(h => h.text).join(', '))}</span>` : ''}
        ${i.kanOppnas ? `<button type="button" class="knapp liten sekundar" data-oppna="${esc(i.id)}">Öppna i intygsapplikationen</button>` : ''}
        ${i.kanFornyas && i.fornyasMed ? `<button type="button" class="knapp liten${i.ersatt ? '' : ' sekundar'}" data-fornya="${esc(i.id)}">${esc(i.fornyasMed.text)}</button>` : ''}</li>`).join('')}</ul>` : '<p class="tom">Inga intyg.</p>'}
      <button type="button" class="knapp liten sekundar" data-avstam>Stäm av med intygsapplikationen</button>
      <p class="under-text">${esc(d.kontrakt)}</p>
    </section>`;
  const form = el.querySelector('.intyg-nytt');
  form?.typ.addEventListener('change', () => {
    const t = mojliga.find(x => x.kod === form.typ.value);
    el.querySelector('[data-in-info]').textContent = t ? `${SANDNING[t.sandning] ?? ''}${t.kanSignera ? '' : ' Du skapar och fyller i utkastet, och den som får signera intyget signerar.'}` : '';
  });
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const knapp = e.submitter ?? e.target.querySelector('button');
    try {
      const r = await medKnapp(knapp, () => api(`/api/patient/${pid}/intyg`, { metod: 'POST', data: { typ: e.target.typ.value } }));
      if (!r) return;
      notis(r.forifyllt?.length ? `${r.text} Förifyllt: ${r.forifyllt.join(', ')}.` : r.text);
      location.hash = r.oppna;
    } catch (x) { felNotis(x); }
  });
  el.addEventListener('click', async (e) => {
    const o = e.target.closest('[data-oppna]');
    const a = e.target.closest('[data-avstam]');
    const f = e.target.closest('[data-fornya]');
    try {
      if (o) { const r = await medKnapp(o, () => api(`/api/patient/${pid}/intyg/${encodeURIComponent(o.dataset.oppna)}/oppna`)); if (r) location.hash = r.oppna; }
      if (f) { const r = await medKnapp(f, () => api(`/api/patient/${pid}/intyg/${encodeURIComponent(f.dataset.fornya)}/fornya`, { metod: 'POST', data: {} })); if (r) { notis(r.meddelande); location.hash = r.oppna; } }
      if (a) { const r = await medKnapp(a, () => api(`/api/patient/${pid}/intyg/avstam`, { metod: 'POST', data: {} })); if (r) { notis(r.text); ctx.ladda(); } }
    } catch (x) { felNotis(x); }
  });
}
