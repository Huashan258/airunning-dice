import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createDicePlugin} from '../index.mjs'
function fixture(options={}){let id=0;const messages=[];const plugin=createDicePlugin({roll:()=>1,...options});const event=(text,extra={})=>({message_type:'group',group_id:123,user_id:456,message_id:++id,sender:{nickname:'KP甲',role:'member'},message:[{type:'text',data:{text}}],...extra});const context={selfId:'999',sendGroup:async t=>messages.push(t),sendPrivate:async()=>{}};return {plugin,messages,event,context,run:(text,extra)=>plugin.handleEvent(event(text,extra),context)}}
test('每群KP、原生@指定、权限、查看/清除和不创建角色卡',async()=>{
 const f=fixture();await f.run('.kp 789');assert.match(f.messages.at(-1),/只有/);assert.deepEqual(f.plugin.status().keepers,{})
 await f.run('',{sender:{role:'admin'},message:[{type:'text',data:{text:'.kp '}},{type:'at',data:{qq:'789'}}]});assert.equal(f.plugin.status().keepers['123'].uid,'789')
 assert.equal(f.plugin.status().players,0)
 await f.run('.kp 查看');assert.match(f.messages.at(-1),/789/)
 await f.run('.kp 查看',{group_id:124});assert.match(f.messages.at(-1),/尚未设定/)
 await f.run('.kp 我',{sender:{role:'owner',nickname:'KP甲'}});assert.equal(f.plugin.status().keepers['123'].name,'KP甲')
 await f.run('.kp 清除');assert.match(f.messages.at(-1),/只有/);assert.ok(f.plugin.status().keepers['123'])
 await f.run('.kp 清除',{sender:{role:'admin'}});assert.equal(f.plugin.status().keepers['123'],undefined)
 await f.plugin.setKeeper('123','789');await f.run('.dice off',{user_id:789});assert.match(f.messages.at(-1),/只有/,'KP不是QQ管理员')
 let privateReply='';await f.plugin.handleEvent(f.event('.kp 查看',{message_type:'private'}),{...f.context,sendPrivate:async text=>{privateReply=text}});assert.match(privateReply,/按群/)
})
test('全部玩家清理有备份，KP/群开关/防重放保留，重启可见',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dice-reset-')),file=path.join(dir,'state.json')
 try{const f=fixture({file});await f.run('.pc new 调查员');await f.run('.st SAN70 侦查60');await f.run('.set 20');const ev=f.event('.r d1');await f.plugin.handleEvent(ev,f.context);await f.run('.dice off',{sender:{role:'admin'}});await f.plugin.setKeeper('123','789',{name:'KP乙'})
  const old=JSON.parse(fs.readFileSync(file,'utf8')),result=await f.plugin.clearPlayers(),after=JSON.parse(fs.readFileSync(file,'utf8'))
  assert.equal(result.removedPlayers,1);assert.equal(result.removedCards,2);assert.equal(result.previousRolls,1)
  assert.deepEqual(JSON.parse(fs.readFileSync(result.backup,'utf8')),old);assert.deepEqual(after.players,{});assert.equal(after.rolls,0)
  assert.deepEqual(after.keepers,old.keepers);assert.deepEqual(after.groups,old.groups);assert.deepEqual(after.seen,old.seen)
  const next=createDicePlugin({file});assert.equal(next.status().players,0);assert.equal(next.status().keepers['123'].uid,'789')
  assert.equal((await next.handleEvent(ev,f.context)).spoke,false,'清理后不重掷历史指令')
  assert.equal((await next.clearPlayers()).unchanged,true);assert.equal(fs.readdirSync(path.dirname(result.backup)).length,1,'空表重复清理不挤掉有效备份')
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
test('备份失败不清数据；跨实例写入不覆盖KP，投递不占数据锁',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dice-lock-')),file=path.join(dir,'state.json')
 try{const f=fixture({file});await f.run('.st SAN70');const old=fs.readFileSync(file,'utf8');fs.writeFileSync(path.join(dir,'dice-backups'),'occupied');await assert.rejects(f.plugin.clearPlayers());assert.equal(fs.readFileSync(file,'utf8'),old);fs.unlinkSync(path.join(dir,'dice-backups'))
  const other=createDicePlugin({file});await Promise.all([f.plugin.setKeeper('123','789'),other.setKeeper('124','888'),f.plugin.clearPlayers()]);assert.equal(other.status().keepers['123'].uid,'789');assert.equal(other.status().keepers['124'].uid,'888');assert.equal(other.status().players,0)
  let releaseSend,markStarted;const started=new Promise(r=>markStarted=r),pending=f.plugin.handleEvent(f.event('.r d1'),{...f.context,sendGroup:async()=>{markStarted();await new Promise(r=>releaseSend=r)}});await started;await other.setKeeper('125','777');releaseSend();await pending;assert.equal(f.plugin.status().keepers['125'].uid,'777')
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
