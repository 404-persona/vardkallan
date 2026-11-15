// Runda 16, r1: två äldre intyg i demon, så att det går att pröva förnyelsen till version 2 av läkarintyget för
// sjukpenning och bytet från ett ersatt intyg. Båda är skrivna av läkaren på Vårdcentralen Tybble för Mikael Svensson (p14)
// innan bytena: ett läkarintyg för sjukpenning i version 1 från november 2025 och ett läkarintyg för högre
// körkortsbehörigheter (TSTRK1007) från november 2024, som ersattes av TS8071 den 3 februari 2025. Tiderna är fasta,
// eftersom de ligger före bytena oavsett när sandlådan skapas. Intygen läggs in direkt i journalen och i den simulerade
// intygsapplikationen, med samma händelser som om de hade skrivits där. Allt är påhittat.
import { randomUUID } from 'node:crypto';

const INTYG = [
  {
    typ: 'LISJP', version: '1.0', skapad: '2025-11-10T08:40:00.000Z', signerad: '2025-11-10T08:55:00.000Z', skickad: '2025-11-10T09:00:00.000Z',
    svar: {
      '1': { UNDERSOKNING: '2025-11-10' }, '28': ['NUVARANDE_ARBETE'], '29': 'Undersköterska på ett äldreboende, tunga lyft och förflyttningar.',
      '6': [{ kod: 'M545', text: 'Lumbago' }], '35': 'Smärta i ländryggen med nedsatt rörlighet vid framåtböjning.',
      '17': 'Kan inte lyfta eller förflytta brukare. Klarar inte långvarigt stående.', '19': 'Smärtlindring och fysioterapi.',
      '32': [{ kod: 'HELT_NEDSATT', fran: '2025-11-10', till: '2025-11-23' }], '39': 'STOR_SANNOLIKHET', '25': 'Demointyg i version 1.',
    },
  },
  {
    typ: 'TSTRK1007', version: '1.0', skapad: '2024-11-20T13:10:00.000Z', signerad: '2024-11-20T13:30:00.000Z', skickad: '2024-11-20T13:35:00.000Z',
    svar: { '1': ['C', 'CE'], '2': 'IDK3', '33': ['C', 'CE'], '32': 'Demointyg skrivet före bytet till TS8071.' },
  },
];

export function seeda(db) {
  if (db.query("SELECT 1 FROM sim_intygsapplikation WHERE ref LIKE 'VK-INTYG-SEED-%'").get()) return;
  const p = db.query("SELECT id, personnummer FROM patienter WHERE id = 'p14'").get();
  const lak = db.query("SELECT id, hsa_id, namn, enhet_id FROM personal WHERE id = 'lak-vc'").get();
  if (!p || !lak) return;
  const enhet = db.query("SELECT id FROM enheter WHERE id = 'vc-tybble'").get();
  if (!enhet) return;
  INTYG.forEach((x, i) => {
    const intygsId = randomUUID();
    const ref = `VK-INTYG-SEED-${i + 1}`;
    const ms = (s) => s.slice(0, 23);
    const handelser = [{ kod: 'SKAPAT', tid: ms(x.skapad) }, { kod: 'SIGNAT', tid: ms(x.signerad) }, { kod: 'SKICKA', tid: ms(x.skickad) }];
    db.query(`INSERT INTO sim_intygsapplikation (intygs_id, patient_id, enhet_id, typ, version, personnummer, personal_hsa, personal_namn, ref, status, skapad, signerad, signerad_av, skickad, svar, kallor, handelser)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'skickat', ?, ?, ?, ?, ?, '{}', ?)`)
      .run(intygsId, p.id, enhet.id, x.typ, x.version, p.personnummer, lak.hsa_id, lak.namn, ref, x.skapad, x.signerad, lak.hsa_id, x.skickad, JSON.stringify(x.svar), JSON.stringify(handelser));
    const id = Number(db.query(`INSERT INTO lakarintyg (patient_id, enhet_id, typ, version, intygs_id, ref, skapad_av, skapad_tid, status, signerad_tid, skickad_tid, andrad_tid)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'skickat', ?, ?, ?)`).run(p.id, enhet.id, x.typ, x.version, intygsId, ref, lak.id, x.skapad, ms(x.signerad), ms(x.skickad), x.skickad).lastInsertRowid);
    for (const h of handelser) db.query("INSERT INTO lakarintyg_handelser (intyg_id, patient_id, enhet_id, kod, tid, mottagen_tid, kalla) VALUES (?, ?, ?, ?, ?, ?, 'seed')").run(id, p.id, enhet.id, h.kod, h.tid, h.tid);
  });
}
