import {useEffect,useRef,useState} from 'react';
import type {ChatWorkspace} from '../../../shared/ipc/contracts';
export function CommunitySetup({workspace,done}:{workspace:ChatWorkspace;done:()=>void}){
 const [step,setStep]=useState(0),[name,setName]=useState(workspace.name),[text,setText]=useState(''),[voice,setVoice]=useState(''),[email,setEmail]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const heading=useRef<HTMLHeadingElement>(null),emailInput=useRef<HTMLInputElement>(null),initial=useRef(true);
 useEffect(()=>{if(initial.current){initial.current=false;return;}heading.current?.focus();},[step]);
 const lines=(value:string)=>value.split('\n').map(s=>s.trim()).filter(Boolean);
 function next(){
  if(step===0&&(!name.trim()||/[\p{Cc}\p{Cf}]/u.test(name))){setError('Informe um nome válido para sua comunidade.');return;}
  if(step===1&&[lines(text),lines(voice)].some(list=>list.length>10||list.some(n=>n.length>80||/[\p{Cc}\p{Cf}]/u.test(n)))){setError('Use até 10 canais de cada tipo, com até 80 caracteres por nome.');return;}
  if(step===2&&email.trim()&&!emailInput.current?.reportValidity())return;
  setError('');setStep(step+1);
 }
 async function save(){if(busy)return;setBusy(true);setError('');try{
  const result=await window.discorda!.admin({kind:'setup',name:name.trim(),textChannels:lines(text),voiceChannels:lines(voice)});if(!result.ok)throw Error(result.message);
  if(email.trim()){const member=await window.discorda!.admin({kind:'user',email:email.trim(),enabled:true});if(!member.ok)throw Error('Comunidade salva. Não foi possível autorizar a pessoa: '+member.message);}
  done();
 }catch(error){setError(error instanceof Error?error.message:'Não foi possível salvar.');}finally{setBusy(false);}}
 return <section className="community-setup" aria-label="Assistente da comunidade"><h3 ref={heading} tabIndex={-1}>Prepare sua comunidade</h3><ol className="wizard-steps">{['Identidade','Canais','Acesso','Revisar'].map((label,i)=><li key={label} aria-current={step===i?'step':undefined}>{i+1}. {label}</li>)}</ol>
 {step===0&&<label>Nome da comunidade<input maxLength={80} required value={name} onChange={e=>setName(e.target.value)}/></label>}
 {step===1&&<><p>Os canais existentes serão preservados. Adicione até 10 de cada tipo, um por linha.</p><label>Novos canais de texto<textarea value={text} onChange={e=>setText(e.target.value)} maxLength={809} rows={3}/></label><label>Novas salas de voz<textarea value={voice} onChange={e=>setVoice(e.target.value)} maxLength={809} rows={3}/></label></>}
 {step===2&&<><label>Autorizar uma pessoa (opcional)<input ref={emailInput} type="email" maxLength={320} value={email} onChange={e=>setEmail(e.target.value)}/></label><p>Ela entrará como membro. Autorize outras pessoas em Acessos e rede e atribua cargos em Pessoas e permissões.</p><p>O proprietário é definido por Admin:Email no servidor. O convite não concede privilégios.</p></>}
 {step===3&&<><h4>Confira antes de aplicar</h4><p>Comunidade: <strong>{name}</strong></p><p>Adicionar canais de texto: {lines(text).join(', ')||'Nenhum'}</p><p>Adicionar salas de voz: {lines(voice).join(', ')||'Nenhuma'}</p><p>Autorizar: {email||'Ninguém nesta etapa'}</p><p>Você poderá ajustar o acesso depois. Canais existentes não serão removidos.</p></>}
 <div className="setup-actions"><button disabled={busy||step===0} onClick={()=>setStep(step-1)}>Voltar</button>{step<3?<button disabled={busy} onClick={next}>Continuar</button>:<button disabled={busy} onClick={()=>void save()}>{busy?'Salvando…':'Aplicar configuração'}</button>}</div><p role="alert">{error}</p></section>;
}
