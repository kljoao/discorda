import type { ServiceStatus } from '../shared/ipc/contracts';

export function validateApiUrl(raw: string, packaged: boolean): string {
  const url = new URL(raw);
  const localHttp = url.protocol === 'http:' && url.hostname === '127.0.0.1' && !packaged;
  if ((!localHttp && url.protocol !== 'https:') || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/') {
    throw new Error('DISCORDA_API_URL must be an HTTPS origin (development allows 127.0.0.1 HTTP)');
  }
  return url.origin;
}

export async function checkServices(origin?: string): Promise<ServiceStatus> {
  const checkedAt = new Date().toISOString();
  if (!origin) return { api: 'offline', database: 'unavailable', checkedAt };
  async function check(route: string): Promise<boolean> {
    try {
      const response = await fetch(`${origin}${route}`, {
        signal: AbortSignal.timeout(4000), redirect: 'error',
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  async function protocol():Promise<number|undefined>{try{const response=await fetch(`${origin}/api/v1/compatibility`,{signal:AbortSignal.timeout(4000),redirect:'error'});if(!response.ok)return;const value=await response.json();if(Number.isSafeInteger(value.protocol)&&value.protocol>0&&value.protocol<=10000)return value.protocol;}catch{} }
  const [live, ready,serverProtocol] = await Promise.all([check('/health/live'), check('/health/ready'),protocol()]);
  return { api: live ? 'online' : 'offline', database: ready ? 'ready' : 'unavailable', checkedAt,serverProtocol };
}
