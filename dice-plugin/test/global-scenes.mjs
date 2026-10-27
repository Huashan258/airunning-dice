import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createTheatre} from '../theatre.mjs?version=9'
import {createDicePlugin} from '../index.mjs'
import {ensureCatalog,sceneParticipants} from '../catalogue.mjs?version=9'
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'npc-scene-')),file=path.join(dir,'dice.json'),t=createTheatre({file});let id=0;const output=[],ctx={allowedGroups:['123','124'],sendGroup:async text=>output.push(text),sendPrivate:async text=>output.push(text)},event=(message,group=123)=>({message_type:'group',group_id:group,user_id:456,message_id:++id,message,sender:{nickname:'KP'}});return {dir,file,t,ctx,output,event,done:()=>fs.rmSync(dir,{recursive:true,force:true})}}
test('全群共用角色/别名，另一个群无需重新添加，启停与好感仍独立',async()=>{const f=fixture();try{
 await f.t.change('123',{npc:{name:'科比·布莱恩特',background:'篮球巨星'},activation:{name:'all',active:true}});const status=createDicePlugin({file:f.file}).status(['123','124']);assert.equal(status.npcScope,'global');assert.equal(status.theatres['124'].npcs['科比·布莱恩特'].background,'篮球巨星');assert.equal(status.theatres['124'].npcs['科比·布莱恩特'].active,false)
 await f.t.change('124',{activation:{name:'all',active:true},affinity:{npc:'科比·布莱恩特',uid:'456',score:50}});await f.t.change('124',{npc:{name:'科比·布莱恩特',background:'共享的新背景',aliases:['曼巴']}});assert.equal(f.t.status()['123'].npcs['科比·布莱恩特'].background,'共享的新背景');assert.equal(f.t.status()['123'].npcs['科比·布莱恩特'].affinity,undefined)
 await createDicePlugin({file:f.file}).setKeeper('124','456');await f.t.handle(f.event('.npc stop 曼巴',124),f.ctx);assert.equal(f.t.status()['124'].npcs['科比·布莱恩特'].active,false);assert.equal(f.t.status()['123'].npcs['科比·布莱恩特'].active,true)
 }finally{f.done()}})
test('科比给佐巴杨传球，别名识别两位NPC，一条模拟同时回应并分别更新',async()=>{const f=fixture();try{
 await f.t.change('123',{npc:{name:'科比·布莱恩特',background:'篮球巨星'}});await f.t.change('123',{npc:{name:'阿拉·佐巴扬',background:'亡灵机长'},activation:{name:'all',active:true}});let calls=0;const result=await f.t.handle(f.event('人格模拟：科比将一半的球丢给佐巴杨'),{...f.ctx,generate:async task=>{calls++;const input=JSON.parse(task.user);assert.deepEqual(input.requiredNpcs,['科比·布莱恩特','阿拉·佐巴扬']);assert.equal(input.participants.length,2);return JSON.stringify({turns:[{npc:'科比·布莱恩特',reply:'扬手把半个球抛了过去，笑道：“接好了！”',affinityDelta:1,reason:'一起玩球'},{npc:'阿拉·佐巴扬',reply:'伸手接住，掂了掂半个球：“这可怎么打？”',affinityDelta:2,reason:'收到球'}]})}});assert.equal(calls,1);assert.match(result.text,/科比·布莱恩特/);assert.match(result.text,/阿拉·佐巴扬.*接住/s);assert.deepEqual(result.participants,['科比·布莱恩特','阿拉·佐巴扬']);for(const name of result.participants)assert.equal(f.t.status()['123'].history['g:123:'+name].length,1);assert.equal(f.t.status()['123'].npcs['阿拉·佐巴扬'].affinity['456'].score,2)
 }finally{f.done()}})
test('目标NPC停用时提示启用；模型遗漏目标重试一次，仍缺失则不发单人伪互动',async()=>{const f=fixture();try{
 for(const name of ['科比','佐巴杨'])await f.t.change('123',{npc:{name,background:'背景'}});await f.t.change('123',{activation:{name:'科比',active:true}});let calls=0;const ctx={...f.ctx,generate:async()=>{calls++;return JSON.stringify({turns:[{npc:'科比',reply:'抛球。'}]})}};let r=await f.t.handle(f.event('人格模拟：科比将球丢给佐巴杨'),ctx);assert.equal(calls,0);assert.match(r.text,/佐巴杨.*尚未启用/);await f.t.change('123',{activation:{name:'all',active:true}});r=await f.t.handle(f.event('人格模拟：科比将球丢给佐巴杨'),ctx);assert.equal(calls,2);assert.match(r.text,/未生成全部NPC/);assert.equal(f.t.status()['123'].history['g:123:科比'],undefined)
 }finally{f.done()}})
test('同名旧角色不同背景保留变体，英文角色名不误命中数字前缀',()=>{const d={theatres:{123:{selected:'老板',npcs:{老板:{background:'甲'}}},124:{selected:'老板',npcs:{老板:{background:'乙'}}}}};ensureCatalog(d);assert.equal(Object.keys(d.npcCatalog).length,2);assert.equal(d.npcCatalog['老板'].background,'甲');assert.equal(d.npcCatalog['老板（124）'].background,'乙');assert.equal(d.theatres['124'].selected,'老板（124）');assert.deepEqual(sceneParticipants({NPC1:{},NPC10:{}},'NPC10喝水',null,null),['NPC10'])})
