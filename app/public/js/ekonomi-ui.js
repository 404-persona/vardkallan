// Kostnader i vårdprocessen (runda 7, r3, Sussa 7.1.2.1): en ruta i patientens översikt med kostnaden hittills för det
// pågående vårdtillfället eller dagens vårdkontakt enligt prislistan, DRG enligt demogrupperingen och patientens
// högkostnadsskydd. Läkare och sjuksköterskor ser hela rutan. Vårdadministratören ser bara patientens avgifter och
// högkostnadsskydd. Läkaren registrerar här att patienten är medicinskt färdigbehandlad.
import { esc, api, datum, notis, felNotis, dialog, idag } from './ui.js';
import { far } from './app.js';
import { kr } from './tidbok-ui.js';

// Hämtas för sig. Vid avbrott finns kostnaderna inte i läskopian, och då visas rutan inte.
export async function hamta(id) {
  if (!far('las_kostnader')) return null;
  try { return await api(`/api/patient/${encodeURIComponent(id)}/kostnader`); } catch (e) { if (e?.status === 401) throw e; return null; }
}

const lista = (rubrik, rader) => (rader?.length ? `<details class="ek-lista"><summary>${esc(rubrik)} (${rader.length})</summary><ul class="enkel-lista">${rader.map(r => `<li>${esc(r.text)}: ${esc(String(r.antal))} st, ${esc(kr(r.belopp))}</li>`).join('')}</ul></details>` : '');

function fardigHtml(f) {
  if (!f) return '';
  if (f.datum) return `<p class="ek-fardig"><strong>Medicinskt färdigbehandlad ${esc(datum(f.datum))}.</strong>${f.kalla === 'spu' ? ' Från underrättelsen i den samordnade planeringen.' : f.av ? ` Registrerat av ${esc(f.av.namn)}.` : ''}${f.kommunText ? ` ${esc(f.kommunText)}` : ''}</p>`;
  if (f.kanRegistreras) return '<div class="knapprad tat" data-skriv><button type="button" class="knapp liten sekundar" data-ek="fardigbehandlad">Medicinskt färdigbehandlad</button></div>';
  return f.varforInte ? `<p class="dampad liten">${esc(f.varforInte)}</p>` : '';
}

export function sektionHtml(k) {
  if (!k) return '';
  const a = k.aktuell;
  const hog = `<p class="ek-hog">${esc(k.hogkostnadsskydd.text)}</p>`;
  // Runda 12, r3: rabatten med ordinarie avgift och skäl, och summan av rabatterna.
  const rabatt = (x) => (x.rabatt ? ` <span class="ek-rabatt" data-rabatt>Ordinarie ${esc(kr(x.rabatt.ordinarie))}, rabatt ${esc(kr(x.rabatt.rabatt))}. ${esc(x.rabatt.skal)}</span>` : '');
  const avgifter = a?.patientavgifter?.length ? `<ul class="enkel-lista ek-avgifter">${a.patientavgifter.map(x => `<li>Patientavgift ${esc(kr(x.belopp))}, ${esc(datum(x.datum))}<span class="under-text">${esc(x.statusText ?? '')}${rabatt(x)}</span></li>`).join('')}</ul>${a.rabatter ? `<p class="liten" data-rabatter>Rabatter på patientavgifterna: ${esc(kr(a.rabatter))}.</p>` : ''}` : '';
  let innehall = '';
  if (!a) innehall = '<p class="tom liten">Patienten har ingen pågående vårdkontakt eller vårdtillfälle som du kan se kostnaderna för.</p>';
  else if (a.kategorier) {
    const vad = a.typ === 'vardtillfalle' ? `Vårdtillfället sedan ${datum(a.sedan)}` : `Vårdkontakten ${datum(a.sedan)}`;
    innehall = `<p><strong>${esc(vad)}: ${esc(kr(a.totalt))}</strong> ${a.pagar ? 'hittills' : ''}</p>
      <div class="tabellrulle"><table class="tabell siffertabell ek-kostnad"><thead><tr><th scope="col">Kostnad</th><th scope="col" class="tal">Antal</th><th scope="col" class="tal">Belopp</th></tr></thead>
        <tbody>${a.kategorier.map(x => `<tr><td>${esc(x.text)}</td><td class="tal">${x.antal}</td><td class="tal">${esc(kr(x.belopp))}</td></tr>`).join('')}</tbody></table></div>
      ${lista('Läkemedel', a.lakemedel)}${lista('Material', a.material)}${lista('Åtgärder', a.atgarder)}${lista('Hjälpmedel', a.hjalpmedel)}${lista('Prover och undersökningar', a.undersokningar)}
      ${a.drg ? `<p class="ek-drg">Enligt DRG, demogrupp ${esc(a.drg.text.replace(' (demogrupp)', '').toLowerCase())}: <strong>${esc(kr(a.drg.belopp))}</strong>${a.drg.preliminar ? ', preliminärt tills patienten är utskriven' : ''}.<span class="under-text">${esc(a.drg.forklaring)}</span></p>` : ''}
      ${a.jamforelse ? `<p class="ek-jamforelse" data-jamforelse>${esc(a.jamforelse.text)}</p>` : ''}
      ${a.kallor?.length ? `<details class="ek-kallor"><summary>Var beloppen kommer ifrån</summary><ul class="enkel-lista">${a.kallor.map(x => `<li>${esc(x.text)}</li>`).join('')}</ul></details>` : ''}
      ${fardigHtml(a.fardigbehandlad)}`;
  } else innehall = `<p>${a.typ === 'vardtillfalle' ? 'Vårdtillfället' : 'Vårdkontakten'} ${esc(datum(a.sedan))}.</p>`;
  // Läkare och sjuksköterskor lämnar ut hjälpmedel härifrån. Posten och en eventuell hjälpmedelsavgift skapar systemet.
  const hjalpmedel = far('hjalpmedel') ? '<div class="knapprad tat" data-skriv><button type="button" class="knapp liten sekundar" data-ek="hjalpmedel">Lämna ut hjälpmedel</button></div>' : '';
  // Runda 18, r3 (Sussa B1): hjälpmedel som väntar på uthämtning eller betalning på vårdenheten.
  const attHamta = k.hjalpmedelAttHamta?.length ? `<div class="ek-att-hamta" data-att-hamta><h3>Hjälpmedel att hämta ut eller betala</h3><ul class="enkel-lista">${k.hjalpmedelAttHamta.map(h => `<li data-hm="${h.id}"><span><strong>${esc(h.text)}</strong>${h.avgift ? `, avgift ${esc(kr(h.avgift))}` : ''}<span class="under-text">${esc(h.statusText)}</span></span>
      <span class="knapprad tat" data-skriv>${h.kanBetala ? `<button type="button" class="knapp liten" data-uthamta="${h.id}" data-satt="kort">${h.status === 'forskriven' ? 'Hämtas ut, betalt med kort' : 'Betalt med kort'}</button><button type="button" class="knapp liten sekundar" data-uthamta="${h.id}" data-satt="faktura">Faktura</button>`
        : `<button type="button" class="knapp liten" data-uthamta="${h.id}">Hämtat ut</button>`}</span></li>`).join('')}</ul></div>` : '';
  return `<section class="ov-sektion ov-kostnader" aria-labelledby="ov-kostnader"><div class="sektion-huvud"><h2 id="ov-kostnader">${a?.kategorier ? 'Kostnader i vårdprocessen' : 'Avgifter och högkostnadsskydd'}</h2><span class="tagg tagg-demo">Demopriser</span></div>
    ${innehall}${avgifter}${hog}${attHamta}${hjalpmedel}<p class="demoregel">${esc(k.demo)}</p></section>`;
}

// Utlämnat hjälpmedel: ett klick på hjälpmedlet ur vårdenhetens prislista. Vårdkontakten väljer systemet.
async function lamnaUt(ctx, ladda) {
  const { hjalpmedel } = await api('/api/hjalpmedel');
  const svar = await dialog(`<h2 id="dlg-rubrik">Lämna ut hjälpmedel</h2><div class="dialog-text">
      <p>Välj hjälpmedlet som ${esc(ctx.patient?.namn ?? 'patienten')} får. Systemet registrerar det på den pågående vårdkontakten, och en hjälpmedelsavgift kommer med i faktureringsunderlaget.</p>
      <div class="knappval-lista ek-hjalpmedel">${hjalpmedel.map(h => `<button type="button" class="knapp sekundar" data-varde="${esc(h.kod)}">${esc(h.text)}${h.avgift ? ` (avgift ${esc(kr(h.avgift))})` : ''}${prisText(h)}</button>`).join('')}</div>
      ${hjalpmedel.some(h => h.pris != null) ? '<p class="dampad liten">Priserna är påhittade demopriser ur vårdenhetens prislista. Systemet föreslår basmodellen när den är likvärdig, och du väljer det som är rätt för patienten.</p>' : ''}</div>
    <div class="knapprad"><button type="button" class="knapp text" data-varde="avbryt">Avbryt</button></div>`);
  if (!svar) return;
  const r = await api(`/api/patient/${encodeURIComponent(ctx.id)}/hjalpmedel`, { metod: 'POST', data: { artikel: svar.val } });
  // Runda 18, r3 (Sussa B1): ett hjälpmedel som hämtas ut i receptionen är förskrivet.
  notis(r.uthamtning ? r.besked : `${r.text} är registrerat som utlämnat.`);
  await ladda();
}

// Runda 18, r3 (Sussa B4): priset diskret i knappen, och basmodellen när den är ett likvärdigt billigare alternativ.
function prisText(h) {
  if (h.pris == null) return '';
  return `<span class="under-text">${esc(kr(h.pris))}${h.uthamtning ? '. Hämtas ut i receptionen' : ''}${h.alternativ ? `. Likvärdigt billigare: ${esc(h.alternativ.text.toLowerCase())}, ${esc(kr(h.alternativ.pris))}` : ''}</span>`;
}

// Runda 18, r3 (Sussa B1): kvittot efter betalningen, som kan skrivas ut.
async function visaKvitto(q) {
  await dialog(`<h2 id="dlg-rubrik">Kvitto ${esc(q.kvitto)}</h2><div class="dialog-text ek-kvitto">
      <dl><dt>Vårdenhet</dt><dd>${esc(q.vardenhet ?? '')}</dd><dt>Tid</dt><dd>${esc(datum(q.tid))}</dd>${q.rader.map(r => `<dt>${esc(r.text)}</dt><dd>${esc(kr(r.belopp))}</dd>`).join('')}
        <dt>Betalsätt</dt><dd>${esc(q.sattText)}</dd><dt>Kassör</dt><dd>${esc(q.kassor ?? '')}</dd></dl>
      <p class="liten">${esc(q.text)}</p><p class="demoregel">${esc(q.demo)}</p></div>
    <div class="knapprad"><button type="button" class="knapp sekundar" data-skriv-ut>Skriv ut</button><button type="button" class="knapp" data-varde="ok">Stäng</button></div>`,
  { onOpen: (d) => d.querySelector('[data-skriv-ut]')?.addEventListener('click', () => window.print()) });
}

export function koppla(el, k, ctx, ladda) {
  if (!k) return;
  el.addEventListener('click', async (e) => {
    const ut = e.target.closest('[data-uthamta]');
    if (ut) {
      try {
        const r = await api(`/api/patient/${encodeURIComponent(ctx.id)}/hjalpmedel/${encodeURIComponent(ut.dataset.uthamta)}/uthamta`, { metod: 'POST', data: ut.dataset.satt ? { satt: ut.dataset.satt } : {} });
        notis(r.text);
        await ladda();
        if (r.kvitto) await visaKvitto(r.kvitto);
      } catch (err) { felNotis(err); }
      return;
    }
    const hm = e.target.closest('[data-ek="hjalpmedel"]');
    if (hm) { try { await lamnaUt(ctx, ladda); } catch (err) { felNotis(err); } return; }
    const b = e.target.closest('[data-ek="fardigbehandlad"]');
    if (!b || !k.aktuell) return;
    const svar = await dialog(`<h2 id="dlg-rubrik">Medicinskt färdigbehandlad</h2><form class="dialog-text">
        <p>Registrera att ${esc(ctx.patient?.namn ?? 'patienten')} är medicinskt färdigbehandlad. Datumet följer med i faktureringsunderlaget för vårdtillfället.</p>
        <div class="falt"><label for="ek-fb-datum">Datum</label><input id="ek-fb-datum" name="datum" type="date" max="${esc(idag())}" value="${esc(idag())}" required></div>
        <p class="dialog-fel form-fel" hidden></p></form>
      <div class="knapprad"><button type="button" class="knapp" data-varde="ok">Registrera</button><button type="button" class="knapp text" data-varde="avbryt">Avbryt</button></div>`);
    if (!svar) return;
    try {
      const r = await api(`/api/vardtillfalle/${encodeURIComponent(k.aktuell.id)}/fardigbehandlad`, { metod: 'POST', data: { datum: svar.data.datum } });
      notis(`Patienten är registrerad som medicinskt färdigbehandlad ${datum(r.datum)}.`);
      await ladda();
    } catch (err) { felNotis(err); }
  });
}
