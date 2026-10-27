import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createScripts,scriptMemoryAllowed} from '../scripts.mjs?version=10'
import {createTheatre} from '../theatre.mjs?version=10'
import {createDicePlugin} from '../index.mjs'
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'npc-policy-')),file=path.join(dir,'dice.json'),scriptFile=path.join(dir,'scripts.json'),scripts=createScripts({root:dir,file:scriptFile,diceFile:file}),t=createTheatre({file,memoryAllowed:g=>scriptMemoryAllowed(scriptFile,g)});let id=0;const out=[],ctx={sendGroup:async text=>out.push(text)},ev=message=>({message_type:'group',group_id:123,user_id:456,message_id:++id,message,sender:{nickname:'QQ昵称'}});return {dir,file,t,scripts,out,ctx,ev,done:()=>fs.rmSync(dir,{recursive:true,force:true})}}
test('NPC使用.nn角色名；log off禁止读取历史/文档/好感及保存新记忆，on恢复',async()=>{const f=fixture();try{
 const dice=createDicePlugin({file:f.file});await dice.handleEvent(f.ev('.nn 银牌调查员'),{sendGroup:async()=>{}});await f.t.change('123',{npc:{name:'店主',background:'酒馆店主'},activation:{name:'all',active:true}});await f.scripts.control('123','on','夜话');await f.t.recordGroup({group:123,uid:456,name:'QQ昵称',id:88,text:'此前的秘密'});let task;
 await f.t.handle(f.ev('人格模拟：【问候】'),{...f.ctx,generate:async o=>{task=JSON.parse(o.user);return JSON.stringify({reply:'银牌调查员，请坐。',affinityDelta:2,reason:'问候'})}});assert.equal(task.player.name,'银牌调查员');assert.equal(f.t.status()['123'].npcs['店主'].affinity['456'].name,'银牌调查员')
 await f.scripts.control('123','off');assert.equal(await f.t.recordGroup({group:123,id:89,text:'暂停时发生的事'}),0);const before=JSON.stringify(f.t.status()['123'].history);await f.t.handle(f.ev('人格模拟：【继续问候】'),{...f.ctx,generate:async o=>{task=JSON.parse(o.user);return JSON.stringify({reply:'银牌调查员，晚上好。',affinityDelta:5})}});assert.deepEqual(task.recent,[]);assert.deepEqual(task.groupMemory,[]);assert.equal(task.participants[0].affinity,undefined);assert.equal(JSON.stringify(f.t.status()['123'].history),before);assert.equal(f.t.status()['123'].npcs['店主'].affinity['456'].score,2)
 const edit=await f.t.replaceMemory('123','店主','店主记得银牌调查员曾归还失物');assert.ok(fs.existsSync(path.join(edit.backup,'记忆.txt')));assert.equal(f.t.memoryStatus('123','店主').memoryAllowed,false);assert.match(f.t.memoryStatus('123','店主').text,/归还失物/)
 await f.scripts.control('123','on');await f.t.handle(f.ev('人格模拟：【问起旧事】'),{...f.ctx,generate:async o=>{task=JSON.parse(o.user);return '店主提起归还失物一事。'}});assert.ok(task.groupMemory.some(x=>x.text.includes('归还失物')));assert.ok(!task.groupMemory.some(x=>x.text.includes('暂停时')))
 }finally{f.done()}})
test('log off可在无剧本时关闭NPC记忆；在途携带旧记忆的生成被取消',async()=>{const f=fixture();try{
 await f.t.change('123',{npc:{name:'店主',background:'背景'},activation:{name:'all',active:true}});await f.scripts.control('123','off');assert.equal(scriptMemoryAllowed(path.join(f.dir,'scripts.json'),'123'),false);await f.scripts.control('123','on','测试');let finish,start;const ready=new Promise(r=>start=r),pending=f.t.handle(f.ev('人格模拟：【问候】'),{...f.ctx,generate:async()=>{start();return await new Promise(r=>finish=r)}});await ready;await f.scripts.control('123','off');finish('来自旧记忆的答复');await pending;assert.match(f.out.at(-1),/记忆读写已暂停/);assert.doesNotMatch(f.out.at(-1),/来自旧记忆/)
 }finally{f.done()}})
