import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createTheatre} from '../theatre.mjs?version=8'
import {createDicePlugin} from '../index.mjs'
test('群内use/stop累加、all、权限与停止后的文档记忆边界',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'npc-active-'));try{
 const file=path.join(dir,'dice.json'),t=createTheatre({file}),dice=createDicePlugin({file}),out=[];await dice.setKeeper('123','456');let id=0;const ctx={allowedGroups:['123'],sendGroup:async text=>out.push(text),sendPrivate:async text=>out.push(text)},ev=(text,uid=456)=>({message_type:'group',group_id:123,user_id:uid,message_id:++id,message:text,sender:{role:'member'}}),run=text=>t.handle(ev(text),ctx)
 for(const name of ['甲','乙'])await t.change('123',{npc:{name,background:name+'的背景'}})
 assert.equal(await t.recordGroup({group:123,id:1,text:'尚未启用的内容'}),0);await t.handle(ev('.npc use all',777),ctx);assert.match(out.at(-1),/只有/)
 await run('.npc use 甲');await run('.npc use 乙');assert.equal(t.status()['123'].npcs['甲'].active,true);assert.equal(t.status()['123'].npcs['乙'].active,true)
 assert.equal(await t.recordGroup({group:123,id:30,text:'同时看见的大雨'}),2);assert.equal(await t.recordGroup({group:123,id:30,text:'重复回声'}),0);assert.equal(await t.recordGroup({group:124,id:30,text:'其他群'}),0)
 await run('.npc stop 甲');await t.recordGroup({group:123,id:31,text:'甲没有见过的事情'});assert.equal(t.memoryStatus('123','甲').entries,1);assert.equal(t.memoryStatus('123','乙').entries,2)
 await run('.npc use 甲');await t.recordGroup({group:123,id:32,text:'甲回来之后的事情'});const text=fs.readFileSync(path.join(t.memoryStatus('123','甲').path,'记忆.txt'),'utf8');assert.match(text,/同时看见的大雨/);assert.match(text,/甲回来之后/);assert.doesNotMatch(text,/尚未启用|没有见过|其他群/)
 await run('.npc stop all');assert.ok(Object.values(t.status()['123'].npcs).every(n=>n.active===false));assert.equal(await t.recordGroup({group:123,id:33,text:'都停止了'}),0);await run('.npc use all');assert.ok(Object.values(t.status()['123'].npcs).every(n=>n.active));assert.equal(t.memoryStatus('123','甲').entries,2)
 const t2=createTheatre({file});assert.equal(t2.memoryStatus('123','甲').active,true);await t2.handle(ev('人格模拟【甲】：【询问刚才的雨】'),{...ctx,generate:async task=>{const input=JSON.parse(task.user);assert.ok(input.groupMemory.some(x=>x.text.includes('大雨')));assert.ok(!input.groupMemory.some(x=>x.text.includes('没有见过')));return '甲望着雨幕。'}})
 }finally{fs.rmSync(dir,{recursive:true,force:true})}})
test('超过100位NPC均可启用，停止会阻止未完成的旧生成回填',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'npc-many-'));try{
 const file=path.join(dir,'dice.json'),t=createTheatre({file}),out=[];for(let i=0;i<105;i++)await t.change('123',{npc:{name:'NPC'+i,background:'这是背景'}});await t.change('123',{activation:{name:'all',active:true}});assert.equal(Object.values(t.status()['123'].npcs).filter(n=>n.active).length,105)
 let finish,start;const ready=new Promise(r=>start=r),p=t.handle({message_type:'group',group_id:123,user_id:456,message_id:1,message:'人格模拟【NPC0】：【问候】'},{sendGroup:async text=>out.push(text),generate:async()=>{start();return await new Promise(r=>finish=r)}});await ready;await t.change('123',{activation:{name:'NPC0',active:false}});finish('这是旧生成');await p;assert.match(out.at(-1),/NPC已停止/);assert.doesNotMatch(out.at(-1),/这是旧生成/);assert.equal(t.status()['123'].history['g:123:NPC0'],undefined)
 }finally{fs.rmSync(dir,{recursive:true,force:true})}})
