import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import ooc from './ooc.cjs'
const json=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''))
const inside=(base,file)=>{const relative=path.relative(base,file);return !path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep)}
const playerName=(d,g,uid)=>{const p=d?.players?.[`g:${g}:${uid}`];return p?.cards?.[p.active]?.name}
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
export function displayScriptEntry(row,{group='',snapshot={},dice={},previous=null}={}){
 const text=String(row.text??''),isOoc=row.ooc===true||ooc.isOutOfCharacter(text)
 const kp=row.isKp??(String(row.uid??'')!==''&&String(row.uid)===String(snapshot.kp?.uid??dice.keepers?.[group]?.uid??''))
 const common={ts:String(row.ts??''),ooc:isOoc,kp:Boolean(kp),messageId:row.id??null}
 const turn=(name,text)=>({...common,speaker:'npc:'+name,name,kind:'npc',kp:false,text})
 if(row.direction==='out'&&Array.isArray(row.turns)&&row.turns.length&&row.turns.every(t=>typeof t?.npc==='string'&&typeof t?.reply==='string'))return row.turns.map(t=>turn(t.npc,t.reply))
 if(row.direction==='out'&&/^青娥模拟[：:]【[\s\S]*】$/.test(text)){
  const body=text.replace(/^青娥模拟[：:]【/,'').slice(0,-1),npcs={...dice.npcCatalog,...snapshot.npcs},aliases=Object.entries(npcs).flatMap(([name,n])=>[name,...(n.aliases??[])].filter(Boolean).map(alias=>({name,alias}))).sort((a,b)=>b.alias.length-a.alias.length)
  const parts=body.split('\n'),turns=[];let current
  for(const line of parts){const match=aliases.find(a=>new RegExp('^'+escape(a.alias)+'(?=[\\s：:（(，,]|$)').test(line));if(match){current={name:match.name,text:line};turns.push(current)}else if(current)current.text+='\n'+line;else if(line.trim()){turns.length=0;break}}
  if(turns.length)return turns.map(t=>({...turn(t.name,t.text),inferred:true}))
  const explicit=previous?.direction!=='out'&&String(previous?.text??'').match(/^人格模拟\s*【([^】]+)】\s*[:：]/)
  if(explicit&&Object.keys(npcs).filter(n=>String(previous.text).includes(n)).every(n=>n===explicit[1]))return [{...turn(explicit[1],body),inferred:true}]
  return [{...common,speaker:'npc:unknown',name:'NPC（旧记录未标明角色）',kind:'npc',kp:false,text:body,unattributed:true}]
 }
 const uid=String(row.uid??''),kind=row.direction==='system'?'system':row.direction==='out'?'bot':'player'
 const name=String(row.characterName||playerName(snapshot,group,uid)||playerName(dice,group,uid)||row.name||uid||(kind==='system'?'系统':'青娥鱼'))
 return [{...common,speaker:kind==='player'&&uid?'qq:'+uid:kind==='player'?'name:'+name:kind,name,kind,text,uid}]
}
export function createScriptReader({root,file,diceFile}={}){
 root=path.resolve(root)
 function state(){try{return json(file)}catch(e){if(e.code==='ENOENT')return {active:{},ended:[]};throw Error('剧本索引无法读取，未改动原记录')}}
 function list(groups){const allowed=new Set(groups.map(String)),d=state();return {sessions:[...Object.values(d.active??{}).map(s=>({...s,ended:false})),...(d.ended??[]).map(s=>({...s,ended:true}))].filter(s=>allowed.has(String(s.group))).map(s=>({id:s.id,group:String(s.group),name:s.name||'待命名剧本',status:s.status,entries:s.entries??0,startedAt:s.startedAt,endedAt:s.endedAt,ended:s.ended})).sort((a,b)=>String(b.endedAt??b.startedAt).localeCompare(String(a.endedAt??a.startedAt)))}}
 function session(group,id,allowedGroups){group=String(group);if(!allowedGroups.map(String).includes(group))throw Error('请选择白名单中的群');if(!/^[a-f0-9-]{36}$/i.test(String(id)))throw Error('剧本编号无效');const d=state(),s=[...Object.values(d.active??{}),...(d.ended??[])].find(s=>String(s.group)===group&&s.id===id);if(!s)throw Error('找不到该群剧本')
  const ended=(d.ended??[]).some(s=>s.id===id&&String(s.group)===group),base=path.join(root,ended?'endscript':'beginscript'),folder=ended?path.basename(path.win32.basename(s.path??s.folder??'')):s.folder
  if(!folder||folder==='.'||folder==='..'||/[\\/]/.test(folder))throw Error('剧本路径无效')
  let dir=path.join(base,folder),actualBase=base;if(s.status==='ending'&&!fs.existsSync(dir)&&s.archiveFolder){actualBase=path.join(root,'endscript');dir=path.join(actualBase,s.archiveFolder)}
  const real=fs.realpathSync(dir),baseReal=fs.realpathSync(actualBase);if(!inside(fs.realpathSync(root),baseReal)||!inside(baseReal,real))throw Error('剧本目录越界')
  const manifest=json(safeFile(real,'script.json'));if(String(manifest.group)!==group||manifest.id!==id)throw Error('剧本目录与索引不一致')
  return {s,dir:real,group,ended}
 }
 function safeFile(dir,name){const f=fs.realpathSync(path.join(dir,name));if(!inside(dir,f))throw Error('剧本文件越界');return f}
 function download({group,id,allowedGroups}){const {dir,s}=session(group,id,allowedGroups);return {file:safeFile(dir,'聊天记录.txt'),name:(s.name||'剧本').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')+'-完整记录.txt'}}
 async function read({group,id,allowedGroups,offset=0,limit=100,hidden=[],hideOoc=false,hideKp=false,kpSpeaker='',query='',signal}={}){
  offset=Number(offset);limit=Number(limit);if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>300)throw Error('分页参数无效')
  if(!Array.isArray(hidden)||hidden.length>1000||hidden.some(x=>typeof x!=='string'||x.length>200))throw Error('角色筛选无效');if(typeof kpSpeaker!=='string'||kpSpeaker.length>200)throw Error('本页KP筛选无效');query=String(query).trim().slice(0,200)
  const {dir,s,ended}=session(group,id,allowedGroups),filePath=safeFile(dir,'chat.jsonl'),stat=fs.statSync(filePath)
  let snapshot={},dice={};try{snapshot=json(safeFile(dir,'开场人物属性.json'))}catch{}try{dice=json(diceFile)}catch{}
  const excluded=new Set(hidden),actors=new Map(),entries=[];let total=0,matched=0,rawRows=0,invalidRows=0,oocRows=0,kpRows=0,unattributed=0,previous=null
  if(stat.size){const stream=fs.createReadStream(filePath,{encoding:'utf8',start:0,end:stat.size-1,signal}),lines=readline.createInterface({input:stream,crlfDelay:Infinity});try{for await(const line of lines){signal?.throwIfAborted();if(!line.trim())continue;let row;try{row=JSON.parse(line);if(!row||typeof row!=='object')throw Error()}catch{invalidRows++;continue}rawRows++
   const units=displayScriptEntry(row,{group:String(group),snapshot,dice,previous});previous=row
   for(let i=0;i<units.length;i++){const unit={...units[i],key:rawRows+':'+i};if(kpSpeaker)unit.kp=unit.kind==='player'&&unit.speaker===kpSpeaker;total++;if(unit.ooc)oocRows++;if(unit.kp)kpRows++;if(unit.unattributed)unattributed++
    const actor=actors.get(unit.speaker)??{id:unit.speaker,name:unit.name,kind:unit.kind,count:0,kp:false};actor.count++;actor.kp||=unit.kp;actors.set(unit.speaker,actor)
    if(excluded.has(unit.speaker)||hideOoc&&unit.ooc||hideKp&&unit.kp||query&&!`${unit.name}\n${unit.text}`.toLowerCase().includes(query.toLowerCase()))continue
    if(matched>=offset&&entries.length<limit)entries.push(unit);matched++
   }
  }}finally{lines.close();stream.destroy()}}
  return {session:{id:s.id,group:String(group),name:s.name,status:s.status,ended},entries,total,matched,rawRows,offset,limit,next:offset+entries.length<matched?offset+entries.length:null,speakers:[...actors.values()],oocRows,kpRows,unattributed,invalidRows,revision:stat.size+':'+stat.mtimeMs}
 }
 return {list,read,download}
}
