import {useEffect,useState} from 'react';
export function Avatar({url,name}:{url?:string|null;name:string}){
 const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[url]);
 return <span className="member-avatar">{url&&!failed?<img src={url} alt="" referrerPolicy="no-referrer" draggable={false} onError={()=>setFailed(true)}/>:name.slice(0,1).toUpperCase()}</span>;
}
