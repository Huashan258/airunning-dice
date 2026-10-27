import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createTheatre,theatreCommand} from '../theatre.mjs?version=3'
import {createDicePlugin} from '../index.mjs'
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dice-npc-')),file=path.join(dir,'state.json'),dice=createDicePlugin({file,roll:()=>1}),theatre=createTheatre({file});let id=0;const out=[],tasks=[];const ctx={selfId:'999',allowedGroups:['123','124'],sendGroup:async t=>out.push({channel:'group',text:t}),sendPrivate:async t=>out.push({channel:'private',text:t}),generate:async t=>{tasks.push(t);return t.kind==='simulation'?'老板擦了擦酒杯。“有事便说。”':'这次成功得漂亮。'}};const ev=(text,group=false,uid=456)=>({message_type:group?'group':'private',group_id:123,user_id:uid,message_id:++id,sender:{nickname:'KP'},message:[{type:'text',data:{text}}]});return {dir,file,dice,theatre,out,tasks,ctx,ev,run:(text,group,uid)=>theatre.handle(ev(text,group,uid),ctx),done:()=>fs.rmSync(dir,{recursive:true,force:true})}}
test('KP私聊NPC维护按UID和群隔离，背景不进入群回复，可重启读取',async()=>{const f=fixture();try{
 await f.dice.setKeeper('123','456');await f.run('.npc 123 老板 隐藏背景：旧城的密探',false,777);assert.match(f.out.at(-1).text,/只有/);assert.deepEqual(f.theatre.status(),{})
 await f.run('.npc 124 老板 背景');assert.match(f.out.at(-1).text,/只有/)
 await f.run('.npc 123 老板 隐藏背景',true);assert.match(f.out.at(-1).text,/私聊/);assert.doesNotMatch(f.out.at(-1).text,/隐藏背景/)
 const r=await f.run('.npc 123 老板 隐藏背景：旧城的密探\n性格寡言');assert.equal(r.privateSetup,true);assert.doesNotMatch(r.text,/密探/);assert.match(createTheatre({file:f.file}).status()['123'].npcs['老板'].background,/寡言/)
 await f.run('.npc list 123');assert.match(f.out.at(-1).text,/老板/);await f.run('.npc use 123 老板');assert.equal(f.theatre.status()['123'].selected,'老板')
 await f.run('.npc 888 老板 背景');assert.match(f.out.at(-1).text,/白名单/);await assert.rejects(f.theatre.change('123',{maxChars:20}),/80/)
 await f.run('.npc delete 123 老板');assert.equal(f.theatre.status()['123'].selected,'');assert.deepEqual(f.theatre.status()['123'].npcs,{})
 }finally{f.done()}})
test('人格模拟固定纯文格式，群/私聊上下文隔离，去重/开关/模型失败不转普通聊天',async()=>{const f=fixture();try{
 assert.equal(theatreCommand('人格模拟：【开门】').body,'开门');assert.equal(theatreCommand('普通闲聊'),null)
 await f.dice.setKeeper('123','456');await f.run('.npc 123 老板 寡言的酒馆老板');await f.run('.npc use 123 老板');const event=f.ev('人格模拟：【PL走进酒馆】',true,789);await f.theatre.handle(event,f.ctx);assert.equal(f.out.at(-1).text,'青娥模拟：【老板擦了擦酒杯。“有事便说。”】');assert.equal(f.tasks[0].kind,'simulation')
 await f.theatre.handle(event,f.ctx);assert.equal(f.tasks.length,1);await f.run('人格模拟：【PL问候老板】',true);assert.equal(JSON.parse(f.tasks.at(-1).user).recent.length,1)
 await f.run('人格模拟：【测试秘密】');assert.equal(f.out.at(-1).channel,'private');assert.equal(JSON.parse(f.tasks.at(-1).user).recent.length,0)
 await f.run('人格模拟：【冒充KP】',false,777);assert.match(f.out.at(-1).text,/选择模拟对象/);assert.equal(f.tasks.length,3)
 await f.theatre.change('123',{enabled:false});await f.run('人格模拟：【开门】',true);assert.match(f.out.at(-1).text,/关闭/)
 await f.theatre.change('123',{enabled:true,npc:{name:'老板',background:'新背景'}});assert.deepEqual(f.theatre.status()['123'].history,{})
 const failure=await f.theatre.handle(f.ev('人格模拟：【开门】',true),{...f.ctx,generate:async()=>{throw Error('network')}});assert.equal(failure.handled,true);assert.match(failure.text,/未完成/)
 await f.dice.setKeeper('123','777');await f.run('人格模拟：【开门】');assert.match(f.out.at(-1).text,/当前KP/)
 }finally{f.done()}})
test('骰点评沿用真实检定结果，一条投递；暗骰及点评只私发；关闭和失败不丢骰点',async()=>{const f=fixture();try{
 await f.dice.handleEvent(f.ev('.ra 侦查50',true),f.ctx);assert.equal(f.tasks[0].kind,'commentary');assert.match(f.tasks[0].user,/大成功/);assert.match(f.out.at(-1).text,/成功得漂亮/);assert.equal(f.out.length,1)
 await f.dice.handleEvent(f.ev('.rah 侦查50',true),f.ctx);assert.equal(f.out.at(-2).channel,'private');assert.match(f.out.at(-2).text,/成功得漂亮/);assert.doesNotMatch(f.out.at(-1).text,/大成功|漂亮|D100/)
 await f.theatre.change('123',{commentary:false});await f.dice.handleEvent(f.ev('.r d1',true),f.ctx);assert.equal(f.tasks.length,2);assert.doesNotMatch(f.out.at(-1).text,/漂亮/)
 await f.theatre.change('123',{commentary:true});await f.dice.handleEvent(f.ev('.r d1',true),{...f.ctx,generate:async()=>{throw Error('offline')}});assert.match(f.out.at(-1).text,/d1 = 1/);assert.equal(f.dice.status().rolls,4)
 }finally{f.done()}})
test('多NPC显式调用，好感按NPC/QQ/群隔离并限幅，重复消息不重复加分',async()=>{const f=fixture();try{
 await f.theatre.change('123',{npc:{name:'老板',background:'寡言而心善'},affinityInitial:98,affinityStep:5});await f.theatre.change('123',{npc:{name:'旅人',background:'警惕陌生人'}});await f.theatre.change('123',{activation:{name:'all',active:true}})
 const ctx={...f.ctx,generate:async task=>{assert.equal(task.json,true);return JSON.stringify({reply:'老板点头，收下了礼物。',affinityDelta:99,reason:'PL善意帮助'})}}
 const ev=f.ev('人格模拟【旅人】：【PL帮助旅人寻找行李】',true);await f.theatre.handle(ev,ctx);let t=f.theatre.status()['123'];assert.equal(t.selected,'老板','显式指定不改变默认');assert.equal(t.npcs['旅人'].affinity['456'].score,100);assert.equal(t.npcs['旅人'].affinity['456'].lastDelta,2);assert.equal(t.npcs['老板'].affinity,undefined);assert.doesNotMatch(f.out.at(-1).text,/affinity|99|100|PL善意帮助/)
 await f.theatre.handle(ev,ctx);assert.equal(f.theatre.status()['123'].npcs['旅人'].affinity['456'].lastDelta,2)
 await f.theatre.handle(f.ev('人格模拟【旅人】：【PL恶意威胁旅人】',true,777),{...ctx,generate:async()=>JSON.stringify({reply:'旅人后退一步。',affinityDelta:-100,reason:'受到威胁'})});assert.equal(f.theatre.status()['123'].npcs['旅人'].affinity['777'].score,93);assert.equal(f.theatre.status()['123'].npcs['旅人'].affinity['456'].score,100)
 await f.theatre.change('124',{npc:{name:'旅人',background:'另一位旅人'}});assert.equal(f.theatre.status()['124'].npcs['旅人'].affinity,undefined)
 await f.theatre.change('123',{npc:{name:'旅人',background:'更新背景'}});assert.equal(f.theatre.status()['123'].npcs['旅人'].affinity['456'].score,100,'编辑背景保留关系')
 await f.theatre.change('123',{affinity:{npc:'旅人',uid:'456',score:-90}});assert.equal(f.theatre.status()['123'].npcs['旅人'].affinity['456'].score,-90);await assert.rejects(f.theatre.change('123',{affinity:{npc:'旅人',uid:'456',score:101}}),/好感度/)
 await f.theatre.change('123',{affinityEnabled:false});await f.theatre.handle(f.ev('人格模拟【旅人】：【问候】',true),{...f.ctx,generate:async task=>{assert.equal(task.json,false);return '旅人点了点头。'}});assert.equal(f.theatre.status()['123'].npcs['旅人'].affinity['456'].score,-90)
 await f.run('人格模拟【不存在】：【问候】',true);assert.match(f.out.at(-1).text,/添加NPC/)
 }finally{f.done()}})
test('模型无有效好感判定保持原值，生成中手动改分不会被旧结果覆盖',async()=>{const f=fixture();try{
 await f.theatre.change('123',{npc:{name:'老板',background:'酒馆老板'},activation:{name:'老板',active:true}});await f.run('人格模拟：【问候】',true);assert.equal(f.theatre.status()['123'].npcs['老板'].affinity['456'].score,0)
 let resolve,started;const ready=new Promise(r=>started=r),pending=f.theatre.handle(f.ev('人格模拟：【赠送食物】',true),{...f.ctx,generate:async()=>{started();return await new Promise(r=>resolve=r)}});await ready;await f.theatre.change('123',{affinity:{npc:'老板',uid:'456',score:60}});resolve(JSON.stringify({reply:'老板收下了食物。',affinityDelta:5,reason:'收到食物'}));await pending;assert.equal(f.theatre.status()['123'].npcs['老板'].affinity['456'].score,60)
 }finally{f.done()}})
