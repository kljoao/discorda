import {RoomEvent, Track, type Participant, type RemoteParticipant, type Room} from 'livekit-client';

// A new publication is a new invitation, even when the same person shares again.
export function streamKey(participant:Pick<Participant,'identity'>,publication:{trackSid:string}) {
  return participant.identity+':'+publication.trackSid;
}

export function watchingParticipant(participant:Participant,watching:ReadonlySet<string>) {
  return [...participant.videoTrackPublications.values()].some(publication=>
    publication.source===Track.Source.ScreenShare&&watching.has(streamKey(participant,publication)));
}

/** Used with connect({autoSubscribe:false}); never briefly downloads a screen on join. */
export function bindStreamSubscriptions(room:Room,onEnded:(keys:string[])=>void) {
  let watching=new Set<string>();
  function reconcile() {
    for(const participant of room.remoteParticipants.values()) {
      const watch=watchingParticipant(participant,watching);
      for(const publication of participant.trackPublications.values()) {
        const desired=publication.source===Track.Source.ScreenShare
          ?watching.has(streamKey(participant,publication))
          :publication.source===Track.Source.ScreenShareAudio?watch:true;
        if(publication.isDesired!==desired)publication.setSubscribed(desired);
      }
    }
  }
  function unpublished(publication:{source:Track.Source;trackSid:string},participant:RemoteParticipant) {
    if(publication.source===Track.Source.ScreenShare) {
      const key=streamKey(participant,publication);
      if(watching.delete(key))onEnded([key]);
    }
    reconcile();
  }
  function disconnected(participant:RemoteParticipant) {
    const ended=[...watching].filter(key=>key.startsWith(participant.identity+':'));
    ended.forEach(key=>watching.delete(key));if(ended.length)onEnded(ended);
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
      room.off(RoomEvent.TrackPublished,reconcile).off(RoomEvent.TrackUnpublished,unpublished)
        .off(RoomEvent.ParticipantConnected,reconcile).off(RoomEvent.ParticipantDisconnected,disconnected)
        .off(RoomEvent.Reconnected,reconcile);
    },
  };
}
