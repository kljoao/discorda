import { RoomEvent, Track, type Room, type TrackPublication, type Participant } from 'livekit-client';

export type CallSound = 'join' | 'leave' | 'share' | 'stopShare';
// Original short cues, synthesized locally: no downloaded sound assets.
export const cues: Record<CallSound, readonly number[]> = {
  join: [523.25, 783.99], leave: [587.33, 392],
  share: [659.25, 830.61, 987.77], stopShare: [830.61, 659.25, 493.88],
};
export function playCallSound(context: AudioContext, destination: AudioNode, kind: CallSound, volume: number) {
  if (context.state === 'closed' || volume <= 0) return Promise.resolve();
  const notes = cues[kind], start = context.currentTime + .01;
  for (const [index, frequency] of notes.entries()) {
    const oscillator = context.createOscillator(), gain = context.createGain();
    const at = start + index * .095;
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(.12 * Math.min(volume, 100) / 100, at + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, at + .15);
    oscillator.connect(gain).connect(destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(at); oscillator.stop(at + .16);
  }
  return new Promise<void>(resolve => setTimeout(resolve, (notes.length * .095 + .09) * 1000));
}

// Publication events avoid replaying cues on subscription, mute, or reconnect.
export function bindCallSounds(room: Room, play: (kind: CallSound) => void) {
  let ready = false;
  const screens = new Set<string>();
  const published = (publication: TrackPublication) => {
    if (!ready || publication.source !== Track.Source.ScreenShare || screens.has(publication.trackSid)) return;
    screens.add(publication.trackSid); play('share');
  };
  const unpublished = (publication: TrackPublication) => {
    if (ready && screens.delete(publication.trackSid)) play('stopShare');
  };
  const joined = () => { if (ready) play('join'); };
  const left = (participant: Participant) => {
    participant.trackPublications.forEach(p => screens.delete(p.trackSid));
    if (ready) play('leave');
  };
  room.on(RoomEvent.ParticipantConnected, joined).on(RoomEvent.ParticipantDisconnected, left)
    .on(RoomEvent.TrackPublished, published).on(RoomEvent.TrackUnpublished, unpublished)
    .on(RoomEvent.LocalTrackPublished, published).on(RoomEvent.LocalTrackUnpublished, unpublished);
  return {
    start() {
      for (const participant of [room.localParticipant, ...room.remoteParticipants.values()])
        participant.trackPublications.forEach(p => { if (p.source === Track.Source.ScreenShare) screens.add(p.trackSid); });
      ready = true; play('join');
    },
    stop() {
      const wasReady = ready; ready = false;
      room.off(RoomEvent.ParticipantConnected, joined).off(RoomEvent.ParticipantDisconnected, left)
        .off(RoomEvent.TrackPublished, published).off(RoomEvent.TrackUnpublished, unpublished)
        .off(RoomEvent.LocalTrackPublished, published).off(RoomEvent.LocalTrackUnpublished, unpublished);
      return wasReady;
    },
  };
}
