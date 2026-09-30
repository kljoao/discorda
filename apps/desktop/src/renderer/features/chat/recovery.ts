import { DisconnectReason } from 'livekit-client';
export function canRecover(reason?: DisconnectReason) {
  return reason === undefined || [DisconnectReason.UNKNOWN_REASON, DisconnectReason.SERVER_SHUTDOWN,
    DisconnectReason.STATE_MISMATCH, DisconnectReason.JOIN_FAILURE, DisconnectReason.MIGRATION,
    DisconnectReason.SIGNAL_CLOSE].includes(reason);
}
export class CallRecovery {
  private timer?:ReturnType<typeof setTimeout>;
  private epoch=0;
  cancel(){this.epoch++;clearTimeout(this.timer);}
  start(attempt:()=>Promise<boolean>, failed:()=>void){
    this.cancel();const epoch=this.epoch;let count=0;
    const run=async()=>{
      if(epoch!==this.epoch)return;
      let done=false;try{done=await attempt();}catch{/* A later retry can recover a temporary network failure. */}
      if(epoch!==this.epoch||done)return;
      if(++count>=8){failed();return;}
      this.timer=setTimeout(()=>void run(),Math.min(15000,1000*2**count));
    };
    this.timer=setTimeout(()=>void run(),1000);
  }
}
