// HOSP: den simulerade HOSP-tjänstens uppgifter i demon (Socialstyrelsens register över legitimerad hälso- och
// sjukvårdspersonal, tjänstekontraktet GetHospPersonForPublicHealthCare 1.1). Allt här är påhittat.
//
// PERSONNUMMER: personalens personnummer, som i verkligheten kommer från HSA-katalogen (personalIdentityNumber). I demon
// är de Skatteverkets testpersonnummer (research/testpersonnummer.json) som inte används för någon patient i seeden, och
// de finns bara här, i den simulerade katalogen. Personnumret används bara för att fråga HOSP och sparas aldrig hos
// Vårdkällan. Kommunens personal är inte med, eftersom kommunen är en egen huvudman som inte finns i vårdgivarens HSA.
export const PERSONNUMMER = {
  'lak-kard': '199011162725', 'ssk-kard': '199011192383', 'usk-kard': '199011232387', 'lak-akut': '199011262392',
  'lak-vc': '199203262390', 'lak-psyk': '199203292397', 'adm-kard': '199204022397', 'logg': '199204052394',
  'ssk-akut': '199308052381', 'lak-med': '199308092395', 'lak-inf': '199308132399', 'ssk-inf': '199308162396',
  'lak-ort': '199308202382', 'lak-kkoga': '199412102387', 'ssk-kkoga': '199412132384', 'lak-lind': '199412172380',
  'ssk-lind': '199412202393', 'lak-kumla': '199604092396', 'ssk-vc': '199604122391', 'ssk-psyk': '199604162397',
  'lak-vas': '199604192394', 'lak-cosmic': '199708192399', 'ark': '199708232385', 'uppf': '199708262382',
  'ul-kard': '199708302394', 'ol-kard': '199812232388', 'far-kard': '199812272384', 'vch-kard': '199812302389',
  'ssk-hia': '199901022385', 'eko': '198004282383', 'sysf': '198005022390', 'sysf-2': '198005052389', 'fys-kard': '198005082386',
  'bm-uso': '198108242390', 'lak-kk': '198108272397', 'opk-kkoga': '198108312383', 'lak-ane-kkoga': '198109032394',
  'ssk-ane-kkoga': '198212202397', 'lak-ane-ort': '198212232394', 'ssk-ane-ort': '198212272382', 'far-bered': '198212302387',
  'lak-onk': '198404152392', 'ssk-onk': '198404192398', 'ol-onk': '198404222385', 'vch-onk': '198404262381',
  'rtg-ssk': '198404292396', 'chef-kkoga-ane': '198508162388', 'chef-kkoga-ort': '198508199885', 'chef-lind-med': '198508222380',
  'chef-uso-akut': '198508262386', 'chef-uso-ane': '198612122385', 'chef-uso-inf': '198612162399', 'chef-uso-kk': '198612199995',
  'chef-uso-med': '198612222391', 'chef-uso-ort': '198804232398', 'chef-uso-psyk': '198804262395', 'chef-uso-rtg': '198804302381',
  'chef-vc-kumla': '198805032383', 'chef-vc-tybble': '198909032396', 'at-kkoga': '198909072384', 'diet-lind': '198909102389',
  'log-lind': '198909142385', 'kur-vc': '196507132758', 'psy-psyk': '196512073245', 'pt-psyk': '196604072659',
  'bm-vc': '197701212396', 'sk-psyk': '197701252392', 'stud-lak': '197701292398', 'stud-ssk': '197805222390',
  'stud-bm': '197805262388', 'rk-vc': '197805292385', 'lak-kard2': '197806022385', 'ssk-kardmott': '197806052382',
  'ssk-bvc': '197909242385', 'ssk-kardlab': '197909272382',};

// Legitimationerna som den simulerade tjänsten har för yrket i Vårdkällans personalkatalog. Koderna är kontraktets
// kodverk för legitimerat yrke (1.2.752.116.3.1.3). forskrivningsratt är kontraktets fält för förskrivningsrätt, som
// läkaren har med legitimationen och som sjuksköterskan och barnmorskan har efter ett eget beslut. I demon har alla
// sjuksköterskor och barnmorskor utom en förskrivningsrätt, så att demon fungerar som förut. Kuratorns legitimation
// (hälso- och sjukvårdskurator, sedan 2019) finns inte i kodverket i version 1.1 av kontraktet och kan därför inte
// lämnas ut av tjänsten.
export const LEGITIMATIONER = {
  lakare: [{ kod: 'LK', forskrivningsratt: true }],
  sjukskoterska: [{ kod: 'SJ', forskrivningsratt: true }],
  barnmorska: [{ kod: 'SJ', forskrivningsratt: true }, { kod: 'BM', forskrivningsratt: true }],
  fysioterapeut: [{ kod: 'FT' }],
  farmaceut: [{ kod: 'AP' }],
  arbetsterapeut: [{ kod: 'AT' }],
  dietist: [{ kod: 'DT' }],
  logoped: [{ kod: 'LG' }],
  psykolog: [{ kod: 'PS' }],
};
// Personer som har fler legitimationer än yrket i katalogen säger.
export const EXTRA = { 'pt-psyk': [{ kod: 'PT' }] };

// Avvikelserna som demon visar. Datumen ligger före demons tid, så att de gäller hela tiden.
export const AVVIKELSER = {
  // En anestesiläkare vars förskrivningsrätt är begränsad efter ett beslut: inga narkotiska läkemedel.
  'lak-ane-ort': { begransningar: [{ typ: '003', fromDatum: '20250901', text: 'Förskrivningsrätten omfattar inte narkotiska läkemedel.' }] },
  // En sjuksköterska utan förskrivningsrätt, som alltså inte får förskriva förbrukningsartiklar.
  'ssk-ane-ort': { forskrivningsratt: false },
  // En läkare vars legitimation är återkallad.
  'lak-kk': { aterkallad: '20251020' },
};
