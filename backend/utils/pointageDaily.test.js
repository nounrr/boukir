import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyPresence, isCalendarDate, summarizePresenceDay } from './pointageDaily.js';
import { setPointageRequirement, ensurePointageRequirementSchema } from './pointageRequirements.js';

const day='2026-11-12';
const event=(id,direction,time,extra={})=>({id,employe_id:1,direction,local_date:day,local_time:time,occurred_at_utc:`2026-11-12T${String(Number(time.slice(0,2))-1).padStart(2,'0')}${time.slice(2)}.000Z`,...extra});
const employee=(id,extra={})=>({id,nom_complet:`Employé ${id}`,cin:`CIN${id}`,role:'Employé',pointage_obligatoire:1,...extra});
const now=new Date('2026-11-12T15:00:00Z');

test('daily work time sums sessions and ignores repeated entry/exit scans',()=>{
 const rows=[event(6,'sortie','17:00:00'),event(2,'entree','08:01:00'),event(1,'entree','08:00:00',{has_photo:1}),event(3,'sortie','12:00:00'),event(4,'sortie','12:01:00'),event(5,'entree','13:00:00')];
 const summary=summarizePresenceDay(rows,day,day,new Date('2026-11-12T17:00:00Z'));
 assert.equal(summary.statut,'termine');assert.equal(summary.entree,'08:00:00');assert.equal(summary.sortie,'17:00:00');
 assert.equal(summary.temps_travail_minutes,480);assert.equal(summary.entree_has_photo,true);assert.equal(summary.sortie_event_id,6);assert.deepEqual(summary.anomalies,[]);
});
test('live attendance counts only today and flags unclosed past days',()=>{
 const rows=[event(1,'entree','08:00:00')];
 const current=summarizePresenceDay(rows,day,day,now);
 assert.equal(current.statut,'present');assert.equal(current.sortie,null);assert.equal(current.temps_en_cours,true);assert.equal(current.temps_travail_minutes,480);
 const past=summarizePresenceDay(rows,day,'2026-11-13',new Date('2026-11-13T12:00:00Z'));
 assert.equal(past.temps_travail_minutes,0);assert.equal(past.temps_en_cours,false);assert.deepEqual(past.anomalies,['sortie_manquante']);
});
test('missing or unknown direction never invents an entry, exit or work time',()=>{
 assert.equal(summarizePresenceDay([],day,day,now).statut,'absent');
 const summary=summarizePresenceDay([event(1,'sortie','08:00:00'),event(2,'sortie','08:00:01'),event(3,'inconnu','09:00:00')],day,day,now);
 assert.equal(summary.statut,'absent');assert.equal(summary.entree,null);assert.equal(summary.sortie,null);assert.equal(summary.temps_travail_minutes,0);
 assert.deepEqual(summary.anomalies,['sortie_sans_entree','sens_inconnu']);
});
test('duration uses actual UTC time even when local clock labels repeat',()=>{
 const rows=[event(1,'entree','01:30:00',{occurred_at_utc:'2026-11-01 05:30:00.000000'}),event(2,'sortie','01:30:00',{occurred_at_utc:'2026-11-01 06:30:00.000000'})];
 assert.equal(summarizePresenceDay(rows,'2026-11-01','2026-11-01',new Date('2026-11-01T07:00:00Z')).temps_travail_minutes,60);
});
test('required employees appear absent from activation, respecting hire date and no future dates',()=>{
 const report=buildDailyPresence({month:'2026-11',now,employees:[employee(1),employee(2,{date_embauche:'2026-11-12'}),employee(3,{pointage_obligatoire:0})],periods:[{employe_id:1,start_date:'2026-11-10',end_date:null},{employe_id:2,start_date:'2026-11-01',end_date:null}],events:[]});
 assert.equal(report.data.length,4);assert.ok(report.data.every(row=>row.statut==='absent'));assert.ok(report.data.every(row=>row.date_pointage<=day));
 assert.deepEqual(report.data.filter(row=>row.employe_id===2).map(row=>row.date_pointage),[day]);
 assert.equal(report.today,day);
});
test('disabling requirements preserves prior days and reactivation does not fill the gap',()=>{
 const report=buildDailyPresence({month:'2026-11',now,employees:[employee(1)],periods:[{employe_id:1,start_date:'2026-11-01',end_date:'2026-11-03'},{employe_id:1,start_date:day,end_date:null}],events:[]});
 assert.deepEqual(report.data.map(row=>row.date_pointage),[day,'2026-11-02','2026-11-01']);
});
test('actual linked passages and manual absences remain visible without obligation; unassigned scans stay separate',()=>{
 const report=buildDailyPresence({month:'2026-11',now,employees:[employee(1,{pointage_obligatoire:0}),employee(2,{pointage_obligatoire:0})],periods:[],events:[event(1,'entree','08:00:00'),event(2,'sortie','12:00:00'),event(3,'entree','09:00:00',{employe_id:null})],absences:[{id:4,employe_id:2,date_absence:day,type_absence:'totale',motif:'Absence saisie'}]});
 assert.equal(report.data.length,2);assert.equal(report.unassigned_count,1);
 assert.equal(report.data.find(row=>row.employe_id===1).statut,'termine');
 assert.equal(report.data.find(row=>row.employe_id===2).absence_saisie.motif,'Absence saisie');
});
test('archived employees do not generate future absences and invalid dates are rejected',()=>{
 const report=buildDailyPresence({month:'2026-11',now,employees:[employee(1,{deleted_at:'2026-11-11'})],periods:[{employe_id:1,start_date:'2026-11-10',end_date:null}],events:[]});
 assert.deepEqual(report.data.map(row=>row.date_pointage),['2026-11-10']);
 assert.equal(isCalendarDate('2026-02-30'),false);assert.equal(isCalendarDate('2026-11-12'),true);
});
test('schema initialization is shared and retried after failure',async()=>{
 let columns=0;
 const db={query:async sql=>{if(sql.startsWith('SHOW')){columns++;return [[]];}return [[]];}};
 await Promise.all([ensurePointageRequirementSchema(db),ensurePointageRequirementSchema(db)]);assert.equal(columns,1);
 let fail=true;
 const unavailable={query:async()=>{if(fail)throw new Error('offline');return [[]];}};
 await assert.rejects(ensurePointageRequirementSchema(unavailable),/offline/);fail=false;await ensurePointageRequirementSchema(unavailable);
});
test('requirement changes lock the employee, retain periods and roll back missing employees',async()=>{
 const calls=[];let missing=false;
 const conn={beginTransaction:async()=>calls.push('begin'),commit:async()=>calls.push('commit'),rollback:async()=>calls.push('rollback'),release:()=>calls.push('release'),query:async(sql,params)=>{
  calls.push({sql,params});if(sql.startsWith('SELECT id,'))return [missing?[]:[{id:1,pointage_obligatoire:0}]];
  return [[]];
 }};
 const db={getConnection:async()=>conn};
 const result=await setPointageRequirement(db,1,true,9,day);assert.equal(result.pointage_obligatoire,true);
 assert.ok(calls.some(call=>call.sql?.includes('INSERT INTO pointage_requirement_periods')));assert.ok(calls.includes('commit'));
 calls.length=0;await setPointageRequirement(db,1,false,9,day);assert.ok(calls.some(call=>call.sql?.includes('SET end_date = ?')));
 calls.length=0;missing=true;await assert.rejects(setPointageRequirement(db,1,true,9,day),/introuvable/);assert.ok(calls.includes('rollback'));assert.equal(calls.at(-1),'release');
 await assert.rejects(setPointageRequirement(db,1,'true',9,day),/invalide/);
});

// Exercise the actual HTTP contract without database side effects.
test('daily endpoint returns initial absence, validates filters and preserves write permissions', async t => {
 const { default: express } = await import('express');
 const { createPointageRouters } = await import('../routes/pointage.js');
 const { pointageLocalDay } = await import('./pointageRequirements.js');
 const today=pointageLocalDay(), month=today.slice(0,7);
 const db={query:async(sql)=>{
  if(sql.startsWith('SHOW')) return [[{Field:'pointage_obligatoire'},{Field:'acces_gestion_absences'},{Field:'acces_statistiques_absences'}]];
  if(sql.includes('FROM employees') && sql.includes('DATE_FORMAT(date_embauche')) return [[employee(1,{date_embauche:today})]];
  if(sql.includes('FROM pointage_requirement_periods')) return [[{employe_id:1,start_date:today,end_date:null}]];
  return [[]];
 }};
 const {admin}=createPointageRouters(db,()=>({deviceKey:'TEST',timezone:'Africa/Casablanca'}));
 const app=express();app.use(express.json());
 app.use((req,_res,next)=>{if(req.headers['x-test-role']) req.user={id:1,role:req.headers['x-test-role'],acces_gestion_absences:req.headers['x-test-manage']==='yes'?1:0,_currentUserValidated:true};next();});
 app.use('/pointage',admin);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const url=`http://127.0.0.1:${server.address().port}/pointage`;
 const headers={'x-test-role':'PDG'};
 assert.equal((await fetch(`${url}/daily?month=${month}`)).status,401);
 assert.equal((await fetch(`${url}/daily?month=${month}`,{headers:{'x-test-role':'Manager'}})).status,403);
 const result=await (await fetch(`${url}/daily?month=${month}`,{headers})).json();
 assert.equal(result.data.length,1);assert.equal(result.data[0].statut,'absent');assert.equal(result.data[0].date_pointage,today);assert.equal(result.summary.absent,1);
 const present=await (await fetch(`${url}/daily?month=${month}&status=present`,{headers})).json();
 assert.equal(present.data.length,0);assert.equal(present.summary.absent,1);
 for(const filters of ['month=2026-13',`month=${month}&status=invalid`,`month=${month}&page=-1`,`month=${month}&employe_id=NaN`]) assert.equal((await fetch(`${url}/daily?${filters}`,{headers})).status,400);
 assert.equal((await fetch(`${url}/employees/1/requirement`,{method:'PATCH',headers:{'Content-Type':'application/json','x-test-role':'Manager','x-test-manage':'yes'},body:JSON.stringify({obligatoire:true})})).status,403);
 assert.equal((await fetch(`${url}/employees/1/requirement`,{method:'PATCH',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({obligatoire:'true'})})).status,400);
});
