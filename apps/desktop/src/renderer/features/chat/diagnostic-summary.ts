import type {DiagnosticReport} from '../../../shared/ipc/contracts';
/** Fixed fields, no serialized state or arbitrary server errors in shared messages. */
export function diagnosticSummary(r:DiagnosticReport){
 const safeVersion=/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(r.version)?r.version:'não informada';
 return ['Diagnóstico Discorda · '+safeVersion,
  'Sistema: '+(['win32','linux','darwin'].includes(r.platform)?r.platform:'outro'),
  'API: '+(r.api==='online'?'conectada':'indisponível'),
  'Banco: '+(r.database==='ready'?'disponível':'indisponível'),
  'Chat: '+(r.chat==='connected'?'conectado':r.chat==='reconnecting'?'reconectando':'offline'),
  'Chamada: '+(r.callActive?'ativa':'inativa'),
  'Sem mensagens, nomes, IPs, e-mails ou credenciais.'].join('\n');
}
