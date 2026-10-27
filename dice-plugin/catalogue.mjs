import {createHash} from 'node:crypto'
export function normalizedName(s){return String(s??'').normalize('NFKC').toLowerCase().replace(/[\s·•・，。,:：、【】（）()\-_]/g,'').replace(/[楊扬]/g,'杨')}
export function nameAliases(name,aliases=[]){return [...new Set([name,...String(name).split(/[·•・]/),...aliases].map(s=>String(s).trim()).filter(s=>s.length>=2))]}
export function ensureCatalog(data){
 if(data.npcCatalog)return false
 data.npcCatalog={}
 for(const [gid,t] of Object.entries(data.theatres??{}))for(const [name,n] of Object.entries({...t.npcs})){let key=name;const existing=data.npcCatalog[key];if(existing&&existing.background!==n.background){key=name.slice(0,15)+'（'+gid+'）';let count=2;while(data.npcCatalog[key]&&data.npcCatalog[key].background!==n.background)key=name.slice(0,12)+'（'+gid+'-'+count+++'）';t.npcs[key]=n;delete t.npcs[name];if(t.selected===name)t.selected=key}
  data.npcCatalog[key]??={profileId:createHash('sha256').update(key+'\0'+(n.background??'')).digest('hex').slice(0,32),background:String(n.background??''),aliases:nameAliases(key,n.aliases??[]),updatedAt:n.updatedAt??0,profileVersion:1}
 }
 return true
}
export function resolveName(npcs,input){if(Object.hasOwn(npcs,input))return input;const q=normalizedName(input),matches=Object.keys(npcs).filter(name=>nameAliases(name,npcs[name].aliases).some(alias=>normalizedName(alias)===q));if(matches.length===1)return matches[0];if(matches.length>1)throw Error('NPC称呼有重名，请使用完整名称：'+matches.join('、'));return null}
export function sceneParticipants(npcs,action,explicit,fallback){
 const text=normalizedName(action),owners=new Map();for(const [name,n] of Object.entries(npcs))for(const alias of nameAliases(name,n.aliases)){const key=normalizedName(alias);if(key.length<2)continue;if(!owners.has(key))owners.set(key,new Set());owners.get(key).add(name)}
 const hits=[];for(const [alias,names] of owners)if(names.size===1){let index=text.indexOf(alias);while(index>=0){if(!/^[a-z0-9]/.test(alias)||!/[a-z0-9]/.test(text[index-1]??'')&&!/[a-z0-9]/.test(text[index+alias.length]??'')){hits.push({name:[...names][0],index,size:alias.length});break}index=text.indexOf(alias,index+1)}}
 const spans=[];for(const hit of hits.sort((a,b)=>b.size-a.size))if(!spans.some(s=>s.name!==hit.name&&hit.index<s.index+s.size&&s.index<hit.index+hit.size))spans.push(hit);spans.sort((a,b)=>a.index-b.index||b.size-a.size);const names=[...new Set([...(explicit?[explicit]:[]),...spans.map(x=>x.name)])];if(!names.length&&fallback)names.push(fallback);return names
}
