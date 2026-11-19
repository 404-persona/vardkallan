// Runda 18, r5: sökning i listor. Varje lista med många val (minst tolv) och varje lista som är märkt data-sokbar får ett
// sökfält bredvid sig. Den som skriver början av ett ord eller en del av namnet ser bara de val som passar, och det
// första som passar väljs när det valda inte längre syns. Å, ä och ö och stora och små bokstäver spelar ingen roll.
// Listan och dess värden ändras inte, så att formuläret skickar samma sak som förut.
const MINST = 12;
const norm = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function forbattra(sel) {
  if (sel.dataset.listsok || sel.multiple || sel.disabled) return;
  if (!sel.hasAttribute('data-sokbar') && sel.options.length < MINST) return;
  if (!sel.closest('main, dialog')) return;
  sel.dataset.listsok = '1';
  const etikett = (sel.labels?.[0]?.textContent ?? sel.getAttribute('aria-label') ?? 'listan').trim().replace(/\s+/g, ' ');
  const falt = document.createElement('input');
  falt.type = 'search';
  falt.className = 'ls-sok';
  falt.autocomplete = 'off';
  falt.placeholder = 'Sök i listan';
  falt.setAttribute('aria-label', `Sök i ${etikett.toLowerCase()}`);
  sel.insertAdjacentElement('beforebegin', falt);
  falt.addEventListener('input', () => {
    const q = norm(falt.value.trim());
    let forsta = null;
    for (const o of sel.options) {
      const syns = !q || !o.value && !o.textContent.trim() ? true : norm(o.textContent).split(/[\s,()/-]+/).some(ord => ord.startsWith(q)) || norm(o.textContent).includes(q);
      o.hidden = !syns;
      if (syns && !forsta && o.value) forsta = o;
    }
    for (const g of sel.querySelectorAll('optgroup')) g.hidden = ![...g.children].some(o => !o.hidden);
    if (forsta && sel.selectedOptions[0]?.hidden) {
      sel.value = forsta.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  falt.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sel.focus(); } });
}

const genomga = (rot) => { if (rot.matches?.('select')) forbattra(rot); for (const s of rot.querySelectorAll?.('select') ?? []) forbattra(s); };
new MutationObserver((a) => { for (const m of a) for (const n of m.addedNodes) if (n.nodeType === 1) genomga(n); })
  .observe(document.documentElement, { childList: true, subtree: true });
genomga(document);
