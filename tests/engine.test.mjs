import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CONTENT as C} from '../content.js';
import {DAY,STORAGE_KEY,freshState,checkAnswer,planReview,buildQueue,applyGrade,validateState} from '../engine.js';
const now=Date.UTC(2026,9,3,8),ids=C.cards.map(c=>c.id);

test('Sixteen progressive lessons contain 160 contextual transformations and ten tasks each',()=>{
 assert.equal(C.lessons.length,16);assert.equal(C.patterns.length,16);assert.equal(new Set(C.patterns.map(p=>p.id)).size,16);assert.equal(new Set(ids).size,160);
 assert.deepEqual(['B1','B1+','B2'].map(level=>C.lessons.filter(l=>l.level===level).length),[6,4,6]);
 assert.deepEqual(C.patterns.map(p=>p.number),Array.from({length:16},(_,i)=>i+1));
 for(const l of C.lessons){const cards=C.cards.filter(c=>c.lesson===l.id);assert.equal(cards.length,10,l.id);assert.equal(new Set(cards.map(c=>c.kind)).size,4,l.id);assert.equal(C.patterns.filter(p=>p.lesson===l.id).length,1);assert(l.rule.length>=3);assert(l.trapRu);}
 for(const p of C.patterns){assert.equal(p.cardIds.length,10,p.id);assert(p.hook);for(const id of p.cardIds)assert.equal(C.cards.find(c=>c.id===id).pattern,p.id);}
 for(const c of C.cards){assert(c.direct,c.id+' direct quote');assert(c.context,c.id+' reporting context');assert(c.ru&&c.why,c.id+' Russian explanation');}
});
test('Canonical and authored alternative answers are accepted; distractors and authored errors rejected',()=>{
 for(const c of C.cards){assert.equal((c.prompt.match(/___/g)||[]).length,1,c.id);assert.equal(new Set(c.options).size,3,c.id);assert(checkAnswer(c,c.answer,'gap'),c.id);assert(checkAnswer(c,c.full,'fix'),c.id);assert(!checkAnswer(c,c.incorrect,'fix'),c.id+' authored error');assert(!checkAnswer(c,'','gap'));for(const a of c.alternatives)assert(checkAnswer(c,a,'gap'),c.id+' '+a);for(const a of c.fullAlternatives)assert(checkAnswer(c,a,'fix'),c.id+' '+a);for(const wrong of c.options.filter(a=>a!==c.answer&&!c.alternatives.includes(a)))assert(!checkAnswer(c,wrong,'choice'),c.id+' '+wrong);}
});
test('Explanation mode checks the grammar reason and rejects the other reasons',()=>{
 for(const c of C.cards){assert.equal(new Set(c.meaningOptions).size,3,c.id);assert(c.meaningOptions.includes(c.meaning),c.id);assert.equal(c.meaning,c.why,c.id);assert(checkAnswer(c,c.meaning,'why'));for(const x of c.meaningOptions.filter(x=>x!==c.meaning))assert(!checkAnswer(c,x,'why'));}
});
test('Full-sentence alternatives work without weakening word-order checks',()=>{
 const alternatives=C.cards.filter(c=>c.fullAlternatives.length);assert(alternatives.length>0,'The curriculum must accept natural authored variants');
 for(const c of alternatives){for(const a of c.fullAlternatives)assert(checkAnswer(c,a.toUpperCase().replace(/\.$/,'!'),'fix'),c.id);}
 const c=C.cards.find(c=>c.kind==='fix');assert(checkAnswer(c,c.full.toUpperCase().replace(/\.$/,'!'),'fix'));
 // Arbitrarily swapping the reporting verb and speaker must never become a valid answer.
 for(const c of C.cards.slice(0,10)){const words=c.full.split(' ');[words[0],words[1]]=[words[1],words[0]];assert(!checkAnswer(c,words.join(' '),'fix'),c.id);}
});
test('Contractions preserve the target meaning instead of conflating is and has',()=>{
 const card=full=>({full,fullAlternatives:[],answer:'finished',alternatives:[]});
 assert(checkAnswer(card('He has finished.'),"He's finished.",'fix'));
 assert(!checkAnswer(card('He has finished.'),'He is finished.','fix'));
 assert(checkAnswer(card('He had finished.'),"He'd finished.",'fix'));
 assert(!checkAnswer(card('He had finished.'),'He did finished.','fix'));
 assert(checkAnswer(card('She would help.'),"She'd help.",'fix'));
 assert(!checkAnswer(card('She would help.'),'She had help.','fix'));
 assert(checkAnswer(card('He had said she is ready.'),"He'd said she's ready.",'fix'));
 assert(!checkAnswer(card('He had said she has finished.'),'He had said she is finished.','fix'));
});
test('Large-font defaults persist and other English apps cannot overwrite Report',()=>{
 const s=freshState(now);assert.equal(STORAGE_KEY,'report-progress-v1');assert.equal(s.app,'report');assert.equal(s.settings.font,18);for(const size of [18,20,22]){s.settings.font=size;assert.equal(validateState(s,ids).settings.font,size);}for(const app of ['tense','article','verb','phrase'])assert.throws(()=>validateState({...s,app},ids));
});
test('All direct and reported examples have real Ryan MP3 recordings',()=>{
 const m=JSON.parse(fs.readFileSync(new URL('../audio-manifest.json',import.meta.url)));assert.equal(m.voice,'en-GB-RyanNeural');const expected=[...C.cards.flatMap(c=>[c.full,c.direct]),...C.lessons.map(l=>l.good),...C.signals.map(x=>x.en),...C.contrasts.flatMap(c=>[c.a,c.b])];for(const t of expected){assert(m.files[t],t);assert(m.files[t].seconds>.2,t);assert(fs.statSync(new URL('../'+m.files[t].src,import.meta.url)).size>1000,t);}
});
test('Spaced review grows only when due; failure returns in ten minutes and recovery in one day',()=>{
 let r=planReview({},'good',now);assert.equal(r.due,now+DAY);assert.equal(planReview(r,'easy',now+1000).due,r.due);r=planReview(r,'good',now+DAY);assert.equal(r.interval,3);r=planReview(r,'again',now+DAY);assert.equal(r.due,now+DAY+600000);r=planReview(r,'easy',now+DAY+1000,true);assert.equal(r.interval,1);
 const fresh=planReview({},'easy',now);assert.equal(fresh.interval,3);assert(planReview(fresh,'hard',now+DAY).due<=fresh.due);
});
test('Due cards come first; new material advances through the course and all modes have valid starter cards',()=>{
 const s=freshState(now);assert.deepEqual(buildQueue(C.cards,s,{now}),ids.slice(0,10));s.cards[ids[57]]=planReview({},'again',now-700000);assert.equal(buildQueue(C.cards,s,{now})[0],ids[57]);assert.deepEqual(buildQueue(C.cards,s,{now,mode:'due'}),[ids[57]]);for(const mode of ['why','listen','recall','mixed']){const q=buildQueue(C.cards,s,{now,mode});assert.equal(q.length,10,mode);assert(q.every(id=>ids.includes(id)),mode);}const lesson=C.lessons.at(-1).id;const q=buildQueue(C.cards,s,{now,lesson,mode:'why'});assert.equal(q.length,10);assert(q.every(id=>C.cards.find(c=>c.id===id).lesson===lesson));
 for(const c of C.cards.slice(0,10))s.cards[c.id]=planReview({},'good',now);const next=buildQueue(C.cards,s,{now});assert.equal(next[0],ids[57]);assert.deepEqual(next.slice(1),ids.slice(10,19));
});
test('An error clears only after successful recall on two distinct later days',()=>{
 const s=freshState(now),c=C.cards[0];applyGrade(s,c,'again',{now,wrong:true});applyGrade(s,c,'good',{now:now+1000,recovery:true});assert.equal(s.mistakes[c.id].successDays.length,0);applyGrade(s,c,'good',{now:now+DAY});applyGrade(s,c,'good',{now:now+DAY+1000});assert(!s.mistakes[c.id].resolved);applyGrade(s,c,'good',{now:now+2*DAY});assert(s.mistakes[c.id].resolved);
});
test('Backup preserves progress and paused sessions while filtering foreign IDs and unsafe settings',()=>{
 const s=freshState(now);applyGrade(s,C.cards[0],'good',{now});s.session={mode:'why',lesson:null,queue:ids.slice(0,10),index:1,initial:10,results:[],retries:{},failed:[],started:now};const restored=validateState(JSON.parse(JSON.stringify(s)),ids);assert.deepEqual(restored.cards,s.cards);assert.equal(restored.session.mode,'why');assert.equal(restored.session.index,1);const safe=validateState({...s,cards:{...s.cards,unknown:{due:123,stage:0,interval:1}},settings:{rate:99,font:999}},ids);assert.equal(safe.settings.font,18);assert.equal(safe.cards.unknown,undefined);assert.equal(validateState({...s,session:{...s.session,queue:['unknown']}},ids).session,null);
});
