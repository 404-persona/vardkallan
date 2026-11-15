// Runda 16, r3: handledningen av studenter (handledning.js i servern). Studenten ser sin handledare, tiden och hur många
// anteckningar som väntar på kontrasignering. Handledaren ser sina studenter och studenterna på vårdenheten som saknar
// handledare, och registrerar en handledning med ett klick: tiden börjar i dag och slutet föreslår systemet. Servern
// prövar allt, också att studenten arbetar på samma vårdenhet och att yrket får handleda studenten.
import { esc, api, vyRubrik, notis, medKnapp, datum, tom } from '../ui.js';

export const namn = 'handledning';

export async function visa(main, _p, _q, ctx = {}) {
  const d = await api('/api/handledning');
  if (ctx.aktuell && !ctx.aktuell()) return;
  if (d.roll === 'student') {
    main.innerHTML = vyRubrik('Handledning', 'Du dokumenterar under handledning. Det du signerar går till din handledare för kontrasignering.') + `<div id="hl">
      ${d.handledning ? `<section class="ruta" aria-labelledby="hl-min">
        <h2 id="hl-min">Din handledare</h2>
        <p><strong>${esc(d.handledning.handledare.namn)}</strong>, ${esc(d.handledning.handledare.titel ?? '')}</p>
        <p>Handledningen gäller från ${esc(datum(d.handledning.fran))} till och med ${esc(datum(d.handledning.till))}.</p>
        <p>${d.vantarKontrasignering ? `${esc(String(d.vantarKontrasignering))} ${d.vantarKontrasignering === 1 ? 'anteckning väntar' : 'anteckningar väntar'} på handledarens kontrasignering.` : 'Inga anteckningar väntar på kontrasignering.'}</p>
      </section>` : `<p class="ruta ruta-obs" role="status">${esc(d.skal)}</p>`}
      <section aria-labelledby="hl-regler"><h2 id="hl-regler">Det här gäller för dig som student</h2>
        <ul class="lista-punkter">
          <li>Du läser och skriver bara för patienterna på handledarens vårdenhet, och bara medan handledningen pågår.</li>
          <li>Det du signerar står i ditt namn, märkt med din handledare, och går till handledaren för kontrasignering.</li>
          <li>Du ordinerar inte, ger inga läkemedel på egen hand och signerar inga intyg. Säg till handledaren.</li>
        </ul></section></div>`;
    return;
  }
  const rad = (h) => `<li class="hl-rad"><span><strong>${esc(h.student.namn)}</strong>, ${esc(h.student.titel ?? '')}<span class="under-text">Till och med ${esc(datum(h.till))}</span></span>
    <button type="button" class="knapp liten text" data-hl="avsluta" data-id="${esc(String(h.id))}" aria-label="Avsluta handledningen för ${esc(h.student.namn)}">Avsluta</button></li>`;
  const utan = (s) => `<li class="hl-rad"><span><strong>${esc(s.namn)}</strong>, ${esc(s.titel ?? '')}<span class="under-text">Har ingen handledare i dag</span></span>
    <button type="button" class="knapp liten" data-hl="registrera" data-id="${esc(s.id)}" aria-label="Handled till ${esc(datum(d.forslagTill))}: ${esc(s.namn)}">Handled till ${esc(datum(d.forslagTill))}</button></li>`;
  main.innerHTML = vyRubrik('Handledning', 'Studenterna som du handleder. Det de signerar hamnar i din inkorg under Att kontrasignera.') + `<div id="hl">
    <section aria-labelledby="hl-mina"><h2 id="hl-mina">Mina studenter</h2>
      ${d.studenter.length ? `<ul class="hl-lista">${d.studenter.map(rad).join('')}</ul>` : tom('Du handleder ingen student just nu.')}</section>
    ${d.utanHandledare.length ? `<section aria-labelledby="hl-utan"><h2 id="hl-utan">Studenter på vårdenheten utan handledare</h2>
      <p class="hjalp">Systemet föreslår åtta veckor, som en verksamhetsförlagd utbildning. Studenten får åtkomst till journalen på din vårdenhet först när handledningen är registrerad.</p>
      <ul class="hl-lista">${d.utanHandledare.map(utan).join('')}</ul></section>` : ''}</div>`;
  main.querySelector('#hl').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-hl]');
    if (!b) return;
    try {
      await medKnapp(b, () => (b.dataset.hl === 'registrera'
        ? api('/api/handledning', { metod: 'POST', data: { studentId: b.dataset.id } })
        : api(`/api/handledning/${encodeURIComponent(b.dataset.id)}/avsluta`, { metod: 'POST', data: {} })));
      notis(b.dataset.hl === 'registrera' ? 'Handledningen är registrerad.' : 'Handledningen är avslutad.');
      visa(main, _p, _q, ctx);
    } catch { /* medKnapp har visat felet */ }
  });
}
