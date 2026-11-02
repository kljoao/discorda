// Runs on the audio rendering thread, including while the call UI is minimized.
class MicrophoneGate extends AudioWorkletProcessor {
  constructor() {
    super(); this.settings = {gain:1, threshold:-50, gate:true}; this.hold = 0; this.envelope = 0; this.samples = 0; this.peak=0;this.compression=1;
    this.port.onmessage = event => { if(event.data.stop)this.stopped=true;else if(typeof event.data.talk==='boolean')this.talkUntil=event.data.talk?currentTime+0.3:0;else this.settings = event.data; };
  }
  process(inputs, outputs) {
    if(this.stopped)return false;
    const input = inputs[0], output = outputs[0];
    if (!input?.[0]) { for (const channel of output) channel.fill(0); return true; }
    const {gain, threshold, gate} = this.settings;
    let sum = 0; for (const value of input[0]) sum += (value * gain) ** 2;
    const db = Math.max(-90, 20 * Math.log10(Math.sqrt(sum / input[0].length) || 0.00001));
    if (!gate || db >= threshold || (this.hold > 0 && db >= threshold - 6)) this.hold = sampleRate * 0.25;
    else this.hold = Math.max(0, this.hold - input[0].length);
    // Holding the key replaces voice activation, while expired heartbeats still mute.
    const open = this.settings.pushToTalk ? currentTime < (this.talkUntil ?? 0) : (!gate || this.hold > 0);
    const smoothing = 1 - Math.exp(-1 / (sampleRate * (open ? 0.005 : 0.03)));
    const release=Math.exp(-1/(sampleRate*.12)),attack=1-Math.exp(-1/(sampleRate*.003));
    for (let i = 0; i < output[0].length; i++) {
      this.envelope += ((open ? 1 : 0) - this.envelope) * smoothing;
      for (let c = 0; c < output.length; c++) {
        const original=(input[c]?.[i] ?? input[0][i])*gain*this.envelope;
        this.peak=Math.max(Math.abs(original),this.peak*release);
        const target=this.peak>.25?Math.pow(this.peak/.25,-2/3):1;
        this.compression+=(target-this.compression)*(target<this.compression?attack:1-release);
        const value=original*this.compression;
        // Soft peak protection instead of flattening loud speech against a hard clip.
        output[c][i]=Math.abs(value)<=.8?value:Math.sign(value)*(.8+.18*(1-Math.exp(-(Math.abs(value)-.8)/.18)));
      }
    }
    this.samples += input[0].length;
    if (this.samples >= sampleRate / 10) { this.samples = 0; this.port.postMessage({db, open}); }
    return true;
  }
}
registerProcessor('discorda-microphone', MicrophoneGate);
