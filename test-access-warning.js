const mysql = require('mysql2/promise');

async function testAccessWarning() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'boukir'
    });

    try {
        // Trouver un utilisateur existant
        const [users] = await connection.execute('SELECT * FROM employees LIMIT 1');
        if (users.length === 0) {
            console.log('Aucun utilisateur trouvé');
            return;
        }

        const user = users[0];
        console.log('Utilisateur trouvé:', user.nom, user.prenom);

        // Supprimer les anciens horaires pour cet utilisateur
        await connection.execute('DELETE FROM access_schedules WHERE user_id = ?', [user.id]);

        // Calculer l'heure de fin dans 3 minutes (pour tester le warning)
        const now = new Date();
        const endTime = new Date(now.getTime() + 3 * 60 * 1000); // 3 minutes plus tard
        const endTimeStr = endTime.toTimeString().slice(0, 8); // Format HH:MM:SS

        // Créer un horaire d'accès qui expire dans 3 minutes
        const accessSchedule = {
            user_id: user.id,
            user_name: user.nom + ' ' + user.prenom,
            user_role: user.role || 'EMPLOYEE',
            day_of_week: now.getDay(), // Jour actuel (0 = Dimanche, 1 = Lundi, etc.)
            start_time: '00:00:00',
            end_time: endTimeStr,
            is_enabled: 1
        };

        await connection.execute(`
            INSERT INTO access_schedules (user_id, user_name, user_role, day_of_week, start_time, end_time, is_enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            accessSchedule.user_id,
            accessSchedule.user_name,
            accessSchedule.user_role,
            accessSchedule.day_of_week,
            accessSchedule.start_time,
            accessSchedule.end_time,
            accessSchedule.is_enabled
        ]);

        console.log('✅ Horaire d\'accès créé avec succès !');
        console.log('📅 Jour:', accessSchedule.day_of_week);
        console.log('⏰ Fin d\'accès:', endTimeStr);
        console.log('⚠️  L\'utilisateur devrait voir le popup d\'avertissement dans moins de 5 minutes');
        console.log('🔓 Connectez-vous avec cet utilisateur pour tester le popup');

    } catch (error) {
        console.error('Erreur:', error);
    } finally {
        await connection.end();
    }
}

testAccessWarning().catch(console.error);