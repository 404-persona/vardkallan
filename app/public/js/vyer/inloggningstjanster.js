// Runda 14, r1 (Sussa 5.2.1.1): inloggning genom vårdgivarens egen inloggningstjänst. Tre vyer: systemförvaltningens sida
// där en tjänst kopplas in med fyra ögon, övningstjänstens sida (en simulerad extern inloggningstjänst) och sidan som
// visar utfallet när webbläsaren kommer tillbaka från tjänsten. Systemet hämtar tjänstens uppgifter och nycklar och visar
// nycklarnas tumavtryck. Systemförvaltaren skriver bara in adressen och klient-id.
import { esc, api, tidpunkt, notis, medKnapp, dialog, vyRubrik } from '../ui.js';
import { efterExternInloggning } from '../app.js';
// Runda 15, r1: den andra faktorn efter en inloggning med lägre tillitsnivå än 3.
import { andraFaktorn } from '../flerfaktor-ui.js';

const tyst = (vag, data) => api(vag, { metod: 'POST', data, tyst: true });
const nycklarHtml = (nycklar) => `<ul class="it-nycklar">${nycklar.map(n => `<li>${n.ny ? '<span class="tagg">Ny</span> ' : ''}${esc(n.kty)}${n.alg ? `, ${esc(n.alg)}` : ''}${n.kid ? `, id ${esc(n.kid)}` : ''}<br><span class="dampad liten">Tumavtryck (SHA-256)</span> <code class="tumavtryck">${esc(n.tumavtryck)}</code></li>`).join('')}</ul>`;

function andringRad(a) {
  return `<li class="ik-ater it-andring"><div class="ik-text"><span class="ik-rubrik">${esc(a.atgardText)}: ${esc(a.namn)}${a.simulerad ? ' <span class="tagg">Simulerad</span>' : ''}</span>
    <span class="under-text">Utfärdare <code class="tumavtryck">${esc(a.utfardare)}</code>. Föreslagen av ${esc(a.foreslagenAv)} ${esc(tidpunkt(a.foreslagen))}.</span>
    <span class="under-text">Motivering: ${esc(a.motivering)}</span>
    ${/* Runda 15, r1: en ändrad lägsta tillitsnivå visas med vad den nya nivån betyder. */ ''}
    ${a.forraLagstaTillitsniva !== null && a.forraLagstaTillitsniva !== a.lagstaTillitsniva ? `<span class="under-text">Lägsta tillitsnivå ändras från ${esc(a.forraLagstaTillitsniva)} till ${esc(a.lagstaTillitsniva)}. ${esc(a.lagstaTillitsnivaText ?? '')}</span>` : ''}
    ${a.atgard === 'avstangning' || a.atgard === 'ateraktivering' || (a.forraLagstaTillitsniva !== null && a.forraLagstaTillitsniva !== a.lagstaTillitsniva) ? '' : `<span class="under-text">Jämför tumavtrycket med det som tjänsten publicerar innan du godkänner.</span>${nycklarHtml(a.nycklar)}`}
    ${a.borttagnaNycklar?.length ? `<span class="under-text">Nycklar som tas bort: ${a.borttagnaNycklar.map(n => `<code class="tumavtryck">${esc(n.tumavtryck)}</code>`).join(', ')}</span>` : ''}</div>
    <div class="ik-knappar">${a.kanGodkanna ? `<button type="button" class="knapp liten" data-godkann="${a.id}">Godkänn</button><button type="button" class="knapp liten sekundar" data-avsla="${a.id}">Avslå</button>` : ''}${a.egen ? `<button type="button" class="knapp liten sekundar" data-aterkalla="${a.id}">Återkalla</button>` : ''}</div></li>`;
}

function tjanstRad(t) {
  return `<li class="ik-ater it-tjanst"><div class="ik-text"><span class="ik-rubrik">${esc(t.namn)}${t.simulerad ? ' <span class="tagg">Simulerad</span>' : ''}${t.aktiv ? '' : ' <span class="tagg tagg-utkast">Avstängd</span>'}</span>
    <span class="under-text">Utfärdare <code class="tumavtryck">${esc(t.utfardare)}</code>, klient-id <code class="tumavtryck">${esc(t.klientId)}</code>. Vårdgivare ${esc(t.vardgivare)}.</span>
    <span class="under-text">${esc(t.klientautentiseringText)}${t.hemlighetFinns === false ? '. Hemligheten finns inte i serverns miljö, så inloggningen fungerar inte förrän driften har lagt in den' : ''}. ${esc(t.attributprofilText)}.</span>
    <span class="under-text" data-lagsta="${esc(t.lagstaTillitsniva)}">Lägsta tillitsnivå: ${esc(t.lagstaTillitsnivaText ?? '')}.</span>
    ${t.nyckellage?.andrad ? '<p class="ruta ruta-larm liten" role="status">Tjänsten publicerar nu andra nycklar än de inlagda. Inloggningen stängs tills de nya nycklarna är inlagda. Föreslå ett byte, så godkänner en annan systemförvaltare det.</p>' : ''}
    ${nycklarHtml(t.nycklar)}</div>
    <div class="ik-knappar">${t.vantar ? '<span class="under-text">En ändring väntar på godkännande.</span>' : `${t.aktiv && t.nyckellage?.andrad ? `<button type="button" class="knapp liten" data-nycklar="${esc(t.id)}">Föreslå byte av nyckel</button>` : ''}
      <button type="button" class="knapp liten sekundar" data-tillitsniva="${esc(t.id)}" data-nu="${esc(t.lagstaTillitsniva)}">Ändra lägsta tillitsnivå</button>
      <button type="button" class="knapp liten sekundar" data-aktiv="${esc(t.id)}" data-pa="${t.aktiv ? 'nej' : 'ja'}">${t.aktiv ? 'Stäng av' : 'Slå på igen'}</button>`}</div></li>`;
}

function historik(rader) {
  if (!rader.length) return '<p class="tom liten">Inga beslutade ändringar ännu. En ändring hamnar här när den har godkänts.</p>';
  return `<div class="tabellrulle"><table class="tabell"><thead><tr><th scope="col">Ändring</th><th scope="col">Föreslagen av</th><th scope="col">Beslut</th></tr></thead><tbody>
    ${rader.map(a => `<tr><th scope="row">${esc(a.atgardText)}: ${esc(a.namn)}<br><span class="dampad liten">${esc(a.motivering)}</span></th><td>${esc(a.foreslagenAv)}, ${esc(tidpunkt(a.foreslagen))}</td>
      <td>${esc(a.statusText)} av ${esc(a.beslutadAv ?? '')}, ${esc(tidpunkt(a.beslutad))}${a.kommentar ? `<br><span class="dampad liten">${esc(a.kommentar)}</span>` : ''}</td></tr>`).join('')}
  </tbody></table></div>`;
}

const forhandHtml = (r) => (r.ok
  ? `<div class="ruta ruta-info liten"><p><strong>Systemet hämtade och kontrollerade tjänstens uppgifter.</strong></p>
      <p>Inloggning på <code class="tumavtryck">${esc(r.konfiguration.authorizationEndpoint)}</code>, biljetten från <code class="tumavtryck">${esc(r.konfiguration.tokenEndpoint)}</code>. Vårdgivare ${esc(r.konfiguration.vardgivare)}.</p>
      <p>Nycklarna som läggs in:</p>${nycklarHtml(r.konfiguration.nycklar)}
      ${r.varningar.map(v => `<p class="ruta ruta-varning liten">${esc(v)}</p>`).join('')}</div>`
  : `<p class="ruta ruta-larm liten" role="status">${esc(r.varfor)}</p>`);

export const tjanster = {
  namn: 'inloggningstjanster',
  async visa(main) {
    main.innerHTML = vyRubrik('Inloggningstjänster', 'Vårdgivarens egen inloggningstjänst, till exempel Ineras IdP för medarbetare eller regionens egen. Personalen loggar in där, och Vårdkällan räknar behörigheten ur biljettens attribut och katalogen. En ändring gäller först när en annan systemförvaltare har godkänt den.') + '<div id="it-sida"><p class="tom">Hämtar.</p></div>';
    const o = await api('/api/inloggningstjanster');
    const el = main.querySelector('#it-sida');
    if (!el) return;
    el.innerHTML = `
      <section class="inkorg-sektion" aria-labelledby="it-att-godkanna"><h2 id="it-att-godkanna">Att godkänna <span class="antal${o.attGodkanna.length ? ' antal-aktiv' : ''}">${o.attGodkanna.length}</span></h2>
        ${o.attGodkanna.length ? `<ul class="inkorg-lista">${o.attGodkanna.map(andringRad).join('')}</ul>` : '<p class="tom liten">Inga ändringar väntar på ditt godkännande. En ändring hamnar här när en annan systemförvaltare har gjort den.</p>'}</section>
      ${o.mina.length ? `<section class="inkorg-sektion" aria-labelledby="it-mina"><h2 id="it-mina">Mina förslag</h2><p class="liten">Väntar på att en annan systemförvaltare godkänner dem.</p><ul class="inkorg-lista">${o.mina.map(andringRad).join('')}</ul></section>` : ''}
      <section class="lm-sektion" aria-labelledby="it-inkopplade"><h2 id="it-inkopplade">Inkopplade tjänster</h2>
        ${o.tjanster.length ? `<ul class="inkorg-lista">${o.tjanster.map(tjanstRad).join('')}</ul>` : '<p class="tom liten">Ingen tjänst är inkopplad. Personalen loggar in med den simulerade autentiseringstjänsten och demorollerna.</p>'}
        <div class="knapprad"><button type="button" class="knapp" data-ovning>Koppla in övningstjänsten</button><button type="button" class="knapp sekundar" data-ny>Koppla in en annan tjänst</button></div></section>
      <section class="lm-sektion" aria-labelledby="it-kontroll"><h2 id="it-kontroll">Så prövar Vårdkällan en biljett</h2>
        <ul class="sf-lasta">
          <li>Svaret ska höra till inloggningen som började i samma webbläsare (state och nonce), och koden byts mot biljetten med PKCE. Ett svar används en gång.</li>
          <li>Biljetten ska vara signerad med en av de inlagda nycklarna och en asymmetrisk algoritm. En nyckel som tjänsten har bytt till godtas först när en andra systemförvaltare har godkänt den.</li>
          <li>Utfärdaren, mottagaren och tiden ska stämma, och tillitsnivån ska vara minst tjänstens lägsta nivå (förvalt 3).</li>
          <li>Tillitsnivå 3 eller högre, till exempel SITHS-kortet eller SITHS eID i mobilen, räknas som flerfaktor och ger åtkomst utan extra steg. En lägre nivå är en faktor, och personen bekräftar då med en passkey eller en kod från appen innan någon behörighet ges.</li>
          <li>Attributen tolkas enligt ${esc(o.attributkalla.titel)} (version ${esc(o.attributkalla.version)}): personens HSA-id, medarbetaruppdraget med ändamål och vårdenhet, vårdgivaren och den legitimerade yrkesgruppen.</li>
          <li>Attributen prövas mot katalogen. Saknas ett attribut, eller motsäger det katalogen, blir det ingen inloggning, och personen får veta vad som är fel och vem som kan rätta det. Prövningen görs igen i varje anrop.</li>
        </ul></section>
      <section class="lm-sektion" aria-labelledby="it-uppgifter"><h2 id="it-uppgifter">Uppgifter som inloggningstjänsten behöver om Vårdkällan</h2>
        <dl class="it-uppgifter"><dt>Adress för svaret (redirect_uri)</dt><dd><code class="tumavtryck">${esc(o.vardkallan.redirectUri)}</code></dd>
          <dt>Vårdkällans publika nyckel (jwks_uri)</dt><dd><code class="tumavtryck">${esc(o.vardkallan.rpJwksUri)}</code></dd>
          <dt>Nyckelns tumavtryck</dt><dd><code class="tumavtryck">${esc(o.vardkallan.rpTumavtryck)}</code></dd>
          <dt>Omfång (scope)</dt><dd><code>${esc(o.vardkallan.scope)}</code></dd></dl>
        <p class="liten">Adresser som driften har godkänt: ${o.tillatna.length ? o.tillatna.map(t => `<code class="tumavtryck">${esc(t)}</code>`).join(', ') : 'inga, så bara övningstjänsten går att koppla in'}.</p></section>
      <section class="lm-sektion" aria-labelledby="it-historik"><h2 id="it-historik">Historik</h2>${historik(o.historik)}</section>
      <p class="demoregel">${esc(o.simulerad)}</p>`;
    el.addEventListener('click', (e) => klick(main, e, o));
  },
};

async function klick(main, e, o = {}) {
  const k = (s) => e.target.closest(s);
  try {
    if (k('[data-godkann]')) { await medKnapp(k('[data-godkann]'), () => api(`/api/inloggningstjanster/andring/${k('[data-godkann]').dataset.godkann}/godkann`, { metod: 'POST', data: {} })); notis('Ändringen är godkänd och gäller nu.'); }
    else if (k('[data-aterkalla]')) { await medKnapp(k('[data-aterkalla]'), () => api(`/api/inloggningstjanster/andring/${k('[data-aterkalla]').dataset.aterkalla}/avsluta`, { metod: 'POST', data: {} })); notis('Förslaget är återkallat.'); }
    else if (k('[data-avsla]')) {
      const b = k('[data-avsla]');
      const svar = await dialog(`<form><h2 id="dlg-rubrik">Avslå ändringen</h2>
        <div class="falt"><label for="it-kommentar">Varför avslås den? <span class="obl">(obligatoriskt)</span></label><textarea id="it-kommentar" name="kommentar" rows="3" required maxlength="500"></textarea></div>
        <div class="knapprad"><button type="button" class="knapp" data-varde="ok">Avslå</button><button type="button" class="knapp sekundar" data-varde="avbryt">Avbryt</button></div></form>`);
      if (!svar) return;
      await medKnapp(b, () => api(`/api/inloggningstjanster/andring/${b.dataset.avsla}/avsluta`, { metod: 'POST', data: svar.data }));
      notis('Ändringen är avslagen.');
    } else if (k('[data-ovning]')) {
      if (!await kopplaIn(k('[data-ovning]'), { ovning: true })) return;
    } else if (k('[data-ny]')) {
      if (!await kopplaIn(k('[data-ny]'), {})) return;
    } else if (k('[data-nycklar]')) {
      const b = k('[data-nycklar]');
      const svar = await motivera('Byte av nyckel', 'Tjänsten har bytt nyckel.');
      if (!svar) return;
      await medKnapp(b, () => api(`/api/inloggningstjanster/${b.dataset.nycklar}/nycklar`, { metod: 'POST', data: svar }));
      notis('Bytet av nyckel väntar på att en annan systemförvaltare godkänner det.');
    } else if (k('[data-tillitsniva]')) {
      // Runda 15, r1: lägsta tillitsnivå, med vad varje nivå betyder. Gäller efter fyra ögon.
      const b = k('[data-tillitsniva]');
      const svar = await valjTillitsniva(o.tillitsnivaer ?? {}, Number(b.dataset.nu));
      if (!svar) return;
      await medKnapp(b, () => api(`/api/inloggningstjanster/${b.dataset.tillitsniva}/tillitsniva`, { metod: 'POST', data: svar }));
      notis('Den nya lägsta tillitsnivån väntar på att en annan systemförvaltare godkänner den.');
    } else if (k('[data-aktiv]')) {
      const b = k('[data-aktiv]');
      const pa = b.dataset.pa === 'ja';
      const svar = await motivera(pa ? 'Slå på tjänsten igen' : 'Stäng av tjänsten', '');
      if (!svar) return;
      await medKnapp(b, () => api(`/api/inloggningstjanster/${b.dataset.aktiv}/aktiv`, { metod: 'POST', data: { ...svar, aktiv: pa } }));
      notis(pa ? 'Påslagningen väntar på godkännande.' : 'Avstängningen väntar på godkännande. När den är godkänd loggas de som har loggat in genom tjänsten ut.');
    } else return;
  } catch { /* notis visad */ }
  tjanster.visa(main);
}

// Runda 15, r1: dialogen för lägsta tillitsnivå. Systemet förklarar varje nivå, och nuvarande nivå är förvald.
async function valjTillitsniva(nivaer, nu) {
  const svar = await dialog(`<form><h2 id="dlg-rubrik">Lägsta tillitsnivå för tjänsten</h2>
    <fieldset class="kryssgrupp"><legend>Biljetter under nivån godtas inte</legend>
      ${Object.entries(nivaer).map(([n, v]) => `<div class="kryssfalt"><input type="radio" id="it-niva-${esc(n)}" name="niva" value="${esc(n)}"${Number(n) === nu ? ' checked' : ''}><label for="it-niva-${esc(n)}"><strong>${esc(v.rubrik)}</strong><br><span class="hjalp" id="it-niva-${esc(n)}-text">${esc(v.text)}</span></label></div>`).join('')}
    </fieldset>
    <div class="falt"><label for="it-niva-mot">Varför ska nivån ändras? <span class="obl">(obligatoriskt)</span></label><textarea id="it-niva-mot" name="motivering" rows="2" required maxlength="1000"></textarea></div>
    <div class="knapprad"><button type="button" class="knapp" data-varde="ok">Skicka för godkännande</button><button type="button" class="knapp sekundar" data-varde="avbryt">Avbryt</button></div></form>`, { klass: 'dialog-bred' });
  return svar ? { niva: Number(svar.data.niva), motivering: svar.data.motivering } : null;
}

async function motivera(rubrik, forval) {
  const svar = await dialog(`<form><h2 id="dlg-rubrik">${esc(rubrik)}</h2>
    <div class="falt"><label for="it-motivering">Varför behövs ändringen? <span class="obl">(obligatoriskt)</span></label><textarea id="it-motivering" name="motivering" rows="2" required maxlength="1000">${esc(forval)}</textarea></div>
    <div class="knapprad"><button type="button" class="knapp" data-varde="ok">Skicka för godkännande</button><button type="button" class="knapp sekundar" data-varde="avbryt">Avbryt</button></div></form>`);
  return svar ? svar.data : null;
}

// Dialogen för att koppla in en tjänst. För övningstjänsten fyller systemet i allt. För en annan tjänst räcker namnet,
// adressen och klient-id, och systemet hämtar resten medan man skriver.
async function kopplaIn(knapp, { ovning = false }) {
  const falt = ovning ? '<p>Systemet fyller i allt för övningstjänsten, en simulerad extern inloggningstjänst i samma server. Den talar OpenID Connect med authorization code och PKCE, som en verklig tjänst.</p>' : `
    <div class="falt"><label for="it-namn">Tjänstens namn, så som personalen känner igen den</label><input id="it-namn" name="namn" required maxlength="80" placeholder="Regionens inloggningstjänst"></div>
    <div class="falt"><label for="it-utfardare">Tjänstens adress (utfärdaren)</label><input id="it-utfardare" name="utfardare" type="url" required maxlength="300" placeholder="https://idp.example.se/oidc">
      <p class="hjalp">Systemet hämtar tjänstens uppgifter och nycklar från adressen, om driften har godkänt den.</p></div>
    <div class="falt"><label for="it-klient">Klient-id som tjänsten gav Vårdkällan</label><input id="it-klient" name="klientId" required maxlength="200"></div>
    <div class="falt"><label for="it-auth">Hur Vårdkällan autentiserar sig</label><select id="it-auth" name="klientautentisering"><option value="private_key_jwt">Signerat intyg med Vårdkällans nyckel (rekommenderas)</option><option value="client_secret_basic">Hemlighet som driften lägger i serverns miljö</option></select></div>
    <div class="falt" data-hemlighet hidden><label for="it-hemlighet">Namn på miljövariabeln med hemligheten</label><input id="it-hemlighet" name="hemlighetMiljo" maxlength="50" placeholder="VK_IDP_REGIONEN">
      <p class="hjalp">Hemligheten själv skrivs aldrig in här och sparas aldrig i databasen.</p></div>
    <details class="it-inklistrat"><summary>Klistra in tjänstens uppgifter i stället</summary>
      <div class="falt"><label for="it-metadata">Metadata (openid-configuration, JSON)</label><textarea id="it-metadata" name="metadata" rows="3"></textarea></div>
      <div class="falt"><label for="it-jwks">Nycklar (JWKS, JSON)</label><textarea id="it-jwks" name="jwks" rows="3"></textarea></div></details>`;
  const svar = await dialog(`<form><h2 id="dlg-rubrik">${ovning ? 'Koppla in övningstjänsten' : 'Koppla in en inloggningstjänst'}</h2>${falt}
    <div class="falt"><label for="it-mot">Varför ska tjänsten kopplas in? <span class="obl">(obligatoriskt)</span></label><textarea id="it-mot" name="motivering" rows="2" required maxlength="1000">${ovning ? 'Prövar inloggningen genom en extern inloggningstjänst.' : ''}</textarea></div>
    <div class="sf-forhand" data-forhand aria-live="polite"></div>
    <p class="dialog-fel form-fel" role="alert" hidden></p>
    <div class="knapprad"><button type="button" class="knapp" data-varde="ok">Skicka för godkännande</button><button type="button" class="knapp sekundar" data-varde="avbryt">Avbryt</button></div></form>`, {
    klass: 'dialog-bred',
    onOpen: (dl) => {
      const form = dl.querySelector('form');
      const las = () => (ovning ? { ovning: true } : Object.fromEntries(new FormData(form)));
      const ruta = dl.querySelector('[data-forhand]');
      let timer = null; let nr = 0;
      const kor = async () => {
        const mitt = ++nr;
        const d = las();
        if (!ovning && (!d.utfardare || !d.klientId || !d.namn)) { ruta.innerHTML = '<p class="liten dampad">Skriv namnet, adressen och klient-id, så hämtar och kontrollerar systemet resten.</p>'; return; }
        try { const r = await tyst('/api/inloggningstjanster/forhandsvisa', d); if (mitt === nr) ruta.innerHTML = forhandHtml(r); } catch (e) { if (mitt === nr) ruta.innerHTML = `<p class="ruta ruta-larm liten">${esc(e.message)}</p>`; }
      };
      const auth = dl.querySelector('#it-auth');
      auth?.addEventListener('change', () => { dl.querySelector('[data-hemlighet]').hidden = auth.value !== 'client_secret_basic'; });
      dl.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(kor, 400); });
      kor();
    },
  });
  if (!svar) return false;
  await medKnapp(knapp, () => api('/api/inloggningstjanster', { metod: 'POST', data: ovning ? { ovning: true, motivering: svar.data.motivering } : svar.data }));
  notis('Tjänsten väntar på att en annan systemförvaltare godkänner den. Den syns på inloggningssidan när den är godkänd.');
  return true;
}

// Övningstjänstens sida. Den ser ut som en egen tjänst och märks som simulerad.
export const ovningstjanst = {
  namn: 'ovningstjanst',
  async visa(main, id) {
    main.innerHTML = `<div class="inloggningssida ovningstjanst"><h1 tabindex="-1">Övningstjänst för inloggning</h1><p class="ruta ruta-varning">Simulerad extern inloggningstjänst. Den är inte Ineras IdP och inte någon regions tjänst.</p><div id="ot-sida"><p class="tom">Hämtar.</p></div></div>`;
    let b;
    try { b = await api(`/api/ovningstjanst/begaran/${encodeURIComponent(id)}`, { tyst: true }); } catch (e) {
      main.querySelector('#ot-sida').innerHTML = `<p class="ruta ruta-larm" role="alert">${esc(e.message)}</p><p><a class="knapp" href="#/">Till inloggningen</a></p>`;
      return;
    }
    const el = main.querySelector('#ot-sida');
    el.innerHTML = `<p>${esc(b.klient)} vill att du loggar in. I en verklig tjänst loggar du in med SITHS-kortet och väljer ditt medarbetaruppdrag, och uppgifterna i biljetten kommer från HSA. Här väljer du en påhittad person, och uppgifterna räknas ur katalogen i din sandlåda.</p>
      <form id="ot-form" class="ot-form">
        <div class="falt"><label for="ot-person">Person</label><select id="ot-person" name="personalId">${b.personer.map(p => `<option value="${esc(p.id)}" data-leg="${p.legitimerad ? 1 : 0}">${esc(p.namn)}, ${esc(p.titel ?? '')}, ${esc(p.enhet ?? '')}</option>`).join('')}</select></div>
        <fieldset class="kryssgrupp"><legend>Vad ska biljetten innehålla?</legend>
          ${b.varianter.map((v, i) => `<div class="kryssfalt"${v.legitimerad ? ' data-leg-variant' : ''}><input type="radio" id="ot-v-${esc(v.id)}" name="variant" value="${esc(v.id)}"${i === 0 ? ' checked' : ''}><label for="ot-v-${esc(v.id)}">${esc(v.text)}</label></div>`).join('')}
          <p class="hjalp">Välj fel uppgifter för att se vad Vårdkällan gör med en biljett vars attribut inte stämmer med katalogen.</p></fieldset>
        <div class="knapprad"><button type="submit" class="knapp">Logga in</button><a class="knapp sekundar" href="#/">Avbryt</a></div>
      </form>`;
    const form = el.querySelector('#ot-form');
    const person = form.querySelector('#ot-person');
    const visaLeg = () => {
      const leg = person.selectedOptions[0]?.dataset.leg === '1';
      for (const d of form.querySelectorAll('[data-leg-variant]')) { d.hidden = !leg; if (!leg) d.querySelector('input').checked = false; }
      if (!form.querySelector('[name="variant"]:checked')) form.querySelector('#ot-v-ratt').checked = true;
    };
    person.addEventListener('change', visaLeg);
    visaLeg();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const knapp = form.querySelector('button[type="submit"]');
      try {
        const r = await medKnapp(knapp, () => api(`/api/ovningstjanst/begaran/${encodeURIComponent(id)}`, { metod: 'POST', data: Object.fromEntries(new FormData(form)) }));
        location.assign(r.adress);
      } catch { /* notis visad */ }
    });
  },
};

// Utfallet när webbläsaren kommer tillbaka från tjänsten.
export const resultat = {
  namn: 'inloggning-extern',
  async visa(main) {
    main.innerHTML = '<div class="inloggningssida"><h1 tabindex="-1">Inloggning</h1><div id="ie-sida"><p class="tom">Kontrollerar inloggningen.</p></div></div>';
    const { resultat: r } = await api('/api/inloggning/resultat', { tyst: true }).catch(() => ({ resultat: null }));
    const el = main.querySelector('#ie-sida');
    if (!el) return;
    if (r?.ok && !r.flerfaktor) { await efterExternInloggning(); return; }
    // Runda 15, r1: inloggningen räcker inte ensam, till exempel med tillitsnivå 2. Den andra faktorn bekräftas här, och
    // servern slutför inloggningen när den är godkänd.
    if (r?.ok) {
      el.innerHTML = `<p class="ruta ruta-info" role="status">${esc(r.flerfaktor.orsak ?? 'Inloggningen väntar på din andra faktor.')}</p>`;
      const klar = await andraFaktorn(r.flerfaktor, r.namn);
      if (klar?.inloggad) { await efterExternInloggning(); return; }
      el.innerHTML = '<p class="ruta ruta-info" role="status">Du är inte inloggad, eftersom den andra faktorn inte bekräftades.</p><p><a class="knapp" href="#/">Till inloggningen</a></p>';
      return;
    }
    el.innerHTML = r
      ? `<div class="ruta ruta-larm" role="alert"><p><strong>Du är inte inloggad${r.tjanst ? ` genom ${esc(r.tjanst)}` : ''}.</strong></p><p>${esc(r.text)}</p></div>
        <p class="liten">Biljetten från inloggningstjänsten prövas mot katalogen. Ingen åtkomst ges när något saknas eller inte stämmer, och försöket står i säkerhetsloggen.</p>
        <p><a class="knapp" href="#/">Till inloggningen</a></p>`
      : '<p>Ingen inloggning pågår.</p><p><a class="knapp" href="#/">Till inloggningen</a></p>';
    el.querySelector('.ruta-larm')?.focus?.();
  },
};
