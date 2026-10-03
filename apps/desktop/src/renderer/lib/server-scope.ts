let current='unconfigured';
export function setServerScope(id:string){
 current=id;
 if(!/^[a-f0-9]{64}$/.test(id))return;
 try{
  const owner=localStorage.getItem('discorda:legacy-owner');
  if(owner&&owner!==id)return;
  // Claim legacy preferences for the first active server only; never copy them to a second community.
  localStorage.setItem('discorda:legacy-owner',id);
  if(localStorage.getItem('discorda:legacy-migrated')===id)return;
  const keys=Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).filter((key):key is string=>!!key&&(/^(discorda:draft:|discorda:attention:)/.test(key)||key==='discorda:member-volumes'));
  for(const key of keys){const target=scopedKey(key.slice('discorda:'.length));if(localStorage.getItem(target)===null)localStorage.setItem(target,localStorage.getItem(key)!);}
  localStorage.setItem('discorda:legacy-migrated',id);
 }catch{/* A full or unavailable local store must not prevent connecting. */}
}
export function scopedKey(key:string){return `discorda:server:${current}:${key}`;}
