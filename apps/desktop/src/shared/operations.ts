export type Report={versions?:{api:string;runtime:string;database:string|null;protocol:number};checkedAt:string;api:string;database:string;media:string;activeCalls:number;process:{memoryBytes:number;cpuAveragePercent:number;uptimeSeconds:number};storage:{databaseBytes:number|null;freeBytes:number|null;totalBytes:number|null};backup:{ok:boolean;lastRun:string|null;lastVerified:string|null}|null};
const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const version=(v:unknown)=>typeof v==='string'&&/^\d+(?:\.\d+){1,3}$/.test(v)?v:null;
const date=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
/** Rebuild every field: never spread a server object into a diagnostic export. */
export function publicOperations(report:Report){return {
 checkedAt:date(report.checkedAt),api:report.api==='online',database:report.database==='ready',media:report.media==='online',activeCalls:number(report.activeCalls),
 versions:{api:version(report.versions?.api),runtime:version(report.versions?.runtime),database:version(report.versions?.database),protocol:number(report.versions?.protocol)},
 process:{memoryBytes:number(report.process.memoryBytes),cpuAveragePercent:number(report.process.cpuAveragePercent),uptimeSeconds:number(report.process.uptimeSeconds)},
 storage:{databaseBytes:number(report.storage.databaseBytes),freeBytes:number(report.storage.freeBytes),totalBytes:number(report.storage.totalBytes)},
 backup:report.backup?{ok:report.backup.ok===true,lastRun:date(report.backup.lastRun),lastVerified:date(report.backup.lastVerified)}:null,
};}
