#!/usr/bin/env node

// Script de test pour vérifier l'API remises
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001/api';

// Test de l'API
async function testRemisesApi() {
  console.log('🧪 Test de l\'API remises...\n');
  
  try {
    // 1. Test création d'un client_abonné
    console.log('1️⃣ Test création client_abonné...');
    const createResponse = await fetch(`${API_BASE}/remises/clients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Vous devrez ajouter un token valide ici
        'Authorization': 'Bearer YOUR_TOKEN_HERE'
      },
      body: JSON.stringify({
        nom: 'Test Client Abonné',
        phone: '0600000000',
        contact_id: 1,
        type: 'client_abonne'
      })
    });
    
    if (createResponse.ok) {
      const createdClient = await createResponse.json();
      console.log('✅ Client abonné créé:', createdClient);
      
      // 2. Test récupération par contact_id
      console.log('\n2️⃣ Test récupération par contact_id...');
      const getResponse = await fetch(`${API_BASE}/remises/clients/by-contact/1`);
      
      if (getResponse.ok) {
        const existingClient = await getResponse.json();
        console.log('✅ Client abonné trouvé:', existingClient);
      } else {
        console.log('❌ Client abonné non trouvé:', getResponse.status);
      }
      
      // 3. Nettoyage
      console.log('\n3️⃣ Nettoyage...');
      const deleteResponse = await fetch(`${API_BASE}/remises/clients/${createdClient.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer YOUR_TOKEN_HERE'
        }
      });
      
      if (deleteResponse.ok) {
        console.log('✅ Client abonné supprimé');
      }
      
    } else {
      console.log('❌ Erreur création:', createResponse.status, await createResponse.text());
    }
    
  } catch (error) {
    console.error('❌ Erreur test:', error);
  }
}

// testRemisesApi();
console.log('Pour exécuter ce test:');
console.log('1. Installez node-fetch: npm install node-fetch');
console.log('2. Ajoutez un token valide dans le script');
console.log('3. Décommentez la ligne testRemisesApi()');
console.log('4. Exécutez: node test-remises-api.js');