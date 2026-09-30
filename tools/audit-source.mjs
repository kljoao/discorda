import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const files = execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const failures = [];
for (const file of new Set(files)) {
  if (/(?:^|\/)(?:\.discorda|artifacts|node_modules|bin|obj|release)\/|(?:^|\/)(?:lan|server)\.json$|\.pfx$|\.p12$|(?:^|\/)\.env$/.test(file)) {
    failures.push(`${file}: arquivo privado/gerado incluído no conjunto público`); continue;
  }
  if (!/\.(?:cs|csproj|json|ts|tsx|js|mjs|cjs|html|css|md|yml|yaml|ps1|txt)$/.test(file) || /(?:THIRD-PARTY|THIRD_PARTY|LICENSE|NOTICE)/i.test(file)) continue;
  const text = readFileSync(file,'utf8');
  const privateValue = /sb_secret_[A-Za-z0-9_-]{20,}|GOCSPX-[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----|[A-Za-z0-9._%+-]+@gmail\.com|C:[\\/]Users[\\/](?!<|YOUR_|SEU_)[A-Za-z0-9_-]+/i;
  const radmin = [...text.matchAll(/\b26\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g)].some(match => !/^26\.10\.10\.\d+$/.test(match[0]));
  if (privateValue.test(text) || radmin) failures.push(`${file}: possível credencial ou dado pessoal; revise localmente`);
}
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`Revisados ${files.length} arquivos públicos: nenhum padrão privado detectado. Revise também imagens e histórico antes de publicar.`);
