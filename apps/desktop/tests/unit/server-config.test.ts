import {it,expect} from 'vitest';
import {parseServerConfig} from '../../src/main/server-config';
it('rejects extra fields, insecure endpoints and invalid certificates in private connection files',()=>{
 expect(()=>parseServerConfig(JSON.stringify({apiUrl:'https://group.test',certificate:'bad',rootCertificate:'bad',secret:'unexpected'}))).toThrow();
 expect(()=>parseServerConfig(JSON.stringify({apiUrl:'http://group.test',certificate:'bad',rootCertificate:'bad'}))).toThrow();
 expect(()=>parseServerConfig(JSON.stringify({apiUrl:'https://group.test',certificate:'bad',rootCertificate:'bad'}))).toThrow();
 expect(()=>parseServerConfig('x'.repeat(33000))).toThrow();
});
