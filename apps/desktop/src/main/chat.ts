import type { ChatAction, ChatResult } from '../shared/ipc/contracts';
import type { AuthController } from './auth/auth-controller';
import { shell } from 'electron';

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
  if(a.kind==='reads'||a.kind==='manageMembers')return;
  if(a.kind==='audit'&&(a.before===undefined||numberId(a.before)))return;
  if(a.kind==='role'&&typeof a.userId==='string'&&guid.test(a.userId)&&['Admin','Moderator','Member'].includes(String(a.role)))return;
  if(a.kind==='moderateVoice'&&typeof a.userId==='string'&&guid.test(a.userId)&&(a.channelId===undefined||(typeof a.channelId==='string'&&guid.test(a.channelId))))return;
  if (a.kind === 'members' || a.kind === 'workspace' || a.kind === 'voiceRoster') return;
  if (a.kind === 'profile' && text(a.displayName, 32)) return;
  if (a.kind === 'channel' && text(a.name, 80)) return;
  if (typeof a.channelId !== 'string' || !guid.test(a.channelId)) throw new Error('Invalid channel');
  if(a.kind==='read'&&numberId(a.id))return;
  if(a.kind==='pins'&&(a.before===undefined||numberId(a.before)))return;
  if(a.kind==='search'&&text(a.query,120)&&(a.before===undefined||numberId(a.before)))return;
  if(a.kind==='annotations'&&Array.isArray(a.ids)&&a.ids.length>0&&a.ids.length<=100&&a.ids.every(numberId))return;
  if(a.kind==='pin'&&numberId(a.id)&&typeof a.enabled==='boolean')return;
  if(a.kind==='reaction'&&numberId(a.id)&&typeof a.enabled==='boolean'&&['👍','❤️','😂','🎉','👀','🔥'].includes(String(a.emoji)))return;
  if (a.kind === 'history' && (a.before === undefined || numberId(a.before))) return;
  if (a.kind === 'send' && typeof a.clientId === 'string' && guid.test(a.clientId) && text(a.body, 4000) && (a.replyToId === undefined || numberId(a.replyToId))) return;
  if ((a.kind === 'edit' || a.kind === 'delete') && numberId(a.id) && Number.isSafeInteger(a.version) && Number(a.version) > 0 && (a.kind === 'delete' || text(a.body, 4000))) return;
  throw new Error('Invalid chat request');
}
export async function chatAction(auth: AuthController, value: unknown): Promise<ChatResult> {
  validateChatAction(value);
  const action = value;
  if (action.kind === 'openLink') { await shell.openExternal(action.url); return { ok: true, data: null }; }
  if (action.kind === 'profile') return auth.chatRequest('/profile', 'PUT', {displayName: action.displayName});
  if (action.kind === 'members') return auth.chatRequest('/members');
  if (action.kind === 'voiceRoster') return auth.chatRequest('/media/roster');
  if (action.kind === 'workspace') return auth.chatRequest('/workspace');
  if (action.kind === 'channel') return auth.chatRequest('/channels', 'POST', { name: action.name });
  if(action.kind==='reads')return auth.chatRequest('/reads');
  if(action.kind==='manageMembers')return auth.chatRequest('/management/members');
  if(action.kind==='audit')return auth.chatRequest('/management/audit'+(action.before?'?before='+action.before:''));
  if(action.kind==='role')return auth.chatRequest('/management/members/'+action.userId+'/role','PUT',{role:action.role});
  if(action.kind==='moderateVoice')return auth.chatRequest('/management/members/'+action.userId+'/voice','POST',{channelId:action.channelId??null});
  if(action.kind==='read')return auth.chatRequest('/channels/'+action.channelId+'/read','PUT',{messageId:action.id});
  if(action.kind==='search'||action.kind==='pins')return auth.chatRequest('/channels/'+action.channelId+'/'+action.kind+'?'+new URLSearchParams({...('query' in action?{q:action.query}:{}),...(action.before?{before:action.before}:{})}));
  if(action.kind==='annotations')return auth.chatRequest('/channels/'+action.channelId+'/annotations?ids='+action.ids.join(','));
  const route = `/channels/${action.channelId}/messages`;
  if(action.kind==='reaction'||action.kind==='pin')return auth.chatRequest(route+'/'+action.id+'/'+action.kind,'PUT',{enabled:action.enabled,...(action.kind==='reaction'?{emoji:action.emoji}:{})});
  if (action.kind === 'history') return auth.chatRequest(route + (action.before ? `?before=${action.before}` : ''));
  if (action.kind === 'send') return auth.chatRequest(route, 'POST', { clientId: action.clientId, body: action.body, replyToId: action.replyToId });
  if (action.kind === 'edit') return auth.chatRequest(`${route}/${action.id}`, 'PUT', { body: action.body, version: action.version });
  return auth.chatRequest(`${route}/${action.id}?version=${action.version}`, 'DELETE');
}
