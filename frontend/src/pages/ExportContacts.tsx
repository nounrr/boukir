import { useState } from 'react';
import * as XLSX from 'xlsx';

type Contact = {
  id: number;
  nom_complet: string | null;
  societe?: string | null;
  type: string | null;
  telephone?: string | null;
  email?: string | null;
  adresse?: string | null;
  rib?: string | null;
  ice?: string | null;
  solde?: number | null;
  plafond?: number | null;
};

export default function ExportContacts() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const exportExcel = async () => {
    try {
      setError('');
      setLoading(true);
      const res = await fetch('/api/contacts');
      const data: Contact[] = await res.json();

      const rows = data.map((c) => ({
        id: c.id,
        nom_complet: c.nom_complet ?? '',
        type: c.type ?? '',
        societe: c.societe ?? '',
        telephone: c.telephone ?? '',
        email: c.email ?? '',
        adresse: c.adresse ?? '',
        rib: c.rib ?? '',
        ice: c.ice ?? '',
        solde: c.solde ?? 0,
        plafond: c.plafond ?? null,
      }));

      const ws = XLSX.utils.json_to_sheet(rows, {
        header: [
          'id',
          'nom_complet',
          'type',
          'societe',
          'telephone',
          'email',
          'adresse',
          'rib',
          'ice',
          'solde',
          'plafond',
        ],
        skipHeader: false,
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'contacts');
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      XLSX.writeFile(wb, `export-contacts-${ts}.xlsx`);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <h3>Exporter contacts (Excel)</h3>
      <p>Exporte les contacts avec les colonnes principales (id inclus pour mise à jour hors-ligne).</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <button onClick={exportExcel} disabled={loading}>
          {loading ? 'Génération…' : 'Exporter en Excel'}
        </button>
        {error && <span style={{ color: 'crimson' }}>Erreur: {error}</span>}
      </div>
    </div>
  );
}
