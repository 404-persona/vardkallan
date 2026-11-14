// Runda 15, r5 (F4): omvårdnadsprocessen i anteckningsformuläret. Modulen ritar det som servern räknar fram
// (GET /api/patient/:id/omvardnadsprocess): undersköterskans observationer sedan förra anteckningen, formulär som borde
// fyllas i, omvårdnadsproblemen med systemets förslag förvalda och vårdplanens mål med den senaste bedömningen. Den fäller
// ihop de statusområden som inte gäller patienten i dag och skriver varför de föreslagna står öppna.
//
// Anteckningsvyn anropar:
//   const d = await hamta(patientId);                 // null när yrket inte skriver med processen eller i läsläget
//   ruta.innerHTML = html(d);                          // i formuläret, under sökorden
//   fallIhop(form, mall);                              // direkt när mallen ritas: fäller ihop statusområdena
//   koppla(form, d);                                   // visar de föreslagna områdena och kopplar valen
//   const process = las(form);                         // { problem, resultat } att skicka med anteckningen
// Servern prövar allt igen: problemen mot listan och resultatet mot vårdplanens mål på den egna vårdenheten.
import { esc, api } from './ui.js';

// Sökordens textfält i formuläret.
const SOKORD = '[data-sokord]';
const textfalt = (rot, { dolda = false } = {}) => [...rot.querySelectorAll(SOKORD)].filter(t => t.tagName === 'TEXTAREA' && (!dolda || t.closest('.falt')?.hidden));

const tid = (t) => new Date(t).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export async function hamta(patientId) {
  try { return await api(`/api/patient/${encodeURIComponent(patientId)}/omvardnadsprocess`, { tyst: true }); } catch { return null; }
}

export function html(d) {
  if (!d) return '';
  const foreslagna = new Map(d.problemForslag.map(p => [p.id, p.varfor]));
  const obs = d.observationer.length ? `<section class="op-del" aria-labelledby="op-obs"><h3 id="op-obs" class="liten-rubrik">Undersköterskans observationer</h3>
      <ul class="enkel-lista">${d.observationer.map(o => `<li><span class="under-text">${esc(tid(o.tid))}, ${esc(o.forfattare ?? '')}</span>${o.sokord.map(s => `<p class="liten"><strong>${esc(s.sokord)}:</strong> ${esc(s.text)}</p>`).join('')}</li>`).join('')}</ul></section>` : '';
  const formular = d.formularforslag.length ? `<section class="op-del" aria-labelledby="op-form"><h3 id="op-form" class="liten-rubrik">Formulär att fylla i</h3>
      <ul class="enkel-lista">${d.formularforslag.map(f => `<li><button type="button" class="knapp liten sekundar" data-valj-mall="${esc(f.typ)}">${esc(f.typ)}</button><span class="under-text">${esc(f.varfor)}</span></li>`).join('')}</ul></section>` : '';
  const problem = `<fieldset class="kryssgrupp op-problem"><legend>Omvårdnadsproblem</legend>
      <p class="hjalp">Systemet har valt de problem som journalen visar. Ändra om det inte stämmer.</p>
      ${d.problem.map(p => `<div class="kryssfalt"><input type="checkbox" id="op-p-${esc(p.id)}" value="${esc(p.id)}" data-op-problem${foreslagna.has(p.id) ? ' checked' : ''}><label for="op-p-${esc(p.id)}">${esc(p.text)}${foreslagna.has(p.id) ? `<span class="under-text">${esc(foreslagna.get(p.id))}</span>` : ''}</label></div>`).join('')}
    </fieldset>`;
  const mal = d.mal.length && d.kanBedomaResultat ? `<fieldset class="op-mal"><legend>Resultat mot vårdplanens mål</legend>
      ${d.mal.map(m => `<fieldset class="kryssgrupp segment" data-op-mal="${m.malId}"><legend>${esc(m.text)} <span class="under-text">${esc(m.plan)}. Senast: ${esc(m.statusText.toLowerCase())}.</span></legend>
        ${[['', 'Inte bedömt nu'], ...Object.entries(d.malstatus)].map(([v, t]) => `<input type="radio" id="op-m-${m.malId}-${v || 'ingen'}" name="op-m-${m.malId}" value="${v}"${v === '' ? ' checked' : ''}><label for="op-m-${m.malId}-${v || 'ingen'}">${esc(t)}</label>`).join('')}
      </fieldset>`).join('')}
      <p class="hjalp">Bedömningen förs in i vårdplanen när du signerar.</p>
    </fieldset>` : '';
  return `<div class="omvardnadsprocess" data-omvardnadsprocess>${obs}${formular}${problem}${mal}<p class="under-text">${esc(d.demoregler)}</p></div>`;
}

// Fäller ihop statusområden utan text direkt när mallen ritas, så att formuläret är kort från början. Knappen Fler
// områden fäller ut resten.
export function fallIhop(form, mall) {
  const utfallda = new Set(mall?.utfallda ?? []);
  if (!utfallda.size) return;
  const dolda = textfalt(form).filter(t => utfallda.has(t.dataset.sokord) && !t.value.trim()).map(t => t.closest('.falt')).filter(Boolean);
  if (!dolda.length) return;
  for (const f of dolda) f.hidden = true;
  const sista = textfalt(form).at(-1)?.closest('.falt');
  sista?.insertAdjacentHTML('afterend', '<p class="knapprad tat" data-op-fler-rad><button type="button" class="knapp liten text" data-op-fler aria-expanded="false"></button></p>');
  const knapp = form.querySelector('[data-op-fler]');
  const rakna = () => { if (!knapp.isConnected) return; const n = textfalt(form, { dolda: true }).length; knapp.textContent = `Fler områden (${n})`; if (!n) knapp.closest('p').remove(); };
  rakna();
  knapp.addEventListener('click', () => {
    const forsta = textfalt(form, { dolda: true })[0];
    for (const t of textfalt(form, { dolda: true })) t.closest('.falt').hidden = false;
    knapp.closest('p').remove();
    forsta?.focus();
  });
  form.__opRakna = rakna;
}

// Visar de statusområden som systemet föreslår, med varför, och kopplar valen. Ett klick på ett föreslaget formulär
// väljer det som mall.
export function koppla(form, d) {
  if (!d) return;
  const varfor = new Map(d.foreslagna.map(f => [f.sokord, f.varfor]));
  for (const t of textfalt(form)) {
    const s = t.dataset.sokord;
    if (!varfor.has(s)) continue;
    const falt = t.closest('.falt');
    if (falt) falt.hidden = false;
    // Sammanslagningen av runda 15: anteckningsvyn har redan skrivit varför (data-foreslaget), och då skrivs det inte igen.
    if (!falt?.querySelector('[data-op-varfor], [data-foreslaget]')) t.insertAdjacentHTML('beforebegin', `<p class="hjalp" data-op-varfor>${esc(varfor.get(s))}</p>`);
  }
  if (form.querySelector('[data-op-fler]')) form.__opRakna?.();
  form.querySelectorAll('[data-valj-mall]').forEach(b => b.addEventListener('click', () => {
    const val = form.querySelector('select[name="typ"]');
    if (!val || ![...val.options].some(o => o.value === b.dataset.valjMall || o.text === b.dataset.valjMall)) return;
    val.value = b.dataset.valjMall;
    val.dispatchEvent(new Event('change', { bubbles: true }));
  }));
}

export function las(form) {
  const ruta = form.querySelector('[data-omvardnadsprocess]');
  if (!ruta) return undefined;
  const problem = [...ruta.querySelectorAll('[data-op-problem]:checked')].map(x => x.value);
  const resultat = [...ruta.querySelectorAll('[data-op-mal]')].map(f => ({ malId: Number(f.dataset.opMal), status: f.querySelector('input:checked')?.value ?? '' })).filter(x => x.status);
  return { problem, resultat };
}

// Omvårdnadsproblemen och resultaten mot vårdplanens mål när anteckningen läses.
export function lasHtml(p) {
  if (!p) return '';
  return `<div class="op-las" data-op-las>${p.problem.length ? `<p class="liten"><strong>Omvårdnadsproblem:</strong> ${p.problem.map(x => esc(x.text)).join(', ')}.</p>` : ''}${p.resultat.length ? `<p class="liten"><strong>Resultat mot vårdplanens mål:</strong> ${p.resultat.map(x => `${esc(x.mal)}: ${esc(x.statusText.toLowerCase())}`).join('. ')}.</p>` : ''}</div>`;
}
