import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {createScripts} from '../scripts.mjs'
import {createDicePlugin} from '../index.mjs'
import {createTheatre} from '../theatre.mjs?version=12'
import {createScriptReader,displayScriptEntry} from '../script-reader.mjs'
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'script-reader-')),file=path.join(root,'scripts.json'),diceFile=path.join(root,'dice.json');return {root,file,diceFile,writer:createScripts({root,file,diceFile}),reader:createScriptReader({root,file,diceFile}),cleanup:()=>fs.rmSync(root,{recursive:true,force:true})}}
test('完整分页、NPC独立筛选、KP与场外过滤、原文不变、进行中和归档均可读',async()=>{const f=fixture();try{
 const dice=createDicePlugin({file:f.diceFile});await dice.setKeeper('123','456');await dice.handleEvent({message_type:'group',group_id:123,user_id:777,message_id:5,message:'.nn 旅人',sender:{nickname:'玩家昵称'}},{sendGroup:async()=>{}})
 await f.writer.control('123','on','阅读测试');await f.writer.record({group:'123',uid:'456',name:'KP昵称',text:'KP叙述',id:1});await f.writer.record({group:'123',uid:'777',name:'玩家昵称',text:'**场外问题',id:2});await f.writer.record({group:'123',uid:'777',name:'玩家昵称',text:'我提到科比，但这仍是玩家的话',id:3});await f.writer.record({group:'123',direction:'out',text:'青娥模拟：【科比递球\n佐巴杨接球】',turns:[{npc:'科比',reply:'递球给佐巴杨'},{npc:'佐巴杨',reply:'接住科比的球'}],id:4})
 const s=(await f.writer.status()).active['123'],args={group:'123',id:s.id,allowedGroups:['123']},file=path.join(f.root,'beginscript',s.folder,'chat.jsonl'),before=fs.readFileSync(file)
 const all=await f.reader.read(args);assert.equal(all.rawRows,4);assert.equal(all.total,5);assert.equal(all.entries[2].name,'旅人');assert.equal(all.speakers.find(s=>s.id==='npc:科比').count,1);assert.equal(all.entries[0].kp,true)
 const filtered=await f.reader.read({...args,hidden:['npc:科比'],hideOoc:true,hideKp:true});assert.equal(filtered.matched,2);assert.ok(filtered.entries.some(e=>e.text==='接住科比的球'));assert.ok(filtered.entries.some(e=>e.kind==='player'))
 assert.equal((await f.reader.read({...args,query:'提到科比'})).matched,1);assert.equal((await f.reader.read({...args,limit:1})).next,1);assert.equal((await f.reader.read({...args,limit:1,offset:4})).entries[0].name,'佐巴杨');assert.deepEqual(fs.readFileSync(file),before);const temporaryKp=await f.reader.read({...args,hideKp:true,kpSpeaker:'qq:777'});assert.equal(temporaryKp.kpRows,2);assert.equal(temporaryKp.matched,3)
 await f.writer.control('123','off');assert.equal((await f.reader.read(args)).total,5);await f.writer.control('123','end');assert.equal(f.reader.list(['123']).sessions[0].ended,true);const archive=await f.reader.read(args);assert.equal(archive.rawRows,5);assert.match(fs.readFileSync(f.reader.download(args).file,'utf8'),/KP叙述/)
 await assert.rejects(f.reader.read({...args,allowedGroups:['999']}),/白名单/);await assert.rejects(f.reader.read({...args,id:'../../secret'}),/编号/);await assert.rejects(f.reader.read({...args,offset:-1}),/分页/)
 }finally{f.cleanup()}})
test('不按正文提及的人名隐藏角色，旧格式与不明角色有明确标记',()=>{
 const context={snapshot:{npcs:{科比:{aliases:['科比']},佐巴杨:{aliases:[]}}}}
 const split=displayScriptEntry({direction:'out',text:'青娥模拟：【科比 （递球）\n佐巴杨 （接球）】'},context);assert.deepEqual(split.map(t=>t.speaker),['npc:科比','npc:佐巴杨']);assert.equal(split[0].inferred,true)
 const unknown=displayScriptEntry({direction:'out',text:'青娥模拟：【（抬起头）接住，佐巴杨！】'},context);assert.equal(unknown[0].speaker,'npc:unknown');assert.equal(unknown[0].unattributed,true)
 assert.equal(displayScriptEntry({uid:'1',text:'普通对白 ** 不是场外'}).at(0).ooc,false);assert.equal(displayScriptEntry({uid:'1',text:'  **场外注释'}).at(0).ooc,true)
})
test('完整记录超过一页和超过30个归档不截断，损坏行提示，拒绝文件符号链接越界',async()=>{const f=fixture();let outside;try{
 await f.writer.control('123','on','长剧本');const s=(await f.writer.status()).active['123'],dir=path.join(f.root,'beginscript',s.folder),args={group:'123',id:s.id,allowedGroups:['123']};fs.writeFileSync(path.join(dir,'chat.jsonl'),Array.from({length:1205},(_,i)=>JSON.stringify({uid:'777',name:'玩家',text:'第'+i+'条'})).join('\n')+'\n{broken}\n')
 const page=await f.reader.read({...args,offset:1200,limit:100});assert.equal(page.matched,1205);assert.equal(page.entries.length,5);assert.equal(page.entries[4].text,'第1204条');assert.equal(page.invalidRows,1)
 const index=JSON.parse(fs.readFileSync(f.file));index.ended=Array.from({length:40},(_,i)=>({id:'ended-'+i,group:'123',name:'归档'+i,status:'ended'}));fs.writeFileSync(f.file,JSON.stringify(index));assert.equal(f.reader.list(['123']).sessions.length,41);assert.equal(f.reader.list(['999']).sessions.length,0)
 outside=fs.mkdtempSync(path.join(os.tmpdir(),'script-secret-'));fs.writeFileSync(path.join(outside,'聊天记录.txt'),'not public');fs.copyFileSync(path.join(dir,'script.json'),path.join(outside,'script.json'));fs.renameSync(dir,dir+'-saved');fs.symlinkSync(outside,dir,'junction');assert.throws(()=>f.reader.download(args),/越界/);fs.unlinkSync(dir)
 }finally{f.cleanup();if(outside)fs.rmSync(outside,{recursive:true,force:true})}})
test('新单人/多人模拟向发送器交付结构化角色归属，不混入好感原因',async()=>{const f=fixture();try{
 const theatre=createTheatre({file:f.diceFile}),out=[];await theatre.change('123',{npc:{name:'科比',background:'球星'}});await theatre.change('123',{npc:{name:'佐巴杨',background:'队友'}});await theatre.change('123',{activation:{name:'all',active:true}})
 const ev={message_type:'group',group_id:123,user_id:456,message_id:100,message:'人格模拟：科比将球丢给佐巴杨',sender:{nickname:'PL'}},ctx={admin:true,allowedGroups:['123'],sendGroup:async(text,meta)=>out.push({text,meta}),sendPrivate:async()=>{},generate:async()=>JSON.stringify({turns:[{npc:'科比',reply:'抛出篮球',affinityDelta:1,reason:'不能进公开文档'},{npc:'佐巴杨',reply:'伸手接球',affinityDelta:0,reason:'不能进公开文档'}]})};await theatre.handle(ev,ctx);assert.equal(out[0].meta.scriptTurns.length,2);assert.deepEqual(Object.keys(out[0].meta.scriptTurns[0]),['npc','reply'])
 }finally{f.cleanup()}})
