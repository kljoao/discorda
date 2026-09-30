import { Room, RoomEvent, Track } from 'livekit-client';

const room = new Room({ adaptiveStream: false, dynacast: false });
const status = document.querySelector('#status');
const peers = document.querySelector('#peers');
const connect = document.querySelector('#connect');
const controls = [...document.querySelectorAll('[data-action]')];
const videos = document.querySelector('#videos');
let busy = false;
function refresh() {
  peers.textContent = `${room.remoteParticipants.size} participante(s) remoto(s)`;
  for (const button of controls) button.disabled = room.state !== 'connected' || busy;
  connect.disabled = room.state === 'connected' || busy;
  document.querySelector('#mic').textContent = room.localParticipant.isMicrophoneEnabled ? 'Desligar microfone' : 'Ligar microfone';
  document.querySelector('#camera').textContent = room.localParticipant.isCameraEnabled ? 'Desligar câmera' : 'Ligar câmera';
  document.querySelector('#screen').textContent = room.localParticipant.isScreenShareEnabled ? 'Parar tela' : 'Compartilhar tela';
}
function attach(track, local = false) {
  if (local && track.kind === Track.Kind.Audio) return;
  const element = track.attach();
  element.dataset.sid = track.sid;
  if (local) element.muted = true;
  element.autoplay = true;
  videos.append(element);
}
function detach(track) { track?.detach().forEach((element) => element.remove()); }
room.on(RoomEvent.TrackSubscribed, (track) => attach(track));
room.on(RoomEvent.TrackUnsubscribed, detach);
room.on(RoomEvent.LocalTrackPublished, (publication) => { if (publication.track) attach(publication.track, true); refresh(); });
room.on(RoomEvent.LocalTrackUnpublished, (publication) => { detach(publication.track); refresh(); });
room.on(RoomEvent.TrackMuted, refresh);
room.on(RoomEvent.TrackUnmuted, refresh);
room.on(RoomEvent.ParticipantConnected, refresh);
room.on(RoomEvent.ParticipantDisconnected, refresh);
room.on(RoomEvent.Disconnected, () => { videos.replaceChildren(); status.textContent = 'Desconectado. Dispositivos liberados.'; refresh(); });
async function act(action) {
  if (busy) return;
  busy = true; refresh();
  try { await action(); status.textContent = room.state === 'connected' ? 'Conectado ao laboratório local.' : 'Desconectado. Dispositivos liberados.'; }
  catch { status.textContent = 'Não foi possível concluir. Confira a permissão do navegador e se o dispositivo está disponível.'; }
  finally { busy = false; refresh(); }
}
connect.addEventListener('click', () => act(async () => {
  status.textContent = 'Preparando conexão…';
  const config = await (await fetch(`${location.pathname}join`, { method: 'POST' })).json();
  status.textContent = 'Conectando ao servidor…';
  await room.connect(config.url, config.token);
  status.textContent = 'Ativando reprodução de áudio…';
  await room.startAudio();
}));
document.querySelector('#mic').addEventListener('click', () => act(() => room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled)));
document.querySelector('#camera').addEventListener('click', () => act(() => room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled)));
document.querySelector('#screen').addEventListener('click', () => act(() => room.localParticipant.setScreenShareEnabled(!room.localParticipant.isScreenShareEnabled, { audio: false })));
document.querySelector('#leave').addEventListener('click', () => act(() => room.disconnect(true)));
window.addEventListener('pagehide', () => { void room.disconnect(true); });
refresh();




