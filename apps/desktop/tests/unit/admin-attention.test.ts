import {it,expect,vi} from 'vitest';
vi.mock('electron',()=>({dialog:{},BrowserWindow:class{}}));
import {validateAdminAction} from '../../src/main/admin';
import {newer,readMarkers} from '../../src/renderer/features/chat/attention';
it('allows only explicit administration operations and individual Radmin addresses',()=>{expect(()=>validateAdminAction({kind:'user',email:'friend@example.test',enabled:true})).not.toThrow();for(const action of [{kind:'shell',command:'whoami'},{kind:'networkSave',addresses:['0.0.0.0/0']},{kind:'networkSave',addresses:['26.10.10.999']},{kind:'user',email:'bad',enabled:true}])expect(()=>validateAdminAction(action)).toThrow();});
it('read markers preserve 64-bit message IDs and reject corrupt storage',()=>{expect(newer('9223372036854775807','9223372036854775806')).toBe(true);expect(newer('12','12')).toBe(false);expect(readMarkers('{broken')).toEqual({});expect(readMarkers('{"channel":"123","other":"NaN"}')).toEqual({channel:'123'});});
