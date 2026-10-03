import {X509Certificate} from 'node:crypto';
import {checkServerIdentity,type ConnectionOptions} from 'node:tls';
import {Agent,Pool} from 'undici';
import WebSocket from 'ws';
import type {ClientRequestArgs} from 'node:http';
import type {ServerConfig} from './server-config';

// A private CA is authority for this one configured origin only, never for OAuth or updates.
export function serverTls(origin:string,config?:ServerConfig):ConnectionOptions|undefined {
  if(!config||config.trust==='system'||new URL(origin).origin!==config.apiUrl)return;
  const pinned=new X509Certificate(config.certificate);
  return {ca:config.rootCertificate??config.certificate,allowPartialTrustChain:true,rejectUnauthorized:true,
    checkServerIdentity:(hostname,certificate)=>checkServerIdentity(hostname,certificate)??
      (certificate.fingerprint256===pinned.fingerprint256?undefined:new Error('O certificado do servidor mudou. Confirme com o administrador.'))};
}
export function serverDispatcher(config?:ServerConfig){
  return new Agent({factory:(origin,options)=>new Pool(origin,{...options,connect:serverTls(String(origin),config)})});
}
export function serverWebSocket(config?:ServerConfig){
  return class extends WebSocket {
    constructor(address:string,protocols?:string|string[],options?:WebSocket.ClientOptions){
      const origin=new URL(address);origin.protocol=origin.protocol==='wss:'?'https:':'http:';
      // ws passes TLS options to node:tls. Its checkServerIdentity declaration uses an obsolete boolean signature.
      super(address,protocols,{...options,...serverTls(origin.origin,config),followRedirects:false} as ClientRequestArgs);
    }
  };
}
