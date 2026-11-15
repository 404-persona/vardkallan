// Runda 16, r2: Socialstyrelsens försäkringsmedicinska beslutsstöd (FMB) för en diagnos (fmb.js). Utdraget ur det öppna
// API:t ligger i src/fmb/fmb-data.json.
import { describe, test, expect } from 'bun:test';
import * as fmb from '../src/fmb.js';
import { utdrag, tillText, utanTankstreck } from '../scripts/fmb-hamta.js';

const T = 'FMB > ';

describe('Försäkringsmedicinskt beslutsstöd', () => {
  test(`${T}diagnosen ger diagnosrubriken, funktionsnedsättningar, aktivitetsbegränsningar och typfall ur Socialstyrelsens data`, () => {
    const d = fmb.forDiagnos('M54.4');
    expect(d.diagnosrubrik).toBe('Lumbago-ischias');
    expect(d.funktionsnedsattning.length).toBeGreaterThan(50);
    expect(d.aktivitetsbegransning.length).toBeGreaterThan(50);
    expect(d.funktionsnedsattningIcf.length).toBeGreaterThan(0);
    expect(d.typfall.length).toBeGreaterThan(3);
    expect(d.kalla).toContain('CC0');
    // Koden utan punkt och med gemener ger samma sak, och en kod under en kategori i FMB (J06.9 under J06) hittas.
    expect(fmb.forDiagnos('m544').diagnosrubrik).toBe('Lumbago-ischias');
    expect(fmb.forDiagnos('J06.9').diagnosrubrik).toBe('Övre luftvägsinfektion (ÖLI)');
    // En kod som FMB inte har ger inget beslutsstöd, och inget fel.
    expect(fmb.forDiagnos('Z00.0')).toBeNull();
    expect(fmb.forDiagnos('')).toBeNull();
  });

  test(`${T}den längsta rekommenderade tiden är den längsta i typfallen, omräknad till dagar som i Webcert`, () => {
    expect(fmb.forDiagnos('J06.9').rekommenderadMaxDagar).toBe(14);
    expect(fmb.forDiagnos('J06.9').rekommenderadMaxText).toBe('2 veckor');
    expect(fmb.forDiagnos('F43.8').rekommenderadMaxDagar).toBe(12 * 31);
    // Lumbago-ischias har typfall med enheterna w och m, som Vårdkällan också läser: längst är 3 månader.
    expect(fmb.forDiagnos('M54.4').rekommenderadMaxDagar).toBe(93);
    expect(fmb.tidIDagar(2, 'wk')).toBe(14);
    expect(fmb.tidIDagar(3, 'mo')).toBe(93);
    expect(fmb.tidIDagar(5, 'okand')).toBeNull();
    expect(fmb.tidIDagar(null, 'd')).toBeNull();
    expect(fmb.tidText(0, 'd')).toBe('ingen sjukskrivning');
    expect(fmb.tidText(1, 'wk')).toBe('1 vecka');
  });

  test(`${T}utdraget ur det öppna API:t tar med alla giltiga typfall och gör HTML till vanlig text utan tankstreck`, () => {
    expect(fmb.ANTAL.diagnosrubriker).toBeGreaterThan(100);
    expect(fmb.ANTAL.typfall).toBeGreaterThan(400);
    expect(fmb.KALLA.licens).toBe('CC0');
    expect(utanTankstreck('i 2 – 4 veckor')).toBe('i 2 till 4 veckor');
    expect(utanTankstreck('lång tid – ofta 1 år – är')).toBe('lång tid, ofta 1 år, är');
    expect(tillText('Till exempel\n\n<ul>\n<li>svårt att gå</li>\n<li>svårt att lyfta</li>\n</ul>')).toBe('Till exempel\n• svårt att gå\n• svårt att lyfta');
    const diag = { meta: { version: '9' }, data: [{ id: '1', attributes: { diagnosrubrik: 'X', diagnoskod: [{ kod: 'A01' }], funktionsnedsattning: { funktionsnedsattningsbeskrivning: '<p>F</p>' }, aktivitetsbegransning: {} } }] };
    const typfall = { data: [
      { id: 't1', attributes: { status: { kod: 'giltig' }, fmbtillstand: { tillstandsmening: 'x ', diagnoskod: [{ kod: 'A01' }] }, rekommenderadsjukskrivning: { maximalsjukskrivningstid: '2', maximalsjukskrivningsenhet: 'wk', maximalsjukskrivningsgrad: { beskrivning: 'heltid' } } } },
      { id: 't2', attributes: { status: { kod: 'upphord' }, fmbtillstand: { diagnoskod: [] }, rekommenderadsjukskrivning: {} } },
    ] };
    const u = utdrag(diag, typfall, '2026-11-15');
    expect(u.typfall.map(t => t.id)).toEqual(['t1']);
    expect(u.typfall[0]).toMatchObject({ tid: 2, enhet: 'wk', grad: 'heltid', tillstand: 'x' });
    expect(u.diagnoser[0].funktionsnedsattning).toBe('F');
    expect(u.licens).toBe('CC0');
  });
});
