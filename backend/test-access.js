// Test simple pour vérifier l'API access-schedules
const testAccessSchedulesAPI = async () => {
  try {
    console.log('🔍 Test de l\'API access-schedules...');
    
    // Test GET tous les horaires
    const response = await fetch('http://localhost:3001/api/access-schedules', {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Status:', response.status);
    console.log('Headers:', response.headers);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ API fonctionne! Données reçues:', data);
    } else {
      const error = await response.text();
      console.log('❌ Erreur API:', error);
    }
  } catch (error) {
    console.error('❌ Erreur réseau:', error);
  }
};

testAccessSchedulesAPI();
