import {evaluateRoll,rollCommand,cocCheck,secureRoll} from './engine.mjs'
import {createStore} from './store.mjs?version=8'
import {theatreState,cleanModelText} from './theatre.mjs?version=11'
export {evaluateRoll,rollCommand,cocCheck}
export const HELP=`青娥骰 · 跑团指令
.r 2d6+3 原因 / .r 4d6kh3 / .r 3#d100
.rh d100 暗骰（结果仅私聊）
.ra 侦查50 / .ra b1 侦查 / .ra p1 困难侦查60
.rc 同CoC检定；.rah 侦查50 暗中检定
.st 侦查60 聆听50 SAN70 / .st show
.pc new 调查员 / .pc list / .pc use 调查员 / .nn 新名字
.sc 0/1d6 [当前SAN]（成功/失败损失）
.set 20（默认骰面，个人按会话保存）
.dice on/off（本群管理员控制）/ .dice help
.kp @某人 / .kp 我 / .kp 查看 / .kp 清除（设定、清除限机器人管理员或本群管理）
.npc 群号 NPC名 背景（KP私聊维护）；.npc use/list/delete 群号 [NPC名]
人格模拟：【PL具体做了什么行动】（使用本群当前NPC，纯文字）
全部玩家记录清理：在本地骰子工作台操作，自动备份；KP与群开关保留。
D&D优势：.r 2d20kh1+5；劣势：.r 2d20kl1+5
使用CoC7规则0：1大成功；技能<50时96–100大失败，否则100大失败。`
export function diceCommand(message){
 const parts=Array.isArray(message)?message:null
 const text=(parts?parts.filter(s=>s?.type==='text').map(s=>String(s.data?.text??'')).join(''):String(message??'').replace(/\[CQ:(?:at|reply),[^\]]+\]/g,'')).trim().replace(/^。/,'.')
 const match=text.match(/^\.(dicehelp|roll|rah|rh|ra|rc|sc|st|pc|nn|kp|set|dice|help|r)(?=$|\s|[\d(dDbBpP+\-\u3400-\u9fff])/i)
 if(!match)return null;const name=match[1].toLowerCase(),body=text.slice(match[0].length).trim();if(name==='help'&&!/^(?:dice|骰子)$/i.test(body))return null
 return {name,body,at:parts?parts.filter(s=>s?.type==='at').map(s=>String(s.data?.qq??'')):[...String(message??'').matchAll(/\[CQ:at,qq=([^,\]]+)/g)].map(m=>m[1])}
}
const normalize=s=>String(s).toUpperCase()==='SAN'||s==='理智'?'SAN':String(s)
export function createDicePlugin({file,roll=secureRoll,now=Date.now}={}){
 const store=createStore(file)
 function player(data,key,name){if(!data.players[key])data.players[key]={active:'默认角色',cards:{'默认角色':{name:String(name||'调查员').slice(0,40),stats:{}}},sides:100};return data.players[key]}
 function status(groups=[]){const d=store.read();const theatres=Object.fromEntries([...new Set([...Object.keys(d.theatres??{}),...groups.map(String)])].map(g=>[g,theatreState(d,g)]));return {version:4,npcScope:'global',rolls:d.rolls,players:Object.keys(d.players).length,groups:d.groups,keepers:d.keepers,theatres:Object.fromEntries(Object.entries(theatres).map(([g,t])=>[g,{...t,npcs:Object.fromEntries(Object.entries(t.npcs??{}).map(([name,n])=>[name,{...n,...(n.memory?{memory:{...n.memory,seen:undefined}}:{})}]))}])),commands:['r','rh','ra','rc','rah','st','pc','nn','sc','set','dice','kp','npc','人格模拟']}}
 function assignKeeper(data,group,uid,name='',operator='webui'){
  group=String(group);if(!/^[1-9]\d{2,19}$/.test(group))throw Error('请提供有效群号')
  if(uid===null){delete data.keepers[group];return null}
  uid=String(uid);if(!/^[1-9]\d{2,19}$/.test(uid))throw Error('请提供有效KP的QQ号')
  const keeper={uid,name:String(name||uid).trim().slice(0,40)||uid,assignedBy:String(operator),assignedAt:now()};data.keepers[group]=keeper;return keeper
 }
 async function setKeeper(group,uid,options={}){const release=await store.acquire();try{const d=store.read(),keeper=assignKeeper(d,group,uid,options.name,options.operator);store.write(d);return keeper}finally{release()}}
 async function clearPlayers(){const release=await store.acquire();try{const d=store.read(),removedPlayers=Object.keys(d.players).length,removedCards=Object.values(d.players).reduce((n,p)=>n+Object.keys(p.cards??{}).length,0),previousRolls=d.rolls;if(removedPlayers===0&&previousRolls===0)return {removedPlayers:0,removedCards:0,previousRolls:0,backup:null,unchanged:true};const backup=store.backup();store.write({...d,players:{},rolls:0,clearedAt:now()});return {removedPlayers,removedCards,previousRolls,backup,kept:['keepers','groups','deduplication']}}finally{release()}}
 async function handleEvent(ev,{selfId='',admin=false,sendGroup,sendPrivate,generate}={}){
  const cmd=diceCommand(ev.message);if(!cmd)return {handled:false}
  if(cmd.name!=='kp'&&cmd.at.some(id=>id!==String(selfId)))return {handled:true,spoke:false,why:'指向其他骰子或用户，不代骰'}
  const uid=String(ev.user_id??ev.sender?.user_id??''),group=ev.message_type==='group'?String(ev.group_id):'',scope=group?'g:'+group:'p:'+uid,key=scope+':'+uid
  const name=String(ev.sender?.card||ev.sender?.nickname||uid).slice(0,40)
  const send=text=>group?sendGroup(text):sendPrivate(text)
  let release;try{release=await store.acquire()}catch(e){await send(e.message);return {handled:true,spoke:true,text:e.message}}
  try{
  let data
  try{data=store.read()}catch(e){release();await send(e.message);return {handled:true,spoke:true,text:e.message}}
  const eventKey=scope+':'+String(ev.message_id??'')
  if(ev.message_id!=null&&data.seen.some(x=>x.key===eventKey))return {handled:true,spoke:false,why:'重复骰子指令'}
  const manager=admin||['owner','admin'].includes(ev.sender?.role)
  if(data.groups[group]===false&&!['dice','dicehelp','help','kp'].includes(cmd.name))return {handled:true,spoke:false,why:'本群骰子已关闭'}
  const p=['kp','dice','dicehelp','help'].includes(cmd.name)?null:player(data,key,name),card=()=>p.cards[p.active]
  let text='',hidden=false,isRoll=false
  try{
   if(['dicehelp','help'].includes(cmd.name)||cmd.name==='dice'&&(!cmd.body||cmd.body==='help'))text=HELP
   else if(cmd.name==='kp'){
    if(!group)throw Error('KP按群记录，请在群聊使用.kp，或到工作台选择群号')
    const body=cmd.body.toLowerCase(),targets=[...new Set(cmd.at.filter(id=>id!==String(selfId)))]
    if(!body&&!targets.length||['查看','show','list'].includes(body)){const k=data.keepers[group];text=k?`本群KP：${k.name}（QQ ${k.uid}）`:'本群尚未设定KP；本群管理可用.kp @某人'}
    else{
     if(!manager)throw Error('只有机器人管理员或本群管理能设定、清除KP')
     if(['清除','clear','off'].includes(body)){assignKeeper(data,group,null);text='已清除本群KP记录'}
     else{let target;if(['我','me'].includes(body)&&targets.length===0)target=uid;else if(!body||body==='set'){if(targets.length!==1)throw Error('请只@一位KP，或用.kp QQ号');target=targets[0]}else{const m=body.match(/^(?:set\s+)?([1-9]\d{2,19})$/);if(!m||targets.some(id=>id!==m[1]))throw Error('用法：.kp @某人 / .kp QQ号 / .kp 我');target=m[1]}
      const keeper=assignKeeper(data,group,target,target===uid?name:target,uid);text=`本群KP已设为${keeper.name}（QQ ${keeper.uid}）`
     }
    }
   }else if(cmd.name==='dice'){
    if(!group||!manager)throw Error('只有机器人管理员或本群管理能切换本群骰子')
    if(!['on','off'].includes(cmd.body))throw Error('用法：.dice on 或 .dice off')
    data.groups[group]=cmd.body==='on';text='本群骰子已'+(data.groups[group]?'开启':'关闭')
   }else if(['r','roll','rh'].includes(cmd.name)){
    const r=rollCommand(cmd.body,{roll,defaultSides:p.sides});text=`<${card().name}>${r.reason?' 因“'+r.reason+'”':''}掷骰\n`+r.text;hidden=cmd.name==='rh';isRoll=true
   }else if(['ra','rc','rah'].includes(cmd.name)){
    let body=cmd.body,bonus=0,difficulty='普通';const b=body.match(/^([bp])(\d?)\s*/i);if(b){bonus=(Number(b[2]||1))*(b[1].toLowerCase()==='b'?1:-1);if(!bonus)throw Error('奖励/惩罚骰数量为1或2');body=body.slice(b[0].length)}
    const hard=body.match(/^(困难|极难)\s*/);if(hard){difficulty=hard[1];body=body.slice(hard[0].length)}
    const m=body.match(/^(.*?)(\d{1,3})$/),skill=normalize((m?m[1]:body).trim()||'检定'),value=m?Number(m[2]):card().stats[skill]
    if(value===undefined)throw Error('请填写技能值，例如.ra 侦查50，或先.st 侦查50')
    const r=cocCheck(value,{roll,bonus,difficulty});text=`<${card().name}> ${difficulty}${skill}检定\nD100=${r.result}/${value} → ${r.label}${r.success?'':'（未通过）'}${bonus?'\n'+(bonus>0?'奖励':'惩罚')+'骰候选['+r.candidates.join(',')+']':''}`;hidden=cmd.name==='rah';isRoll=true
   }else if(cmd.name==='set'){
    const n=Number(cmd.body);if(!/^\d+$/.test(cmd.body)||n<1||n>1000000)throw Error('默认面数须为1–1000000整数');p.sides=n;text='默认骰子已设为D'+n
   }else if(cmd.name==='nn'){
    if(!cmd.body||cmd.body.length>40)throw Error('角色名字须为1–40字');card().name=cmd.body;text='当前角色已改称“'+cmd.body+'”'
   }else if(cmd.name==='pc'){
    const [action,...rest]=cmd.body.split(/\s+/),title=rest.join(' ')
    if(action==='list')text='角色卡：'+Object.keys(p.cards).map(k=>(k===p.active?'★ ':'')+k).join('、')
    else if(action==='new'){
     if(!title||title.length>40||['__proto__','constructor','prototype'].includes(title))throw Error('请填写1–40字角色卡名');if(Object.keys(p.cards).length>=20)throw Error('此会话已存20张角色卡');if(Object.hasOwn(p.cards,title))throw Error('角色卡已存在')
     p.cards[title]={name:title,stats:{}};p.active=title;text='已建立并使用角色卡“'+title+'”'
    }else if(action==='use'||action==='tag'){
     if(!Object.hasOwn(p.cards,title))throw Error('找不到这张角色卡');p.active=title;text='当前使用“'+title+'”'
    }else throw Error('用法：.pc new 名字 / .pc list / .pc use 名字')
   }else if(cmd.name==='st'){
    if(cmd.body==='show'||!cmd.body)text=`<${card().name}> `+JSON.stringify(card().stats)
    else{const values={};for(const part of cmd.body.split(/\s+/)){const m=part.match(/^([\p{L}_]{1,20})[=:：]?(\d{1,3})$/u);if(!m||['__proto__','constructor','prototype'].includes(m[1])||Number(m[2])>100)throw Error('用法：.st 侦查60 聆听50 SAN70，每项0–100');values[normalize(m[1])]=Number(m[2])}if(Object.keys({...card().stats,...values}).length>100)throw Error('每张卡最多100项技能');Object.assign(card().stats,values);text='已保存 '+JSON.stringify(values)}
   }else if(cmd.name==='sc'){
    const m=cmd.body.match(/^(\S+)(?:\s+(\d{1,3}))?$/);if(!m)throw Error('用法：.sc 0/1d6 [当前SAN]')
    const losses=m[1].split('/');if(losses.length===1)losses.unshift('0');if(losses.length!==2)throw Error('损失应写为成功/失败表达式')
    const san=m[2]===undefined?card().stats.SAN:Number(m[2]);if(san===undefined)throw Error('请先.st SAN70，或.sc 0/1d6 70')
    // Validate both expressions before committing any SAN change.
    for(const expr of losses){if(evaluateRoll(expr,{maximize:true}).min<0)throw Error('SAN损失不能为负数')}
    const check=cocCheck(san,{roll}),loss=evaluateRoll(losses[check.success?0:1],{roll,maximize:check.rank===-1}).total;if(loss<0)throw Error('SAN损失不能为负数')
    const after=Math.max(0,san-loss);card().stats.SAN=after;text=`<${card().name}> SAN检定 D100=${check.result}/${san} ${check.label}\n损失${loss}，SAN ${san} → ${after}`;isRoll=true
   }
  }catch(e){text='骰子指令未完成：'+e.message;isRoll=false}
  if(ev.message_id!=null){data.seen.push({key:eventKey,at:now()});data.seen=data.seen.filter(x=>now()-x.at<86400000).slice(-500)}
  if(isRoll)data.rolls++
  try{store.write(data)}catch{release();await send('骰子数据保存失败，本次结果未发布；请检查目录权限。');return {handled:true,spoke:true,text:'骰子数据保存失败'}}
  release()
  // The persisted dice result is authoritative. Commentary cannot reroll or change it.
  const theatre=theatreState(data,group)
  if(isRoll&&group&&theatre.commentary&&generate){try{const comment=cleanModelText(await generate({kind:'commentary',system:theatre.commentPrompt+'\n只写一两句纯文字，不复述骰点明细、不输出Markdown。程序结果具有最终效力，不得改变成败。',user:text,maxChars:120}),120);text+='\n'+comment.split(/(?<=[。！？!?])\s*/u).filter(Boolean).slice(0,2).join('')}catch{/* Dice delivery survives model failure. */}}
  // Delivery ambiguity never causes a reroll, a public secret, or an automatic resend.
  if(hidden&&group){try{await sendPrivate(text)}catch{const notice='暗骰私聊投递失败或未确认，结果未公开；请检查好友关系，不会自动重掷。';await sendGroup(notice);return {handled:true,spoke:true,text:notice,hidden:true}}
   const notice=`<${name}>进行了暗骰，结果已私聊发送。`;await sendGroup(notice);return {handled:true,spoke:true,text:notice,hidden:true}
  }
  await send(text);return {handled:true,spoke:true,text,hidden:false}
  }finally{release()}
 }
 return {handleEvent,status,setKeeper,clearPlayers}
}
