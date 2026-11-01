import {RoomEvent, Track, type Participant, type Room} from 'livekit-client';

// Keep the viewer's choice across republishing and server-issued lease changes.
export function streamKey(participant:Pick<Participant,'identity'>&{metadata?:string},_publication?:{trackSid:string}) {
  let owner=participant.identity;
  try {const id=JSON.parse(participant.metadata??'{}').userId;if(typeof id==='string'&&/^[0-9a-f-]{36}$/i.test(id))owner=id;}catch{}
  return owner+':screen';
}

export const streamReconnectGrace=120_000;

export function watchingParticipant(participant:Participant,watching:ReadonlySet<string>) {
  return [...participant.videoTrackPublications.values()].some(publication=>
    publication.source===Track.Source.ScreenShare&&watching.has(streamKey(participant,publication)));
}

/** Used with connect({autoSubscribe:false}); never briefly downloads a screen on join. */
export function bindStreamSubscriptions(room:Room,onEnded:(keys:string[])=>void) {
  let watching=new Set<string>();
  const missing=new Map<string,ReturnType<typeof setTimeout>>();
  function reconcile() {
    const present=new Set<string>();
    for(const participant of room.remoteParticipants.values()) {
      for(const publication of participant.videoTrackPublications.values())if(publication.source===Track.Source.ScreenShare)present.add(streamKey(participant));
      const watch=watchingParticipant(participant,watching);
      for(const publication of participant.trackPublications.values()) {
        const desired=publication.source===Track.Source.ScreenShare
          ?watching.has(streamKey(participant,publication))
          :publication.source===Track.Source.ScreenShareAudio?watch:true;
        if(publication.isDesired!==desired)publication.setSubscribed(desired);
      }
    }
    for(const [key,timer] of missing)if(present.has(key)||!watching.has(key)){clearTimeout(timer);missing.delete(key);}
    for(const key of watching)if(!present.has(key)&&!missing.has(key))missing.set(key,setTimeout(()=>{
      missing.delete(key);if(watching.delete(key))onEnded([key]);
    },streamReconnectGrace));
  }
  function unpublished() {
    reconcile();
  }
  function disconnected() {
    reconcile();
  }
  room.on(RoomEvent.TrackPublished,reconcile).on(RoomEvent.TrackUnpublished,unpublished)
    .on(RoomEvent.ParticipantConnected,reconcile).on(RoomEvent.ParticipantDisconnected,disconnected)
    .on(RoomEvent.Reconnected,reconcile);
  return {
    sync:reconcile,
    update(keys:ReadonlySet<string>){watching=new Set(keys);reconcile();},
    stop(){
      watching.clear();
      missing.forEach(clearTimeout);missing.clear();
      room.off(RoomEvent.TrackPublished,reconcile).off(RoomEvent.TrackUnpublished,unpublished)
        .off(RoomEvent.ParticipantConnected,reconcile).off(RoomEvent.ParticipantDisconnected,disconnected)
        .off(RoomEvent.Reconnected,reconcile);
    },
  };
}
