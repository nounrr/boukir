#!/usr/bin/env node

/**
 * Test pour vérifier les fuseaux horaires et l'heure du Maroc
 */

import { getCurrentMoroccoTime, getCurrentMoroccoTimeString, getCurrentMoroccoDayOfWeek, checkAccessWithMoroccoTime, getTimezoneDebugInfo } from './backend/utils/timeUtils.js';

console.log('🕐 Test des fuseaux horaires - Système d\'horaires d\'accès\n');

// Informations générales
console.log('📍 Fuseau horaire du serveur:', process.env.TZ || 'Non défini');
console.log('🌍 Fuseau horaire système:', Intl.DateTimeFormat().resolvedOptions().timeZone);

// Informations détaillées
const debugInfo = getTimezoneDebugInfo();
console.log('\n📊 Informations détaillées:');
console.log('┌─────────────────────────────────────────────────────────────┐');
console.log('│ Heure du serveur (locale):                                 │');
console.log(`│ - ISO: ${debugInfo.serverLocalTime.iso.padEnd(25)} │`);
console.log(`│ - Chaîne: ${debugInfo.serverLocalTime.timeString.padEnd(21)} │`);
console.log(`│ - Offset: ${debugInfo.serverLocalTime.timezoneOffset.toString().padEnd(21)} minutes │`);
console.log('├─────────────────────────────────────────────────────────────┤');
console.log('│ Heure du Maroc (Africa/Casablanca):                        │');
console.log(`│ - ISO: ${debugInfo.moroccoTime.iso.padEnd(25)} │`);
console.log(`│ - Chaîne: ${debugInfo.moroccoTime.timeString.padEnd(21)} │`);
console.log(`│ - Format HH:MM: ${debugInfo.moroccoTime.formatted.padEnd(16)} │`);
console.log(`│ - Jour semaine: ${debugInfo.moroccoTime.dayOfWeek.toString().padEnd(16)} (1=Lun, 7=Dim) │`);
console.log('├─────────────────────────────────────────────────────────────┤');
console.log('│ Comparaison:                                                │');
console.log(`│ - Différence: ${debugInfo.comparison.timeDifferenceMinutes.toString().padEnd(18)} minutes │`);
console.log(`│ - Serveur TZ: ${debugInfo.comparison.serverTimezone.padEnd(18)} │`);
console.log(`│ - Maroc TZ: ${debugInfo.comparison.moroccoTimezone.padEnd(20)} │`);
console.log('└─────────────────────────────────────────────────────────────┘');

// Test de vérification d'accès
console.log('\n🔐 Test de vérification d\'accès:');
const accessTest1 = checkAccessWithMoroccoTime('08:00', '19:00', [1,2,3,4,5]);
console.log('- Horaire bureau (08:00-19:00, Lun-Ven):');
console.log(`  ✓ Accès: ${accessTest1.hasAccess ? '✅ Autorisé' : '❌ Refusé'}`);
console.log(`  ✓ Raison: ${accessTest1.reason}`);
console.log(`  ✓ Heure actuelle: ${accessTest1.currentTime}`);
console.log(`  ✓ Jour actuel: ${accessTest1.currentDay}`);

const accessTest2 = checkAccessWithMoroccoTime('07:00', '07:30', [1,2,3,4,5,6,7]);
console.log('\n- Horaire restreint (07:00-07:30, tous les jours):');
console.log(`  ✓ Accès: ${accessTest2.hasAccess ? '✅ Autorisé' : '❌ Refusé'}`);
console.log(`  ✓ Raison: ${accessTest2.reason}`);
console.log(`  ✓ Heure actuelle: ${accessTest2.currentTime}`);

// Avertissement sur le popup automatique
console.log('\n⚠️  IMPORTANT - Configuration du popup:');
console.log('Le popup automatique à 7h a été désactivé.');
console.log('Le popup ne s\'affichera que lors de la vérification manuelle d\'accès.');
console.log('Cliquez sur le bouton 🛡️ dans le header pour vérifier l\'accès manuellement.');

// Instructions pour configurer le serveur
console.log('\n🔧 Configuration recommandée du serveur:');
console.log('Pour s\'assurer que le serveur utilise l\'heure du Maroc:');
console.log('1. Définir la variable d\'environnement: TZ=Africa/Casablanca');
console.log('2. Ou utiliser: export TZ=Africa/Casablanca');
console.log('3. Redémarrer l\'application après la modification');

console.log('\n✅ Test terminé');