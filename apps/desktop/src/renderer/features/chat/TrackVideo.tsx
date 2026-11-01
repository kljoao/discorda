import {useEffect,useRef,useState} from 'react';
import {LocalVideoTrack,RemoteVideoTrack,VideoQuality,type RemoteTrackPublication,type Track} from 'livekit-client';
import {adaptQuality,initialQuality,type ReceiveMode} from './receive-quality';
import {videoHealth,type VideoSample} from './media-quality';

export function TrackVideo({track,screen=false,publication}:{track:Track;screen?:boolean;publication?:RemoteTrackPublication}) {
  const ref=useRef<HTMLVideoElement>(null),policy=useRef(initialQuality);
  const [statistics,setStatistics]=useState(''),[receiveQuality,setReceiveQuality]=useState<ReceiveMode>('auto');
  const [health,setHealth]=useState<ReturnType<typeof videoHealth>>();
  useEffect(()=>{policy.current=initialQuality;},[track]);
  useEffect(()=>{
    if(!publication||!screen)return;
    policy.current=adaptQuality(policy.current,health,receiveQuality);
    publication.setVideoQuality([VideoQuality.LOW,VideoQuality.MEDIUM,VideoQuality.HIGH][policy.current.layer]);
  },[health,receiveQuality,publication,screen]);
  useEffect(()=>{
    if(!screen||!(track instanceof RemoteVideoTrack||track instanceof LocalVideoTrack))return;
    let active=true,pending=false,previous:VideoSample|undefined;
    const sample=async()=>{
      if(pending)return;pending=true;
      try {
        const report=await track.getRTCStatsReport();
        const stats=report?[...report.values()].find(r=>(r.type==='inbound-rtp'||r.type==='outbound-rtp')&&(r.kind==='video'||r.mediaType==='video')):undefined;
        if(!active||!stats)return;
        const current:VideoSample={timestamp:stats.timestamp,bytes:stats.bytesReceived??stats.bytesSent??0,received:stats.packetsReceived??stats.packetsSent??0,lost:stats.packetsLost??0,frames:stats.framesDecoded??stats.framesEncoded??0,dropped:stats.framesDropped??0,jitter:stats.jitter??0,limitation:stats.qualityLimitationReason};
        setHealth(videoHealth(current,previous));previous=current;
      }catch{/* The viewer remains available when statistics are unsupported. */}finally{pending=false;}
    };
    void sample();const timer=setInterval(()=>void sample(),2000);
    return()=>{active=false;clearInterval(timer);};
  },[track,screen]);
  useEffect(()=>{
    if(!screen)return;
    let frames=ref.current?.getVideoPlaybackQuality().totalVideoFrames??0,time=performance.now();
    const timer=setInterval(()=>{
      const video=ref.current;if(!video||!video.videoHeight)return;
      const now=performance.now(),total=video.getVideoPlaybackQuality().totalVideoFrames;
      setStatistics(video.videoHeight+'p · '+Math.round((total-frames)*1000/(now-time))+' fps');frames=total;time=now;
    },2000);
    return()=>clearInterval(timer);
  },[screen,track]);
  useEffect(()=>{
    const element=ref.current!;track.attach(element);
    const resume=()=>{if(track.mediaStreamTrack.readyState==='live'&&element.srcObject)void element.play().catch(()=>{});};
    element.addEventListener('pause',resume);
    return()=>{element.removeEventListener('pause',resume);track.detach(element);};
  },[track]);
  return <>
    <video className={screen?'room-screen-video':'room-camera-video'} ref={ref} autoPlay playsInline muted controls={false} disablePictureInPicture disableRemotePlayback controlsList="nodownload noplaybackrate noremoteplayback" onContextMenu={event=>event.preventDefault()}/>
    {screen&&<details className="room-quality room-hover-control" onClick={event=>event.stopPropagation()}><summary aria-label="Qualidade da transmissão"><span>{statistics||'Transmissão'}</span><b>AO VIVO</b></summary><div className="room-quality-panel">
      <strong>Qualidade para você</strong>
      {publication&&<select aria-label="Qualidade recebida" disabled={!publication.simulcasted} value={receiveQuality} onChange={event=>setReceiveQuality(event.target.value as ReceiveMode)}><option value="auto">Automática · adapta à rede</option><option value="sharp">Nitidez máxima</option><option value="save">Economizar dados</option></select>}
      <p>{health?.hint??'Coletando métricas da transmissão…'}</p>
      {health&&<small>{health.mbps.toFixed(1)} Mbps · perda {health.loss.toFixed(1)}%</small>}
      <small>Os FPS medem o vídeo exibido. Uma tela parada pode enviar menos quadros.</small>
    </div></details>}
  </>;
}
