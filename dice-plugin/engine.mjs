import {randomInt} from 'node:crypto'
export const secureRoll=faces=>randomInt(1,faces+1)
export function evaluateRoll(input='d100',{roll=secureRoll,defaultSides=100,maximize=false,budget={dice:0}}={}){
 const text=String(input).trim();if(!text||text.length>200)throw Error('表达式须为1–200字符')
 let p=0,depth=0,ops=0;const detail=[]
 const space=()=>{while(/\s/.test(text[p]??'')&&p<text.length)p++}
 const safe=n=>{if(!Number.isSafeInteger(n)||Math.abs(n)>1e12)throw Error('计算结果过大');return n}
 const value=(v,lo=v,hi=v)=>({v:safe(v),lo:safe(lo),hi:safe(hi)})
 function combine(a,b,op){if(op==='+')return value(a.v+b.v,a.lo+b.lo,a.hi+b.hi);if(op==='-')return value(a.v-b.v,a.lo-b.hi,a.hi-b.lo)
  if(op==='/'&&b.lo<=0&&b.hi>=0)throw Error('除数可能为0')
  const f=op==='*'?(x,y)=>x*y:(x,y)=>Math.trunc(x/y),bounds=[f(a.lo,b.lo),f(a.lo,b.hi),f(a.hi,b.lo),f(a.hi,b.hi)]
  return value(f(a.v,b.v),Math.min(...bounds),Math.max(...bounds))
 }
 const take=()=>{space();const m=text.slice(p).match(/^\d+/);if(!m)return null;p+=m[0].length;return Number(m[0])}
 function atom(){space();if(++ops>128)throw Error('表达式过于复杂');if(text[p]==='+'||text[p]==='-'){const sign=text[p++]==='-'?-1:1,a=atom();return sign===1?a:value(-a.v,-a.hi,-a.lo)}
  if(text[p]==='('){if(++depth>16)throw Error('括号嵌套过深');p++;const value=sum();space();if(text[p++]!==')')throw Error('括号不匹配');depth--;return value}
  let n=take();space();if(/[dD]/.test(text[p]??'')&&p<text.length){p++;const count=n??1,sides=take()??defaultSides
   if(!Number.isInteger(count)||count<1||count>100||!Number.isInteger(sides)||sides<1||sides>1000000||(budget.dice+=count)>100)throw Error('每次最多100颗骰，单骰1–1000000面')
   space();let keep=count,low=false;const match=text.slice(p).match(/^(kh|kl|k)(\d+)/i);if(match){p+=match[0].length;keep=Number(match[2]);low=match[1].toLowerCase()==='kl';if(keep<1||keep>count)throw Error('保留骰数须在1和总骰数之间')}
   const dice=Array.from({length:count},()=>{const v=maximize?sides:roll(sides);if(!Number.isInteger(v)||v<1||v>sides)throw Error('随机源返回无效骰点');return v})
   const chosen=[...dice].sort((a,b)=>low?a-b:b-a).slice(0,keep),total=chosen.reduce((a,b)=>a+b,0)
   detail.push(`${count}d${sides}${match?match[0]:''}=[${dice.join(',')} ]${match?' → 保留['+chosen.join(',')+']':''}=${total}`);return value(total,keep,keep*sides)
  }
  if(n===null)throw Error('这里只支持整数、NdM、kh/kl、括号及加减乘除');return value(n)
 }
 function product(){let a=atom();for(;;){space();const op=text[p];if(!['*','/'].includes(op))return a;p++;a=combine(a,atom(),op)}}
 function sum(){let a=product();for(;;){space();const op=text[p];if(!['+','-'].includes(op))return a;p++;a=combine(a,product(),op)}}
 const result=sum();space();if(p!==text.length)throw Error('表达式末尾有无法识别的内容');return {expression:text,total:maximize?result.hi:result.v,min:result.lo,max:result.hi,detail,dice:budget.dice}
}
export function rollCommand(input='',options={}){
 let text=String(input).trim(),times=1;const repeat=text.match(/^(\d+)\s*#/);if(repeat){times=Number(repeat[1]);text=text.slice(repeat[0].length).trim()}
 if(times<1||times>10)throw Error('多轮掷骰次数须为1–10')
 let expression=text||`d${options.defaultSides??100}`,reason=''
 if(text&&!/^[\d(dD+\-]/.test(text)){expression=`d${options.defaultSides??100}`;reason=text}
 else if(text){const suffix=text.match(/\s+([^\d\s()+*\-\/].*)$/);if(suffix){expression=text.slice(0,suffix.index).trim();reason=suffix[1].trim()}}
 if(reason.length>100)throw Error('掷骰原因最多100字')
 const budget={dice:0},results=Array.from({length:times},()=>evaluateRoll(expression,{...options,budget}))
 return {results,reason,text:results.map((r,i)=>(times>1?`${i+1}. `:'')+r.expression+' = '+r.total+(r.detail.length?'\n'+r.detail.join('；'):'' )).join('\n')}
}
export function cocCheck(skill,{roll=secureRoll,bonus=0,difficulty='普通'}={}){
 if(!Number.isInteger(skill)||skill<0||skill>100)throw Error('技能值须为0–100整数')
 if(!Number.isInteger(bonus)||Math.abs(bonus)>2)throw Error('奖励/惩罚骰最多2颗')
 let candidates
 if(bonus){const unit=roll(10)-1;candidates=Array.from({length:Math.abs(bonus)+1},()=>{const value=(roll(10)-1)*10+unit;return value||100})}else candidates=[roll(100)]
 const result=bonus<0?Math.max(...candidates):Math.min(...candidates)
 let rank=result===1?4:result===100||skill<50&&result>=96?-1:result<=Math.floor(skill/5)?3:result<=Math.floor(skill/2)?2:result<=skill?1:0
 const needed=difficulty==='极难'?3:difficulty==='困难'?2:1
 return {result,candidates,rank,success:rank>=needed,label:['大失败','失败','成功','困难成功','极难成功','大成功'][rank+1],difficulty,threshold:Math.floor(skill/(needed===3?5:needed===2?2:1))}
}
