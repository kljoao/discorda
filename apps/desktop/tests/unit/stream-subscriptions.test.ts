import {EventEmitter} from 'node:events';
import {describe,expect,it,vi} from 'vitest';
import {RoomEvent,Track,type Room} from 'livekit-client';
import {bindStreamSubscriptions,streamKey} from '../../src/renderer/features/chat/stream-subscriptions';

function publication(source:Track.Source,trackSid:string) {
  return {source,trackSid,isDesired:false,setSubscribed:vi.fn(function(this:{isDesired:boolean},desired:boolean){this.isDesired=desired;})};
}
function fixture() {
  const screen=publication(Track.Source.ScreenShare,'screen-1'),audio=publication(Track.Source.ScreenShareAudio,'audio'),mic=publication(Track.Source.Microphone,'mic'),camera=publication(Track.Source.Camera,'camera');
  const participant={identity:'friend',videoTrackPublications:new Map([['screen',screen],['camera',camera]]),trackPublications:new Map([['screen',screen],['audio',audio],['mic',mic],['camera',camera]])};
  const room=Object.assign(new EventEmitter(),{remoteParticipants:new Map([['friend',participant]])});
  const ended=vi.fn(),binding=bindStreamSubscriptions(room as unknown as Room,ended);
  return {room,participant,screen,audio,mic,camera,ended,binding};
}
describe('watching streams on demand',()=>{
  it('subscribes to voice and camera on join, but neither screen nor shared audio until requested',()=>{
    const f=fixture();f.binding.sync();
    expect(f.mic.isDesired).toBe(true);expect(f.camera.isDesired).toBe(true);
    expect(f.screen.isDesired).toBe(false);expect(f.audio.isDesired).toBe(false);
    f.binding.update(new Set([streamKey(f.participant,f.screen)]));
    expect(f.screen.isDesired).toBe(true);expect(f.audio.isDesired).toBe(true);
    f.binding.update(new Set());
    expect(f.screen.isDesired).toBe(false);expect(f.audio.isDesired).toBe(false);expect(f.mic.isDesired).toBe(true);
    const calls=f.mic.setSubscribed.mock.calls.length;f.binding.sync();expect(f.mic.setSubscribed).toHaveBeenCalledTimes(calls);
  });
  it('keeps a later audio publication gated and does not automatically watch the next share',()=>{
    const f=fixture();f.participant.trackPublications.delete('audio');f.binding.update(new Set([streamKey(f.participant,f.screen)]));
    f.participant.trackPublications.set('audio',f.audio);f.room.emit(RoomEvent.TrackPublished,f.audio,f.participant);expect(f.audio.isDesired).toBe(true);
    f.participant.videoTrackPublications.delete('screen');f.participant.trackPublications.delete('screen');
    f.room.emit(RoomEvent.TrackUnpublished,f.screen,f.participant);expect(f.audio.isDesired).toBe(false);expect(f.ended).toHaveBeenCalledWith(['friend:screen-1']);
    const next=publication(Track.Source.ScreenShare,'screen-2');f.participant.videoTrackPublications.set('screen',next);f.participant.trackPublications.set('screen',next);
    f.room.emit(RoomEvent.TrackPublished,next,f.participant);expect(next.isDesired).toBe(false);
  });
  it('isolates multiple selected streams and removes disconnected viewers and listeners',()=>{
    const f=fixture(),other=publication(Track.Source.ScreenShare,'screen-other');
    const second={identity:'second',trackPublications:new Map([['screen',other]]),videoTrackPublications:new Map([['screen',other]])};
    f.room.remoteParticipants.set('second',second as typeof f.participant);
    f.binding.update(new Set(['friend:screen-1','second:screen-other']));expect(f.screen.isDesired).toBe(true);expect(other.isDesired).toBe(true);
    f.binding.update(new Set(['second:screen-other']));expect(f.audio.isDesired).toBe(false);expect(other.isDesired).toBe(true);
    f.room.remoteParticipants.delete('second');f.room.emit(RoomEvent.ParticipantDisconnected,second);expect(f.ended).toHaveBeenCalledWith(['second:screen-other']);
    f.binding.stop();expect(f.room.listenerCount(RoomEvent.TrackPublished)).toBe(0);
  });
});
