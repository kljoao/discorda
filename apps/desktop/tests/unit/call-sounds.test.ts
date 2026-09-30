import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
import { RoomEvent, Track, type Room } from 'livekit-client';
import { bindCallSounds, playCallSound } from '../../src/renderer/features/chat/call-sounds';

function fixture() {
  const room = Object.assign(new EventEmitter(), { localParticipant: { trackPublications: new Map() }, remoteParticipants: new Map() });
  const play = vi.fn(); const binding = bindCallSounds(room as unknown as Room, play);
  return { room, play, binding };
}
describe('call notifications', () => {
  it('sounds only after connecting, once for each local and remote screen publication', () => {
    const {room, play, binding} = fixture();
    room.emit(RoomEvent.ParticipantConnected); expect(play).not.toHaveBeenCalled();
    binding.start();
    room.emit(RoomEvent.ParticipantConnected);
    const screen = {source: Track.Source.ScreenShare, trackSid:'screen'};
    room.emit(RoomEvent.TrackPublished, screen);
    room.emit(RoomEvent.TrackPublished, screen);
    room.emit(RoomEvent.TrackSubscribed, screen);
    room.emit(RoomEvent.TrackPublished, {source:Track.Source.ScreenShareAudio,trackSid:'audio'});
    room.emit(RoomEvent.TrackUnpublished, screen);
    room.emit(RoomEvent.TrackUnpublished, screen);
    room.emit(RoomEvent.LocalTrackPublished, screen);
    room.emit(RoomEvent.LocalTrackUnpublished, screen);
    room.emit(RoomEvent.ParticipantDisconnected, {trackPublications:new Map()});
    expect(play.mock.calls.flat()).toEqual(['join','join','share','stopShare','share','stopShare','leave']);
    expect(binding.stop()).toBe(true);
    room.emit(RoomEvent.ParticipantConnected);
    expect(play).toHaveBeenCalledTimes(7);
    expect(room.listenerCount(RoomEvent.TrackPublished)).toBe(0);
    expect(binding.stop()).toBe(false);
  });
  it('does not announce existing shares on initial connection or duplicate publications on reconnect', () => {
    const {room, play, binding} = fixture();
    const screen = {source:Track.Source.ScreenShare,trackSid:'existing'};
    room.remoteParticipants.set('remote',{trackPublications:new Map([['existing',screen]])});
    binding.start(); room.emit(RoomEvent.TrackPublished,screen); room.emit(RoomEvent.Reconnected);
    expect(play.mock.calls.flat()).toEqual(['join']);
    room.emit(RoomEvent.TrackUnpublished,screen); expect(play).toHaveBeenLastCalledWith('stopShare');
  });
  it('does not allocate audio nodes for silenced notifications or a closed output', async () => {
    const createOscillator=vi.fn();
    await playCallSound({state:'running',createOscillator} as unknown as AudioContext, {} as AudioNode,'join',0);
    await playCallSound({state:'closed',createOscillator} as unknown as AudioContext, {} as AudioNode,'share',50);
    expect(createOscillator).not.toHaveBeenCalled();
  });
});
