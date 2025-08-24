import { useState } from 'react';
import * as XLSX from 'xlsx';

type Product = {
  id: number;
  designation: string | null;
  quantite: number | null;
  kg: number | null;
  prix_achat: number | null;
  cout_revient_pourcentage: number | null;
  cout_revient: number | null;
  prix_gros_pourcentage: number | null;
  prix_gros: number | null;
  prix_vente_pourcentage: number | null;
  prix_vente: number | null;
};

export default function ExportProducts() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const exportExcel = async () => {
    try {
      setError('');
      setLoading(true);
      const res = await fetch('/api/products');
      const data: Product[] = await res.json();

      // Map to exportable rows with stable headers matching our import tool
      const rows = data.map((p) => ({
        id: p.id,
        designation: p.designation ?? '',
        quantite: p.quantite ?? 0,
        prix_achat: p.prix_achat ?? 0,
        cout_revient_pourcentage: p.cout_revient_pourcentage ?? 0,
        cout_revient: p.cout_revient ?? 0,
        prix_gros_pourcentage: p.prix_gros_pourcentage ?? 0,
        prix_gros: p.prix_gros ?? 0,
        prix_vente_pourcentage: p.prix_vente_pourcentage ?? 0,
        prix_vente: p.prix_vente ?? 0,
        kg: p.kg ?? null,
      }));

      const ws = XLSX.utils.json_to_sheet(rows, {
        header: [
          'id',
          'designation',
          'quantite',
          'prix_achat',
          'cout_revient_pourcentage',
          'cout_revient',
          'prix_gros_pourcentage',
          'prix_gros',
          'prix_vente_pourcentage',
          'prix_vente',
          'kg',
        ],
        skipHeader: false,
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'produits');
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      XLSX.writeFile(wb, `export-produits-${ts}.xlsx`);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <h3>Exporter produits (Excel)</h3>
      <p>Exporte toutes les colonnes compatibles avec la ré-importation (incluant id et kg).</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <button onClick={exportExcel} disabled={loading}>
          {loading ? 'Génération…' : 'Exporter en Excel'}
        </button>
        {error && <span style={{ color: 'crimson' }}>Erreur: {error}</span>}
      </div>
    </div>
  );
}
