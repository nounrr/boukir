import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { parseCountName,parseCountQuantity,parseCountEntry,hashCountToken,validCountToken,appendCountEntry,buildCountSearch,groupCountSummary,createCountSession } from './inventoryCounting.js';
import { createInventoryCountRouters } from '../routes/inventoryCounting.js';

const token='a'.repeat(43), session={id:1,title:'Comptage test',token_hash:hashCountToken(token),is_closed:0};
const body=(patch={})=>({name:'Ali Test',product_id:7,variant_id:null,quantity:'2.5',request_key:'request-key-000001',...patch});
function fixture() {
 let entries=[],nextId=1,closed=false,currentHash=session.token_hash,rollback=0;
 const query=async(sql,params=[])=>{
  if(sql.startsWith('CREATE'))return [[]];
  if(sql.includes('FROM inventory_count_sessions WHERE token_hash'))return [params[0]===currentHash?[{...session,is_closed:closed?1:0}]:[]];
  if(sql.includes('FROM inventory_count_sessions WHERE id = ? AND token_hash'))return [params[1]===currentHash?[{id:1,is_closed:closed?1:0}]:[]];
  if(sql.includes('FROM inventory_count_entries WHERE session_id = ? AND request_key'))return [entries.filter(row=>row.request_key===params[1])];
  if(sql.includes('FROM products p WHERE p.id'))return [Number(params[0])===7?[{product_id:7,variant_id:null,designation:'Produit',reference:'P7'}]:[]];
  if(sql.includes('FROM product_variants pv JOIN products'))return [Number(params[0])===7&&Number(params[1])===3?[{product_id:7,variant_id:3,designation:'Produit',variant_name:'Rouge',reference:'V3'}]:[]];
  if(sql.startsWith('INSERT INTO inventory_count_entries')){
   const row={id:nextId++,session_id:params[0],product_id:params[1],variant_id:params[2],entity_key:params[3],participant_name:params[4],participant_key:params[5],quantity:params[6],product_label:params[7],variant_label:params[8],reference:params[9],request_key:params[10]};entries.push(row);return [{insertId:row.id}];
  }
  if(sql.includes('LEFT JOIN inventory_count_entries')&&sql.includes('WHERE s.id'))return [[{...session,is_closed:closed?1:0}]];
  if(sql.includes('LEFT JOIN inventory_count_entries'))return [[{...session,entry_count:entries.length,item_count:new Set(entries.map(row=>row.entity_key)).size,participant_count:new Set(entries.map(row=>row.participant_key)).size,total_quantity:entries.reduce((sum,row)=>sum+Number(row.quantity),0)}]];
  if(sql.startsWith('UPDATE inventory_count_sessions SET token_hash')){currentHash=params[0];return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE inventory_count_sessions SET is_closed')){closed=Boolean(params[0]);return [{affectedRows:1}];}
  throw new Error('Unexpected fixture SQL: '+sql);
 };
 const conn={query,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{rollback++;},release(){}};
 return {db:{query,getConnection:async()=>conn},entries,close:()=>{closed=true;},get rollback(){return rollback;}};
}
test('names and quantities are bounded, normalized and accept a zero count',()=>{
 assert.equal(parseCountName('  Ali   Test ').key,parseCountName('ali test').key);
 assert.equal(parseCountQuantity('0'),'0.000');assert.equal(parseCountQuantity('1,125'),'1.125');assert.equal(parseCountQuantity(2),'2.000');
 for(const value of ['-1','1.0001','1000000000','1e3','NaN',{},null])assert.throws(()=>parseCountQuantity(value));
 for(const value of ['', 'a', 'x'.repeat(101), 'Ali\nTest',{}])assert.throws(()=>parseCountName(value));
 assert.throws(()=>parseCountEntry(body({variant_id:0})));assert.throws(()=>parseCountEntry(body({product_id:true})));assert.throws(()=>parseCountEntry(body({request_key:'short'})));
 assert.equal(validCountToken(token),true);assert.equal(validCountToken('../bad'),false);
});
test('every intentional count is additive, while retries return the original entry',async()=>{
 const f=fixture();
 const first=await appendCountEntry(f.db,session,body());
 const retry=await appendCountEntry(f.db,session,body());
 assert.equal(retry.id,first.id);assert.equal(retry.replayed,true);assert.equal(f.entries.length,1);
 await appendCountEntry(f.db,session,body({quantity:'1',request_key:'request-key-000002'}));
 await appendCountEntry(f.db,session,body({name:'Sara Test',quantity:'3',request_key:'request-key-000003'}));
 await appendCountEntry(f.db,session,body({variant_id:3,quantity:'0',request_key:'request-key-000004'}));
 assert.equal(f.entries.length,4);assert.equal(f.entries[0].entity_key,f.entries[1].entity_key);assert.notEqual(f.entries[0].entity_key,f.entries[3].entity_key);
 assert.equal(f.entries.reduce((sum,row)=>sum+Number(row.quantity),0),6.5);
 await assert.rejects(appendCountEntry(f.db,session,body({quantity:'9'})),error=>error.status===409);
});
test('closed sessions, cross-product variants and removed products cannot receive new counts',async()=>{
 const f=fixture();await assert.rejects(appendCountEntry(f.db,session,body({product_id:8})),error=>error.status===404);
 await assert.rejects(appendCountEntry(f.db,session,body({variant_id:99})),error=>error.status===404);
 f.close();await assert.rejects(appendCountEntry(f.db,session,body()),error=>error.status===410);
 assert.equal(f.entries.length,0);assert.equal(f.rollback,3);
});
test('search includes products and variants without public stock, pricing or publication filters',()=>{
 const {union,params}=buildCountSearch('sika 20%');assert.match(union,/UNION ALL/);assert.match(union,/pv.variant_name/);assert.deepEqual(params,['%sika%','%20=%%','%sika%','%20=%%']);
 assert.doesNotMatch(union,/prix|stock_quantity|quantite|ecom_published|en_validation/);
 assert.throws(()=>buildCountSearch('x'.repeat(121)));
});
test('summary retains variant separation, same-name totals, decimals and zero quantities',()=>{
 const rows=[{entity_key:'p:7',product_id:7,variant_id:null,designation:'Produit',reference:'P7',name:'Ali',quantity:'3.500',entry_count:2},{entity_key:'p:7',product_id:7,variant_id:null,designation:'Produit',reference:'P7',name:'Sara',quantity:'3.000',entry_count:1},{entity_key:'p:7:v:3',product_id:7,variant_id:3,designation:'Produit',variant_name:'Rouge',reference:'V3',name:'Ali',quantity:'0.000',entry_count:1}];
 const items=groupCountSummary(rows);assert.equal(items.length,2);assert.equal(items[0].quantity,6.5);assert.equal(items[0].participants.length,2);assert.equal(items[1].quantity,0);assert.equal(items[1].entry_count,1);
});
test('new session returns a special link while storing only its hash',async()=>{
 let saved;
 const db={query:async(sql,params)=>{
  if(sql.startsWith('INSERT')){saved=params;return [{insertId:2}];}
  return [[{id:2,title:'Inventaire',is_closed:0}]];
 }};
 const result=await createCountSession(db,'Inventaire',1);const raw=result.url.split('/').at(-1);
 assert.ok(validCountToken(raw));assert.equal(saved[1],hashCountToken(raw));assert.notEqual(saved[1],raw);assert.match(result.url,/^https:\/\/boukirdiamond\.com\/fr\/comptage\//);
});
test('HTTP special link bypasses login only for bounded public counting, staff management is protected',async t=>{
 const f=fixture(),{publicRouter,adminRouter}=createInventoryCountRouters(f.db);
 const app=express();app.use(express.json());app.use('/public',publicRouter);
 app.use((req,_res,next)=>{if(req.headers['x-test-role'])req.user={id:1,role:req.headers['x-test-role'],_currentUserValidated:true};next();});app.use('/admin',adminRouter);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));const url=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await fetch(`${url}/public/unknown`)).status,404);
 const meta=await fetch(`${url}/public/${token}`);assert.equal(meta.status,200);assert.match(meta.headers.get('Cache-Control'),/no-store/);assert.deepEqual(await meta.json(),{session:{id:1,title:'Comptage test'}});
 const submit=()=>fetch(`${url}/public/${token}/entries`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body())});
 assert.equal((await submit()).status,201);assert.equal((await submit()).status,200);assert.equal(f.entries.length,1);
 assert.equal((await fetch(`${url}/admin/sessions`)).status,401);
 const rotate=role=>fetch(`${url}/admin/sessions/1/link`,{method:'POST',headers:{'x-test-role':role}});
 assert.equal((await rotate('Employé')).status,403);
 assert.equal((await rotate('ManagerPlus')).status,200);
 assert.equal((await fetch(`${url}/public/${token}`)).status,404);
});
