import { describe, it, expect, vi } from 'vitest';
vi.mock('electron', () => ({ desktopCapturer: {}, session: {defaultSession:{setPermissionRequestHandler:vi.fn(),setPermissionCheckHandler:vi.fn(),setDisplayMediaRequestHandler:vi.fn()}} }));
import { MediaController,validateMediaAction } from '../../src/main/media';
describe('media IPC boundary', () => {
  const channelId = 'bde069ed-d1c4-4930-92d3-9360eab43cb8';
  it('accepts only fixed actions and UUIDs, requiring a lease for renewal/leave', () => {
    expect(() => validateMediaAction({kind:'join',channelId})).not.toThrow();
    expect(() => validateMediaAction({kind:'pulse',channelId,leaseId:channelId})).not.toThrow();
    for (const value of [{kind:'pulse',channelId}, {kind:'leave',channelId,leaseId:'../admin'}, {kind:'join',channelId:'https://evil.test'}, {kind:'admin',channelId}, null]) expect(() => validateMediaAction(value)).toThrow();
  });
  it('keeps audio heartbeats running in the background only during an authorized call',async()=>{
    const setBackgroundThrottling=vi.fn();
    const auth={chatRequest:vi.fn().mockResolvedValue({ok:true,data:{leaseId:channelId}})};
    const window={webContents:{id:1,setBackgroundThrottling}};
    const media=new MediaController(auth as never,()=>window as never,false);
    await media.action({kind:'join',channelId});expect(setBackgroundThrottling).toHaveBeenLastCalledWith(false);
    await media.action({kind:'leave',channelId,leaseId:channelId});expect(setBackgroundThrottling).toHaveBeenLastCalledWith(true);
    await media.action({kind:'join',channelId});await media.stop();expect(setBackgroundThrottling).toHaveBeenLastCalledWith(true);
  });
});
