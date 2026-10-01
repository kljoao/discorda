import {it,expect} from 'vitest';
import {diagnosticReport} from '../../src/main/diagnostics';
it('exports only safe fields even if inputs carry private data',()=>{
 const health={api:'online' as const,database:'ready' as const,checkedAt:'2026-10-01',url:'https://private.example',token:'secret',email:'private@example.test'};
 const report=diagnosticReport('1.0.0','win32',health,{state:'connected',attempts:2},false,'idle');
 expect(Object.keys(report).sort()).toEqual(['version','platform','checkedAt','api','database','chat','attempts','lastConnected','callActive','update'].sort());
 expect(JSON.stringify(report)).not.toMatch(/private|secret/);
});
