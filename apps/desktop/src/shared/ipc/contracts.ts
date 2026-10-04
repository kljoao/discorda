export interface UpdateState {channel?:'stable'|'beta';startupNotice?:string;status:'idle'|'checking'|'current'|'downloading'|'ready'|'error';version?:string;progress?:number;message?:string}
export interface AppInfo {
  version: string;
  platform: string;
  serverConfigured?:boolean;
  serverId?:string;
}

export interface ServiceStatus {
  serverProtocol?:number;
  api: 'online' | 'offline';
  database: 'ready' | 'unavailable';
  checkedAt: string;
}

export interface DiagnosticReport {serverProtocol?:number;performance?:{cpuPercent:number;memoryMiB:number;processes:number};version:string;platform:string;checkedAt:string;api:ServiceStatus['api'];database:ServiceStatus['database'];chat:'connected'|'reconnecting'|'offline';attempts:number;lastConnected?:string;callActive:boolean;update:UpdateState['status'];}
export type ServerAction={kind:'list'|'invite'|'dismissInvite'}|{kind:'select'|'remove';id:string}|{kind:'rename';id:string;name:string};
export interface ServerList {servers:{id:string;name:string;address:string;current:boolean}[];pendingInvite?:string;invite?:string}
export type AdminAction={kind:'invites'|'joinRequests'|'storagePolicy'|'storagePreview'}|{kind:'inviteCreate';hours:number;maxUses:number}|{kind:'inviteRevoke';id:string}|{kind:'joinReview';id:string;approve:boolean}|{kind:'storageSave';quotaMiB:number;retentionDays:number;version:number}|{kind:'storageCleanup';cutoff:string;fingerprint:string}|{kind:"attachments";before?:string}|{kind:"attachmentDelete";id:string}|{kind:'settings'|'users'|'network'|'firewall'|'operations'|'operationsExport'}|{kind:'setup';name:string;textChannels:string[];voiceChannels:string[]}|{kind:'user';email:string;enabled:boolean}|{kind:'networkSave';addresses:string[]};
export interface ShortcutSettings {enabled:boolean;pushToTalk:boolean;mute:string;talk:string;deafen?:string;cinema?:string}
export interface DesktopApi {
  streamWindow?(action:{pinned?:boolean;compact?:boolean}):Promise<void>;
  onPowerState(listener:(state:'suspend'|'resume')=>void):()=>void;
  servers(action:ServerAction):Promise<ServerList>;
  onInvite(listener:()=>void):()=>void;
  shortcuts(settings:ShortcutSettings):Promise<void>;
  onShortcut(listener:(event:'mute'|'deafen'|'cinema'|'unavailable'|boolean)=>void):()=>void;
  admin(action:AdminAction):Promise<ChatResult>;
  notifyMessage(channelId:string):Promise<void>;
  reconnectLive():Promise<void>;
  diagnostics(action:'status'|'export'):Promise<DiagnosticReport>;
  updates(action:'status'|'check'|'install'|'stable'|'beta'):Promise<UpdateState>;
  importServer():Promise<boolean>;
  connectServer(ip:string):Promise<{ok:boolean;message?:string}>;
  getAppInfo(): Promise<AppInfo>;
  checkServices(): Promise<ServiceStatus>;
  getAuthState(): Promise<AuthState>;
  signIn(): Promise<AuthState>;
  cancelSignIn(): Promise<void>;
  signOut(): Promise<AuthState>;
  chat(action: ChatAction): Promise<ChatResult>;
  media(action: MediaAction): Promise<ChatResult>;
  devicePermissions(action: 'request'|'microphone'|'camera'): Promise<void>;
  audioStatus():Promise<{supported:boolean;os:string}>;
  audioApplications(): Promise<AudioApplication[]>;
  applicationAudio(action: {kind:'start';id:string}|{kind:'stop'|'pulse'}): Promise<void>;
  onApplicationAudio(listener:(data:Uint8Array)=>void):()=>void;
  onApplicationAudioEnd(listener:()=>void):()=>void;
  microphoneTest(enabled: boolean): Promise<void>;
  captureSources(): Promise<CaptureSource[]>;
  selectCapture(id: string, audio: boolean): Promise<void>;
  startLive(): Promise<void>;
  stopLive(): Promise<void>;
  voiceActivity(leaseId:string,speaking:boolean):Promise<void>;
  liveActivity(channelId: string, typing: boolean): Promise<void>;
  onLiveEvent(listener: (event: LiveEvent) => void): () => void;
}

export interface MemberProfile { avatarUrl?:string|null; id: string; displayName: string; email: string; }
export type AuthState =
  | { status: 'signed-in'; profile: MemberProfile }
  | { status: 'signed-out' | 'unavailable' | 'signing-in'; message?: string };

export const IPC = {
  streamWindow:'media:viewer',
  servers:'app:servers',inviteEvent:'app:invite',
  shortcuts:'app:shortcuts',shortcutEvent:'app:shortcut-event',
  audioStatus:'media:audio-status', devicePermissions:'media:permissions', audioApplications:'media:applications', applicationAudio:'media:application-audio', applicationAudioData:'media:audio-data', applicationAudioEnd:'media:audio-end',
  microphoneTest: 'media:test', media: 'media:action', captureSources: 'media:sources', selectCapture: 'media:select',
  updates:'app:updates',importServer:'app:import-server',connectServer:'app:connect-server',appInfo: 'app:info',
  powerState:'app:power-state',services: 'app:check-services', admin:'admin:action',notifyMessage:'chat:notify', diagnostics:'app:diagnostics', reconnectLive:'live:reconnect',
  authState: 'auth:state',
  signIn: 'auth:sign-in',
  cancelSignIn: 'auth:cancel',
  signOut: 'auth:sign-out',
  chat: 'chat:action',
  voiceActivity:'live:voice-activity', liveStart: 'live:start', liveStop: 'live:stop', liveActivity: 'live:activity', liveEvent: 'live:event',
} as const;

export interface ChatMessage { threadReplyCount?:number; threadRootId?:string|null; attachments?:{id:string;name:string;size:number}[]; replyAuthorId?:string|null; id: string; channelId: string; authorId: string; authorName: string; clientId: string; body: string; replyToId: string | null; createdAt: string; editedAt: string | null; deletedAt: string | null; version: number; }
export interface ChatWorkspace { isAdmin?:boolean; id: string; name: string; userId: string; role: 'Owner' | 'Admin' | 'Moderator' | 'Member'; channels: { id: string; name: string;lastMessageId?:string|null }[]; voiceChannels?: { id: string; name: string;temporary?:boolean }[]; }
export type ManagementAction = {kind:'manageMembers'} | {kind:'audit';before?:string} | {kind:'role';userId:string;role:'Admin'|'Moderator'|'Member'} | {kind:'moderateVoice';userId:string;channelId?:string};
export type ChatAction = {kind:'catchUp';since?:string}| {kind:"attachmentStage";name:string;bytes:Uint8Array}|{kind:"attachmentTransfer";channelId:string;clientId:string;token:string}|{kind:"attachmentProgress";token:string}|{kind:"attachmentCancel";token:string}| {kind:"inbox";before?:string;unread?:boolean}|{kind:"inboxRead";id:string}|{kind:"threadFollow";channelId:string;id:string;enabled?:boolean}| {kind:'message';channelId:string;id:string}|{kind:'context';channelId:string;id:string} | {kind:'temporaryRoom';name:string} | {kind:'attachmentUpload';channelId:string;clientId:string} | {kind:'attachmentGet';channelId:string;id:string;preview?:boolean} | {kind:'renameWorkspace';name:string} | ManagementAction | {kind:'reads'} | {kind:'read';channelId:string;id:string}
  | {kind:'search';channelId:string;query:string;before?:string;author?:string;after?:string;until?:string;fileType?:'any'|'image'|'video'|'audio'|'document'} | {kind:'pins';channelId:string;before?:string}
  | {kind:'annotations';channelId:string;ids:string[]} | {kind:'reaction';channelId:string;id:string;emoji:string;enabled:boolean}
  | {kind:'pin';channelId:string;id:string;enabled:boolean} | { kind: 'profile'; displayName: string } | { kind: 'members' } | { kind: 'voiceRoster' } | { kind: 'workspace' } | { kind: 'channel'; name: string } | { kind: 'openLink'; url: string }
  | { kind: 'history'; channelId: string; before?: string; thread?:string }
  | { kind: 'send'; channelId: string; clientId: string; body: string; replyToId?: string; threadRootId?:string }
  | { kind: 'edit'; channelId: string; id: string; version: number; body: string }
  | { kind: 'delete'; channelId: string; id: string; version: number };
export type ChatResult = { ok: true; data: unknown } | { ok: false; message: string; status?:number };
export interface PresenceMember { avatarUrl?:string|null; id: string; name: string; status: 'online' | 'away' | 'offline'; typingChannelId: string | null; }
export interface VoiceMember { screenSharing?:boolean; leaseId?:string; channelId: string; userId: string; name: string; }
export type LiveEvent = {kind:'thread';data:{channelId:string;id:string;count:number}} | {kind:'voiceRoster';data:VoiceMember[]} | {kind:'annotations';data:{channelId:string;id?:string}} | {kind:'moderation';data:{userId:string;channelId:string|null}} | {kind:'voice';data:{userId:string;leaseId:string;channelId:string;speaking:boolean}} | { kind: 'profile'; data: {userId: string; displayName: string} } | { kind: 'message'; data: ChatMessage } | {kind: 'channels'; data: {id: string}}
  | { kind: 'presence'; data: PresenceMember[] } | { kind: 'connection'; data: 'connected' | 'reconnecting' | 'offline' };

export type MediaAction = { kind: "join"; channelId: string } | { kind: "pulse" | "leave" | "ready"; channelId: string; leaseId: string };
export interface CaptureSource { id: string; name: string; thumbnail: string; }
export interface MediaGrant { leaseId: string; url: string; token: string; }

export interface AudioApplication {id:string;name:string;title:string;windowId:string;}
