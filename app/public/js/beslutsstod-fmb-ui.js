// Runda 16, r2: Socialstyrelsens försäkringsmedicinska beslutsstöd i intygsapplikationen, medan läkaren skriver ett
// sjukintyg. Systemet hämtar rekommendationen för diagnosen, räknar den sammanlagda sjukskrivningen ur patientens
// tidigare intyg och varnar på vanlig svenska när den blir längre än rekommendationen. Motiveringen skrivs i intygets
// fråga 37, en gång: den följer med när intyget förnyas. Saknar utkastet en period föreslår systemet en från dagen efter
// förra intyget, som läkaren fyller i med ett klick. Inget sparas förrän läkaren sparar eller signerar intyget.
import { esc, api } from './ui.js';

const icf = (lista) => (lista?.length ? `<p class="under-text">ICF: ${esc(lista.map(k => `${k.kod} ${k.text ?? ''}`.trim()).join(', '))}</p>` : '');
const stycken = (t) => String(t ?? '').split('\n').map(r => (r.startsWith('• ') ? `<li>${esc(r.slice(2))}</li>` : `<p>${esc(r)}</p>`)).join('')
  .replace(/(<li>.*?<\/li>)+/gs, (m) => `<ul>${m}</ul>`);

export function html(b) {
  if (!b?.sjukintyg || b.begransad) return '';
  const f = b.beslutsstod;
  const huvud = '<h2 id="fmb-rubrik">Försäkringsmedicinskt beslutsstöd</h2>';
  const forslag = b.forslagPeriod ? `<div class="ruta ruta-info fmb-forslag"><p>Förslag till perioden: ${esc(b.forslagPeriod.text)}.</p>
    <button type="button" class="knapp sekundar" data-fyll-period>Fyll i förslaget</button></div>` : '';
  if (!f) return `<section class="ruta fmb-panel" aria-labelledby="fmb-rubrik">${huvud}${forslag}<p>${esc(b.utanDiagnos ?? b.utanRekommendation ?? '')}</p></section>`;
  return `<section class="ruta fmb-panel" aria-labelledby="fmb-rubrik">${huvud}
    <p><strong>${esc(f.diagnosrubrik)}.</strong> ${f.rekommenderadMaxText ? `Socialstyrelsen rekommenderar som längst ${esc(f.rekommenderadMaxText)}.` : 'Socialstyrelsen anger ingen längsta tid för diagnosen.'}</p>
    ${forslag}
    ${b.total ? `<p>Sammanlagd sjukskrivning i sjukfallet med det här intyget: <strong>${esc(b.total)} dagar</strong>${b.tidigareDagar ? `, varav ${esc(b.tidigareDagar)} i tidigare intyg` : ''}.</p>` : '<p class="under-text">Fyll i perioden, så räknar systemet den sammanlagda sjukskrivningen.</p>'}
    ${b.varning ? `<div class="ruta sjk-varning" role="status"><p>${esc(b.varning)}</p><p>${b.motiveringIIntyget ? 'Motiveringen står i fråga 37 och följer med när intyget förnyas.' : 'Skriv motiveringen i fråga 37 under Bedömning.'}</p></div>` : ''}
    ${(b.passerar ?? []).map(p => `<p class="sjk-kedja">${esc(p.text)}</p>`).join('')}
    ${b.dolda?.kraverVal ? `<p class="under-text">${esc(b.dolda.text)}</p>` : ''}
    <details><summary>Typiska funktionsnedsättningar</summary>${stycken(f.funktionsnedsattning)}${icf(f.funktionsnedsattningIcf)}</details>
    <details><summary>Typiska aktivitetsbegränsningar</summary>${stycken(f.aktivitetsbegransning)}${icf(f.aktivitetsbegransningIcf)}</details>
    <details><summary>Rekommenderad sjukskrivning i typfallen (${esc(f.typfall.length)})</summary><ul class="enkel-lista">${f.typfall.map(t => `<li><strong>${esc(t.tillstand)}</strong>
      <span class="under-text">${esc(t.rekommendation)}${t.tid ? ` Längst: ${esc(t.tid)}${t.grad ? `, ${esc(t.grad)}` : ''}.` : ''}</span></li>`).join('')}</ul></details>
    <p class="under-text">${esc(f.kalla)}</p>
  </section>`;
}

// Det som står i formuläret nu: perioderna i fråga 32, diagnosen i fråga 6 och om fråga 37 är ifylld.
export function varden(form) {
  if (!form) return {};
  const rot = form.querySelector('.ia-fraga[data-fraga="32"]');
  const perioder = rot ? [...rot.querySelectorAll('input[type="checkbox"]:checked')].map(c => ({
    kod: c.value, fran: rot.querySelector(`[data-fran-for="${c.value}"]`)?.value ?? '', till: rot.querySelector(`[data-till-for="${c.value}"]`)?.value ?? '',
  })) : null;
  const diagnos = form.querySelector('.ia-fraga[data-fraga="6"] [data-kod="0"]')?.value?.trim() ?? '';
  const mot = form.querySelector('.ia-fraga[data-fraga="37"] textarea');
  return { perioder, diagnos, motivering: mot ? (mot.value.trim() ? '1' : '0') : null };
}

// Fyller i det föreslagna perioden i fråga 32: graden kryssas i och datumen skrivs in. Inget sparas förrän läkaren
// sparar eller signerar.
export function fyllPeriod(form, p) {
  const rot = form?.querySelector('.ia-fraga[data-fraga="32"]');
  const c = rot?.querySelector(`input[type="checkbox"][value="${p.kod}"]`);
  if (!c) return false;
  c.checked = true;
  rot.querySelector(`[data-fran-for="${p.kod}"]`).value = p.fran;
  rot.querySelector(`[data-till-for="${p.kod}"]`).value = p.till;
  c.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

// Visar panelen i elementet. Frågan skickar det som står i formuläret, så att varningen följer det läkaren skriver.
export async function visa(el, iid, form = null) {
  if (!el) return;
  const v = varden(form);
  const q = new URLSearchParams();
  if (v.perioder) q.set('perioder', JSON.stringify(v.perioder));
  if (v.diagnos) q.set('diagnos', v.diagnos);
  if (v.motivering) q.set('motivering', v.motivering);
  const adress = location.hash;
  let b;
  try { b = await api(`/api/intygsapplikation/${encodeURIComponent(iid)}/beslutsstod${q.toString() ? `?${q}` : ''}`, { tyst: true, bakgrund: true }); } catch { el.innerHTML = ''; return; }
  if (location.hash !== adress || !el.isConnected) return;
  el.innerHTML = html(b);
  el.querySelector('[data-fyll-period]')?.addEventListener('click', () => { if (fyllPeriod(form, b.forslagPeriod)) visa(el, iid, form); });
}
