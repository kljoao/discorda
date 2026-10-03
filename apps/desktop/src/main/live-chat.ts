import {serverWebSocket} from './server-transport';
import type {ServerConfig} from './server-config';
import { HubConnectionBuilder, HubConnectionState, HttpTransportType, LogLevel, type HubConnection } from '@microsoft/signalr';
import type { LiveEvent } from '../shared/ipc/contracts';

export class LiveChatClient {
  private connection?: HubConnection;
  private wanted = false;
  private restarting?: Promise<void>;
  snapshot: {state:'connected'|'reconnecting'|'offline';attempts:number;lastConnected?:string}={state:'offline',attempts:0};
  reconnect():Promise<void> {
    if(!this.wanted)return Promise.resolve();
    if(this.restarting)return this.restarting;
    this.restarting=(async()=>{const old=this.connection;this.connection=undefined;await old?.stop().catch(()=>{});await this.starting;})().finally(()=>{this.restarting=undefined;if(this.wanted)void this.ensure();});
    return this.restarting;
  }
  private starting?: Promise<void>;
  private timer?: ReturnType<typeof setInterval>;
  private channel?: string;
  private typingAt = 0;
  private lastPulse = 0;
  private pulsing = false;
  constructor(private readonly origin: string | undefined, private readonly token: () => Promise<string>, private readonly emit: (event: LiveEvent) => void, private readonly away: () => boolean, private readonly serverConfig?:ServerConfig) {}
  start() {
    this.wanted = true;
    if (!this.timer) this.timer = setInterval(() => { void this.ensure(); if (Date.now() - this.lastPulse > 10000) void this.pulse(); }, 2000);
    if (this.connection?.state === HubConnectionState.Connected) this.status('connected');
    void this.ensure();
  }
  private status(data: 'connected' | 'reconnecting' | 'offline') { this.snapshot.state=data;if(data==='connected')this.snapshot.lastConnected=new Date().toISOString();this.emit({kind: 'connection', data}); }
  private async ensure() {
    if (!this.wanted || this.starting || this.restarting || !this.origin) return;
    try{this.connection ??= this.create();}catch{this.status('offline');return;}
    const connection = this.connection;
    if (connection.state !== HubConnectionState.Disconnected) return;
    this.status('reconnecting');
    this.snapshot.attempts++;
    this.starting = connection.start().then(async () => {
      if (!this.wanted || this.connection !== connection) { await connection.stop(); return; }
      this.status('connected'); await this.pulse();
    }).catch(() => { if (this.wanted && this.connection===connection) this.status('offline'); }).finally(() => { this.starting = undefined; });
    await this.starting;
  }
  private create() {
    const options={
      accessTokenFactory: this.token, transport: HttpTransportType.WebSockets, skipNegotiation: true,
      WebSocket:serverWebSocket(this.serverConfig),
    };
    const connection = new HubConnectionBuilder().withUrl(`${this.origin}/api/v1/live`,options).configureLogging(LogLevel.None).withAutomaticReconnect([0, 2000, 5000, 10000]).build();
    connection.on('ChatEvent', (event: LiveEvent) => {
      if (this.wanted && this.connection === connection && ['message', 'presence', 'channels', 'profile', 'voice', 'annotations', 'moderation'].includes(event.kind)) this.emit(event);
    });
    connection.onreconnecting(() => { if (this.wanted && this.connection===connection) this.status('reconnecting'); });
    connection.onreconnected(() => { if (this.wanted && this.connection===connection) { this.status('connected'); void this.pulse(); } });
    connection.onclose(() => { if (this.wanted && this.connection === connection) this.status('offline'); });
    return connection;
  }
  private voiceAt=0;
  async voiceActivity(leaseId:unknown,speaking:unknown){
    if(typeof leaseId!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(leaseId)||typeof speaking!=='boolean')throw new Error('Invalid voice activity');
    if(this.connection?.state!==HubConnectionState.Connected||Date.now()-this.voiceAt<200)return;
    this.voiceAt=Date.now();await this.connection.invoke('VoiceActivity',leaseId,speaking).catch(()=>{});
  }
  activity(channel: unknown, typing: unknown) {
    if (typeof channel !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(channel) || typeof typing !== 'boolean') throw new Error('Invalid activity');
    this.channel = channel; this.typingAt = typing ? Date.now() : 0;
    if (Date.now() - this.lastPulse > 1500) void this.pulse();
  }
  private async pulse() {
    if (this.pulsing || this.connection?.state !== HubConnectionState.Connected || !this.wanted) return;
    this.pulsing = true; this.lastPulse = Date.now();
    try { await this.connection.invoke('Pulse', this.channel ?? null, Date.now() - this.typingAt < 4000, this.away()); }
    catch { /* Reconnect or the next heartbeat will recover; no raw transport errors cross IPC. */ }
    finally { this.pulsing = false; }
  }
  async stop() {
    this.wanted = false; if (this.timer) clearInterval(this.timer); this.timer = undefined;
    const connection = this.connection; this.connection = undefined; this.channel = undefined; this.typingAt = 0;
    await connection?.stop().catch(() => undefined);
    this.emit({kind: 'presence', data: []}); this.status('offline');
  }
}
