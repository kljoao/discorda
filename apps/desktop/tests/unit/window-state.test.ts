import {describe,it,expect} from 'vitest';
import {restoreWindowState} from '../../src/main/window-state';

const primary={x:0,y:0,width:1920,height:1040},second={x:-1600,y:0,width:1600,height:900};
describe('window placement across update restarts',()=>{
 it('keeps the previous monitor, bounds and maximized state',()=>{
  const state={bounds:{x:-1450,y:55,width:1240,height:820},maximized:true};
  expect(restoreWindowState(state,[primary,second])).toEqual(state);
 });
 it('recovers onto an available monitor and fits its work area',()=>{
  expect(restoreWindowState({bounds:{x:4000,y:300,width:2400,height:1400},maximized:false},[primary]))
   .toEqual({bounds:primary,maximized:false});
 });
 it('rejects corrupt or incomplete saved placement',()=>{
  for(const value of [null,{}, {bounds:primary}, {bounds:{...primary,width:-1},maximized:false},{bounds:{...primary,x:Infinity},maximized:false}])
   expect(restoreWindowState(value,[primary])).toBeUndefined();
 });
});
