import { X509Certificate } from 'node:crypto';
import { validateApiUrl } from './services';
export interface ServerConfig {apiUrl:string;certificate:string;rootCertificate?:string}
export function parseServerConfig(text:string):ServerConfig {
  if(text.length>32768)throw new Error('Configuração muito grande.');
  const value=JSON.parse(text) as Record<string,unknown>;
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
