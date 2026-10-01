import type {DiagnosticReport,ServiceStatus,UpdateState} from '../shared/ipc/contracts';
export function diagnosticReport(version:string,platform:string,health:ServiceStatus,live:{state:DiagnosticReport['chat'];attempts:number;lastConnected?:string},callActive:boolean,update:UpdateState['status']):DiagnosticReport {
 return {version,platform,checkedAt:health.checkedAt,api:health.api,database:health.database,chat:live.state,attempts:live.attempts,lastConnected:live.lastConnected,callActive,update};
}
