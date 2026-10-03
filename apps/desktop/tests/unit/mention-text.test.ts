import {describe,it,expect} from 'vitest';
import {formatMentions,applyMentionEdit,mentionOffset,findMention} from '../../src/renderer/features/chat/mention-text';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const names=new Map([[id,{name:'João Silva'}],[other,{name:'Ana'}]]);
describe('mention editor',()=>{
 it('shows names but preserves IDs across unrelated edits and cursor offsets',()=>{
  const body='Olá <@'+id+'>, fale com <@'+other+'>!';
  const display=formatMentions(body,names);
  expect(display.text).toBe('Olá @João Silva, fale com @Ana!');
  expect(applyMentionEdit(body,display,'Oi! '+display.text)).toBe('Oi! '+body);
  expect(applyMentionEdit(body,display,display.text+' 👍')).toBe(body+' 👍');
  expect(mentionOffset(display,display.text.length)).toBe(body.length);
 });
 it('converts a partially edited mention to plain text, preserving other identities',()=>{
  const body='<@'+id+'> e <@'+other+'>',view=formatMentions(body,names);
  expect(applyMentionEdit(body,view,'@João Silv e @Ana')).toBe('@João Silv e <@'+other+'>');
  expect(applyMentionEdit(body,view,' e @Ana')).toBe(' e <@'+other+'>');
  expect(applyMentionEdit(body,view,'@João Silvax e @Ana')).toBe('<@'+id+'>x e <@'+other+'>');
 });
 it('uses the edited selection to distinguish two people with the same name',()=>{
  const body='<@'+id+'> <@'+other+'>',view=formatMentions(body,new Map([[id,{name:'Ana'}],[other,{name:'Ana'}]]));
  expect(applyMentionEdit(body,view,'@Ana',{start:0,end:5,inputType:'deleteContentBackward'})).toBe('<@'+other+'>');
  expect(applyMentionEdit(body,view,'@Ana',{start:4,end:9,inputType:'deleteContentBackward'})).toBe('<@'+id+'>');
 });
 it('opens suggestions only at a mention boundary, not inside an email',()=>{
  expect(findMention('Olá @an',7)).toEqual({start:4,end:7,query:'an'});
  expect(findMention('@',1)?.query).toBe('');
  expect(findMention('email@example.test',18)).toBeUndefined();
  expect(findMention('Olá @Ana ',9)).toBeUndefined();
 });
});
