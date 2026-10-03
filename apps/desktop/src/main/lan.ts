import { app, session } from 'electron';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { X509Certificate } from 'node:crypto';
import {setGlobalDispatcher} from 'undici';
import {serverDispatcher} from './server-transport';
import { parseServerConfig } from './server-config';

const privateFile=path.join(app.getPath('userData'),'server.json');
const file = existsSync(privateFile)?privateFile:!app.isPackaged?path.join(app.getAppPath(), 'resources/lan.json'):undefined;
export const lan = (()=>{try{return file&&existsSync(file)?parseServerConfig(readFileSync(file,'utf8')):undefined;}catch{return undefined;}})();
// Trust one test server certificate inside this application; never alter Windows trust or disable TLS.
export function configureLanTrust() {
  if (!lan || lan.trust==='system') return;
  const pinned = new X509Certificate(lan.certificate);
  const host = new URL(lan.apiUrl).hostname;
  if (!(pinned.checkIP(host)||pinned.checkHost(host)) || Date.parse(pinned.validTo) <= Date.now()) throw new Error('Certificado do servidor expirou ou não corresponde ao endereço.');
  setGlobalDispatcher(serverDispatcher(lan));
  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    if (request.hostname !== host) { callback(-3); return; }
    try {
      const actual = new X509Certificate(request.certificate.data);
      callback(actual.fingerprint256 === pinned.fingerprint256 && Date.parse(actual.validTo) > Date.now() && Date.parse(actual.validFrom) <= Date.now() && !!(actual.checkIP(host)||actual.checkHost(host)) ? 0 : -2);
    } catch { callback(-2); }
  });
}
