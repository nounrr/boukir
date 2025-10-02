import pool from './db/pool.js';

async function testSoftDeleteAuth() {
  try {
    console.log('🧪 Test du système de soft delete des employés...\n');
    
    // 1. Vérifier les employés actifs
    console.log('📋 1. Employés actifs:');
    const [activeEmployees] = await pool.query(
      'SELECT id, nom_complet, cin, role FROM employees WHERE deleted_at IS NULL ORDER BY id'
    );
    
    if (activeEmployees.length === 0) {
      console.log('   ❌ Aucun employé actif trouvé');
      return;
    }
    
    activeEmployees.forEach(emp => {
      console.log(`   ✅ ID: ${emp.id} - ${emp.nom_complet || emp.cin} (${emp.role})`);
    });
    
    // 2. Vérifier les employés supprimés
    console.log('\n📋 2. Employés archivés:');
    const [deletedEmployees] = await pool.query(
      'SELECT id, nom_complet, cin, role, deleted_at FROM employees WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC'
    );
    
    if (deletedEmployees.length === 0) {
      console.log('   ✅ Aucun employé archivé');
    } else {
      deletedEmployees.forEach(emp => {
        console.log(`   🗑️  ID: ${emp.id} - ${emp.nom_complet || emp.cin} (${emp.role}) - Supprimé le ${new Date(emp.deleted_at).toLocaleString('fr-FR')}`);
      });
    }
    
    // 3. Test de la requête d'authentification
    console.log('\n🔐 3. Test requête d\'authentification:');
    
    if (activeEmployees.length > 0) {
      const firstEmployee = activeEmployees[0];
      console.log(`   Test avec employé actif (CIN: ${firstEmployee.cin})`);
      
      const [authTestActive] = await pool.query(
        'SELECT id, nom_complet, cin, role FROM employees WHERE cin = ? AND deleted_at IS NULL',
        [firstEmployee.cin]
      );
      
      if (authTestActive.length > 0) {
        console.log('   ✅ Employé actif peut se connecter');
      } else {
        console.log('   ❌ Erreur: Employé actif ne peut pas se connecter');
      }
    }
    
    if (deletedEmployees.length > 0) {
      const deletedEmployee = deletedEmployees[0];
      console.log(`   Test avec employé supprimé (CIN: ${deletedEmployee.cin})`);
      
      const [authTestDeleted] = await pool.query(
        'SELECT id, nom_complet, cin, role FROM employees WHERE cin = ? AND deleted_at IS NULL',
        [deletedEmployee.cin]
      );
      
      if (authTestDeleted.length === 0) {
        console.log('   ✅ Employé supprimé ne peut pas se connecter (correct)');
      } else {
        console.log('   ❌ Erreur: Employé supprimé peut encore se connecter');
      }
    }
    
    // 4. Statistiques
    console.log('\n📊 4. Statistiques:');
    const [stats] = await pool.query(`
      SELECT 
        COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) as actifs,
        COUNT(CASE WHEN deleted_at IS NOT NULL THEN 1 END) as archives,
        COUNT(*) as total
      FROM employees
    `);
    
    const stat = stats[0];
    console.log(`   👥 Employés actifs: ${stat.actifs}`);
    console.log(`   🗑️  Employés archivés: ${stat.archives}`);
    console.log(`   📈 Total: ${stat.total}`);
    
    console.log('\n✅ Test terminé avec succès!');
    
  } catch (error) {
    console.error('❌ Erreur lors du test:', error);
  } finally {
    await pool.end();
  }
}

testSoftDeleteAuth();