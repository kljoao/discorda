import { shell } from 'electron';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AuthState, MemberProfile, ChatResult } from '../../shared/ipc/contracts';
import { listenForLogin } from './loopback';
import { SessionVault } from './session-vault';
import { AuthError } from './auth-error';

export class AuthController {
  private client?: SupabaseClient;
  private supabaseOrigin?: string;
  private creating?: Promise<SupabaseClient>;
  private login?: Promise<AuthState>;
  private cancellation?: AbortController;
  private loggingOut = false;
  private epoch = 0;
  get contextVersion(){return this.epoch;}
  constructor(private readonly apiOrigin: string | undefined, private readonly vault: SessionVault) {}

  private async getClient(): Promise<SupabaseClient> {
    if (this.client) return this.client;
    this.creating ??= (async () => {
      if (!this.apiOrigin) throw new AuthError('O servidor do Discorda ainda não foi configurado.');
      let response: Response;
      try { response = await fetch(`${this.apiOrigin}/api/v1/auth/config`, { signal: AbortSignal.timeout(8000), redirect: 'error' }); }
      catch { throw new AuthError('Não foi possível conectar ao servidor do Discorda.'); }
      if (!response.ok) throw new AuthError('Não foi possível consultar a configuração de login.');
      const config = await response.json() as { enabled: boolean; supabaseUrl?: string; publishableKey?: string };
      if (!config.enabled || !config.supabaseUrl || !config.publishableKey) throw new AuthError('O login ainda está sendo configurado. Tente novamente em breve.');
      const url = new URL(config.supabaseUrl);
      if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
        throw new AuthError('Configuração de login inválida.');
      const client = createClient(url.origin, config.publishableKey, {
        auth: { flowType: 'pkce', storage: this.vault, storageKey: `discorda-${url.hostname}`, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: (input, init) => fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(12_000) }) },
      });
      this.supabaseOrigin = url.origin;
      this.client = client;
      return client;
    })().finally(() => { this.creating = undefined; });
    return this.creating;
  }

  async state(): Promise<AuthState> {
    if (this.login) return { status: 'signing-in' };
    if (this.loggingOut) return { status: 'signed-out' };
    const epoch = this.epoch;
    try {
      const client = await this.getClient();
      const { data, error } = await client.auth.getSession();
      if (error || !data.session) return { status: 'signed-out' };
      return await this.authorize(client, data.session.access_token, epoch);
    } catch (error) { return { status: 'unavailable', message: this.message(error) }; }
  }

  signIn(): Promise<AuthState> {
    if (this.login) return this.login;
    if (this.loggingOut) return Promise.resolve({ status: 'signed-out', message: 'Aguarde a saída da sessão atual.' });
    this.cancellation = new AbortController();
    this.login = this.performLogin(this.cancellation.signal, ++this.epoch).finally(() => { this.login = undefined; this.cancellation = undefined; });
    return this.login;
  }

  private async performLogin(signal: AbortSignal, epoch: number): Promise<AuthState> {
    let callback: Awaited<ReturnType<typeof listenForLogin>> | undefined;
    try {
      const client = await this.getClient();
      signal.throwIfAborted();
      callback = await listenForLogin(signal);
      const { data, error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callback.redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } } });
      if (error || !data.url) throw new AuthError('Não foi possível iniciar o login com Google.');
      const authorization = new URL(data.url);
      if (authorization.origin !== this.supabaseOrigin || authorization.pathname !== '/auth/v1/authorize')
        throw new AuthError('Endereço de autenticação inválido.');
      signal.throwIfAborted();
      await shell.openExternal(authorization.toString());
      const code = await callback.code;
      signal.throwIfAborted();
      const result = await client.auth.exchangeCodeForSession(code);
      if (result.error || !result.data.session) throw new AuthError('Não foi possível concluir o login. Tente novamente.');
      signal.throwIfAborted();
      const state = await this.authorize(client, result.data.session.access_token, epoch);
      signal.throwIfAborted();
      return state;
    } catch (error) {
      await this.clearLocal();
      return { status: 'signed-out', message: signal.aborted ? 'Login cancelado.' : this.message(error) };
    } finally { callback?.close(); }
  }

  private async authorize(client: SupabaseClient, token: string, epoch: number): Promise<AuthState> {
    if (epoch !== this.epoch) return { status: 'signed-out' };
    let response: Response;
    try { response = await fetch(`${this.apiOrigin}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12_000), redirect: 'error' }); }
    catch { return { status: 'unavailable', message: 'Não foi possível verificar seu acesso. Tente novamente.' }; }
    if (epoch !== this.epoch) return { status: 'signed-out' };
    if (response.status === 401 || response.status === 403) {
      await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
      await this.clearLocal();
      return { status: 'signed-out', message: response.status === 403 ? 'Esta conta ainda não está autorizada a entrar no grupo.' : 'Sua sessão expirou ou não pôde ser validada. Entre novamente.' };
    }
    if (!response.ok) return { status: 'unavailable', message: 'O servidor não conseguiu verificar seu acesso. Tente novamente.' };
    const profile = await response.json() as MemberProfile;
    if (epoch !== this.epoch) return { status: 'signed-out' };
    client.auth.startAutoRefresh();
    return { status: 'signed-in', profile };
  }

  cancel(): void { this.cancellation?.abort(); }
  async liveToken(): Promise<string> {
    const epoch = this.epoch;
    if (this.loggingOut || this.login) throw new AuthError('Sessão indisponível.');
    const client = await this.getClient();
    const { data, error } = await client.auth.getSession();
    if (error || !data.session || epoch !== this.epoch) throw new AuthError('Sessão indisponível.');
    return data.session.access_token;
  }

  async chatRequest(route: string, method = 'GET', body?: unknown, area:'chat'|'admin'='chat'): Promise<ChatResult> {
    const epoch = this.epoch;
    if (this.loggingOut || this.login) return { ok: false, message: 'Entre novamente para acessar o grupo.' };
    try {
      const client = await this.getClient();
      const { data, error } = await client.auth.getSession();
      if (error || !data.session || epoch !== this.epoch) return { ok: false, message: 'Entre novamente para acessar o grupo.' };
      const response = await fetch(`${this.apiOrigin}/api/v1/${area}${route}`, { method, body: body === undefined ? undefined : JSON.stringify(body),
        headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(route.includes('/attachments')?60000:12000) });
      if (epoch !== this.epoch) return { ok: false, message: 'A sessão foi encerrada.' };
      if (response.status === 401 || response.status === 403) return { ok: false, status:response.status, message: 'Acesso não autorizado. Verifique sua sessão.' };
      if (response.status === 507) return {ok:false,status:507,message:'O servidor atingiu o limite de anexos. Peça ao administrador para liberar espaço.'};
      if (response.status === 413) return {ok:false,status:413,message:'Arquivo acima do limite aceito pelo servidor.'};
      if (response.status === 409) return { ok: false, status:409, message: 'A mensagem mudou. Atualize o histórico e tente novamente.' };
      if (!response.ok) return { ok: false, status:response.status, message: 'Não foi possível concluir. Verifique os dados e tente novamente.' };
      let result:unknown=null;
      if(response.status!==204){
        const reader=response.body?.getReader();const chunks:Uint8Array[]=[];let size=0;
        if(reader)try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16*1024*1024){await reader.cancel();throw Error('Response limit');}chunks.push(part.value);}}finally{reader.releaseLock();}
        const text=Buffer.concat(chunks,size).toString('utf8');result=response.headers.get('content-type')?.includes('application/json')?JSON.parse(text):text;
      }
      return epoch === this.epoch ? { ok: true, data: result } : { ok: false, message: 'A sessão foi encerrada.' };
    } catch { return { ok: false, message: 'Sem conexão com o servidor. Seu texto foi preservado para tentar novamente.' }; }
  }

  async signOut(): Promise<AuthState> {
    if (this.loggingOut) return { status: 'signed-out' };
    this.loggingOut = true;
    this.epoch++;
    this.cancel();
    await this.login;
    let confirmed = false;
    try {
      const client = await this.getClient();
      const { data } = await client.auth.getSession();
      if (data.session && this.apiOrigin) {
        const response = await fetch(`${this.apiOrigin}/api/v1/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}` }, redirect: 'error', signal: AbortSignal.timeout(8000) });
        confirmed = response.ok || response.status === 403;
      } else confirmed = true;
      await client.auth.signOut({ scope: 'local' });
    } catch { /* Local credentials are still removed when services are unavailable. */ }
    finally { await this.clearLocal(); this.loggingOut = false; }
    return { status: 'signed-out', message: confirmed ? undefined : 'Você saiu deste dispositivo. O servidor não confirmou a revogação; uma sessão remota pode permanecer válida até expirar.' };
  }

  private async clearLocal() {
    this.client?.auth.stopAutoRefresh();
    this.client = undefined;
    await this.vault.clear();
  }
  private message(error: unknown): string {
    // Only our messages reach IPC. Provider/network messages can contain sensitive URLs.
    return error instanceof AuthError
      ? error.message : 'Não foi possível completar a operação. Tente novamente.';
  }
}
