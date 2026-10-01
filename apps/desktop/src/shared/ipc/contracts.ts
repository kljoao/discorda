export interface UpdateState {startupNotice?:string;status:'idle'|'checking'|'current'|'downloading'|'ready'|'error';version?:string;progress?:number;message?:string}
export interface AppInfo {
  version: string;
  platform: string;
  serverConfigured?:boolean;
}

export interface ServiceStatus {
  api: 'online' | 'offline';
  database: 'ready' | 'unavailable';
  checkedAt: string;
}

export interface DiagnosticReport {version:string;platform:string;checkedAt:string;api:ServiceStatus['api'];database:ServiceStatus['database'];chat:'connected'|'reconnecting'|'offline';attempts:number;lastConnected?:string;callActive:boolean;update:UpdateState['status'];}
export type AdminAction={kind:'settings'|'users'|'network'|'firewall'}|{kind:'user';email:string;enabled:boolean}|{kind:'networkSave';addresses:string[]};
export interface DesktopApi {
  admin(action:AdminAction):Promise<ChatResult>;
  notifyMessage(channelId:string):Promise<void>;
  reconnectLive():Promise<void>;
  diagnostics(action:'status'|'export'):Promise<DiagnosticReport>;
  updates(action:'status'|'check'|'install'):Promise<UpdateState>;
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
  audioStatus:'media:audio-status', devicePermissions:'media:permissions', audioApplications:'media:applications', applicationAudio:'media:application-audio', applicationAudioData:'media:audio-data', applicationAudioEnd:'media:audio-end',
  microphoneTest: 'media:test', media: 'media:action', captureSources: 'media:sources', selectCapture: 'media:select',
  updates:'app:updates',importServer:'app:import-server',connectServer:'app:connect-server',appInfo: 'app:info',
  services: 'app:check-services', admin:'admin:action',notifyMessage:'chat:notify', diagnostics:'app:diagnostics', reconnectLive:'live:reconnect',
  authState: 'auth:state',
  signIn: 'auth:sign-in',
  cancelSignIn: 'auth:cancel',
  signOut: 'auth:sign-out',
  chat: 'chat:action',
  voiceActivity:'live:voice-activity', liveStart: 'live:start', liveStop: 'live:stop', liveActivity: 'live:activity', liveEvent: 'live:event',
} as const;

export interface ChatMessage { id: string; channelId: string; authorId: string; authorName: string; clientId: string; body: string; replyToId: string | null; createdAt: string; editedAt: string | null; deletedAt: string | null; version: number; }
export interface ChatWorkspace { isAdmin?:boolean; id: string; name: string; userId: string; role: 'Owner' | 'Member'; channels: { id: string; name: string;lastMessageId?:string|null }[]; voiceChannels?: { id: string; name: string }[]; }
export type ChatAction = { kind: 'profile'; displayName: string } | { kind: 'members' } | { kind: 'voiceRoster' } | { kind: 'workspace' } | { kind: 'channel'; name: string } | { kind: 'openLink'; url: string }
  | { kind: 'history'; channelId: string; before?: string }
  | { kind: 'send'; channelId: string; clientId: string; body: string; replyToId?: string }
  | { kind: 'edit'; channelId: string; id: string; version: number; body: string }
  | { kind: 'delete'; channelId: string; id: string; version: number };
export type ChatResult = { ok: true; data: unknown } | { ok: false; message: string; status?:number };
export interface PresenceMember { avatarUrl?:string|null; id: string; name: string; status: 'online' | 'away' | 'offline'; typingChannelId: string | null; }
export interface VoiceMember { leaseId?:string; channelId: string; userId: string; name: string; }
export type LiveEvent = {kind:'voice';data:{userId:string;leaseId:string;channelId:string;speaking:boolean}} | { kind: 'profile'; data: {userId: string; displayName: string} } | { kind: 'message'; data: ChatMessage } | {kind: 'channels'; data: {id: string}}
  | { kind: 'presence'; data: PresenceMember[] } | { kind: 'connection'; data: 'connected' | 'reconnecting' | 'offline' };

export type MediaAction = { kind: "join"; channelId: string } | { kind: "pulse" | "leave"; channelId: string; leaseId: string };
export interface CaptureSource { id: string; name: string; thumbnail: string; }
export interface MediaGrant { leaseId: string; url: string; token: string; }

export interface AudioApplication {id:string;name:string;title:string;windowId:string;}
