import React, { useCallback, useState, Profiler } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { api } from './src/store/api/apiSlice';
import './src/index.css';
const baseline = new URLSearchParams(location.search).has('baseline');
const { CompletTable } = baseline ? await import('./src/pages/.ClientHistoryBaseline') : await import('./src/pages/.ClientHistoryOptimized');
const empty: any[] = [];
const rows: any[] = Array.from({length:10}, (_, doc) => ({kind:'sortie', data:{id:doc+1, date_creation:'2026-11-01', statut:'Validé', montant_total:1000, items:Array.from({length:100}, (_,i)=>({id:doc*100+i+1, product_id:doc*100+i+1, designation:`Produit ${doc*100+i+1}`, quantite:1, prix_unitaire:10, total:10}))}}));
const store = configureStore({reducer:{api:api.reducer,auth:()=>({user:{role:'Employé'}})},middleware:g=>g().concat(api.middleware)});
window.fetch=async()=>new Response(JSON.stringify({}),{headers:{'Content-Type':'application/json'}});
(window as any).measurements=[];
function App(){
 const [docs,setDocs]=useState(new Set<string>()),[items,setItems]=useState(new Set<string>());
 const toggle=useCallback((key:string)=>setDocs(prev=>{const n=new Set(prev);n.has(key)?n.delete(key):n.add(key);return n;}),[]);
 const toggleItem=useCallback((key:string)=>setItems(prev=>{const n=new Set(prev);n.has(key)?n.delete(key):n.add(key);return n;}),[]);
 const allItems=useCallback((keys:string[])=>setItems(prev=>{const n=new Set(prev), all=keys.every(k=>n.has(k));keys.forEach(k=>all?n.delete(k):n.add(k));return n;}),[]);
 return <><p id="counts">Bons {docs.size} · Lignes {items.size}</p><Profiler id="table" onRender={(_id,phase,duration)=>{if(phase==='update')(window as any).measurements.push(duration);}}><CompletTable rows={rows} detail soldeInitial={0} products={empty} remises={empty} selectedIds={docs} selectedItemIds={items} onToggleSelect={toggle} onToggleItem={toggleItem} onToggleAllItems={allItems}/></Profiler></>;
}
createRoot(document.getElementById('root')!).render(<Provider store={store}><MemoryRouter><App/></MemoryRouter></Provider>);
