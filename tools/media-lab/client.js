import { Room, RoomEvent, Track } from 'livekit-client';

let room, audio, oscillator, paintTimer, localTracks = [];
const remote = new Map();
window.startProbe = async ({ url, token, color }) => {
  room = new Room({ adaptiveStream: false, dynacast: false });
  room.on(RoomEvent.TrackSubscribed, (track) => {
    remote.set(track.sid, track);
    const element = track.attach();
    element.muted = true;
    document.body.append(element);
  });
  room.on(RoomEvent.TrackUnsubscribed, (track) => {
    remote.delete(track.sid);
    track.detach().forEach((element) => element.remove());
  });
  await room.connect(url, token);
  audio = new AudioContext();
  oscillator = audio.createOscillator();
  oscillator.frequency.value = 440;
  const destination = audio.createMediaStreamDestination();
  oscillator.connect(destination);
  oscillator.start();
  await audio.resume();
  const canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 180;
  const ctx = canvas.getContext('2d');
  let frame = 0;
  paintTimer = setInterval(() => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, 320, 180);
    ctx.fillStyle = '#ffffff'; ctx.fillRect((frame++ * 5) % 300, 70, 20, 20);
  }, 66);
  const audioTrack = destination.stream.getAudioTracks()[0];
  const videoTrack = canvas.captureStream(15).getVideoTracks()[0];
  localTracks = [audioTrack, videoTrack];
  await room.localParticipant.publishTrack(audioTrack, { source: Track.Source.Microphone, dtx: false });
  await room.localParticipant.publishTrack(videoTrack, { source: Track.Source.Camera, simulcast: false });
};
window.probeStats = async () => {
  const stats = { participants: room.remoteParticipants.size, audioBytes: 0, videoBytes: 0, framesDecoded: 0 };
  for (const track of remote.values()) {
    const report = await track.getRTCStatsReport();
    report?.forEach((item) => {
      if (item.type !== 'inbound-rtp') return;
      if (item.kind === 'audio') stats.audioBytes += item.bytesReceived ?? 0;
      if (item.kind === 'video') { stats.videoBytes += item.bytesReceived ?? 0; stats.framesDecoded += item.framesDecoded ?? 0; }
    });
  }
  return stats;
};
window.stopProbe = async () => {
  clearInterval(paintTimer);
  localTracks.forEach((track) => track.stop());
  oscillator?.stop();
  await audio?.close();
  await room?.disconnect();
  return localTracks.every((track) => track.readyState === 'ended');
};
