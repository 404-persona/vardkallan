// Runda 16: rehabkoordinatorns sjukfall (rehabkoordinator.js). Som i Ineras Rehabstöd är tabellen tom tills
// koordinatorn söker, så att ingen patient visas och loggas i onödan. Koordinatorn sätter REKO-status per sjukfall, och
// statusarna Aktiv och Uppföljning kräver att patienten har samtyckt till koordineringsinsatser (lagen (2019:1297) 3 §).
import { esc, api, notis, felNotis, medKnapp, vyRubrik, tidpunkt, datum } from '../ui.js';

export const namn = 'rehabkoordinator';

const grad = (g) => (g == null ? '' : `${g} %`);
let filter = '';

function kort(s, statusar) {
  const id = `${s.patientId}-${s.start}`;
  const k = s.rehabkedjan;
  return `<li class="ruta sjk-rk" data-pid="${esc(s.patientId)}" data-start="${esc(s.start)}" data-samtycke="${s.reko.samtycke ? '1' : ''}">
    <p><strong>${esc(s.namn)}</strong> <span class="under-text">${esc(s.personnummer)}, ${esc(s.alder)} år, ${esc(s.kon ?? '')}</span></p>
    <p>${esc(s.diagnos ? `${s.diagnos.kod} ${s.diagnos.text ?? ''}` : '')}${s.sysselsattning ? `. Sysselsättning: ${esc(s.sysselsattning.toLowerCase())}` : ''}.</p>
    <p>Dag ${esc(s.uppskattadDag)} i sjukfallet, ${esc(s.dagar)} dagar med sjukskrivning från ${esc(s.start)}. Grad ${esc(grad(s.aktuellGrad))}. Intyget går ut ${esc(s.slut)}. Läkare: ${esc(s.lakare ?? 'okänd')}.</p>
    ${k?.nara ? `<p><span class="tagg tagg-utkast">Dag ${esc(k.nastaGrans)} om ${esc(k.kvar)} ${k.kvar === 1 ? 'dag' : 'dagar'}</span></p>` : ''}
    <form class="sjk-rk-form" data-reko>
      <div class="falt"><label for="reko-${esc(id)}">REKO-status</label>
        <select id="reko-${esc(id)}" name="status">${statusar.map(x => `<option value="${esc(x.kod)}"${x.kod === s.reko.kod ? ' selected' : ''}>${esc(x.text)}</option>`).join('')}</select></div>
      <fieldset class="kryssgrupp sjk-rk-samtycke" hidden><legend>Patientens samtycke</legend>
        <div class="kryssfalt"><input type="checkbox" id="sam-${esc(id)}" name="samtycke"><label for="sam-${esc(id)}">Patienten har samtyckt till koordineringsinsatser</label></div>
        <div class="kryssrad"><div class="radio"><input type="radio" id="mun-${esc(id)}" name="satt" value="muntligt"><label for="mun-${esc(id)}">Muntligt</label></div>
          <div class="radio"><input type="radio" id="skr-${esc(id)}" name="satt" value="skriftligt"><label for="skr-${esc(id)}">Skriftligt</label></div></div></fieldset>
      <div class="knapprad"><button type="submit" class="knapp">Spara REKO-status</button></div>
    </form>
    <p class="under-text">${s.reko.sattAv ? `Satt av ${esc(s.reko.sattAv)} ${esc(datum(s.reko.tid))}.${s.reko.samtycke ? ` Patienten har samtyckt ${esc((s.reko.samtyckeSatt ?? '').toLowerCase())}.` : ''}` : 'Ingen status är satt för sjukfallet.'}</p>
    <details data-historik><summary>Historik</summary><div class="sjk-rk-historik"></div></details>
  </li>`;
}

function historik(h) {
  if (!h.length) return '<p class="tom">Ingen status är satt ännu.</p>';
  return `<ul class="enkel-lista">${h.map(x => `<li>${esc(tidpunkt(x.tid))}: ${esc(x.text)}, ${esc(x.sattAv)}${x.samtyckeNu ? `, samtycke ${esc(x.samtyckeSatt ?? '')}` : ''}</li>`).join('')}</ul>`;
}

async function sok(main, d0) {
  const d = await api(`/api/rehabkoordinator/sjukfall?sok=1${filter ? `&reko=${encodeURIComponent(filter)}` : ''}`);
  const yta = main.querySelector('.sjk-rk-lista');
  if (!yta) return;
  const statusar = d0.statusar;
  const kraver = new Set(statusar.filter(s => s.kraverSamtycke).map(s => s.kod));
  yta.innerHTML = d.sjukfall.length ? `<p>${esc(d.sjukfall.length)} pågående sjukfall.</p><ul class="enkel-lista">${d.sjukfall.map(s => kort(s, statusar)).join('')}</ul>`
    : '<p class="tom">Inga pågående sjukfall med det filtret.</p>';
  for (const li of yta.querySelectorAll('.sjk-rk')) {
    const form = li.querySelector('form');
    const falt = form.querySelector('.sjk-rk-samtycke');
    const visa = () => { falt.hidden = !(kraver.has(form.status.value) && !li.dataset.samtycke); };
    form.status.addEventListener('change', visa);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = { start: li.dataset.start, status: form.status.value };
      if (!falt.hidden) { data.samtycke = form.samtycke.checked; data.samtyckeSatt = form.satt.value || undefined; }
      try {
        await medKnapp(form.querySelector('button'), () => api(`/api/rehabkoordinator/patient/${encodeURIComponent(li.dataset.pid)}/reko`, { metod: 'POST', data }));
        notis('REKO-statusen är sparad.');
        await sok(main, d0);
      } catch (x) { felNotis(x); }
    });
    li.querySelector('[data-historik]').addEventListener('toggle', async (e) => {
      if (!e.currentTarget.open) return;
      try {
        const p = await api(`/api/rehabkoordinator/patient/${encodeURIComponent(li.dataset.pid)}`);
        const s = p.sjukfall.find(x => x.start === li.dataset.start);
        li.querySelector('.sjk-rk-historik').innerHTML = historik(s?.historik ?? []);
      } catch (x) { felNotis(x); }
    });
  }
}

export async function visa(main) {
  const d = await api('/api/rehabkoordinator/sjukfall');
  main.innerHTML = `${vyRubrik('Sjukfall på vårdenheten', esc(d.vardenhet ?? ''))}
    <p class="ingress">${esc(d.regel)}</p>
    <p class="ruta ruta-info liten">${esc(d.samtycke)} Statusarna Aktiv och Uppföljning betyder att insatser ges och kräver patientens samtycke.</p>
    <form class="sjk-rk-filter" data-sok>
      <div class="falt"><label for="reko-filter">REKO-status</label>
        <select id="reko-filter" name="reko"><option value="">Alla</option>${d.statusar.map(x => `<option value="${esc(x.kod)}"${x.kod === filter ? ' selected' : ''}>${esc(x.text)}</option>`).join('')}</select></div>
      <div class="knapprad"><button type="submit" class="knapp">Sök</button></div>
    </form>
    <div class="sjk-rk-lista" aria-live="polite"><p class="tom">Tabellen fylls när du söker. Varje patient som visas loggas.</p></div>`;
  main.querySelector('[data-sok]').addEventListener('submit', async (e) => {
    e.preventDefault();
    filter = e.currentTarget.reko.value;
    try { await medKnapp(e.currentTarget.querySelector('button'), () => sok(main, d)); } catch (x) { felNotis(x); }
  });
}
