import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../hooks/redux';

type Row = Record<string, any>;

const trimDeep = (val: any): any => {
  if (val == null) return val;
  if (typeof val === 'string') return val.trim();
  if (Array.isArray(val)) return val.map(trimDeep);
  if (typeof val === 'object') {
    const out: any = {};
    for (const k of Object.keys(val)) {
      const tk = String(k).trim();
      out[tk] = trimDeep((val as any)[k]);
    }
    return out;
  }
  return val;
};

const ExcelUploadPage: React.FC = () => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { user, token } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [target, setTarget] = useState<string>('products');
  const [busy, setBusy] = useState<boolean>(false);
  const [resultMsg, setResultMsg] = useState<string>('');

  const onFile = async (file: File) => {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Row>(ws, { defval: '' });
    const trimmed = json.map(trimDeep);
    const allHeaders = Array.from(
      trimmed.reduce((set: Set<string>, r: Row) => {
        Object.keys(r).forEach((k) => set.add(String(k).trim()));
        return set;
      }, new Set<string>())
    ) as string[];
    setHeaders(allHeaders as string[]);
    setRows(trimmed);
    setFileName(file.name);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify({ fileName, rows }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName || 'data'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    setRows([]);
    setHeaders([]);
    setFileName('');
    if (inputRef.current) inputRef.current.value = '';
    setResultMsg('');
  };

  const uploadToTable = async (tableOverride?: string) => {
    if (!rows.length) return;
    setBusy(true);
    setResultMsg('');
    try {
      const t = tableOverride || target;
      const res = await fetch(`/api/import/${encodeURIComponent(t)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ rows, created_by: user?.id ?? null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Erreur import');
      const inserted = data?.inserted || 0;
      const errCount = Array.isArray(data?.errors) ? data.errors.length : 0;
      let msg = `Import: ${inserted} insérés`;
      if (errCount) msg += `, erreurs: ${errCount}`;
      setResultMsg(msg);
    } catch (e: any) {
      setResultMsg(`Échec import: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Import Excel/CSV</h1>
          <p className="text-gray-600">Uploader un fichier, on trim tous les champs automatiquement.</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="px-3 py-2 border rounded">
            <option value="products">Produits</option>
            <option value="contacts">Contacts</option>
            <option value="categories">Catégories</option>
            <option value="vehicules">Véhicules</option>
          </select>
          <button onClick={() => uploadToTable()} disabled={!rows.length || busy} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">
            {busy ? 'Import…' : 'Importer en base'}
          </button>
          <div className="h-6 w-px bg-gray-200" />
          <button onClick={() => uploadToTable('products')} disabled={!rows.length || busy} className="px-3 py-2 bg-indigo-600 text-white rounded disabled:opacity-50">Importer Produits</button>
          <button onClick={() => uploadToTable('contacts')} disabled={!rows.length || busy} className="px-3 py-2 bg-indigo-600 text-white rounded disabled:opacity-50">Importer Contacts</button>
          <button onClick={() => uploadToTable('categories')} disabled={!rows.length || busy} className="px-3 py-2 bg-indigo-600 text-white rounded disabled:opacity-50">Importer Catégories</button>
          <button onClick={() => uploadToTable('vehicules')} disabled={!rows.length || busy} className="px-3 py-2 bg-indigo-600 text-white rounded disabled:opacity-50">Importer Véhicules</button>
          <button onClick={handleExportJSON} disabled={!rows.length} className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50">Exporter JSON</button>
          <button onClick={handleClear} disabled={!rows.length} className="px-4 py-2 bg-gray-100 rounded border">Vider</button>
        </div>
      </div>

      <section
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-white"
        aria-label="Zone de dépôt de fichier"
      >
        <p className="text-gray-700 mb-2">Glissez et déposez un fichier .xlsx, .xls ou .csv ici</p>
        <p className="text-sm text-gray-500 mb-4">ou</p>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
        <button
          onClick={() => inputRef.current?.click()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Choisir un fichier
        </button>
        {fileName && <div className="mt-3 text-sm text-gray-600">Fichier: {fileName}</div>}
  </section>

      {resultMsg && (
        <div className="mt-4 text-sm text-gray-700">{resultMsg}</div>
      )}

      <div className="mt-6 bg-white rounded shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rows.map((r, idx) => (
              <tr key={(r as any).id ?? `${fileName}-${idx}`}>
                {headers.map((h) => (
                  <td key={h} className="px-4 py-2 text-sm text-gray-900 whitespace-nowrap">{String(r[h] ?? '')}</td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td className="px-4 py-8 text-center text-sm text-gray-500" colSpan={headers.length || 1}>
                  Aucun fichier chargé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ExcelUploadPage;
