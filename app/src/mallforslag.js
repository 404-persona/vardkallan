// Runda 15, r4: de sökord som systemet föreslår överst i en mall för patienten och kontakten, var och ett med en kort
// förklaring ({ sokord, varfor }). Anteckningsvyn visar förslagen utfällda överst och fäller in resten. Del r5 fyller
// funktionen för omvårdnaden (vårdplanen, förra omvårdnadsanteckningen, NEWS2, fallrisken, såren, smärtskattningen och
// nutritionen). Bara det som anroparen får se får räknas, och en förklaring får aldrig nämna något från en vårdenhet
// som anroparen inte får se.
//   atk        behörighetsmotorn för den som skriver, med patienten
//   patientId  patienten
//   mall       mallen som den lämnas ut av GET /api/patient/:id/anteckningsmall
//   kontakt    vårdkontakten som anteckningen hamnar på ({ vardkontakt, ny } ur vardkontakt.aktuell), eller null
export function foreslagnaSokord(atk, patientId, mall, kontakt) { // eslint-disable-line no-unused-vars
  return [];
}
