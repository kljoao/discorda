export interface VideoSample {id?:string;timestamp:number;bytes:number;received:number;lost:number;dropped:number;frames:number;jitter:number;limitation?:string;encodeTime?:number;captureFps?:number;}
export interface VideoHealth {mbps:number;fps:number;loss:number;drop:number;jitterMs:number;hint:string;encodeMs?:number;captureFps?:number;}
/** A simulcast sender contains several outbound reports. The first may be its 360p layer. */
export function sampleVideo(report:RTCStatsReport,sending:boolean):VideoSample|undefined{
 const stats=[...report.values()].filter(r=>r.type===(sending?'outbound-rtp':'inbound-rtp')&&r.active!==false&&(r.kind==='video'||r.mediaType==='video'))
   .sort((a,b)=>(b.frameWidth??0)*(b.frameHeight??0)-(a.frameWidth??0)*(a.frameHeight??0)||(b.bytesSent??b.bytesReceived??0)-(a.bytesSent??a.bytesReceived??0))[0];
 if(!stats)return;
 const source=stats.mediaSourceId?report.get(stats.mediaSourceId):undefined;
 return {id:stats.id,timestamp:stats.timestamp,bytes:stats.bytesReceived??stats.bytesSent??0,received:stats.packetsReceived??stats.packetsSent??0,lost:stats.packetsLost??0,frames:stats.framesDecoded??stats.framesEncoded??0,dropped:stats.framesDropped??0,jitter:stats.jitter??0,limitation:stats.qualityLimitationReason,encodeTime:stats.totalEncodeTime,captureFps:source?.framesPerSecond};
}
// Counters are cumulative; compare intervals, never lifetime loss with current bitrate.
export function videoHealth(current:VideoSample,previous?:VideoSample):VideoHealth|undefined{
  if(!previous||current.id!==previous.id||current.timestamp<=previous.timestamp||current.bytes<previous.bytes||current.received<previous.received||current.frames<previous.frames)return;
  const received=current.received-previous.received,lost=Math.max(0,current.lost-previous.lost),frames=current.frames-previous.frames,dropped=Math.max(0,current.dropped-previous.dropped);
  const loss=received+lost>0?lost/(received+lost)*100:0,drop=frames+dropped>0?dropped/(frames+dropped)*100:0;
  return {mbps:(current.bytes-previous.bytes)*8/(current.timestamp-previous.timestamp)/1000,fps:frames*1000/(current.timestamp-previous.timestamp),loss,drop,jitterMs:current.jitter*1000,captureFps:current.captureFps,
    encodeMs:frames>0&&current.encodeTime!==undefined&&previous.encodeTime!==undefined?Math.max(0,current.encodeTime-previous.encodeTime)*1000/frames:undefined,
    hint:current.limitation==='cpu'?'O computador de envio está limitando a codificação.':current.limitation==='bandwidth'?'O envio está limitado pela rede.':loss>3?'Perda de pacotes: a rede pode reduzir a nitidez.':drop>5?'Quadros descartados na recepção: reduza a qualidade ou feche programas pesados.':current.jitter>0.05?'Variação no tempo de chegada dos pacotes.':'Sem indício de limitação neste intervalo.'};
}
