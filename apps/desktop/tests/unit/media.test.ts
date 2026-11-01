import { describe, it, expect, vi } from 'vitest';
vi.mock('electron', () => ({ desktopCapturer: {}, session: {defaultSession:{setPermissionRequestHandler:vi.fn(),setPermissionCheckHandler:vi.fn(),setDisplayMediaRequestHandler:vi.fn()}} }));
import { MediaController,validateMediaAction } from '../../src/main/media';
import {session} from 'electron';
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
  it('grants recording only to the authenticated main window microphone and revokes it afterwards',async()=>{
    const setBackgroundThrottling=vi.fn(),window={webContents:{id:1,setBackgroundThrottling}},auth={state:vi.fn().mockResolvedValue({status:'signed-in'})};
    const media=new MediaController(auth as never,()=>window as never,false);await media.recordVoice(true);
    const request=vi.mocked(session.defaultSession.setPermissionRequestHandler).mock.lastCall![0]!,check=vi.mocked(session.defaultSession.setPermissionCheckHandler).mock.lastCall![0]!;
    const callback=vi.fn(),contents={id:1} as never,details={isMainFrame:true,requestingUrl:'app://discorda/index.html',mediaTypes:['audio']} as never;
    request(contents,'media',callback,details);expect(callback).toHaveBeenLastCalledWith(true);
    request(contents,'media',callback,{...details as object,mediaTypes:['video']} as never);expect(callback).toHaveBeenLastCalledWith(false);
    expect(check(contents,'media','app://discorda',{isMainFrame:true,requestingUrl:'app://discorda/index.html',mediaType:'video'})).toBe(false);
    request({id:2} as never,'media',callback,details);expect(callback).toHaveBeenLastCalledWith(false);
    expect(setBackgroundThrottling).toHaveBeenLastCalledWith(false);await media.recordVoice(false);request(contents,'media',callback,details);expect(callback).toHaveBeenLastCalledWith(false);expect(setBackgroundThrottling).toHaveBeenLastCalledWith(true);
  });
  it('cannot enable a recording grant after a cancellation or sign-out',async()=>{
    let resolve!:(value:unknown)=>void;const auth={state:vi.fn(()=>new Promise(r=>resolve=r))},media=new MediaController(auth as never,()=>null,false);
    const opening=media.recordVoice(true);await media.recordVoice(false);resolve({status:'signed-in'});await opening;
    const request=vi.mocked(session.defaultSession.setPermissionRequestHandler).mock.lastCall![0]!,callback=vi.fn();request({id:1} as never,'media',callback,{isMainFrame:true,requestingUrl:'app://discorda/index.html',mediaTypes:['audio']} as never);expect(callback).toHaveBeenCalledWith(false);
    auth.state.mockImplementation(()=>Promise.resolve({status:'signed-out'}));await expect(media.recordVoice(true)).rejects.toThrow();
  });
});
