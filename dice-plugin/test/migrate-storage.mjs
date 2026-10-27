import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {migrateStorage} from '../migrate-storage.mjs'
test('迁移保存NPC、角色、暂停剧本与归档路径，旧写入失败关闭，重复执行不覆盖',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'trpg-migrate-'));try{
 const legacyRoot=path.join(dir,'old'),targetRoot=path.join(dir,'airunning');fs.mkdirSync(path.join(legacyRoot,'.data'),{recursive:true});fs.mkdirSync(path.join(legacyRoot,'beginscript','paused'),{recursive:true});fs.writeFileSync(path.join(legacyRoot,'beginscript','paused','聊天记录.txt'),'保留的聊天');fs.mkdirSync(path.join(legacyRoot,'endscript','finished'),{recursive:true});fs.writeFileSync(path.join(legacyRoot,'endscript','finished','剧本.md'),'已结束')
 const dice={version:1,players:{'g:123:456':{cards:{SAN70:{}}}},groups:{},keepers:{},seen:[],rolls:2,theatres:{123:{selected:'甲',npcs:{甲:{background:'不丢失'},乙:{background:'未启用'}}}}};fs.writeFileSync(path.join(legacyRoot,'.data','trpg-dice.json'),JSON.stringify(dice));fs.writeFileSync(path.join(legacyRoot,'.data','trpg-scripts.json'),JSON.stringify({version:1,active:{123:{folder:'paused',status:'paused'}},drafts:{},seen:[],ended:[{path:path.join(legacyRoot,'endscript','finished')}]}))
 const first=await migrateStorage({legacyRoot,targetRoot});assert.ok(fs.existsSync(path.join(first.backup,'trpg-dice.json')));const moved=JSON.parse(fs.readFileSync(path.join(targetRoot,'.data','trpg-dice.json'),'utf8'));assert.deepEqual(moved.players,dice.players);assert.equal(moved.theatres['123'].npcs['甲'].active,true);assert.equal(moved.theatres['123'].npcs['乙'].active,false);assert.equal(moved.theatres['123'].npcs['甲'].background,'不丢失')
 assert.equal(fs.readFileSync(path.join(targetRoot,'beginscript','paused','聊天记录.txt'),'utf8'),'保留的聊天');const state=JSON.parse(fs.readFileSync(path.join(targetRoot,'.data','trpg-scripts.json'),'utf8'));assert.equal(state.active['123'].status,'paused');assert.equal(state.ended[0].path,path.join(targetRoot,'endscript','finished'));assert.equal(JSON.parse(fs.readFileSync(path.join(legacyRoot,'.data','trpg-dice.json'),'utf8')).movedTo,path.join(targetRoot,'.data','trpg-dice.json'))
 await migrateStorage({legacyRoot,targetRoot});assert.equal(JSON.parse(fs.readFileSync(path.join(targetRoot,'.data','trpg-dice.json'),'utf8')).rolls,2)
 }finally{fs.rmSync(dir,{recursive:true,force:true})}})
