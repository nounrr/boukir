// ImportExcel.tsx
import { useState } from "react";
import * as XLSX from "xlsx";

type Row = {
  id?: number;
  designation?: string;
  quantite?: number;
  prix_achat?: number;
  cout_revient_pourcentage?: number;
  cout_revient?: number;
  prix_gros_pourcentage?: number;
  prix_gros?: number;
  prix_vente_pourcentage?: number;
  prix_vente?: number;
  kg?: number;
};

export default function ImportExcel() {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [preview, setPreview] = useState<Row[]>([]);
  const [status, setStatus] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string>("");

  // Normalise les entêtes possibles (ex: "Désignation" / "designation" / "DESIGNATION")
  const normalizeHeader = (h: string) =>
    String(h || "")
      .trim()
      .toLowerCase()
      .replaceAll("é", "e")
      .replaceAll("è", "e")
      .replaceAll("à", "a")
      .replaceAll("ù", "u")
      .replaceAll("ô", "o")
      .replaceAll("ï", "i")
      .replaceAll("’", "'");

  // Remap des headers vers le schéma attendu
  const headerMap: Record<string, keyof Row> = {
    "id": "id",
    "designation": "designation",
    "désignation": "designation",
    "designation_ar": "designation",
    "quantite": "quantite",
    "quantité": "quantite",
    "qty": "quantite",
    "prix_achat": "prix_achat",
    "pa": "prix_achat",
    "cout_revient_pourcentage": "cout_revient_pourcentage",
    "cr%": "cout_revient_pourcentage",
    "cout_revient": "cout_revient",
    "cr": "cout_revient",
    "prix_gros_pourcentage": "prix_gros_pourcentage",
    "pg%": "prix_gros_pourcentage",
    "prix_gros": "prix_gros",
    "pg": "prix_gros",
    "prix_vente_pourcentage": "prix_vente_pourcentage",
    "pv%": "prix_vente_pourcentage",
    "prix_vente": "prix_vente",
    "pv": "prix_vente",
    // poids / kg
    "kg": "kg",
    "poids": "kg",
    "poids (kg)": "kg",
    "poids(kg)": "kg",
  };

  const coerceNumber = (v: any): number | undefined => {
    if (v === null || v === undefined || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const handleFile = async (f: File) => {
    setError("");
    setStatus("Lecture du fichier…");
    setProgress(0);
    setFile(f);

    // Lecture pour prévisualisation (optionnelle)
    const data = await f.arrayBuffer();
    const wb = XLSX.read(data, { type: "array", cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    // On récupère les en-têtes brutes
    const header: string[] = XLSX.utils.sheet_to_json(ws, { header: 1 })[0] as string[];
    // Remap des colonnes
    const mapping: (keyof Row | undefined)[] = header.map((h) => headerMap[normalizeHeader(h)]);

    // Convertit en JSON puis remappe vers nos clés attendues
    const raw: any[] = XLSX.utils.sheet_to_json(ws, { raw: true, defval: null });
    const mapped: Row[] = raw.map((r) => {
      const out: Row = {};
      header.forEach((h, idx) => {
        const target = mapping[idx];
        if (!target) return; // colonne inconnue → on ignore
        let value: any = r[h];

        // Numérise les champs numériques
        if (
          target === "id" ||
          target === "quantite" ||
          target === "prix_achat" ||
          target === "cout_revient_pourcentage" ||
          target === "cout_revient" ||
          target === "prix_gros_pourcentage" ||
          target === "prix_gros" ||
          target === "prix_vente_pourcentage" ||
          target === "prix_vente" ||
          target === "kg"
        ) {
          value = coerceNumber(value);
        } else if (target === "designation") {
          value = value == null ? undefined : String(value).trim();
        }
        (out as any)[target] = value;
      });
      return out;
    });

    setRows(mapped);
    setPreview(mapped.slice(0, 10));
    setStatus(`Fichier prêt (${mapped.length} lignes)`);
    setProgress(100);
  };

  // Mode recommandé : upload du fichier en FormData → /api/import/products-excel
  const uploadFileDirect = async () => {
    try {
      setError("");
      if (!file) return setError("Sélectionne un fichier d’abord.");
      setStatus("Envoi du fichier…");
      setProgress(10);

      const token = localStorage.getItem('token');

      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/import/products-excel", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd, // ne pas mettre de Content-Type manuel
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
      }

      const inserted = data?.inserted;
      const updated = data?.updated;
      const total = data?.total;
      setStatus(
        `Import OK (total: ${total ?? "?"}, ajoutés: ${inserted ?? "?"}, modifiés: ${updated ?? "?"}) ✅`
      );
      setProgress(100);
      alert("Import terminé ✅");
    } catch (e: any) {
      const msg = e?.message || String(e);
      setError(msg);
      setStatus("Échec de l’import");
      setProgress(0);
      alert("Erreur import: " + msg);
    }
  };

  // Alternative: JSON par lots → /api/products/bulk (si la route existe)
  const uploadJsonBulk = async () => {
    try {
      setError("");
      if (!rows.length) return setError("Aucune donnée lue.");
      setStatus("Envoi JSON par lots…");
      setProgress(0);

      const chunkSize = 300;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const res = await fetch("/api/products/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({ rows: chunk }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
        setProgress(Math.round(((i + chunk.length) / rows.length) * 100));
      }

      setStatus("Import JSON terminé ✅");
      setProgress(100);
      alert("Import terminé ✅");
    } catch (e: any) {
      const msg = e?.message || String(e);
      setError(msg);
      setStatus("Échec de l’import JSON");
      alert("Erreur import: " + msg);
    }
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <h3>Import produits (Excel / CSV)</h3>

      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {status && <p style={{ marginTop: 8 }}>{status}</p>}
      {progress > 0 && (
        <div style={{ height: 6, background: "#eee", borderRadius: 3, margin: "8px 0" }}>
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              background: "#3b82f6",
              borderRadius: 3,
              transition: "width .2s",
            }}
          />
        </div>
      )}
      {error && <p style={{ color: "crimson" }}>Erreur: {error}</p>}

      {preview.length > 0 && (
        <>
          <p style={{ marginTop: 12 }}><b>Prévisualisation (10 premières lignes)</b></p>
          <pre style={{ maxHeight: 260, overflow: "auto", background: "#f8fafc", padding: 8 }}>
            {JSON.stringify(preview, null, 2)}
          </pre>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={uploadFileDirect} title="POST /api/import/products-excel (multer)">
              Importer (fichier direct)
            </button>
            <button onClick={uploadJsonBulk} title="POST /api/products/bulk (JSON)">
              Importer (JSON par lots)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
