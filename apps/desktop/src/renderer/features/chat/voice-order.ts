const collator=new Intl.Collator('pt-BR',{sensitivity:'base',numeric:true});
export function comparePeople(nameA:string,idA:string,nameB:string,idB:string){return collator.compare(nameA,nameB)||idA.localeCompare(idB);}
