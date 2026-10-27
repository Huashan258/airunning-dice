import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {setTimeout as pause} from 'node:timers/promises'
export function createStore(file,options={}){
 const empty=options.empty??(()=>({version:1,players:{},groups:{},keepers:{},seen:[],rolls:0}))
 let memory=empty()
 function read(){if(!file)return structuredClone(memory);try{const data=JSON.parse(fs.readFileSync(file,'utf8'));if(options.validate){if(!options.validate(data))throw Error('schema');return data}if(data.version!==1||!data.players||Array.isArray(data.players)||!data.groups||Array.isArray(data.groups)||!Array.isArray(data.seen)||data.keepers!==undefined&&(!data.keepers||typeof data.keepers!=='object'||Array.isArray(data.keepers)))throw Error('schema');return {...data,keepers:data.keepers??{}}}catch(e){if(e.code==='ENOENT')return empty();throw Error('记录数据读取失败，请检查或恢复备份；未覆盖现有文件')}}
 function write(data){if(!file){memory=structuredClone(data);return}fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,2));fs.renameSync(tmp,file)}
 async function acquire(){
  if(!file)return ()=>{}
  fs.mkdirSync(path.dirname(file),{recursive:true});const lock=file+'.lock',token=randomUUID(),until=Date.now()+5000
  for(;;){try{const fd=fs.openSync(lock,'wx');try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid,token}))}finally{fs.closeSync(fd)};let released=false;return ()=>{if(released)return;released=true;try{if(JSON.parse(fs.readFileSync(lock,'utf8')).token===token)fs.unlinkSync(lock)}catch{}}}catch(e){if(e.code!=='EEXIST')throw e
    try{const owner=JSON.parse(fs.readFileSync(lock,'utf8'));if(Number.isInteger(owner.pid)&&owner.pid>0)try{process.kill(owner.pid,0)}catch(err){if(err.code==='ESRCH')fs.unlinkSync(lock)}}catch{}
    if(Date.now()>=until)throw Error('骰子数据正忙，请稍后重试');await pause(25)
  }}
 }
 function backup(){if(!file||!fs.existsSync(file))return null;const folder=path.join(path.dirname(file),'dice-backups');fs.mkdirSync(folder,{recursive:true});const dest=path.join(folder,'trpg-dice-'+Date.now()+'-'+randomUUID()+'.json');fs.copyFileSync(file,dest,fs.constants.COPYFILE_EXCL)
  const names=fs.readdirSync(folder).filter(n=>/^trpg-dice-\d+-[a-f0-9-]+\.json$/.test(n)).sort().reverse();for(const n of names.slice(5))fs.unlinkSync(path.join(folder,n));return dest
 }
 return {read,write,acquire,backup}
}
