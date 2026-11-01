import type { ChatAction, ChatResult } from '../shared/ipc/contracts';
import type { AuthController } from './auth/auth-controller';
import { shell } from 'electron';
import {stagedAttachmentAction} from './attachment-transfer';
import {attachmentAction} from './attachments';
import {sendVoiceMessage} from './voice-messages';

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = /^[1-9][0-9]{0,18}$/;
export function validateChatAction(value: unknown): asserts value is ChatAction {
  if (!value || typeof value !== 'object') throw new Error('Invalid chat request');
  const a = value as Record<string, unknown>;
  const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !v.includes('\0');
  const numberId = (v: unknown) => typeof v === 'string' && id.test(v) && BigInt(v) <= 9223372036854775807n;
  if (a.kind === 'openLink' && typeof a.url === 'string' && a.url.length <= 2048) {
    const url = new URL(a.url);
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return;
    throw new Error('Invalid link');
  }
  if(a.kind==='attachmentStage'&&text(a.name,180)&&a.bytes instanceof Uint8Array&&a.bytes.byteLength>0&&a.bytes.byteLength<=8*1024*1024)return;
  if(['attachmentProgress','attachmentCancel'].includes(String(a.kind))&&typeof a.token==='string'&&guid.test(a.token))return;
  if(a.kind==='inbox'&&(a.before===undefined||numberId(a.before))&&(a.unread===undefined||typeof a.unread==='boolean'))return;
  if(a.kind==='inboxRead'&&numberId(a.id))return;
  if(a.kind==='catchUp'&&(a.since===undefined||(typeof a.since==='string'&&a.since.length<=30&&Number.isFinite(Date.parse(a.since)))))return;
  if(a.kind==='reads'||a.kind==='manageMembers')return;
  if(a.kind==='audit'&&(a.before===undefined||numberId(a.before)))return;
  if(a.kind==='role'&&typeof a.userId==='string'&&guid.test(a.userId)&&['Admin','Moderator','Member'].includes(String(a.role)))return;
  if(a.kind==='moderateVoice'&&typeof a.userId==='string'&&guid.test(a.userId)&&(a.channelId===undefined||(typeof a.channelId==='string'&&guid.test(a.channelId))))return;
  if(a.kind==='members'&&(a.channelId===undefined||(typeof a.channelId==='string'&&guid.test(a.channelId))))return;
  if (a.kind === 'workspace' || a.kind === 'voiceRoster') return;
  const uuid=(v:unknown)=>typeof v==='string'&&guid.test(v);
  const version=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0;
  const bits=(v:unknown,max=262143)=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=max;
  if(a.kind==='permissionRoles')return;
  if(a.kind==='permissionRoleSave'&&(a.id===undefined||uuid(a.id))&&text(a.name,40)&&typeof a.color==='string'&&/^#[a-f0-9]{6}$/i.test(a.color)&&Number.isInteger(a.position)&&Number(a.position)>=0&&Number(a.position)<=99&&bits(a.permissions)&&version(a.version))return;
  if(a.kind==='permissionRoleDelete'&&uuid(a.id)&&version(a.version))return;
  if(a.kind==='permissionAssign'&&uuid(a.userId)&&Array.isArray(a.roleIds)&&a.roleIds.length<=49&&a.roleIds.every(uuid)&&new Set(a.roleIds).size===a.roleIds.length&&version(a.version))return;
  if(uuid(a.channelId)){
    if(a.kind==='channelPolicy')return;
    if(a.kind==='channelRuleSave'&&['role','member'].includes(String(a.targetType))&&uuid(a.targetId)&&bits(a.allow,36863)&&bits(a.deny,36863)&&(Number(a.allow)&Number(a.deny))===0&&((Number(a.allow)|Number(a.deny))&~36863)===0&&version(a.version))return;
    if(a.kind==='channelRuleDelete'&&uuid(a.id)&&version(a.version))return;
    if(a.kind==='channelSettings'&&text(a.name,80)&&version(a.version)&&(a.archived===undefined||typeof a.archived==='boolean'))return;
  }
  if (a.kind === 'profile' && text(a.displayName, 32)) return;
  if (a.kind === 'renameWorkspace' && text(a.name,80) && !/[\p{Cc}\p{Cf}]/u.test(String(a.name))) return;
  if (a.kind === 'temporaryRoom' && text(a.name,40)) return;
  if (a.kind === 'channel' && text(a.name, 80) && (a.type===undefined||a.type==='text'||a.type==='voice')) return;
  if (typeof a.channelId !== 'string' || !guid.test(a.channelId)) throw new Error('Invalid channel');
  if(a.kind==='voiceSend'&&typeof a.clientId==='string'&&guid.test(a.clientId)&&a.bytes instanceof Uint8Array&&a.bytes.byteLength>=32&&a.bytes.byteLength<=8*1024*1024&&typeof a.durationMs==='number'&&Number.isFinite(a.durationMs)&&a.durationMs>=500&&a.durationMs<=120000)return;
  if(a.kind==='attachmentTransfer'&&typeof a.clientId==='string'&&guid.test(a.clientId)&&typeof a.token==='string'&&guid.test(a.token))return;
  if(a.kind==='threadFollow'&&numberId(a.id)&&(a.enabled===undefined||typeof a.enabled==='boolean'))return;
  if(a.kind==='attachmentUpload'&&typeof a.clientId==='string'&&guid.test(a.clientId))return;
  if(a.kind==='attachmentGet'&&typeof a.id==='string'&&guid.test(a.id)&&(a.preview===undefined||typeof a.preview==='boolean')&&(a.operation===undefined||['preview','download','copyImage','copyLink'].includes(String(a.operation))))return;
  if((a.kind==='message'||a.kind==='context')&&numberId(a.id))return;
  if(a.kind==='read'&&numberId(a.id))return;
  if(a.kind==='pins'&&(a.before===undefined||numberId(a.before)))return;
  if(a.kind==='search'&&typeof a.query==='string'&&a.query.length<=120&&!/[\u0000-\u001f]/.test(a.query)&&(a.query.trim()||a.author||a.after||a.until||a.fileType)&&(a.author===undefined||(typeof a.author==='string'&&guid.test(a.author)))&&[a.after,a.until].every(d=>d===undefined||(typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)))&&(a.fileType===undefined||['any','image','video','audio','document'].includes(String(a.fileType)))&&(a.before===undefined||numberId(a.before)))return;
  if(a.kind==='annotations'&&Array.isArray(a.ids)&&a.ids.length>0&&a.ids.length<=100&&a.ids.every(numberId))return;
  if(a.kind==='pin'&&numberId(a.id)&&typeof a.enabled==='boolean')return;
  if(a.kind==='reaction'&&numberId(a.id)&&typeof a.enabled==='boolean'&&['👍','❤️','😂','🎉','👀','🔥'].includes(String(a.emoji)))return;
  if (a.kind === 'history' && (a.thread===undefined||numberId(a.thread)) && (a.before === undefined || numberId(a.before))) return;
  if (a.kind === 'send' && (a.threadRootId===undefined||numberId(a.threadRootId)) && typeof a.clientId === 'string' && guid.test(a.clientId) && text(a.body, 4000) && (a.replyToId === undefined || numberId(a.replyToId))) return;
  if ((a.kind === 'edit' || a.kind === 'delete') && numberId(a.id) && Number.isSafeInteger(a.version) && Number(a.version) > 0 && (a.kind === 'delete' || text(a.body, 4000))) return;
  throw new Error('Invalid chat request');
}
export async function chatAction(auth: AuthController, value: unknown): Promise<ChatResult> {
  validateChatAction(value);
  const action = value;
  if(action.kind==='permissionRoles')return auth.chatRequest('/permissions');
  if(action.kind==='permissionRoleSave')return auth.chatRequest('/permissions/roles'+(action.id?'/'+action.id:''),action.id?'PUT':'POST',{name:action.name,color:action.color,position:action.position,permissions:action.permissions,version:action.version});
  if(action.kind==='permissionRoleDelete')return auth.chatRequest('/permissions/roles/'+action.id+'?version='+action.version,'DELETE');
  if(action.kind==='permissionAssign')return auth.chatRequest('/permissions/members/'+action.userId,'PUT',{roleIds:action.roleIds,version:action.version});
  if(action.kind==='channelPolicy')return auth.chatRequest('/channels/'+action.channelId+'/permissions');
  if(action.kind==='channelRuleSave')return auth.chatRequest('/channels/'+action.channelId+'/permissions','PUT',{targetType:action.targetType,targetId:action.targetId,allow:action.allow,deny:action.deny,version:action.version});
  if(action.kind==='channelRuleDelete')return auth.chatRequest('/channels/'+action.channelId+'/permissions/'+action.id+'?version='+action.version,'DELETE');
  if(action.kind==='channelSettings')return auth.chatRequest('/channels/'+action.channelId+'/settings','PUT',{name:action.name,version:action.version,archived:action.archived??false});
  if(action.kind==='voiceSend')return sendVoiceMessage(auth,action);
  if(action.kind==='attachmentStage'||action.kind==='attachmentTransfer'||action.kind==='attachmentProgress'||action.kind==='attachmentCancel')return stagedAttachmentAction(auth,action);
  if(action.kind==='catchUp')return auth.chatRequest('/catch-up'+(action.since?'?since='+encodeURIComponent(action.since):''));
  if(action.kind==='inbox')return auth.chatRequest('/inbox?'+new URLSearchParams({...action.before?{before:action.before}:{},...action.unread?{unread:'true'}:{}}));
  if(action.kind==='inboxRead')return auth.chatRequest('/inbox/'+action.id+'/read','PUT');
  if(action.kind==='threadFollow')return auth.chatRequest('/channels/'+action.channelId+'/threads/'+action.id+'/follow',action.enabled===undefined?'GET':'PUT',action.enabled===undefined?undefined:{enabled:action.enabled});
  if(action.kind==='attachmentUpload'||action.kind==='attachmentGet')return attachmentAction(auth,action);
  if(action.kind==='temporaryRoom')return auth.chatRequest('/temporary-rooms','POST',{name:action.name});
  if (action.kind === 'openLink') {
    const attachment=auth.attachmentFromUrl(action.url);
    if(attachment)return attachmentAction(auth,{kind:'attachmentGet',...attachment,operation:'download'});
    await shell.openExternal(action.url); return { ok: true, data: null };
  }
  if (action.kind === 'profile') return auth.chatRequest('/profile', 'PUT', {displayName: action.displayName});
  if (action.kind === 'members') return auth.chatRequest('/members'+(action.channelId?'?channelId='+action.channelId:''));
  if (action.kind === 'voiceRoster') return auth.chatRequest('/media/roster');
  if (action.kind === 'renameWorkspace') return auth.chatRequest('/workspace','PUT',{name:action.name});
  if (action.kind === 'workspace') return auth.chatRequest('/workspace');
  if (action.kind === 'channel') return auth.chatRequest('/channels', 'POST', { name: action.name, type:action.type??'text' });
  if(action.kind==='reads')return auth.chatRequest('/reads');
  if(action.kind==='manageMembers')return auth.chatRequest('/management/members');
  if(action.kind==='audit')return auth.chatRequest('/management/audit'+(action.before?'?before='+action.before:''));
  if(action.kind==='role')return auth.chatRequest('/management/members/'+action.userId+'/role','PUT',{role:action.role});
  if(action.kind==='moderateVoice')return auth.chatRequest('/management/members/'+action.userId+'/voice','POST',{channelId:action.channelId??null});
  if(action.kind==='read')return auth.chatRequest('/channels/'+action.channelId+'/read','PUT',{messageId:action.id});
  if(action.kind==='search'||action.kind==='pins')return auth.chatRequest('/channels/'+action.channelId+'/'+action.kind+'?'+new URLSearchParams({...('query' in action?{q:action.query,...action.author?{author:action.author}:{},...action.after?{after:action.after}:{},...action.until?{until:action.until}:{},...action.fileType?{fileType:action.fileType}:{}}:{}),...(action.before?{before:action.before}:{})}));
  if(action.kind==='annotations')return auth.chatRequest('/channels/'+action.channelId+'/annotations?ids='+action.ids.join(','));
  const route = `/channels/${action.channelId}/messages`;
  if(action.kind==='context')return auth.chatRequest(route+'/'+action.id+'/context');
  if(action.kind==='message')return auth.chatRequest(route+'/'+action.id);
  if(action.kind==='reaction'||action.kind==='pin')return auth.chatRequest(route+'/'+action.id+'/'+action.kind,'PUT',{enabled:action.enabled,...(action.kind==='reaction'?{emoji:action.emoji}:{})});
  if (action.kind === 'history') return auth.chatRequest(route + '?' + new URLSearchParams({...action.before?{before:action.before}:{},...action.thread?{thread:action.thread}:{}}));
  if (action.kind === 'send') return auth.chatRequest(route, 'POST', { clientId: action.clientId, body: action.body, replyToId: action.replyToId, threadRootId:action.threadRootId });
  if (action.kind === 'edit') return auth.chatRequest(`${route}/${action.id}`, 'PUT', { body: action.body, version: action.version });
  return auth.chatRequest(`${route}/${action.id}?version=${action.version}`, 'DELETE');
}
