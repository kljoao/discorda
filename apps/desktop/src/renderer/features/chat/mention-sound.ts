let active=false;
export async function playMentionSound(){
 // Coalesce simultaneous mentions into one short cue; never accumulate audio contexts.
 if(active)return;active=true;
 let context:AudioContext|undefined;let audio:HTMLAudioElement|undefined;
 try{
  context=new AudioContext();audio=new Audio();const destination=context.createMediaStreamDestination();
  audio.srcObject=destination.stream;
  const output=localStorage.getItem('discorda:output');if(output)try{await audio.setSinkId(output);}catch{}
  await context.resume();await audio.play();
  const now=context.currentTime;
  for(const [index,hz] of [660,880].entries()){
   const tone=context.createOscillator(),gain=context.createGain();tone.frequency.value=hz;
   gain.gain.setValueAtTime(0,now+index*.12);gain.gain.linearRampToValueAtTime(.055,now+index*.12+.015);gain.gain.exponentialRampToValueAtTime(.001,now+index*.12+.17);
   tone.connect(gain).connect(destination);tone.start(now+index*.12);tone.stop(now+index*.12+.18);
  }
  await new Promise(resolve=>setTimeout(resolve,350));
 }catch{/* Notification failure must never block chat. */}
 finally{audio?.pause();if(audio)audio.srcObject=null;await context?.close().catch(()=>{});active=false;}
}
