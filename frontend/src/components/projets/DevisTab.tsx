import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, RotateCcw, Save } from 'lucide-react';
import { type ProjetLine, useSaveProjetDevisMutation } from '../../store/api/projetsApi';
import LinesEditor, { type EditableLine, newLine, toNumber } from './LinesEditor';
import { ErrorBanner, errorMessage, primaryButton, secondaryButton } from './shared';

const fromServer = (lines: ProjetLine[]) => lines.map((l) => newLine({
  designation: l.designation,
  unite: l.unite ?? '',
  quantite: String(l.quantite),
  prix_unitaire: String(l.prix_unitaire),
}));

const signature = (lines: EditableLine[]) => JSON.stringify(lines.map((l) => [l.designation.trim(), l.unite.trim(), toNumber(l.quantite), toNumber(l.prix_unitaire)]));

const DevisTab: React.FC<{ projetId: number; devis: ProjetLine[] }> = ({ projetId, devis }) => {
  const [save, { isLoading }] = useSaveProjetDevisMutation();
  const [lines, setLines] = useState<EditableLine[]>(() => fromServer(devis));
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const serverSignature = useMemo(() => signature(fromServer(devis)), [devis]);
  const dirty = signature(lines) !== serverSignature;

  // Recharge depuis le serveur quand le devis change et qu'il n'y a rien en cours d'édition.
  useEffect(() => {
    setLines((current) => (signature(current) === serverSignature || !current.length ? fromServer(devis) : current));
  }, [devis, serverSignature]);

  const submit = async () => {
    setError('');
    setSaved(false);
    const payload = lines
      .filter((l) => l.designation.trim() || toNumber(l.prix_unitaire))
      .map((l) => ({ designation: l.designation.trim(), unite: l.unite.trim() || null, quantite: toNumber(l.quantite), prix_unitaire: toNumber(l.prix_unitaire) }));
    try {
      await save({ id: projetId, lignes: payload }).unwrap();
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Devis du projet</h2>
          <p className="text-sm text-slate-500">Désignation, unité, quantité et prix unitaire. Le total se calcule automatiquement.</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && !dirty && <span className="inline-flex items-center gap-1 text-sm text-emerald-700"><Check className="h-4 w-4" /> Enregistré</span>}
          {dirty && (
            <button type="button" className={secondaryButton} onClick={() => setLines(fromServer(devis))} disabled={isLoading}>
              <RotateCcw className="h-4 w-4" /> Annuler
            </button>
          )}
          <button type="button" className={primaryButton} onClick={submit} disabled={isLoading || !dirty}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer le devis
          </button>
        </div>
      </div>
      <ErrorBanner message={error} />
      <LinesEditor lines={lines} onChange={(next) => { setLines(next); setSaved(false); }} disabled={isLoading} />
    </section>
  );
};

export default DevisTab;
