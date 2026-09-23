import pool from '../db/pool.js';
import { normalizePermissionFlag } from './clientCollaborationPermissions.js';
import { ensureFondCaissePermissionSchema } from './fondCaissePermissions.js';
import { ensureStatsDetailsPermissionSchema } from './statsDetailsPermissions.js';
import { ensureSalePriceCorrectionPermissionSchema } from './salePriceCorrectionPermissions.js';

/**
 * Registre unique des autorisations par page.
 *
 * Chaque entree decrit un drapeau deja stocke sur la table `employees`. Les
 * anciennes pages d'autorisation (collaboration clients, avis Maalem, absences,
 * fond de caisse, statistiques detaillees) restent fonctionnelles : elles
 * lisent et ecrivent exactement les memes colonnes. Cette page centralisee est
 * une seconde porte d'entree, pas un second stockage.
 *
 * Pour ajouter une page :
 *  1. ajouter la colonne sur `employees` (migration + ensure*Schema) ;
 *  2. ajouter une entree `permissions` dans le groupe correspondant ;
 *  3. rien d'autre : l'API et l'ecran PDG s'adaptent automatiquement.
 */
export const PAGE_PERMISSION_GROUPS = Object.freeze([
  {
    key: 'clients',
    label: 'Clients · commentaires & rappels',
    page: 'Fiches contacts',
    href: '/contacts',
    description:
      "Collaboration sur les fiches clients : commentaires internes et rappels de suivi.",
    legacyPage: '/employees/client-collaboration-permissions',
    permissions: [
      {
        key: 'commentaires_clients',
        column: 'acces_commentaires_clients',
        label: 'Commentaires clients',
        description: 'Lire et ecrire les commentaires internes sur les fiches clients.',
      },
      {
        key: 'rappels_clients',
        column: 'acces_rappels_clients',
        label: 'Rappels clients',
        description: 'Creer et suivre les rappels programmes sur les fiches clients.',
      },
    ],
  },
  {
    key: 'maalem_reviews',
    label: 'Avis Maalem',
    page: 'Avis Maalem',
    href: '/maalem-reviews',
    description:
      "Moderation des avis laisses sur les maalems. Reserve aux roles Manager et ManagerPlus.",
    legacyPage: '/employees/maalem-review-permissions',
    allowedRoles: ['Manager', 'ManagerPlus'],
    permissions: [
      {
        key: 'view',
        column: 'acces_avis_maalem',
        label: 'Consulter les avis',
        description: 'Ouvrir la page des avis. Requis par les trois droits suivants.',
      },
      {
        key: 'moderate',
        column: 'moderation_avis_maalem',
        label: 'Moderer',
        description: 'Publier, masquer ou rejeter un avis.',
        requires: 'view',
      },
      {
        key: 'restore',
        column: 'restauration_avis_maalem',
        label: 'Restaurer',
        description: 'Restaurer un avis precedemment supprime.',
        requires: 'view',
      },
      {
        key: 'view_private_details',
        column: 'details_prives_avis_maalem',
        label: 'Details prives',
        description: "Voir les coordonnees de l'auteur d'un avis.",
        requires: 'view',
      },
    ],
  },
  {
    key: 'absences',
    label: 'Absences',
    page: 'Absences',
    href: '/absences',
    description: "Pointage des absences et statistiques associees.",
    legacyPage: '/absences',
    permissions: [
      {
        key: 'gestion',
        column: 'acces_gestion_absences',
        label: 'Gerer les absences',
        description: 'Marquer, modifier et supprimer les absences.',
      },
      {
        key: 'statistiques',
        column: 'acces_statistiques_absences',
        label: "Statistiques d'absences",
        description: "Consulter la page de statistiques d'absences.",
      },
    ],
  },
  {
    key: 'fond_caisse',
    label: 'Fond de caisse',
    page: 'Fond de caisse',
    href: '/fond-caisse',
    description:
      "L'employe autorise saisit uniquement le fond initial. Les donnees, calculs et details restent reserves au PDG.",
    legacyPage: '/fond-caisse',
    permissions: [
      {
        key: 'ouverture',
        column: 'acces_ouverture_fond_caisse',
        label: 'Ouvrir le fond initial',
        description: 'Saisir le montant, le mode et la date du fond initial de la caisse.',
      },
    ],
  },
  {
    key: 'sale_price_corrections',
    label: 'Correction prix ventes',
    page: 'Correction prix ventes',
    href: '/products/sale-price-corrections',
    description: 'Consulter et corriger les prix de vente 1 et 2 des produits.',
    allowedRoles: ['ManagerPlus', 'Manager', 'Employé', 'Chauffeur'],
    permissions: [
      {
        key: 'access',
        column: 'acces_correction_prix_vente',
        label: 'Accéder et corriger',
        description: 'Ouvrir la page, appliquer des corrections et remettre une ligne à corriger.',
      },
    ],
  },
  {
    key: 'stats_details',
    label: 'Statistiques detaillees',
    page: 'Statistiques detaillees',
    href: '/reports/details',
    description:
      'Matrices produits et clients : quantites, montants, remises et profits.',
    legacyPage: '/reports/details',
    permissions: [
      {
        key: 'consultation',
        column: 'acces_statistiques_details',
        label: 'Consulter la page',
        description: 'Ouvrir la page et lire les matrices produits / clients.',
      },
    ],
  },
]);

// Index plat : "groupe.permission" -> { group, permission }.
export const PAGE_PERMISSION_INDEX = Object.freeze(
  PAGE_PERMISSION_GROUPS.reduce((acc, group) => {
    group.permissions.forEach((permission) => {
      acc[`${group.key}.${permission.key}`] = { group, permission };
    });
    return acc;
  }, {})
);

export const PAGE_PERMISSION_COLUMNS = Object.freeze(
  PAGE_PERMISSION_GROUPS.flatMap((group) => group.permissions.map((p) => p.column))
);

/** Le catalogue envoye au front : metadonnees seules, aucune valeur employe. */
export function getPagePermissionCatalog() {
  return PAGE_PERMISSION_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    page: group.page,
    href: group.href,
    description: group.description,
    legacyPage: group.legacyPage,
    allowedRoles: group.allowedRoles || null,
    permissions: group.permissions.map((permission) => ({
      key: permission.key,
      label: permission.label,
      description: permission.description,
      requires: permission.requires || null,
    })),
  }));
}

/** Un role peut-il recevoir les droits de ce groupe ? Le PDG a tout d'office. */
export function isGroupApplicableToRole(group, role) {
  if (!role) return false;
  if (role === 'PDG') return true;
  if (!group.allowedRoles) return true;
  return group.allowedRoles.includes(role);
}

/**
 * Etat des autorisations d'un employe, groupe par page.
 * Reproduit exactement les regles des normalizers existants : le PDG a tout,
 * un compte client n'a rien, un role hors `allowedRoles` n'a rien.
 */
export function normalizePagePermissions(employee) {
  const role = employee?.role || null;
  const isClientAccount = employee?.type_compte != null;
  const isPdg = role === 'PDG';

  return PAGE_PERMISSION_GROUPS.reduce((acc, group) => {
    const applicable = !isClientAccount && isGroupApplicableToRole(group, role);
    acc[group.key] = group.permissions.reduce((flags, permission) => {
      if (!applicable) flags[permission.key] = false;
      else if (isPdg) flags[permission.key] = true;
      else flags[permission.key] = normalizePermissionFlag(employee?.[permission.column]);
      return flags;
    }, {});
    return acc;
  }, {});
}

/**
 * Valide une mise a jour partielle envoyee par le PDG.
 * `body.permissions` est un objet plat { "groupe.permission": booleen }.
 * Les dependances (`requires`) sont verifiees contre l'etat resultant, afin
 * qu'un droit ne puisse jamais rester actif sans son prerequis.
 */
export function parsePagePermissionUpdate(body, employee) {
  const updates = body?.permissions;
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return { valid: false, error: 'Le champ permissions doit etre un objet.' };
  }

  const entries = Object.entries(updates);
  if (entries.length === 0) {
    return { valid: false, error: 'Aucune permission a mettre a jour.' };
  }

  const current = normalizePagePermissions(employee);
  const next = JSON.parse(JSON.stringify(current));
  const columns = [];

  for (const [path, value] of entries) {
    if (typeof value !== 'boolean') {
      return { valid: false, error: `La permission ${path} doit etre un booleen.` };
    }
    const entry = PAGE_PERMISSION_INDEX[path];
    if (!entry) {
      return { valid: false, error: `Permission inconnue : ${path}.` };
    }
    if (!isGroupApplicableToRole(entry.group, employee?.role)) {
      return {
        valid: false,
        error: `Le role ${employee?.role} ne peut pas recevoir les droits « ${entry.group.label} ».`,
      };
    }
    next[entry.group.key][entry.permission.key] = value;
    columns.push({ column: entry.permission.column, value });
  }

  // Dependances : un droit fils ne survit pas a la perte de son parent.
  for (const group of PAGE_PERMISSION_GROUPS) {
    for (const permission of group.permissions) {
      if (!permission.requires) continue;
      if (next[group.key][permission.key] && !next[group.key][permission.requires]) {
        const parent = group.permissions.find((p) => p.key === permission.requires);
        return {
          valid: false,
          error: `« ${parent?.label || permission.requires} » est requis pour « ${permission.label} ».`,
        };
      }
    }
  }

  return { valid: true, columns, permissions: next };
}

/** Garantit que toutes les colonnes du registre existent avant lecture. */
export async function ensurePagePermissionSchema(db = pool) {
  await ensureFondCaissePermissionSchema(db);
  await ensureStatsDetailsPermissionSchema(db);
  await ensureSalePriceCorrectionPermissionSchema(db);
}
