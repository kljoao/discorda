import { build } from 'esbuild';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Production packages are bundled, not shipped as a second node_modules tree.
// Keep their license notices in the distribution independently of that tree.
const root = path.resolve('../..');
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
const notices = ['Discorda — third-party JavaScript license notices\n'];
for (const [relative, entry] of Object.entries(lock.packages)) {
  if (!relative.includes('node_modules/') || entry.dev || entry.link) continue;
  const directory = path.join(root, relative);
  const files = await readdir(directory);
  const licenses = files.filter(name => /^(licen[cs]e|copying|notice)([.-]|$)/i.test(name));
  notices.push(`\n=== ${relative} (${entry.version}) — ${entry.license ?? 'see notice'} ===\n`);
  for (const name of licenses) notices.push(await readFile(path.join(directory, name), 'utf8'));
}
await writeFile('resources/THIRD-PARTY-LICENSES.txt', notices.join('\n'));

await build({
  entryPoints: { 'main/index': 'src/main/index.ts', 'preload/index': 'src/preload/index.ts' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  define: { 'process.env.DISCORDA_OFFICIAL_RELEASE': JSON.stringify(process.env.DISCORDA_OFFICIAL_RELEASE === '1' ? '1' : '0') },
  plugins: [{
    name: 'bundle-signalr-node-transports',
    setup(bundler) {
      // SignalR intentionally hides these requires from webpack. Resolve the
      // literal imports at build time so the packaged app needs no node_modules.
      bundler.onLoad({filter: /[\\/]@microsoft[\\/]signalr[\\/]dist[\\/]cjs[\\/].*\.js$/}, async ({path: file}) => ({
        contents: (await readFile(file, 'utf8')).replace(/\brequireFunc\(("[^"]+")\)/g, 'require($1)'),
        loader: 'js',
      }));
    },
  }],
  outdir: 'dist',
  outExtension: { '.js': '.cjs' },
});
