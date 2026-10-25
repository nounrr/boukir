import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, RotateCcw, Save } from 'lucide-react';
import { type ProjetLine, useSaveProjetDevisMutation } from '../../store/api/projetsApi';
import LinesEditor, { type EditableLine, lineTotal, linesTotal, newLine, toNumber } from './LinesEditor';
import { ErrorBanner, errorMessage, formatMoney, formatQty, primaryButton, secondaryButton } from './shared';
import TablePrintButton from './TablePrintButton';

const fromServer = (lines: ProjetLine[]) => lines.map((l) => newLine({
  designation: l.designation,
  unite: l.unite ?? '',
  quantite: String(l.quantite),
  prix_unitaire: String(l.prix_unitaire),
}));

const signature = (lines: EditableLine[]) => JSON.stringify(lines.map((l) => [l.designation.trim(), l.unite.trim(), toNumber(l.quantite), toNumber(l.prix_unitaire)]));

const DevisTab: React.FC<{ projetId: number; projetNom: string; devis: ProjetLine[] }> = ({ projetId, projetNom, devis }) => {
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
        <div className="flex flex-wrap items-center gap-2">
          <TablePrintButton disabled={!lines.length} report={{
            projectName: projetNom,
            title: 'Devis du projet',
            notes: dirty ? ['Brouillon — modifications non enregistrées.'] : [],
            tables: [{
              columns: [{ label: '#' }, { label: 'Désignation' }, { label: 'Unité' }, { label: 'Quantité', numeric: true }, { label: 'Prix unitaire', numeric: true }, { label: 'Total', numeric: true }],
              rows: lines.map((line, index) => [index + 1, line.designation, line.unite || '—', formatQty(toNumber(line.quantite)), formatMoney(toNumber(line.prix_unitaire)), formatMoney(lineTotal(line))]),
              totals: [['Total du devis', '', '', '', '', formatMoney(linesTotal(lines))]],
            }],
          }} />
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
