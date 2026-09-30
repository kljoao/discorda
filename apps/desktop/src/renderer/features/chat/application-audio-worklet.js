class ApplicationAudio extends AudioWorkletProcessor {
  constructor(){super();this.queue=[];this.offset=0;this.frames=0;this.port.onmessage=e=>{if(e.data.stop){this.stopped=true;this.queue=[];return;}const samples=new Float32Array(e.data);this.queue.push(samples);this.frames+=samples.length/2;while(this.frames>12000&&this.queue.length>1){const old=this.queue.shift();this.frames-=(old.length-this.offset)/2;this.offset=0;}};}
  process(_input,outputs){if(this.stopped)return false;const out=outputs[0];for(let i=0;i<out[0].length;i++){const block=this.queue[0];if(!block){out[0][i]=0;if(out[1])out[1][i]=0;continue;}out[0][i]=block[this.offset++];if(out[1])out[1][i]=block[this.offset++];else this.offset++;this.frames--;if(this.offset>=block.length){this.queue.shift();this.offset=0;}}return true;}
}
registerProcessor('discorda-application-audio',ApplicationAudio);
