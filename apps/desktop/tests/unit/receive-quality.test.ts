import {it,expect} from 'vitest';
import {adaptQuality,initialQuality,type QualityPolicy} from '../../src/renderer/features/chat/receive-quality';
const good={mbps:1,fps:30,loss:0,drop:0,jitterMs:10,hint:''};
it('reduces only after sustained loss and recovers more slowly without oscillating',()=>{
 let state:QualityPolicy=initialQuality;
 state=adaptQuality(state,{...good,loss:10},'auto');expect(state.layer).toBe(2);
 state=adaptQuality(state,{...good,loss:10},'auto');expect(state.layer).toBe(1);
 for(let i=0;i<9;i++)state=adaptQuality(state,good,'auto');expect(state.layer).toBe(1);
 state=adaptQuality(state,good,'auto');expect(state.layer).toBe(2);
 for(let i=0;i<100;i++)state=adaptQuality(state,{...good,drop:20},'auto');expect(state.layer).toBe(0);
 expect(adaptQuality(state,undefined,'auto')).toBe(state);
 expect(adaptQuality(state,good,'sharp').layer).toBe(2);
 expect(adaptQuality(initialQuality,good,'save').layer).toBe(0);
});
