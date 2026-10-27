import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {evaluateRoll,rollCommand,cocCheck,createDicePlugin,diceCommand} from '../index.mjs'
test('表达式、优先级、留骰、多轮和最大值不调用随机源',()=>{
 assert.equal(evaluateRoll('(2d6+3)*2',{roll:()=>4}).total,22)
 const dice=[1,6,3,5];assert.equal(evaluateRoll('4d6k3',{roll:()=>dice.shift()}).total,14)
 assert.equal(evaluateRoll('2d20kl1+5',{roll:()=>3}).total,8)
 assert.equal(evaluateRoll('-7/2').total,-3)
 assert.equal(evaluateRoll('d6-d6+6',{maximize:true,roll:()=>{throw Error('不能真骰')}}).total,11)
 assert.equal(rollCommand('3#d6 原因',{roll:()=>2}).results.length,3)
 assert.equal(rollCommand('好运',{roll:()=>1}).reason,'好运')
})
test('不执行代码、拒绝不合理表达式和无限骰数',()=>{
 for(const value of ['1/0','101d6','d0','d1000001','2d6kh3','1+process.exit()','2**3','('.repeat(20)+'1'+')'.repeat(20)])assert.throws(()=>evaluateRoll(value))
 assert.throws(()=>rollCommand('11#d6'));assert.throws(()=>rollCommand('2#100d6'))
 assert.equal(diceCommand('一般聊天 .r d20'),null);assert.equal(diceCommand('.random'),null)
 assert.equal(diceCommand('。r1d20').name,'r')
})
test('CoC边界和奖励惩罚骰的00不能成为0',()=>{
 assert.equal(cocCheck(49,{roll:()=>96}).label,'大失败');assert.equal(cocCheck(50,{roll:()=>96}).label,'失败')
 assert.equal(cocCheck(60,{roll:()=>1}).label,'大成功');assert.equal(cocCheck(60,{roll:()=>30}).label,'困难成功')
 assert.equal(cocCheck(60,{roll:()=>12}).label,'极难成功');assert.equal(cocCheck(60,{roll:()=>31,difficulty:'困难'}).success,false)
 let seq=[1,1,10];assert.deepEqual(cocCheck(50,{bonus:1,roll:()=>seq.shift()}).candidates,[100,90])
 seq=[1,1,10];assert.equal(cocCheck(50,{bonus:-1,roll:()=>seq.shift()}).result,100)
})
function fixture(options={}){let id=0;const group=[],privateMessages=[];const plugin=createDicePlugin(options);const event=(text,extra={})=>({message_type:'group',group_id:123,user_id:456,message_id:++id,sender:{nickname:'玩家'},message:[{type:'text',data:{text}}],...extra});const context={selfId:'999',sendGroup:async text=>group.push(text),sendPrivate:async text=>privateMessages.push(text)};return {plugin,event,context,group,privateMessages,run:(text,extra)=>plugin.handleEvent(event(text,extra),context)}}
test('角色卡、检定、SAN扣除和跨群隔离',async()=>{
 const f=fixture({roll:()=>100});await f.run('.pc new 侦探');await f.run('.st 侦查60 SAN70');await f.run('.sc 0/1d6')
 assert.match(f.group.at(-1),/70 → 64/,'大失败扣最大SAN')
 await f.run('.st show');assert.match(f.group.at(-1),/"SAN":64/)
 await f.run('.st 聆听50 坏字段');await f.run('.st show');assert.doesNotMatch(f.group.at(-1),/聆听/,'属性修改必须整条校验通过')
 await f.run('.ra 侦查',{group_id:124});assert.match(f.group.at(-1),/请填写技能值/)
 await f.run('.pc use 默认角色');assert.match(f.group.at(-1),/默认角色/)
})
test('暗骰只私聊、未知投递不重掷或在群泄漏',async()=>{
 const f=fixture({roll:()=>42});await f.run('.rh d100');assert.match(f.privateMessages[0],/42/);assert.doesNotMatch(f.group[0],/42/)
 const ev=f.event('.rh d100');await f.plugin.handleEvent(ev,{...f.context,sendPrivate:async()=>{throw Error('unknown')}})
 assert.match(f.group.at(-1),/未公开/);assert.doesNotMatch(f.group.at(-1),/42/)
 const rolls=f.plugin.status().rolls;await f.plugin.handleEvent(ev,f.context);assert.equal(f.plugin.status().rolls,rolls)
})
test('群开关权限、@其他骰子不抢答、普通消息不命中',async()=>{
 const f=fixture({roll:()=>6});await f.run('.dice off');assert.match(f.group.at(-1),/只有/)
 await f.run('.dice off',{sender:{role:'admin'}});const n=f.group.length;await f.run('.r d6');assert.equal(f.group.length,n)
 await f.run('.dice on',{sender:{role:'owner'}});await f.run('.r d6');assert.match(f.group.at(-1),/=6/)
 const r=await f.plugin.handleEvent(f.event('',{message:[{type:'at',data:{qq:'777'}},{type:'text',data:{text:'.r d6'}}]}),f.context);assert.equal(r.spoke,false)
 assert.equal((await f.run('你好')).handled,false)
})
test('重启后角色和去重保留，损坏数据不覆盖',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dice-store-')),file=path.join(dir,'state.json')
 try{const f=fixture({file,roll:()=>6});const ev=f.event('.st 侦查55');await f.plugin.handleEvent(ev,f.context)
  const next=createDicePlugin({file});assert.equal((await next.handleEvent(ev,f.context)).spoke,false)
  await next.handleEvent(f.event('.st show'),f.context);assert.match(f.group.at(-1),/侦查/)
  fs.writeFileSync(file,'broken');await next.handleEvent(f.event('.r d6'),f.context);assert.equal(fs.readFileSync(file,'utf8'),'broken');assert.match(f.group.at(-1),/读取失败/)
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
