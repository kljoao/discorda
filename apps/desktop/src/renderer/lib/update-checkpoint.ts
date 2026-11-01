const eventName='discorda:before-update';
type Detail={error?:string};

/** Save the live UI before the main process can close the renderer. */
export function beforeUpdate(save:()=>void) {
  const listener=(event:Event)=>{
    try{save();}catch(error){event.preventDefault();(event as CustomEvent<Detail>).detail.error=error instanceof Error?error.message:'Não foi possível salvar a conversa antes de atualizar.';}
  };
  window.addEventListener(eventName,listener);
  return()=>window.removeEventListener(eventName,listener);
}

export function prepareUpdate() {
  const event=new CustomEvent<Detail>(eventName,{cancelable:true,detail:{}});
  if(!window.dispatchEvent(event))throw Error(event.detail.error??'Conclua o envio pendente antes de atualizar.');
}
