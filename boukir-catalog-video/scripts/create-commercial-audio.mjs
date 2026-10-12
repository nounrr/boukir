import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
// Original instrumental score, synthesized locally. No third-party recording.
const rate=48000,seconds=40,channels=2;
const samples=rate*seconds;
const buf=Buffer.alloc(44+samples*channels*2);
buf.write('RIFF');buf.writeUInt32LE(buf.length-8,4);buf.write('WAVE',8);buf.write('fmt ',12);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(channels,22);buf.writeUInt32LE(rate,24);buf.writeUInt32LE(rate*channels*2,28);buf.writeUInt16LE(4,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(samples*4,40);
const chords=[[146.832,174.614,220],[116.541,146.832,174.614],[130.813,174.614,220],[130.813,164.814,195.998]];
const transitions=[6,13,20,27,34];
let seed=1948;function noise(){seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296*2-1;}
for(let i=0;i<samples;i++){
 const t=i/rate,beat=.6,phase=t%beat,step=Math.floor(t/beat),chord=chords[Math.floor(t/4.8)%4];
 const fade=Math.min(t/1.4,1,(seconds-t)/2.5);
 let pad=0;for(const hz of chord)pad+=(Math.sin(2*Math.PI*hz*t)*.022+Math.sin(2*Math.PI*hz*2*t+.3)*.011)*(0.8+0.2*Math.sin(t*.7));
 const pulse=Math.sin(2*Math.PI*chord[0]/2*t)*.09*Math.exp(-phase*5);
 const kick=Math.sin(2*Math.PI*(45*phase+5*(1-Math.exp(-phase*30))))*.16*Math.exp(-phase*18);
 const hat=noise()*.024*Math.exp(-(t%(beat/2))*65);
 const arptime=t%(beat/2),arpHz=chord[(Math.floor(t/(beat/2)))%3]*2;
 const arp=(Math.sin(2*Math.PI*arpHz*arptime)+.2*Math.sin(2*Math.PI*arpHz*3*arptime))*.022*Math.exp(-arptime*11);
 const snap=(step%2===1?noise()*.045*Math.exp(-phase*35):0);
 let fx=0;for(const at of transitions){const delta=t-at;if(delta>-.25&&delta<.5)fx+=noise()*.075*Math.exp(-Math.abs(delta)*11)+Math.sin(2*Math.PI*54*delta)*.07*Math.exp(-Math.max(delta,0)*14)*(delta>0?1:0);}
 const v=(pad+pulse+kick+hat+arp+snap+fx)*Math.max(0,fade);
 const side=Math.sin(2*Math.PI*chord[1]*t)*.006*fade;
 buf.writeInt16LE(Math.round(Math.tanh((v+side)*1.25)*32767),44+i*4);
 buf.writeInt16LE(Math.round(Math.tanh((v-side)*1.25)*32767),46+i*4);
}
const dir=path.resolve(import.meta.dirname,'../public/commercial');await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'original-soundtrack.wav'),buf);console.log('Original score: 40 seconds, stereo, 48 kHz');
