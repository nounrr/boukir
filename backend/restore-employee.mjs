import pool from './db/pool.js';

async function restoreEmployee() {
  try {
    // Obtenir la liste des employés supprimés
    const [deletedEmployees] = await pool.query(
      'SELECT id, nom_complet, cin, deleted_at FROM employees WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC'
    );
    
    console.log('📋 Employés supprimés trouvés:');
    if (deletedEmployees.length === 0) {
      console.log('   Aucun employé supprimé trouvé.');
      return;
    }
    
    deletedEmployees.forEach((emp, index) => {
      console.log(`   ${index + 1}. ID: ${emp.id} - ${emp.nom_complet || emp.cin} (supprimé le ${new Date(emp.deleted_at).toLocaleString('fr-FR')})`);
    });
    
    console.log('\n⚠️  Pour restaurer un employé, utilisez la fonction restoreEmployeeById(id)');
    console.log('   Exemple: await restoreEmployeeById(5)');
    
  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await pool.end();
  }
}

async function restoreEmployeeById(employeeId) {
  try {
    console.log(`🔄 Restauration de l'employé ID: ${employeeId}...`);
    
    // Vérifier que l'employé existe et est bien supprimé
    const [employee] = await pool.query(
      'SELECT id, nom_complet, cin, deleted_at FROM employees WHERE id = ?',
      [employeeId]
    );
    
    if (employee.length === 0) {
      console.log('❌ Employé introuvable.');
      return;
    }
    
    if (!employee[0].deleted_at) {
      console.log('⚠️  Cet employé n\'est pas supprimé.');
      return;
    }
    
    // Restaurer l'employé
    const now = new Date();
    await pool.query(
      'UPDATE employees SET deleted_at = NULL, updated_at = ? WHERE id = ?',
      [now, employeeId]
    );
    
    console.log(`✅ Employé "${employee[0].nom_complet || employee[0].cin}" restauré avec succès.`);
    
  } catch (error) {
    console.error('❌ Erreur lors de la restauration:', error);
  }
}

// Exporter les fonctions pour utilisation
export { restoreEmployee, restoreEmployeeById };

// Si le script est exécuté directement, afficher les employés supprimés
if (import.meta.url === `file://${process.argv[1]}`) {
  restoreEmployee();
}