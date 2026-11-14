import { getStatementBalance } from './statementBalance.js';

// The ecommerce statement expresses debt as positive. The backoffice cumulative
// balance uses another sign convention and must not be subtracted from a limit.
export async function getEcommerceCredit(db, contact) {
  const balance = await getStatementBalance(db, contact.id);
  if (balance == null || !Number.isFinite(balance)) {
    throw Object.assign(new Error('Solde client indisponible'), { status: 404 });
  }
  const plafond = contact.plafond == null ? null : Number(contact.plafond);
  const montant_garantie = contact.montant_garantie == null ? null : Number(contact.montant_garantie);
  const limits = [plafond, montant_garantie].filter(value => Number.isFinite(value) && value > 0);
  const limit = limits.length ? Math.round(Math.min(...limits) * 100) / 100 : null;
  return {
    plafond,
    montant_garantie,
    limite_solde: limit,
    solde_cumule: balance,
    solde_available: limit == null ? null : Math.max(0, Math.round((limit - balance) * 100) / 100),
  };
}

export function projectEcommerceCredit(credit, amount) {
  const projected = Math.round((credit.solde_cumule + amount) * 100) / 100;
  return {
    projected,
    exceeded: credit.limite_solde != null && projected > credit.limite_solde,
  };
}
