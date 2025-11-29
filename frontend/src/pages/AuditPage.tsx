import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@radix-ui/react-tabs';
import { useAuth } from '../hooks/redux';
import { humanizeTable, REF_PREFIX } from '../config/auditTables';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Users, ArrowLeft } from 'lucide-react';

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
// Normalize any value (string/number/boolean or Buffer-like object) to a safe display string
function toDisplayText(v: any): string {
  if (v === null || v === undefined) return '';
  const t = typeof v;
  if (t === 'string' || t === 'number' || t === 'boolean') return String(v);
  // Buffer sent over JSON appears as { type: 'Buffer', data: number[] }
  if (v && typeof v === 'object' && v.type === 'Buffer' && Array.isArray(v.data)) {
    try {
      const dec = new TextDecoder();
      return dec.decode(Uint8Array.from(v.data));
    } catch {
      try { return String.fromCharCode.apply(null, v.data as number[]); } catch { /* ignore */ }
      return `[${v.data.length} bytes]`;
    }
  }
  try { return JSON.stringify(v); } catch { return String(v); }
}

type AuditMetaMap = Record<string, {
  created_by_name?: string | null;
  created_at?: string | null;
  updated_by_name?: string | null;
  updated_at?: string | null;
}>;

// TABLE_LABELS & humanizeTable imported from config

const opLabel = (op?: string) => {
  switch ((op || '').toUpperCase()) {
    case 'I': return 'ajouté';
    case 'U': return 'modifié';
    case 'D': return 'supprimé';
    default: return 'opéré';
  }
};

function pickIdentifier(obj: any): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const candKeys = ['id','numero','reference','code','designation','name','nom','nom_complet','libelle','label'];
  for (const k of candKeys) {
    const v = obj[k];
    if (v !== undefined && v !== null && `${v}`.trim() !== '') return `${v}`;
  }
  return null;
}

function getChangedFields(row: AuditRow, max = 3): string[] {
  if (!row || (row.operation || '').toUpperCase() !== 'U') return [];
  const keys = new Set<string>([
    ...(row.old_data ? Object.keys(row.old_data) : []),
    ...(row.new_data ? Object.keys(row.new_data) : []),
  ]);
  const diffs: string[] = [];
  for (const k of keys) {
    const ov = row.old_data?.[k];
    const nv = row.new_data?.[k];
    if (JSON.stringify(ov) !== JSON.stringify(nv)) {
      diffs.push(k);
      if (diffs.length >= max) break;
    }
  }
  return diffs;
}

function getIdFromRow(row: AuditRow): string | null {
  const fromPk = row?.pk && typeof row.pk === 'object' ? row.pk.id : null;
  const fromNew = row?.new_data && typeof row.new_data === 'object' ? row.new_data.id : null;
  const fromOld = row?.old_data && typeof row.old_data === 'object' ? row.old_data.id : null;
  return (fromPk ?? fromNew ?? fromOld) != null ? String(fromPk ?? fromNew ?? fromOld) : null;
}

function pickName(obj: any): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const k = obj.nom_complet ?? obj.nom ?? obj.name ?? null;
  return k != null ? String(k) : null;
}

// REF_PREFIX imported from config

type RefFormatter = (row: AuditRow, id: string | null, idOrNumero: string | null) => string | null;
const TABLE_REF_FORMATTERS: Record<string, RefFormatter> = {
  products: (row, id) => {
    const d = row.new_data?.designation ?? row.old_data?.designation ?? null;
    if (d) return String(d);
    return id ? `#${id}` : null;
  },
  employees: (row, id) => {
    const name = pickName(row.new_data) ?? pickName(row.old_data);
    if (id && name) return `#${id} (${name})`;
    if (id) return `#${id}`;
    return name || null;
  },
  payments: (row, id, idOrNumero) => {
    const cid = row.new_data?.contact_id ?? row.old_data?.contact_id ?? null;
    const cname = cid != null ? contactNameCache[String(cid)] : null;
    // Prefer showing record id, and append contact name when available
    if (id && cname) return `#${id} (${cname})`;
    if (id) return `#${id}`;
    if (cname && cid != null) return `${cname} (#${cid})`;
    return idOrNumero || null;
  },
};

function formatRef(row: AuditRow): string {
  const t = row.table_name;
  const id = getIdFromRow(row);
  const numero = row.new_data?.numero ?? row.old_data?.numero ?? null;
  const idOrNumero = id ?? (numero != null ? String(numero) : null);

  const prefix = REF_PREFIX[t];
  if (prefix && idOrNumero) return `${prefix} ${idOrNumero}`;

  const specific = TABLE_REF_FORMATTERS[t]?.(row, id, idOrNumero);
  if (specific) return specific;

  if (id) return `#${id}`;
  const anyId = pickIdentifier(row.pk) || pickIdentifier(row.new_data) || pickIdentifier(row.old_data);
  return anyId ? String(anyId) : '';
}

function buildSummary(row: AuditRow): string {
  const subject = humanizeTable(row.table_name);
  const user = toDisplayText(row.user_name) || 'Utilisateur';
  const action = opLabel(row.operation);
  const ref = formatRef(row);
  const subjectWithRef = ref ? subject + ' ' + ref : subject;
  let base = user + ' a ' + action + ' ' + subjectWithRef;
  const changed = getChangedFields(row, 3);
  if (changed.length) base += ' — champs modifiés: ' + changed.join(', ');
  return base;
}

// Helper to get item tables for a main table
const getItemTables = (mainTable: string): string[] => {
  const itemMapping: Record<string, string[]> = {
    'bons_commande': ['commande_items'],
    'bons_sortie': ['sortie_items'],
    'bons_comptant': ['comptant_items'],
    'bons_vehicule': ['vehicule_items'],
    'devis': ['devis_items'],
    'avoirs_client': ['avoir_client_items'],
    'avoirs_fournisseur': ['avoir_fournisseur_items'],
  'avoirs_comptant': ['avoir_comptant_items'],
  };
  return itemMapping[mainTable] || [];
};

const fetchAudit = async (tables: string[], page: number, pageSize: number, signal: AbortSignal, token?: string, search?: string, pk?: string | number): Promise<ApiResult> => {
  let tableParam = '';
  if (tables.length === 1) {
    tableParam = `&table=${encodeURIComponent(tables[0])}`;
  } else if (tables.length > 1) {
    tableParam = `&tables=${encodeURIComponent(tables.join(','))}`;
  }
  const searchPart = search ? `&search=${encodeURIComponent(search)}` : '';
  const pkPart = pk != null ? `&pk=${encodeURIComponent(String(pk))}` : '';
  const qs = `page=${page}&pageSize=${pageSize}${tableParam}${searchPart}${pkPart}`;
  const headers: Record<string,string> = { 'Accept': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`/api/audit/logs?${qs}`, { signal, headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Erreur API audit (${res.status}): ${txt}`);
  }
  return res.json();
};

const fetchAuditMeta = async (
  table: string,
  ids: string[],
  signal: AbortSignal,
  token?: string
): Promise<AuditMetaMap> => {
  if (!ids.length) return {};
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const qs = `table=${encodeURIComponent(table)}&ids=${encodeURIComponent(ids.join(','))}`;
  const res = await fetch(`/api/audit/meta?${qs}`, { signal, headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Erreur API meta (${res.status}): ${txt}`);
  }
  return res.json();
};

const OperationsBadge: React.FC<{ op: string }> = ({ op }) => {
  const code = (op || '').toUpperCase();
  let config = {
    color: 'bg-gray-100 text-gray-700 border-gray-200',
    label: 'Opération',
    icon: '•'
  };
  
  if (code === 'I') {
    config = {
      color: 'bg-green-100 text-green-700 border-green-200',
      label: 'Créé',
      icon: '+'
    };
  } else if (code === 'U') {
    config = {
      color: 'bg-amber-100 text-amber-700 border-amber-200', 
      label: 'Modifié',
      icon: '~'
    };
  } else if (code === 'D') {
    config = {
      color: 'bg-red-100 text-red-700 border-red-200',
      label: 'Supprimé',
      icon: '×'
    };
  }
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${config.color}`}>
      <span className="font-bold">{config.icon}</span>
      {config.label}
    </span>
  );
};


// Pretty-print helpers for field labels and values
const HIDE_KEYS = new Set<string>([
  'id', 'created_by', 'updated_by', 'created_at', 'updated_at',
  'request_id', 'db_user', 'user_id', 'password'
]);

function prettifyKey(key: string): string {
  if (!key) return '';
  if (key === 'product_id' || key === 'productId' || key === 'product' || key === 'produit' || key === 'produit_id' || key === 'id_produit') return 'Produit';
  if (key === 'client_id' || key === 'clientId' || key === 'id_client') return 'Client';
  if (key === 'contact_id' || key === 'contactId' || key === 'id_contact') return 'Contact';
  if (key === 'fournisseur_id' || key === 'fournisseurId' || key === 'id_fournisseur') return 'Fournisseur';
  const k = key.replace(/^bon_/,'').replace(/_/g, ' ');
  const withoutId = k.endsWith(' id') ? k.slice(0, -3) : k;
  return withoutId.charAt(0).toUpperCase() + withoutId.slice(1);
}

function formatValueShort(val: any): string {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'boolean') return val ? 'Oui' : 'Non';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'string') return val;
  // objects/arrays: compact JSON
  try { return JSON.stringify(val); } catch { return String(val); }
}

// Simple lookup cache for product names
const productNameCache: Record<string, string> = {};
// Simple lookup cache for contact (clients/fournisseurs) names
const contactNameCache: Record<string, string> = {};
// Simple lookup cache for client_remises names (Remise d'article)
const clientRemiseNameCache: Record<string, string> = {};

async function resolveProductNames(ids: string[], token?: string): Promise<Record<string,string>> {
  const missing = ids.filter(id => productNameCache[id] === undefined);
  if (!missing.length) return {};
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const qs = `table=products&ids=${encodeURIComponent(missing.join(','))}`;
  const res = await fetch(`/api/audit/lookup?${qs}`, { headers });
  if (!res.ok) return {};
  const map = await res.json();
  Object.assign(productNameCache, map);
  return map;
}

async function resolveContactNames(ids: string[], token?: string): Promise<Record<string,string>> {
  const missing = ids.filter(id => contactNameCache[id] === undefined);
  if (!missing.length) return {};
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const qs = `table=contacts&ids=${encodeURIComponent(missing.join(','))}`;
  const res = await fetch(`/api/audit/lookup?${qs}`, { headers });
  if (!res.ok) return {};
  const map = await res.json();
  Object.assign(contactNameCache, map);
  return map;
}

async function resolveClientRemiseNames(ids: string[], token?: string): Promise<Record<string,string>> {
  const missing = ids.filter(id => clientRemiseNameCache[id] === undefined);
  if (!missing.length) return {};
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const qs = `table=client_remises&ids=${encodeURIComponent(missing.join(','))}`;
  const res = await fetch(`/api/audit/lookup?${qs}`, { headers });
  if (!res.ok) return {};
  const map = await res.json();
  Object.assign(clientRemiseNameCache, map);
  return map;
}

// Deep transform: replace any product_id/productId/product numeric value by product label; fallback to #id if name unknown
function transformProductIdsInObject(input: any): any {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') {
    const t = input.trim();
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try {
        const parsed = JSON.parse(t);
        return transformProductIdsInObject(parsed);
      } catch {
        return input;
      }
    }
    return input;
  }
  if (Array.isArray(input)) return input.map(v => transformProductIdsInObject(v));
  if (typeof input === 'object') {
    const out: any = Array.isArray(input) ? [] : {};
    for (const [k, v] of Object.entries(input)) {
      // direct id fields
  if ((k === 'product_id' || k === 'productId' || k === 'produit_id' || k === 'id_produit') && (typeof v === 'number' || typeof v === 'string')) {
        const name = productNameCache[String(v)];
        out[k] = name ? `${name} (#${v})` : `#${v}`;
      } else if (k === 'product') {
        // product can be id, string, or object
        if (typeof v === 'number' || typeof v === 'string') {
          const name = productNameCache[String(v)];
          out[k] = name ? `${name} (#${v})` : `#${v}`;
        } else if (v && typeof v === 'object') {
          const idVal: any = (v as any).id;
          const name = idVal != null ? productNameCache[String(idVal)] : undefined;
          const label = (v as any).designation || (v as any).name || (v as any).nom || (v as any).nom_complet;
          if (idVal != null) {
            out[k] = `${name || label || ''} ${name || label ? '' : ''}${idVal != null ? `(#${idVal})` : ''}`.trim() || `#${idVal}`;
          } else if (name || label) {
            out[k] = `${name || label}`;
          } else {
            out[k] = transformProductIdsInObject(v);
          }
        } else {
          out[k] = v;
        }
      } else {
        out[k] = transformProductIdsInObject(v);
      }
    }
    return out;
  }
  return input;
}

// Deep transform for client/fournisseur ids using contactNameCache
function transformContactIdsInObject(input: any): any {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') {
    const t = input.trim();
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try { return transformContactIdsInObject(JSON.parse(t)); } catch { return input; }
    }
    return input;
  }
  if (Array.isArray(input)) return input.map(v => transformContactIdsInObject(v));
  if (typeof input === 'object') {
    const out: any = Array.isArray(input) ? [] : {};
    for (const [k, v] of Object.entries(input)) {
  if ((k === 'client_id' || k === 'clientId' || k === 'id_client' || k === 'fournisseur_id' || k === 'fournisseurId' || k === 'id_fournisseur' || k === 'contact_id' || k === 'contactId' || k === 'id_contact') && (typeof v === 'number' || typeof v === 'string')) {
        const name = contactNameCache[String(v)];
        out[k] = name ? `${name} (#${v})` : `#${v}`;
      } else {
        out[k] = transformContactIdsInObject(v);
      }
    }
    return out;
  }
  return input;
}

function transformClientRemiseIdsInObject(input: any): any {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') {
    const t = input.trim();
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try { return transformClientRemiseIdsInObject(JSON.parse(t)); } catch { return input; }
    }
    return input;
  }
  if (Array.isArray(input)) return input.map(v => transformClientRemiseIdsInObject(v));
  if (typeof input === 'object') {
    const out: any = Array.isArray(input) ? [] : {};
    for (const [k, v] of Object.entries(input)) {
      if ((k === 'client_id' || k === 'clientId' || k === 'id_client') && (typeof v === 'number' || typeof v === 'string')) {
        const name = clientRemiseNameCache[String(v)];
        out[k] = name ? `${name} (#${v})` : `#${v}`;
      } else {
        out[k] = transformClientRemiseIdsInObject(v);
      }
    }
    return out;
  }
  return input;
}


const DiffView: React.FC<{ row: AuditRow }> = ({ row }) => {
  if (row.operation === 'I') {
    const data = row.new_data && typeof row.new_data === 'object' ? row.new_data : {};
    let entries = Object.entries(data)
      .filter(([k]) => !HIDE_KEYS.has(k))
      .filter(([,v]) => v !== undefined);
  // Replace product value with product name if available; fallback to #id
    entries = entries.map(([k, v]) => {
      if (k === 'product_id' || k === 'productId' || k === 'produit_id' || k === 'id_produit') {
        const name = v != null ? productNameCache[String(v)] : undefined;
        return [k, name ? `${name} (#${v})` : (v != null ? `#${v}` : v)];
      }
      if (k === 'client_id' || k === 'clientId' || k === 'id_client' || k === 'fournisseur_id' || k === 'fournisseurId' || k === 'id_fournisseur' || k === 'contact_id' || k === 'contactId' || k === 'id_contact') {
        const isClientRemise = row.table_name === 'item_remises' && (k === 'client_id' || k === 'clientId' || k === 'id_client');
        const name = v != null ? (isClientRemise ? clientRemiseNameCache[String(v)] : contactNameCache[String(v)]) : undefined;
        return [k, name ? `${name} (#${v})` : (v != null ? `#${v}` : v)];
      }
      if (k === 'product') {
        if (typeof v === 'number' || typeof v === 'string') {
          const name = v != null ? productNameCache[String(v)] : undefined;
          return [k, name ? `${name} (#${v})` : (v != null ? `#${v}` : v)];
        }
        if (v && typeof v === 'object') {
          const idVal: any = (v as any).id;
          const label = (v as any).designation || (v as any).name || (v as any).nom || (v as any).nom_complet;
          if (idVal != null || label) return [k, `${label || ''}${idVal != null ? ` (#${idVal})` : ''}`.trim() || `#${idVal}`];
        }
      }
      return [k, v];
    });
    return (
      <div className="border border-gray-200 rounded p-2">
        <div className="text-xs text-gray-600 mb-2">Champs saisis:</div>
        {entries.length === 0 ? (
          <div className="text-xs text-gray-500 italic">Aucun champ à afficher</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
            {entries.map(([k,v]) => (
              <div key={k} className="bg-white rounded border border-gray-100 p-2">
                <div className="text-[11px] text-gray-500">{prettifyKey(k)}</div>
                <div className="text-xs text-gray-800 break-words">
                  {typeof v === 'object' && v !== null ? (
                    <pre className="bg-gray-50 p-1 rounded text-[11px] overflow-auto max-h-24">
                      {JSON.stringify(transformProductIdsInObject(transformContactIdsInObject(v)), null, 2)}
                    </pre>
                  ) : (
                    String(formatValueShort(v))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  
  if (row.operation === 'D') {
    const data = row.old_data && typeof row.old_data === 'object' ? row.old_data : {};
    let entries = Object.entries(data)
      .filter(([k]) => !HIDE_KEYS.has(k))
      .filter(([,v]) => v !== undefined);
  // Replace product/client/fournisseur value with names if available; fallback to #id
    entries = entries.map(([k, v]) => {
      if (k === 'product_id' || k === 'productId' || k === 'produit_id' || k === 'id_produit') {
        const name = v != null ? productNameCache[String(v)] : undefined;
        return [k, name ? `${name} (#${v})` : (v != null ? `#${v}` : v)];
      }
      if (k === 'client_id' || k === 'clientId' || k === 'id_client' || k === 'fournisseur_id' || k === 'fournisseurId' || k === 'id_fournisseur' || k === 'contact_id' || k === 'contactId' || k === 'id_contact') {
        const isClientRemise = row.table_name === 'item_remises' && (k === 'client_id' || k === 'clientId' || k === 'id_client');
        const name = v != null ? (isClientRemise ? clientRemiseNameCache[String(v)] : contactNameCache[String(v)]) : undefined;
        return [k, name ? `${name} (#${v})` : (v != null ? `#${v}` : v)];
      }
      if (k === 'product') {
        if (typeof v === 'number' || typeof v === 'string') {
          const name = v != null ? productNameCache[String(v)] : undefined;
          return [k, name ? `${name} (#${v})` : (v != null ? `#${v}` : v)];
        }
        if (v && typeof v === 'object') {
          const idVal: any = (v as any).id;
          const label = (v as any).designation || (v as any).name || (v as any).nom || (v as any).nom_complet;
          if (idVal != null || label) return [k, `${label || ''}${idVal != null ? ` (#${idVal})` : ''}`.trim() || `#${idVal}`];
        }
      }
      // As a last resort, try deep-transforming any nested JSON-looking strings
      let transformed: any = v;
      if (typeof v === 'object' || typeof v === 'string') {
        const first = transformProductIdsInObject(transformContactIdsInObject(v));
        transformed = row.table_name === 'item_remises' ? transformClientRemiseIdsInObject(first) : first;
      }
      return [k, transformed];
    });

    return (
      <div className="border border-gray-200 rounded p-2">
        <div className="text-xs text-gray-600 mb-2">Champs supprimés:</div>
        {entries.length === 0 ? (
          <div className="text-xs text-gray-500 italic">Aucun champ à afficher</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
            {entries.map(([k,v]) => (
              <div key={k} className="bg-white rounded border border-gray-100 p-2">
                <div className="text-[11px] text-gray-500">{prettifyKey(k)}</div>
                <div className="text-xs text-gray-800 break-words">
                  {typeof v === 'object' && v !== null ? (
                    <pre className="bg-gray-50 p-1 rounded text-[11px] overflow-auto max-h-24">
                      {JSON.stringify(transformProductIdsInObject(transformContactIdsInObject(v)), null, 2)}
                    </pre>
                  ) : (
                    String(formatValueShort(v))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  
  // Update operation - show field-by-field comparison
  const diffs: Record<string,{old:any;new:any}> = {};
  const allKeys = new Set([
    ...(row.old_data ? Object.keys(row.old_data) : []), 
    ...(row.new_data ? Object.keys(row.new_data) : [])
  ]);
  
  allKeys.forEach(k => {
    const ov = row.old_data?.[k];
    const nv = row.new_data?.[k];
    if (JSON.stringify(ov) !== JSON.stringify(nv)) {
      // Replace product fields with labels when possible
      if (k === 'product_id' || k === 'productId' || k === 'produit_id' || k === 'id_produit') {
        const oName = ov != null ? productNameCache[String(ov)] : undefined;
        const nName = nv != null ? productNameCache[String(nv)] : undefined;
        diffs[k] = { old: oName ? `${oName} (#${ov})` : (ov != null ? `#${ov}` : ov), new: nName ? `${nName} (#${nv})` : (nv != null ? `#${nv}` : nv) };
  } else if (k === 'client_id' || k === 'clientId' || k === 'id_client' || k === 'fournisseur_id' || k === 'fournisseurId' || k === 'id_fournisseur' || k === 'contact_id' || k === 'contactId' || k === 'id_contact') {
        const isClientRemise = row.table_name === 'item_remises' && (k === 'client_id' || k === 'clientId' || k === 'id_client');
        const oName = ov != null ? (isClientRemise ? clientRemiseNameCache[String(ov)] : contactNameCache[String(ov)]) : undefined;
        const nName = nv != null ? (isClientRemise ? clientRemiseNameCache[String(nv)] : contactNameCache[String(nv)]) : undefined;
        diffs[k] = { old: oName ? `${oName} (#${ov})` : (ov != null ? `#${ov}` : ov), new: nName ? `${nName} (#${nv})` : (nv != null ? `#${nv}` : nv) };
      } else if (k === 'product') {
        const fmt = (v: any) => {
          if (typeof v === 'number' || typeof v === 'string') {
            const name = productNameCache[String(v)];
            return name ? `${name} (#${v})` : `#${v}`;
          }
          if (v && typeof v === 'object') {
            const idVal: any = (v as any).id;
            const name = idVal != null ? productNameCache[String(idVal)] : undefined;
            const label = (v as any).designation || (v as any).name || (v as any).nom || (v as any).nom_complet;
            if (idVal != null) return `${name || label || ''}${idVal != null ? ` (#${idVal})` : ''}`.trim() || `#${idVal}`;
            if (name || label) return `${name || label}`;
          }
          return v;
        };
        diffs[k] = { old: fmt(ov), new: fmt(nv) };
      } else {
        diffs[k] = { old: ov, new: nv };
      }
    }
  });

  return (
    <div className="border border-gray-200 rounded p-2">
      <div className="text-xs text-gray-600 mb-2">Champs modifiés:</div>
      {Object.keys(diffs).length === 0 ? (
        <div className="text-xs text-gray-500 italic">Aucun changement détecté</div>
      ) : (
        <div className="space-y-2">
          {Object.entries(diffs).map(([field, values]) => (
            <div key={field} className="border border-gray-100 rounded p-2">
              <div className="text-xs font-medium text-gray-700 mb-1">{prettifyKey(field)}</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-gray-500 mb-1">Avant:</div>
                  <pre className="bg-gray-50 p-1 rounded text-xs overflow-auto max-h-20">
                    {JSON.stringify(typeof values.old === 'object' ? transformProductIdsInObject(transformContactIdsInObject(values.old)) : values.old, null, 2)}
                  </pre>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">Après:</div>
                  <pre className="bg-gray-50 p-1 rounded text-xs overflow-auto max-h-20">
                    {JSON.stringify(typeof values.new === 'object' ? transformProductIdsInObject(transformContactIdsInObject(values.new)) : values.new, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Component to show items for a specific bon
const BonItemsAccordion: React.FC<{ table: string; bonId: string; showDetails?: boolean }> = ({ table, bonId, showDetails = false }) => {
  const [itemsData, setItemsData] = useState<ApiResult|null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [namesVersion, setNamesVersion] = useState(0);
  const { token } = useAuth();
  // simple in-component cache to prevent refetch/reset flicker (esp. in React StrictMode)
  const cacheRef = useRef<Map<string, ApiResult>>(new Map());

  const itemTables = useMemo(() => getItemTables(table), [table]);

  useEffect(() => {
    if (!bonId) return;
    if (itemTables.length === 0) return;
    const key = `${table}:${bonId}`;
    // serve from cache if available
    const cached = cacheRef.current.get(key);
    if (cached) {
      setItemsData(cached);
      setLoading(false);
      setError(null);
      return; // no fetch needed
    }
    
    const ctrl = new AbortController();
    setLoading(true); setError(null);
    
    // Fetch items related to this bon using pk parameter (backend will handle bon_id filtering for item tables)
    fetchAudit(itemTables, 1, 100, ctrl.signal, token || undefined, undefined, bonId)
      .then(r => { 
        setItemsData(r);
        cacheRef.current.set(key, r);
        // Opportunistically resolve product names for displayed rows
    const prodIds = Array.from(new Set(
          (r.rows || [])
            .flatMap(it => [
              it.new_data?.product_id,
              it.old_data?.product_id,
              it.new_data?.productId,
              it.old_data?.productId,
      it.new_data?.produit_id,
      it.old_data?.produit_id,
      it.new_data?.id_produit,
      it.old_data?.id_produit,
              typeof it.new_data?.product === 'number' || typeof it.new_data?.product === 'string' ? it.new_data?.product : (it.new_data?.product?.id),
              typeof it.old_data?.product === 'number' || typeof it.old_data?.product === 'string' ? it.old_data?.product : (it.old_data?.product?.id),
            ])
            .filter((x): x is number | string => x !== null && x !== undefined)
        )).map(String);
  if (prodIds.length) resolveProductNames(prodIds, token || undefined).then(() => setNamesVersion(v => v + 1));
      })
      .catch(e => { if (!ctrl.signal.aborted) setError(e.message); })
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    
    return () => ctrl.abort();
  }, [table, bonId, token]);

  if (itemTables.length === 0) {
    return <div className="text-xs text-gray-500 p-2">Aucune table d'items associée</div>;
  }

  if (loading) {
    return <div className="text-xs text-gray-500 p-2">Chargement des items...</div>;
  }

  if (error) {
    return <div className="text-xs text-red-500 p-2">Erreur: {error}</div>;
  }

  if (!itemsData || itemsData.rows.length === 0) {
    return <div className="text-xs text-gray-500 p-2">Aucun item trouvé</div>;
  }

  return (
    <div className="bg-gray-50 border-t p-3">
  <span className="hidden">{namesVersion}</span>
      <div className="text-sm font-medium text-gray-700 mb-2">
        Items associés ({itemsData.rows.length})
      </div>
      <div className="overflow-auto border rounded">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">ID</th>
              <th className="p-2 text-left">Action</th>
              <th className="p-2 text-left">Table</th>
              <th className="p-2 text-left">Réf.</th>
              <th className="p-2 text-left">Date</th>
              <th className="p-2 text-left">Utilisateur</th>
              <th className="p-2 text-left">Résumé</th>
              {showDetails && <th className="p-2 text-left">Modifications</th>}
            </tr>
          </thead>
          <tbody>
            {itemsData.rows.map(item => (
              <tr key={item.id} className="border-t align-top">
                <td className="p-2 whitespace-nowrap font-mono">{item.id}</td>
                <td className="p-2 whitespace-nowrap"><OperationsBadge op={item.operation} /></td>
                <td className="p-2 whitespace-nowrap">{humanizeTable(item.table_name)}</td>
                <td className="p-2 whitespace-nowrap font-mono">{formatRef(item) || '-'}</td>
                <td className="p-2 whitespace-nowrap">{new Date(item.changed_at).toLocaleString()}</td>
                <td className="p-2 whitespace-nowrap">{toDisplayText(item.user_name) || 'Système'}</td>
                <td className="p-2">
                  <div className="truncate" title={buildSummary(item)}>
                    {buildSummary(item)}
                  </div>
                </td>
                {showDetails && (
                  <td className="p-2 w-[360px]">
                    <DiffView row={item} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const AuditTable: React.FC<{ table: string; initialShowDetails?: boolean }> = ({ table, initialShowDetails = false }) => {
  const [data,setData] = useState<ApiResult|null>(null);
  const [page,setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState<string|null>(null);
  const [search,setSearch] = useState('');
  const [showDetails,setShowDetails] = useState(initialShowDetails);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [meta, setMeta] = useState<AuditMetaMap>({});
  const [namesVersion, setNamesVersion] = useState(0);
  const { token } = useAuth();

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true); setError(null);
    // Fetch only the main table (not items)
    fetchAudit([table],page,pageSize,ctrl.signal,token || undefined,search)
      .then(r=>{setData(r);})
      .catch(e=>{ if(!ctrl.signal.aborted) setError(e.message);})
      .finally(()=>!ctrl.signal.aborted&&setLoading(false));
    return () => ctrl.abort();
  },[table,page,pageSize,search,token]);

  // Preload product names for current page so JSON views can show labels
  useEffect(() => {
    if (!data?.rows?.length) return;
  const ids = new Set<string>();
  const clientRemiseIds = new Set<string>();
    for (const r of data.rows) {
      const a = r.new_data?.product_id; if (a !== null && a !== undefined) ids.add(String(a));
      const b = r.old_data?.product_id; if (b !== null && b !== undefined) ids.add(String(b));
      const c = r.new_data?.productId; if (c !== null && c !== undefined) ids.add(String(c));
      const d = r.old_data?.productId; if (d !== null && d !== undefined) ids.add(String(d));
  const cfr = r.new_data?.produit_id; if (cfr !== null && cfr !== undefined) ids.add(String(cfr));
  const dfr = r.old_data?.produit_id; if (dfr !== null && dfr !== undefined) ids.add(String(dfr));
  const cfr2 = r.new_data?.id_produit; if (cfr2 !== null && cfr2 !== undefined) ids.add(String(cfr2));
  const dfr2 = r.old_data?.id_produit; if (dfr2 !== null && dfr2 !== undefined) ids.add(String(dfr2));
      const e = r.new_data?.product; if (typeof e === 'number' || typeof e === 'string') ids.add(String(e)); else if (e?.id != null) ids.add(String(e.id));
      const f = r.old_data?.product; if (typeof f === 'number' || typeof f === 'string') ids.add(String(f)); else if (f?.id != null) ids.add(String(f.id));
      // contacts (clients/fournisseurs) or client_remises for item_remises
      const pushContactOrRemise = (val: any, tableName: string | undefined) => {
        if (val == null) return;
        if (tableName === 'item_remises') clientRemiseIds.add(String(val));
        else ids.add(String(val));
      };
      const tname = r.table_name;
      const c1 = r.new_data?.client_id; pushContactOrRemise(c1, tname);
      const c2 = r.old_data?.client_id; pushContactOrRemise(c2, tname);
      const c3 = r.new_data?.clientId; if (c3 != null) ids.add(String(c3));
      const c4 = r.old_data?.clientId; if (c4 != null) ids.add(String(c4));
      const c5 = r.new_data?.id_client; if (c5 != null) ids.add(String(c5));
      const c6 = r.old_data?.id_client; if (c6 != null) ids.add(String(c6));
      const s1 = r.new_data?.fournisseur_id; if (s1 != null) ids.add(String(s1));
      const s2 = r.old_data?.fournisseur_id; if (s2 != null) ids.add(String(s2));
      const s3 = r.new_data?.fournisseurId; if (s3 != null) ids.add(String(s3));
      const s4 = r.old_data?.fournisseurId; if (s4 != null) ids.add(String(s4));
      const s5 = r.new_data?.id_fournisseur; if (s5 != null) ids.add(String(s5));
      const s6 = r.old_data?.id_fournisseur; if (s6 != null) ids.add(String(s6));
  // payments: contact_id variants
  const p1 = r.new_data?.contact_id; if (p1 != null) ids.add(String(p1));
  const p2 = r.old_data?.contact_id; if (p2 != null) ids.add(String(p2));
  const p3 = r.new_data?.contactId; if (p3 != null) ids.add(String(p3));
  const p4 = r.old_data?.contactId; if (p4 != null) ids.add(String(p4));
  const p5 = r.new_data?.id_contact; if (p5 != null) ids.add(String(p5));
  const p6 = r.old_data?.id_contact; if (p6 != null) ids.add(String(p6));
    }
    const prodIds = [...ids];
    const contactIds = [...ids];
    const remiseIds = [...clientRemiseIds];
    const p = prodIds.length ? resolveProductNames(prodIds, token || undefined) : Promise.resolve({});
    const c = contactIds.length ? resolveContactNames(contactIds, token || undefined) : Promise.resolve({});
    const cr = remiseIds.length ? resolveClientRemiseNames(remiseIds, token || undefined) : Promise.resolve({});
    Promise.all([p,c,cr]).then(() => setNamesVersion(v => v + 1));
  }, [data?.rows, token]);

  // Fetch created/updated by meta for payments
  useEffect(() => {
    if (table !== 'payments') { setMeta({}); return; }
    if (!data?.rows?.length) { setMeta({}); return; }
    const ids = Array.from(new Set(
      data.rows.map(r => getIdFromRow(r)).filter((x): x is string => !!x)
    ));
    if (!ids.length) { setMeta({}); return; }
    const ctrl = new AbortController();
    fetchAuditMeta('payments', ids, ctrl.signal, token || undefined)
      .then(m => { setMeta(m || {}); })
      .catch(() => { /* ignore meta errors */ })
      .finally(() => { /* no-op */ });
    return () => ctrl.abort();
  }, [table, data?.rows, token]);

  const toggleItems = (bonId: string) => {
    setExpandedItems(prev => ({ ...prev, [bonId]: !prev[bonId] }));
  };

  // Auto-expand items for all rows on initial load for better visibility
  useEffect(() => {
    if (!data?.rows?.length) return;
    const next: Record<string, boolean> = {};
    for (const r of data.rows) {
      const id = getIdFromRow(r);
      if (id) next[id] = true;
    }
    setExpandedItems(next);
  }, [data?.rows?.length]);

  return (
    <div className="space-y-4">
  <span className="hidden">{namesVersion}</span>
      <div className="flex items-center gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="relative flex-1 max-w-md">
          <input 
            value={search} 
            onChange={e=>{setPage(1);setSearch(e.target.value);}} 
            placeholder="Rechercher dans l'audit..." 
            className="w-full pl-4 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" 
          />
        </div>
        <div className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">
          {data && (
            `${data.total} entrée${data.total > 1 ? 's' : ''}`
          )}
        </div>
        <label className="flex items-center gap-2 text-sm select-none bg-blue-50 px-3 py-2 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors">
          <input 
            type="checkbox" 
            checked={showDetails} 
            onChange={e=>setShowDetails(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" 
          />
          <span className="font-medium text-blue-700">Détails complets</span>
        </label>
      </div>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-left font-semibold text-gray-900">ID</th>
              <th className="px-6 py-4 text-left font-semibold text-gray-900">Action</th>
              <th className="px-6 py-4 text-left font-semibold text-gray-900">Objet</th>
              <th className="px-6 py-4 text-left font-semibold text-gray-900">Réf.</th>
              <th className="px-6 py-4 text-left font-semibold text-gray-900">Date</th>
              <th className="px-6 py-4 text-left font-semibold text-gray-900">Utilisateur</th>
              {table === 'payments' && (
                <>
                  <th className="px-6 py-4 text-left font-semibold text-gray-900">Créé par</th>
                  <th className="px-6 py-4 text-left font-semibold text-gray-900">Dernière modif.</th>
                </>
              )}
              <th className="px-6 py-4 text-left font-semibold text-gray-900">Résumé</th>
              {showDetails && <th className="px-6 py-4 text-left font-semibold text-gray-900">Modifications</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!loading && !error && data?.rows.map((r, index) => {
              const bonId = getIdFromRow(r);
              const hasItems = getItemTables(table).length > 0;
              const isExpanded = expandedItems[bonId || ''] || false;
              
              return (
                <React.Fragment key={`row-${r.id}`}>
                  <tr className={`hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-gray-600 text-sm">{r.id}</td>
                    <td className="px-6 py-4"><OperationsBadge op={r.operation} /></td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                        {humanizeTable(r.table_name)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-gray-600 text-sm">{formatRef(r) || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700 text-sm">{new Date(r.changed_at).toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm font-medium">
                        {toDisplayText(r.user_name) || 'Système'}
                      </span>
                    </td>
                    {table === 'payments' && (
                      <>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-700 text-sm">
                          {bonId && meta[bonId]?.created_by_name ? toDisplayText(meta[bonId]?.created_by_name) : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-700 text-sm">
                          {bonId && meta[bonId]?.updated_by_name ? toDisplayText(meta[bonId]?.updated_by_name) : '-'}
                        </td>
                      </>
                    )}
                    <td className="px-6 py-4 max-w-[420px]">
                      <div className="flex items-center gap-2">
                        <div className="text-sm text-gray-800 truncate" title={buildSummary(r)}>
                          {buildSummary(r)}
                        </div>
                        {hasItems && bonId && (
                          <button
                            onClick={() => toggleItems(bonId)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            {isExpanded ? '▼' : '▶'} Items
                          </button>
                        )}
                      </div>
                    </td>
                    {showDetails && (
                      <td className="px-6 py-4 w-[400px]">
                        <DiffView row={r} />
                      </td>
                    )}
                  </tr>
                  {hasItems && bonId && isExpanded && (
                    <tr key={`items-${bonId}`}>
                      <td colSpan={(showDetails ? 8 : 7) + (table === 'payments' ? 2 : 0)} className="p-0">
                        <div className="bg-gray-50 border-t px-3 py-3">
                          <div className="text-sm font-medium text-gray-700 mb-2">Items associés</div>
                          <div className="overflow-auto">
                            <BonItemsAccordion table={table} bonId={bonId} showDetails={showDetails} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {(() => { const cs = (7 + (showDetails ? 1 : 0)) + (table === 'payments' ? 2 : 0); return (
              <>
                {!loading && !error && data && data.rows.length === 0 && (
                  <tr>
                    <td colSpan={cs} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div className="text-gray-500 font-medium">Aucune modification trouvée</div>
                        <div className="text-gray-400 text-sm">Aucun audit ne correspond aux critères de recherche</div>
                      </div>
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={cs} className="px-6 py-12 text-center">
                      <div className="flex items-center justify-center gap-3">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                        <span className="text-gray-600 font-medium">Chargement des données...</span>
                      </div>
                    </td>
                  </tr>
                )}
                {error && !loading && (
                  <tr>
                    <td colSpan={cs} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div className="text-red-600 font-medium">Erreur de chargement</div>
                        <div className="text-red-500 text-sm">{error}</div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ); })()}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="text-sm text-gray-600">
          {data && (
            <>
              Affichage {((page - 1) * pageSize) + 1} à {Math.min(page * pageSize, data.total)} 
              sur {data.total} enregistrement{data.total > 1 ? 's' : ''}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button 
            disabled={page === 1} 
            onClick={() => setPage(p => p - 1)} 
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Précédent
          </button>
          <span className="px-4 py-2 text-sm font-medium text-gray-700 bg-blue-50 border border-blue-200 rounded-lg">
            Page {page}
          </span>
          <button 
            disabled={!!data && (page * pageSize) >= data.total} 
            onClick={() => setPage(p => p + 1)} 
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  );
};

// Group view types and helpers
interface GroupRow {
  table_name: string;
  rid: number;
  created_at: string | null;
  created_by_name: string | null;
  last_changed_at: string | null;
  last_user_name: string | null;
  last_op: string | null;
  count_total: number;
  count_I: number;
  count_U: number;
  count_D: number;
  last_numero?: string | null;
  last_designation?: string | null;
  last_nom_complet?: string | null;
  last_nom?: string | null;
}

const fetchGroups = async (table: string, page: number, pageSize: number, signal: AbortSignal, token?: string, search?: string): Promise<{ page:number; pageSize:number; total:number; rows: GroupRow[] }> => {
  const headers: Record<string,string> = { 'Accept': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const params: string[] = [
    `table=${encodeURIComponent(table)}`,
    `page=${page}`,
    `pageSize=${pageSize}`,
  ];
  if (search) params.push('search=' + encodeURIComponent(search));
  const qs = params.join('&');
  const res = await fetch(`/api/audit/groups?${qs}`, { signal, headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Erreur API groupes (${res.status}): ${txt}`);
  }
  return res.json();
};

const formatGroupRef = (table: string, rid: number | string, row: GroupRow): string => {
  const numero = row.last_numero ?? null;
  const nameLike = row.last_designation || row.last_nom_complet || row.last_nom || null;
  const prefix = REF_PREFIX[table];
  if (prefix && (numero || rid)) return `${prefix} ${numero ?? rid}`;
  if (nameLike) return String(nameLike);
  return `#${rid}`;
};

const GroupTable: React.FC<{ table: string; focusRid?: string | null; initialShowDetails?: boolean }> = ({ table, focusRid, initialShowDetails = false }) => {
  const [data,setData] = useState<{ page:number; pageSize:number; total:number; rows: GroupRow[] }|null>(null);
  const [page,setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState<string|null>(null);
  const [search,setSearch] = useState('');
  const [showDetails, setShowDetails] = useState(initialShowDetails);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { token } = useAuth();

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true); setError(null);
    fetchGroups(table,page,pageSize,ctrl.signal,token || undefined,search)
      .then(r=>{setData(r);})
      .catch(e=>{ if(!ctrl.signal.aborted) setError(e.message);})
      .finally(()=>!ctrl.signal.aborted&&setLoading(false));
    return () => ctrl.abort();
  }, [table, page, pageSize, search, token]);

  // auto-expand focusRid if present in current page
  useEffect(() => {
    if (!focusRid || !data) return;
    const found = data.rows.find(r => String(r.rid) === String(focusRid));
    if (found) setExpanded(prev => ({ ...prev, [String(found.rid)]: true }));
  }, [focusRid, data]);

  // When toggling Détails, auto-expand/collapse all current rows for immediate effect
  useEffect(() => {
    if (!data) return;
    if (showDetails) {
      const all: Record<string, boolean> = {};
      for (const r of data.rows) all[String(r.rid)] = true;
      setExpanded(all);
    } else {
      setExpanded({});
    }
  }, [showDetails, data]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input value={search} onChange={e=>{setPage(1);setSearch(e.target.value);}} placeholder="Recherche..." className="border px-2 py-1 rounded text-sm" />
        <div className="text-xs text-gray-500">{data?`Total: ${data.total}`:''}</div>
        <label className="ml-auto flex items-center gap-1 text-xs select-none">
          <input type="checkbox" checked={showDetails} onChange={e=>setShowDetails(e.target.checked)} />{' '}
          Détails
        </label>
      </div>
      <div className="overflow-auto border rounded">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">ID</th>
              <th className="p-2 text-left">Réf./Objet</th>
              <th className="p-2 text-left">Créé par</th>
              <th className="p-2 text-left">Créé le</th>
              <th className="p-2 text-left">Dernier</th>
              <th className="p-2 text-left">Comptes</th>
              <th className="p-2 text-left">Série</th>
            </tr>
          </thead>
          <tbody>
            {!loading && !error && data?.rows.map(r => (
              <React.Fragment key={r.rid}>
                <tr className="border-t align-top">
                  <td className="p-2 whitespace-nowrap">{r.rid}</td>
                  <td className="p-2 whitespace-nowrap">{formatGroupRef(table, r.rid, r)}</td>
                  <td className="p-2 whitespace-nowrap">{toDisplayText(r.created_by_name) || '-'}</td>
                  <td className="p-2 whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleString() : '-'}</td>
                  <td className="p-2 whitespace-nowrap">
                    {toDisplayText(r.last_user_name) || '-'} — {opLabel(r.last_op || '')} — {r.last_changed_at ? new Date(r.last_changed_at).toLocaleString() : '-'}
                  </td>
                  <td className="p-2 whitespace-nowrap">I:{r.count_I} U:{r.count_U} D:{r.count_D}</td>
                  <td className="p-2 whitespace-nowrap">
                    <button className="text-blue-600 hover:underline" onClick={() => setExpanded(prev => ({...prev, [String(r.rid)]: !prev[String(r.rid)]}))}>
                      {expanded[String(r.rid)] ? 'Masquer' : 'Voir'}
                    </button>
                  </td>
                </tr>
                {expanded[String(r.rid)] && (
                  <tr className="border-t bg-gray-50">
                    <td className="p-0" colSpan={7}>
                      <SeriesForRid table={table} rid={String(r.rid)} showDetails={showDetails} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {(() => { const cs = 7; return (
              <>
                {!loading && !error && data && data.rows.length === 0 && <tr><td colSpan={cs} className="p-4 text-center">Aucune donnée</td></tr>}
                {loading && <tr><td colSpan={cs} className="p-4 text-center">Chargement...</td></tr>}
                {error && !loading && <tr><td colSpan={cs} className="p-4 text-center text-red-600">{error}</td></tr>}
              </>
            ); })()}
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

const SeriesForRid: React.FC<{ table: string; rid: string; showDetails?: boolean }> = ({ table, rid, showDetails = false }) => {
  const [data,setData] = useState<ApiResult|null>(null);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState<string|null>(null);
  const { token } = useAuth();
  const itemTables = useMemo(() => getItemTables(table), [table]);
  const [subTab, setSubTab] = useState<string>('all');
  const [namesVersion, setNamesVersion] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true); setError(null);
    // Use main table and its items to get complete audit trail
    const allTables = [table, ...itemTables];
    fetchAudit(allTables, 1, 100, ctrl.signal, token || undefined, undefined, rid)
      .then(async r=>{
        setData(r);
        // resolve product names for any product_id referenced in this series
        const prodIds = Array.from(new Set(
          (r.rows || [])
            .flatMap(row => [
              row.new_data?.product_id,
              row.old_data?.product_id,
              row.new_data?.productId,
              row.old_data?.productId,
              typeof row.new_data?.product === 'number' || typeof row.new_data?.product === 'string' ? row.new_data?.product : (row.new_data?.product?.id),
              typeof row.old_data?.product === 'number' || typeof row.old_data?.product === 'string' ? row.old_data?.product : (row.old_data?.product?.id),
            ])
            .filter((x): x is number | string => x !== null && x !== undefined)
        )).map(String);
        if (prodIds.length) await resolveProductNames(prodIds, token || undefined);
        // contacts ids and client_remises ids
        const allRows = (r.rows || []);
        const contactIds = Array.from(new Set(
          allRows
            .flatMap(row => [
              row.new_data?.client_id, row.old_data?.client_id,
              row.new_data?.clientId, row.old_data?.clientId,
              row.new_data?.id_client, row.old_data?.id_client,
              row.new_data?.fournisseur_id, row.old_data?.fournisseur_id,
              row.new_data?.fournisseurId, row.old_data?.fournisseurId,
              row.new_data?.id_fournisseur, row.old_data?.id_fournisseur,
              // payments-specific: contact_id variants
              row.new_data?.contact_id, row.old_data?.contact_id,
              row.new_data?.contactId, row.old_data?.contactId,
              row.new_data?.id_contact, row.old_data?.id_contact,
            ])
            .filter((x): x is number | string => x !== null && x !== undefined)
        )).map(String);
        if (contactIds.length) await resolveContactNames(contactIds, token || undefined);
        const remiseIds = Array.from(new Set(
          allRows
            .filter(row => row.table_name === 'item_remises')
            .flatMap(row => [row.new_data?.client_id, row.old_data?.client_id])
            .filter((x): x is number | string => x !== null && x !== undefined)
        )).map(String);
        if (remiseIds.length) await resolveClientRemiseNames(remiseIds, token || undefined);
        setNamesVersion(v => v + 1);
      })
      .catch(e=>{ if(!ctrl.signal.aborted) setError(e.message);})
      .finally(()=>!ctrl.signal.aborted&&setLoading(false));
    return () => ctrl.abort();
  }, [table, itemTables, rid, token]);

  // Filter locally for sub-tab (no refetch)
  const filteredRows = useMemo(() => {
    const rows = data?.rows || [];
    if (subTab === 'all') return rows;
    if (subTab === 'main') return rows.filter(r => r.table_name === table);
    return rows.filter(r => r.table_name === subTab);
  }, [data, subTab, table]);

  // Build detailed sections for Creation (I), Modifications (U), and Deletion (D)
  // Group by timestamp to show related changes together
  const inserts = useMemo(() => filteredRows.filter(r => (r.operation || '').toUpperCase() === 'I'), [filteredRows]);
  const updates = useMemo(() => {
    const allUpdates = filteredRows.filter(r => (r.operation || '').toUpperCase() === 'U');
    // Group updates by timestamp (within 1 second) to show related changes together
    const grouped: { timestamp: string; rows: AuditRow[] }[] = [];
    
    allUpdates.sort((a,b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime());
    
    for (const update of allUpdates) {
      const updateTime = new Date(update.changed_at).getTime();
      // Find existing group within 1 second
      const existingGroup = grouped.find(g => {
        const groupTime = new Date(g.timestamp).getTime();
        return Math.abs(updateTime - groupTime) <= 1000; // 1 second tolerance
      });
      
      if (existingGroup) {
        existingGroup.rows.push(update);
      } else {
        grouped.push({ timestamp: update.changed_at, rows: [update] });
      }
    }
    
    return grouped;
  }, [filteredRows]);
  const deletes = useMemo(() => filteredRows.filter(r => (r.operation || '').toUpperCase() === 'D'), [filteredRows]);

  return (
    <div className="p-2">
  <span className="hidden">{namesVersion}</span>
      {loading && <div className="text-xs p-2">Chargement de la série…</div>}
      {error && <div className="text-xs p-2 text-red-600">{error}</div>}
      {!loading && !error && (
        <div className="space-y-4">
          {/* Sub-tabs for item tables (local only) */}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setSubTab('all')} className={`px-3 py-1 text-xs rounded border ${subTab==='all' ? 'bg-gray-800 text-white' : 'bg-white'}`}>Tout ({data?.rows?.length ?? 0})</button>
            <button onClick={() => setSubTab('main')} className={`px-3 py-1 text-xs rounded border ${subTab==='main' ? 'bg-gray-800 text-white' : 'bg-white'}`}>{humanizeTable(table)} ({(data?.rows || []).filter(r => r.table_name === table).length})</button>
            {itemTables.map(t => (
              <button key={t} onClick={() => setSubTab(t)} className={`px-3 py-1 text-xs rounded border ${subTab===t ? 'bg-gray-800 text-white' : 'bg-white'}`}>
                {humanizeTable(t)} ({(data?.rows || []).filter(r => r.table_name === t).length})
              </button>
            ))}
          </div>

          {/* Création */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span>Création</span>
            </h4>
            {inserts.length === 0 ? (
              <div className="text-sm text-gray-500 italic bg-gray-50 p-3 rounded">Aucune création enregistrée</div>
            ) : (
              <div className="space-y-3">
                {inserts.map(r => (
                  <div key={r.id} className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="flex items-center gap-3 text-sm mb-2">
                      <OperationsBadge op={r.operation} />
                      <span className="text-gray-600">{new Date(r.changed_at).toLocaleString()}</span>
                      <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded text-xs">
                        {toDisplayText(r.user_name) || 'Système'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-800 bg-white p-2 rounded border" title={buildSummary(r)}>
                      {buildSummary(r)}
                    </div>
                    {showDetails && (
                      <div className="mt-3">
                        <DiffView row={r} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Modifications */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
              <span>Modifications</span>
            </h4>
            {updates.length === 0 ? (
              <div className="text-sm text-gray-500 italic bg-gray-50 p-3 rounded">Aucune modification enregistrée</div>
            ) : (
              <div className="space-y-4">
                {updates.map((group) => (
                  <div key={`${group.timestamp}-${group.rows.map(r => r.id).join('-')}`} 
                       className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex flex-wrap items-center gap-3 text-sm mb-3 pb-2 border-b border-amber-200">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                        <span className="font-semibold text-amber-800">Modification groupée</span>
                      </div>
                      <span className="text-gray-600">{new Date(group.timestamp).toLocaleString()}</span>
                      <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded text-xs">
                        {toDisplayText(group.rows[0]?.user_name) || 'Système'}
                      </span>
                      <span className="ml-auto bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs font-medium">
                        {group.rows.length} table{group.rows.length > 1 ? 's' : ''} modifiée{group.rows.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    
                    {/* Show each table modification in the group */}
                    <div className="space-y-3">
                      {group.rows.map(r => {
                        const changed = getChangedFields(r, 999);
                        return (
                          <div key={r.id} className="bg-white border border-gray-200 rounded-lg p-3">
                            <div className="flex flex-wrap items-center gap-3 text-sm mb-2">
                              <OperationsBadge op={r.operation} />
                              <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-medium">
                                {humanizeTable(r.table_name)}
                              </span>
                              <span className="text-gray-600 font-mono">{formatRef(r)}</span>
                              {changed.length > 0 && (
                                <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">
                                  Champs: {changed.join(', ')}
                                </span>
                              )}
                            </div>
                            {showDetails && (
                              <div className="mt-3">
                                <DiffView row={r} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Suppression */}
          {deletes.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h4 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <span>Suppression</span>
              </h4>
              <div className="space-y-3">
                {deletes.map(r => (
                  <div key={r.id} className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <div className="flex items-center gap-3 text-sm mb-2">
                      <OperationsBadge op={r.operation} />
                      <span className="text-gray-600">{new Date(r.changed_at).toLocaleString()}</span>
                      <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded text-xs">
                        {toDisplayText(r.user_name) || 'Système'}
                      </span>
                    </div>
                    {showDetails && (
                      <div className="mt-3">
                        <DiffView row={r} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fallback */}
          {!data?.rows?.length && <div className="text-xs p-2">Aucun événement</div>}
        </div>
      )}
    </div>
  );
};

const AuditPage: React.FC = () => {
  // Auto-discovered tables from backend to avoid hard-coded keys; each table becomes a top-level tab
  const [autoTables, setAutoTables] = useState<string[]>([]);
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isPasswordVerified, setIsPasswordVerified] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPasswordError, setShowPasswordError] = useState(false);
  const initialModeParam = (searchParams.get('mode') || '').toLowerCase();
  const [viewMode, setViewMode] = useState<'logs'|'group'>(initialModeParam === 'group' ? 'group' : 'logs');
  const focusRid = useMemo(() => searchParams.get('id'), [searchParams]);
  const initialDetailsParam = searchParams.get('details') === '1';

  useEffect(() => {
    const ctrl = new AbortController();
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch('/api/audit/tables', { signal: ctrl.signal, headers })
      .then(r => r.ok ? r.json() : r.text().then(t => Promise.reject(new Error(t))))
      .then((list: string[]) => setAutoTables(Array.isArray(list) ? list : []))
      .catch(() => { /* ignore auto list errors for now */ })
      .finally(() => { /* no-op */ });
    return () => ctrl.abort();
  }, [token]);

  // Selected main tab equals selected table name
  const [mainTab, setMainTab] = useState<string>('');
  // Keep selection stable; when tables load or change, pick the first if current not present
  useEffect(() => {
    if (!autoTables.length) { setMainTab(''); return; }
    const fromUrl = searchParams.get('t');
    const preferred = fromUrl && autoTables.includes(fromUrl) ? fromUrl : null;
    const next = preferred || (!mainTab || !autoTables.includes(mainTab) ? autoTables[0] : mainTab);
    if (next !== mainTab) setMainTab(next);
  }, [autoTables, mainTab, searchParams]);

  // Vérification du mot de passe pour accéder à la page
  const handlePasswordVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cin: user?.cin,
          password: passwordInput,
        }),
      });

      if (response.ok) {
        setIsPasswordVerified(true);
        setShowPasswordError(false);
        setPasswordInput('');
      } else {
        setShowPasswordError(true);
      }
    } catch (error) {
      console.error('Erreur de vérification:', error);
      setShowPasswordError(true);
    }
  };

  // Afficher la popup de mot de passe si pas encore vérifié
  if (!isPasswordVerified) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
          <div className="flex items-center justify-center mb-4">
            <Users size={48} className="text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-center mb-2">Page Audit</h2>
          <p className="text-gray-600 text-center mb-6">
            Veuillez entrer le mot de passe pour accéder à cette page
          </p>
          <form onSubmit={handlePasswordVerification}>
            <div className="mb-4">
              <label htmlFor="password-verify" className="block text-sm font-medium text-gray-700 mb-2">
                Mot de passe
              </label>
              <input
                type="password"
                id="password-verify"
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setShowPasswordError(false);
                }}
                className={`w-full px-4 py-2 border ${showPasswordError ? 'border-red-500' : 'border-gray-300'} rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                placeholder="Entrez le mot de passe"
                autoFocus
              />
              {showPasswordError && (
                <p className="mt-2 text-sm text-red-600">
                  Mot de passe incorrect. Veuillez réessayer.
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="flex-1 bg-gray-100 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-200 transition-colors font-medium flex items-center justify-center gap-2"
              >
                <ArrowLeft size={18} />
                Retour
              </button>
              <button
                type="submit"
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium"
              >
                Accéder
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Audit</h1>
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="flex flex-wrap gap-2 mb-4">
          {autoTables.map(t => (
            <TabsTrigger key={t} value={t} className={`px-3 py-1 rounded border text-sm ${t===mainTab?'bg-gray-800 text-white':'bg-white'}`}>{humanizeTable(t)}</TabsTrigger>
          ))}
        </TabsList>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-gray-600">Vue:</span>
          <div className="inline-flex border rounded overflow-hidden">
            <button onClick={()=>setViewMode('logs')} className={`px-3 py-1 text-sm ${viewMode==='logs'?'bg-gray-800 text-white':'bg-white'}`}>Historique</button>
            <button onClick={()=>setViewMode('group')} className={`px-3 py-1 text-sm ${viewMode==='group'?'bg-gray-800 text-white':'bg-white'}`}>Groupes</button>
          </div>
        </div>
        <TabsContent value={mainTab}>
          {viewMode === 'logs' && mainTab && <AuditTable table={mainTab} initialShowDetails={initialDetailsParam} />}
          {viewMode === 'group' && mainTab && <GroupTable table={mainTab} focusRid={focusRid} initialShowDetails={initialDetailsParam} />}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AuditPage;
