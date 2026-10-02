import {isIPv4} from 'node:net';
import {connect,getCACertificates} from 'node:tls';
import {X509Certificate} from 'node:crypto';
import {parseServerConfig,publicServerOrigin,type ServerConfig} from './server-config';

export function normalizeServerAddress(value:unknown):string {
  if(typeof value!=='string'||value.length>270)throw new Error('Informe o domínio HTTPS ou IP Radmin do servidor.');
  const address=value.trim();
  if(address.startsWith('26.'))return normalizeRadminIp(address);
  try{return publicServerOrigin(address.startsWith('https://')?address:'https://'+address);}
  catch{throw new Error('Informe um domínio como grupo.exemplo.com ou um IP Radmin 26.x.x.x, sem caminho ou porta.');}
}

export function normalizeRadminIp(value:unknown):string {
  if(typeof value!=='string'||value.length>32)throw new Error('Informe o IP Radmin do servidor, como 26.x.x.x.');
  const ip=value.trim();
  if(!isIPv4(ip)||!ip.startsWith('26.'))throw new Error('Informe apenas o IPv4 Radmin do servidor (26.x.x.x), sem porta ou endereço web.');
  return ip;
}

// Bootstrap performs only a TLS handshake: no HTTP, cookies, tokens or login.
// This certificate is not trusted until the user explicitly confirms its fingerprint.
export function readServerCertificate(host:string,port=7443,timeoutMs=8000,systemTrust=false):Promise<string> {
  return new Promise((resolve,reject)=>{
    const socket=connect({host,port,rejectUnauthorized:systemTrust,...(systemTrust?{servername:host,ca:[...getCACertificates('bundled'),...getCACertificates('system')]}:{})});
    const timer=setTimeout(()=>{socket.destroy();reject(new Error('O servidor não respondeu. Confira o IP, o Radmin e o Firewall do servidor.'));},timeoutMs);
    socket.once('error',()=>{clearTimeout(timer);reject(new Error('Não foi possível alcançar o servidor. Confira o IP, o Radmin e o Firewall do servidor.'));});
    socket.once('secureConnect',()=>{
      clearTimeout(timer);
      try {
        const raw=socket.getPeerCertificate().raw;
        if(!raw)throw new Error();
        resolve(new X509Certificate(raw).toString());
      }catch{reject(new Error('O servidor não apresentou um certificado válido.'));}
      finally{socket.destroy();}
    });
  });
}

export async function discoverServer(value:unknown):Promise<ServerConfig> {
  const address=normalizeServerAddress(value);
  if(address.startsWith('https://')){
    try{await readServerCertificate(new URL(address).hostname,443,8000,true);}
    catch{throw new Error('Não foi possível validar o HTTPS do servidor. Confira o domínio, o certificado e sua conexão.');}
    return {apiUrl:address,trust:'system'};
  }
  const ip=address;
  const certificate=await readServerCertificate(ip);
  try {return parseServerConfig(JSON.stringify({apiUrl:`https://${ip}:7443`,certificate}));}
  catch {throw new Error('O certificado do servidor está vencido ou não corresponde ao IP informado. Peça ao administrador para corrigi-lo.');}
}
