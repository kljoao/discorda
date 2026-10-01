import { afterEach, describe, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => {
  const connections: {state: string; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; invoke: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn>; onreconnecting: ReturnType<typeof vi.fn>; onreconnected: ReturnType<typeof vi.fn>; onclose: ReturnType<typeof vi.fn>}[] = [];
  return {connections};
});
vi.mock('@microsoft/signalr', () => ({
  HubConnectionState: {Connected: 'Connected', Disconnected: 'Disconnected'}, HttpTransportType: {WebSockets: 1}, LogLevel: {None: 6},
  HubConnectionBuilder: class {
    withUrl() {return this;} configureLogging() {return this;} withAutomaticReconnect() {return this;}
    build() {
      const c = {state: 'Disconnected', start: vi.fn(async () => {c.state = 'Connected';}), stop: vi.fn(async () => {c.state = 'Disconnected';}), invoke: vi.fn(async () => {}), on: vi.fn(), onreconnecting: vi.fn(), onreconnected: vi.fn(), onclose: vi.fn()};
      mocked.connections.push(c); return c;
    }
  },
}));
import { LiveChatClient } from '../../src/main/live-chat';
afterEach(() => {vi.useRealTimers(); mocked.connections.length = 0;});
describe('live chat lifecycle', () => {
  it('keeps one connection and one handler under repeated starts; stop cancels retries and drops stale events', async () => {
    vi.useFakeTimers(); const emit = vi.fn();
    const client = new LiveChatClient('http://127.0.0.1:5080', async () => 'private-token', emit, () => false);
    client.start(); client.start(); await vi.advanceTimersByTimeAsync(20);
    expect(mocked.connections).toHaveLength(1); const connection = mocked.connections[0];
    expect(connection.start).toHaveBeenCalledTimes(1); expect(connection.on).toHaveBeenCalledTimes(1);
    client.activity('225a47d7-779e-4992-89d2-03b1517f9112', true);
    expect(() => client.activity('../admin', true)).toThrow();
    await client.stop(); const before = emit.mock.calls.length;
    connection.on.mock.calls[0][1]({kind: 'message', data: {body: 'stale'}});
    await vi.advanceTimersByTimeAsync(30000);
    expect(emit).toHaveBeenCalledTimes(before); expect(connection.stop).toHaveBeenCalledTimes(1);
    expect(connection.start).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(emit.mock.calls)).not.toContain('private-token');
  });
  it('retries initial start failures, not only previously established connections', async () => {
    vi.useFakeTimers(); const client = new LiveChatClient('http://127.0.0.1:5080', async () => '', vi.fn(), () => false);
    client.start(); await vi.advanceTimersByTimeAsync(1);
    const c = mocked.connections[0]; c.state = 'Disconnected'; c.start.mockRejectedValueOnce(new Error('offline'));
    await vi.advanceTimersByTimeAsync(2000); expect(c.start).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000); expect(c.start).toHaveBeenCalledTimes(3);
    await client.stop();
  });
});
it('coalesces manual reconnects and ignores old connection callbacks',async()=>{
 vi.useFakeTimers();const emit=vi.fn(),client=new LiveChatClient('http://127.0.0.1:5080',async()=>'',emit,()=>false);client.start();await vi.advanceTimersByTimeAsync(1);const old=mocked.connections[0];await Promise.all([client.reconnect(),client.reconnect()]);await vi.advanceTimersByTimeAsync(1);expect(mocked.connections).toHaveLength(2);const before=emit.mock.calls.length;old.onreconnecting.mock.calls[0][0]();expect(emit).toHaveBeenCalledTimes(before);expect(client.snapshot.state).toBe('connected');await client.stop();await client.reconnect();expect(mocked.connections).toHaveLength(2);
});
