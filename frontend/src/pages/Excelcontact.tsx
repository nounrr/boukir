// ImportContacts.tsx
import { useState } from "react";
import * as XLSX from "xlsx";

type ContactRow = {
  nom_complet?: string;
  type?: string;
  solde?: number;
};

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

const headerMap: Record<string, keyof ContactRow> = {
  "nom_complet": "nom_complet",
  "nom complet": "nom_complet",
  "fullname": "nom_complet",
  "full name": "nom_complet",
  "name": "nom_complet",
  "الاسم الكامل": "nom_complet",
  "type": "type",
  "categorie": "type",
  "catégorie": "type",
  "نوع": "type",
  // solde / balance
  "solde": "solde",
  "balance": "solde",
  "solde initial": "solde",
  "رصيد": "solde",
};
const coerceNumber = (v: any): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};


const normalizeType = (t: string | undefined): string | undefined => {
  if (!t) return undefined;
  const v = t.trim().toLowerCase();
  if (["client", "clients", "c"].includes(v)) return "Client";
  if (["fournisseur", "supplier", "f"].includes(v)) return "Fournisseur";
  if (["autre", "other", "a"].includes(v)) return "Autre";
  // sinon garder tel quel (ex: Prospect)
  return t.trim();
};

export default function ImportContacts() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ContactRow[]>([]);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const handleFile = async (f: File) => {
    setError("");
    setStatus("Lecture du fichier…");
    setProgress(10);
    setFile(f);

    const data = await f.arrayBuffer();
    const wb = XLSX.read(data, { type: "array", cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];

    // entêtes et mapping
    const headers: string[] = (XLSX.utils.sheet_to_json(ws, { header: 1 })[0] || []) as string[];
    const mapping: (keyof ContactRow | undefined)[] = headers.map(
      (h) => headerMap[normalizeHeader(h)]
    );

    // contenu → JSON brut
    const raw: any[] = XLSX.utils.sheet_to_json(ws, { raw: true, defval: null });

    // remap + normalisation
    const mapped: ContactRow[] = raw.map((r) => {
      const out: ContactRow = {};
      headers.forEach((h, i) => {
        const key = mapping[i];
        if (!key) return;
        let val = r[h];
        if (key === "nom_complet") {
          val = val == null ? undefined : String(val).trim();
        } else if (key === "type") {
          val = normalizeType(val == null ? undefined : String(val));
        } else if (key === "solde") {
          val = coerceNumber(val);
        }
        (out as any)[key] = val;
      });
      return out;
    });

    // filtre lignes sans nom
    const cleaned = mapped.filter((r) => r.nom_complet && r.nom_complet.trim() !== "");
    setPreview(cleaned.slice(0, 20));
    setStatus(`Fichier prêt (${cleaned.length} contacts)`);
    setProgress(100);
  };

  const upload = async () => {
    try {
      setError("");
      if (!file) return setError("Choisis un fichier d’abord.");
      setStatus("Envoi du fichier…");
      setProgress(30);

      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/import/contacts-excel", {
        method: "POST",
        body: fd, // ne pas définir Content-Type manuellement
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
      }

      setStatus(`Import OK (${data?.inserted ?? "?"} lignes) ✅`);
      setProgress(100);
      alert("Contacts importés ✅");
    } catch (e: any) {
      const msg = e?.message || String(e);
      setError(msg);
      setStatus("Échec de l’import");
      setProgress(0);
      alert("Erreur import: " + msg);
    }
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <h3>Importer contacts (Excel / CSV)</h3>

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
              background: "#16a34a",
              borderRadius: 3,
              transition: "width .2s",
            }}
          />
        </div>
      )}
      {error && <p style={{ color: "crimson" }}>Erreur: {error}</p>}

      {preview.length > 0 && (
        <>
          <p><b>Aperçu (20 premières lignes)</b></p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>
                  nom_complet
                </th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>
                  type
                </th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>
                  solde
                </th>
              </tr>
            </thead>
            <tbody>
              {preview.map((r) => (
                <tr key={`${r.nom_complet || ''}-${r.type || ''}-${r.solde ?? ''}`}>
                  <td style={{ borderBottom: "1px solid #f1f5f9", padding: 6 }}>
                    {r.nom_complet || ""}
                  </td>
                  <td style={{ borderBottom: "1px solid #f1f5f9", padding: 6 }}>
                    {r.type || ""}
                  </td>
                  <td style={{ borderBottom: "1px solid #f1f5f9", padding: 6 }}>
                    {r.solde ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 10 }}>
            <button onClick={upload}>Importer</button>
          </div>
        </>
      )}
    </div>
  );
}
