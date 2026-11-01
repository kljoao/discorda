import {useId, useRef, useState} from 'react';
import {AppWindow, ArrowRight, AudioLines, Monitor, MonitorUp, SlidersHorizontal, X} from 'lucide-react';
import {Modal} from '../../components/ui/modal';
import {Select} from '../../components/ui/select';
import {screenProfiles, type ScreenIntent} from './screen-quality';
import type {CaptureSource} from '../../../shared/ipc/contracts';
import './capture-picker.css';

type Quality=keyof typeof screenProfiles|'auto';
export function CapturePicker({sources,loading=false,sourceError,onRetry,busy,replacing,quality,intent,fps,audioError,excludeBrowsers,onExcludeBrowsers,onQuality,onIntent,onFps,onClose,onShare}:{
  sources:CaptureSource[]; loading?:boolean; sourceError?:string; onRetry?:()=>void; busy:boolean; replacing:boolean; quality:Quality; intent:ScreenIntent; fps:30|60;
  audioError:string; excludeBrowsers:boolean; onExcludeBrowsers:(value:boolean)=>void;
  onQuality:(value:Quality)=>void; onIntent:(value:ScreenIntent)=>void; onFps:(value:30|60)=>void;
  onClose:()=>void; onShare:(source:CaptureSource)=>void;
}) {
  const id=useId(), tabs=useRef<HTMLDivElement>(null);
  const [tab,setTab]=useState<'window'|'screen'>('window'), [selected,setSelected]=useState<CaptureSource>();
  const visible=sources.filter(source=>source.id.startsWith(tab+':'));
  function changeTab(next:'window'|'screen'){setTab(next);setSelected(undefined);}
  return <Modal className="capture-modal" label="Compartilhar tela" onClose={onClose}>
    <section className="capture-picker">
      <header className="capture-title"><div className="capture-heading"><span className="capture-heading-icon"><MonitorUp size={22}/></span><div><h2>{replacing?'Trocar tela ou janela':'Compartilhar tela'}</h2><p>{replacing?'Sua transmissão continua até você confirmar a troca.':'Escolha o que você quer mostrar para a chamada.'}</p></div></div><button type="button" className="capture-close" aria-label="Cancelar compartilhamento" disabled={busy} onClick={onClose}><X size={20}/></button></header>
      <div className="capture-body">
        <div className="capture-tabs" role="tablist" aria-label="Fonte do compartilhamento" ref={tabs} onKeyDown={event=>{
          if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
          event.preventDefault();const next=event.key==='Home'?'window':event.key==='End'?'screen':tab==='window'?'screen':'window';
          changeTab(next);tabs.current?.querySelector<HTMLButtonElement>('[id="'+id+'-'+next+'"]')?.focus();
        }}>
          {(['window','screen'] as const).map(kind=><button key={kind} type="button" role="tab" id={id+'-'+kind} aria-controls={id+'-panel'} aria-selected={tab===kind} tabIndex={tab===kind?0:-1} disabled={busy} data-autofocus={kind==='window'?true:undefined} onClick={()=>changeTab(kind)}>{kind==='window'?<AppWindow size={17}/>:<Monitor size={17}/>}<span>{kind==='window'?'Aplicativos':'Tela Inteira'}</span><small>{sources.filter(source=>source.id.startsWith(kind+':')).length}</small></button>)}
        </div>
        <div className="capture-source-panel" role="tabpanel" id={id+'-panel'} aria-labelledby={id+'-'+tab} tabIndex={0}>
          <p className="capture-source-hint">{tab==='window'?'Compartilhe apenas a janela de um aplicativo.':'Tudo o que estiver no monitor selecionado ficará visível.'}</p>
          <div className="capture-grid">{visible.map(source=><button type="button" disabled={busy} key={source.id} aria-pressed={selected?.id===source.id} onClick={()=>setSelected(source)}><div className="capture-preview"><img src={source.thumbnail} alt=""/><span className="capture-selection" aria-hidden="true"/></div><span className="capture-source-name" title={source.name}>{tab==='window'?<AppWindow size={16}/>:<Monitor size={16}/>}<span>{source.name}</span></span></button>)}</div>
          {loading&&<div className="capture-loading" role="status"><span/>Buscando aplicativos e monitores…</div>}
          {sourceError&&<div className="capture-empty" role="alert"><strong>{sourceError}</strong><button type="button" onClick={onRetry}>Tentar novamente</button></div>}
          {!loading&&!sourceError&&!visible.length&&<div className="capture-empty">{tab==='window'?<AppWindow size={30}/>:<Monitor size={30}/>}<strong>{tab==='window'?'Nenhum aplicativo disponível':'Nenhum monitor disponível'}</strong><p>{tab==='window'?'Abra a janela que deseja compartilhar e reabra este menu, ou escolha Tela Inteira.':'Verifique seus monitores e reabra este menu.'}</p></div>}
        </div>
        <section className="capture-quality" aria-label="Qualidade da transmissão"><div className="capture-section-heading"><SlidersHorizontal size={16}/><h3>Qualidade da transmissão</h3>{replacing&&<small>Mantida durante a troca</small>}</div>
          <fieldset className="capture-options" disabled={busy||replacing} aria-label="Configurações de qualidade">
            <Select label="Conteúdo" value={intent} onChange={onIntent} disabled={busy||replacing} options={[
              {value:'auto',label:'Automático',description:'Equilíbrio para o dia a dia'},
              {value:'games',label:'Jogos',description:'Prioriza movimentos suaves'},
              {value:'movies',label:'Filmes e vídeos',description:'Reprodução a 30 fps'},
              {value:'text',label:'Texto e trabalho',description:'Prioriza a leitura e os detalhes'},
            ]}/>
            <Select label="Resolução" value={quality} onChange={onQuality} disabled={busy||replacing} options={[
              {value:'auto',label:'Automática',description:'Adapta à rede · até 1080p'},
              {value:'720',label:'720p',description:'Menor uso de banda'},
              {value:'1080',label:'1080p',description:'Full HD'},
              {value:'1440',label:'1440p',description:'Mais detalhes · QHD'},
              {value:'2160',label:'4K',description:'Máxima resolução · UHD'},
            ]}/>
            <Select label="Fluidez" value={String(fps)} onChange={value=>onFps(Number(value) as 30|60)} disabled={busy||replacing} options={[
              {value:'60',label:'60 fps',description:'Movimentos mais suaves'},
              {value:'30',label:'30 fps',description:'Menor uso de banda'},
            ]}/>
          </fieldset>
          <p className="capture-quality-hint">A resolução e os FPS escolhidos são limites. A qualidade exibida depende da conexão e da tela compartilhada.</p>
        </section>
        <div className="capture-audio"><AudioLines size={18}/><div><strong>{audioError?'Som indisponível neste dispositivo':replacing?'Áudio mantido durante a troca':'Som incluído automaticamente'}</strong><p>Áudio dos aplicativos, com Discord e Discorda excluídos.</p></div></div>
        {audioError&&<p className="voice-error" role="status">{audioError}</p>}
        <label className="capture-browser-option"><input type="checkbox" disabled={busy||replacing} checked={excludeBrowsers} onChange={event=>onExcludeBrowsers(event.target.checked)}/>Excluir também o áudio dos navegadores<span>Para quem usa Discord web</span></label>
      </div>
      <footer className="capture-footer"><span aria-live="polite">{busy?'Preparando transmissão…':selected?selected.name:'Selecione um aplicativo ou monitor para continuar'}</span><div><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button type="button" className="capture-submit" disabled={busy||!selected} onClick={()=>{if(selected)onShare(selected);}}>{busy?'Preparando…':replacing?'Confirmar troca':'Compartilhar'}<ArrowRight size={16}/></button></div></footer>
    </section>
  </Modal>;
}
