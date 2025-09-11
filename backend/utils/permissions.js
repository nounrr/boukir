export function canManageBon(type, role) {
  if (!role) return false;
  if (role === 'PDG') return true;
  if (role === 'Manager' && (type === 'Commande' || type === 'AvoirFournisseur')) return true;
  return false;
}

export function canValidate(type, role) {
  // For Commande & AvoirFournisseur: Manager or PDG can validate; others PDG only
  if (type === 'Commande' || type === 'AvoirFournisseur') {
    return role === 'PDG' || role === 'Manager';
  }
  return role === 'PDG';
}
