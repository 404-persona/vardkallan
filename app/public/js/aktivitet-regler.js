// Runda 15, r4 (K2 1.6.1, beslut 2026-11-14): det som användaren själv skriver eller gör i anteckningsrutan räknas som
// aktivitet och förlänger inloggningen, men högst en signal i minuten. Sparandet i bakgrunden utan inmatning räknas
// inte, så att en övergiven skärm fortfarande loggas ut efter vårdgivarens tid utan aktivitet, med texten sparad som
// utkast. Reglerna är rena funktioner, så att de testas på servern med falsk klocka (anteckningsvy-r15.test.js).

export const MIN_MELLAN_MS = 60_000;

// Ger en funktion som svarar sant när en aktivitet ska skickas som signal: första gången och sedan högst en gång per
// minMs. nu kan bytas i testerna.
export function aktivitetsSignal({ minMs = MIN_MELLAN_MS, nu = () => Date.now() } = {}) {
  let senast = -Infinity;
  return () => {
    const t = nu();
    if (t - senast < minMs) return false;
    senast = t;
    return true;
  };
}
