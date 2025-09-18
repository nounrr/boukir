// Test pour vérifier le calcul dynamique de l'espace du cachet
// selon le nombre d'articles dans un bon

const testBonWithManyItems = {
  id: 999,
  type: 'Sortie',
  numero: 'SOR99',
  date_creation: new Date().toISOString(),
  client_id: 1,
  statut: 'Validé',
  montant_total: 5000,
  items: Array.from({ length: 15 }, (_, i) => ({
    id: i + 1,
    product_id: i + 1,
    quantite: Math.floor(Math.random() * 10) + 1,
    prix_unitaire: (Math.random() * 100 + 10).toFixed(2),
    total: 0,
    designation: `Article de test numéro ${i + 1} avec description longue pour tester l'affichage`
  }))
};

// Calculer comme dans le composant (format A4 fixe)
const items = testBonWithManyItems.items;
const itemsCount = items.length;
const size = 'A4'; // Format fixé à A4
const baseHeight = 48; // Format A4
const increment = 6; // Format A4
const maxHeight = 180; // Format A4
const dynamicSpacerHeight = Math.min(maxHeight, Math.max(baseHeight, baseHeight + Math.max(0, itemsCount - 5) * increment));
const isNewPage = itemsCount > 25; // A4

console.log('=== TEST CACHET DYNAMIQUE (FORMAT A4 FIXE) ===');
console.log(`Format: ${size}`);
console.log(`Nombre d'articles: ${itemsCount}`);
console.log(`Hauteur du spacer: ${dynamicSpacerHeight}mm`);
console.log(`Espace supplémentaire: ${dynamicSpacerHeight - baseHeight}mm`);
console.log(`Nouvelle page forcée: ${isNewPage ? 'OUI' : 'NON'}`);

if (itemsCount <= 5) {
  console.log('✅ Pas d\'ajustement nécessaire (≤ 5 articles)');
} else if (itemsCount > 25) {
  console.log('📄 Cachet sur nouvelle page (>25 articles)');
} else {
  console.log(`⚡ Ajustement appliqué (+${(itemsCount - 5) * increment}mm pour ${itemsCount - 5} articles supplémentaires)`);
}

console.log('\n=== SIMULATION DIFFÉRENTS NOMBRES D\'ARTICLES (A4) ===');
for (let count of [3, 5, 8, 12, 20, 30]) {
  const height = Math.min(maxHeight, Math.max(baseHeight, baseHeight + Math.max(0, count - 5) * increment));
  const newPage = count > 25;
  console.log(`${count} articles → ${height}mm de spacer ${newPage ? '(Nouvelle page)' : ''}`);
}