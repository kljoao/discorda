export interface VideoSample {timestamp:number;bytes:number;received:number;lost:number;dropped:number;frames:number;jitter:number;limitation?:string;}
export interface VideoHealth {mbps:number;loss:number;drop:number;jitterMs:number;hint:string;}
// Counters are cumulative; compare intervals, never lifetime loss with current bitrate.
export function videoHealth(current:VideoSample,previous?:VideoSample):VideoHealth|undefined{
  if(!previous||current.timestamp<=previous.timestamp||current.bytes<previous.bytes||current.received<previous.received||current.frames<previous.frames)return;
  const received=current.received-previous.received,lost=Math.max(0,current.lost-previous.lost),frames=current.frames-previous.frames,dropped=Math.max(0,current.dropped-previous.dropped);
  const loss=received+lost>0?lost/(received+lost)*100:0,drop=frames+dropped>0?dropped/(frames+dropped)*100:0;
  return {mbps:(current.bytes-previous.bytes)*8/(current.timestamp-previous.timestamp)/1000,loss,drop,jitterMs:current.jitter*1000,
    hint:current.limitation==='cpu'?'O computador de envio está limitando a codificação.':current.limitation==='bandwidth'?'O envio está limitado pela rede.':loss>3?'Perda de pacotes: a rede pode reduzir a nitidez.':drop>5?'Quadros descartados na recepção: reduza a qualidade ou feche programas pesados.':current.jitter>0.05?'Variação no tempo de chegada dos pacotes.':'Sem indício de limitação neste intervalo.'};
}
