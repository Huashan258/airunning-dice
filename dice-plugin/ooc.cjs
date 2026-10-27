// Reply/@ segments are routing metadata; media before text is actual content.
function isOutOfCharacter(message) {
 let text=''
 if(Array.isArray(message)){
  for(const segment of message){
   if(['reply','at'].includes(segment?.type))continue
   if(segment?.type!=='text')break
   text+=String(segment.data?.text??'')
  }
 }else text=String(message??'').replace(/^(?:\s|\[CQ:(?:reply|at),[^\]]*\])*/u,'')
 return text.replace(/^\uFEFF/u,'').trimStart().startsWith('**')
}
module.exports={isOutOfCharacter}
