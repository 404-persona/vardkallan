// Runda 15, r2, tredje omgången: flyttar till rätt patient som väntar på godkännande (fyra ögon). En vårdkontakt eller ett
// vårdtillfälle som har registrerats på fel patient flyttas till en patient utan vårdrelation till vårdenheten först när
// vårdenhetens verksamhetschef eller en annan vårdadministratör har godkänt det här, i sin egen inloggning. Vyn visar
// numret som skrevs, men ingenting om patienten som numret leder till.
import { esc, api, tidpunkt, notis, medKnapp, vyRubrik, dialog } from '../ui.js';
import { uppdateraInkorg } from '../app.js';

export const namn = 'flyttar';

const datum = (t) => (t ? tidpunkt(t) : '');
// Säkerhetsgranskningen efter sammanslagningen: listan visar bara vårdenhet, tid och status. Patienten, kontakten, numret
// och motiveringen hämtas när förslaget öppnas, prövat och loggat på patienten.
function kortHtml(f) {
  return `<li class="ruta flytt-forslag" data-flytt="${f.id}">
    <p><strong>${esc(f.rubrik)}</strong> <span class="tagg">${esc(f.statusText)}</span></p>
    <p class="liten">${esc(f.vardenhet?.namn ?? '')}, föreslagen ${esc(datum(f.foreslagen))}${f.foreslagenAv ? ` av ${esc(f.foreslagenAv.namn)}` : ''}${f.beslutadAv ? `. Beslutad ${esc(datum(f.beslutad))} av ${esc(f.beslutadAv.namn)}` : ''}</p>
    ${f.bytt ? `<p class="ruta ruta-varning liten">${esc(f.byttText)}</p>` : ''}
    <div class="knapprad"><button type="button" class="knapp sekundar" data-fl-oppna="${f.id}">Öppna förslaget</button></div>
  </li>`;
}
function forslagHtml(f, { knappar }) {
  return `<li class="ruta flytt-forslag" data-flytt="${f.id}">
    <p><strong>${esc(f.rubrik)}</strong> <span class="tagg">${esc(f.statusText)}</span></p>
    <dl class="faktarad">
      <div><dt>Registrerad på</dt><dd>${esc(f.felPatient?.namn ?? '')} <span class="pnr">${esc(f.felPatient?.personnummer ?? '')}</span></dd></div>
      <div><dt>${f.slag === 'vardtillfalle' ? 'Vårdtillfälle' : 'Vårdkontakt'}</dt><dd>${esc(f.objekt?.orsak ?? '')}, ${esc(f.objekt?.vardenhet?.namn ?? '')}, ${esc(datum(f.objekt?.start))}</dd></div>
      <div><dt>Rätt patient enligt förslaget</dt><dd class="pnr">${esc(f.rattNummer)}</dd></div>
      ${f.foljer ? `<div><dt>Följer med</dt><dd>${esc(f.foljer)}</dd></div>` : ''}
      <div><dt>Föreslagen</dt><dd>${esc(f.foreslagenAv?.namn ?? '')} ${esc(datum(f.foreslagen))}</dd></div>
      <div><dt>Motivering</dt><dd>${esc(f.orsak)}</dd></div>
      ${f.beslutadAv ? `<div><dt>Beslutad</dt><dd>${esc(f.beslutadAv.namn)} ${esc(datum(f.beslutad))}${f.kommentar ? `: ${esc(f.kommentar)}` : ''}</dd></div>` : ''}
    </dl>
    ${knappar ? `<div class="knapprad">${knappar}</div>` : ''}
  </li>`;
}

export async function visa(main) {
  main.innerHTML = vyRubrik('Flyttar till rätt patient', 'Uppgifter som har registrerats på fel patient, där rätt patient saknar vårdrelation till vårdenheten. Inget flyttas förrän en andra behörig person har godkänt flytten i sin egen inloggning.') + '<div id="fl"><p class="tom">Hämtar.</p></div>';
  const ladda = async () => {
    const d = await api('/api/flyttar');
    const el = main.querySelector('#fl');
    if (!el) return;
    knapparFor = (f) => (f.kanGodkanna ? `<button type="button" class="knapp" data-fl-godkann="${f.id}">Godkänn flytten</button><button type="button" class="knapp sekundar" data-fl-avsla="${f.id}">Avslå</button>`
      : f.egen && f.status === 'vantar' ? `<button type="button" class="knapp sekundar" data-fl-aterkalla="${f.id}">Återkalla</button>` : '');
    const lista = (rader, tom) => (rader.length ? `<ul class="enkel-lista">${rader.map(kortHtml).join('')}</ul>` : `<p class="tom liten">${esc(tom)}</p>`);
    el.innerHTML = `<p class="liten dampad">${esc(d.text)} Kontrollera numret mot underlaget, till exempel remissen eller id-handlingen, innan du godkänner. Rätt patient får då den vårdrelation som kontakten hade gett om den hade registrerats rätt från början.</p>
      <section class="lm-sektion" aria-labelledby="fl-godkanna"><h2 id="fl-godkanna">Att godkänna <span class="antal${d.attGodkanna.length ? ' antal-aktiv' : ''}">${d.attGodkanna.length}</span></h2>
        ${lista(d.attGodkanna, 'Inga flyttar väntar på ditt godkännande. En flytt hamnar här när någon föreslår att en uppgift flyttas till rätt patient.')}</section>
      <section class="lm-sektion" aria-labelledby="fl-mina"><h2 id="fl-mina">Mina förslag som väntar</h2>
        ${lista(d.mina, 'Du har inga förslag som väntar. Ett förslag hamnar här när du föreslår en flytt från journalen.')}</section>
      ${d.beslutade.length ? `<section class="lm-sektion" aria-labelledby="fl-beslutade"><h2 id="fl-beslutade">Beslutade</h2>${lista(d.beslutade, '')}</section>` : ''}`;
  };
  let knapparFor = () => '';
  await ladda();
  main.querySelector('#fl').addEventListener('click', async (e) => {
    const o = e.target.closest('[data-fl-oppna]');
    if (o) {
      try {
        const f = await medKnapp(o, () => api(`/api/flyttar/${o.dataset.flOppna}`));
        const li = o.closest('[data-flytt]');
        if (li) { li.outerHTML = forslagHtml(f, { knappar: knapparFor(f) }); main.querySelector(`[data-flytt="${f.id}"] button`)?.focus(); }
      } catch { /* felet visas som notis */ }
      return;
    }
    const g = e.target.closest('[data-fl-godkann]');
    const a = e.target.closest('[data-fl-avsla]');
    const t = e.target.closest('[data-fl-aterkalla]');
    try {
      if (g) {
        const r = await medKnapp(g, () => api(`/api/flyttar/${g.dataset.flGodkann}/godkann`, { metod: 'POST', data: {} }));
        notis(r.text);
      } else if (a) {
        const svar = await dialog(`<form><h2 id="dlg-rubrik">Avslå flytten</h2>
          <div class="falt"><label for="fl-kommentar">Varför avslås flytten? <span class="obl">(obligatoriskt)</span></label><textarea id="fl-kommentar" name="kommentar" rows="2" maxlength="500" required aria-required="true"></textarea></div>
          <p class="dialog-fel form-fel" role="alert" hidden></p>
          <div class="knapprad"><button type="button" class="knapp" data-varde="ok">Avslå</button><button type="button" class="knapp sekundar" data-varde="avbryt">Avbryt</button></div></form>`,
        { validera: (v) => ((v.kommentar || '').trim().length < 3 ? 'Skriv varför flytten avslås.' : null) });
        if (!svar) return;
        const r = await medKnapp(a, () => api(`/api/flyttar/${a.dataset.flAvsla}/avsluta`, { metod: 'POST', data: { kommentar: svar.data.kommentar.trim() } }));
        notis(r.text);
      } else if (t) {
        const r = await medKnapp(t, () => api(`/api/flyttar/${t.dataset.flAterkalla}/avsluta`, { metod: 'POST', data: {} }));
        notis(r.text);
      } else return;
    } catch { /* felet visas som notis */ }
    await uppdateraInkorg();
    await ladda();
  });
}
