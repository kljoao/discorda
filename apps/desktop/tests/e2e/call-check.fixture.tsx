import {createRoot} from 'react-dom/client';
import {CallCheck} from '../../src/renderer/features/chat/CallCheck';
import '../../src/renderer/styles.css';
import '../../src/renderer/reliability.css';
const captured:MediaStream[]=[];const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await get(constraints);captured.push(stream);return stream;};
Object.assign(window,{capturesStopped:()=>captured.every(stream=>stream.getTracks().every(track=>track.readyState==='ended'))});
window.discorda={microphoneTest:async()=>{},checkServices:async()=>({api:'online',database:'ready',checkedAt:new Date().toISOString()})} as unknown as NonNullable<Window['discorda']>;
createRoot(document.getElementById('root')!).render(<CallCheck input="" output="" callActive={false}/>);
