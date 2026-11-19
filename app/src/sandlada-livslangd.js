// Runda 18, r4: hur länge en sandlåda finns kvar efter senaste användningen. Servern räknar med det (server.js), och
// sidorna #/testa och #/om säger det till besökaren genom GET /api/krav/version (fakta), så att texten aldrig skrivs för
// hand och aldrig kan säga något annat än servern gör.
export const SANDLADA_TIMMAR = 8;
