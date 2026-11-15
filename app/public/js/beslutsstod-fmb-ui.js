// Runda 16, r2: Socialstyrelsens försäkringsmedicinska beslutsstöd i intygsapplikationen, medan läkaren skriver ett
// sjukintyg. Systemet hämtar rekommendationen för diagnosen, räknar den sammanlagda sjukskrivningen ur patientens
// tidigare intyg och varnar på vanlig svenska när den blir längre än rekommendationen. Motiveringen skrivs en gång och
// följer med i intyget och i förlängningar.
import { esc, api, notis, felNotis, medKnapp } from './ui.js';

const icf = (lista) => (lista?.length ? `<p class="under-text">ICF: ${esc(lista.map(k => `${k.kod} ${k.text ?? ''}`.trim()).join(', '))}</p>` : '');
const stycken = (t) => String(t ?? '').split('\n').map(r => (r.startsWith('• ') ? `<li>${esc(r.slice(2))}</li>` : `<p>${esc(r)}</p>`)).join('')
  .replace(/(<li>.*?<\/li>)+/gs, (m) => `<ul>${m}</ul>`);

export function html(b) {
  if (!b?.sjukintyg) return '';
  const f = b.beslutsstod;
  const huvud = '<h2 id="fmb-rubrik">Försäkringsmedicinskt beslutsstöd</h2>';
  if (!f) return `<section class="ruta fmb-panel" aria-labelledby="fmb-rubrik">${huvud}<p>${esc(b.utanDiagnos ?? b.utanRekommendation ?? '')}</p></section>`;
  const motivering = b.motiveringIIntyget ?? '';
  return `<section class="ruta fmb-panel" aria-labelledby="fmb-rubrik">${huvud}
    <p><strong>${esc(f.diagnosrubrik)}.</strong> ${f.rekommenderadMaxText ? `Socialstyrelsen rekommenderar som längst ${esc(f.rekommenderadMaxText)}.` : 'Socialstyrelsen anger ingen längsta tid för diagnosen.'}</p>
    ${b.total ? `<p>Sammanlagd sjukskrivning i sjukfallet med det här intyget: <strong>${esc(b.total)} dagar</strong>${b.tidigareDagar ? `, varav ${esc(b.tidigareDagar)} i tidigare intyg` : ''}.</p>` : '<p class="under-text">Fyll i perioden, så räknar systemet den sammanlagda sjukskrivningen.</p>'}
    ${b.varning ? `<div class="ruta sjk-varning" role="status"><p>${esc(b.varning)}</p></div>` : ''}
    ${(b.passerar ?? []).map(p => `<p class="sjk-kedja">${esc(p.text)}</p>`).join('')}
    ${b.dolda?.kraverVal ? `<p class="under-text">${esc(b.dolda.text)}</p>` : ''}
    ${b.over || motivering ? `<form class="fmb-motivering">
      <div class="falt"><label for="fmb-motivering">Varför behöver patienten en längre sjukskrivning än rekommendationen?</label>
        <textarea id="fmb-motivering" name="motivering" rows="3" maxlength="2000"${b.kanMotivera ? '' : ' disabled'}>${esc(motivering)}</textarea>
        <p class="under-text">Motiveringen följer med i intyget (fråga 37) och i förlängningar, så att du skriver den en gång.</p></div>
      ${b.kanMotivera ? '<div class="knapprad"><button type="submit" class="knapp sekundar">Spara motiveringen</button></div>' : ''}
    </form>` : ''}
    <details><summary>Typiska funktionsnedsättningar</summary>${stycken(f.funktionsnedsattning)}${icf(f.funktionsnedsattningIcf)}</details>
    <details><summary>Typiska aktivitetsbegränsningar</summary>${stycken(f.aktivitetsbegransning)}${icf(f.aktivitetsbegransningIcf)}</details>
    <details><summary>Rekommenderad sjukskrivning i typfallen (${esc(f.typfall.length)})</summary><ul class="enkel-lista">${f.typfall.map(t => `<li><strong>${esc(t.tillstand)}</strong>
      <span class="under-text">${esc(t.rekommendation)}${t.tid ? ` Längst: ${esc(t.tid)}${t.grad ? `, ${esc(t.grad)}` : ''}.` : ''}</span></li>`).join('')}</ul></details>
    <p class="under-text">${esc(f.kalla)}</p>
  </section>`;
}

// Visar panelen i elementet och kopplar motiveringen. Frågan skickar de värden som står i formuläret, så att varningen
// följer det läkaren skriver innan något är sparat.
export async function visa(el, iid, varden = {}) {
  if (!el) return;
  const q = new URLSearchParams(Object.entries(varden).filter(([, v]) => v)).toString();
  let b;
  try { b = await api(`/api/intygsapplikation/${encodeURIComponent(iid)}/beslutsstod${q ? `?${q}` : ''}`, { tyst: true, bakgrund: true }); } catch { el.innerHTML = ''; return; }
  el.innerHTML = html(b);
  el.querySelector('.fmb-motivering')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await medKnapp(e.submitter ?? e.target.querySelector('button'), () => api(`/api/intygsapplikation/${encodeURIComponent(iid)}/beslutsstod/motivering`, { metod: 'POST', data: { motivering: e.target.motivering.value } }));
      notis(r.text);
    } catch (x) { felNotis(x); }
  });
}
