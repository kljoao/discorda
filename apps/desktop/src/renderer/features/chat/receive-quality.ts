import type {VideoHealth} from './media-quality';
export type ReceiveMode='auto'|'sharp'|'save';
export interface QualityPolicy {layer:0|1|2;bad:number;good:number}
export const initialQuality:QualityPolicy={layer:2,bad:0,good:0};
/** Two bad intervals reduce load; ten good ones recover gradually. O(1) space/time. */
export function adaptQuality(state:QualityPolicy,health:VideoHealth|undefined,mode:ReceiveMode):QualityPolicy {
 if(mode==='sharp')return {...initialQuality};
 if(mode==='save')return {layer:0,bad:0,good:0};
 if(!health)return state;
 const impaired=health.loss>3||health.drop>8||health.jitterMs>80;
 const healthy=health.loss<1&&health.drop<2&&health.jitterMs<40;
 const bad=impaired?state.bad+1:0,good=healthy?state.good+1:0;
 if(bad>=2)return {layer:Math.max(0,state.layer-1) as 0|1|2,bad:0,good:0};
 if(good>=10)return {layer:Math.min(2,state.layer+1) as 0|1|2,bad:0,good:0};
 return {...state,bad,good};
}
