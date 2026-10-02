import { X509Certificate } from 'node:crypto';
import { validateApiUrl } from './services';
export type ServerConfig = {apiUrl:string;certificate:string;rootCertificate?:string;trust?:never}|{apiUrl:string;trust:'system';certificate?:never;rootCertificate?:never};
export function publicServerOrigin(value:string):string {
  const origin=validateApiUrl(value,true),url=new URL(value);
  if(url.port||url.hostname.length>253||! /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*$/i.test(url.hostname))throw new Error('Informe um domínio HTTPS, sem porta ou caminho.');
  return origin;
}
export function parseServerConfig(text:string):ServerConfig {
  if(text.length>32768)throw new Error('Configuração muito grande.');
  const value=JSON.parse(text) as Record<string,unknown>;
  if(value&&Object.keys(value).sort().join(',')==='apiUrl,trust'&&value.trust==='system'&&typeof value.apiUrl==='string')return {apiUrl:publicServerOrigin(value.apiUrl),trust:'system'};
  if(!value||!['apiUrl,certificate','apiUrl,certificate,rootCertificate'].includes(Object.keys(value).sort().join(','))||typeof value.apiUrl!=='string'||typeof value.certificate!=='string'||('rootCertificate' in value&&typeof value.rootCertificate!=='string'))throw new Error('Configuração inválida.');
  const apiUrl=validateApiUrl(value.apiUrl,true),host=new URL(apiUrl).hostname;
  const certificate=new X509Certificate(value.certificate);
  if(!(certificate.checkIP(host)||certificate.checkHost(host))||Date.parse(certificate.validTo)<=Date.now()||Date.parse(certificate.validFrom)>Date.now())throw new Error('Certificado inválido para este servidor.');
  if(typeof value.rootCertificate==='string') {
    const root=new X509Certificate(value.rootCertificate);
    if(!root.ca||!certificate.checkIssued(root)||!certificate.verify(root.publicKey))throw new Error('Certificado inválido para este servidor.');
    return {apiUrl,certificate:certificate.toString(),rootCertificate:root.toString()};
  }
  return {apiUrl,certificate:certificate.toString()};
}
