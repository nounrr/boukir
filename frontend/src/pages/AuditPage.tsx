import React, { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@radix-ui/react-tabs';
import { useAuth } from '../hooks/redux';

interface AuditRow {
  id: number;
  table_name: string;
  operation: string;
  changed_at: string;
  user_id: string | null;
  user_name?: string | null;
  request_id: string | null;
  db_user: string | null;
  pk: any;
  old_data: any;
  new_data: any;
}

interface ApiResult {
  page: number;
  pageSize: number;
  total: number;
  rows: AuditRow[];
}

const MAIN_GROUPS: { key: string; label: string; tables: string[]; subTabs?: { key: string; label: string; tables: string[] }[] }[] = [
  { key: 'bons', label: 'Bons', tables: ['bons_commande','bons_comptant','bons_sortie','bons_vehicule'] , subTabs:[
    { key: 'commande', label: 'Commande', tables: ['bons_commande'] },
    { key: 'comptant', label: 'Comptant', tables: ['bons_comptant'] },
    { key: 'sortie', label: 'Sortie', tables: ['bons_sortie'] },
    { key: 'vehicule', label: 'Véhicule', tables: ['bons_vehicule'] },
  ]},
  { key: 'produits', label: 'Produits', tables: ['products','categories','item_remises','client_remises'] },
  { key: 'contacts', label: 'Contacts', tables: ['contacts'] },
  { key: 'avoirs', label: 'Avoirs', tables: ['avoirs_client','avoirs_comptant','avoirs_fournisseur','avoir_client_items','avoir_comptant_items','avoir_fournisseur_items'] },
  { key: 'talons', label: 'Talons', tables: ['talons','old_talons_caisse'] },
  { key: 'vehicules', label: 'Véhicules', tables: ['vehicules','vehicule_items'] },
  { key: 'documents', label: 'Documents', tables: ['document_types','employe_doc'] },
  { key: 'employes', label: 'Employés', tables: ['employees','employe_salaire'] },
  { key: 'paiements', label: 'Paiements', tables: ['payments'] },
];

const fetchAudit = async (tables: string[], page: number, pageSize: number, signal: AbortSignal, token?: string, search?: string): Promise<ApiResult> => {
  const tableParam = tables.length === 1 ? `&table=${encodeURIComponent(tables[0])}` : '';
  const searchPart = search ? `&search=${encodeURIComponent(search)}` : '';
  const qs = `page=${page}&pageSize=${pageSize}${tableParam}${searchPart}`;
  const headers: Record<string,string> = { 'Accept': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`/api/audit/logs?${qs}`, { signal, headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Erreur API audit (${res.status}): ${txt}`);
  }
  return res.json();
};

const OperationsBadge: React.FC<{ op: string }> = ({ op }) => {
  const color = op === 'I' ? 'bg-green-100 text-green-700' : op === 'U' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>{op}</span>;
};

const DiffView: React.FC<{ row: AuditRow }> = ({ row }) => {
  if (row.operation === 'I') return <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-56">{JSON.stringify(row.new_data,null,2)}</pre>;
  if (row.operation === 'D') return <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-56">{JSON.stringify(row.old_data,null,2)}</pre>;
  const diffs: Record<string,{old:any;new:any}> = {};
  const allKeys = new Set([...(row.old_data?Object.keys(row.old_data):[]), ...(row.new_data?Object.keys(row.new_data):[])]);
  allKeys.forEach(k => {
    const ov = row.old_data?.[k];
    const nv = row.new_data?.[k];
    if (JSON.stringify(ov) !== JSON.stringify(nv)) {
      diffs[k] = { old: ov, new: nv };
    }
  });
  return (
    <div className="space-y-1 max-h-56 overflow-auto">
      {Object.keys(diffs).length === 0 && <div className="text-xs text-gray-500">Aucun changement détecté (update de forme seulement).</div>}
      {Object.entries(diffs).map(([k,v]) => (
        <div key={k} className="text-xs border rounded p-1 bg-white">
          <div className="font-medium">{k}</div>
          <div className="grid grid-cols-2 gap-2">
            <pre className="bg-red-50 p-1 rounded overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(v.old)}</pre>
            <pre className="bg-green-50 p-1 rounded overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(v.new)}</pre>
          </div>
        </div>
      ))}
    </div>
  );
};

const AuditTable: React.FC<{ tables: string[] }> = ({ tables }) => {
  const [data,setData] = useState<ApiResult|null>(null);
  const [page,setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState<string|null>(null);
  const [search,setSearch] = useState('');
  const { token } = useAuth();

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true); setError(null);
    fetchAudit(tables,page,pageSize,ctrl.signal,token || undefined,search)
      .then(r=>{setData(r);})
      .catch(e=>{ if(!ctrl.signal.aborted) setError(e.message);})
      .finally(()=>!ctrl.signal.aborted&&setLoading(false));
    return () => ctrl.abort();
  },[tables.join(','),page,pageSize,search,token]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input value={search} onChange={e=>{setPage(1);setSearch(e.target.value);}} placeholder="Recherche..." className="border px-2 py-1 rounded text-sm" />
        <div className="text-xs text-gray-500">{data?`Total: ${data.total}`:''}</div>
      </div>
      <div className="overflow-auto border rounded">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">ID</th>
              <th className="p-2 text-left">Op</th>
              <th className="p-2 text-left">Table</th>
              <th className="p-2 text-left">Date</th>
              <th className="p-2 text-left">User</th>
              <th className="p-2 text-left">Clé</th>
              <th className="p-2 text-left">Diff</th>
            </tr>
          </thead>
          <tbody>
            {!loading && !error && data?.rows.map(r => (
              <tr key={r.id} className="border-t align-top">
                <td className="p-2 whitespace-nowrap">{r.id}</td>
                <td className="p-2"><OperationsBadge op={r.operation} /></td>
                <td className="p-2 whitespace-nowrap">{r.table_name}</td>
                <td className="p-2 whitespace-nowrap">{new Date(r.changed_at).toLocaleString()}</td>
                <td className="p-2 whitespace-nowrap">{r.user_name || r.user_id || '-'}</td>
                <td className="p-2 max-w-[140px] truncate" title={JSON.stringify(r.pk)}>{r.pk ? JSON.stringify(r.pk) : '-'}</td>
                <td className="p-2 w-[380px]"><DiffView row={r} /></td>
              </tr>
            ))}
            {!loading && !error && data && data.rows.length === 0 && <tr><td colSpan={7} className="p-4 text-center">Aucune donnée</td></tr>}
            {loading && <tr><td colSpan={7} className="p-4 text-center">Chargement...</td></tr>}
            {error && !loading && <tr><td colSpan={7} className="p-4 text-center text-red-600">{error}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <button disabled={page===1} onClick={()=>setPage(p=>p-1)} className="px-2 py-1 border rounded disabled:opacity-40">Prev</button>
        <span>Page {page}</span>
        <button disabled={!!data && (page*pageSize)>=data.total} onClick={()=>setPage(p=>p+1)} className="px-2 py-1 border rounded disabled:opacity-40">Next</button>
      </div>
    </div>
  );
};

const AuditPage: React.FC = () => {
  const [mainTab,setMainTab] = useState(MAIN_GROUPS[0].key);
  const current = MAIN_GROUPS.find(g=>g.key===mainTab)!;
  const [subTab,setSubTab] = useState(current.subTabs?current.subTabs[0].key:'');
  useEffect(()=>{ if(current.subTabs) setSubTab(current.subTabs[0].key);},[mainTab]);
  const tables = current.subTabs ? current.subTabs.find(st=>st.key===subTab)?.tables || [] : current.tables;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Audit</h1>
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="flex flex-wrap gap-2 mb-4">
          {MAIN_GROUPS.map(g=> <TabsTrigger key={g.key} value={g.key} className={`px-3 py-1 rounded border text-sm ${g.key===mainTab?'bg-gray-800 text-white':'bg-white'}`}>{g.label}</TabsTrigger>)}
        </TabsList>
        {current.subTabs && (
          <div className="flex gap-2 flex-wrap mb-2">
            {current.subTabs.map(st => (
              <button key={st.key} onClick={()=>setSubTab(st.key)} className={`px-2 py-1 text-xs rounded border ${subTab===st.key?'bg-blue-600 text-white':'bg-white'}`}>{st.label}</button>
            ))}
          </div>
        )}
        <TabsContent value={mainTab}>
          <AuditTable tables={tables} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AuditPage;
