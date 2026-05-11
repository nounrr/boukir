import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUpdateBonMutation } from '../store/api/bonsApi';
import { normalizeDateTimeToMySQL } from '../utils/dateUtils';
import { showError, showSuccess } from '../utils/notifications';

export type RemiseEligibleBonType = 'Sortie' | 'Comptant';

export interface RemiseEligibleItem {
  id: string;                                  // `${kind}-${bonId}-item-${headSourceItemId}`
  bon_id: number;
  bon_type: RemiseEligibleBonType;
  product_id: number;
  product_reference?: string | null;
  reference?: string | null;
  quantite: number;                            // somme des quantités du groupe
  remise_montant?: number;                     // valeur courante affichée (1ère ligne du groupe)
  /**
   * Liste des item-ids natifs (sortie_items.id / comptant_items.id) à modifier
   * lorsque le groupe contient plusieurs lignes natives.
   */
  sourceItemIds?: number[];
}

export interface RemiseEditorContact {
  id: number;
  nom_complet?: string | null;
  telephone?: string | null;
  rib?: string | null;
}

export interface UseRemiseEditorParams {
  contact: RemiseEditorContact | null;
  enabled: boolean;
  visibleItems: RemiseEligibleItem[];
  sorties: any[];                              // history.sorties (bons complets)
  comptants: any[];                            // history.comptants
  onSaved?: () => Promise<void> | void;
}

export function useRemiseEditor(params: UseRemiseEditorParams) {
  const { contact, enabled, visibleItems, sorties, comptants, onSaved } = params;

  const [showRemiseMode, setShowRemiseMode] = useState(false);
  const [remisePrices, setRemisePrices] = useState<Record<string, number>>({});
  const [selectedItemsForRemise, setSelectedItemsForRemise] = useState<Set<string>>(new Set());

  const [updateBonMutation] = useUpdateBonMutation();

  // ────────────── helpers ──────────────

  const isEligible = useCallback((item: RemiseEligibleItem | null | undefined) => {
    if (!item) return false;
    return item.bon_type === 'Sortie' || item.bon_type === 'Comptant';
  }, []);

  const eligibleItems = useMemo(
    () => visibleItems.filter((i) => isEligible(i)),
    [visibleItems, isEligible]
  );

  // Pré-remplir les inputs avec le `remise_montant` actuellement sur la ligne
  useEffect(() => {
    if (!enabled || !showRemiseMode) return;
    const eligibleIds = new Set(eligibleItems.map((i) => String(i.id)));
    const preset = new Map<string, number>();
    for (const item of eligibleItems) {
      const cur = Number(item.remise_montant ?? 0) || 0;
      if (cur > 0) preset.set(String(item.id), cur);
    }
    setSelectedItemsForRemise((prev) => {
      const next = new Set(Array.from(prev).filter((id) => eligibleIds.has(String(id))));
      for (const id of preset.keys()) next.add(id);
      return next.size === prev.size && Array.from(next).every((x) => prev.has(x)) ? prev : next;
    });
    setRemisePrices((prev) => {
      const next: Record<string, number> = Object.fromEntries(
        Object.entries(prev).filter(([id]) => eligibleIds.has(String(id)))
      );
      for (const [id, price] of preset.entries()) {
        if (next[id] == null) next[id] = price;
      }
      return Object.keys(next).length === Object.keys(prev).length &&
        Object.entries(next).every(([k, v]) => prev[k] === v) ? prev : next;
    });
  }, [enabled, showRemiseMode, eligibleItems]);

  // ────────────── actions UI ──────────────

  const enterMode = useCallback(() => {
    setRemisePrices({});
    setSelectedItemsForRemise(new Set());
    setShowRemiseMode(true);
  }, []);

  const cancelMode = useCallback(() => {
    setShowRemiseMode(false);
    setRemisePrices({});
    setSelectedItemsForRemise(new Set());
  }, []);

  const setItemPrice = useCallback((itemId: string, value: number) => {
    const id = String(itemId);
    setRemisePrices((prev) => ({ ...prev, [id]: value }));
    if (value > 0) {
      setSelectedItemsForRemise((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    } else {
      setSelectedItemsForRemise((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const clearSelection = useCallback(() => {
    setRemisePrices({});
    setSelectedItemsForRemise(new Set());
  }, []);

  // ────────────── construction du payload PATCH bon ──────────────

  const buildUpdatedBonPayload = useCallback(
    (sourceBon: any, bonType: RemiseEligibleBonType, targetItemIds: number[], prixRemise: number) => {
      const targetSet = new Set(targetItemIds.map((id) => Number(id)));
      let updatedLines = 0;

      const updatedItems = (Array.isArray(sourceBon?.items) ? sourceBon.items : []).map((line: any) => {
        const isTarget = targetSet.has(Number(line?.id));
        if (isTarget) updatedLines += 1;
        const quantite = Number(line?.quantite || 0) || 0;
        const prixUnitaire = Number(line?.prix_unitaire || 0) || 0;
        return {
          product_id: Number(line?.product_id),
          variant_id: line?.variant_id != null && line?.variant_id !== '' ? Number(line.variant_id) : null,
          unit_id: line?.unit_id != null && line?.unit_id !== '' ? Number(line.unit_id) : null,
          quantite,
          prix_unitaire: prixUnitaire,
          remise_pourcentage: isTarget ? 0 : (Number(line?.remise_pourcentage || 0) || 0),
          remise_montant: isTarget ? prixRemise : (Number(line?.remise_montant || 0) || 0),
          total: quantite * prixUnitaire,
          product_snapshot_id: line?.product_snapshot_id != null && line?.product_snapshot_id !== ''
            ? Number(line.product_snapshot_id)
            : null,
          is_indisponible: Boolean(line?.is_indisponible),
        };
      });

      if (updatedLines === 0) {
        throw new Error(`Aucune ligne cible trouvée dans le bon ${bonType} #${sourceBon?.id}`);
      }

      const payload: any = {
        id: Number(sourceBon.id),
        type: bonType,
        date_creation: normalizeDateTimeToMySQL(sourceBon.date_creation) || sourceBon.date_creation,
        vehicule_id:
          sourceBon.vehicule_id != null && sourceBon.vehicule_id !== ''
            ? Number(sourceBon.vehicule_id)
            : undefined,
        lieu_chargement: sourceBon.lieu_chargement || '',
        adresse_livraison: sourceBon.adresse_livraison || '',
        phone: sourceBon.phone || null,
        isNotCalculated: sourceBon.isNotCalculated ? true : null,
        statut: sourceBon.statut || 'Brouillon',
        montant_total: updatedItems.reduce((sum: number, line: any) => sum + (Number(line.total) || 0), 0),
        // Force la remise à être créditée au client du bon (équivalent
        // case "même client du bon" cochée à la création).
        remise_is_client: 1,
        remise_id: null,
        items: updatedItems,
        livraisons:
          Array.isArray(sourceBon?.livraisons) && sourceBon.livraisons.length > 0
            ? sourceBon.livraisons
                .map((liv: any) => ({
                  vehicule_id: liv?.vehicule_id != null ? Number(liv.vehicule_id) : undefined,
                  user_id: liv?.user_id != null ? Number(liv.user_id) : null,
                }))
                .filter((liv: any) => liv.vehicule_id)
            : undefined,
      };

      if (bonType === 'Sortie') {
        payload.client_id =
          sourceBon.client_id != null && sourceBon.client_id !== ''
            ? Number(sourceBon.client_id)
            : undefined;
      }
      if (bonType === 'Comptant') {
        payload.client_nom = sourceBon.client_nom || null;
        payload.reste = Number(sourceBon.reste || 0) || 0;
        payload.non_paye = Boolean(sourceBon.non_paye);
      }
      return payload;
    },
    []
  );

  // ────────────── validation ──────────────

  const handleValidate = useCallback(async () => {
    console.group('%c[useRemiseEditor] handleValidate (bon-line mode)', 'color:#ea580c;font-weight:bold');
    console.log('Contact:', contact);
    console.log('selectedItemsForRemise:', Array.from(selectedItemsForRemise));
    console.log('remisePrices:', remisePrices);

    if (!contact) {
      console.warn('Pas de contact');
      console.groupEnd();
      showError('Aucun contact sélectionné');
      return;
    }
    if (selectedItemsForRemise.size === 0) {
      console.warn('Aucune sélection');
      console.groupEnd();
      showError('Aucune remise à enregistrer');
      return;
    }

    try {
      const toApply = Array.from(selectedItemsForRemise)
        .map((id) => {
          const itemId = String(id);
          const item = eligibleItems.find((p) => String(p.id) === itemId);
          if (!item) return null;
          const prixRemise = Number(remisePrices[itemId] ?? 0) || 0;
          return { item, prixRemise };
        })
        .filter(Boolean) as Array<{ item: RemiseEligibleItem; prixRemise: number }>;

      console.log('toApply:', toApply.map(({ item, prixRemise }) => ({
        id: item.id,
        bon_id: item.bon_id,
        bon_type: item.bon_type,
        product_id: item.product_id,
        quantite_groupe: item.quantite,
        sourceItemIds: item.sourceItemIds,
        prixRemise,
        totalAttendu: prixRemise * item.quantite,
      })));

      if (toApply.length === 0) {
        console.warn('Rien à appliquer');
        console.groupEnd();
        showError('Aucune remise valide');
        return;
      }

      // Regrouper par bon (un seul PATCH par bon, mettant à jour toutes les
      // lignes ciblées avec leur prix respectif).
      type Patch = { bon: any; bonType: RemiseEligibleBonType; updates: Map<number, number> };
      const patches = new Map<string, Patch>();

      for (const { item, prixRemise } of toApply) {
        const list = item.bon_type === 'Sortie' ? sorties : comptants;
        const sourceBon = list.find((b: any) => Number(b?.id) === Number(item.bon_id));
        if (!sourceBon) {
          console.error(`Bon ${item.bon_type} introuvable (#${item.bon_id})`);
          continue;
        }
        const key = `${item.bon_type}-${item.bon_id}`;
        if (!patches.has(key)) {
          patches.set(key, { bon: sourceBon, bonType: item.bon_type, updates: new Map() });
        }
        const patch = patches.get(key)!;
        const ids = item.sourceItemIds && item.sourceItemIds.length > 0
          ? item.sourceItemIds
          : [Number(String(item.id).split('-').pop())];
        for (const lineId of ids) {
          patch.updates.set(Number(lineId), prixRemise);
        }
      }

      // Construire et envoyer un payload par bon. Le payload reprend toutes les
      // lignes du bon ; pour chaque (lineId → prixRemise) on met remise_montant.
      for (const [key, patch] of patches) {
        const targetIds = Array.from(patch.updates.keys());
        // Build payload: for lines in updates, use the corresponding prix; for others, keep their own remise_montant.
        const updatedItems = (Array.isArray(patch.bon?.items) ? patch.bon.items : []).map((line: any) => {
          const lineId = Number(line?.id);
          const newRemise = patch.updates.has(lineId)
            ? patch.updates.get(lineId)!
            : (Number(line?.remise_montant || 0) || 0);
          const quantite = Number(line?.quantite || 0) || 0;
          const prixUnitaire = Number(line?.prix_unitaire || 0) || 0;
          return {
            product_id: Number(line?.product_id),
            variant_id: line?.variant_id != null && line?.variant_id !== '' ? Number(line.variant_id) : null,
            unit_id: line?.unit_id != null && line?.unit_id !== '' ? Number(line.unit_id) : null,
            quantite,
            prix_unitaire: prixUnitaire,
            remise_pourcentage: patch.updates.has(lineId) ? 0 : (Number(line?.remise_pourcentage || 0) || 0),
            remise_montant: newRemise,
            total: quantite * prixUnitaire,
            product_snapshot_id: line?.product_snapshot_id != null && line?.product_snapshot_id !== ''
              ? Number(line.product_snapshot_id)
              : null,
            is_indisponible: Boolean(line?.is_indisponible),
          };
        });

        const payload: any = {
          id: Number(patch.bon.id),
          type: patch.bonType,
          date_creation: normalizeDateTimeToMySQL(patch.bon.date_creation) || patch.bon.date_creation,
          vehicule_id:
            patch.bon.vehicule_id != null && patch.bon.vehicule_id !== ''
              ? Number(patch.bon.vehicule_id)
              : undefined,
          lieu_chargement: patch.bon.lieu_chargement || '',
          adresse_livraison: patch.bon.adresse_livraison || '',
          phone: patch.bon.phone || null,
          isNotCalculated: patch.bon.isNotCalculated ? true : null,
          statut: patch.bon.statut || 'Brouillon',
          montant_total: updatedItems.reduce((sum: number, line: any) => sum + (Number(line.total) || 0), 0),
          // Force "même client du bon" → la remise est créditée au client du bon
          remise_is_client: 1,
          remise_id: null,
          items: updatedItems,
          livraisons:
            Array.isArray(patch.bon?.livraisons) && patch.bon.livraisons.length > 0
              ? patch.bon.livraisons
                  .map((liv: any) => ({
                    vehicule_id: liv?.vehicule_id != null ? Number(liv.vehicule_id) : undefined,
                    user_id: liv?.user_id != null ? Number(liv.user_id) : null,
                  }))
                  .filter((liv: any) => liv.vehicule_id)
              : undefined,
        };
        if (patch.bonType === 'Sortie') {
          payload.client_id =
            patch.bon.client_id != null && patch.bon.client_id !== ''
              ? Number(patch.bon.client_id)
              : undefined;
        }
        if (patch.bonType === 'Comptant') {
          payload.client_nom = patch.bon.client_nom || null;
          payload.reste = Number(patch.bon.reste || 0) || 0;
          payload.non_paye = Boolean(patch.bon.non_paye);
        }

        console.group(`%cPATCH ${patch.bonType} #${patch.bon.id} (clé=${key})`, 'color:#0369a1');
        console.log('Lignes ciblées (sortie_items.id → prix_remise):',
          Array.from(patch.updates.entries()).map(([lid, pr]) => ({ lineId: lid, prix_remise: pr })));
        console.log('  payload.items:', updatedItems);
        console.log('  payload.montant_total:', payload.montant_total);
        console.log('  remise_is_client = 1 (créditée au client du bon)');
        console.log('  payload complet:', payload);

        const res = await updateBonMutation(payload).unwrap();
        console.log('  ✓ updateBon OK, response:', res);
        console.groupEnd();

        // Avertir si certaines lignes ciblées n'existaient pas dans le bon
        const presentIds = new Set((Array.isArray(patch.bon?.items) ? patch.bon.items : []).map((l: any) => Number(l?.id)));
        const missing = targetIds.filter((id) => !presentIds.has(id));
        if (missing.length > 0) {
          console.warn('  ⚠ ids cibles absents du bon source:', missing);
        }
      }

      console.log('%c=== Toutes les opérations terminées ===', 'color:#16a34a;font-weight:bold');
      console.groupEnd();
      showSuccess(`${toApply.length} remise(s) enregistrée(s)`);
      setShowRemiseMode(false);
      setRemisePrices({});
      setSelectedItemsForRemise(new Set());
      if (onSaved) await onSaved();
    } catch (err: any) {
      console.error('Erreur validation remises:', err);
      console.groupEnd();
      showError(err?.data?.message || err?.message || 'Erreur lors de l\'enregistrement des remises');
    }
  }, [
    contact,
    selectedItemsForRemise,
    eligibleItems,
    remisePrices,
    sorties,
    comptants,
    updateBonMutation,
    onSaved,
  ]);

  // Avoid "buildUpdatedBonPayload not used" warning while keeping it exported via closure.
  void buildUpdatedBonPayload;

  return {
    showRemiseMode,
    remisePrices,
    selectedItemsForRemise,
    eligibleItems,
    isEligible,
    enterMode,
    cancelMode,
    setItemPrice,
    clearSelection,
    handleValidate,
  };
}

export type UseRemiseEditorResult = ReturnType<typeof useRemiseEditor>;
