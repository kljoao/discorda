import {expect,it,vi} from 'vitest';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ServerLibrary,inviteAddress,inviteLink,serverId} from '../../src/main/server-library';
import {setServerScope,scopedKey} from '../../src/renderer/lib/server-scope';

it('invites accept only a server address, never paths, credentials, commands or extra parameters',()=>{
 expect(inviteAddress(inviteLink('https://group.example.test'))).toBe('https://group.example.test');
 expect(inviteAddress(inviteLink('https://26.10.10.3:7443'))).toBe('26.10.10.3');
 for(const value of ['https://join?server=group.example.test','discorda://join?server=https://user:secret@example.test','discorda://join?server=https://example.test/path','discorda://join?server=127.0.0.1','discorda://join?server=group.example.test&token=secret','discorda://join?server=group.example.test&server=evil.test','discorda://join/evil?server=group.example.test'])expect(()=>inviteAddress(value)).toThrow();
});
it('serializes writes and preserves names and certificate trust per server',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'discorda-servers-test-'));
 try{
  const library=new ServerLibrary(directory),first={apiUrl:'https://one.example.test',trust:'system' as const},second={apiUrl:'https://two.example.test',trust:'system' as const};
  await Promise.all([library.remember(first),library.remember(second)]);
  await library.change(entries=>entries.map(e=>e.id===serverId(first.apiUrl)?{...e,name:'Amigos'}:e));await library.remember(first);
  const entries=await library.entries();expect(entries).toHaveLength(2);expect(entries.find(e=>e.name==='Amigos')?.config).toEqual(first);
  await library.change(entries=>entries.filter(e=>e.id!==serverId(second.apiUrl)));expect(await library.entries()).toHaveLength(1);
 }finally{if(path.dirname(directory)!==path.resolve(os.tmpdir()))throw Error('Unexpected test directory');await rm(directory,{recursive:true,force:true});}
});
it('keeps drafts and per-user volume independent across servers',()=>{
 setServerScope('first');const first=scopedKey('member-volumes');setServerScope('second');expect(scopedKey('member-volumes')).not.toBe(first);
});
it('migrates legacy drafts once without copying them into a different community',()=>{
 const data=new Map([['discorda:draft:workspace:user:channel','Private draft']]);
 vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value),key:(i:number)=>[...data.keys()][i],get length(){return data.size;}});
 try{setServerScope('a'.repeat(64));expect(data.get(scopedKey('draft:workspace:user:channel'))).toBe('Private draft');setServerScope('b'.repeat(64));expect(data.get(scopedKey('draft:workspace:user:channel'))).toBeUndefined();}finally{vi.unstubAllGlobals();}
});

it('refuses oversized or corrupt saved lists instead of silently destroying entries',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'discorda-servers-test-'));
 try{
  const file=path.join(directory,'servers.json'),library=new ServerLibrary(directory);
  await writeFile(file,'x'.repeat(700001));await expect(library.entries()).rejects.toThrow();
  const corrupt=JSON.stringify([{config:{apiUrl:'http://bad.test'}}]);await writeFile(file,corrupt);
  await expect(library.remember({apiUrl:'https://good.example.test',trust:'system'})).rejects.toThrow();
  expect(await readFile(file,'utf8')).toBe(corrupt);
 }finally{if(path.dirname(directory)!==path.resolve(os.tmpdir()))throw Error('Unexpected test directory');await rm(directory,{recursive:true,force:true});}
});

it('preserves a bounded invitation token while keeping the destination independently validated',()=>{
 const link=inviteLink('https://group.example.test','a'.repeat(64));expect(inviteAddress(link)).toBe('https://group.example.test');expect(new URL(link).searchParams.get('token')).toBe('a'.repeat(64));
 for(const suffix of ['&token='+('b'.repeat(64)),'&command=run'])expect(()=>inviteAddress(link+suffix)).toThrow();
});
