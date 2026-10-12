import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseVideo} from './matching.mjs';
const p={reference:'P1',parentProductId:'1',variants:[{reference:'V1',parentProductId:'1'}]};
const clip=(reference,path)=>({reference,path,usable:true,duration:12,width:1280,height:720});
const proof={targetReference:'P1',sourceReference:'V1',parentProductId:'1',identicalUsage:true,evidence:'Même parent et application confirmée.'};
test('une vidéo exacte prime sur une vidéo de variante',()=>assert.equal(chooseVideo(p,[clip('P1','exact.mp4'),clip('V1','shared.mp4')],[proof]).videoSource,'exact_reference'));
test('aucune association par nom similaire ou code couleur',()=>assert.equal(chooseVideo(p,[clip('P1-extra','bad.mp4'),clip('Rouge','bad2.mp4')]).hasVideo,false));
test('partage uniquement avec variante du parent et preuve explicite',()=>assert.equal(chooseVideo(p,[clip('V1','shared.mp4')],[proof]).videoSource,'shared_variant'));
test('sans preuve ou parent différent: image réelle',()=>{
  assert.equal(chooseVideo(p,[clip('V1','shared.mp4')],[]).hasVideo,false);
  assert.equal(chooseVideo(p,[clip('V1','shared.mp4')],[{...proof,parentProductId:'2'}]).hasVideo,false);
});
test('fichier invalide et référence absente ne bloquent pas le montage',()=>{
  assert.deepEqual(chooseVideo(p,[{...clip('P1','broken.mp4'),usable:false}]),{usageVideo:null,videoSource:'none',hasVideo:false});
  assert.equal(chooseVideo({...p,reference:null},[clip('','bad.mp4')]).hasVideo,false);
});
test('choix éditorial revu prioritaire sur la résolution',()=>{
  assert.equal(chooseVideo(p,[{...clip('P1','a.mp4'),reviewedUsageScore:2},{...clip('P1','b.mp4'),reviewedUsageScore:8}]).usageVideo,'b.mp4');
});
