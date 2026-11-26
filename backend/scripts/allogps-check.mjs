// Vérifie la connexion à AlloGPS depuis le serveur : `node backend/scripts/allogps-check.mjs`
// Affiche les véhicules vus par AlloGPS et une position lue, sans rien écrire en base.
import 'dotenv/config';
import { allogpsConfigured, createAllogpsClient } from '../utils/allogps.js';

if (!allogpsConfigured()) {
  console.log('ALLOGPS_BASE_URL, ALLOGPS_ACCOUNT_ID, ALLOGPS_EMAIL et ALLOGPS_PASSWORD doivent être dans le .env');
  process.exit(1);
}
const client = createAllogpsClient();
try {
  const raw = await client.listRaw();
  console.log('Réponse /list (début) :', JSON.stringify(raw).slice(0, 1500));
  const vehicles = await client.vehicles();
  console.log(`\n${vehicles.length} véhicule(s) lus :`);
  for (const v of vehicles) console.log(` - ${v.name ?? '?'} | plaque ${v.plate ?? '?'} | agence ${v.agency ?? '?'} | clé ${v.key}`);
  if (vehicles[0]) {
    const gps = await client.gpsRaw(vehicles[0].key);
    console.log(`\nRéponse /gps pour « ${vehicles[0].name ?? vehicles[0].key} » (début) :`, JSON.stringify(gps).slice(0, 1500));
    console.log('Position lue :', await client.position(vehicles[0].key));
  }
} catch (error) {
  console.log('Échec :', error?.response?.status ?? '', error?.code ?? '', error?.message ?? error);
  if (error?.code === 'ECONNREFUSED' || error?.code === 'ETIMEDOUT') console.log("Le serveur AlloGPS refuse la connexion : demandez-leur d'autoriser l'adresse IP de ce serveur.");
  process.exit(1);
}
