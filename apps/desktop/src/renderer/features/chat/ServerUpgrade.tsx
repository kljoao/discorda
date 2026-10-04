import {useEffect,useState} from 'react';
import type {Report} from '../../../shared/operations';
export function ServerUpgrade({report}:{report:Report}){
 const [version,setVersion]=useState(''),[checked,setChecked]=useState('');
 useEffect(()=>{void window.discorda?.getAppInfo().then(info=>setVersion(info.version));},[]);
 const command='bash tools/vps.sh update';
 const compatible=report.versions?.protocol===1;
 return <section className="server-upgrade"><h4>Atualizar o servidor</h4><p>Este aplicativo: <strong>{version||'Consultando…'}</strong> · Servidor: <strong>{report.versions?.api??'Não informado'}</strong></p>
  {!compatible&&<p role="alert">O protocolo do servidor precisa ser conferido antes de continuar.</p>}
  {version&&report.versions?.api&&report.versions.api!==version&&<p role="status">As versões são diferentes. Isso não indica incompatibilidade por si só; atualize o servidor para disponibilizar as funções novas.</p>}
  <ol><li>Avise quem estiver em chamada: haverá uma breve interrupção.</li><li>Na VPS, entre na pasta do repositório e execute o comando abaixo. Ele busca a versão estável, faz backup, aplica migrações e verifica a saúde.</li><li>Depois, confira aqui a versão e os serviços.</li></ol>
  <label>Comando para executar por SSH<input readOnly value={command} onFocus={e=>e.currentTarget.select()}/></label><p>Se o comando ainda não existir no servidor, execute <code>git pull --ff-only</code> primeiro.</p>
  <button onClick={()=>{void window.discorda!.checkServices().then(s=>setChecked(s.api==='online'&&s.database==='ready'?'API e banco respondendo. Confira também voz e vídeo nos indicadores acima.':'A verificação ainda não passou. Consulte os logs do servidor.')).catch(()=>setChecked('Não foi possível verificar.'));}}>Verificar após atualização</button><p role="status">{checked}</p>
 </section>;
}
