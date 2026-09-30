import assert from 'node:assert/strict';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { listPackage, extractFile } from '@electron/asar';
const directory = path.resolve(process.argv[2] ?? 'release/win-unpacked');
const archive = path.join(directory, 'resources/app.asar');
const entries = listPackage(archive);
assert(!entries.some(file => /[\\/]node_modules[\\/]/.test(file)), 'Dependencies must be bundled, not duplicated');
const main = extractFile(archive, path.join('dist', 'main', 'index.cjs')).toString();
assert(!/requireFunc\(["']/.test(main), 'SignalR transport requires must be resolved by the bundler');
assert(entries.some(file => file.endsWith('THIRD-PARTY-LICENSES.txt')), 'Bundled libraries need license notices');
assert(!entries.some(file=>/lan\.json|server\.json|\.env$|\.pfx$|\.pdb$/i.test(file)), 'Private connection files must not be published');
for(const file of entries.filter(file=>/\.(cjs|js|json|html|css)$/i.test(file))){
  const text=extractFile(archive,file.replace(/^[\\/]/,'')).toString();
  assert(!/sb_secret_[A-Za-z0-9_-]{20,}|GOCSPX-[A-Za-z0-9_-]{20,}|BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY|26\.\d{1,3}\.\d{1,3}\.\d{1,3}/i.test(text), 'Private information found in application payload');
  // Library copyright contacts are public license notices, not member accounts.
  const withoutLicenseNotices=text.replace(/\/\*![\s\S]*?\*\//g,'');
  assert(!/[A-Za-z0-9._%+-]+@gmail\.com/i.test(withoutLicenseNotices), 'Member email found in application payload');
}
async function size(directory) {
  let bytes = 0;
  for (const entry of await readdir(directory, {withFileTypes:true})) {
    const file = path.join(directory, entry.name);
    bytes += entry.isDirectory() ? await size(file) : (await stat(file)).size;
  }
  return bytes;
}
const bytes = await size(directory);
assert(bytes < 420 * 1024 ** 2, 'Installed package exceeds the 420 MiB budget');
console.log(`Package verified: ${(bytes / 1024 ** 2).toFixed(1)} MiB installed; no duplicated dependencies.`);
