import {useEffect,useState} from 'react';
const key='discorda:stream-privacy';let sharing=false;
export function privacySettings(){try{return {enabled:localStorage.getItem(key)!=='false',silent:localStorage.getItem(key+':silent')!=='false'};}catch{return {enabled:true,silent:true};}}
export function privateSharing(){return sharing&&privacySettings().enabled;}
export function quietSharing(){return privateSharing()&&privacySettings().silent;}
export function setPrivateSharing(value:boolean){sharing=value;document.documentElement.dataset.streamPrivacy=String(privateSharing());window.dispatchEvent(new Event('discorda:privacy'));}
export function usePrivateSharing(){const [active,setActive]=useState(privateSharing);useEffect(()=>{const update=()=>setActive(privateSharing());window.addEventListener('discorda:privacy',update);return()=>window.removeEventListener('discorda:privacy',update);},[]);return active;}
export function savePrivacy(enabled:boolean,silent:boolean){try{localStorage.setItem(key,String(enabled));localStorage.setItem(key+':silent',String(silent));}catch{}setPrivateSharing(sharing);}
