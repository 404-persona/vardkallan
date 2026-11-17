// Runda 16, r3: barnmorskans förskrivning av preventivmedel i läkemedelsfliken (preventivmedel.js i servern).
// Systemet är experten: dialogen visar bara de preventivmedel som barnmorskans förskrivningsrätt omfattar, med doseringen
// för produkten, och servern fyller i orsak och uppföljning och kontrollerar mot överkänslighet och andra läkemedel.
import { esc, api, notis, felNotis, dialog, datum } from './ui.js';

export const knapp = () => '<button type="button" class="knapp" data-preventivmedel>Förskriv preventivmedel</button>';

export async function forskriv(ctx, b) {
  let f;
  try { f = await api(`/api/patient/${encodeURIComponent(ctx.id)}/preventivmedel`); } catch (e) { felNotis(e); return; }
  // HOSP: utan förskrivningsrätt som barnmorska i Socialstyrelsens register säger servern varför.
  if (f.kan === false) { notis(f.varfor, 'info'); return; }
  if (!f.lakemedel.length) { notis('Katalogen har inget preventivmedel som barnmorskan får förskriva.', 'info'); return; }
  const svar = await dialog(`<form><h2 id="dlg-rubrik">Förskriv preventivmedel</h2>
    <p>${esc(f.varfor)}</p>
    <fieldset class="kryssgrupp"><legend>Preventivmedel</legend>
      ${f.lakemedel.map((l, i) => `<div class="kryssfalt"><input type="radio" id="pv-${i}" name="lakemedelId" value="${esc(l.id)}"${i === 0 ? ' checked' : ''} required>
        <label for="pv-${i}">${esc(l.namn)} ${esc(l.styrka)}, ${esc(l.form)}<span class="under-text">${esc(l.dosering)}</span></label></div>`).join('')}
    </fieldset>
    <p class="hjalp">Orsaken blir ${esc(f.ordinationsorsak.toLowerCase())} och uppföljningen ${esc(datum(f.uppfoljningsdatum))}. Systemet kontrollerar mot överkänslighet och andra läkemedel innan förskrivningen sparas och skickas till Nationella läkemedelslistan.</p>
    <p class="dialog-fel form-fel" role="alert" hidden></p>
    <div class="knapprad"><button type="button" class="knapp" data-varde="ok">Förskriv</button><button type="button" class="knapp sekundar" data-varde="avbryt">Avbryt</button></div></form>`);
  if (!svar) return;
  b.disabled = true;
  try {
    const r = await api(`/api/patient/${encodeURIComponent(ctx.id)}/preventivmedel`, { metod: 'POST', data: { lakemedelId: svar.data.lakemedelId } });
    notis(`${r.ordination.lakemedel?.namn ?? 'Preventivmedlet'} är förskrivet.`, 'ok');
    ctx.ladda();
  } catch (e) { felNotis(e); } finally { if (b.isConnected) b.disabled = false; }
}
