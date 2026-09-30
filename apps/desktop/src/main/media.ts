import { desktopCapturer, session, shell, type BrowserWindow } from 'electron';
import type { AuthController } from './auth/auth-controller';
import { isTrustedDocument } from './security';
import { ApplicationAudio } from './application-audio';
import type { MediaAction, ChatResult } from '../shared/ipc/contracts';

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateMediaAction(value: unknown): asserts value is MediaAction {
  if (!value || typeof value !== 'object') throw new Error('Invalid media request');
  const a = value as Record<string, unknown>;
  if (!['join', 'pulse', 'leave'].includes(String(a.kind)) || typeof a.channelId !== 'string' || !guid.test(a.channelId) || (a.kind !== 'join' && (typeof a.leaseId !== 'string' || !guid.test(a.leaseId)))) throw new Error('Invalid media request');
}
export class MediaController {
  private active?: { channelId: string; leaseId: string };
  get callActive(){return !!this.active;}
  private generation = 0;
  readonly audio: ApplicationAudio;
  private deviceGrantUntil = 0;
  private testingUntil = 0;
  private testRevision = 0;
  private selected?: { id: string; audio: boolean; until: number };
  private sources = new Set<string>();
  constructor(private auth: AuthController, private window: () => BrowserWindow | null, private development: boolean) {
    this.audio = new ApplicationAudio(window,()=>!!this.active);
    const trusted = (contents: Electron.WebContents | null, url: string) => !!contents && contents.id === this.window()?.webContents.id && isTrustedDocument(url, this.development);
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(
      ((permission === 'media' && (!!this.active || this.deviceGrantUntil > Date.now() || (this.testingUntil > Date.now() && 'mediaTypes' in details && details.mediaTypes?.every(type => type === 'audio') === true))) || permission === 'fullscreen') && details.isMainFrame && trusted(contents, details.requestingUrl ?? '')));
    session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => ((!!this.active || this.testingUntil > Date.now() || this.deviceGrantUntil > Date.now()) && permission === 'media' || permission === 'fullscreen') && trusted(contents, details.requestingUrl ?? ''));
    session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
      const selection = this.selected; this.selected = undefined;
      if (!this.active || !selection || selection.until < Date.now() || request.frame !== this.window()?.webContents.mainFrame || !isTrustedDocument(request.frame.url, this.development)) { callback({}); return; }
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: {width: 0, height: 0} });
        const source = sources.find(s => s.id === selection.id);
        // System loopback is deliberately never granted: audio uses an explicitly chosen process.
        callback(source ? { video: source } : {});
      } catch { callback({}); }
    });
  }
  async action(value: unknown): Promise<ChatResult> {
    validateMediaAction(value);
    const generation = this.generation;
    const result = await this.auth.chatRequest(`/media/${value.kind}`, 'POST', value);
    if (value.kind === 'join' && result.ok) {
      const grant = result.data as { leaseId: string };
      if (generation !== this.generation) {
        await this.auth.chatRequest('/media/leave', 'POST', { channelId: value.channelId, leaseId: grant.leaseId });
        return { ok: false, message: 'Entrada cancelada.' };
      }
      this.active = { channelId: value.channelId, leaseId: grant.leaseId };
    }
    if (value.kind === 'leave' && this.active?.leaseId === value.leaseId) { this.active = undefined; this.selected = undefined; this.audio.stop(); }
    return result;
  }
  async testMicrophone(enabled: boolean) {
    const revision = ++this.testRevision;
    this.testingUntil = 0;
    if (!enabled) return;
    const state = await this.auth.state();
    if (revision !== this.testRevision) return;
    if (state.status === "signed-in") this.testingUntil = Date.now() + 5 * 60_000;
    else throw new Error("Entre novamente para testar o microfone.");
  }
  async devicePermissions(action:unknown) {
    if(action==='request'){const generation=this.generation;if((await this.auth.state()).status!=='signed-in'||generation!==this.generation)throw new Error('Entre na sua conta primeiro.');this.deviceGrantUntil=Date.now()+120000;return;}
    if(action==='microphone'||action==='camera'){await shell.openExternal(action==='microphone'?'ms-settings:privacy-microphone':'ms-settings:privacy-webcam');return;}
    throw new Error('Invalid device permission request');
  }
  async stop() {
    this.audio.stop();this.deviceGrantUntil=0;
    this.testRevision++;
    this.testingUntil = 0;
    this.generation++; const active = this.active; this.active = undefined; this.selected = undefined; this.sources.clear();
    if (active) await this.auth.chatRequest('/media/leave', 'POST', active);
  }
  async listSources() {
    if (!this.active) return [];
    const sources = await desktopCapturer.getSources({types: ['screen', 'window'], thumbnailSize: { width: 240, height: 135 }});
    this.sources = new Set(sources.map(s => s.id));
    return sources.filter(s => s.name !== 'Discorda').map(s => ({id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL()}));
  }
  selectSource(id: unknown, audio: unknown) {
    if (!this.active || typeof id !== 'string' || !this.sources.has(id) || typeof audio !== 'boolean') throw new Error('Invalid capture source');
    this.selected = { id, audio, until: Date.now() + 15000 }; this.sources.clear();
  }
}



