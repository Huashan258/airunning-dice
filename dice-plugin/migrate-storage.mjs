import fs from 'node:fs'
import path from 'node:path'
import {createStore} from './store.mjs?version=8'
export async function migrateStorage({legacyRoot,targetRoot}){
 legacyRoot=path.resolve(legacyRoot);targetRoot=path.resolve(targetRoot);if(legacyRoot===targetRoot)throw Error('迁移源目标不能相同');const targetData=path.join(targetRoot,'.data'),backup=path.join(targetData,'migration-backups',String(Date.now())),releases=[],moved=[]
 function checked(base,relative){const value=path.resolve(base,relative);if(!value.startsWith(base+path.sep))throw Error('迁移目录越界');return value}
 const mappings=[['beginscript','beginscript'],['endscript','endscript'],['npc-memory','npc-memory'],['.data/npc-memory','npc-memory'],['.data/scripts/beginscript','beginscript'],['.data/scripts/endscript','endscript'],['.data/dice-backups','.data/dice-backups']]
 try{
 for(const name of ['trpg-dice.json','trpg-scripts.json'])releases.push(await createStore(checked(legacyRoot,'.data/'+name)).acquire())
 for(const name of ['trpg-dice.json','trpg-scripts.json']){const source=checked(legacyRoot,'.data/'+name),dest=checked(targetRoot,'.data/'+name);if(fs.existsSync(source)&&fs.existsSync(dest)&&JSON.parse(fs.readFileSync(source,'utf8')).movedTo!==dest)throw Error('目标已有状态文件，停止覆盖：'+name)}
 for(const [from,to] of mappings){const source=checked(legacyRoot,from),dest=checked(targetRoot,to);if(fs.existsSync(source))for(const name of fs.readdirSync(source))if(fs.existsSync(checked(dest,name)))throw Error('迁移内容重名，停止覆盖：'+name)}
 fs.mkdirSync(targetData,{recursive:true});fs.mkdirSync(backup,{recursive:true})
 for(const name of ['trpg-dice.json','trpg-scripts.json']){const source=checked(legacyRoot,'.data/'+name),dest=checked(targetRoot,'.data/'+name);if(!fs.existsSync(source))continue;const raw=fs.readFileSync(source,'utf8'),d=JSON.parse(raw);if(d.movedTo===dest&&fs.existsSync(dest))continue;if(d.version!==1)throw Error('旧状态格式无效，停止迁移');if(fs.existsSync(dest))throw Error('目标已有状态文件，停止覆盖：'+name);fs.writeFileSync(checked(backup,name),raw,{flag:'wx'});if(name==='trpg-dice.json')for(const t of Object.values(d.theatres??{}))for(const [key,n] of Object.entries(t.npcs??{}))if(n.active===undefined)n.active=key===t.selected;
 if(name==='trpg-scripts.json')for(const s of d.ended??[])if(s.path?.startsWith(legacyRoot+path.sep))s.path=checked(targetRoot,path.relative(legacyRoot,s.path));
 fs.writeFileSync(dest,JSON.stringify(d,null,2),{flag:'wx'});moved.push({source,dest,kind:'state'})}
 for(const [from,to] of mappings){const source=checked(legacyRoot,from),dest=checked(targetRoot,to);if(!fs.existsSync(source))continue;fs.mkdirSync(dest,{recursive:true});for(const name of fs.readdirSync(source)){const a=checked(source,name),b=checked(dest,name);if(fs.existsSync(b))throw Error('迁移内容重名，停止覆盖：'+name);fs.renameSync(a,b);moved.push({source:a,dest:b,kind:'file-or-folder'})}}
 // A legacy instance fails closed on these markers instead of creating divergent state.
 for(const item of moved.filter(x=>x.kind==='state'))fs.writeFileSync(item.source,JSON.stringify({movedTo:item.dest,migratedAt:new Date().toISOString()},null,2));
 for(const dir of ['beginscript','endscript','npc-memory'])fs.mkdirSync(checked(targetRoot,dir),{recursive:true});fs.writeFileSync(path.join(backup,'migration.json'),JSON.stringify({legacyRoot,targetRoot,moved},null,2));return {backup,moved}
 }finally{for(const release of releases.reverse())release()}
}
