// Runda 18, r2: Jag letar efter. Ord som vårdpersonal använder i andra journalsystem och i vardagen, med vad det heter och
// var det finns i Vårdkällan. Sidan är öppen utan inloggning. För den inloggade personalen finns en länk när rollen får
// handlingen (GET /api/handlingar/ordlista). Samma ord används av sökrutan Vad vill du göra?, som knappen på sidan öppnar
// (handlingssok.js).
import { esc, api, vyRubrik, ikon } from '../ui.js';
import { arPersonal } from '../app.js';

export const namn = 'ordlista';

const norm = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function postHtml(p) {
  const lank = p.href ? ` <a href="${esc(p.href)}">Gå till ${esc(p.heter.charAt(0).toLowerCase() + p.heter.slice(1))}</a>`
    : p.kraverPatient && arPersonal() ? ' <span class="under-text">Finns i journalen när du har öppnat en patient.</span>' : '';
  return `<li class="ol-post" data-ol="${esc(norm([...p.ord, p.heter, p.forklaring].join(' ')))}">
    <p class="ol-ord">${p.ord.map(o => `<span class="tagg">${esc(o)}</span>`).join(' ')}</p>
    <p>Heter <strong>${esc(p.heter)}</strong> här. ${esc(p.forklaring)}${lank}</p>
  </li>`;
}

export async function visa(main, _p, q, ctx = {}) {
  const sok = arPersonal() ? `<p>Du kan också skriva med egna ord i rutan Vad vill du göra? högst upp, eller trycka Ctrl K.</p>
    <div class="knapprad"><button type="button" class="knapp sekundar" data-a="vad-vill-du">${ikon.sok}<span>Öppna Vad vill du göra?</span></button></div>` : '';
  main.innerHTML = `${vyRubrik('Jag letar efter', 'Ord som vårdpersonal använder i andra journalsystem och i vardagen, och vad det heter och var det finns i Vårdkällan.')}
    ${sok}
    <div class="falt ol-filter"><label for="ol-filter">Sök bland orden</label>
      <input id="ol-filter" type="search" autocomplete="off" maxlength="60" value="${esc(q?.get('ord') ?? '')}" aria-describedby="ol-antal"></div>
    <p class="liten" id="ol-antal" aria-live="polite"></p>
    <div id="ol-lista"><p class="tom">Hämtar ordlistan.</p></div>`;
  const d = await api('/api/handlingar/ordlista');
  if (ctx.aktuell && !ctx.aktuell()) return;
  const lista = main.querySelector('#ol-lista');
  lista.innerHTML = `<ul class="ol-lista">${d.poster.map(postHtml).join('')}</ul>
    <p class="tom" id="ol-inget" hidden>Inget ord passar. Pröva ett kortare ord eller början av ordet${arPersonal() ? ', eller skriv i Vad vill du göra? högst upp' : ''}.</p>`;
  const falt = main.querySelector('#ol-filter');
  const filtrera = () => {
    const v = norm(falt.value.trim());
    let n = 0;
    for (const li of lista.querySelectorAll('.ol-post')) { const syns = !v || li.dataset.ol.includes(v); li.hidden = !syns; if (syns) n++; }
    lista.querySelector('#ol-inget').hidden = n > 0;
    main.querySelector('#ol-antal').textContent = v ? `${n} av ${d.poster.length} ord passar.` : `${d.poster.length} ord.`;
  };
  falt.addEventListener('input', filtrera);
  filtrera();
}
