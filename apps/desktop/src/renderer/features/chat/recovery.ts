import { DisconnectReason } from 'livekit-client';
export function canRecover(reason?: DisconnectReason) {
  return reason === undefined || [DisconnectReason.UNKNOWN_REASON, DisconnectReason.SERVER_SHUTDOWN,
    DisconnectReason.STATE_MISMATCH, DisconnectReason.JOIN_FAILURE, DisconnectReason.MIGRATION,
    DisconnectReason.SIGNAL_CLOSE].includes(reason);
}
export class CallRecovery {
  private timer?:ReturnType<typeof setTimeout>;
  private epoch=0;
  private run?:()=>Promise<void>;
  private running=false;
  retryNow(){if(!this.running&&this.run){clearTimeout(this.timer);void this.run();}}
  cancel(){this.epoch++;clearTimeout(this.timer);this.run=undefined;}
  start(attempt:()=>Promise<boolean>, failed:()=>void){
    this.cancel();const epoch=this.epoch;let count=0;
    const run=async()=>{
      if(epoch!==this.epoch)return;
      this.running=true;let done=false;try{done=await attempt();}catch{/* A later retry can recover a temporary network failure. */}
      this.running=false;if(epoch!==this.epoch)return;if(done){this.run=undefined;return;}
      if(++count>=8){this.run=undefined;failed();return;}
      this.timer=setTimeout(()=>void run(),Math.min(15000,1000*2**count));
    };
    this.run=run;this.timer=setTimeout(()=>void run(),1000);
  }
}
