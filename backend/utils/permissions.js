export function canManageBon(type, role) {
  if (!role) return false;
  if (role === 'PDG' || role === 'ManagerPlus') return true;
  if (role === 'Manager' && (type === 'Commande' || type === 'AvoirFournisseur')) return true;
  return false;
}

export function canValidate(type, role) {
  // For Commande & AvoirFournisseur: Manager, ManagerPlus or PDG can validate; others PDG/ManagerPlus only
  if (type === 'Commande' || type === 'AvoirFournisseur') {
    return role === 'PDG' || role === 'Manager' || role === 'ManagerPlus';
  }
  return role === 'PDG' || role === 'ManagerPlus';
}
