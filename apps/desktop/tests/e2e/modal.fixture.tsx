import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Modal} from '../../src/renderer/components/ui/modal';
function Fixture(){
  const [open,setOpen]=useState(false);
  return <><button onClick={()=>setOpen(true)}>Compartilhar</button><button>Fora do diálogo</button>{open&&<Modal label="Compartilhar tela" className="capture-modal" onClose={()=>setOpen(false)}><button onClick={()=>setOpen(false)}>Cancelar</button><button>Selecionar monitor</button></Modal>}</>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
