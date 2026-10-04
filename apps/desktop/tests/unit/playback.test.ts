import {afterEach,describe,expect,it,vi} from 'vitest';
import {clampVolume,readVolumes} from '../../src/renderer/features/chat/playback';
afterEach(()=>vi.unstubAllGlobals());
describe('per-member playback preferences',()=>{
 it('supports mute and real amplification while bounding corrupt values',()=>{
  expect(clampVolume(0)).toBe(0);expect(clampVolume(250)).toBe(250);
  expect(clampVolume(999)).toBe(400);expect(clampVolume(-20)).toBe(0);expect(clampVolume(NaN)).toBe(150);
 });
 it('restores voice and sharing independently per stable member ID',()=>{
  vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({alice:{voice:250,screen:0},bob:{voice:75,screen:100}})});
  expect(readVolumes()).toEqual({alice:{voice:250,screen:0},bob:{voice:75,screen:100}});
 });
 it('recovers from corrupt storage without breaking the call',()=>{
  vi.stubGlobal('localStorage',{getItem:()=>'{broken'});expect(readVolumes()).toEqual({});
 });
});

it('preserves independent sharing mute without losing the saved volume',()=>{
 vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({alice:{voice:150,screen:225,screenMuted:true}})});
 expect(readVolumes().alice).toEqual({voice:150,screen:225,screenMuted:true});
});
