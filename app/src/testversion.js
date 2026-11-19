// Runda 19, r1: en testkrok för omladdningen när en ny version finns (public/js/ny-version.js). Gränssnittstestet
// behöver kunna byta gränssnittets version i en körande container och se att en öppen flik laddar om. Kroken finns bara
// när testflaggan VARDKALLAN_TESTVERSION=1 är satt i en testcontainer, som testklockan (testklocka.js). Driften sätter
// den aldrig, och den vägrar tillsammans med SESSION_FIL eller LITA_PA_PROXY, som hör till driften.
let tillagg = '';
let nr = 0;

export function aktiv(env = process.env) {
  if (env.VARDKALLAN_TESTVERSION !== '1') return false;
  return !env.SESSION_FIL && env.LITA_PA_PROXY !== '1';
}

// Versionen som /api/health visar: gränssnittets hash, med ett tillägg när testet har bytt version.
export const version = (v, env = process.env) => (v && tillagg && aktiv(env) ? `${v}-${tillagg}` : v);

// Byter version. Bara med testflaggan; annars null, och rutten svarar som en okänd adress.
export function byt(env = process.env) {
  if (!aktiv(env)) return null;
  tillagg = `test${++nr}`;
  return tillagg;
}
