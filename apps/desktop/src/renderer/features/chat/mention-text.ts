type Span = {start:number;end:number;sourceStart:number;sourceEnd:number};
export type MentionText = {text:string;spans:Span[]};

/** Keep immutable user IDs in drafts and messages, but names in the editor. */
export function formatMentions(body:string, names:ReadonlyMap<string,{name:string}>):MentionText {
  const spans:Span[]=[];let text='',offset=0;
  for(const match of body.matchAll(/<@([0-9a-f-]{36})>/gi)){
    text+=body.slice(offset,match.index);
    const start=text.length;text+='@'+(names.get(match[1])?.name??'membro');
    spans.push({start,end:text.length,sourceStart:match.index,sourceEnd:match.index+match[0].length});
    offset=match.index+match[0].length;
  }
  return {text:text+body.slice(offset),spans};
}
export function mentionOffset(value:MentionText,position:number,end=false){
  let delta=0;
  for(const span of value.spans){
    if(position<span.start)break;
    if(position===span.start)return span.sourceStart;
    if(position<span.end)return end?span.sourceEnd:span.sourceStart;
    delta=span.sourceEnd-span.end;
  }
  return position+delta;
}
/** Linear diff; editing a name converts that mention to ordinary text. */
export function applyMentionEdit(body:string,value:MentionText,next:string,selection?:{start:number;end:number;inputType:string}){
  let start=0;while(start<value.text.length&&start<next.length&&value.text[start]===next[start])start++;
  let suffix=0;while(suffix<value.text.length-start&&suffix<next.length-start&&value.text[value.text.length-1-suffix]===next[next.length-1-suffix])suffix++;
  let end=value.text.length-suffix,newEnd=next.length-suffix;
  // Native selection disambiguates equal display names belonging to different users.
  if(selection){
    let left=selection.start,right=selection.end;
    const removed=value.text.length-next.length;
    if(left===right&&removed>0){if(selection.inputType.endsWith('Backward'))left=Math.max(0,left-removed);else right=Math.min(value.text.length,right+removed);}
    const candidateEnd=next.length-(value.text.length-right);
    if(candidateEnd>=left&&next.slice(0,left)===value.text.slice(0,left)&&next.slice(candidateEnd)===value.text.slice(right)){start=left;end=right;newEnd=candidateEnd;}
  }
  for(const span of value.spans){
    if(start>span.start&&start<span.end)start=span.start;
    if(end>span.start&&end<span.end){newEnd+=span.end-end;end=span.end;}
  }
  return body.slice(0,mentionOffset(value,start))+next.slice(start,newEnd)+body.slice(mentionOffset(value,end,true));
}
export function findMention(text:string,caret:number){
  const before=text.slice(0,caret),match=/(?:^|\s)@([^@\s<>]*)$/.exec(before);
  return match?{start:caret-match[1].length-1,end:caret,query:match[1]}:undefined;
}
