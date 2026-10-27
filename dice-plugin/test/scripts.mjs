import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createScripts,logCommand,messageText} from '../scripts.mjs'
import {createDicePlugin} from '../index.mjs'
import {createTheatre} from '../theatre.mjs?version=5'
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'trpg-script-')),file=path.join(dir,'scripts.json'),diceFile=path.join(dir,'dice.json'),make=()=>createScripts({root:dir,file,diceFile}),engine=make();return {dir,file,diceFile,engine,make,cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})}}
test('剧本开始/暂停/继续/结束，完整聊天及群人物快照独立归档',async()=>{const f=fixture();try{
 const dice=createDicePlugin({file:f.diceFile}),theatre=createTheatre({file:f.diceFile});await dice.setKeeper('123','456');await theatre.change('123',{npc:{name:'旅人',background:'谨慎的旅人'},affinity:{npc:'旅人',uid:'456',score:12}});await theatre.change('124',{npc:{name:'秘密NPC',background:'不混入'}})
 const noop={selfId:'999',sendGroup:async()=>{},sendPrivate:async()=>{}};await dice.handleEvent({message_type:'group',group_id:123,user_id:456,message_id:11,message:'.st SAN70 侦查60'},noop);await dice.handleEvent({message_type:'group',group_id:124,user_id:456,message_id:12,message:'.st SAN30'},noop)
 const start=await f.engine.control('123','on','雨夜旧城',{uid:'456'});const folder=path.join(f.dir,'beginscript',start.session.folder);assert.ok(fs.existsSync(path.join(folder,'开场人物属性.json')))
 await f.engine.record({group:123,uid:456,name:'玩家甲',id:1,message:[{type:'text',data:{text:'走进旧城'}},{type:'image',data:{file:'base64://SECRET'}}]});await f.engine.record({group:123,id:2,name:'青娥鱼',direction:'out',text:'青娥模拟：【旅人站在门边】'});assert.equal(await f.engine.record({group:123,id:2,text:'重复回声'}),false);assert.equal(await f.engine.record({group:124,id:1,text:'别群'}),false)
 await f.engine.control('123','off');assert.equal(await f.engine.record({group:123,id:3,text:'暂停不录'}),false);assert.equal((await f.make().status()).active['123'].status,'paused');await f.make().control('123','on');await f.engine.record({group:123,id:4,text:'继续记录'});await f.engine.control('123','name','改名后的雨夜');await f.engine.control('123','end');const state=await f.engine.status(),archive=state.ended[0].path;assert.equal(state.active['123'],undefined);assert.equal(fs.existsSync(folder),false);assert.ok(archive.startsWith(path.join(f.dir,'endscript')))
 const text=fs.readFileSync(path.join(archive,'剧本.md'),'utf8');assert.match(text,/改名后的雨夜/);assert.match(text,/走进旧城\[image\]/);assert.match(text,/青娥模拟/);assert.match(text,/继续记录/);assert.doesNotMatch(text,/SECRET|别群|暂停不录|重复回声/)
 const chars=JSON.parse(fs.readFileSync(path.join(archive,'人物属性.json'),'utf8'));assert.equal(chars.players['g:123:456'].cards['默认角色'].stats.SAN,70);assert.equal(chars.players['g:124:456'],undefined);assert.equal(chars.npcs['旅人'].affinity['456'].score,12);assert.equal(chars.npcs['秘密NPC'].background,'不混入');assert.equal(chars.npcs['秘密NPC'].affinity,undefined);assert.equal(chars.kp.uid,'456');assert.equal(chars.participants['456'],'玩家甲')
 await f.engine.control('123','on','新剧本');assert.equal((await f.engine.status()).ended.length,1);assert.equal((await f.engine.status()).active['123'].entries,0)
 }finally{f.cleanup()}})
test('未命名先询问，KP/群管理权限，.log name会话及命令重放不重新开档',async()=>{const f=fixture();try{
 await createDicePlugin({file:f.diceFile}).setKeeper('123','456');let id=0;const out=[],ctx={allowedGroups:['123'],sendGroup:async t=>out.push(t),sendPrivate:async t=>out.push(t)},ev=(text,uid=456)=>({message_type:'group',group_id:123,user_id:uid,message_id:++id,message:text,sender:{role:'member'}})
 await f.engine.handle(ev('.log on',777),ctx);assert.match(out.at(-1),/只有/);assert.deepEqual((await f.engine.status()).active,{})
 const start=ev('.log on');await f.engine.handle(start,ctx);assert.match(out.at(-1),/名字/);assert.equal((await f.engine.status()).active['123'].status,'awaiting-name');await f.engine.handle(start,ctx);assert.equal(out.length,2)
 assert.equal((await f.engine.handle(ev('不让别人抢答',777),ctx)).handled,false);await f.engine.handle(ev('雾城'),ctx);assert.equal((await f.engine.status()).active['123'].name,'雾城');assert.equal((await f.engine.status()).active['123'].status,'recording')
 await f.engine.handle(ev('.log name'),ctx);assert.match(out.at(-1),/叫什么名字/);await f.engine.handle(ev('雾城续章'),ctx);assert.equal((await f.engine.status()).active['123'].name,'雾城续章')
 await f.engine.handle(ev('.log off'),ctx);await f.engine.handle(ev('.log name 暂停改名'),ctx);assert.equal((await f.engine.status()).active['123'].status,'paused');await f.engine.handle({...ev('.log end'),message_type:'private'},ctx);assert.match(out.at(-1),/QQ群/)
 assert.equal(logCommand('.log name 雾城').name,'雾城');assert.equal(logCommand('普通聊天'),null);assert.equal(messageText('[CQ:at,qq=456]你好'),'@456你好');assert.equal(messageText([{type:'record',data:{file:'secret'}}]),'[record]')
 }finally{f.cleanup()}})
test('结束搬移崩溃恢复、无跨目录写入、重启不丢记录',async()=>{const f=fixture();try{
 await f.engine.control('123','name','../../CON');await f.engine.control('123','on');const before=(await f.engine.status()).active['123'];await f.engine.record({group:123,id:88,text:'重启前'});assert.equal(await f.make().record({group:123,id:88,text:'重复'}),false)
 const source=path.join(f.dir,'beginscript',before.folder);await f.engine.control('123','end');const ended=(await f.engine.status()).ended[0];assert.equal(path.dirname(ended.path),path.join(f.dir,'endscript'));assert.ok(fs.readFileSync(path.join(ended.path,'聊天记录.txt'),'utf8').includes('重启前'))
 // Recreate the persisted "move committed, registry not yet committed" crash boundary.
 const d=JSON.parse(fs.readFileSync(f.file,'utf8'));d.ended=[];d.active['123']={...before,status:'ending',archiveFolder:path.basename(ended.path),endedAt:'test'};fs.writeFileSync(f.file,JSON.stringify(d));const recovered=await f.make().status();assert.equal(recovered.active['123'],undefined);assert.equal(recovered.ended.length,1);assert.equal(fs.existsSync(source),false)
 await assert.rejects(f.engine.control('../outside','on','bad'),/群聊/);await assert.rejects(f.engine.control('123','name','bad\nname'),/名称/)
 }finally{f.cleanup()}})
